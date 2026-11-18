// @vitest-environment node
//
// Regression coverage for the admin-only bootstrap-secrets handlers
// added under #719:
//
//   POST /api/system/secrets/reveal
//   POST /api/system/secrets/regenerate
//
// These four cases were called out as the highest-leverage tests
// against future regressions of the security fixes that landed with
// the original feature (Task #725):
//
//   (a) ENCRYPTED_COLUMN_MANIFEST round-trip — drive the rotation
//       handler with one row per listed table, all encrypted under
//       the OLD key, and assert every captured UPDATE re-encrypts
//       cleanly under the NEW key. This is the test that goes red
//       the next time someone adds an encrypted column to a table
//       already in the manifest but forgets to extend the manifest's
//       `columns` array — that row would silently stay locked under
//       the old key and the next read would throw "Unsupported
//       state or unable to authenticate data".
//
//   (b) Divergence guard returns 409 with `errorCode:
//       'env_file_divergence'` when `process.env` and the file
//       disagree on the secret. The runtime always reads from
//       process.env (mfaUtils' lazy getter), so revealing/rotating
//       the file value while a different env value is in force would
//       mislead the operator into trusting a value the runtime is
//       not actually using.
//
//   (c) Regenerate refuses 409 with `errorCode: 'not_generated'`
//       when source==='none'. Without this, a stray POST could try
//       to re-encrypt the database with no current key at all and
//       end up locking every encrypted column.
//
//   (d) Persist-after-apply failure path. After the DB has been
//       re-encrypted under the new key but persisting the new key to
//       disk fails, the response MUST surface the new key in the
//       body so the operator can stash it in their host secret
//       manager — but the new key MUST NOT appear anywhere in the
//       process logs (stdout/stderr ship to journald/Dokploy/etc.,
//       and a master encryption key in those logs is unacceptable).
//
// The pool is mocked with a stateful in-memory implementation rather
// than wired to a real Postgres connection. This keeps the test
// hermetic, lets us seed every manifest table without first applying
// migrations, and lets us deterministically force the
// persist-after-apply failure path. The manifest itself is imported
// from the production module so it stays automatically in sync —
// adding a new row to ENCRYPTED_COLUMN_MANIFEST automatically
// extends the round-trip assertion to that table.

import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "http";

// Module-level mocks. Defined at the top so the `vi.mock` factories
// below can close over them — Vitest hoists `vi.mock` to the top of
// the file, so anything they reference must be in scope.
const snapshotMock = vi.fn();
const setSessionSecretMock = vi.fn();
const setEncryptionKeyMock = vi.fn();
const generateSessionSecretMock = vi.fn(() => "new-session-secret-value");
// Fixed 64-hex (32-byte) value so the rotation test can decrypt the
// captured UPDATEs back to their original plaintext deterministically.
const NEW_KEY_HEX =
  "11111111111111111111111111111111111111111111111111111111111111aa";
const generateEncryptionKeyMock = vi.fn(() => NEW_KEY_HEX);

const dbState: { ready: boolean; pool: unknown } = { ready: true, pool: null };

// Spread the real module so the in-memory helpers the rotation handler
// relies on (dual-key fallback slot, rotation-status bookkeeping) behave
// as in production; only the disk-touching / random-generating entry
// points are stubbed. app-config has no import-time side effects.
vi.mock("../lib/app-config", async () => {
  const actual = await vi.importActual<typeof import("../lib/app-config")>(
    "../lib/app-config",
  );
  return {
    ...actual,
    getBootstrapSnapshot: (opts?: { revealValues?: boolean }) =>
      snapshotMock(opts ?? {}),
    setSessionSecret: (...args: unknown[]) => setSessionSecretMock(...args),
    setEncryptionKey: (...args: unknown[]) => setEncryptionKeyMock(...args),
    generateSessionSecret: () => generateSessionSecretMock(),
    generateEncryptionKey: () => generateEncryptionKeyMock(),
  };
});

vi.mock("../db", () => ({
  get pool() {
    return dbState.pool;
  },
  get dbReady() {
    return dbState.ready;
  },
}));

