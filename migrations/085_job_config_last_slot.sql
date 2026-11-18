-- Migration 085: Scheduler slot claims.
--
-- With several CriteriaIQ copies on one database, every copy arms the
-- same clock-time jobs (the nightly Salesforce link check, per-object
-- Salesforce scheduled syncs). The copy that first moves last_slot_at to
-- a slot runs it; the others skip. Null = no slot claimed yet.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE job_config ADD COLUMN IF NOT EXISTS last_slot_at timestamp;
