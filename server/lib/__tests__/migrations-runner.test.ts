// @vitest-environment node
//
// Unit coverage for `migrations-runner` covering both:
//
//   - Task #394: structured failure path in `runPendingMigrations`
//     (filename / SQLSTATE / raw driver message survive on typed
//     fields of `MigrationFailedError` so server/index.ts can log
//     them structurally without re-parsing free-text).
//   - Task #391: the filename → description heuristic and the
//     `getSchemaMigrationsReport` cross-reference that powers the
//     admin UI.
//
// Both suites swap out the migrations directory via a `process.cwd()`
// stub (vitest workers prohibit `process.chdir`) and stub the pg `Pool`
// interface with a hand-rolled fake so we don't touch the network.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MigrationFailedError,
  MigrationLockUnavailableError,
  PENDING_MIGRATION_PREVIEW_LINES,
  RECENT_AUDIT_EVENTS_LIMIT,
  buildPendingMigrationDetail,
  describeMigrationFilename,
  extractSqlHeaderDescription,
  getRecentSchemaMigrationAuditEvents,
  getSchemaMigrationsReport,
  getSchemaMigrationsSummary,
  listKnownMigrationFiles,
  runPendingMigrations,
  withMigrationAdvisoryLock,
} from "../migrations-runner";

let tmpDir = "";
let cwdSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-test-"));
  fs.mkdirSync(path.join(tmpDir, "migrations"), { recursive: true });
  // `runPendingMigrations` and `getSchemaMigrationsReport` resolve
  // their dir via `process.cwd()`, but vitest workers prohibit
  // `process.chdir`. Stubbing cwd is the documented workaround and
  // gives us per-test isolation without mutating shared global state.
  cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
});

afterEach(() => {
  if (cwdSpy) {
    cwdSpy.mockRestore();
    cwdSpy = null;
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

interface FakeQueryFn {
  (sql: string | { text?: string }, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface QueryRecord {
  sql: string;
  params?: unknown[];
}

function buildPool(opts: {
  /** Triggered by the actual SQL file body (not BEGIN/COMMIT/etc). Throw to simulate failure. */
  onApply?: (sql: string) => void;
  /** Optional applied-list pre-seed. */
  applied?: Array<{ filename: string; checksum: string }>;
} = {}) {
  const calls: string[] = [];
  const records: QueryRecord[] = [];
  const fakeClient = {
    query: ((sql: string | { text?: string }, params?: unknown[]) => {
      const raw = typeof sql === "string" ? sql : sql.text ?? "";
      const text = raw.trim();
      calls.push(text);
      records.push({ sql: text, params });
      // Pre-seed: respond to the applied-list SELECT
      if (/from "schema_migrations"\s*$/i.test(text) || /^select.*from "schema_migrations"/i.test(text)) {
        return Promise.resolve({ rows: opts.applied ?? [] });
      }
      // Schema-bootstrap CREATE TABLE / BEGIN / COMMIT / ROLLBACK / INSERT — no-ops
      if (
        /^create table if not exists/i.test(text) ||
        /^create index if not exists/i.test(text) ||
        /^begin\b/i.test(text) ||
        /^commit\b/i.test(text) ||
        /^rollback\b/i.test(text) ||
        /^insert into "schema_migrations"/i.test(text) ||
        /^insert into "schema_migration_audit"/i.test(text)
      ) {
        return Promise.resolve({ rows: [] });
      }
      // Otherwise this is the migration body itself — let the test
      // decide whether to throw.
      if (opts.onApply) opts.onApply(text);
      return Promise.resolve({ rows: [] });
    }) as FakeQueryFn,
    release: () => {},
  };
  return {
    connect: async () => fakeClient,
    calls,
    records,
    // shape-matching the bits runPendingMigrations actually calls
  } as unknown as Parameters<typeof runPendingMigrations>[0] & {
    calls: string[];
    records: QueryRecord[];
  };
}

describe("MigrationFailedError shape", () => {
  it("captures filename, SQLSTATE, and the raw driver message", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "023_add_foo_index.sql"),
      "ALTER TABLE foo ADD COLUMN bar text;\n",
      "utf8",
    );

    const pool = buildPool({
      onApply: () => {
        // Simulate a `pg.DatabaseError` — has .code = SQLSTATE and a message.
        const err: Error & { code?: string } = new Error(
          'column "foo" does not exist',
        );
        err.code = "42703";
        throw err;
      },
    });

    await expect(runPendingMigrations(pool)).rejects.toBeInstanceOf(
      MigrationFailedError,
    );

    try {
      await runPendingMigrations(pool);
    } catch (err) {
      expect(err).toBeInstanceOf(MigrationFailedError);
      const m = err as MigrationFailedError;
      expect(m.filename).toBe("023_add_foo_index.sql");
      expect(m.sqlState).toBe("42703");
      expect(m.originalMessage).toBe('column "foo" does not exist');
      // The wrapper message preserves the legacy "rolled back" prefix
      // so existing log scrapes / dashboards keep matching.
      expect(m.message).toContain("023_add_foo_index.sql");
      expect(m.message).toContain("rolled back");
    }
  });

  it("normalises a non-pg error (no .code) to sqlState=null", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "024_misc.sql"),
      "SELECT 1;\n",
      "utf8",
    );
    const pool = buildPool({
      onApply: () => {
        throw new Error("network blip");
      },
    });

    try {
      await runPendingMigrations(pool);
      expect.fail("expected MigrationFailedError");
    } catch (err) {
      const m = err as MigrationFailedError;
      expect(m).toBeInstanceOf(MigrationFailedError);
      expect(m.filename).toBe("024_misc.sql");
      expect(m.sqlState).toBeNull();
      expect(m.originalMessage).toBe("network blip");
    }
  });

  it("does not record failure for already-applied migrations (skipped path)", async () => {
    // Sanity check: the throw-path only fires for unapplied files. An
    // already-applied entry should be a quiet skip, not an error.
    const sqlBody = "SELECT 1;\n";
    const fname = "025_already.sql";
    fs.writeFileSync(path.join(tmpDir, "migrations", fname), sqlBody, "utf8");
    // Pre-compute the checksum the runner uses so the row matches.
    const crypto = await import("node:crypto");
    const checksum = crypto
      .createHash("sha256")
      .update(sqlBody, "utf8")
      .digest("hex");
    const pool = buildPool({
      applied: [{ filename: fname, checksum }],
      onApply: () => {
        throw new Error("should not be applied");
      },
    });
    const result = await runPendingMigrations(pool);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toEqual([fname]);
  });
});

