-- Migration 078: Okta SSO + Azure SSO (Microsoft Entra ID).
--
-- `sso_config` held one row (Okta). Admin › Integrations now offers two
-- sign-in providers, as ImpactIQ does: Okta SSO (row id 1) and Azure SSO
-- (row id 2). The old `id = 1` singleton CHECK becomes a one-row-per-
-- provider CHECK, so the table still cannot grow stray rows.
--
-- New columns (ImpactIQ's provider fields):
--   tenant_id    — Azure directory (tenant) id or verified domain. Unused for Okta.
--   redirect_uri — optional override; NULL derives it from PUBLIC_APP_URL
--                  at request time (unchanged behaviour for existing rows).
--   allow_jit    — create a CriteriaIQ user on first SSO sign-in. TRUE keeps
--                  today's Okta behaviour; the Azure row is created with FALSE.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on redeploy.
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS, and a
-- pg_constraint guard on the new CHECK.

ALTER TABLE sso_config ADD COLUMN IF NOT EXISTS tenant_id VARCHAR;
ALTER TABLE sso_config ADD COLUMN IF NOT EXISTS redirect_uri VARCHAR;
ALTER TABLE sso_config ADD COLUMN IF NOT EXISTS allow_jit BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE sso_config DROP CONSTRAINT IF EXISTS sso_config_singleton;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sso_config_provider_row'
      AND conrelid = 'sso_config'::regclass
  ) THEN
    ALTER TABLE sso_config
      ADD CONSTRAINT sso_config_provider_row
      CHECK ((id = 1 AND provider = 'okta') OR (id = 2 AND provider = 'azure'));
  END IF;
END $$;
