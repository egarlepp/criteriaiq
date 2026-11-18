-- Migration 102: per-user Outlook sign-in.
--
-- Each person can link their own Outlook calendar on Profile Settings ›
-- Integrations (ported from ImpactIQ's My Settings). The admin saves the
-- Microsoft Entra app on Admin › Integrations › Overview › Outlook sign-in
-- (outlook_signin_config, one row, id 1); each person's tokens go in
-- user_integrations with provider 'microsoft'.
--
-- outlook_signin_config.client_secret and user_integrations' token columns
-- are AES-256-GCM ciphertext under ENCRYPTION_KEY, listed in the key-rotation
-- manifest (server/lib/encrypted-columns.ts).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS expires_at timestamp;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS account_label varchar(320);

CREATE TABLE IF NOT EXISTS outlook_signin_config (
  id integer PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  tenant_id varchar(100) NOT NULL,
  client_id varchar(64) NOT NULL,
  client_secret text NOT NULL,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT outlook_signin_config_single_row CHECK (id = 1)
);
