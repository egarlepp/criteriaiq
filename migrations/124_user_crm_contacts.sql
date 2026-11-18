-- Migration 124: Account Users imported from CRM contacts.
--
-- A linked account's CRM contacts can be ticked into Account Users
-- (server/crm/account-contacts.ts). The user remembers which contact it
-- came from; name and title follow the contact one way. The email is the
-- login, so a CRM change is stored in crm_email for an Admin to accept,
-- and a contact gone from the CRM account sets crm_contact_missing_at
-- instead of deactivating anyone. Users added in CriteriaIQ keep NULLs.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_contact_id varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_synced_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_email varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crm_contact_missing_at timestamp;

-- archived_users mirrors them as a record; restoreUser clears them.
ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS crm_provider varchar(32);
ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS crm_contact_id varchar(64);
ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS crm_synced_at timestamp;
ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS crm_email varchar;
ALTER TABLE archived_users ADD COLUMN IF NOT EXISTS crm_contact_missing_at timestamp;

CREATE UNIQUE INDEX IF NOT EXISTS users_crm_contact_unique
  ON users (crm_provider, crm_contact_id)
  WHERE crm_contact_id IS NOT NULL;
