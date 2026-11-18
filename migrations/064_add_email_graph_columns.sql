-- Migration 064: Add Microsoft Graph sendMail transport columns to email_configuration (+ relax SMTP NOT NULL)
-- v0.7.50 added a second email transport (Microsoft Graph sendMail) alongside SMTP.
-- The Graph fields were added to the Drizzle schema (shared/schema/email.ts) but no
-- migration shipped with the release, so on an already-initialised database the new
-- columns were never created — GET /api/email-configuration (a SELECT *) then failed
-- with "column graph_tenant_id does not exist". This migration adds the eight Graph
-- columns and relaxes the NOT NULL on the three SMTP columns the schema made nullable
-- so a Graph-only configuration can be saved without SMTP credentials. All statements
-- are idempotent (IF NOT EXISTS / DROP NOT NULL is a no-op when already nullable), so
-- re-running after a manual hotfix ALTER is safe.

ALTER TABLE "email_configuration"
  ADD COLUMN IF NOT EXISTS "auth_type" varchar NOT NULL DEFAULT 'smtp',
  ADD COLUMN IF NOT EXISTS "graph_tenant_id" varchar,
  ADD COLUMN IF NOT EXISTS "graph_client_id" varchar,
  ADD COLUMN IF NOT EXISTS "graph_sender_email" varchar,
  ADD COLUMN IF NOT EXISTS "graph_credential_type" varchar DEFAULT 'secret',
  ADD COLUMN IF NOT EXISTS "graph_client_secret" text,
  ADD COLUMN IF NOT EXISTS "graph_certificate_pem" text,
  ADD COLUMN IF NOT EXISTS "graph_certificate_thumbprint" varchar;

-- SMTP fields relaxed to nullable in v0.7.50 (required-when-smtp is now enforced by
-- the Zod superRefine, not the DB). DROP NOT NULL is a no-op if already nullable.
ALTER TABLE "email_configuration" ALTER COLUMN "server" DROP NOT NULL;
ALTER TABLE "email_configuration" ALTER COLUMN "username" DROP NOT NULL;
ALTER TABLE "email_configuration" ALTER COLUMN "password" DROP NOT NULL;
