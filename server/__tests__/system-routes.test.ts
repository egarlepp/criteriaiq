// @vitest-environment node
//
// Coverage for `server/routes/system-routes.ts` — the admin-only post-setup
// `/api/system/env-status` endpoint that backs the env-var status panel
// added on the Configuration → System Settings page (Task #342).
//
// The endpoint reuses `getBootstrapSnapshot()` so the wizard and the
// post-setup audit panel agree on each row's source. These tests pin the
// happy path (admin sees the four sources echoed from the snapshot), the
// auth gates (401 for unauthenticated, 403 for non-Admin), and the safety
// guarantee that raw secret values are NEVER serialized over the wire.
//
// `getBootstrapSnapshot` is mocked because real reads depend on
// `data/db-config.json` and process.env — neither of which the test should
// require to assert the route's contract.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

const snapshotMock = vi.fn();
const schemaMigrationsReportMock = vi.fn();
const runPendingMigrationsMock = vi.fn();
// Default behaviour: pretend the advisory lock was acquired and just
// invoke the wrapped function. Individual tests override this to
// model the contended path (throws `MigrationLockUnavailableError`)
// or a lock-acquire infra failure (throws a plain Error). Lives at
// module scope so per-test overrides via
// `withMigrationAdvisoryLockMock.mockImplementationOnce(...)` survive
// the `mockReset()` call in `beforeEach` below — that reset is
// followed by re-establishing the pass-through default so each test
// starts in the same state.
const withMigrationAdvisoryLockMock = vi.fn(
  async (_pool: unknown, fn: () => Promise<unknown>) => fn(),
);
const dbState: { ready: boolean; pool: unknown } = { ready: true, pool: {} };

vi.mock("../lib/app-config", () => ({
  // Wrapper so test cases can call `snapshotMock.mockReturnValueOnce(...)`
  // without redefining the module each time.
  getBootstrapSnapshot: (opts?: { revealValues?: boolean }) =>
    snapshotMock(opts ?? {}),
}));

// `system-routes.ts` now imports `./db` (for the schema-migrations
// admin endpoint added in task #391). Stubbing the module here keeps
// these tests free of a real Postgres connection — `dbState` is
// mutated per-test to flip between "db configured" and "db missing"
// without redefining the mock.
vi.mock("../db", () => ({
  get pool() {
    return dbState.pool;
  },
  get dbReady() {
    return dbState.ready;
  },
}));

vi.mock("../lib/migrations-runner", async () => {
  // Pull through the real `MigrationFailedError` class so `instanceof`
  // checks inside the route still work — the route distinguishes
  // typed migration failures from arbitrary errors when constructing
  // the response payload.
  const actual = await vi.importActual<
    typeof import("../lib/migrations-runner")
  >("../lib/migrations-runner");
  return {
    ...actual,
    getSchemaMigrationsReport: (...args: unknown[]) =>
      schemaMigrationsReportMock(...args),
    runPendingMigrations: (...args: unknown[]) =>
      runPendingMigrationsMock(...args),
    // Wire the advisory-lock helper through a vi.fn so tests can
    // model the cross-instance contention path (Task #428) by making
    // it throw `MigrationLockUnavailableError`. Default
    // implementation (set above + re-set in `beforeEach`) just
    // invokes the wrapped function so the happy path keeps working
    // without per-test boilerplate.
    withMigrationAdvisoryLock: (...args: unknown[]) =>
      withMigrationAdvisoryLockMock(...(args as Parameters<typeof withMigrationAdvisoryLockMock>)),
  };
});

// `/api/system/env-status` derives a credentials-masked
// `databaseUrlPreview` from `resolveConnectionUrl()` (Task #741).
// Unmocked, that reads the developer's real DATABASE_URL /
// data/db-config.json, so the response would differ per machine.
const resolveConnectionUrlMock = vi.fn(
  (): { url: string | null; source: "file" | "env" | "none" } => ({
    url: null,
    source: "none",
  }),
);
vi.mock("../db-bootstrap", async () => {
  const actual = await vi.importActual<typeof import("../db-bootstrap")>(
    "../db-bootstrap",
  );
  return {
    ...actual,
    resolveConnectionUrl: () => resolveConnectionUrlMock(),
  };
});

import { registerSystemRoutes } from "../routes/system-routes";

let server: Server | null = null;
let baseUrl = "";

// Simulated session injected by middleware on each request. Tests swap
// `sessionUser.current` to model "anonymous", "Admin", and other roles.
const sessionUser: {
  current: { role?: string; id?: string; email?: string | null } | null;
} = {
  current: null,
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.session = sessionUser.current ? { user: sessionUser.current } : {};
    next();
  });
  registerSystemRoutes(app);
  return app;
}