describe("extractSqlHeaderDescription (Task #435)", () => {
  it("returns the body of a leading single-line `--` comment", () => {
    const sql =
      "-- Add account_ids column to links table for customer portal visibility control\n" +
      "ALTER TABLE links ADD COLUMN IF NOT EXISTS account_ids integer[];\n";
    expect(extractSqlHeaderDescription(sql)).toBe(
      "Add account_ids column to links table for customer portal visibility control",
    );
  });

  it("skips leading blank lines before locating the comment", () => {
    const sql = "\n\n-- Backfill missing slugs\nUPDATE foo SET slug = bar;\n";
    expect(extractSqlHeaderDescription(sql)).toBe("Backfill missing slugs");
  });

  it("strips multi-dash comment markers (`---`)", () => {
    expect(extractSqlHeaderDescription("--- Drop legacy column\n")).toBe(
      "Drop legacy column",
    );
  });

  it("returns null when the file opens with a SQL statement instead of a comment", () => {
    expect(
      extractSqlHeaderDescription("CREATE TABLE foo (id serial PRIMARY KEY);"),
    ).toBeNull();
  });

  it("returns null for an empty `--` comment body", () => {
    expect(extractSqlHeaderDescription("--\nSELECT 1;\n")).toBeNull();
  });
});

describe("buildPendingMigrationDetail (Task #435)", () => {
  function writePending(name: string, body: string): string {
    const dir = path.join(tmpDir, "migrations");
    fs.writeFileSync(path.join(dir, name), body, "utf8");
    return dir;
  }

  it("prefers the SQL header comment over the filename heuristic", () => {
    const dir = writePending(
      "030_add_links_account_ids.sql",
      "-- Add account_ids column to links table for customer portal visibility control\n" +
        "ALTER TABLE links ADD COLUMN IF NOT EXISTS account_ids integer[];\n",
    );
    const detail = buildPendingMigrationDetail(dir, "030_add_links_account_ids.sql");
    expect(detail.filename).toBe("030_add_links_account_ids.sql");
    expect(detail.description).toBe(
      "Add account_ids column to links table for customer portal visibility control",
    );
    expect(detail.previewLines.length).toBeGreaterThan(0);
    expect(detail.previewTruncated).toBe(false);
  });

  it("falls back to the filename heuristic when the file lacks a header comment", () => {
    const dir = writePending(
      "031_followup_upgrade.sql",
      "CREATE INDEX idx_foo ON foo (bar);\n",
    );
    const detail = buildPendingMigrationDetail(dir, "031_followup_upgrade.sql");
    expect(detail.description).toBe("Followup upgrade");
  });

  it(`caps the preview at ${PENDING_MIGRATION_PREVIEW_LINES} lines and flags truncation`, () => {
    const longBody =
      Array.from({ length: PENDING_MIGRATION_PREVIEW_LINES + 5 }, (_, i) =>
        `SELECT ${i + 1};`,
      ).join("\n") + "\n";
    const dir = writePending("032_long_migration.sql", longBody);
    const detail = buildPendingMigrationDetail(dir, "032_long_migration.sql");
    expect(detail.previewLines).toHaveLength(PENDING_MIGRATION_PREVIEW_LINES);
    expect(detail.previewLines[0]).toBe("SELECT 1;");
    expect(detail.previewTruncated).toBe(true);
  });

  it("does not flag truncation for a file that ends with a single trailing newline", () => {
    const body =
      Array.from({ length: PENDING_MIGRATION_PREVIEW_LINES }, (_, i) => `SELECT ${i + 1};`).join(
        "\n",
      ) + "\n";
    const dir = writePending("033_exact.sql", body);
    const detail = buildPendingMigrationDetail(dir, "033_exact.sql");
    expect(detail.previewLines).toHaveLength(PENDING_MIGRATION_PREVIEW_LINES);
    expect(detail.previewTruncated).toBe(false);
  });

  it("returns a description-only entry when the file is unreadable", () => {
    const dir = path.join(tmpDir, "migrations");
    const detail = buildPendingMigrationDetail(dir, "034_missing.sql");
    expect(detail).toEqual({
      filename: "034_missing.sql",
      description: "Missing",
      previewLines: [],
      previewTruncated: false,
    });
  });
});

