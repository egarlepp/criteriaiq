// @vitest-environment node
//
// Regression coverage for Task #744 — pins the boot-time
// "Bootstrap (initial install)" seeder (`seedBootstrapDbConnection`
// in `server/storage.ts`, originally added in Task #731) so the
// Database Connection panel never silently regresses back to a
// "No connections saved yet" state on host-env-managed deployments
// (Hostinger / Dokploy / etc.).
//
// The seeder has subtle correctness requirements that are easy to
// regress when nearby code changes. The scenarios below cover each
// correctness gate independently:
//
//   1. Fresh boot with `DATABASE_URL`, `ENCRYPTION_KEY`, and an
//      empty `data/db-config.json` — the seeder writes EXACTLY ONE
//      "Bootstrap (initial install)" row to the file AND, after
//      the boot wiring's `syncConnectionsToDb` mirror runs, exactly
//      one matching row lands in the `db_connections` table. A
//      second boot is a no-op (no duplicate file row, no duplicate
//      table row).
//   2. ENCRYPTION_KEY missing — the seeder logs a skip and refuses
//      to write a plaintext URL into the file. (Persisting an
//      unencrypted URL would make the row un-decryptable once the
//      key is rotated in via the Reconfigure mode wizard.)
//   3. Wizard Phase 5 already seeded the file — when an existing
//      file record decrypts back to the resolved URL, the seeder
//      is a no-op (no duplicate row in either store, addConnection
//      is never called).
//
// The dependencies (`../db-bootstrap` for the file store and
// `../db` for the `db_connections` table) are mocked with small
// in-memory fakes so the contract under test is the seeder's
// orchestration logic, not Postgres I/O. Each test resets the
// fakes via `beforeEach` so cases stay isolated.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// db-bootstrap fake — backs the "file" half of the contract.
//
// Both fakes (db-bootstrap state + storage.db state) are wrapped
// in `vi.hoisted` so the `vi.mock(...)` factories below — which
// vitest hoists to the top of the file BEFORE any other top-level
// code runs — can safely reference them without tripping the
// "Cannot access X before initialization" guard rail.
// ---------------------------------------------------------------------------

interface FakeFileRecord {
  id: string;
  name: string;
  connectionUrl: string;
  branch: "production" | "staging" | "development";
  isSystem: boolean;
  isDefault: boolean;
  notes: string | null;
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  lastTestLatencyMs: number | null;
  createdAt: string;
  updatedAt: string;
}

