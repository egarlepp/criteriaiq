-- Migration 086: Scheduler › Send Email Window.
--
-- email_automation_config gains the quiet-hours switch, its scope and its
-- timezone. Quiet hours start OFF so existing installs keep sending exactly
-- as before until an admin turns them on. Scope 'digests' = scheduled
-- digests only; 'all' = digests plus rule-triggered emails. Sign-in emails
-- (template category "Authentication") are never held. Null timezone = the
-- server's timezone.
--
-- email_hourly_send_counts: one row per clock hour counting automated
-- emails sent, so "max emails per hour" holds across several CriteriaIQ
-- copies sharing one database. Rows older than two days are pruned when a
-- new hour starts.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE email_automation_config ADD COLUMN IF NOT EXISTS quiet_hours_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE email_automation_config ADD COLUMN IF NOT EXISTS quiet_hours_scope varchar NOT NULL DEFAULT 'digests';
ALTER TABLE email_automation_config ADD COLUMN IF NOT EXISTS send_window_timezone varchar;

CREATE TABLE IF NOT EXISTS email_hourly_send_counts (
  hour_start timestamptz PRIMARY KEY,
  sent_count integer NOT NULL DEFAULT 0
);
