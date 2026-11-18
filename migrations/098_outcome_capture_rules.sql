-- Migration 098: Outcome Intelligence capture rules
-- (docs/features/outcome-intelligence-system.md).
--
-- outcome_config gains: what counts as a closure (Internal Status lists,
-- the CRM's own flags, or either), how hard to ask (optional / prompt /
-- required), per-outcome-type overrides, and reminder / escalation days.
-- Defaults reproduce the behaviour before this migration: Internal Status
-- "Cancelled" or Sales Stage "Closed Won"/"Closed Lost" closes a project.
--
-- outcome_requests gains reminder and escalation timestamps, and
-- project_crm_close_state holds the CRM's closed/won flags per project
-- (written by the outcome_crm_close_check job).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: every statement checks before it creates.

ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS trigger_source VARCHAR(20) NOT NULL DEFAULT 'either';
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS enforcement VARCHAR(20) NOT NULL DEFAULT 'prompt';
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS won_rule VARCHAR(20) NOT NULL DEFAULT 'rules';
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS lost_rule VARCHAR(20) NOT NULL DEFAULT 'rules';
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS cancelled_rule VARCHAR(20) NOT NULL DEFAULT 'rules';
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS won_statuses TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS lost_statuses TEXT[] NOT NULL DEFAULT ARRAY[]::text[];
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS cancelled_statuses TEXT[] NOT NULL DEFAULT ARRAY['Cancelled']::text[];
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS grace_days INTEGER NOT NULL DEFAULT 7;
ALTER TABLE outcome_config ADD COLUMN IF NOT EXISTS escalate_after_days INTEGER;

ALTER TABLE outcome_requests ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMP;
ALTER TABLE outcome_requests ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS project_crm_close_state (
  project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  crm_provider VARCHAR(32) NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);
