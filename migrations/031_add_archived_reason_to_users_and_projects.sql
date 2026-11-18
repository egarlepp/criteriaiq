-- 031_add_archived_reason_to_users_and_projects.sql
--
-- Brings the archive bookkeeping columns into a consistent shape across
-- the three archive tables. `archived_customers` already carries
-- `archived_reason` (added via server/migrations/008-add-customer-archive-fields.sql
-- when the customers table picked up the column), but `archived_users`
-- and `archived_projects` were never updated to match. The Archive
-- Schema Validation health check (server/services/health-monitor.ts →
-- validateArchiveSchemas) already treats `archived_reason` as part of
-- the canonical "archive metadata" exclude list, so adding the column
-- here closes a real schema gap rather than a cosmetic one.
--
-- Practical effect: when a user or project is archived, the storage
-- methods can now persist the optional reason that was previously only
-- written to `archive_log`. Existing archived rows backfill to NULL,
-- which is fine — they were archived before this column existed.
--
-- Both columns are added with `IF NOT EXISTS` so re-running the
-- migration on a partially-fixed environment is a no-op.

ALTER TABLE archived_users
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;

ALTER TABLE archived_projects
  ADD COLUMN IF NOT EXISTS archived_reason TEXT;
