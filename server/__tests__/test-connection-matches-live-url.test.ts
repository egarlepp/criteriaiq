// @vitest-environment node
//
// Task #451: /api/setup/test-connection must report whether the URL the
// operator just tested is byte-for-byte identical to the host process's
// currently-resolved DATABASE_URL (the live URL the background probe is
// failing against). The Database step uses this boolean to swap a
// reassuring "Continue is enabled" note for a sharper "this URL is the
// one already failing — fix it first" warning.
//
// Critical contract guarded by this file:
//   * Only a boolean flag is returned.
//   * The live URL itself (and especially its password) is NEVER echoed.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const TEST_SETUP_TOKEN = "test-setup-token-0123456789";
process.env.SETUP_TOKEN = TEST_SETUP_TOKEN;
import express from "express";
import type { Server } from "http";
import { AddressInfo } from "net";

const mockConnect = vi.fn();
const mockEnd = vi.fn().mockResolvedValue(undefined);

// Task #479: the route now goes through `server/lib/db-driver.ts`'s
// `createPool` helper instead of importing `@neondatabase/serverless`
// directly, so the mock has to follow the same boundary. This mock
// returns the same FakePool shape for every URL — the driver-selection
// logic itself is exercised by `server/lib/__tests__/db-driver.test.ts`,
// not here.
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

// We drive `resolveConnectionUrl()` by mutating `process.env.DATABASE_URL`.
// Mocking the module itself caused `actual.resolveConnectionUrl()` (called
// at db.ts import time before any test runs) to return `{ url: null }`,
// which crashed db.ts. Mutating the env var keeps both code paths happy:
// db.ts sees the real URL at import, and each test gets to set whatever
// live URL it needs.
const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;

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

describe("POST /api/setup/test-connection — matchesLiveUrl", () => {
  let server: RunningServer;

  beforeEach(async () => {
    mockConnect.mockReset();
    mockEnd.mockClear();
    // Default: pretend the host has a successful SELECT 1 path. Individual
    // tests that need a failing typed-URL path will override this.
    mockConnect.mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
      release: vi.fn(),
    });
    const app = await buildApp();
    server = await listen(app);
  });

  afterEach(async () => {
    await server.close();
    // Restore the original DATABASE_URL so other test files (and the
    // module-level db.ts that already cached the original at import) see
    // an unchanged process environment.
    if (ORIGINAL_DATABASE_URL === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    }
  });

  it("returns matchesLiveUrl=true when the typed URL is identical to the live one", async () => {
    const url = "postgres://app:hunter2@db.example.com:5432/prod";
    process.env.DATABASE_URL = url;

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: url }),
    });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.matchesLiveUrl).toBe(true);
  });

  it("returns matchesLiveUrl=false when even one character differs (password edited)", async () => {
    const live = "postgres://app:hunter2@db.example.com:5432/prod";
    const typed = "postgres://app:hunter3@db.example.com:5432/prod";
    process.env.DATABASE_URL = live;

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: typed }),
    });
    const body = await res.json();
    expect(body.matchesLiveUrl).toBe(false);
  });

  it("ignores surrounding whitespace on the live URL when comparing", async () => {
    const url = "postgres://app:hunter2@db.example.com:5432/prod";
    process.env.DATABASE_URL = `  ${url}\n`;

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: url }),
    });
    const body = await res.json();
    expect(body.matchesLiveUrl).toBe(true);
  });

  it("returns matchesLiveUrl=false when there is no live URL at all", async () => {
    delete process.env.DATABASE_URL;

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({
        connectionUrl: "postgres://u:p@h:5432/d",
      }),
    });
    const body = await res.json();
    // No live URL means there is nothing to be "the same as", so the
    // wizard should fall back to the original "Continue is enabled" note.
    expect(body.matchesLiveUrl).toBe(false);
  });

  it("still reports matchesLiveUrl on a FAILED test (typed URL also rejected)", async () => {
    // The wizard only consumes matchesLiveUrl when the typed URL passes
    // Test Connection (success branch), but the contract is the same on
    // failure: the server returns the boolean either way and the client
    // is responsible for when to surface it.
    const url = "postgres://app:wrong@db.example.com:5432/prod";
    process.env.DATABASE_URL = url;
    mockConnect.mockReset();
    mockConnect.mockRejectedValueOnce(
      new Error('password authentication failed for user "app"'),
    );

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({ connectionUrl: url }),
    });
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.matchesLiveUrl).toBe(true);
  });

  it("never echoes the live URL or its password in the response payload", async () => {
    // The whole point of the boolean is that the client never sees the
    // live URL. This regression guard fails loudly if a future change
    // ever leaks it back through the JSON response.
    const live =
      "postgres://leaked_user:super_secret_pw@hidden.example.com:5432/secret_db";
    process.env.DATABASE_URL = live;

    const res = await fetch(`${server.url}/api/setup/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
      body: JSON.stringify({
        connectionUrl: "postgres://different:other@elsewhere:5432/db",
      }),
    });
    const raw = await res.text();
    expect(raw).not.toContain("super_secret_pw");
    expect(raw).not.toContain("leaked_user");
    expect(raw).not.toContain("hidden.example.com");
    expect(raw).not.toContain("secret_db");
    const body = JSON.parse(raw);
    expect(body.matchesLiveUrl).toBe(false);
  });
});
