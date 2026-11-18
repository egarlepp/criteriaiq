// @vitest-environment node
//
// Regression coverage for the rotation handler's dual-key fallback
// registration sequence (Task #726).
//
// `POST /api/system/secrets/regenerate` (when `key === 'ENCRYPTION_KEY'`)
// re-encrypts every encrypted column under a new key inside one
// transaction, COMMITs, then calls setEncryptionKey to update
// process.env. To close the millisecond race between COMMIT and the
// env swap (and the mirror window for in-flight requests holding
// pre-COMMIT ciphertext), the handler now arms a process-memory
// fallback decryption key in app-config:
//
//   1. Just BEFORE COMMIT: setFallbackEncryptionKey(newKey)
//      — covers the post-COMMIT pre-swap window where the DB has
//        new-key ciphertext but process.env still has old-key.
//   2. IMMEDIATELY after setEncryptionKey(newKey):
//      setFallbackEncryptionKey(oldKey)
//      — covers the post-swap window where process.env is new-key
//        but in-flight requests still hold pre-COMMIT old-key
//        ciphertext that hasn't been decrypted yet.
//   3. After ROTATION_FALLBACK_TAIL_MS: setFallbackEncryptionKey(null)
//      — back to single-key steady state, the hot path stays a
//        single decipher attempt.
//
// We pin the EXACT ordering with respect to COMMIT and the env swap:
// a regression that swapped step (1) to AFTER COMMIT (or step (2)
// to AFTER the env swap as a separate tick) would re-open the race
// the task was filed to close. The DB pool, queries, and timers are
// all mocked — this test is about the call-order contract, not
// real Postgres I/O.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

const snapshotMock = vi.fn();
const setEncryptionKeyMock = vi.fn();
const setFallbackEncryptionKeyMock = vi.fn();
const getFallbackEncryptionKeyMock = vi.fn();
const generateEncryptionKeyMock = vi.fn();
const recordRotationCompletionMock = vi.fn();
const getRotationStatusMock = vi.fn();

const dbState: { ready: boolean; pool: any } = { ready: true, pool: null };

vi.mock("../lib/app-config", () => ({
  getBootstrapSnapshot: (opts?: { revealValues?: boolean }) =>
    snapshotMock(opts ?? {}),
  setEncryptionKey: (...args: unknown[]) => setEncryptionKeyMock(...args),
  setFallbackEncryptionKey: (...args: unknown[]) =>
    setFallbackEncryptionKeyMock(...args),
  getFallbackEncryptionKey: () => getFallbackEncryptionKeyMock(),
  setSessionSecret: vi.fn(),
  generateSessionSecret: vi.fn(() => "ses-new"),
  generateEncryptionKey: () => generateEncryptionKeyMock(),
  // Task #734: rotation handler now stamps a process-memory status
  // slot post-COMMIT so the admin "rotation in progress" banner
  // (GET /api/system/secrets/rotation-status) can render without
  // querying the DB. Mocked here as no-ops so the existing fallback
  // ordering tests stay focused on the dual-key sequence.
  recordRotationCompletion: (...args: unknown[]) =>
    recordRotationCompletionMock(...args),
  getRotationStatus: () => getRotationStatusMock(),
}));

vi.mock("../db", () => ({
  get pool() {
    return dbState.pool;
  },
  get dbReady() {
    return dbState.ready;
  },
}));

vi.mock("../lib/migrations-runner", async () => {
  const actual = await vi.importActual<
    typeof import("../lib/migrations-runner")
  >("../lib/migrations-runner");
  return actual;
});

import { registerSystemRoutes } from "../routes/system-routes";

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
  return app;
}

// Builds a fake pool whose `connect()` returns a client that records
// every query in `order` (so the test can assert the relative order
// of BEGIN, the lock, the SELECT/UPDATE rounds, COMMIT, and the
// fallback / env mutations). `query` returns sensible canned rows
// for the precheck and the per-table SELECT so the handler walks
// through the happy path.
function buildFakePool(order: string[]) {
  const queryHandler = async (sql: string, _params?: unknown[]) => {
    const trimmed = sql.trim();
    order.push(`q:${trimmed.split(/\s+/)[0].toUpperCase()}`);
    if (trimmed.startsWith("SELECT table_name FROM information_schema.tables")) {
      // Pretend none of the manifest tables exist — that keeps the
      // SELECT/UPDATE pass empty (the handler still proceeds to
      // COMMIT) so we can pin the COMMIT/swap ordering without
      // also having to fixture rows for every encrypted column.
      return { rows: [] };
    }
    if (trimmed.includes("pg_try_advisory_xact_lock")) {
      return { rows: [{ acquired: true }] };
    }
    return { rows: [] };
  };
  const fakeClient = {
    query: vi.fn(queryHandler),
    release: vi.fn(() => order.push("client:release")),
  };
  const fakePool = {
    query: vi.fn(queryHandler),
    connect: vi.fn(async () => {
      order.push("pool:connect");
      return fakeClient;
    }),
  };
  return { fakePool, fakeClient };
}

