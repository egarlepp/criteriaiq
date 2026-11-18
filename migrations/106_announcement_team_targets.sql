-- Migration 106: teams as announcement recipients.
--
-- system_announcements.target_team_ids / target_subteam_ids hold team and
-- subteam ids (JSON arrays). When set, only people on those teams, or on
-- those subteams or subteams nested under them, see the announcement and
-- get its email. They narrow the existing role and user targets, like
-- those do each other. Resolved when read, so team changes apply at once
-- (docs/features/teams.md). Nullable; no existing row changes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE system_announcements ADD COLUMN IF NOT EXISTS target_team_ids jsonb;
ALTER TABLE system_announcements ADD COLUMN IF NOT EXISTS target_subteam_ids jsonb;
