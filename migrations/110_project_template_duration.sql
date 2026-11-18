-- Migration 110: a working-day duration on project templates.
--
-- A project made from the template gets its end date this many working days
-- after its start date (weekends and default holidays skipped). Null keeps
-- the old 14 working days (docs/features/working-calendar.md). No existing
-- row changes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS duration_working_days integer;
