-- Migration 121: accounts hold their CRM account id.
--
-- customers.salesforce_account_url (a Salesforce or HubSpot record URL) was
-- the only CRM link, so it couldn't be indexed or kept unique. Storage now
-- parses the id out of that URL on every save into crm_provider +
-- crm_account_id, unique per CRM, so one CRM account can't be linked to
-- two CriteriaIQ accounts. Existing rows are filled at boot by
-- backfillCustomerCrmAccountIds() (server/storage/backfills.ts), because
-- turning a 15-character Salesforce id into its 18-character form needs
-- the checksum code in shared/crm-record-id.ts.
--
-- crm_link_exception_*: with a CRM active an account must be linked; an
-- Admin may approve an unlinked one, with a reason.
--
-- archived_customers mirrors the columns without the unique index.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_account_id varchar(64);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_synced_at timestamp;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_link_exception_reason text;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_link_exception_by varchar;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS crm_link_exception_at timestamp;

ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_account_id varchar(64);
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_synced_at timestamp;
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_link_exception_reason text;
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_link_exception_by varchar;
ALTER TABLE archived_customers ADD COLUMN IF NOT EXISTS crm_link_exception_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS customers_crm_account_unique
  ON customers (crm_provider, crm_account_id)
  WHERE crm_account_id IS NOT NULL;
