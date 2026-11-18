// @vitest-environment node
//
// The default vitest environment for this project is happy-dom (so component
// tests can mount React trees), but happy-dom's fetch enforces a same-origin
// policy that blocks our test-only http://127.0.0.1 listener with
// "Cross-Origin Request Blocked". Switching this file to the node
// environment uses Node's real undici fetch, which has no such policy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const TEST_SETUP_TOKEN = "test-setup-token-0123456789";
process.env.SETUP_TOKEN = TEST_SETUP_TOKEN;
import express from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

// Task #479: the route now goes through `server/lib/db-driver.ts`'s
// `createPool` helper instead of importing `@neondatabase/serverless`
// directly, so the mock has to follow the same boundary. The mock's
// connect() implementation is reassigned per-test to simulate either
// a successful `SELECT 1` or a libpq-style failure with a specific
// error message — that way each test exercises a different branch of
// the tipKey wiring.
const mockConnect = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

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

// We import the route registration AFTER the mocks are in place so the
// dynamic imports inside the handler resolve to the mocked modules.
async function buildApp() {
  const { registerSetupRoutes } = await import("../routes/setup-routes");
  const app = express();
  app.use(express.json());
  registerSetupRoutes(app);
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

describe("POST /api/setup/test-connection — tipKey", () => {
  let server: RunningServer;

  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    const app = await buildApp();
    server = await listen(app);
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns tipKey=null and no errorCode on a successful test", async () => {
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: "postgres://u:p@h:5432/d" }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    // tipKey is part of the stable response contract on success too — present
    // and explicitly null rather than omitted, so the client can type-check
    // it without an undefined branch.
    expect(body.tipKey).toBeNull();
    expect(body.errorCode).toBeUndefined();
  });

  it("classifies an SSL-required failure into tipKey=sslRequired", async () => {
    mockConnect.mockRejectedValue(
      new Error(
        'no pg_hba.conf entry for host "1.2.3.4", user "app", database "db", SSL off',
      ),
    );

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: "postgres://u:p@h:5432/d" }),
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("connectFailed");
    expect(body.tipKey).toBe("sslRequired");
    // The localized "connection failed" string interpolates the raw libpq
    // text via `detail`, so the same payload must still be present.
    expect(body.errorParams?.detail).toContain("pg_hba.conf");
  });

  it("classifies an ETIMEDOUT failure into tipKey=connectionTimeout", async () => {
    mockConnect.mockRejectedValue(
      new Error("connect ETIMEDOUT 10.0.0.5:5432"),
    );

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: "postgres://u:p@h:5432/d" }),
    });
    const body = await res.json();
    expect(body.tipKey).toBe("connectionTimeout");
  });

  it("returns tipKey=null when the failure cannot be classified", async () => {
    mockConnect.mockRejectedValue(new Error("something totally unexpected"));

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: "postgres://u:p@h:5432/d" }),
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe("connectFailed");
    // `null` (not undefined) — present and explicit so the client knows the
    // server tried to classify and could not.
    expect(body.tipKey).toBeNull();
  });
});
