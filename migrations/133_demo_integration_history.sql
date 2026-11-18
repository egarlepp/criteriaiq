-- Migration 133: Demo Mode history on the integration pages.
--
-- Demo Mode seeds believable history for Email Logs, webhooks and their
-- deliveries, MCP Server activity and System Announcements, tagged
-- is_demo = true like the other demo tables. A demo session sees only demo
-- email logs, webhooks, deliveries and MCP calls; everyone else sees only
-- real ones. Demo webhooks are inactive and never sent. Demo
-- announcements show only in a demo session. See docs/admin/demo-mode.md.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_email_logs_is_demo ON email_logs (is_demo);

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_webhooks_is_demo ON webhooks (is_demo);

ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_is_demo ON webhook_deliveries (is_demo);

ALTER TABLE mcp_tool_calls ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_is_demo ON mcp_tool_calls (is_demo);

ALTER TABLE system_announcements ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_system_announcements_is_demo ON system_announcements (is_demo);
