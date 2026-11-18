-- Migration 115: Demo Mode teams.
--
-- The demo seed creates its own teams and subteams (staffed by the Demo
-- Staff users) so Admin › Team & People › Teams and the team filters show
-- them in Demo Mode. Teams get the is_demo flag; subteams and both member
-- tables hang off a team and cascade with it, so they need no flag of
-- their own. Demo Mode shows only demo teams and the real install never
-- shows them. Existing rows stay real (default false).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_teams_is_demo ON teams (is_demo);
