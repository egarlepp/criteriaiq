-- Migration 021: Add workflow sync filter columns to n8n_config
--
-- These columns let admins control which n8n workflows CriteriaIQ fetches
-- and displays:
--   filter_webhook_only  — only fetch workflows that have a Webhook trigger node
--   filter_active_only   — only fetch active (enabled) workflows
--   filter_owner         — restrict to a specific owner name/email substring (null = all)
--   workflow_limit       — max workflows to request from the n8n API (default 100)
--
-- All have safe defaults so existing rows need no backfill beyond the ALTER.

ALTER TABLE n8n_config
  ADD COLUMN IF NOT EXISTS filter_webhook_only BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS filter_active_only  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS filter_owner        TEXT,
  ADD COLUMN IF NOT EXISTS workflow_limit      INTEGER NOT NULL DEFAULT 100;
