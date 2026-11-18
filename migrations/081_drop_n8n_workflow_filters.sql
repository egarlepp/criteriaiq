-- Migration 081: drop the n8n workflow sync filter columns.
--
-- The n8n page's workflow browser (and the eight saved filters that fed
-- it, added in migrations 057, 058 and 061) was removed in favour of
-- Connection, API keys and Event subscriptions. These columns only held
-- display preferences for that browser; no other code reads them.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: DROP COLUMN IF EXISTS.

ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_webhook_only;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_schedule_triggers;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_manual_triggers;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_active_only;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_owner;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_updated_within_value;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS filter_updated_within_unit;
ALTER TABLE n8n_config DROP COLUMN IF EXISTS workflow_limit;
