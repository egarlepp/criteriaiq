-- Migration 113: teams from the CRM.
--
-- teams.crm_departments links a team to up to 5 CRM groups: Salesforce
-- User.Department values, or HubSpot team ids. The daily team_crm_sync
-- job (and Sync from CRM on the Teams page) puts each internal person on
-- the teams linked to their department or HubSpot team, as places with
-- source 'crm' (migration 112), and takes them off ones that no longer
-- match. Teams an admin added by hand are never removed.
--
-- hubspot_owners.teams keeps each owner's HubSpot teams
-- ([{ id, name, primary }]) from the daily owner sync.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE teams ADD COLUMN IF NOT EXISTS crm_departments text[] NOT NULL DEFAULT '{}';
ALTER TABLE hubspot_owners ADD COLUMN IF NOT EXISTS teams jsonb NOT NULL DEFAULT '[]'::jsonb;
