-- Migration 080: event subscriptions on outbound webhooks.
--
-- Lets an admin pick which system trigger keys a webhook (typically an
-- n8n Webhook node) receives directly, so app events reach n8n without
-- hand-building one Workflow Automation rule per event. Delivery lives in
-- server/services/automation-events.ts. Empty array = previous behaviour
-- (the webhook only fires from a rule's trigger_webhook action).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.

ALTER TABLE webhooks
  ADD COLUMN IF NOT EXISTS subscribed_events JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_webhooks_subscribed_events
  ON webhooks USING GIN (subscribed_events);