// `system-routes.ts` also imports the migrations-runner helpers; the
// reveal/regenerate handlers don't use them, but the module-level
// import would still try to resolve the symbols. Stub through the
// real types so `instanceof` checks elsewhere stay honest while
// keeping these tests free of any runner side-effects.
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

import {
  registerSystemRoutes,
  ENCRYPTED_COLUMN_MANIFEST,
} from "../routes/system-routes";

// AES-256-GCM helpers identical in wire format to the route's
// internal `encryptWithKey`/`decryptWithKey` (and to
// `encryptText`/`decryptText` in `auth/mfaUtils`). Inlined here
// because the route's helpers are intentionally module-private.
function encryptWithKey(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let enc = cipher.update(plaintext, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${enc}:${tag.toString("hex")}`;
}

function decryptWithKey(ciphertext: string, keyHex: string): string {
  const [ivHex, enc, tagHex] = ciphertext.split(":");
  if (!ivHex || !enc || !tagHex) {
    throw new Error("Invalid encrypted text format");
  }
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  let dec = decipher.update(enc, "hex", "utf8");
  dec += decipher.final("utf8");
  return dec;
}

let server: Server | null = null;
let baseUrl = "";

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
  setSessionSecretMock.mockReset();
  setEncryptionKeyMock.mockReset();
  generateSessionSecretMock.mockReset();
  generateSessionSecretMock.mockImplementation(() => "new-session-secret-value");
  generateEncryptionKeyMock.mockReset();
  generateEncryptionKeyMock.mockImplementation(() => NEW_KEY_HEX);
  dbState.ready = true;
  dbState.pool = null;
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
  // Clear any divergence env values a test may have set so they
  // don't leak into the next case.
  delete process.env.SESSION_SECRET;
  delete process.env.ENCRYPTION_KEY;
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

// ─── (a) ENCRYPTED_COLUMN_MANIFEST round-trip ────────────────────
//
// Drives the regenerate handler with a stateful mock pool that
// returns one row per manifest table — every encrypted column
// populated with a placeholder ciphertext under the OLD key. The
// route walks the manifest, decrypts each value, re-encrypts under
// the NEW key, and emits one UPDATE per (table, column, id). We
// capture those UPDATE bind values and assert each one decrypts
// back to the original plaintext under the NEW key.
//
// The whole point: if the manifest gains a new (table, column)
// entry the test extends automatically; if a future code change
// breaks rotation for any one entry the test goes red rather than
// the failure surfacing at decrypt-time in production.

describe("POST /api/system/secrets/regenerate — ENCRYPTED_COLUMN_MANIFEST round-trip", () => {
  it("re-encrypts every column on every manifest table under the new key, end-to-end", async () => {
    const OLD_KEY =
      "22222222222222222222222222222222222222222222222222222222222222bb";

    sessionUser.current = {
      id: "admin-rotate",
      email: "rotate@example.com",
      role: "Admin",
    };
    // The host's process.env.ENCRYPTION_KEY (set by the dev shell)
    // would otherwise collide with our synthetic OLD_KEY and trip
    // the divergence guard. Clear both env vars so the route's
    // env-vs-file comparison sees no env-side override and falls
    // through to the rotation body.
    delete process.env.ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
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
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });

    // Stable plaintext per (table, column, id) so we can assert it
    // round-trips. Use a row id of "row-<table>" per spec to match
    // the SELECT/UPDATE pattern.
    const plaintextFor = (table: string, column: string) =>
      `plain:${table}:${column}`;

    // Pre-encrypt one row per table under OLD_KEY. The rows the
    // mock pool serves up to the SELECT in the rotation
    // transaction.
    const rowsByTable = new Map<string, Record<string, string>>();
    for (const spec of ENCRYPTED_COLUMN_MANIFEST) {
      const row: Record<string, string> = {
        [spec.idColumn]: `id-${spec.table}`,
      };
      for (const col of spec.columns) {
        row[col] = encryptWithKey(plaintextFor(spec.table, col), OLD_KEY);
      }
      rowsByTable.set(spec.table, row);
    }

    // Capture UPDATEs so we can decrypt them back at the end.
    const captured: Array<{
      table: string;
      column: string;
      id: string;
      newCipher: string;
    }> = [];
    let beginCount = 0;
    let commitCount = 0;
    let rollbackCount = 0;

    const fakePool = {
      query: async (sqlText: string, params?: unknown[]) => {
        // Pre-check: which manifest tables exist in the schema. We
        // claim every manifest table is present so the rotation
        // walks all of them.
        if (sqlText.includes("information_schema.tables")) {
          const want = (params?.[0] ?? []) as string[];
          return {
            rows: want.map((t) => ({ table_name: t })),
          };
        }
        throw new Error(`Unexpected pool.query: ${sqlText}`);
      },
      connect: async () => ({
        query: async (sqlText: string, params?: unknown[]) => {
          if (sqlText === "BEGIN") {
            beginCount++;
            return { rows: [] };
          }
          if (sqlText === "COMMIT") {
            commitCount++;
            return { rows: [] };
          }
          if (sqlText === "ROLLBACK") {
            rollbackCount++;
            return { rows: [] };
          }
          if (sqlText.includes("pg_try_advisory_xact_lock")) {
            return { rows: [{ acquired: true }] };
          }
          if (/^LOCK TABLE \w+ IN SHARE MODE$/.test(sqlText)) {
            return { rows: [] };
          }
          // SELECT <colList> FROM <table>
          const selectMatch = sqlText.match(/^SELECT (.+) FROM (\w+)$/);
          if (selectMatch) {
            const table = selectMatch[2];
            const row = rowsByTable.get(table);
            return { rows: row ? [row] : [] };
          }
          // UPDATE <table> SET <col> = $1 WHERE <idCol> = $2
          const updateMatch = sqlText.match(
            /^UPDATE (\w+) SET (\w+) = \$1 WHERE (\w+) = \$2$/,
          );
          if (updateMatch) {
            const table = updateMatch[1];
            const column = updateMatch[2];
            const newCipher = (params?.[0] ?? "") as string;
            const id = (params?.[1] ?? "") as string;
            captured.push({ table, column, id, newCipher });
            return { rows: [] };
          }
          throw new Error(`Unexpected client.query: ${sqlText}`);
        },
        release: () => {},
      }),
    };
    dbState.pool = fakePool;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postJson("/api/system/secrets/regenerate", {
      key: "ENCRYPTION_KEY",
      confirm: true,
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      key: "ENCRYPTION_KEY",
      value: NEW_KEY_HEX,
      source: "file",
    });

    // Transaction discipline: BEGIN, COMMIT, no ROLLBACK on the
    // happy path.
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);
    expect(rollbackCount).toBe(0);

    // Every (table, column) listed in the manifest must show up in
    // the captured UPDATEs exactly once. If a future manifest entry
    // ever gets dropped from the rotation walk, this assertion
    // fails immediately rather than waiting for a decrypt failure
    // in production.
    const expected = ENCRYPTED_COLUMN_MANIFEST.flatMap((s) =>
      s.columns.map((c) => `${s.table}.${c}`),
    ).sort();
    const actual = captured
      .map((u) => `${u.table}.${u.column}`)
      .sort();
    expect(actual).toEqual(expected);

    // The reencrypted-rows summary in the response body must
    // count every (table, column) in the manifest.
    const expectedRows = ENCRYPTED_COLUMN_MANIFEST.reduce(
      (acc, s) => acc + s.columns.length,
      0,
    );
    expect(res.body.reencrypted).toEqual({
      tables: ENCRYPTED_COLUMN_MANIFEST.length,
      rows: expectedRows,
    });

    // The load-bearing assertion: every captured UPDATE must
    // decrypt cleanly with the NEW key back to the original
    // plaintext. This is what proves the rotation actually
    // round-tripped each value end-to-end.
    for (const upd of captured) {
      const recovered = decryptWithKey(upd.newCipher, NEW_KEY_HEX);
      expect(recovered).toBe(plaintextFor(upd.table, upd.column));
      // Sanity: the captured cipher must NOT decrypt with the OLD
      // key — otherwise the route silently passed through the
      // ciphertext without re-encrypting.
      expect(() => decryptWithKey(upd.newCipher, OLD_KEY)).toThrow();
    }

    // The new key must have been persisted exactly once, AFTER
    // the COMMIT (we can't observe ordering directly here, but the
    // route's structure guarantees `setEncryptionKey` runs only on
    // the post-commit branch — see the route comment block).
    expect(setEncryptionKeyMock).toHaveBeenCalledTimes(1);
    expect(setEncryptionKeyMock).toHaveBeenCalledWith(NEW_KEY_HEX);

    logSpy.mockRestore();
  });
});

// ─── (b) Divergence guard — 409 env_file_divergence ───────────────

describe("env_file_divergence guard", () => {
  it("POST /api/system/secrets/reveal returns 409 errorCode env_file_divergence when env and file disagree", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    process.env.ENCRYPTION_KEY = "env-side-value";
    snapshotMock.mockReturnValueOnce({
      hasEncryptionKey: true,
      encryptionKeySource: "file",
      sessionSecretSource: "file",
      sessionSecretValue: "session-file-value",
      encryptionKeyValue: "file-side-value",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await postJson("/api/system/secrets/reveal", {
      key: "ENCRYPTION_KEY",
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      errorCode: "env_file_divergence",
      source: "file",
    });
    // The raw file value must NOT bleed out in the response on the
    // divergence path — the operator gets pointed at reconciliation
    // instead, and the response carries no `value` field.
    expect(res.body).not.toHaveProperty("value");
    expect(JSON.stringify(res.body)).not.toContain("file-side-value");
    // Audit line carrying the actor + reason must be emitted so
    // security can grep for divergence rejections in production
    // logs.
    const warnLines = warnSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/secrets:reveal]"));
    expect(
      warnLines.some(
        (line) =>
          line.includes("REJECTED") &&
          line.includes("user=admin-1") &&
          line.includes("env_file_divergence"),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("POST /api/system/secrets/regenerate returns 409 errorCode env_file_divergence when env and file disagree", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    process.env.SESSION_SECRET = "env-side-session";
    snapshotMock.mockReturnValueOnce({
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      sessionSecretValue: "file-side-session",
      encryptionKeyValue: "file-side-key",
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await postJson("/api/system/secrets/regenerate", {
      key: "SESSION_SECRET",
      confirm: true,
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      errorCode: "env_file_divergence",
      source: "file",
    });
    // Rotation must NOT have happened — neither persistence nor
    // generation of a fresh value should have been called once the
    // guard triggered.
    expect(setSessionSecretMock).not.toHaveBeenCalled();
    expect(generateSessionSecretMock).not.toHaveBeenCalled();
    const warnLines = warnSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/secrets:regenerate]"));
    expect(
      warnLines.some(
        (line) =>
          line.includes("REJECTED") &&
          line.includes("user=admin-1") &&
          line.includes("env_file_divergence"),
      ),
    ).toBe(true);
    warnSpy.mockRestore();
  });
});

// ─── (c) Regenerate refuses when source==='none' ─────────────────

describe("POST /api/system/secrets/regenerate — refuses when source==='none'", () => {
  it("returns 409 errorCode not_generated and never touches generate/persist when the secret has not been generated yet", async () => {
    sessionUser.current = { id: "admin-1", role: "Admin" };
    snapshotMock.mockReturnValueOnce({
      sessionSecretSource: "none",
      encryptionKeySource: "none",
      sessionSecretValue: undefined,
      encryptionKeyValue: undefined,
    });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const res = await postJson("/api/system/secrets/regenerate", {
      key: "ENCRYPTION_KEY",
      confirm: true,
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      errorCode: "not_generated",
      source: "none",
    });
    // Neither key generation nor persistence should fire on this
    // path — the whole point of the guard is to refuse rotation
    // when there is no current key to migrate from.
    expect(generateEncryptionKeyMock).not.toHaveBeenCalled();
    expect(setEncryptionKeyMock).not.toHaveBeenCalled();
    // No DB work should happen either: the route bails before
    // touching the pool.
    const auditLines = logSpy.mock.calls
      .map((c) => c.join(" "))
      .filter((line) => line.includes("[admin/secrets:regenerate]"));
    expect(
      auditLines.some(
        (line) =>
          line.includes("REJECTED") &&
          line.includes("user=admin-1") &&
          line.includes("not_generated"),
      ),
    ).toBe(true);
    logSpy.mockRestore();
  });
});

// ─── (d) Persist-after-apply failure — key in body, not in logs ──

describe("POST /api/system/secrets/regenerate — persist-after-apply failure", () => {
  it("returns 500 errorCode persist_after_apply_failed with the new key in the response body, but never logs the new key value", async () => {
    sessionUser.current = {
      id: "admin-1",
      email: "admin@example.com",
      role: "Admin",
    };
    const OLD_KEY =
      "33333333333333333333333333333333333333333333333333333333333333cc";
    // Same reasoning as the round-trip test: clear any host-set
    // env vars so the divergence guard doesn't fire and short-circuit
    // the path we're trying to exercise.
    delete process.env.ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    snapshotMock.mockReturnValue({
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      sessionSecretValue: undefined,
      encryptionKeyValue: OLD_KEY,
    });

    // Mock pool that succeeds at every step of the rotation
    // transaction so we reach the persist-after-apply branch. We
    // deliberately do NOT seed any rows — the manifest pre-check
    // returns no present tables, the body of the txn becomes a
    // straight BEGIN→advisory_lock→COMMIT, and the route then
    // proceeds to call setEncryptionKey, which we make throw to
    // exercise the failure path.
    let beginCount = 0;
    let commitCount = 0;
    const fakePool = {
      query: async (sqlText: string) => {
        if (sqlText.includes("information_schema.tables")) {
          // Return no present tables so the txn body is empty.
          return { rows: [] };
        }
        throw new Error(`Unexpected pool.query: ${sqlText}`);
      },
      connect: async () => ({
        query: async (sqlText: string) => {
          if (sqlText === "BEGIN") {
            beginCount++;
            return { rows: [] };
          }
          if (sqlText === "COMMIT") {
            commitCount++;
            return { rows: [] };
          }
          if (sqlText.includes("pg_try_advisory_xact_lock")) {
            return { rows: [{ acquired: true }] };
          }
          throw new Error(`Unexpected client.query: ${sqlText}`);
        },
        release: () => {},
      }),
    };
    dbState.pool = fakePool;

    setEncryptionKeyMock.mockImplementationOnce(() => {
      throw new Error("ENOSPC: no space left on device, write");
    });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await postJson("/api/system/secrets/regenerate", {
      key: "ENCRYPTION_KEY",
      confirm: true,
    });

    // The DB rotation reached COMMIT before the persist failure.
    expect(beginCount).toBe(1);
    expect(commitCount).toBe(1);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({
      errorCode: "persist_after_apply_failed",
      // The new key MUST be returned in the body so the operator
      // can stash it in their host secret manager — without it the
      // database is unreadable on the next restart.
      value: NEW_KEY_HEX,
    });

    // The CRITICAL audit line must be emitted, must carry the
    // actor, and must explicitly note that the new key was
    // redacted. It must NOT carry the actual key value.
    const allLogLines = [
      ...errSpy.mock.calls,
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
    ].map((c) => c.join(" "));
    const criticalLines = allLogLines.filter(
      (line) =>
        line.includes("[admin/secrets:regenerate]") &&
        line.includes("CRITICAL") &&
        line.includes("persist_after_apply"),
    );
    expect(criticalLines.length).toBeGreaterThan(0);
    expect(
      criticalLines.some(
        (line) =>
          line.includes("user=admin-1") &&
          line.includes("admin@example.com") &&
          line.includes("redacted"),
      ),
    ).toBe(true);

    // The load-bearing security assertion: the actual new key
    // value must NEVER appear in any log line written during this
    // request — it is a master encryption key and stdout/stderr
    // ship to journald/Dokploy/etc.
    for (const line of allLogLines) {
      expect(line).not.toContain(NEW_KEY_HEX);
    }

    errSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