describe("schema_migration_audit writes (Task #429)", () => {
  function findAuditInsert(records: QueryRecord[]) {
    return records.find((r) =>
      /^insert into "schema_migration_audit"/i.test(r.sql),
    );
  }

  it("writes a success row inside the per-file transaction when an actor is supplied", async () => {
    const sqlBody = "CREATE TABLE foo ();\n";
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "040_audit_success.sql"),
      sqlBody,
      "utf8",
    );
    const pool = buildPool();
    const result = await runPendingMigrations(pool, {
      auditActor: { userId: "admin-1", userEmail: "admin@example.com" },
    });

    expect(result.applied).toEqual(["040_audit_success.sql"]);

    const auditInsert = findAuditInsert(pool.records);
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.params).toEqual([
      "040_audit_success.sql",
      "admin-1",
      "admin@example.com",
    ]);

    const idx = pool.records.findIndex(
      (r) => r === auditInsert,
    );
    const beginIdx = pool.records
      .slice(0, idx)
      .reverse()
      .findIndex((r) => /^begin\b/i.test(r.sql));
    const commitAfter = pool.records
      .slice(idx)
      .findIndex((r) => /^commit\b/i.test(r.sql));
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(commitAfter).toBeGreaterThanOrEqual(0);
  });

  it("does NOT write any audit rows when no actor is supplied (boot path)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "041_boot_no_actor.sql"),
      "SELECT 1;\n",
      "utf8",
    );
    const pool = buildPool();
    const result = await runPendingMigrations(pool);
    expect(result.applied).toEqual(["041_boot_no_actor.sql"]);
    expect(findAuditInsert(pool.records)).toBeUndefined();
  });

  it("writes a failure row (success=false, error_message + sqlState) when a migration fails with an actor", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "042_audit_failure.sql"),
      "ALTER TABLE foo ADD COLUMN bar text;\n",
      "utf8",
    );
    const pool = buildPool({
      onApply: () => {
        const err: Error & { code?: string } = new Error("column \"foo\" does not exist");
        err.code = "42703";
        throw err;
      },
    });

    await expect(
      runPendingMigrations(pool, {
        auditActor: { userId: "admin-9", userEmail: "admin9@example.com" },
      }),
    ).rejects.toBeInstanceOf(MigrationFailedError);

    const auditInsert = findAuditInsert(pool.records);
    expect(auditInsert).toBeDefined();
    expect(auditInsert!.sql).toMatch(/error_message/i);
    expect(auditInsert!.params).toEqual([
      "042_audit_failure.sql",
      "admin-9",
      "admin9@example.com",
      "column \"foo\" does not exist",
      "42703",
    ]);
  });

  it("does NOT write any audit rows on failure when no actor is supplied (boot path)", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "migrations", "043_boot_failure.sql"),
      "SELECT 1;\n",
      "utf8",
    );
    const pool = buildPool({
      onApply: () => {
        throw new Error("boom");
      },
    });
    await expect(runPendingMigrations(pool)).rejects.toBeInstanceOf(
      MigrationFailedError,
    );
    expect(findAuditInsert(pool.records)).toBeUndefined();
  });
});

