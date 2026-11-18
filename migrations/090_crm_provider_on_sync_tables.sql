-- Migration 090: tag field mappings, record links, sync policies and sync
-- runs with the CRM they belong to.
--
-- The field-mapping, linking and sync tables (named salesforce_* for
-- history) now serve HubSpot too. Every existing row is Salesforce's. The
-- app reads only the active CRM's rows, so switching CRMs never mixes them.
-- HubSpot record ids are numeric strings up to 20 digits, longer than the
-- 18-character Salesforce limit on salesforce_record_links.sf_record_id.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS, and the type change is a no-op once
-- applied.

ALTER TABLE salesforce_field_mappings ADD COLUMN IF NOT EXISTS crm_provider varchar NOT NULL DEFAULT 'salesforce';
ALTER TABLE salesforce_record_links ADD COLUMN IF NOT EXISTS crm_provider varchar NOT NULL DEFAULT 'salesforce';
ALTER TABLE salesforce_sync_policies ADD COLUMN IF NOT EXISTS crm_provider varchar NOT NULL DEFAULT 'salesforce';
ALTER TABLE salesforce_sync_runs ADD COLUMN IF NOT EXISTS crm_provider varchar NOT NULL DEFAULT 'salesforce';

ALTER TABLE salesforce_record_links ALTER COLUMN sf_record_id TYPE varchar(32);

CREATE INDEX IF NOT EXISTS idx_sf_mappings_crm_provider ON salesforce_field_mappings (crm_provider);
CREATE INDEX IF NOT EXISTS idx_sf_record_links_crm_provider ON salesforce_record_links (crm_provider);
CREATE INDEX IF NOT EXISTS idx_sf_sync_runs_crm_provider ON salesforce_sync_runs (crm_provider);