interface FakeTableRow {
  id: number;
  name: string;
  connectionUrl: string;
  branch: string;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  notes: string | null;
  lastTestedAt: Date | null;
  lastTestSuccess: boolean | null;
  lastTestLatencyMs: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const hoisted = vi.hoisted(() => {
  const dbBootstrapState: {
    encryptionKeyPresent: boolean;
    resolved: { url: string | null; source: "file" | "env" | "none" };
    connections: FakeFileRecord[];
    activeConnectionId: string | null;
  } = {
    encryptionKeyPresent: true,
    resolved: { url: "postgresql://example/test", source: "env" },
    connections: [],
    activeConnectionId: null,
  };
  const dbBootstrapSpies = {
    addConnection: vi.fn(),
    setActiveConnectionId: vi.fn(),
    encryptConnectionUrl: vi.fn(),
  };
  const tableState: { rows: FakeTableRow[]; nextId: number } = {
    rows: [],
    nextId: 1,
  };
  const eqState: { lastValue: unknown } = { lastValue: null };
  return { dbBootstrapState, dbBootstrapSpies, tableState, eqState };
});

const { dbBootstrapState, dbBootstrapSpies, tableState, eqState } = hoisted;

// Encrypted form is just a sentinel-prefixed copy of the plaintext —
// the seeder treats `encryptConnectionUrl` / `decryptConnectionUrl`
// as opaque, so a deterministic prefix is enough to verify
// "decrypts back to the resolved URL" matches without dragging in
// real AES-GCM. The Phase-5-already-seeded test swaps in a
// pre-seeded file record using the same wire format so the
// seeder's `decryptConnectionUrl(rec) === resolved.url` check
// fires identically to production.
const ENCRYPTION_PREFIX = "enc:";

vi.mock("../db-bootstrap", () => {
  const { dbBootstrapState, dbBootstrapSpies } = hoisted;
  // Inline the prefix here too so the factory does not depend on
  // a top-level binding that hoisting may not have evaluated yet.
  const PREFIX = "enc:";
  return {
    readConnections: () => ({
      connections: dbBootstrapState.connections.map((c) => ({ ...c })),
      activeConnectionId: dbBootstrapState.activeConnectionId,
      pendingActiveConnectionId: null,
      previousActiveUrl: null,
    }),
    addConnection: (input: {
      name: string;
      encryptedUrl: string;
      branch: FakeFileRecord["branch"];
      notes?: string | null;
      isSystem?: boolean;
      isDefault?: boolean;
    }) => {
      dbBootstrapSpies.addConnection(input);
      const ts = new Date().toISOString();
      const id = input.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const record: FakeFileRecord = {
        id,
        name: input.name.trim(),
        connectionUrl: input.encryptedUrl,
        branch: input.branch,
        isSystem: !!input.isSystem,
        isDefault: !!input.isDefault,
        notes: input.notes ?? null,
        lastTestedAt: null,
        lastTestSuccess: null,
        lastTestLatencyMs: null,
        createdAt: ts,
        updatedAt: ts,
      };
      dbBootstrapState.connections.push(record);
      return record;
    },
    setActiveConnectionId: (id: string | null) => {
      dbBootstrapSpies.setActiveConnectionId(id);
      dbBootstrapState.activeConnectionId = id;
    },
    encryptConnectionUrl: (plaintext: string) => {
      dbBootstrapSpies.encryptConnectionUrl(plaintext);
      return `${PREFIX}${plaintext}`;
    },
    decryptConnectionUrl: (rec: { connectionUrl: string }) => {
      if (!dbBootstrapState.encryptionKeyPresent) return "";
      if (rec.connectionUrl.startsWith(PREFIX)) {
        return rec.connectionUrl.slice(PREFIX.length);
      }
      return "";
    },
    resolveConnectionUrl: () => dbBootstrapState.resolved,
    ALLOWED_BRANCHES: ["production", "staging", "development"] as const,
  };
});

// ---------------------------------------------------------------------------
// `../db` fake — backs the `db_connections` table half of the
// contract. We only need to support the operations
// `syncConnectionsToDb` actually issues (select / insert / update;
// delete is exercised separately for orphan-row paths and is not
// expected on any of the 4 boot scenarios this suite covers, so we
// throw if it fires unexpectedly to surface regressions loudly).
// ---------------------------------------------------------------------------

vi.mock("drizzle-orm", async () => {
  // Preserve the real drizzle-orm surface (sql, and, or, etc) so
  // schema definitions and the rest of the storage module's query
  // helpers keep working — only intercept `eq` so the chainable
  // table mock can recover the right-hand-side value the
  // sync helper passes (e.g. `eq(schema.dbConnections.id, row.id)`).
  const actual = await vi.importActual<typeof import("drizzle-orm")>(
    "drizzle-orm",
  );
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => {
      hoisted.eqState.lastValue = val;
      return actual.eq(col as never, val as never);
    },
  };
});

vi.mock("../db", () => {
  const { tableState, eqState } = hoisted;
  const fakeDb = {
    select: () => ({
      from: async () => tableState.rows.map((r) => ({ ...r })),
    }),
    insert: () => ({
      values: async (vals: Partial<FakeTableRow>) => {
        tableState.rows.push({
          id: tableState.nextId++,
          // Defaults match the column shape sync inserts. Sync
          // always supplies every field, so this spread is mainly
          // defensive — guards against a future call site that
          // forgets to set, say, `isActive`.
          name: "",
          connectionUrl: "",
          branch: "production",
          isActive: false,
          isDefault: false,
          isSystem: false,
          notes: null,
          lastTestedAt: null,
          lastTestSuccess: null,
          lastTestLatencyMs: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...(vals as FakeTableRow),
        });
      },
    }),
    update: () => {
      let pendingFields: Partial<FakeTableRow> = {};
      return {
        set(fields: Partial<FakeTableRow>) {
          pendingFields = fields;
          const thenable = {
            where: async () => {
              const targetId = eqState.lastValue;
              const row = tableState.rows.find((r) => r.id === targetId);
              if (row) Object.assign(row, pendingFields);
            },
            // Sync's "clear active flags" branch calls `.set(...)`
            // without a `.where(...)` and awaits the result. We don't
            // exercise that helper here, but supporting the no-where
            // form keeps the mock honest if a future test re-uses this
            // fake.
            then: (resolve: (v: unknown) => unknown) => {
              for (const r of tableState.rows) Object.assign(r, pendingFields);
              return Promise.resolve().then(resolve);
            },
          } as PromiseLike<void> & { where: (cond?: unknown) => Promise<void> };
          return thenable;
        },
      };
    },
    delete: () => ({
      where: async () => {
        // None of the scenarios in this suite should leave an
        // orphaned table row. If a future regression starts deleting
        // (e.g. seeder + sync clobbering the install row on every
        // boot), surface it loudly instead of silently passing.
        throw new Error(
          "Unexpected delete on db_connections — boot path should be idempotent",
        );
      },
    }),
  };
  return {
    db: fakeDb,
    pool: null,
    dbReady: true,
  };
});

