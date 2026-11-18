-- Migration 117: Demo Mode copy of scheduled reports.
--
-- Analytics › Calendar shows report schedules (email_schedules rows with
-- action_type = 'report_generation') and their run history. Demo Mode
-- seeds its own schedules so the Calendar has something to show; this
-- flag keeps them out of real lists and the scheduler never runs them.
-- Existing rows stay real (default false).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE email_schedules ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_email_schedules_is_demo ON email_schedules (is_demo);
