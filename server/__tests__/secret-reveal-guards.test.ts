// @vitest-environment node
//
// Task #767 — route-level coverage that EVERY reveal handler writes
// a `secret_reveal` audit row, including for guard-level rejections
// (401 unauthenticated, 403 non-admin) that the previous middleware
// gates would have returned BEFORE the handler ran.
//
// The audit-row writer (`recordSecretRevealAudit`) has its own unit
// tests in `server/auth/__tests__/secret-reveal-audit.test.ts`.
// THIS file specifically pins the wiring inside the three reveal
// routes — that the handlers actually reach the audit call on the
// guard-rejection paths, with the right key, success flag, and
// stable deny-reason code.
//
// Three routes are covered:
//   POST /api/system/secrets/reveal
//   POST /api/system/secrets/reveal-database-url
//   POST /api/db-connections/:id/reveal   (via exported handler)
//
// `recordSecretRevealAudit` is mocked at module level so each test
// can assert the exact arguments handed to it. Storage / db / app-
// config dependencies are stubbed only as far as the handler
// touches them on the guard branches — guard rejections happen
// before the handler reaches `storage.db`, so most tests do not
// need a working storage stub at all.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

const recordSecretRevealAuditMock = vi.fn(async () => {});
const isAuthenticatedMock = vi.fn((_req: any, _res: any, next: any) => next());

vi.mock("../auth/simpleAuth", () => ({
  recordSecretRevealAudit: (...args: unknown[]) =>
    recordSecretRevealAuditMock(...args),
  // `system-routes` only imports recordSecretRevealAudit lazily;
  // `routes.ts` imports `isAuthenticated` at top-level, so we still
  // need to export it for the routes.ts module load to succeed even
  // though the reveal handler no longer uses it.
  isAuthenticated: (...args: unknown[]) => isAuthenticatedMock(...args),
  // `setupSimpleAuth` and friends are referenced from registerRoutes
  // but never invoked here — we only import the extracted handler.
  setupSimpleAuth: vi.fn(),
}));

// `system-routes.ts` calls these at module-evaluation time / inside
// the reveal handler. Stub through to a no-op snapshot that matches
// the shape the reveal handler reads.
const snapshotMock = vi.fn();
vi.mock("../lib/app-config", () => ({
  getBootstrapSnapshot: (opts?: { revealValues?: boolean }) =>
    snapshotMock(opts ?? {}),
  setSessionSecret: vi.fn(),
  setEncryptionKey: vi.fn(),
  generateSessionSecret: vi.fn(() => "new-session-secret"),
  generateEncryptionKey: vi.fn(
    () =>
      "11111111111111111111111111111111111111111111111111111111111111aa",
  ),
  setFallbackEncryptionKey: vi.fn(),
}));

vi.mock("../db", () => ({
  pool: null,
  dbReady: true,
  db: {},
}));

vi.mock("../lib/migrations-runner", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/migrations-runner")
  >("../lib/migrations-runner");
  return {
    ...actual,
    getSchemaMigrationsReport: vi.fn(),
    runPendingMigrations: vi.fn(),
    withMigrationAdvisoryLock: vi.fn(
      async (_pool: unknown, fn: () => Promise<unknown>) => fn(),
    ),
  };
});

import { registerSystemRoutes } from "../routes/system-routes";
import { revealDbConnectionHandler } from "../routes";

let server: Server | null = null;
let baseUrl = "";

const sessionUser: {
  current: { role?: string; id?: string; email?: string | null } | null;
} = { current: null };

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUser.current ? { user: sessionUser.current } : {};
    next();
  });
  registerSystemRoutes(app);
  app.post("/api/db-connections/:id/reveal", revealDbConnectionHandler);
  return app;
}

