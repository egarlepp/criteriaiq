-- Migration 071: OIDC Single Sign-On (Okta).
--
-- Creates the `sso_config` singleton (one row, ever) that drives the
-- OIDC flow in `server/auth/oidcAuth.ts`, and adds nullable SSO
-- columns to `users` so a single account row can be either
-- password-only, SSO-only, or both (hybrid coexistence).
--
-- Mirrors the `app_state` / `audit_logins_cleanup_state` singleton
-- pattern: id is constrained to literal 1 by a CHECK so the table
-- cannot grow a second row. The Drizzle schema declaration in
-- `shared/schema/auth.ts` mirrors the same CHECK so `drizzle-kit
-- push` against a fresh DB does not race this runner to a different
-- table shape.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. After editing this file, also run `npm run
-- schema:snapshot` so the `lint:schema` build gate stays green.

CREATE TABLE IF NOT EXISTS sso_config (
  id                          INTEGER       PRIMARY KEY DEFAULT 1,
  provider                    VARCHAR       NOT NULL DEFAULT 'okta',
  enabled                     BOOLEAN       NOT NULL DEFAULT false,
  issuer_url                  VARCHAR,
  client_id                   VARCHAR,
  -- AES-256-GCM encrypted via server/auth/mfaUtils.ts encryptText/decryptText.
  client_secret_enc           TEXT,
  scopes                      VARCHAR       NOT NULL DEFAULT 'openid profile email groups',
  group_claim_name            VARCHAR       NOT NULL DEFAULT 'groups',
  role_mapping                JSONB         NOT NULL DEFAULT '{}'::jsonb,
  default_role_for_unmapped   VARCHAR       NOT NULL DEFAULT 'Engineer',
  require_mfa_trust           BOOLEAN       NOT NULL DEFAULT true,
  sync_role_on_every_login    BOOLEAN       NOT NULL DEFAULT false,
  rp_initiated_logout         BOOLEAN       NOT NULL DEFAULT false,
  last_tested_at              TIMESTAMP,
  last_test_result            VARCHAR,
  last_test_error             TEXT,
  created_by                  VARCHAR,
  updated_by                  VARCHAR,
  created_at                  TIMESTAMP     DEFAULT NOW(),
  updated_at                  TIMESTAMP     DEFAULT NOW(),
  CONSTRAINT sso_config_singleton CHECK (id = 1)
);

-- Idempotent users column additions. Each ALTER is wrapped in its own
-- statement so re-running the migration on a partially-applied DB
-- recovers cleanly.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_provider VARCHAR,
  ADD COLUMN IF NOT EXISTS sso_external_id VARCHAR,
  ADD COLUMN IF NOT EXISTS sso_last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS sso_link_prompt_dismissed_at TIMESTAMP;

-- Partial index used by the OIDC callback's `findUserBySsoExternalId`
-- fast path. Restricted to non-NULL rows so the index does not bloat
-- with NULLs from every password-only user.
CREATE INDEX IF NOT EXISTS users_sso_idx
  ON users (sso_provider, sso_external_id)
  WHERE sso_external_id IS NOT NULL;
