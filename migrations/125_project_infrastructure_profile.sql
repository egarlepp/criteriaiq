-- Migration 125: a project can point at one Infrastructure Discovery profile.
--
-- An account keeps several Infrastructure Discovery profiles
-- (infrastructure_profiles). Create Project and the project's overview card
-- now let the user attach one of the account's profiles to the project;
-- the overview card shows it as a link that opens the profile.
--
-- Soft reference, no FK: profiles are deleted from the drawer at any time
-- and archived projects keep the id in archived_projects, so readers treat
-- a missing profile as "none attached". The project routes only accept a
-- profile that belongs to the project's own account.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS. No backfill: existing projects
-- start with nothing attached.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS infrastructure_profile_id integer;
ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS infrastructure_profile_id integer;