beforeEach(async () => {
  snapshotMock.mockReset();
  setEncryptionKeyMock.mockReset();
  setFallbackEncryptionKeyMock.mockReset();
  getFallbackEncryptionKeyMock.mockReset().mockReturnValue(null);
  generateEncryptionKeyMock.mockReset();
  recordRotationCompletionMock.mockReset();
  getRotationStatusMock.mockReset().mockReturnValue(null);
  dbState.ready = true;
  dbState.pool = null;
  sessionUser.current = null;
  // Make the rotation tail short enough that the test-runner doesn't
  // have to sit on a real 5-second timer. Read inside the handler at
  // each call so this test isolates from the prod default.
  process.env.__ROTATION_FALLBACK_TAIL_MS = "10";
  // Align process.env.ENCRYPTION_KEY with the file-side value the
  // snapshot mock advertises. The handler's divergence guard
  // (env_file_divergence) refuses to rotate when the host env and
  // the wizard's file disagree — without this they would, and the
  // test would 409 before exercising the fallback path.
  process.env.ENCRYPTION_KEY = "a".repeat(64);

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
  delete process.env.__ROTATION_FALLBACK_TAIL_MS;
});

async function postRegenerate(body: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/api/system/secrets/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  return { status: res.status, body: parsed as Record<string, unknown> };
}

