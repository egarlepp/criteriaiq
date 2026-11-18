// @vitest-environment node
//
// Catch drift between schema-declared FKs and what's actually
// installed in the live Postgres database (Task #534).
//
// Why this exists: Task #527 silently lived in production for a long
// time because nothing automated compared the FK constraints
// declared on the Drizzle schema in `shared/schema/*.ts` against the
// FK constraints actually present in the live database. The bug only
// surfaced when an operator tried to archive a user who happened to
// own a project — the FK that the schema didn't even semantically
// expect to be enforced (because the column doubles as a
// human-readable placeholder slot during archive) was still installed
// in the DB and rejected the archive UPDATE.
//
// This test boots the Drizzle schema, introspects the live database
// via `information_schema.referential_constraints` /
// `key_column_usage` / `constraint_column_usage`, and diffs the two
// sets along three axes:
//
//   1. Declared but not installed:  `.references(...)` is on the
//      schema but no FOREIGN KEY constraint exists in the DB. Usually
//      means a `db:push` was skipped or a migration is missing.
//   2. Installed but not declared:  the DB has a FOREIGN KEY but the
//      schema doesn't declare one. Usually means someone removed a
//      `.references(...)` call from the schema but forgot to ship a
//      `DROP CONSTRAINT` migration — exactly the Task #527 shape.
//   3. Action mismatch:             both sides agree the FK exists,
//      but `ON DELETE` / `ON UPDATE` diverge. Usually means the
//      schema's onDelete option drifted away from a long-installed
//      DB-side action.
//
// Soft-reference columns (the design pattern Task #527 codified —
// `projects.primary_engineer_id`, `projects.specialist_engineer_id`,
// `projects.account_representative_id`,
// `projects.opportunity_engineer_id`, the `projects.supporting_engineers`
// text[], and similar) intentionally carry a user id WITHOUT an FK so
// archive can stamp a placeholder string into the column without
// triggering a constraint violation. Those columns naturally fall out
// of this diff: they have no `.references(...)` on the schema side,
// and post-Task-#527 (migration 033) they have no FOREIGN KEY on the
// DB side either. They appear in `INTENTIONALLY_UNENFORCED` below as
// living documentation so a future reader understands why the diff
// doesn't flag them.
//
// `KNOWN_DRIFT_ALLOWLIST` carries the existing drift entries that
// were already in production when this test landed. Each entry has a
// `reason` string so the next person to touch the FK knows what it's
// waiting on. New drift — anything outside the allowlist — fails the
// test, which is the behavior the Task #527 incident was missing.

import { describe, expect, it } from "vitest";
import { isTable, sql, type SQL } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";

import * as schema from "@shared/schema";
import { db, dbReady } from "../db";

// ---------------------------------------------------------------------------
// Schema-side extraction
// ---------------------------------------------------------------------------

interface DeclaredFk {
  /** SQL table name, e.g. "projects" */
  table: string;
  /** Local column(s), comma-joined in source order */
  columns: string;
  /** Foreign SQL table name, e.g. "users" */
  foreignTable: string;
  /** Foreign column(s), comma-joined in source order */
  foreignColumns: string;
  /** Lower-cased onDelete; "no action" when not specified */
  onDelete: string;
  /** Lower-cased onUpdate; "no action" when not specified */
  onUpdate: string;
}

interface InstalledFk {
  table: string;
  columns: string;
  foreignTable: string;
  foreignColumns: string;
  onDelete: string;
  onUpdate: string;
  constraintName: string;
}

function fkKey(fk: { table: string; columns: string; foreignTable: string; foreignColumns: string }): string {
  return `${fk.table}.${fk.columns} -> ${fk.foreignTable}.${fk.foreignColumns}`;
}

