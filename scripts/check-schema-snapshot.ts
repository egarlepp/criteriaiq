#!/usr/bin/env tsx
/**
 * scripts/check-schema-snapshot.ts  (npm run lint:schema)
 *
 * Guards that the committed `shared/schema-snapshot.json` matches the
 * current Drizzle schema. If `shared/schema/*.ts` changed a table's
 * columns, named unique constraints, or composite primary keys without
 * the snapshot being regenerated, this gate fails — the loud reminder
 * that a matching `migrations/NNN_*.sql` must also ship (the prod schema
 * is evolved by the boot-time migration runner, NOT `drizzle-kit push`).
 *
 * Unlike `lint:doc-dates`, this gate needs no git history — it derives
 * the expected fingerprint purely from the TypeScript schema, so it runs
 * identically locally and inside the production Docker build (which has
 * `shared/` but no `.git`).
 *
 * See `scripts/generate-schema-snapshot.ts` for the WHY and the format.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSchemaFingerprint,
  serializeSchemaFingerprint,
  schemaSnapshotFile,
  type SchemaFingerprint,
} from "./generate-schema-snapshot.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const rel = path.relative(repoRoot, schemaSnapshotFile);

if (!existsSync(schemaSnapshotFile)) {
  console.error(
    `\nFAIL: lint:schema — ${rel} is missing.\n` +
      'Run "npm run schema:snapshot" and commit the result.\n',
  );
  process.exit(1);
}

// EOL-normalize before comparing: the generator writes LF, but a Windows
// checkout with core.autocrlf rematerializes the committed file as CRLF,
// which would false-fail a raw byte compare. (Same defense as lint:doc-dates.)
const normalizeEol = (s: string) => s.replace(/\r\n/g, "\n");

const expectedFp = buildSchemaFingerprint();
const expected = normalizeEol(serializeSchemaFingerprint(expectedFp));
const actual = normalizeEol(readFileSync(schemaSnapshotFile, "utf8"));

if (expected === actual) {
  console.log(
    `OK: lint:schema — ${rel} matches the current Drizzle schema ` +
      `(${Object.keys(expectedFp).length} tables).`,
  );
  process.exit(0);
}

// Mismatch — compute a concise, human-readable diff so the developer can
// see exactly which tables/columns/constraints moved without eyeballing
// a 160-table JSON file.
let committedFp: SchemaFingerprint = {};
try {
  committedFp = JSON.parse(actual) as SchemaFingerprint;
} catch {
  // Corrupt/unparseable committed file — fall through with empty so the
  // diff treats every current table as "changed".
}

const lines: string[] = [];
const allTables = new Set<string>([
  ...Object.keys(committedFp),
  ...Object.keys(expectedFp),
]);
for (const table of [...allTables].sort((a, b) => a.localeCompare(b, "en"))) {
  const before = committedFp[table];
  const after = expectedFp[table];
  if (!before) {
    lines.push(`  + table "${table}" (new)`);
    continue;
  }
  if (!after) {
    lines.push(`  - table "${table}" (removed)`);
    continue;
  }
  // Column diffs
  const cols = new Set<string>([
    ...Object.keys(before.columns),
    ...Object.keys(after.columns),
  ]);
  for (const col of [...cols].sort((a, b) => a.localeCompare(b, "en"))) {
    const b = before.columns[col];
    const a = after.columns[col];
    if (b === a) continue;
    if (b === undefined) lines.push(`  + ${table}.${col}  (${a})`);
    else if (a === undefined) lines.push(`  - ${table}.${col}  (was ${b})`);
    else lines.push(`  ~ ${table}.${col}  ${b}  →  ${a}`);
  }
  // Unique-constraint diffs
  const beforeU = new Set(before.uniqueConstraints);
  const afterU = new Set(after.uniqueConstraints);
  for (const u of after.uniqueConstraints)
    if (!beforeU.has(u)) lines.push(`  + ${table} unique ${u}`);
  for (const u of before.uniqueConstraints)
    if (!afterU.has(u)) lines.push(`  - ${table} unique ${u}`);
  // Composite primary-key diffs
  const beforeP = new Set(before.primaryKeys);
  const afterP = new Set(after.primaryKeys);
  for (const p of after.primaryKeys)
    if (!beforeP.has(p)) lines.push(`  + ${table} pk ${p}`);
  for (const p of before.primaryKeys)
    if (!afterP.has(p)) lines.push(`  - ${table} pk ${p}`);
}

const MAX_DIFF_LINES = 60;
const shown = lines.slice(0, MAX_DIFF_LINES);
const overflow = lines.length - shown.length;

console.error(
  `\nFAIL: lint:schema — ${rel} is stale.\n\n` +
    "The Drizzle schema (shared/schema/*.ts) changed but the committed\n" +
    "snapshot was not regenerated. Schema changes:\n\n" +
    shown.join("\n") +
    (overflow > 0 ? `\n  …and ${overflow} more change(s)` : "") +
    "\n\n" +
    "REQUIRED before committing:\n" +
    "  1. Add an idempotent migrations/NNN_*.sql for each change above.\n" +
    "     (Prod applies these at boot via server/lib/migrations-runner.ts.\n" +
    "      Do NOT rely on drizzle-kit push — it is not run on redeploy.)\n" +
    '  2. Run "npm run schema:snapshot" to refresh the snapshot.\n' +
    "  3. Commit both the migration and the updated snapshot.\n",
);
process.exit(1);