describe('describeMigrationFilename', () => {
  it('strips the numeric prefix and snake-case tokens', () => {
    expect(
      describeMigrationFilename('001_migrate_end_date_flags_colors.sql'),
    ).toBe('Migrate end date flags colors');
  });

  it('handles the legacy hyphenated `019-` prefix', () => {
    expect(
      describeMigrationFilename('019-add-customer-competitor-relationship.sql'),
    ).toBe('Add customer competitor relationship');
  });

  it('returns a usable string when no description tokens are present', () => {
    expect(describeMigrationFilename('123_.sql')).toBe('123_');
  });
});

interface FakeReportClient {
  released: boolean;
  queries: string[];
  release: () => void;
  query: (sql: string) => Promise<{ rows: unknown[] }>;
}

interface FakeReportPool {
  connect: () => Promise<FakeReportClient>;
}

interface FakeAuditRow {
  id: number;
  filename: string;
  user_id: string | null;
  user_email: string | null;
  success: boolean;
  error_message: string | null;
  sql_state: string | null;
  applied_at: Date | string;
}

function buildReportPool(
  rows: Array<{ filename: string; checksum: string; applied_at: Date | string }>,
  opts: { auditRows?: FakeAuditRow[] } = {},
): {
  pool: FakeReportPool;
  client: FakeReportClient;
} {
  const auditRows = opts.auditRows ?? [];
  const client: FakeReportClient = {
    released: false,
    queries: [],
    release() {
      this.released = true;
    },
    async query(sql: string) {
      this.queries.push(sql);
      // Two SELECTs are issued by the report helper as of Task #429:
      // one against `schema_migrations` and one against
      // `schema_migration_audit`. Differentiate by table name so each
      // returns its own row shape — sharing the same `rows` array
      // would feed schema_migrations rows into the audit mapper and
      // produce undefined fields.
      if (/from\s+"?schema_migration_audit"?/i.test(sql)) {
        return { rows: auditRows };
      }
      if (/SELECT/i.test(sql)) {
        return { rows };
      }
      return { rows: [] };
    },
  };
  return {
    pool: { async connect() { return client; } },
    client,
  };
}

describe('getSchemaMigrationsReport', () => {
  function writeMigration(name: string, body = '-- noop'): void {
    fs.writeFileSync(path.join(tmpDir, 'migrations', name), body, 'utf8');
  }

  it('lists known migration files that match the runner pattern', () => {
    writeMigration('001_first.sql');
    writeMigration('002_second.sql');
    writeMigration('not-a-migration.sql');
    writeMigration('backup.sql');

    expect(listKnownMigrationFiles()).toEqual([
      '001_first.sql',
      '002_second.sql',
    ]);
  });

  it('groups DB rows into applied / missing / unknown using the on-disk listing', async () => {
    writeMigration('001_first.sql');
    writeMigration('002_second.sql');
    // No leading `--` comment so the description falls back to the
    // human-readable filename heuristic ("Third"), exercising both
    // branches of `buildPendingMigrationDetail`.
    writeMigration('003_third.sql', 'SELECT 1;\n'); // present on disk, NOT yet applied

    const appliedAt = new Date('2025-03-01T12:00:00Z');
    const { pool, client } = buildReportPool([
      { filename: '001_first.sql', checksum: 'c1', applied_at: appliedAt },
      { filename: '002_second.sql', checksum: 'c2', applied_at: appliedAt },
      // Recorded in the DB but the source file is gone — should land
      // in `unknown`.
      { filename: '999_ghost.sql', checksum: 'c9', applied_at: appliedAt },
    ]);

    const report = await getSchemaMigrationsReport(pool as never);

    expect(report.applied.map((a) => a.filename)).toEqual([
      '001_first.sql',
      '002_second.sql',
      '999_ghost.sql',
    ]);
    expect(report.applied[0]).toMatchObject({
      filename: '001_first.sql',
      checksum: 'c1',
      description: 'First',
      appliedAt: appliedAt.toISOString(),
    });
    // `missing` is now PendingMigrationDetail[] (Task #435) — assert
    // the filenames and that each entry carries the description /
    // preview metadata the Apply confirmation dialog renders.
    expect(report.missing.map((m) => m.filename)).toEqual(['003_third.sql']);
    expect(report.missing[0]).toMatchObject({
      filename: '003_third.sql',
      description: 'Third',
      previewTruncated: false,
    });
    expect(Array.isArray(report.missing[0].previewLines)).toBe(true);
    expect(report.unknown).toEqual(['999_ghost.sql']);
    // No audit rows pre-seeded — the report should default to an
    // empty list so the UI can render its empty state.
    expect(report.recentAuditEvents).toEqual([]);
    // The pooled client must always be released, even on the happy
    // path — otherwise a long-running app would slowly leak
    // connections every time an admin opens the dashboard.
    expect(client.released).toBe(true);
  });

  it('returns an empty report when nothing has ever been applied', async () => {
    const { pool, client } = buildReportPool([]);

    const report = await getSchemaMigrationsReport(pool as never);

    expect(report).toEqual({
      applied: [],
      missing: [],
      unknown: [],
      recentAuditEvents: [],
    });
    expect(client.released).toBe(true);
    // Expect at least the CREATE TABLE IF NOT EXISTS guard to have run
    // so the endpoint never returns "relation does not exist" on a
    // brand-new database.
    expect(client.queries.some((q) => /CREATE TABLE IF NOT EXISTS/i.test(q))).toBe(true);
  });

  it('releases the pooled client even when the SELECT throws', async () => {
    const failingClient: FakeReportClient = {
      released: false,
      queries: [],
      release() {
        this.released = true;
      },
      async query(sql: string) {
        if (/SELECT/i.test(sql)) {
          throw new Error('select failed');
        }
        return { rows: [] };
      },
    };
    const failingPool: FakeReportPool = { async connect() { return failingClient; } };

    await expect(
      getSchemaMigrationsReport(failingPool as never),
    ).rejects.toThrow('select failed');
    expect(failingClient.released).toBe(true);
  });

  it('populates recentAuditEvents from schema_migration_audit (Task #429)', async () => {
    writeMigration('001_first.sql');
    const auditedAt = new Date('2026-04-26T01:02:03.000Z');
    const { pool } = buildReportPool(
      [{ filename: '001_first.sql', checksum: 'c1', applied_at: auditedAt }],
      {
        auditRows: [
          {
            id: 42,
            filename: '001_first.sql',
            user_id: 'admin-1',
            user_email: 'admin@example.com',
            success: true,
            error_message: null,
            sql_state: null,
            applied_at: auditedAt,
          },
          {
            id: 41,
            filename: '030_broken.sql',
            user_id: 'admin-1',
            user_email: 'admin@example.com',
            success: false,
            error_message: 'column "foo" does not exist',
            sql_state: '42703',
            applied_at: auditedAt,
          },
        ],
      },
    );

    const report = await getSchemaMigrationsReport(pool as never);

    expect(report.recentAuditEvents).toEqual([
      {
        id: 42,
        filename: '001_first.sql',
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        success: true,
        errorMessage: null,
        sqlState: null,
        appliedAt: auditedAt.toISOString(),
      },
      {
        id: 41,
        filename: '030_broken.sql',
        userId: 'admin-1',
        userEmail: 'admin@example.com',
        success: false,
        errorMessage: 'column "foo" does not exist',
        sqlState: '42703',
        appliedAt: auditedAt.toISOString(),
      },
    ]);
  });
});

