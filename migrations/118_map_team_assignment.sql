-- Migration 118: MAP internal team owner + per-plan assignment roles.
--
-- map_phases / map_steps / map_tasks gain assigned_to_team_id: an internal
-- team (teams table) that owns the item. It only records responsibility;
-- project access is unchanged.
--
-- project_maps.assignment_roles lists the assignment roles a plan uses
-- (customerTeam, customerOwner, internalTeam, internalOwner,
-- additionalInternal). NULL means all of them, so existing plans keep
-- showing every role.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE map_phases ADD COLUMN IF NOT EXISTS assigned_to_team_id integer REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE map_steps ADD COLUMN IF NOT EXISTS assigned_to_team_id integer REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE map_tasks ADD COLUMN IF NOT EXISTS assigned_to_team_id integer REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE project_maps ADD COLUMN IF NOT EXISTS assignment_roles text[];

CREATE INDEX IF NOT EXISTS idx_map_phases_team ON map_phases (assigned_to_team_id);
CREATE INDEX IF NOT EXISTS idx_map_steps_team ON map_steps (assigned_to_team_id);
CREATE INDEX IF NOT EXISTS idx_map_tasks_team ON map_tasks (assigned_to_team_id);
