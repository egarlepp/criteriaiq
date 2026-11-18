-- Migration 056: Create api_keys and n8n_config tables
--
-- api_keys: Stores hashed Bearer tokens that external systems (primarily n8n)
-- use to authenticate against CriteriaIQ's REST API. Raw tokens are never
-- stored — only a bcrypt hash plus a short prefix for display.
--
-- n8n_config: Single-row configuration table holding the n8n host URL and an
-- encrypted n8n-side API key (AES-256-GCM), used when CriteriaIQ optionally
-- calls n8n's management API. Mirrors the salesforce_oauth_config pattern.

CREATE TABLE IF NOT EXISTS api_keys (
  id              SERIAL        PRIMARY KEY,
  key_hash        VARCHAR(255)  NOT NULL UNIQUE,
  key_prefix      VARCHAR(12)   NOT NULL,
  label           VARCHAR(255)  NOT NULL,
  created_by      VARCHAR       NOT NULL REFERENCES users(id),
  scopes          JSONB         NOT NULL DEFAULT '["admin"]'::jsonb,
  last_used_at    TIMESTAMP,
  expires_at      TIMESTAMP,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMP     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS n8n_config (
  id               SERIAL       PRIMARY KEY,
  host_url         VARCHAR(500),
  api_key_enc      TEXT,
  is_enabled       BOOLEAN      NOT NULL DEFAULT false,
  last_tested_at   TIMESTAMP,
  last_test_result VARCHAR(50),
  last_test_error  TEXT,
  updated_by       VARCHAR,
  updated_at       TIMESTAMP    DEFAULT NOW()
);
