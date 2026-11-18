-- Migration 025: Add storage_configuration table for multi-cloud storage provider support
-- This table stores the active cloud storage provider config with encrypted credentials.
-- Priority during init: DB enabled config → env vars → local disk fallback.
-- The singleton_key column + unique index below enforce at most one row in this table.

CREATE TABLE IF NOT EXISTS storage_configuration (
  id                    SERIAL PRIMARY KEY,
  enabled               BOOLEAN DEFAULT TRUE,
  provider              VARCHAR NOT NULL DEFAULT 'local',
  -- Singleton guard
  singleton_key         BOOLEAN NOT NULL DEFAULT TRUE,
  -- GCS fields
  gcs_bucket_name       TEXT,
  gcs_key_json          TEXT,
  -- AWS S3 fields
  aws_region            TEXT,
  aws_bucket_name       TEXT,
  aws_access_key_id     TEXT,
  aws_secret_access_key TEXT,
  -- Azure Blob fields
  azure_account_name    TEXT,
  azure_account_key     TEXT,
  azure_container_name  TEXT,
  azure_sas_token       TEXT,
  -- Audit fields
  created_by            VARCHAR REFERENCES users(id),
  updated_by            VARCHAR REFERENCES users(id),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- Enforce that only one configuration row can ever exist
CREATE UNIQUE INDEX IF NOT EXISTS storage_configuration_singleton
  ON storage_configuration (singleton_key);

-- Enforce that the singleton column is always TRUE (no partial flag abuse)
DO $$ BEGIN
  ALTER TABLE storage_configuration
    ADD CONSTRAINT storage_configuration_singleton_true CHECK (singleton_key = TRUE);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
