# Database Data Migrations

This directory contains SQL data migration scripts for the CriteriaIQ application.

## Schema vs Data Migrations

- **Schema Migrations**: Use `npm run db:push` (Drizzle Kit) to sync schema changes from `shared/schema.ts`
- **Data Migrations**: Use the SQL scripts in this directory to transform existing data

## Automatic Application on Startup (Task #388)

Starting in **v0.7.11**, the server automatically applies any unapplied
migrations from this directory **on startup**, immediately after the
database connection is bound and before request routes are mounted.

### How it works

- A `schema_migrations` table is created (if missing) on first run. It
  records the filename, content checksum, and `applied_at` timestamp of
  every migration that has been successfully applied.
- On boot, the runner scans `migrations/*.sql` in lexical order. Any
  filename matching the documented `NNN_description.sql` (or `NNN-...`)
  pattern that is **not** already recorded in `schema_migrations` is
  applied inside its own transaction, alongside the
  `INSERT INTO schema_migrations` row. A failure rolls back the whole
  file and aborts boot — the DB is never left half-migrated.
- Subsequent restarts are a no-op once everything is up to date.
- The runner is **skipped during the first-run setup wizard**
  (when no approved admin exists yet). The wizard's own
  `drizzle-kit push --force` step creates the schema; the runner takes
  over from the next restart onwards.
- Files that don't match the numbered naming convention are ignored.
  This includes `backup.sql` (a pg_dump snapshot) and anything in
  the `db_refactor/` subdirectory — none of these are part of the
  standard upgrade path.
- Existing migration files **must never be edited** after they've been
  applied to any environment. The runner detects checksum drift and
  logs a warning, but it will not re-apply a changed file. To correct
  a previous migration, add a new one with the next sequence number.

### When you still need to run migrations manually

- **Replaying against a fresh DB outside the app** (e.g. seeding a CI
  database or local snapshot before the server has booted).
- **Forcing a re-run** of an idempotent migration after a manual data
  fix (delete the corresponding row from `schema_migrations` first,
  then restart the server).
- **Pre-`v0.7.11` upgrades**: deployments running an older release
  won't have the runner yet, so a one-time manual `psql -f` of any
  pending migrations may still be required before upgrading.

## How to Run Data Migrations Manually

To run a specific migration:

```bash
psql $DATABASE_URL -f migrations/001_migrate_end_date_flags_colors.sql
```

To run all migrations:

```bash
for file in migrations/*.sql; do
  echo "Running migration: $file"
  psql $DATABASE_URL -f "$file"
done
```

## Migration Naming Convention

Migrations should be named: `NNN_description_of_migration.sql`

- NNN: Sequential number (001, 002, etc.)
- description: Brief description of what the migration does

## Current Migrations

- `001_migrate_end_date_flags_colors.sql`: Convert legacy badge color variant names to hex codes
- `026_normalize_custom_report_list_filters.sql`: Rewrite legacy comma-joined `in`/`not_in` filter values on `custom_reports.filters` into real JSON string arrays. Idempotent.
- `028_split_assumptions_dependencies_to_join_tables.sql`: Migrate legacy project-scoped rows in `assumptions` / `dependencies` into the `project_assumptions` / `project_dependencies` join tables, drop the obsolete project-scoped columns from the library tables, and backfill icons on legacy system categories. Extracted from the retired `initializeAssumptionDependencyTables` startup patch (Task #304). Idempotent.
- `029_create_app_state.sql`: Create the singleton `app_state` table (Task #378) on already-set-up self-hosted deployments and seed the row with `setup_completed_at` backfilled from the earliest approved admin's `users.created_at` (or `NOW()` if none). Without this, `/api/setup/status` returns `null` on upgraded environments and re-entries to `/setup` restart the wizard at step 1. Idempotent.
- `031_add_archived_reason_to_users_and_projects.sql`: Add the `archived_reason` text column to `archived_users` and `archived_projects` so all three archive tables carry the same bookkeeping triple (`archived_at`, `archived_by`, `archived_reason`) that `archived_customers` already had. Closes the schema gap that the Archive Schema Validation health check has been excluding for. Idempotent.
- `035_users_email_case_insensitive_unique.sql`: Enforce case-insensitive uniqueness on `users.email` (Task #538). Renames the lowest-id-loses duplicates of any pre-existing `LOWER(email)` collision (suffixing `+dup<id>` before the `@` and flipping `is_active=false`), then drops the non-unique `users_email_lower_idx` from migration 034 and replaces it with a UNIQUE functional index `users_email_lower_unique` on `LOWER(email)`. Mirrored by the schema declaration in `shared/schema/auth.ts` so future `db:push` runs do not drop it. Idempotent.