describe("POST /api/system/secrets/regenerate — ENCRYPTION_KEY rotation fallback (Task #726)", () => {
  const OLD_KEY = "a".repeat(64);
  const NEW_KEY = "b".repeat(64);

  it("arms the fallback BEFORE COMMIT and flips it to oldKey IMMEDIATELY after the env swap", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      smtpHostSource: "none",
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });
    generateEncryptionKeyMock.mockReturnValueOnce(NEW_KEY);

    const order: string[] = [];
    const { fakePool } = buildFakePool(order);
    dbState.pool = fakePool;

    // Wire each side-effecting call so the order array tells the
    // full story: app-config calls (fallback, env swap) interleave
    // with DB queries from the mock pool.
    setFallbackEncryptionKeyMock.mockImplementation((value: string | null) => {
      order.push(`fallback:${value === null ? "clear" : value === NEW_KEY ? "new" : value === OLD_KEY ? "old" : "other"}`);
    });
    setEncryptionKeyMock.mockImplementation(() => {
      order.push("env:swap");
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postRegenerate({ key: "ENCRYPTION_KEY", confirm: true });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: "ENCRYPTION_KEY",
      value: NEW_KEY,
      source: "file",
    });

    // Pin the relative ordering of the four operations the race fix
    // depends on. Anything else (BEGIN, the precheck SELECT, the
    // advisory lock, etc.) is allowed to interleave — we only assert
    // the strict subsequence so future changes to the surrounding
    // SQL don't make this test brittle.
    const idxFallbackNew = order.indexOf("fallback:new");
    const idxCommit = order.indexOf("q:COMMIT");
    const idxEnvSwap = order.indexOf("env:swap");
    const idxFallbackOld = order.indexOf("fallback:old");

    expect(idxFallbackNew).toBeGreaterThanOrEqual(0);
    expect(idxCommit).toBeGreaterThanOrEqual(0);
    expect(idxEnvSwap).toBeGreaterThanOrEqual(0);
    expect(idxFallbackOld).toBeGreaterThanOrEqual(0);

    // (1) fallback armed BEFORE COMMIT — closes the post-COMMIT
    // pre-swap window.
    expect(idxFallbackNew).toBeLessThan(idxCommit);
    // (2) env swap happens AFTER COMMIT — the existing ordering
    // guarantee the comment in system-routes.ts pins.
    expect(idxCommit).toBeLessThan(idxEnvSwap);
    // (3) fallback flipped to oldKey IMMEDIATELY after env swap —
    // closes the mirror window for in-flight requests holding
    // pre-COMMIT ciphertext.
    expect(idxEnvSwap).toBeLessThan(idxFallbackOld);

    logSpy.mockRestore();
  });

  it("clears the fallback after the rotation tail period elapses", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      smtpHostSource: "none",
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });
    generateEncryptionKeyMock.mockReturnValueOnce(NEW_KEY);

    const order: string[] = [];
    const { fakePool } = buildFakePool(order);
    dbState.pool = fakePool;

    setFallbackEncryptionKeyMock.mockImplementation((value: string | null) => {
      order.push(`fallback:${value === null ? "clear" : value === NEW_KEY ? "new" : value === OLD_KEY ? "old" : "other"}`);
    });
    setEncryptionKeyMock.mockImplementation(() => {
      order.push("env:swap");
    });
    // After the swap the fallback is oldKey — the tail-cleanup
    // setTimeout uses getFallbackEncryptionKey() to decide whether
    // it still owns the slot. Make the getter say "yes, still old"
    // so the cleanup actually clears.
    getFallbackEncryptionKeyMock.mockReturnValue(OLD_KEY);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postRegenerate({ key: "ENCRYPTION_KEY", confirm: true });
    expect(res.status).toBe(200);

    // Wait long enough for the test-tuned tail (10ms) to fire.
    await new Promise((resolve) => setTimeout(resolve, 80));

    // The teardown timer should have fired exactly one extra
    // setFallbackEncryptionKey(null) after the rotation.
    const clearCalls = setFallbackEncryptionKeyMock.mock.calls.filter(
      (c) => c[0] === null,
    );
    expect(clearCalls.length).toBeGreaterThanOrEqual(1);

    logSpy.mockRestore();
  });

  it("clears the fallback on the rollback path so a failed COMMIT does not leave a stale newKey installed", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      smtpHostSource: "none",
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });
    generateEncryptionKeyMock.mockReturnValueOnce(NEW_KEY);

    const order: string[] = [];
    const { fakePool, fakeClient } = buildFakePool(order);
    dbState.pool = fakePool;

    // Make COMMIT throw so the handler enters the rollback path
    // AFTER having armed the fallback to newKey.
    fakeClient.query.mockImplementation(async (sql: string) => {
      const trimmed = sql.trim();
      order.push(`q:${trimmed.split(/\s+/)[0].toUpperCase()}`);
      if (trimmed.startsWith("SELECT table_name FROM information_schema.tables")) {
        return { rows: [] };
      }
      if (trimmed.includes("pg_try_advisory_xact_lock")) {
        return { rows: [{ acquired: true }] };
      }
      if (trimmed === "COMMIT") {
        throw new Error("simulated commit failure");
      }
      return { rows: [] };
    });

    setFallbackEncryptionKeyMock.mockImplementation((value: string | null) => {
      order.push(`fallback:${value === null ? "clear" : value === NEW_KEY ? "new" : value === OLD_KEY ? "old" : "other"}`);
    });
    setEncryptionKeyMock.mockImplementation(() => {
      order.push("env:swap");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postRegenerate({ key: "ENCRYPTION_KEY", confirm: true });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ errorCode: "apply_failed" });

    // The handler armed the fallback to newKey before COMMIT; the
    // rollback branch must clear it so the steady-state decrypt
    // path does not silently keep newKey accepted.
    const fallbackCalls = setFallbackEncryptionKeyMock.mock.calls.map(
      (c) => c[0],
    );
    expect(fallbackCalls).toContain(NEW_KEY);
    expect(fallbackCalls).toContain(null);
    // setEncryptionKey must NOT have been called — the env swap
    // only happens after a successful COMMIT.
    expect(setEncryptionKeyMock).not.toHaveBeenCalled();

    errSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("keeps the fallback armed at newKey when persisting the new key fails (so the running app keeps decrypting until restart)", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    snapshotMock.mockReturnValueOnce({
      hasConnectionUrl: true,
      databaseUrlSource: "env",
      hasSessionSecret: true,
      sessionSecretSource: "file",
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
      smtpHostSource: "none",
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });
    generateEncryptionKeyMock.mockReturnValueOnce(NEW_KEY);

    const order: string[] = [];
    const { fakePool } = buildFakePool(order);
    dbState.pool = fakePool;

    setFallbackEncryptionKeyMock.mockImplementation((value: string | null) => {
      order.push(`fallback:${value === null ? "clear" : value === NEW_KEY ? "new" : value === OLD_KEY ? "old" : "other"}`);
    });
    setEncryptionKeyMock.mockImplementation(() => {
      order.push("env:swap");
      throw new Error("simulated persist failure");
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postRegenerate({ key: "ENCRYPTION_KEY", confirm: true });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      errorCode: "persist_after_apply_failed",
      value: NEW_KEY,
    });

    // The DB has been re-encrypted under newKey but we couldn't
    // persist newKey to process.env. The fallback MUST stay pointed
    // at newKey so the running app keeps decrypting until the
    // operator restarts. The last fallback call before we returned
    // the response must therefore be newKey, not oldKey/null.
    const lastFallbackCall =
      setFallbackEncryptionKeyMock.mock.calls.at(-1)?.[0];
    expect(lastFallbackCall).toBe(NEW_KEY);

    errSpy.mockRestore();
    logSpy.mockRestore();
  });
});
