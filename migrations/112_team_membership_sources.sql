-- Migration 112: teams from SSO groups.
--
-- team_members.source / subteam_members.source record how a place was
-- made: manual (an admin), sso (Okta or Azure sign-in) or crm (the CRM
-- sync). A sync only adds and removes places of its own source, so a team
-- an admin added by hand is never removed by it. Existing rows are manual.
--
-- sso_config.team_mapping is the provider's Group → Team table, a JSON
-- array of { group, teamId, subteamId } (docs/features/teams.md).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS source varchar(10) NOT NULL DEFAULT 'manual';
ALTER TABLE subteam_members ADD COLUMN IF NOT EXISTS source varchar(10) NOT NULL DEFAULT 'manual';
ALTER TABLE sso_config ADD COLUMN IF NOT EXISTS team_mapping jsonb NOT NULL DEFAULT '[]'::jsonb;
