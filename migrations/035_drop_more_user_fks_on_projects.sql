-- 035_drop_more_user_fks_on_projects.sql
--
-- Drop the remaining FK constraints on `projects` columns that
-- reference `users(id)`: `customer_user_id`, `tcc_user_id`, and
-- `created_by` (Task #533).
--
-- Background: Task #527 dropped the FK constraints on the engineer
-- slots (`primary_engineer_id`, `specialist_engineer_id`) so
-- `archiveUser` could stamp a `"First Last (D)"` placeholder string
-- into them and `restoreUser` could later swap the real user id back
-- in. Three other user-id columns on `projects` continued to carry
-- FKs back to `users(id)` and were NOT cleared by `archiveUser`
-- before the final `DELETE FROM users` ran inside the same
-- transaction. If the user being archived was referenced as
-- `customer_user_id`, `tcc_user_id`, or `created_by` on any project,
-- the DELETE tripped the corresponding FK
-- (`projects_customer_user_id_users_id_fk` /
--  `projects_tcc_user_id_users_id_fk` /
--  `projects_created_by_users_id_fk`) and rolled back the entire
-- archive transaction — same 500 / no-actionable-detail failure shape
-- Task #527 fixed for the engineer slots.
--
-- The fix is to treat these columns as soft references too. The
-- schema definition in `shared/schema/projects.ts` has been updated
-- to drop the `.references(...)` clauses so future `db:push` runs
-- will not recreate the constraints; this migration catches existing
-- databases where the constraints are already present.
--
-- Idempotent: `DROP CONSTRAINT IF EXISTS` is a no-op on environments
-- that never had the constraint (e.g. fresh installs created after
-- the schema change).

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_customer_user_id_users_id_fk;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_tcc_user_id_users_id_fk;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_created_by_users_id_fk;
