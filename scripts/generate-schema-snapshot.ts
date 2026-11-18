#!/usr/bin/env tsx
/**
 * scripts/generate-schema-snapshot.ts  (npm run schema:snapshot)
 *
 * Derives a stable, diff-friendly fingerprint of the Drizzle schema
 * (every table's columns, named unique constraints, and composite
 * primary keys) and writes it to `shared/schema-snapshot.json`.
 *
 * WHY THIS EXISTS
 * ---------------
 * This app does NOT run `drizzle-kit push` against an existing
 * production database. The supported way to evolve the prod schema is
 * a numbered SQL file under `migrations/`, applied at boot by
 * `server/lib/migrations-runner.ts` (tracked in `schema_migrations`).
 *
 * The failure mode this guards against: a developer edits
 * `shared/schema/*.ts` (adds a column, relaxes a NOT NULL, adds a
 * unique constraint) but forgets to ship a matching `migrations/NNN_*.sql`.
 * The code compiles, the build passes, the deploy succeeds — and then
 * the running app issues `SELECT`s for columns that don't exist in the
 * production database. (This is exactly what happened with the v0.7.50
 * Microsoft Graph email columns: the schema gained eight columns but no
 * migration shipped, so `GET /api/email-configuration` 500'd in prod.)
 *
 * The committed snapshot makes every schema change a deliberate,
 * reviewable checkpoint: changing the schema forces you to regenerate
 * this file (`npm run schema:snapshot`), and the `lint:schema` gate
 * fails the build if you didn't — with a reminder to add the migration.
 *
 * Run directly to (re)write the snapshot:
 *     npm run schema:snapshot
 *
 * The `check-schema-snapshot.ts` gate imports `buildSchemaFingerprint`
 * + `serializeSchemaFingerprint` from here so the gate and the
 * generator can never disagree on format.
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";

import * as schema from "../shared/schema/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
export const schemaSnapshotFile = path.resolve(
  repoRoot,
  "shared",
  "schema-snapshot.json",
);

export interface TableFingerprint {
  /** column name → compact type signature (e.g. "varchar NOT NULL DEFAULT PK") */
  columns: Record<string, string>;
  /** sorted "name(col1,col2)[NND]" entries for named unique constraints */
  uniqueConstraints: string[];
  /** sorted column lists for composite primary keys, "name(col1,col2)" */
  primaryKeys: string[];
}

export type SchemaFingerprint = Record<string, TableFingerprint>;

/** Stable, sorted column signature so diffs are readable + deterministic. */
function columnSignature(col: any): string {
  const parts = [col.getSQLType()];
  if (col.notNull) parts.push("NOT NULL");
  if (col.hasDefault) parts.push("DEFAULT");
  if (col.primary) parts.push("PK");
  return parts.join(" ");
}

/**
 * Walk every exported pgTable in the barrel and produce a fully-sorted
 * fingerprint. Sorting at every level (tables, columns, constraints)
 * guarantees byte-identical output regardless of declaration order, so
 * the only thing that moves the file is a real schema change.
 */
export function buildSchemaFingerprint(): SchemaFingerprint {
  const fingerprint: SchemaFingerprint = {};

  for (const value of Object.values(schema)) {
    if (!is(value as any, PgTable)) continue;
    const cfg = getTableConfig(value as any);

    const columns: Record<string, string> = {};
    for (const col of [...cfg.columns].sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    )) {
      columns[col.name] = columnSignature(col);
    }

    const uniqueConstraints = cfg.uniqueConstraints
      .map((u: any) => {
        const cols = u.columns.map((c: any) => c.name).join(",");
        const nnd = u.nullsNotDistinct ? " NND" : "";
        return `${u.name}(${cols})${nnd}`;
      })
      .sort((a, b) => a.localeCompare(b, "en"));

    const primaryKeys = cfg.primaryKeys
      .map((pk: any) => {
        const cols = pk.columns.map((c: any) => c.name).join(",");
        const name = pk.getName ? pk.getName() : (pk.name ?? "");
        return `${name}(${cols})`;
      })
      .sort((a, b) => a.localeCompare(b, "en"));

    fingerprint[cfg.name] = { columns, uniqueConstraints, primaryKeys };
  }

  // Re-key in sorted table order so JSON.stringify emits tables
  // alphabetically.
  const sorted: SchemaFingerprint = {};
  for (const name of Object.keys(fingerprint).sort((a, b) =>
    a.localeCompare(b, "en"),
  )) {
    sorted[name] = fingerprint[name];
  }
  return sorted;
}

/** Canonical serialization: 2-space indent, trailing newline, LF. */
export function serializeSchemaFingerprint(fp: SchemaFingerprint): string {
  return JSON.stringify(fp, null, 2) + "\n";
}

// When invoked directly (npm run schema:snapshot) write the file.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const fp = buildSchemaFingerprint();
  writeFileSync(schemaSnapshotFile, serializeSchemaFingerprint(fp), "utf8");
  const tableCount = Object.keys(fp).length;
  console.log(
    `schema:snapshot — wrote ${path.relative(repoRoot, schemaSnapshotFile)} ` +
      `(${tableCount} tables).`,
  );
}
