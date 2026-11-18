-- Migration 022: Add trigger-type filter columns to n8n_config
--
-- Extends the workflow sync filter set with two per-trigger-type toggles so
-- admins can include workflows with Schedule or Manual triggers alongside
-- (or instead of) the existing Webhook-only filter.
--
-- Semantics: when at least one trigger-type flag is true, only workflows
-- matching ANY of the enabled types are returned. Defaults to false so
-- existing installs continue with webhook-only behaviour unchanged.

ALTER TABLE n8n_config
  ADD COLUMN IF NOT EXISTS filter_schedule_triggers BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS filter_manual_triggers   BOOLEAN NOT NULL DEFAULT FALSE;