describe('getRecentSchemaMigrationAuditEvents (Task #429)', () => {
  it('returns the audit rows mapped to camelCase, applying the supplied limit', async () => {
    const at = new Date('2026-04-26T00:00:00Z');
    const { pool } = buildReportPool([], {
      auditRows: [
        {
          id: 1,
          filename: '001_first.sql',
          user_id: 'u1',
          user_email: 'u1@example.com',
          success: true,
          error_message: null,
          sql_state: null,
          applied_at: at,
        },
      ],
    });
    const events = await getRecentSchemaMigrationAuditEvents(pool as never, 5);
    expect(events).toEqual([
      {
        id: 1,
        filename: '001_first.sql',
        userId: 'u1',
        userEmail: 'u1@example.com',
        success: true,
        errorMessage: null,
        sqlState: null,
        appliedAt: at.toISOString(),
      },
    ]);
  });

  it('defaults the limit to RECENT_AUDIT_EVENTS_LIMIT when not supplied', async () => {
    const queries: Array<{ sql: string; params?: unknown[] }> = [];
    const client = {
      released: false,
      queries: [] as string[],
      release() {
        this.released = true;
      },
      query(sql: string, params?: unknown[]) {
        queries.push({ sql, params });
        return Promise.resolve({ rows: [] });
      },
    };
    const pool = { async connect() { return client; } };

    await getRecentSchemaMigrationAuditEvents(pool as never);

    const select = queries.find((q) => /select/i.test(q.sql));
    expect(select).toBeDefined();
    expect(select!.params).toEqual([RECENT_AUDIT_EVENTS_LIMIT]);
  });
});

