-- Migration 108: optional Outlook working days.
--
-- outlook_signin_config.read_working_hours: when an admin turns it on,
-- Outlook sign-in also asks for MailboxSettings.Read and the daily Outlook
-- calendar sync sets each person's work week from their Outlook working
-- hours (docs/features/working-calendar.md). Off by default, so nothing
-- changes for existing installs until an admin opts in.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE outlook_signin_config ADD COLUMN IF NOT EXISTS read_working_hours boolean NOT NULL DEFAULT false;