// Pull the seeders AFTER the mocks are registered. `seedBootstrapDbConnection`
// dynamically imports `../db-bootstrap`, so vi's hoisted mock applies.
// `syncConnectionsToDb` reads `storage.db` synchronously, which resolves to
// the mocked `fakeDb` above via the `../db` mock.
import {
  seedBootstrapDbConnection,
  syncConnectionsToDb,
} from "../storage";

function resetFakes() {
  dbBootstrapState.encryptionKeyPresent = true;
  dbBootstrapState.resolved = {
    url: "postgresql://example/test",
    source: "env",
  };
  dbBootstrapState.connections = [];
  dbBootstrapState.activeConnectionId = null;
  dbBootstrapSpies.addConnection.mockClear();
  dbBootstrapSpies.setActiveConnectionId.mockClear();
  dbBootstrapSpies.encryptConnectionUrl.mockClear();
  tableState.rows = [];
  tableState.nextId = 1;
  eqState.lastValue = null;
}

let envBackup: { encryptionKey: string | undefined };

beforeEach(() => {
  resetFakes();
  envBackup = { encryptionKey: process.env.ENCRYPTION_KEY };
  // The seeder gates on `process.env.ENCRYPTION_KEY` (presence,
  // not value) before calling encryptConnectionUrl. Force a known
  // value here so the four scenarios can independently flip the
  // env state via beforeEach overrides.
  process.env.ENCRYPTION_KEY = "0".repeat(64);
});

afterEach(() => {
  if (envBackup.encryptionKey === undefined) {
    delete process.env.ENCRYPTION_KEY;
  } else {
    process.env.ENCRYPTION_KEY = envBackup.encryptionKey;
  }
});

const BOOTSTRAP_NAME = "Bootstrap (initial install)";