describe('getSchemaMigrationsSummary (Task #399)', () => {
  function writeMigration(name: string, body = '-- noop'): void {
    fs.writeFileSync(path.join(tmpDir, 'migrations', name), body, 'utf8');
  }

  it('reports zero counts and anyPendingOnDisk=false on a brand-new install', async () => {
    const { pool } = buildReportPool([]);
    const summary = await getSchemaMigrationsSummary(pool as never);
    expect(summary).toEqual({
      appliedCount: 0,
      latestAppliedAt: null,
      anyPendingOnDisk: false,
    });
  });

  it('flags anyPendingOnDisk=true when on-disk files outpace the recorded rows', async () => {
    writeMigration('001_first.sql');
    writeMigration('002_second.sql'); // present on disk, not recorded
    const earlier = new Date('2025-01-01T00:00:00Z');
    const { pool } = buildReportPool([
      { filename: '001_first.sql', checksum: 'c1', applied_at: earlier },
    ]);
    const summary = await getSchemaMigrationsSummary(pool as never);
    expect(summary).toEqual({
      appliedCount: 1,
      latestAppliedAt: earlier.toISOString(),
      anyPendingOnDisk: true,
    });
  });

  it('returns the most recent applied-at across all rows', async () => {
    writeMigration('001_first.sql');
    writeMigration('002_second.sql');
    const earlier = new Date('2025-01-01T00:00:00Z');
    const later = new Date('2026-04-26T12:00:00Z');
    const { pool } = buildReportPool([
      { filename: '001_first.sql', checksum: 'c1', applied_at: earlier },
      { filename: '002_second.sql', checksum: 'c2', applied_at: later },
    ]);
    const summary = await getSchemaMigrationsSummary(pool as never);
    expect(summary.appliedCount).toBe(2);
    expect(summary.latestAppliedAt).toBe(later.toISOString());
    expect(summary.anyPendingOnDisk).toBe(false);
  });

});

