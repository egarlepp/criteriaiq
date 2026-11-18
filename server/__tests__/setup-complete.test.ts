// @vitest-environment node
//
// Coverage for the new POST /api/setup/complete endpoint and the
// `setupCompletedAt` field on /api/setup/status (task-378).
//
// Both are wired through `server/lib/app-state.ts`, which we mock here
// so the test exercises route behaviour without needing a live Postgres
// connection. This mirrors how `server/__tests__/system-routes.test.ts`
// mocks `getBootstrapSnapshot` to avoid real config-file reads.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const TEST_SETUP_TOKEN = "test-setup-token-0123456789";
process.env.SETUP_TOKEN = TEST_SETUP_TOKEN;
import express, { type Express } from "express";
import type { Server } from "http";

const getSetupCompletedAtMock = vi.fn();
const markSetupCompletedMock = vi.fn();

vi.mock("../lib/app-state", () => ({
  getSetupCompletedAt: () => getSetupCompletedAtMock(),
  markSetupCompleted: () => markSetupCompletedMock(),
}));

// /api/setup/status reads the on-disk migration-failure marker (Task #394).
// Stubbed here so this suite stays a pure HTTP test without touching disk.
const readMigrationFailureMarkerMock = vi.fn(() => null);
vi.mock("../lib/migration-failure-marker", () => ({
  readMigrationFailureMarker: () => readMigrationFailureMarkerMock(),
}));

// Stub the heavy admin-bootstrap + bootstrap-config dependencies so we
// can mount the real registerSetupRoutes without spinning up a DB.
vi.mock("../db-bootstrap", () => ({
  writeBootstrapConfig: vi.fn(),
  bootstrapConfigExists: () => false,
  readBootstrapConfig: () => null,
  resolveConnectionUrl: () => ({ url: null, source: "none" as const }),
}));

// `setup-routes.ts` now imports `./db` to back the public
// `/api/setup/migrations-summary` endpoint added in task #399.
// `dbState` is mutated per-test so individual cases can flip between
// "db configured" and "db missing" without redefining the mock.
const dbState: { ready: boolean; pool: unknown } = { ready: false, pool: null };
vi.mock("../db", () => ({
  get pool() {
    return dbState.pool;
  },
  get dbReady() {
    return dbState.ready;
  },
}));

// `getSchemaMigrationsSummary` and `listKnownMigrationFiles` back the
// new public migrations endpoint. Both are mocked so this suite stays
// a pure HTTP test without touching disk or Postgres.
const summaryMock = vi.fn();
const listKnownMock = vi.fn(() => [] as string[]);
vi.mock("../lib/migrations-runner", () => ({
  getSchemaMigrationsSummary: (...args: unknown[]) => summaryMock(...args),
  listKnownMigrationFiles: () => listKnownMock(),
}));

vi.mock("../lib/app-config", () => ({
  getBootstrapSnapshot: () => ({}),
  getPublicAppUrl: () => "",
  setPublicAppUrl: vi.fn(),
  generateSessionSecret: () => "x".repeat(96),
  generateEncryptionKey: () => "y".repeat(64),
  setSessionSecret: vi.fn(),
  setEncryptionKey: vi.fn(),
}));

vi.mock("../auth/admin-bootstrap", () => ({
  hasApprovedAdmin: async () => ({ state: "no-admin" }),
  validateAdminInput: () => ({ ok: true }),
  createBootstrapAdmin: vi.fn(),
  buildSetupAdminDb: vi.fn(),
}));

import { registerSetupRoutes } from "../routes/setup-routes";

let server: Server | null = null;
let baseUrl = "";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerSetupRoutes(app);
  return app;
}

