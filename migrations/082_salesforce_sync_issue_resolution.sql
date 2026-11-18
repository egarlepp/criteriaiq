-- Migration 082: Salesforce Sync Issues "Resolve" support.
--
-- A sync issue is the latest error run item for a record + direction.
-- Resolving it stamps that run item; a newer failure writes a new run item
-- with these columns NULL, so a resolved issue reopens on its own.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE salesforce_sync_run_items ADD COLUMN IF NOT EXISTS resolved_at timestamp;
ALTER TABLE salesforce_sync_run_items ADD COLUMN IF NOT EXISTS resolved_by varchar REFERENCES users(id);