// Coverage for the cross-instance lock helper added in Task #428.
// The helper wraps every admin-triggered (and, in a future change,
// boot-time) migration run in a Postgres advisory lock so two app
// replicas pointing at the same database can never enter
// `runPendingMigrations` concurrently. These tests exercise both
// branches of the guard against a hand-rolled fake pool — we don't
// need a real Postgres for either path because the helper's
// observable behaviour is entirely a function of what
// `pg_try_advisory_lock` returns.
describe('withMigrationAdvisoryLock (Task #428)', () => {
  interface FakeLockClient {
    released: boolean;
    queries: Array<{ sql: string; params?: unknown[] }>;
    nextTryResult: boolean;
    release: () => void;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  }

  function buildLockPool(opts: { acquired: boolean }): {
    pool: { connect: () => Promise<FakeLockClient> };
    client: FakeLockClient;
  } {
    const client: FakeLockClient = {
      released: false,
      queries: [],
      nextTryResult: opts.acquired,
      release() {
        this.released = true;
      },
      async query(sql: string, params?: unknown[]) {
        this.queries.push({ sql, params });
        if (/pg_try_advisory_lock/i.test(sql)) {
          return { rows: [{ acquired: this.nextTryResult }] };
        }
        if (/pg_advisory_unlock/i.test(sql)) {
          return { rows: [{ pg_advisory_unlock: true }] };
        }
        return { rows: [] };
      },
    };
    return {
      pool: { async connect() { return client; } },
      client,
    };
  }

  it('acquires the lock, runs the wrapped fn, then releases the lock and the pooled client', async () => {
    const { pool, client } = buildLockPool({ acquired: true });
    const order: string[] = [];

    const result = await withMigrationAdvisoryLock(pool as never, async () => {
      order.push('fn');
      return 'happy';
    });

    expect(result).toBe('happy');
    // The acquire query must run BEFORE the wrapped fn (so the lock
    // is held while the runner executes), and the unlock must run
    // AFTER fn completes (so the lock is held for the full duration
    // of the run).
    const acquireIdx = client.queries.findIndex((q) =>
      /pg_try_advisory_lock/i.test(q.sql),
    );
    const releaseIdx = client.queries.findIndex((q) =>
      /pg_advisory_unlock/i.test(q.sql),
    );
    expect(acquireIdx).toBeGreaterThanOrEqual(0);
    expect(releaseIdx).toBeGreaterThan(acquireIdx);
    expect(order).toEqual(['fn']);
    // The pooled client must always be released so a steady stream
    // of admin-triggered runs cannot exhaust the connection pool.
    expect(client.released).toBe(true);
    // The acquire and release calls must use the same advisory key
    // so the lock the helper takes is the same one it eventually
    // gives back.
    expect(client.queries[acquireIdx]?.params).toBeDefined();
    expect(client.queries[releaseIdx]?.params).toEqual(
      client.queries[acquireIdx]?.params,
    );
  });

  it('throws MigrationLockUnavailableError without invoking fn when pg_try_advisory_lock returns false (contended path)', async () => {
    const { pool, client } = buildLockPool({ acquired: false });
    const fn = vi.fn(async () => 'should-not-run');

    await expect(
      withMigrationAdvisoryLock(pool as never, fn),
    ).rejects.toBeInstanceOf(MigrationLockUnavailableError);
    expect(fn).not.toHaveBeenCalled();
    // We must NOT issue a pg_advisory_unlock when we never acquired
    // the lock — releasing a lock we don't own is a Postgres warning
    // and would mask a real held lock on a session that re-uses this
    // pooled client later.
    expect(
      client.queries.some((q) => /pg_advisory_unlock/i.test(q.sql)),
    ).toBe(false);
    // The pooled client still has to be released back to the pool
    // even on the rejection path.
    expect(client.released).toBe(true);
  });

  it('releases the lock and the pooled client even when the wrapped fn throws', async () => {
    const { pool, client } = buildLockPool({ acquired: true });

    await expect(
      withMigrationAdvisoryLock(pool as never, async () => {
        throw new Error('runner blew up');
      }),
    ).rejects.toThrow('runner blew up');

    // Even though fn threw, the unlock must still have been issued —
    // otherwise a runner crash would leak the advisory lock and
    // permanently wedge the cluster (until the session was closed).
    expect(
      client.queries.some((q) => /pg_advisory_unlock/i.test(q.sql)),
    ).toBe(true);
    expect(client.released).toBe(true);
  });

  it('never invokes fn AND never tries to release a lock it did not acquire (defence in depth)', async () => {
    const { pool, client } = buildLockPool({ acquired: false });
    const fn = vi.fn();

    await expect(
      withMigrationAdvisoryLock(pool as never, fn as never),
    ).rejects.toBeInstanceOf(MigrationLockUnavailableError);

    expect(fn).not.toHaveBeenCalled();
    // Only the acquire query should have run — no unlock, no setup
    // queries, nothing else.
    const queryKinds = client.queries.map((q) =>
      /pg_try_advisory_lock/i.test(q.sql)
        ? 'try-lock'
        : /pg_advisory_unlock/i.test(q.sql)
          ? 'unlock'
          : 'other',
    );
    expect(queryKinds).toEqual(['try-lock']);
  });

  // -- Task #438: blocking-acquire (`{ wait: true }`) variant ---------
  //
  // Boot-time runs in `server/index.ts` use `{ wait: true }` so that
  // a second replica booting while the first is mid-migration waits
  // for the lock instead of crashing. These tests pin the new
  // wait-vs-skip behaviour so a future refactor cannot quietly
  // regress to the throwing default — which on boot would manifest as
  // crash-looping containers in a multi-replica deploy.

  function buildWaitLockPool(): {
    pool: { connect: () => Promise<FakeLockClient> };
    client: FakeLockClient;
  } {
    const client: FakeLockClient = {
      released: false,
      queries: [],
      // `nextTryResult` is unused on the wait path (the helper never
      // calls `pg_try_advisory_lock` when `{ wait: true }`) but the
      // shared FakeLockClient type still requires the field.
      nextTryResult: true,
      release() {
        this.released = true;
      },
      async query(sql: string, params?: unknown[]) {
        this.queries.push({ sql, params });
        if (/pg_advisory_lock/i.test(sql) && !/pg_try/i.test(sql)) {
          // Blocking acquire — Postgres returns void; we model that
          // as an empty-rows resolution.
          return { rows: [] };
        }
        if (/pg_advisory_unlock/i.test(sql)) {
          return { rows: [{ pg_advisory_unlock: true }] };
        }
        if (/pg_try_advisory_lock/i.test(sql)) {
          // The wait path must NEVER use `pg_try_advisory_lock` —
          // surfacing a value here at all would mean the helper went
          // down the wrong branch.
          throw new Error(
            'pg_try_advisory_lock must not be issued in wait mode',
          );
        }
        return { rows: [] };
      },
    };
    return {
      pool: { async connect() { return client; } },
      client,
    };
  }

  it('uses pg_advisory_lock (blocking) and never pg_try_advisory_lock when { wait: true }', async () => {
    const { pool, client } = buildWaitLockPool();

    const result = await withMigrationAdvisoryLock(
      pool as never,
      async () => 'ran',
      { wait: true },
    );

    expect(result).toBe('ran');
    const kinds = client.queries.map((q) =>
      /pg_try_advisory_lock/i.test(q.sql)
        ? 'try-lock'
        : /pg_advisory_unlock/i.test(q.sql)
          ? 'unlock'
          : /pg_advisory_lock/i.test(q.sql)
            ? 'wait-lock'
            : 'other',
    );
    // Wait-acquire then unlock — and crucially, no try-lock call ever
    // shows up. The order is also load-bearing: the lock must be held
    // while fn runs, then released afterwards.
    expect(kinds).toEqual(['wait-lock', 'unlock']);
    expect(client.released).toBe(true);
  });

  it('does not throw MigrationLockUnavailableError in wait mode (boot path must not crash on contention)', async () => {
    // Even if the wait path internally treated contention the same
    // way as try-mode, the helper's contract for `{ wait: true }` is
    // that it WILL eventually return — so the error type is simply
    // not part of the wait-mode surface. We model the worst case
    // (lock granted instantly) and assert no rejection of the typed
    // error — defence against a future refactor that accidentally
    // re-introduces `pg_try_advisory_lock` for this branch.
    const { pool } = buildWaitLockPool();
    await expect(
      withMigrationAdvisoryLock(
        pool as never,
        async () => 'ok',
        { wait: true },
      ),
    ).resolves.toBe('ok');
  });

  it('serializes a contending caller behind the lock-holder when { wait: true }', async () => {
    // This is the real boot-time race: two replicas enter the helper
    // at almost the same moment. The first acquires the lock; the
    // second must wait for the first to release before its `fn` is
    // even invoked, then run successfully (against an idempotent
    // runner that no-ops on already-applied files).
    //
    // We model the lock with a single shared "currently held" flag.
    // The wait-mode acquire returns a promise that only resolves
    // once the flag is cleared by the prior holder's unlock, so the
    // second `fn` cannot start until the first finishes. This is the
    // exact ordering the boot path relies on.
    let lockHeld = false;
    const waiters: Array<() => void> = [];

    function makeSharedClient(): FakeLockClient {
      const c: FakeLockClient = {
        released: false,
        queries: [],
        nextTryResult: true,
        release() {
          this.released = true;
        },
        async query(sql: string, _params?: unknown[]) {
          this.queries.push({ sql });
          if (/pg_advisory_lock/i.test(sql) && !/pg_try/i.test(sql)) {
            if (!lockHeld) {
              lockHeld = true;
              return { rows: [] };
            }
            // Contended — park until the holder unlocks.
            await new Promise<void>((resolve) => {
              waiters.push(resolve);
            });
            lockHeld = true;
            return { rows: [] };
          }
          if (/pg_advisory_unlock/i.test(sql)) {
            lockHeld = false;
            const next = waiters.shift();
            if (next) next();
            return { rows: [{ pg_advisory_unlock: true }] };
          }
          return { rows: [] };
        },
      };
      return c;
    }

    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstFnDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const pool = {
      async connect() {
        return makeSharedClient();
      },
    };

    const first = withMigrationAdvisoryLock(
      pool as never,
      async () => {
        order.push('first-start');
        await firstFnDone;
        order.push('first-end');
      },
      { wait: true },
    );

    // Give the first call a tick to acquire and enter `fn`.
    await new Promise((r) => setTimeout(r, 0));

    const second = withMigrationAdvisoryLock(
      pool as never,
      async () => {
        order.push('second-start');
        order.push('second-end');
      },
      { wait: true },
    );

    // Yield so the second call has a chance to (incorrectly) jump
    // the queue if the wait path were broken.
    await new Promise((r) => setTimeout(r, 0));

    // The second call MUST still be parked behind the first. If the
    // helper had used a non-blocking try-lock for `{ wait: true }`
    // it would have either thrown or run `fn` already.
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await Promise.all([first, second]);

    // Strict ordering: the second `fn` only runs once the first has
    // released the lock. That is the contract Task #438 buys for the
    // boot path.
    expect(order).toEqual([
      'first-start',
      'first-end',
      'second-start',
      'second-end',
    ]);
  });
});

