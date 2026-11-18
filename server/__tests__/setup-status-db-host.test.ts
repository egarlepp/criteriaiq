// @vitest-environment node
//
// Coverage for the new `dbHealth.host` field surfaced on /api/setup/status
// (Task #452). The field carries the sanitized `hostname[:port]` of the
// LIVE `DATABASE_URL` so the wizard's red unreachable banner can tell the
// operator WHICH connection is failing — but it must NEVER include the
// password or username.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

vi.mock("../lib/app-state", () => ({
  getSetupCompletedAt: async () => null,
  markSetupCompleted: async () => null,
}));

vi.mock("../lib/migration-failure-marker", () => ({
  readMigrationFailureMarker: () => null,
}));

// Per-test override hook for the URL resolver so we can flip between
// "no URL configured" and "broken URL with credentials".
const resolverState: { url: string | null } = { url: null };
vi.mock("../db-bootstrap", () => ({
  writeBootstrapConfig: vi.fn(),
  bootstrapConfigExists: () => false,
  readBootstrapConfig: () => null,
  resolveConnectionUrl: () =>
    resolverState.url
      ? { url: resolverState.url, source: "env" as const }
      : { url: null, source: "none" as const },
}));

// Stub probe so we don't actually try to talk to a database. Importantly,
// the host computation in the route happens BEFORE the probe runs and is
// independent of the probe result, so we can pin probe outcomes per-test.
const probeMock = vi.fn();
vi.mock("../lib/db-probe", async () => {
  // Re-export the real `sanitizeConnectionHost` so the route's import
  // exercises the production sanitizer (this is the unit we're verifying).
  const real = await vi.importActual<typeof import("../lib/db-probe")>(
    "../lib/db-probe",
  );
  return {
    ...real,
    probeDatabase: (...args: unknown[]) => probeMock(...args),
  };
});

vi.mock("../db", () => ({ pool: null, dbReady: false }));

vi.mock("../lib/migrations-runner", () => ({
  getSchemaMigrationsSummary: vi.fn(),
  listKnownMigrationFiles: () => [],
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

import { registerSetupStatusRoutes } from "../routes/setup-routes";

let server: Server | null = null;
let baseUrl = "";

beforeEach(async () => {
  resolverState.url = null;
  probeMock.mockReset();
  const app: Express = express();
  app.use(express.json());
  registerSetupStatusRoutes(app);
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
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() } as const;
}

describe("/api/setup/status dbHealth.host (Task #452)", () => {
  it("includes the sanitized host[:port] when the live DATABASE_URL is unreachable", async () => {
    resolverState.url = "postgresql://neondb_owner:npg_secret_value@db.example.com:5432/app";
    probeMock.mockResolvedValueOnce({
      ok: false,
      code: "authFailed",
      message: 'password authentication failed for user "neondb_owner"',
    });

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    expect(res.body.dbHealth).toEqual({
      reachable: false,
      lastErrorCode: "authFailed",
      host: "db.example.com:5432",
    });
  });

  it("includes the sanitized host[:port] even on a successful probe", async () => {
    // The wizard's Done-step liveness panel relies on this round-trip to
    // tell the operator WHICH host succeeded — so the field must be
    // populated regardless of probe outcome, as long as a URL was
    // configured.
    resolverState.url = "postgresql://u:p@db.example.com/app";
    probeMock.mockResolvedValueOnce({ ok: true });

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    expect(res.body.dbHealth).toEqual({
      reachable: true,
      lastErrorCode: null,
      host: "db.example.com",
    });
  });

  it("never serializes the password or username from the connection URL", async () => {
    // Defence-in-depth: the response is consumed by the unauthenticated
    // /setup wizard, so leaking userinfo here would expose the live
    // database password to anyone who can hit the public URL.
    resolverState.url =
      "postgresql://neondb_owner:npg_secret_value@ep-x.neon.tech:5432/db?sslmode=require";
    probeMock.mockResolvedValueOnce({
      ok: false,
      code: "authFailed",
      message: "password authentication failed",
    });

    const res = await get("/api/setup/status");

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("npg_secret_value");
    expect(serialized).not.toContain("neondb_owner");
    expect(serialized).not.toContain("password");
    // Sanity: but the host IS present so the banner has something useful
    // to render.
    expect(res.body.dbHealth.host).toBe("ep-x.neon.tech:5432");
    // And the @-separator that splits userinfo from host MUST be gone —
    // its presence in the host field would imply userinfo survived.
    expect(res.body.dbHealth.host).not.toContain("@");
  });

  it("omits dbHealth entirely when no DATABASE_URL is configured", async () => {
    // First-run state: the wizard's connect step exists precisely so
    // the operator can paste one. The banner gates on `dbHealth` being
    // present, so we must NOT emit a synthesized "unknown-host" entry
    // here that would falsely flash the red callout on a fresh install.
    resolverState.url = null;

    const res = await get("/api/setup/status");

    expect(res.status).toBe(200);
    expect(res.body.dbHealth).toBeUndefined();
    expect(probeMock).not.toHaveBeenCalled();
  });
});