beforeEach(async () => {
  getSetupCompletedAtMock.mockReset();
  markSetupCompletedMock.mockReset();
  readMigrationFailureMarkerMock.mockReset();
  readMigrationFailureMarkerMock.mockReturnValue(null);
  summaryMock.mockReset();
  listKnownMock.mockReset();
  listKnownMock.mockReturnValue([]);
  dbState.ready = false;
  dbState.pool = null;
  const app = buildApp();
  await new Promise<void>((resolve) => {
    const httpServer = app.listen(0, "127.0.0.1", () => {
      server = httpServer;
      const addr = httpServer.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { headers: { "X-Setup-Token": TEST_SETUP_TOKEN } });
  return { status: res.status, body: await res.json() } as const;
}

async function post(path: string, body: unknown = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() } as const;
}

describe("/api/setup/status setupCompletedAt field", () => {
  it("returns null when the marker has never been set", async () => {
    getSetupCompletedAtMock.mockResolvedValueOnce(null);
    const res = await get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("setupCompletedAt", null);
  });

  it("returns the persisted ISO timestamp when set", async () => {
    const ts = "2026-04-26T12:34:56.000Z";
    getSetupCompletedAtMock.mockResolvedValueOnce(ts);
    const res = await get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body.setupCompletedAt).toBe(ts);
  });
});

describe("/api/setup/status lastMigrationFailure field (Task #394)", () => {
  it("returns null when no marker file is present", async () => {
    getSetupCompletedAtMock.mockResolvedValueOnce(null);
    readMigrationFailureMarkerMock.mockReturnValueOnce(null);
    const res = await get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("lastMigrationFailure", null);
  });

  it("surfaces the persisted marker so the wizard can render the failing check", async () => {
    getSetupCompletedAtMock.mockResolvedValueOnce(null);
    const marker = {
      filename: "023_add_foo_index.sql",
      sqlState: "42703",
      error: 'column "foo" does not exist',
      failedAt: "2026-04-26T12:00:00.000Z",
    };
    readMigrationFailureMarkerMock.mockReturnValueOnce(marker);
    const res = await get("/api/setup/status");
    expect(res.status).toBe(200);
    expect(res.body.lastMigrationFailure).toEqual(marker);
  });
});

describe("POST /api/setup/complete", () => {
  it("returns 200 with the persisted timestamp on first acknowledgement", async () => {
    const ts = "2026-04-26T12:34:56.000Z";
    markSetupCompletedMock.mockResolvedValueOnce(ts);
    const res = await post("/api/setup/complete");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, setupCompletedAt: ts });
    expect(markSetupCompletedMock).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — repeat POSTs return the same original timestamp", async () => {
    // Server-side idempotency lives in `markSetupCompleted` (COALESCE in
    // the SQL UPSERT), so on the wire repeat calls just return the
    // already-set value. We mirror that here.
    const ts = "2026-04-26T00:00:00.000Z";
    markSetupCompletedMock.mockResolvedValue(ts);
    const a = await post("/api/setup/complete");
    const b = await post("/api/setup/complete");
    const c = await post("/api/setup/complete");
    expect(a.body.setupCompletedAt).toBe(ts);
    expect(b.body.setupCompletedAt).toBe(ts);
    expect(c.body.setupCompletedAt).toBe(ts);
    expect(markSetupCompletedMock).toHaveBeenCalledTimes(3);
  });

  it("returns 503 when the database is not yet bound", async () => {
    // markSetupCompleted returns null when dbReady is false — the route
    // surfaces that as a 503 so the client can surface a useful error
    // instead of treating null as success.
    markSetupCompletedMock.mockResolvedValueOnce(null);
    const res = await post("/api/setup/complete");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({
      success: false,
      errorCode: "dbNotInitialized",
    });
  });

  it("returns 500 when the marker write throws unexpectedly", async () => {
    markSetupCompletedMock.mockRejectedValueOnce(new Error("boom"));
    const res = await post("/api/setup/complete");
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      errorCode: "internalError",
    });
  });
});

describe("GET /api/setup/migrations-summary (Task #399)", () => {
  it("returns disk-only summary in setup-only mode (db not yet bound)", async () => {
    // Setup-only mode: dbReady=false, pool=null. Endpoint must still
    // answer with anyPendingOnDisk derived from the on-disk listing
    // so the operator can tell "shipped image carries N pending
    // migration files" before any DB exists.
    dbState.ready = false;
    dbState.pool = null;
    listKnownMock.mockReturnValueOnce(["001_first.sql", "002_second.sql"]);

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      appliedCount: 0,
      latestAppliedAt: null,
      anyPendingOnDisk: true,
    });
    // Crucially the DB-backed helper must NOT be invoked when the
    // pool is null — otherwise we'd dereference null inside the
    // pg driver.
    expect(summaryMock).not.toHaveBeenCalled();
  });

  it("returns anyPendingOnDisk=false in setup-only mode when no migration files ship", async () => {
    dbState.ready = false;
    dbState.pool = null;
    listKnownMock.mockReturnValueOnce([]);

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      appliedCount: 0,
      latestAppliedAt: null,
      anyPendingOnDisk: false,
    });
  });

  it("returns the populated summary when the DB is bound and migrations have been applied", async () => {
    dbState.ready = true;
    dbState.pool = { fake: "pool" };
    summaryMock.mockResolvedValueOnce({
      appliedCount: 12,
      latestAppliedAt: "2026-04-26T12:34:56.000Z",
      anyPendingOnDisk: false,
    });

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      appliedCount: 12,
      latestAppliedAt: "2026-04-26T12:34:56.000Z",
      anyPendingOnDisk: false,
    });
    expect(summaryMock).toHaveBeenCalledTimes(1);
    expect(summaryMock).toHaveBeenCalledWith({ fake: "pool" });
  });

  it("surfaces anyPendingOnDisk=true so the health-check view can fail the row", async () => {
    dbState.ready = true;
    dbState.pool = {};
    summaryMock.mockResolvedValueOnce({
      appliedCount: 11,
      latestAppliedAt: "2026-04-26T12:00:00.000Z",
      anyPendingOnDisk: true,
    });

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(200);
    expect(res.body.anyPendingOnDisk).toBe(true);
    expect(res.body.appliedCount).toBe(11);
  });

  it("never serializes filenames or checksums on the response shape", async () => {
    // Defence-in-depth: even if a future refactor accidentally
    // forwards extra fields from `getSchemaMigrationsReport`, the
    // public endpoint must keep the surface area to counts +
    // timestamp + boolean.
    dbState.ready = true;
    dbState.pool = {};
    summaryMock.mockResolvedValueOnce({
      appliedCount: 1,
      latestAppliedAt: "2026-04-26T12:00:00.000Z",
      anyPendingOnDisk: false,
    });

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/\.sql/i);
    expect(serialized).not.toMatch(/checksum/i);
    expect(serialized).not.toMatch(/sqlState/i);
    expect(Object.keys(res.body).sort()).toEqual([
      "anyPendingOnDisk",
      "appliedCount",
      "latestAppliedAt",
    ]);
  });

  it("returns 500 with errorCode internal_error when the helper throws", async () => {
    dbState.ready = true;
    dbState.pool = {};
    summaryMock.mockRejectedValueOnce(new Error("relation not found"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await get("/api/setup/migrations-summary");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ errorCode: "internal_error" });
    // Raw driver text must never be echoed pre-auth.
    expect(JSON.stringify(res.body)).not.toContain("relation not found");
    errSpy.mockRestore();
  });
});