/**
 * Walks an exported schema module and pulls every Drizzle pgTable
 * out of it. We use Drizzle's runtime `isTable` guard (which checks
 * the framework's internal brand symbol) and then narrow to the
 * pg-core `PgTable` type because the entire schema is declared with
 * `pgTable(...)`. Drizzle does not export a public `isPgTable`
 * helper, so we lean on the dialect-level `isTable` guard plus the
 * structural fact that everything in `shared/schema/*` is `pgTable`.
 */
function collectPgTables(schemaModule: Readonly<Record<string, unknown>>): PgTable[] {
  // Some tables are re-exported under aliases (e.g. `shared/schema/projects.ts`
  // exports both `projects` and `pocs = projects` for legacy callers).
  // Iterating Object.values would visit the same underlying table object
  // twice and double-count its FKs, so we dedupe by reference identity.
  const tables = new Set<PgTable>();
  for (const value of Object.values(schemaModule)) {
    if (!isTable(value)) continue;
    // Safe: `shared/schema/*` only declares pgTable instances. If a
    // future schema module ever introduces a non-PG dialect table
    // here, getTableConfig below would throw and the test would
    // surface it.
    tables.add(value as PgTable);
  }
  return Array.from(tables);
}

export function extractDeclaredFks(schemaModule: Readonly<Record<string, unknown>>): DeclaredFk[] {
  const out: DeclaredFk[] = [];
  for (const table of collectPgTables(schemaModule)) {
    const cfg = getTableConfig(table);
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      const foreignCfg = getTableConfig(ref.foreignTable);
      out.push({
        table: cfg.name,
        columns: ref.columns.map((c) => c.name).join(","),
        foreignTable: foreignCfg.name,
        foreignColumns: ref.foreignColumns.map((c) => c.name).join(","),
        onDelete: (fk.onDelete ?? "no action").toLowerCase(),
        onUpdate: (fk.onUpdate ?? "no action").toLowerCase(),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// DB-side introspection
// ---------------------------------------------------------------------------

interface RawInstalledRow extends Record<string, unknown> {
  constraint_name: string;
  table_name: string;
  columns: string;
  foreign_table_name: string;
  foreign_columns: string;
  delete_rule: string;
  update_rule: string;
}

const INSTALLED_FK_QUERY: SQL = sql`
  SELECT
    tc.constraint_name,
    tc.table_name,
    string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position)         AS columns,
    ccu.foreign_table_name,
    string_agg(ccu.foreign_column_name, ',' ORDER BY kcu.ordinal_position) AS foreign_columns,
    rc.delete_rule,
    rc.update_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema    = kcu.table_schema
   AND tc.table_name      = kcu.table_name
  JOIN information_schema.referential_constraints rc
    ON rc.constraint_name   = tc.constraint_name
   AND rc.constraint_schema = tc.table_schema
  JOIN LATERAL (
    SELECT
      ccu_inner.table_name  AS foreign_table_name,
      ccu_inner.column_name AS foreign_column_name,
      kcu_inner.ordinal_position
    FROM information_schema.referential_constraints rc_inner
    JOIN information_schema.key_column_usage kcu_inner
      ON kcu_inner.constraint_name = rc_inner.unique_constraint_name
     AND kcu_inner.table_schema    = rc_inner.unique_constraint_schema
    JOIN information_schema.constraint_column_usage ccu_inner
      ON ccu_inner.constraint_name = kcu_inner.constraint_name
     AND ccu_inner.table_schema    = kcu_inner.table_schema
     AND ccu_inner.column_name     = kcu_inner.column_name
    WHERE rc_inner.constraint_name   = tc.constraint_name
      AND rc_inner.constraint_schema = tc.table_schema
      AND kcu_inner.ordinal_position = kcu.position_in_unique_constraint
  ) ccu ON TRUE
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema    = 'public'
  GROUP BY tc.constraint_name, tc.table_name, ccu.foreign_table_name, rc.delete_rule, rc.update_rule
  ORDER BY tc.table_name, tc.constraint_name;
`;

/**
 * Both the Neon-serverless and node-postgres drizzle adapters
 * resolve `db.execute<T>(sql)` to a value with a `rows: T[]` field
 * (their underlying drivers both wrap pg-style `QueryResult`). The
 * union type from `server/db.ts` doesn't expose `rows` directly on
 * its public surface, so we narrow via a typed structural guard
 * rather than `as any`.
 */
function rowsFromExecuteResult<T>(value: unknown): T[] {
  if (
    value !== null &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray((value as { rows: unknown }).rows)
  ) {
    return (value as { rows: T[] }).rows;
  }
  throw new Error(
    `db.execute() returned an unexpected shape (no .rows array). Got: ${typeof value}`,
  );
}

async function fetchInstalledFks(): Promise<InstalledFk[]> {
  if (!db) throw new Error("db is null");
  const raw: unknown = await db.execute(INSTALLED_FK_QUERY);
  const rows = rowsFromExecuteResult<RawInstalledRow>(raw);
  return rows.map((r) => ({
    table: r.table_name,
    columns: r.columns,
    foreignTable: r.foreign_table_name,
    foreignColumns: r.foreign_columns,
    onDelete: r.delete_rule.toLowerCase(),
    onUpdate: r.update_rule.toLowerCase(),
    constraintName: r.constraint_name,
  }));
}

// ---------------------------------------------------------------------------
// Allowances
// ---------------------------------------------------------------------------

/**
 * Living documentation of columns that semantically reference another
 * table but intentionally carry NO foreign-key constraint. These
 * columns exist so that storage code can stamp non-id sentinel values
 * into them (e.g. `archiveUser` writes "First Last (D)" into the
 * engineer slots — see Task #527 / migration 033). A FK on these
 * columns would reject those writes and break archive.
 *
 * This list is informational. It does NOT participate in the diff
 * because soft-reference columns naturally have no entry on either
 * side: the schema doesn't `.references(...)` them and the DB
 * shouldn't have a constraint on them. If a soft-ref column ever
 * shows up in `installedButNotDeclared`, that is a real bug and the
 * test SHOULD fail — see Task #527 for what that looks like.
 */
const INTENTIONALLY_UNENFORCED: ReadonlyArray<{ table: string; column: string; reason: string }> = [
  {
    table: "projects",
    column: "primary_engineer_id",
    reason:
      "archiveUser stamps a human-readable placeholder string into this slot so restoreUser can swap the real user id back in (Task #527 / migration 033).",
  },
  {
    table: "projects",
    column: "specialist_engineer_id",
    reason:
      "Same archive-placeholder pattern as primary_engineer_id (Task #527 / migration 033).",
  },
  {
    table: "projects",
    column: "customer_user_id",
    reason:
      "Same archive-placeholder pattern as the engineer slots (Task #533 / migration 035).",
  },
  {
    table: "projects",
    column: "tcc_user_id",
    reason:
      "Same archive-placeholder pattern as the engineer slots (Task #533 / migration 035).",
  },
  {
    table: "projects",
    column: "created_by",
    reason:
      "Same archive-placeholder pattern as the engineer slots (Task #533 / migration 035).",
  },
  {
    table: "projects",
    column: "account_representative_id",
    reason: "Soft reference — historical free-form user id slot, never had a FK.",
  },
  {
    table: "projects",
    column: "opportunity_engineer_id",
    reason: "Soft reference — historical free-form user id slot, never had a FK.",
  },
  {
    table: "projects",
    column: "supporting_engineers",
    reason: "text[] array of user ids; PG can't FK an array element.",
  },
];

interface AllowEntry {
  /**
   * Stable diff key in the form `table.cols -> ftable.fcols`. Must
   * match exactly what the diff prints.
   */
  key: string;
  /** Why this entry is allowed; the next reader needs this. */
  reason: string;
}

/**
 * Existing drift that was already in production when this test
 * landed. Each entry is here because resolving the drift requires
 * either a follow-up migration (to install the missing FK) or a
 * follow-up schema change (to drop the declaration), neither of which
 * is in scope for the test landing itself.
 *
 * The intent is for this list to SHRINK over time. Adding to this
 * list is allowed but should be paired with a follow-up task that
 * removes the entry once the underlying drift is resolved.
 */
const DECLARED_BUT_NOT_INSTALLED_ALLOWLIST: ReadonlyArray<AllowEntry> = [];

const INSTALLED_BUT_NOT_DECLARED_ALLOWLIST: ReadonlyArray<AllowEntry> = [];

interface ActionAllowEntry extends AllowEntry {
  installedOnDelete: string;
  installedOnUpdate: string;
}

const ACTION_MISMATCH_ALLOWLIST: ReadonlyArray<ActionAllowEntry> = [];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FK schema extraction (no DB required)", () => {
  it("walks the Drizzle schema and finds every declared FK", () => {
    const declared = extractDeclaredFks(schema as Readonly<Record<string, unknown>>);
    // Sanity: at minimum the well-known ones should be present so a
    // future refactor that loses half the schema modules trips the
    // test instead of silently shrinking the diff set. We pin two
    // distinct tables so a single-module loss is also detected.
    expect(declared.length).toBeGreaterThan(50);
    expect(declared).toContainEqual(
      expect.objectContaining({
        table: "projects",
        columns: "team_id",
        foreignTable: "teams",
        foreignColumns: "id",
      }),
    );
    expect(declared).toContainEqual(
      expect.objectContaining({
        table: "user_accounts",
        columns: "user_id",
        foreignTable: "users",
        foreignColumns: "id",
      }),
    );
  });

  it("does not declare an FK on any soft-reference column", () => {
    const declared = extractDeclaredFks(schema as Readonly<Record<string, unknown>>);
    for (const soft of INTENTIONALLY_UNENFORCED) {
      const offending = declared.find(
        (d) => d.table === soft.table && d.columns.split(",").includes(soft.column),
      );
      expect(
        offending,
        `Soft-reference column ${soft.table}.${soft.column} unexpectedly has a schema-declared FK. ${soft.reason}`,
      ).toBeUndefined();
    }
  });
});

describe.skipIf(!dbReady)("FK drift between Drizzle schema and live DB", () => {
  it("declared FKs match installed FKs (modulo the documented allowlists)", async () => {
    const declared = extractDeclaredFks(schema as Readonly<Record<string, unknown>>);
    const installed = await fetchInstalledFks();

    const declaredMap = new Map<string, DeclaredFk>(declared.map((d) => [fkKey(d), d]));
    const installedMap = new Map<string, InstalledFk>(installed.map((i) => [fkKey(i), i]));

    const declaredAllow = new Set(DECLARED_BUT_NOT_INSTALLED_ALLOWLIST.map((e) => e.key));
    const installedAllow = new Set(INSTALLED_BUT_NOT_DECLARED_ALLOWLIST.map((e) => e.key));
    const actionAllow = new Map<string, ActionAllowEntry>(
      ACTION_MISMATCH_ALLOWLIST.map((e) => [e.key, e]),
    );

    const declaredButNotInstalled: string[] = [];
    const installedButNotDeclared: string[] = [];
    const actionMismatches: string[] = [];

    for (const [key, d] of declaredMap) {
      const i = installedMap.get(key);
      if (!i) {
        if (!declaredAllow.has(key)) declaredButNotInstalled.push(key);
        continue;
      }
      if (i.onDelete !== d.onDelete || i.onUpdate !== d.onUpdate) {
        const allowed = actionAllow.get(key);
        const matchesAllow =
          allowed &&
          allowed.installedOnDelete === i.onDelete &&
          allowed.installedOnUpdate === i.onUpdate;
        if (!matchesAllow) {
          actionMismatches.push(
            `${key} declared(onDelete=${d.onDelete}, onUpdate=${d.onUpdate}) ` +
              `installed(onDelete=${i.onDelete}, onUpdate=${i.onUpdate})`,
          );
        }
      }
    }

    for (const [key] of installedMap) {
      if (!declaredMap.has(key) && !installedAllow.has(key)) {
        installedButNotDeclared.push(key);
      }
    }

    const messages: string[] = [];
    if (declaredButNotInstalled.length > 0) {
      messages.push(
        "FK declared on Drizzle schema but NOT installed in the live DB " +
          "(missing migration, or schema added without db:push):\n  - " +
          declaredButNotInstalled.join("\n  - "),
      );
    }
    if (installedButNotDeclared.length > 0) {
      // This is the Task #527 shape: a constraint lives in the DB
      // that the schema no longer expects. The fix is usually a
      // `DROP CONSTRAINT` migration (see migration 033 for the
      // engineer-id slots).
      messages.push(
        "FK installed in the live DB but NOT declared on the Drizzle schema " +
          "(missing DROP CONSTRAINT migration, or stale FK from before " +
          "a schema removal — this is the Task #527 shape):\n  - " +
          installedButNotDeclared.join("\n  - "),
      );
    }
    if (actionMismatches.length > 0) {
      messages.push(
        "FK exists on both sides but ON DELETE / ON UPDATE actions diverge:\n  - " +
          actionMismatches.join("\n  - "),
      );
    }

    expect(messages.join("\n\n"), "FK drift detected — see message above").toBe("");
  });

  it("every allowlist entry corresponds to a real, current drift (so the list shrinks honestly)", async () => {
    const declared = extractDeclaredFks(schema as Readonly<Record<string, unknown>>);
    const installed = await fetchInstalledFks();
    const declaredMap = new Map(declared.map((d) => [fkKey(d), d]));
    const installedMap = new Map(installed.map((i) => [fkKey(i), i]));

    const stale: string[] = [];

    for (const entry of DECLARED_BUT_NOT_INSTALLED_ALLOWLIST) {
      // Allowlist says it's declared but not installed. If the DB
      // now HAS the FK installed (someone shipped the migration),
      // this allowlist entry is stale and should be deleted.
      if (installedMap.has(entry.key)) {
        stale.push(`DECLARED_BUT_NOT_INSTALLED_ALLOWLIST: ${entry.key} is now installed; remove the entry.`);
      }
      // Also: if the schema no longer declares this FK at all, the
      // entry is stale because the drift class changed.
      if (!declaredMap.has(entry.key)) {
        stale.push(
          `DECLARED_BUT_NOT_INSTALLED_ALLOWLIST: ${entry.key} is no longer declared on the schema; remove the entry.`,
        );
      }
    }

    for (const entry of INSTALLED_BUT_NOT_DECLARED_ALLOWLIST) {
      if (!installedMap.has(entry.key)) {
        stale.push(`INSTALLED_BUT_NOT_DECLARED_ALLOWLIST: ${entry.key} is no longer installed; remove the entry.`);
      }
      if (declaredMap.has(entry.key)) {
        stale.push(`INSTALLED_BUT_NOT_DECLARED_ALLOWLIST: ${entry.key} is now declared on the schema; remove the entry.`);
      }
    }

    for (const entry of ACTION_MISMATCH_ALLOWLIST) {
      const i = installedMap.get(entry.key);
      const d = declaredMap.get(entry.key);
      if (!i || !d) {
        stale.push(`ACTION_MISMATCH_ALLOWLIST: ${entry.key} no longer exists on both sides; remove the entry.`);
        continue;
      }
      if (i.onDelete === d.onDelete && i.onUpdate === d.onUpdate) {
        stale.push(`ACTION_MISMATCH_ALLOWLIST: ${entry.key} actions now agree; remove the entry.`);
      }
    }

    expect(stale.join("\n"), "Stale allowlist entries — please remove them").toBe("");
  });
});
