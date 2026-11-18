-- Migration 116: subteams from the CRM.
--
-- subteams.crm_departments links a subteam to up to 5 CRM groups
-- (Salesforce User.Department values, or HubSpot team ids), like
-- teams.crm_departments (migration 113). The team_crm_sync job puts each
-- matching person on the subteam and on its team, as places with source
-- 'crm', and takes them off ones that no longer match. Places an admin
-- added by hand, or that SSO sign-in added, are never removed.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE subteams ADD COLUMN IF NOT EXISTS crm_departments text[] NOT NULL DEFAULT '{}';
