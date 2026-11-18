-- Migration 105: owning team on projects.
--
-- projects.team_id / subteam_id name the team (and optionally one of its
-- subteams) a validation belongs to. Teams only organize and filter
-- projects; they never change who can open one (docs/features/teams.md).
-- Both clear themselves when the team or subteam is deleted.
-- archived_projects mirrors the columns without foreign keys, so archive
-- and restore keep the choice; a team deleted meanwhile is cleared on
-- restore. All nullable; no existing row changes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id integer REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subteam_id integer REFERENCES subteams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_team_id ON projects (team_id);

ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS team_id integer;
ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS subteam_id integer;
