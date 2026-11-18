-- 033_drop_engineer_id_fks.sql
--
-- Drop the FK constraints on `projects.primary_engineer_id` and
-- `projects.specialist_engineer_id` that reference `users(id)`
-- (Task #527).
--
-- archiveUser stamps a human-readable placeholder string
-- (e.g. "First Last (D)") into these two columns so restoreUser can
-- later find the displaced ownership slots and swap the real user id
-- back in. The placeholder is by definition NOT a real users.id, so
-- the UPDATE that writes it failed against the FK with
-- `projects_primary_engineer_id_users_id_fk` /
-- `projects_specialist_engineer_id_users_id_fk` and rolled back the
-- whole archive transaction. End result: any user referenced as a
-- primary or specialist engineer on any project simply could not be
-- archived — the operator got a 500 with no actionable detail.
--
-- The fix is to treat these columns as soft references, the same way
-- `account_representative_id`, `opportunity_engineer_id`, and the
-- `supporting_engineers` text[] array on this same table already store
-- user ids without an FK. The schema definition in
-- `shared/schema/projects.ts` has been updated to match so future
-- `db:push` runs will not recreate these constraints; this migration
-- catches existing databases where the constraints are already
-- present.
--
-- Idempotent: `DROP CONSTRAINT IF EXISTS` is a no-op on environments
-- that never had the constraint (e.g. fresh installs created after
-- the schema change).

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_primary_engineer_id_users_id_fk;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_specialist_engineer_id_users_id_fk;
