-- 036_drop_user_fks_for_archive_user_sweep.sql
--
-- Drop the remaining FK constraints on NOT NULL `users(id)` references
-- that live OUTSIDE of `projects` (Task #542).
--
-- Background: Task #527 dropped the FKs on the engineer slots and
-- Task #533 dropped the FKs on the remaining `projects` user-id
-- columns so `archiveUser` could stamp a `(D)` placeholder string
-- into them and `restoreUser` could later swap the real user id back
-- in. But many other tables still hold FK constraints back to
-- `users(id)` that `archiveUser` did not sweep:
--
--   * `validation_criteria_templates.created_by`
--   * `map_templates.created_by_user_id`
--   * `system_announcements.created_by`
--   * `support_requests.submitted_by_user_id`
--   * `custom_reports.created_by`
--   * `audit_logins.user_id`
--   * `kanban_audit_events.user_id`
--   * `report_executions.executed_by`
--   * `documents.uploaded_by_user_id`
--   * `documents.owner_id`
--   * `links.owner_id`
--   * `code_scripts.owner_id`
--   * `infrastructure_profiles.created_by`
--   * `activity_logs.user_id`
--   * `project_audits.user_id`
--   * `evaluation_requests.user_id`
--   * `user_board_preferences.user_id`
--   * `user_report_favorites.user_id`
--
-- If the user being archived was referenced in any of these slots,
-- the final `DELETE FROM users` inside `archiveUser`'s transaction
-- tripped the FK and rolled back the whole archive — same 500 /
-- no-actionable-detail failure shape Tasks #527 and #533 just fixed
-- for the project-side slots.
--
-- The fix is to treat all of these as soft references. The columns
-- stay NOT NULL and continue to hold the original user id even after
-- the user is deleted; when the user is restored (re-INSERTed with
-- the same id), the soft reference naturally resolves again. Because
-- the user id stays stamped, `restoreUser` does not need any
-- per-table swap logic for these columns — the original id is still
-- there, the user row simply comes back into existence.
--
-- Nullable user-id columns on the same and other tables are handled
-- separately by widening the `archiveUser` sweep to UPDATE … SET
-- col = NULL across them (forgotten attribution, semantically
-- consistent on restore — NULL stays NULL).
--
-- The schema definitions in `shared/schema/*.ts` have been updated
-- to drop the matching `.references(...)` clauses so future
-- `db:push` runs will not recreate these constraints; this migration
-- catches existing databases where the constraints are already
-- present.
--
-- Idempotent: `DROP CONSTRAINT IF EXISTS` is a no-op on environments
-- that never had the constraint (e.g. fresh installs created after
-- the schema change).

ALTER TABLE validation_criteria_templates
  DROP CONSTRAINT IF EXISTS validation_criteria_templates_created_by_users_id_fk;

ALTER TABLE map_templates
  DROP CONSTRAINT IF EXISTS map_templates_created_by_user_id_users_id_fk;

ALTER TABLE system_announcements
  DROP CONSTRAINT IF EXISTS system_announcements_created_by_users_id_fk;

ALTER TABLE support_requests
  DROP CONSTRAINT IF EXISTS support_requests_submitted_by_user_id_users_id_fk;

ALTER TABLE custom_reports
  DROP CONSTRAINT IF EXISTS custom_reports_created_by_users_id_fk;

ALTER TABLE audit_logins
  DROP CONSTRAINT IF EXISTS audit_logins_user_id_users_id_fk;

ALTER TABLE kanban_audit_events
  DROP CONSTRAINT IF EXISTS kanban_audit_events_user_id_users_id_fk;

ALTER TABLE report_executions
  DROP CONSTRAINT IF EXISTS report_executions_executed_by_users_id_fk;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_uploaded_by_user_id_users_id_fk;

ALTER TABLE documents
  DROP CONSTRAINT IF EXISTS documents_owner_id_users_id_fk;

ALTER TABLE links
  DROP CONSTRAINT IF EXISTS links_owner_id_users_id_fk;

ALTER TABLE code_scripts
  DROP CONSTRAINT IF EXISTS code_scripts_owner_id_users_id_fk;

ALTER TABLE infrastructure_profiles
  DROP CONSTRAINT IF EXISTS infrastructure_profiles_created_by_users_id_fk;

ALTER TABLE activity_logs
  DROP CONSTRAINT IF EXISTS activity_logs_user_id_users_id_fk;

ALTER TABLE project_audits
  DROP CONSTRAINT IF EXISTS project_audits_user_id_users_id_fk;

ALTER TABLE evaluation_requests
  DROP CONSTRAINT IF EXISTS evaluation_requests_user_id_users_id_fk;

-- The two tables below are DELETEd outright by `archiveUser` (per-user
-- state with no meaning after the user is gone), but we also drop the
-- DB-level FK so the schema files (which now declare these as soft
-- references) stay aligned with the live DB and avoid drift warnings.
ALTER TABLE user_board_preferences
  DROP CONSTRAINT IF EXISTS user_board_preferences_user_id_users_id_fk;

ALTER TABLE user_report_favorites
  DROP CONSTRAINT IF EXISTS user_report_favorites_user_id_users_id_fk;
