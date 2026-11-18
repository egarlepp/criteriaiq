// @vitest-environment node
//
// Task #676: post-install Reconfigure → Test Connection used to dead-end
// with "Connection failed — Network error" because the wizard's mutating
// routes (including /api/setup/test-connection) were mounted only in the
// no-admin bootstrap branch. Once an admin existed the route was
// unmounted entirely, the SPA catch-all returned an HTML 404, and the
// client's `await res.json()` threw on the HTML, falling through to the
// `setup.connect.networkError` localized string.
//
// The fix re-exports the same handler via `registerSetupTestConnectionRoute`,
// mounted post-install with `requireAdmin: true` next to the gated
// `/api/setup/restart` registration. This file pins the regression so a
// future "tighten the setup-routes gating" change can't silently break the
// Reconfigure flow again.
//
// What's covered:
//   1. No session → 401 { errorCode: 'unauthenticated' }
//   2. Non-Admin session → 403 { errorCode: 'forbidden' }
//   3. Admin session + valid URL → 200 { success: true, latencyMs: <number> }
//   4. Admin session + broken URL → 200 { success: false, errorCode: 'connectFailed' }
//
// What's NOT covered (out of scope for #676):
//   - Re-enabling the persistence-side wizard endpoints (save-config,
//     initialize, complete, create-admin) post-install. Those mutate live
//     state and need their own design.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

const mockConnect = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

// Match the FakePool shape the existing test-connection-* tests use so
// the driver-selection logic isn't re-tested here (that's
// server/lib/__tests__/db-driver.test.ts's job).
vi.mock("../lib/db-driver", async () => {
  const actual = await vi.importActual<typeof import("../lib/db-driver")>(
    "../lib/db-driver",
  );
  class FakePool {
    connect = mockConnect;
    end = mockEnd;
    on = vi.fn();
    query = vi.fn();
    constructor(_opts?: unknown) {}
  }
  return {
    ...actual,
    createPool: vi.fn(() => new FakePool()),
  };
});

const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

interface FakeUser {
  id: string;
  email: string;
  role: string;
}

// Build a minimal Express app that mounts a stub session middleware
// (mirrors the pattern used by `server/__tests__/admin-password-routes.test.ts`)
// followed by the gated test-connection route. Tests mutate `currentUser`
// to swap "no session", "Editor session", and "Admin session" between
// individual `it` blocks.
async function buildApp(currentUser: { value: FakeUser | null }) {
  const { registerSetupTestConnectionRoute } = await import("../routes/setup-routes");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { session?: { user?: FakeUser } }).session = currentUser.value
      ? { user: currentUser.value }
      : {};
    next();
  });
  registerSetupTestConnectionRoute(app, { requireAdmin: true });
  return app;
}

interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

async function listen(app: express.Express): Promise<RunningServer> {
  return new Promise((resolve) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe("POST /api/setup/test-connection — admin gate (post-install Reconfigure flow, Task #676)", () => {
  let server: RunningServer;
  let currentUser: { value: FakeUser | null };

  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    // Default: pretend SELECT 1 succeeds — individual failure-path tests
    // override this to simulate an unreachable / auth-failed URL.
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });
    currentUser = { value: null };
    const app = await buildApp(currentUser);
    server = await listen(app);
  });

  afterEach(async () => {
    await server.close();
    if (ORIGINAL_DATABASE_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    }
  });

  it("returns 401 unauthenticated when no session is present (signed-out caller)", async () => {
    currentUser.value = null;
    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Authentication required",
      errorCode: "unauthenticated",
    });
    // The handler must short-circuit BEFORE opening any pool.
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("returns 403 forbidden when the session belongs to a non-Admin role", async () => {
    currentUser.value = { id: "u1", email: "editor@example.com", role: "Editor" };
    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: "Admin role required",
      errorCode: "forbidden",
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("returns 200 success with latency when an Admin posts a valid URL", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionUrl: "postgres://app:hunter2@db.example.com:5432/prod",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.latencyMs).toBe("number");
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.tipKey).toBeNull();
    // The handler MUST have actually opened a pool — the gate did not
    // accidentally short-circuit the read-only probe.
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with success=false and a connectFailed errorCode when an Admin posts a broken URL", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    mockConnect.mockReset();
    mockConnect.mockRejectedValueOnce(
      new Error('password authentication failed for user "app"'),
    );
    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connectionUrl: "postgres://app:wrong@db.example.com:5432/prod",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("connectFailed");
    expect(body.error).toContain("password authentication failed");
    // The wizard surfaces the raw driver message as the `detail`
    // interpolation parameter of the localized "Connection failed" copy.
    expect(body.errorParams?.detail).toContain("password authentication failed");
  });

  it("rejects 400 connectionUrlRequired when an Admin posts an empty body", async () => {
    currentUser.value = { id: "u1", email: "admin@example.com", role: "Admin" };
    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({
      success: false,
      errorCode: "connectionUrlRequired",
    });
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // Static mount-regression pin (architect comment on Task #676 review):
  // The handler-level tests above prove the admin gate behaves correctly,
  // but they don't pin the *wiring* — a future refactor could drop the
  // post-install registration line from server/index.ts and the user-facing
  // "Network error" bug would silently come back. This test reads the boot
  // file and asserts the import + admin-gated mount call both still live
  // inside the `if (!_setupNeedsBootstrap) { ... }` block. It's a cheap
  // structural check that doesn't require booting the full server but
  // catches the exact regression the architect flagged.
  it("server/index.ts post-install branch wires the admin-gated test-connection route", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const indexPath = path.resolve(__dirname, "../index.ts");
    const indexSrc = await fs.readFile(indexPath, "utf8");

    // The post-install branch is `if (!_setupNeedsBootstrap) { ... }`.
    // Find that block and assert the gated mount call is inside it.
    const branchMatch = indexSrc.match(
      /if\s*\(\s*!_setupNeedsBootstrap\s*\)\s*\{([\s\S]*?)\n\s{0,4}\}/,
    );
    expect(
      branchMatch,
      "could not locate the `if (!_setupNeedsBootstrap)` post-install branch in server/index.ts",
    ).not.toBeNull();
    const branchBody = branchMatch![1];

    expect(
      branchBody,
      "post-install branch must import registerSetupTestConnectionRoute",
    ).toMatch(/registerSetupTestConnectionRoute/);

    expect(
      branchBody,
      "post-install branch must mount the test-connection route with requireAdmin: true (Task #676)",
    ).toMatch(
      /registerSetupTestConnectionRoute\s*\(\s*app\s*,\s*\{\s*requireAdmin:\s*true\s*\}\s*\)/,
    );
  });
});