beforeEach(async () => {
  snapshotMock.mockReset();
  schemaMigrationsReportMock.mockReset();
  runPendingMigrationsMock.mockReset();
  // Reset the advisory-lock mock back to the pass-through default
  // so a test that overrode it (e.g. the contention case) doesn't
  // bleed into the next test.
  withMigrationAdvisoryLockMock.mockReset();
  withMigrationAdvisoryLockMock.mockImplementation(
    async (_pool: unknown, fn: () => Promise<unknown>) => fn(),
  );
  dbState.ready = true;
  dbState.pool = {};
  sessionUser.current = null;
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
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() } as const;
}

async function post(path: string) {
  const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
  const text = await res.text();
  // Some failure paths still return JSON; some 4xx paths from
  // express-default error handlers might return an empty body. Try
  // to parse but tolerate an empty payload to keep assertions
  // simple.
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body: body as Record<string, unknown> } as const;
}

describe("GET /api/system/env-status", () => {
  it("returns 401 for unauthenticated callers (no session.user)", async () => {
    sessionUser.current = null;
    const res = await get("/api/system/env-status");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ errorCode: "unauthenticated" });
    // The handler must short-circuit BEFORE building a snapshot — the
    // bootstrap config touches the filesystem and must never run for an
    // unauthenticated caller.
    expect(snapshotMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-Admin callers", async () => {
    sessionUser.current = { id: "u1", role: "User" };
    const res = await get("/api/system/env-status");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ errorCode: "forbidden" });
    expect(snapshotMock).not.toHaveBeenCalled();
  });

  it("returns the env source labels for an Admin caller", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
      smtpHostSource: "file",
      sessionSecretValue: undefined,
      encryptionKeyValue: undefined,
    });
    resolveConnectionUrlMock.mockReturnValueOnce({
      url: "postgres://criteria:s3cret@db.internal:5432/criteriaiq",
      source: "env",
    });

    const res = await get("/api/system/env-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      databaseUrlSource: "env",
      // Host / port / db survive; user and password are masked.
      databaseUrlPreview: "postgres://••••:••••@db.internal:5432/criteriaiq",
      sessionSecretSource: "file",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
      smtpHostSource: "file",
    });
  });

  it("calls getBootstrapSnapshot WITHOUT revealValues so raw secrets are never serialized", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: false,
      databaseUrlSource: "wizard",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      // If the snapshot ever did surface raw values, the route's response
      // shape MUST still drop them — this test asserts the contract.
      sessionSecretValue: "should-never-be-sent",
      encryptionKeyValue: "should-never-be-sent",
    });

    const res = await get("/api/system/env-status");
    expect(res.status).toBe(200);
    // The snapshot helper must be invoked without the reveal flag set.
    expect(snapshotMock).toHaveBeenCalledTimes(1);
    expect(snapshotMock).toHaveBeenCalledWith({});
    // Raw values must not appear in the serialized JSON.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("should-never-be-sent");
    expect(res.body).not.toHaveProperty("sessionSecretValue");
    expect(res.body).not.toHaveProperty("encryptionKeyValue");
  });

  it("reflects file/wizard sources for operators auditing a still-deferred handoff", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "wizard",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });

    const res = await get("/api/system/env-status");
    expect(res.status).toBe(200);
    expect(res.body.databaseUrlSource).toBe("wizard");
    expect(res.body.sessionSecretSource).toBe("file");
    expect(res.body.encryptionKeySource).toBe("file");
    expect(res.body.publicAppUrlSource).toBe("default");
  });
});

describe("GET /api/admin/schema-migrations", () => {
  it("returns 401 for unauthenticated callers without touching the DB", async () => {
    sessionUser.current = null;
    const res = await get("/api/admin/schema-migrations");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ errorCode: "unauthenticated" });
    expect(schemaMigrationsReportMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-Admin callers", async () => {
    sessionUser.current = { id: "u2", role: "User" };
    const res = await get("/api/admin/schema-migrations");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ errorCode: "forbidden" });
    expect(schemaMigrationsReportMock).not.toHaveBeenCalled();
  });

  it("returns 503 with errorCode db_not_ready when the app is running without a database", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    dbState.ready = false;
    dbState.pool = null;
    const res = await get("/api/admin/schema-migrations");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ errorCode: "db_not_ready" });
    expect(schemaMigrationsReportMock).not.toHaveBeenCalled();
  });

  it("returns the report verbatim from getSchemaMigrationsReport for an Admin caller", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    const fakeReport = {
      applied: [
        {
          filename: "001_migrate_end_date_flags_colors.sql",
          checksum: "abc",
          appliedAt: "2025-01-02T03:04:05.000Z",
          description: "Migrate end date flags colors",
        },
      ],
      missing: [
        {
          filename: "030_pending.sql",
          description: "Pending",
          previewLines: ["-- Pending", "ALTER TABLE foo ADD COLUMN bar text;"],
          previewTruncated: false,
        },
      ],
      unknown: ["009_removed_old.sql"],
      recentAuditEvents: [],
    };
    schemaMigrationsReportMock.mockResolvedValueOnce(fakeReport);

    const res = await get("/api/admin/schema-migrations");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(fakeReport);
    expect(schemaMigrationsReportMock).toHaveBeenCalledTimes(1);
  });

  it("returns 500 with errorCode internal_error when the helper throws", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    schemaMigrationsReportMock.mockRejectedValueOnce(new Error("boom"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await get("/api/admin/schema-migrations");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ errorCode: "internal_error" });
    errSpy.mockRestore();
  });
});