beforeEach(async () => {
  recordSecretRevealAuditMock.mockClear();
  recordSecretRevealAuditMock.mockImplementation(async () => {});
  snapshotMock.mockReset();
  // Default snapshot — reveal handlers will short-circuit on the
  // guards before they consume it, but the system-routes module
  // calls it inside the reveal flow so it has to return SOMETHING.
  snapshotMock.mockReturnValue({
    hasConnectionUrl: true,
    databaseUrlSource: "env",
    hasSessionSecret: true,
    sessionSecretSource: "file",
    hasEncryptionKey: true,
    encryptionKeySource: "file",
    publicAppUrl: "http://localhost:5000",
    publicAppUrlSource: "default",
    smtpHostSource: "none",
    sessionSecretValue: "session-secret-value",
    encryptionKeyValue:
      "22222222222222222222222222222222222222222222222222222222222222bb",
  });
  sessionUser.current = null;
  delete process.env.SESSION_SECRET;
  delete process.env.ENCRYPTION_KEY;

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

async function postJson(path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let parsed: unknown = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }
  return {
    status: res.status,
    body: parsed as Record<string, unknown>,
  } as const;
}

// Pull out the `params` argument the route handed to
// `recordSecretRevealAudit` — index 1 because (req, params).
function lastAuditCallParams(): {
  key: string;
  success: boolean;
  reason?: string | null;
} {
  const calls = recordSecretRevealAuditMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as {
    key: string;
    success: boolean;
    reason?: string | null;
  };
}

describe("POST /api/system/secrets/reveal — guard rejections are audited", () => {
  it("writes an unauthenticated secret_reveal denial when no session is present", async () => {
    sessionUser.current = null;
    const res = await postJson("/api/system/secrets/reveal", {
      key: "SESSION_SECRET",
    });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe("unauthenticated");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "reveal:bootstrap",
      success: false,
      reason: "unauthenticated",
    });
  });

  it("writes a not_admin secret_reveal denial when caller is logged in but not Admin", async () => {
    sessionUser.current = {
      id: "user-7",
      email: "viewer@example.com",
      role: "Viewer",
    };
    const res = await postJson("/api/system/secrets/reveal", {
      key: "SESSION_SECRET",
    });
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("forbidden");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "reveal:bootstrap",
      success: false,
      reason: "not_admin",
    });
  });
});

describe("POST /api/system/secrets/reveal-database-url — guard rejections are audited", () => {
  it("writes an unauthenticated DATABASE_URL denial when no session is present", async () => {
    sessionUser.current = null;
    const res = await postJson("/api/system/secrets/reveal-database-url", {});
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe("unauthenticated");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "DATABASE_URL",
      success: false,
      reason: "unauthenticated",
    });
  });

  it("writes a not_admin DATABASE_URL denial when caller is non-Admin", async () => {
    sessionUser.current = {
      id: "user-7",
      email: "viewer@example.com",
      role: "Viewer",
    };
    const res = await postJson("/api/system/secrets/reveal-database-url", {});
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe("forbidden");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "DATABASE_URL",
      success: false,
      reason: "not_admin",
    });
  });
});

describe("POST /api/db-connections/:id/reveal — guard rejections are audited", () => {
  it("writes an unauthenticated db-connection denial when no session is present", async () => {
    sessionUser.current = null;
    const res = await postJson("/api/db-connections/42/reveal", {});
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "db-connection:42",
      success: false,
      reason: "unauthenticated",
    });
  });

  it("writes a not_admin db-connection denial when caller is non-Admin", async () => {
    sessionUser.current = {
      id: "user-7",
      email: "viewer@example.com",
      role: "Viewer",
    };
    const res = await postJson("/api/db-connections/42/reveal", {});
    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Admin only");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "db-connection:42",
      success: false,
      reason: "not_admin",
    });
  });

  it("preserves the literal :id in the audit subject so non-numeric probes are still attributable", async () => {
    sessionUser.current = null;
    const res = await postJson("/api/db-connections/not-a-number/reveal", {});
    expect(res.status).toBe(401);
    const params = lastAuditCallParams();
    // Subject keeps the raw param so an audit reviewer can see WHAT
    // the caller was probing, even when the id never parsed.
    expect(params.key).toBe("db-connection:not-a-number");
    expect(params.reason).toBe("unauthenticated");
  });
});

describe("audit-row insert failures never bubble out of a reveal handler", () => {
  it("returns the normal 401 even when recordSecretRevealAudit throws", async () => {
    sessionUser.current = null;
    recordSecretRevealAuditMock.mockImplementationOnce(async () => {
      throw new Error("simulated audit DB outage");
    });
    const res = await postJson("/api/db-connections/9/reveal", {});
    // Adding audit *coverage* of a security event must never
    // convert a clean rejection into a 500.
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Unauthorized");
  });
});

describe("POST /api/system/secrets/reveal — internal_error throw path is audited", () => {
  it("writes an internal_error secret_reveal denial when getBootstrapSnapshot throws", async () => {
    sessionUser.current = {
      id: "admin-rotate",
      email: "rotate@example.com",
      role: "Admin",
    };
    snapshotMock.mockImplementation(() => {
      throw new Error("simulated snapshot failure");
    });
    const res = await postJson("/api/system/secrets/reveal", {
      key: "SESSION_SECRET",
    });
    // Top-level try/catch in the reveal handler caught the throw,
    // wrote the audit row, and returned the canonical 500 shape.
    expect(res.status).toBe(500);
    expect(res.body.errorCode).toBe("internal_error");
    expect(recordSecretRevealAuditMock).toHaveBeenCalledTimes(1);
    const params = lastAuditCallParams();
    expect(params).toMatchObject({
      key: "SESSION_SECRET",
      success: false,
      reason: "internal_error",
    });
  });
});
