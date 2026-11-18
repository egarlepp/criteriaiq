-- Migration 122: linked accounts take their CRM-owned fields from the CRM.
--
-- A linked account's name, industry, region, website and owner come from
-- the CRM, one way (Eric, 2026-11-02; docs/features/crm-provider.md). The
-- refresh (server/crm/account-refresh.ts) lists the fields it filled in
-- crm_managed_fields; those are read-only in CriteriaIQ until the account
-- is unlinked.
--
-- website: the CRM account's website, shown read-only and used later for
--   duplicate suggestions.
-- crm_linked_by: whose CRM connection refreshes the account. Salesforce has
--   no org-wide connection, so background refreshes use the linking user's.
-- crm_record_missing_at: set when the CRM says the record is gone.
--
-- Account fields no longer go to the CRM (decision 1, 2026-11-02), so
-- account field mappings become inbound only: bidirectional ones turn
-- inbound, outbound-only ones are switched off. Admins can't create
-- outbound account mappings again (admin-salesforce-routes.ts).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS, and the updates only touch rows
-- still in the old state.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_managed_fields text[];
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_linked_by varchar;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_record_missing_at timestamp;

ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_managed_fields text[];
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_linked_by varchar;
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_record_missing_at timestamp;

UPDATE salesforce_field_mappings
   SET direction = 'inbound', updated_at = now()
 WHERE cqi_entity = 'customer' AND direction = 'bidirectional';

UPDATE salesforce_field_mappings
   SET is_active = false, updated_at = now()
 WHERE cqi_entity = 'customer' AND direction = 'outbound' AND is_active IS DISTINCT FROM false;