// Coverage for the admin-triggered "apply pending migrations" action
// added in task #419. Pins the auth gates, the in-flight 409 lock,
// the success-path response shape (always includes the freshly
// recomputed report so the UI can drop its cached pending list), and
// the structured-failure path (uses `MigrationFailedError` so the
// response surfaces `failedFilename` + `sqlState`).
describe("POST /api/admin/schema-migrations/run", () => {
  it("returns 401 for unauthenticated callers without invoking the runner", async () => {
    sessionUser.current = null;
    const res = await post("/api/admin/schema-migrations/run");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ errorCode: "unauthenticated" });
    expect(runPendingMigrationsMock).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-Admin callers", async () => {
    sessionUser.current = { id: "u3", role: "User" };
    const res = await post("/api/admin/schema-migrations/run");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ errorCode: "forbidden" });
    expect(runPendingMigrationsMock).not.toHaveBeenCalled();
  });

  it("returns 503 with errorCode db_not_ready when the database is not configured", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    dbState.ready = false;
    dbState.pool = null;
    const res = await post("/api/admin/schema-migrations/run");
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ errorCode: "db_not_ready" });
    expect(runPendingMigrationsMock).not.toHaveBeenCalled();
  });

  it("applies pending migrations and returns the freshly recomputed report", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    runPendingMigrationsMock.mockResolvedValueOnce({
      applied: ["030_pending.sql"],
      skipped: ["001_first.sql"],
    });
    const refreshedReport = {
      applied: [
        {
          filename: "001_first.sql",
          checksum: "abc",
          appliedAt: "2025-01-02T03:04:05.000Z",
          description: "First",
        },
        {
          filename: "030_pending.sql",
          checksum: "def",
          appliedAt: "2026-04-26T01:02:03.000Z",
          description: "Pending",
        },
      ],
      missing: [],
      unknown: [],
      recentAuditEvents: [
        {
          id: 1,
          filename: "030_pending.sql",
          userId: "admin-1",
          userEmail: "admin@example.com",
          success: true,
          errorMessage: null,
          sqlState: null,
          appliedAt: "2026-04-26T01:02:03.000Z",
        },
      ],
    };
    schemaMigrationsReportMock.mockResolvedValueOnce(refreshedReport);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      applied: ["030_pending.sql"],
      report: refreshedReport,
    });
    expect(runPendingMigrationsMock).toHaveBeenCalledTimes(1);
    expect(schemaMigrationsReportMock).toHaveBeenCalledTimes(1);
    // Task #429: the actor must be forwarded to the runner so per-file
    // success rows land in `schema_migration_audit` with the right
    // user id + email. The runner's signature is
    // `runPendingMigrations(pool, options)`, so we assert on the
    // second positional argument.
    const runArgs = runPendingMigrationsMock.mock.calls[0];
    expect(runArgs[1]).toEqual({
      auditActor: { userId: "admin-1", userEmail: "admin@example.com" },
    });
    // Audit-log line should include the actor so security can grep
    // production logs for who applied what.
    const auditLines = logSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/schema-migrations:run]"));
    expect(
      auditLines.some(
        (line) =>
          line.includes("user=admin-1") && line.includes("admin@example.com"),
      ),
    ).toBe(true);
    expect(
      auditLines.some(
        (line) =>
          line.includes("OK") && line.includes("030_pending.sql"),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("returns 500 with migration_failed and the failed filename when the runner throws MigrationFailedError", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    const { MigrationFailedError } = await import(
      "../lib/migrations-runner"
    );
    runPendingMigrationsMock.mockRejectedValueOnce(
      new MigrationFailedError({
        filename: "031_broken.sql",
        sqlState: "42703",
        originalMessage: "column \"foo\" does not exist",
      }),
    );
    const partialReport = {
      applied: [],
      missing: [
        {
          filename: "031_broken.sql",
          description: "Broken",
          previewLines: ["ALTER TABLE foo ADD COLUMN bar text;"],
          previewTruncated: false,
        },
      ],
      unknown: [],
      recentAuditEvents: [
        {
          id: 7,
          filename: "031_broken.sql",
          userId: "admin-1",
          userEmail: "admin@example.com",
          success: false,
          errorMessage: "column \"foo\" does not exist",
          sqlState: "42703",
          appliedAt: "2026-04-26T01:02:03.000Z",
        },
      ],
    };
    schemaMigrationsReportMock.mockResolvedValueOnce(partialReport);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      errorCode: "migration_failed",
      failedFilename: "031_broken.sql",
      sqlState: "42703",
      report: partialReport,
    });
    expect(String(res.body.error)).toContain("031_broken.sql");
    // Failure must also surface in the audit log so security can
    // trace failed attempts, not just successful ones.
    const errLines = errSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/schema-migrations:run]"));
    expect(
      errLines.some(
        (line) =>
          line.includes("FAILED") &&
          line.includes("user=admin-1") &&
          line.includes("031_broken.sql") &&
          line.includes("42703"),
      ),
    ).toBe(true);
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("returns 500 with internal_error when the runner throws a non-MigrationFailedError", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    runPendingMigrationsMock.mockRejectedValueOnce(new Error("boom"));
    schemaMigrationsReportMock.mockResolvedValueOnce({
      applied: [],
      missing: [],
      unknown: [],
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      errorCode: "internal_error",
      failedFilename: null,
      sqlState: null,
    });
    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("acquires the advisory lock around the runner on the happy path so two replicas cannot race", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    schemaMigrationsReportMock.mockResolvedValueOnce({
      applied: [],
      missing: [],
      unknown: [],
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Track the order so the test pins lock-acquire BEFORE runner
    // BEFORE lock-release — the property the cross-instance guard
    // relies on. We swap the lock mock for one that records its
    // entry/exit around the wrapped fn() call.
    const order: string[] = [];
    withMigrationAdvisoryLockMock.mockImplementationOnce(
      async (_pool: unknown, fn: () => Promise<unknown>) => {
        order.push("lock:acquired");
        try {
          return await fn();
        } finally {
          order.push("lock:released");
        }
      },
    );
    runPendingMigrationsMock.mockImplementationOnce(async () => {
      order.push("runner");
      return { applied: ["030_pending.sql"], skipped: [] };
    });

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(200);
    expect(order).toEqual(["lock:acquired", "runner", "lock:released"]);
    // The lock helper must be called with the pool reference the
    // route resolved from `./db`, so the lock and the runner share
    // the same database session pool.
    expect(withMigrationAdvisoryLockMock).toHaveBeenCalledTimes(1);
    expect(withMigrationAdvisoryLockMock.mock.calls[0]?.[0]).toBe(dbState.pool);
    logSpy.mockRestore();
  });

  it("rejects a contended run with 409 errorCode run_in_progress when another replica holds the advisory lock", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    // Pull the real `MigrationLockUnavailableError` through so the
    // route's `instanceof` branch lights up exactly the way it would
    // when the runtime helper rejects with the typed error.
    const { MigrationLockUnavailableError } = await import(
      "../lib/migrations-runner"
    );
    withMigrationAdvisoryLockMock.mockImplementationOnce(async () => {
      throw new MigrationLockUnavailableError();
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ errorCode: "run_in_progress" });
    // The contention path must NOT invoke the runner — only the lock
    // helper should be called.
    expect(runPendingMigrationsMock).not.toHaveBeenCalled();
    expect(schemaMigrationsReportMock).not.toHaveBeenCalled();
    // The rejection should still surface in the audit log so
    // operators can see who tried during a contended window.
    const auditLines = logSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/schema-migrations:run]"));
    expect(
      auditLines.some(
        (line) =>
          line.includes("REJECTED") &&
          line.includes("user=admin-1") &&
          line.includes("run_in_progress"),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });

  it("returns 500 internal_error when the advisory-lock helper itself fails (lock infra outage, not contention)", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    withMigrationAdvisoryLockMock.mockImplementationOnce(async () => {
      throw new Error("connection terminated unexpectedly");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await post("/api/admin/schema-migrations/run");

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      ok: false,
      errorCode: "internal_error",
      failedFilename: null,
      sqlState: null,
    });
    expect(runPendingMigrationsMock).not.toHaveBeenCalled();
    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
