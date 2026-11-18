// @vitest-environment node
//
// Coverage for the `adminProbeFailed` 503 branch of
// POST /api/setup/create-admin (task #576). Locks in status code,
// errorCode, and the contract that no admin row is created when
// `hasApprovedAdmin` reports `{ state: 'error' }`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const TEST_SETUP_TOKEN = "test-setup-token-0123456789";
process.env.SETUP_TOKEN = TEST_SETUP_TOKEN;
import express, { type Express } from "express";
import type { Server } from "http";

type ProbeResult =
  | { state: "has-admin" }
  | { state: "no-admin" }
  | { state: "error"; cause: unknown };

const hasApprovedAdminMock = vi.fn<[unknown?], Promise<ProbeResult>>();
const createBootstrapAdminMock = vi.fn();
const buildSetupAdminDbMock = vi.fn();

vi.mock("../auth/admin-bootstrap", () => ({
  hasApprovedAdmin: (...args: unknown[]) => hasApprovedAdminMock(...args),
  validateAdminInput: () => ({ ok: true }),
  createBootstrapAdmin: (...args: unknown[]) =>
    createBootstrapAdminMock(...args),
  buildSetupAdminDb: (...args: unknown[]) => buildSetupAdminDbMock(...args),
}));

// Non-null URL so the handler proceeds past the `dbNotInitialized`
// short-circuit and reaches the probe branch under test.
vi.mock("../db-bootstrap", () => ({
  writeBootstrapConfig: vi.fn(),
  bootstrapConfigExists: () => true,
  readBootstrapConfig: () => "postgres://probe-failed-test/db",
  resolveConnectionUrl: () => ({
    url: "postgres://probe-failed-test/db",
    source: "config" as const,
  }),
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

vi.mock("../lib/app-state", () => ({
  getSetupCompletedAt: vi.fn(async () => null),
  markSetupCompleted: vi.fn(async () => null),
}));

vi.mock("../lib/migration-failure-marker", () => ({
  readMigrationFailureMarker: () => null,
}));

vi.mock("../lib/migrations-runner", () => ({
  getSchemaMigrationsSummary: vi.fn(),
  listKnownMigrationFiles: () => [],
}));

vi.mock("../db", () => ({
  pool: null,
  dbReady: false,
}));

import { registerSetupRoutes } from "../routes/setup-routes";

let server: Server | null = null;
let baseUrl = "";

const closeMock = vi.fn(async () => {});
const FAKE_DB = { selectAllUserRoles: vi.fn(), upsertAdmin: vi.fn() } as const;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  registerSetupRoutes(app);
  return app;
}

beforeEach(async () => {
  hasApprovedAdminMock.mockReset();
  createBootstrapAdminMock.mockReset();
  buildSetupAdminDbMock.mockReset();
  closeMock.mockReset();
  buildSetupAdminDbMock.mockResolvedValue({ db: FAKE_DB, close: closeMock });
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

async function postCreateAdmin(body: Record<string, unknown> = {}) {
  const res = await fetch(`${baseUrl}/api/setup/create-admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Setup-Token": TEST_SETUP_TOKEN },
    body: JSON.stringify({
      email: "owner@example.com",
      password: "Sufficiently-Long-Password-1!",
      firstName: "Ada",
      lastName: "Lovelace",
      ...body,
    }),
  });
  return { status: res.status, body: await res.json() } as const;
}

describe("POST /api/setup/create-admin — adminProbeFailed branch (task #576)", () => {
  it("returns 503 + errorCode 'adminProbeFailed' when the admin probe fails", async () => {
    hasApprovedAdminMock.mockResolvedValueOnce({
      state: "error",
      cause: new Error("ECONNREFUSED 127.0.0.1:5432"),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await postCreateAdmin();

    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe("adminProbeFailed");
    expect(res.body).toMatchObject({ success: false });
    // Raw driver text must not cross the wire pre-auth.
    expect(JSON.stringify(res.body)).not.toContain("ECONNREFUSED");

    errSpy.mockRestore();
  });

  it("does NOT insert a bootstrap admin row when the probe fails", async () => {
    hasApprovedAdminMock.mockResolvedValueOnce({
      state: "error",
      cause: new Error("connection terminated"),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await postCreateAdmin();

    expect(res.status).toBe(503);
    expect(createBootstrapAdminMock).not.toHaveBeenCalled();

    errSpy.mockRestore();
  });

  it("releases the transient setup-mode db handle even when the probe fails", async () => {
    hasApprovedAdminMock.mockResolvedValueOnce({
      state: "error",
      cause: new Error("boom"),
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await postCreateAdmin();

    expect(closeMock).toHaveBeenCalledTimes(1);

    errSpy.mockRestore();
  });

  it("still returns 403 'adminAlreadyExists' on the 'has-admin' state", async () => {
    hasApprovedAdminMock.mockResolvedValueOnce({ state: "has-admin" });

    const res = await postCreateAdmin();

    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("adminAlreadyExists");
    expect(createBootstrapAdminMock).not.toHaveBeenCalled();
  });

  it("still creates the admin on the 'no-admin' state", async () => {
    hasApprovedAdminMock.mockResolvedValueOnce({ state: "no-admin" });
    createBootstrapAdminMock.mockResolvedValueOnce({
      id: "user_test",
      email: "owner@example.com",
    });

    const res = await postCreateAdmin();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      id: "user_test",
      email: "owner@example.com",
    });
    expect(createBootstrapAdminMock).toHaveBeenCalledTimes(1);
  });
});
