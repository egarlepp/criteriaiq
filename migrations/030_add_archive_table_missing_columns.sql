-- 030_add_archive_table_missing_columns.sql
--
-- Backfills two columns into the archive tables that were added to the
-- live source tables in earlier migrations but never propagated to their
-- archive counterparts. The Archive Schema Validation health check
-- (server/services/health-monitor.ts → validateArchiveSchemas) flagged
-- both as "missing in archive table" — without these columns the archive
-- snapshot loses data when a user/project is archived.
--
-- 1) archived_users.password_history (text[])
--    Added to `users` in migration 027_add_user_password_history.sql but
--    not mirrored on `archived_users`. Same shape and default as the
--    source column so existing archive rows backfill to an empty array
--    (matching the safe-backfill story in 027).
--
-- 2) archived_projects.vrl_template_id (integer)
--    Added to `projects` for the Value Realization Lifecycle template
--    selector but never mirrored on `archived_projects`. Nullable to
--    match the source column — projects archived before they had a VRL
--    template assigned simply carry a NULL.
--
-- Both columns are added with `IF NOT EXISTS` so re-running the
-- migration on a partially-fixed environment is a no-op.

ALTER TABLE archived_users
  ADD COLUMN IF NOT EXISTS password_history TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE archived_projects
  ADD COLUMN IF NOT EXISTS vrl_template_id INTEGER;
