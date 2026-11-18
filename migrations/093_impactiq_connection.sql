-- Migration 093: ImpactIQ connection.
--
-- The ImpactIQ address and an effort:read API key (ImpactIQ v1.448+), so a
-- project page can show the SE hours logged in ImpactIQ on the project's CRM
-- Opportunity (server/impactiq/). One row, id 1. api_key is AES-256-GCM
-- ciphertext under ENCRYPTION_KEY, listed in the key-rotation manifest
-- (ENCRYPTED_COLUMN_MANIFEST in server/routes/system-routes.ts).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS impactiq_connection (
  id integer PRIMARY KEY DEFAULT 1,
  base_url varchar(500) NOT NULL,
  api_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_check jsonb,
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT impactiq_connection_single_row CHECK (id = 1)
);