describe("seedBootstrapDbConnection (Task #744)", () => {
  it("seeds exactly one row into the file AND the db_connections table on a fresh boot, idempotent across boots", async () => {
    // Scenario: Hostinger / Dokploy first boot. ENCRYPTION_KEY is
    // present, DATABASE_URL is the resolved URL, file is empty.
    // After the boot wiring (`seedBootstrapDbConnection` then
    // `syncConnectionsToDb`) the operator should see exactly ONE
    // row labeled "Bootstrap (initial install)" in the file AND
    // exactly ONE matching row in the table.
    await seedBootstrapDbConnection();
    await syncConnectionsToDb();

    // File side: one row, marked active, isSystem + isDefault, branch=production.
    expect(dbBootstrapSpies.addConnection).toHaveBeenCalledTimes(1);
    expect(dbBootstrapSpies.addConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        name: BOOTSTRAP_NAME,
        branch: "production",
        isSystem: true,
        isDefault: true,
        // Encrypted form must be a non-empty ciphertext (NOT the
        // plaintext URL) — guards against a future refactor that
        // accidentally drops the encryptConnectionUrl call.
        encryptedUrl: expect.stringContaining(ENCRYPTION_PREFIX),
      }),
    );
    expect(dbBootstrapSpies.setActiveConnectionId).toHaveBeenCalledTimes(1);
    expect(dbBootstrapState.connections).toHaveLength(1);
    expect(dbBootstrapState.connections[0].name).toBe(BOOTSTRAP_NAME);
    expect(dbBootstrapState.activeConnectionId).toBe(
      dbBootstrapState.connections[0].id,
    );

    // Table side: one row, name+isSystem+isDefault+isActive all set
    // by the sync mirror. Connection URL round-trips the encrypted
    // value through unchanged (sync does not re-encrypt).
    expect(tableState.rows).toHaveLength(1);
    expect(tableState.rows[0]).toMatchObject({
      name: BOOTSTRAP_NAME,
      branch: "production",
      isActive: true,
      isDefault: true,
      isSystem: true,
      connectionUrl: dbBootstrapState.connections[0].connectionUrl,
    });

    // Second boot: the file's matching record short-circuits the
    // seeder, and sync re-syncs by-name (UPDATE in place — no
    // duplicate row). The total counts stay at 1 in both stores.
    dbBootstrapSpies.addConnection.mockClear();
    dbBootstrapSpies.setActiveConnectionId.mockClear();
    await seedBootstrapDbConnection();
    await syncConnectionsToDb();

    expect(dbBootstrapSpies.addConnection).not.toHaveBeenCalled();
    expect(dbBootstrapSpies.setActiveConnectionId).not.toHaveBeenCalled();
    expect(dbBootstrapState.connections).toHaveLength(1);
    expect(tableState.rows).toHaveLength(1);
    expect(tableState.rows[0].name).toBe(BOOTSTRAP_NAME);
  });

  it("logs a skip and refuses to write a plaintext URL when ENCRYPTION_KEY is missing", async () => {
    // Scenario: an operator deployed without setting
    // ENCRYPTION_KEY. The seeder must NOT persist the URL in
    // plaintext — once the key is rotated in via the Reconfigure
    // wizard, an un-encryptable file row would either be lost or
    // mis-decrypted at next boot, resilvering into a
    // hard-to-recover state. The recovery path is "operator opens
    // the modal and saves manually", which lazy-generates the key.
    delete process.env.ENCRYPTION_KEY;

    const originalLog = console.log;
    const originalError = console.error;
    const logCalls: unknown[][] = [];
    const errorCalls: unknown[][] = [];
    console.log = (...args: unknown[]) => {
      logCalls.push(args);
    };
    console.error = (...args: unknown[]) => {
      errorCalls.push(args);
    };
    try {
      await seedBootstrapDbConnection();
    } finally {
      console.log = originalLog;
      console.error = originalError;
    }
    // The seeder swallows unexpected throws via its outer try/catch
    // and reports them through console.error; assert nothing leaked
    // into that path so the test failure mode is unambiguous (the
    // ENCRYPTION_KEY guard fires, not some upstream import error).
    expect(errorCalls).toEqual([]);

    expect(dbBootstrapSpies.addConnection).not.toHaveBeenCalled();
    expect(dbBootstrapSpies.setActiveConnectionId).not.toHaveBeenCalled();
    expect(dbBootstrapSpies.encryptConnectionUrl).not.toHaveBeenCalled();
    expect(dbBootstrapState.connections).toHaveLength(0);
    // The skip is observable via stdout — operators rely on this
    // log line to debug "panel still empty after deploy" reports.
    const sawSkipLog = logCalls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" && arg.includes("ENCRYPTION_KEY not yet available"),
      ),
    );
    expect(sawSkipLog).toBe(true);
  });

  it("is a no-op when an existing file record already decrypts to the resolved URL (wizard Phase 5 idempotency)", async () => {
    // Scenario: the setup wizard's Phase 4 already wrote
    // `data/db-config.json` with a "Bootstrap (initial install)"
    // row pointing at the same URL `resolveConnectionUrl()`
    // returns. (Phase 5 then mirrored a matching row into
    // db_connections.) On the very next boot, the seeder's
    // file-match guard MUST fire so it does not re-add the row
    // (which would then push sync into UPDATE-in-place rather
    // than skip-entirely, risking a duplicated row if a future
    // refactor weakens the by-name match).
    const ts = new Date().toISOString();
    const preSeeded: FakeFileRecord = {
      id: "bootstrap-initial-install",
      name: BOOTSTRAP_NAME,
      connectionUrl: `${ENCRYPTION_PREFIX}${dbBootstrapState.resolved.url}`,
      branch: "production",
      isSystem: true,
      isDefault: true,
      notes: "wizard Phase 4",
      lastTestedAt: null,
      lastTestSuccess: null,
      lastTestLatencyMs: null,
      createdAt: ts,
      updatedAt: ts,
    };
    dbBootstrapState.connections.push(preSeeded);
    dbBootstrapState.activeConnectionId = preSeeded.id;

    // Pre-existing table row from wizard Phase 5.
    tableState.rows.push({
      id: tableState.nextId++,
      name: BOOTSTRAP_NAME,
      connectionUrl: preSeeded.connectionUrl,
      branch: "production",
      isActive: true,
      isDefault: true,
      isSystem: true,
      notes: "wizard Phase 5",
      lastTestedAt: null,
      lastTestSuccess: null,
      lastTestLatencyMs: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await seedBootstrapDbConnection();
    await syncConnectionsToDb();

    // Seeder bailed before touching anything.
    expect(dbBootstrapSpies.addConnection).not.toHaveBeenCalled();
    expect(dbBootstrapSpies.setActiveConnectionId).not.toHaveBeenCalled();
    expect(dbBootstrapSpies.encryptConnectionUrl).not.toHaveBeenCalled();

    // No duplicate file row, no duplicate table row — the wizard's
    // pre-existing row is still the only "Bootstrap (initial
    // install)" entry in either store.
    expect(dbBootstrapState.connections).toHaveLength(1);
    expect(dbBootstrapState.connections[0].id).toBe("bootstrap-initial-install");
    expect(tableState.rows).toHaveLength(1);
    expect(tableState.rows[0].name).toBe(BOOTSTRAP_NAME);
  });
});
