// @vitest-environment node
//
// Regression guard for Task #538.
//
// Three load-bearing pieces have to stay in lockstep for case-variant
// duplicate emails to be impossible:
//
//   1. `migrations/035_users_email_case_insensitive_unique.sql` exists
//      and creates a UNIQUE index named `users_email_lower_unique`
//      on `LOWER(email)` (and drops the non-unique
//      `users_email_lower_idx` from migration 034).
//   2. `shared/schema/auth.ts` declares the same `uniqueIndex` on the
//      same `LOWER(email)` expression with the same name, so
//      `drizzle-kit push` recognises the existing object and does not
//      drop or rename it on the next sync.
//   3. The migration includes a dedupe step that handles pre-existing
//      case-variant duplicates (rename losers + deactivate them) so
//      the UNIQUE index can be created without conflicting with
//      legacy data.
//
// If any of those drifts away from the others the case-insensitive
// uniqueness contract from Task #538 silently weakens, so this test
// pins all three down by inspecting the source files directly. We
// deliberately do not boot the database here — the schema runner and
// the migrations runner already have their own integration coverage.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = path.join(
  process.cwd(),
  'migrations',
  '035_users_email_case_insensitive_unique.sql',
);
const SCHEMA_PATH = path.join(
  process.cwd(),
  'shared',
  'schema',
  'auth.ts',
);

describe('users.email case-insensitive uniqueness (Task #538)', () => {
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

  it('migration 035 drops the non-unique LOWER(email) index from migration 034', () => {
    expect(migration).toMatch(
      /DROP\s+INDEX\s+IF\s+EXISTS\s+users_email_lower_idx/i,
    );
  });

  it('migration 035 creates a UNIQUE functional index on LOWER(email)', () => {
    // Tolerant of whitespace / `IF NOT EXISTS` / line breaks but
    // requires UNIQUE, the agreed-on index name, the `users` table,
    // and the LOWER(email) expression to all appear in the same
    // CREATE statement.
    const createMatch = migration.match(
      /CREATE\s+UNIQUE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+users_email_lower_unique\s+ON\s+users\s*\(\s*LOWER\s*\(\s*email\s*\)\s*\)/i,
    );
    expect(createMatch).not.toBeNull();
  });

  it('migration 035 includes a dedupe step that renames duplicate-email losers', () => {
    // The dedupe step has to (a) partition by LOWER(email), (b) keep
    // the lowest-id row, and (c) rewrite the loser's email so the
    // forthcoming UNIQUE LOWER(email) index can actually be created.
    expect(migration).toMatch(/PARTITION\s+BY\s+LOWER\s*\(\s*email\s*\)/i);
    expect(migration).toMatch(/ORDER\s+BY\s+id/i);
    expect(migration).toMatch(/UPDATE\s+users/i);
    expect(migration).toMatch(/\+dup/);
  });

  it('migration 035 mixes a random suffix into the rename target', () => {
    // The loser's rename target has to be globally unique against
    // every existing email, not just against its winner. Without a
    // random component an adversarial / accidental pre-existing email
    // of the form `<orig>+dup<id>@<domain>` would trip the existing
    // case-sensitive `users_email_unique` btree and abort the whole
    // migration. We require `gen_random_uuid()` to appear inside the
    // dedupe UPDATE so the rename target is collision-proof in
    // practice.
    expect(migration).toMatch(/gen_random_uuid\s*\(\s*\)/);
  });

  it('schema declares the matching uniqueIndex so db:push does not drop it', () => {
    // The declaration in `shared/schema/auth.ts` must agree with the
    // migration on (a) the index name and (b) the LOWER(email)
    // expression. drizzle-kit matches existing objects by name, so a
    // typo here would cause the next push to create a parallel index
    // with a generated name and leave the migration's index orphaned.
    expect(schema).toMatch(/uniqueIndex/);
    expect(schema).toMatch(
      /uniqueIndex\(\s*["']users_email_lower_unique["']\s*\)\s*\.on\(\s*sql`LOWER\(\$\{table\.email\}\)`\s*\)/,
    );
  });

  it('schema still imports uniqueIndex from drizzle-orm/pg-core', () => {
    // Belt-and-braces: if a future cleanup removes the import the
    // file will not compile, but the failure mode is much clearer
    // pointed at this assertion than at a TS error in an unrelated
    // build step.
    expect(schema).toMatch(
      /from\s+["']drizzle-orm\/pg-core["']/,
    );
    expect(schema).toMatch(/\buniqueIndex\b\s*,/);
  });
});