// Re-open the summary describe so the placeholder anchor above keeps
// the file structure stable without dropping any of the original
// summary coverage. Each test below was originally part of the
// `getSchemaMigrationsSummary (Task #399)` block.
describe('getSchemaMigrationsSummary (Task #399) continued', () => {
  function writeMigration(name: string, body = '-- noop'): void {
    fs.writeFileSync(path.join(tmpDir, 'migrations', name), body, 'utf8');
  }

  it('never returns filenames or checksums in the summary shape', async () => {
    // Defence-in-depth: this helper backs an unauthenticated public
    // endpoint, so the response shape must stay limited to counts +
    // timestamp + boolean. If anyone ever adds a field that leaks
    // filenames or checksums this test will fail loudly.
    writeMigration('001_first.sql');
    const { pool } = buildReportPool([
      {
        filename: '001_first.sql',
        checksum: 'sensitive-checksum',
        applied_at: new Date('2026-04-26T00:00:00Z'),
      },
    ]);
    const summary = await getSchemaMigrationsSummary(pool as never);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toMatch(/\.sql/i);
    expect(serialized).not.toContain('sensitive-checksum');
    expect(serialized).not.toMatch(/checksum/i);
    expect(Object.keys(summary).sort()).toEqual([
      'anyPendingOnDisk',
      'appliedCount',
      'latestAppliedAt',
    ]);
  });
});
