-- 040_seed_account_statuses.sql
--
-- Seed the Account Status options used by the dashboard filter, the
-- Configuration → Field Settings → Account Status Settings card, and
-- every project form that surfaces a customer-status picker (Task #584).
--
-- BACKGROUND
-- ----------
-- The original seed file at `server/migrations/005-add-customer-status-configs.sql`
-- never ran on any database, ever — the migration runner
-- (`server/lib/migrations-runner.ts → resolveMigrationsDir`) only
-- reads files from the project-root `migrations/` directory. The
-- `server/migrations/` folder is a historical artifact from before
-- the runner existed and is not picked up by anything at boot. As a
-- result `customer_status_configs` has been empty on every install
-- since the table was introduced, and the Account Status dropdowns
-- have always rendered blank.
--
-- This migration fixes that for fresh installs (the seed runs the
-- first time the runner sees this file) and for existing deployments
-- (the same run picks up the empty table and populates it).
--
-- DELETION-STAYS-DELETED CONTRACT
-- -------------------------------
-- The migration runner records each applied filename in
-- `schema_migrations`, so this file runs at most once per database.
-- Once it has applied, nothing re-seeds these rows on subsequent
-- restarts. If an admin deletes "On Hold" (or any other seeded
-- status) the row stays gone across boots, redeploys, and image
-- rebuilds — the same contract Task #556 established for the metric
-- library seed in 039.
--
-- IDEMPOTENCY
-- -----------
-- Each `INSERT … WHERE NOT EXISTS` is keyed on `name` so:
--   * If a customer already has a hand-authored row with the same
--     name (e.g. they manually inserted "On Time" via psql before
--     this migration shipped), the seeder leaves that row alone —
--     no overwrite of their color/icon/description.
--   * If the file is ever re-applied (operator manually wipes
--     `schema_migrations`), the guard prevents duplicate inserts.
--
-- ICON COLUMN GUARD
-- -----------------
-- The `icon` column was added to `customer_status_configs` in the
-- drizzle schema (`shared/schema/config.ts`) but never had a
-- standalone migration — it shipped as part of a `db:push` workflow
-- on existing installs. The `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
-- below is a safety net so this seed file works on any database
-- where the column might still be missing.

ALTER TABLE "customer_status_configs"
  ADD COLUMN IF NOT EXISTS "icon" varchar;

INSERT INTO "customer_status_configs" ("name", "color", "icon", "description")
SELECT v.name, v.color, v.icon, v.description
FROM (VALUES
  ('On Time',                   '#10B981', 'Clock',         'Project is progressing as expected'),
  ('Complete',                  '#059669', 'CheckCircle2',  'All objectives have been met'),
  ('Need Assistance',           '#F59E0B', 'HelpCircle',    'Project requires support or guidance'),
  ('Delayed',                   '#EF4444', 'AlertTriangle', 'Project is behind schedule'),
  ('On Hold',                   '#6B7280', 'PauseCircle',   'Project is temporarily paused'),
  ('Pending Internal Feedback', '#8B5CF6', 'MessageSquare', 'Waiting for internal review or approval'),
  ('In CAB',                    '#0EA5E9', 'Shield',        'In Change Advisory Board review'),
  ('Evaluating Other Vendors',  '#F97316', 'Search',        'Customer is comparing alternative solutions'),
  ('Selecting Solution',        '#6366F1', 'Star',          'Customer has chosen our solution and is finalizing selection')
) AS v(name, color, icon, description)
WHERE NOT EXISTS (
  SELECT 1
  FROM "customer_status_configs" csc
  WHERE csc.name = v.name
);
