-- Migration 086: CRM record ids on projects.
--
-- Lets API clients (ImpactIQ) look a project up by its CRM records instead
-- of matching on the free-text opportunity name. CRM-neutral so HubSpot can
-- share the columns:
--
--   crm_provider        'salesforce' | 'hubspot'
--   crm_opportunity_id  Salesforce Opportunity id / HubSpot Deal id
--   crm_account_id      Salesforce Account id / HubSpot Company id
--
-- Salesforce ids are stored in their 18-character form. archived_projects
-- mirrors the columns so archive + restore keeps them. All nullable; no
-- existing row changes. Existing projects are filled by the admin backfill
-- (Admin > Integrations > Salesforce > Sync History).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_opportunity_id varchar(64);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS crm_account_id varchar(64);

CREATE INDEX IF NOT EXISTS idx_projects_crm_opportunity_id ON projects (crm_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_projects_crm_account_id ON projects (crm_account_id);

ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS crm_opportunity_id varchar(64);
ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS crm_account_id varchar(64);
