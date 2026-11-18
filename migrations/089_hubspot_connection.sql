-- Migration 089: HubSpot connection and owners.
--
-- A local copy of the HubSpot portal's owner list (active and archived),
-- refreshed by the daily `hubspot_owner_sync` job and the Sync owners button
-- on Admin › Integrations › HubSpot. CriteriaIQ users are matched to owners
-- by email (case-insensitive), so the index is on lower(email).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS hubspot_owners (
  id varchar(32) PRIMARY KEY,
  hubspot_user_id varchar(32),
  email varchar,
  first_name varchar,
  last_name varchar,
  archived boolean NOT NULL DEFAULT false,
  last_synced_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hubspot_owners_email ON hubspot_owners (lower(email));

-- The one HubSpot connection row (id 1). access_token is AES-256-GCM
-- ciphertext under ENCRYPTION_KEY, listed in the key-rotation manifest
-- (ENCRYPTED_COLUMN_MANIFEST in server/routes/system-routes.ts).
CREATE TABLE IF NOT EXISTS hubspot_connection (
  id integer PRIMARY KEY DEFAULT 1,
  access_token text NOT NULL,
  portal_id varchar(32),
  portal_name varchar,
  account_type varchar,
  ui_domain varchar,
  last_check jsonb,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT hubspot_connection_single_row CHECK (id = 1)
);
