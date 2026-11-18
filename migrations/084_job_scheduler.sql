-- Migration 084: Configuration › Scheduler.
--
-- job_config: one row per background job key holding the admin's
-- overrides (on/off, cadence, error emails, clock time). No row = the
-- job's defaults, so existing installs behave exactly as before.
-- job_runs: run history for the Scheduler page. Written only when a run
-- did work or failed; pruned after 90 days by the job_runs_cleanup job.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS job_config (
  job_key varchar PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  interval_ms bigint,
  notify_on_error boolean NOT NULL DEFAULT false,
  last_error_email_at timestamp,
  schedule_hour smallint,
  schedule_minute smallint,
  timezone varchar,
  updated_by varchar,
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_runs (
  id serial PRIMARY KEY,
  job_key varchar NOT NULL,
  status varchar NOT NULL,
  source varchar NOT NULL DEFAULT 'scheduled',
  started_at timestamp NOT NULL,
  finished_at timestamp NOT NULL,
  duration_ms integer NOT NULL,
  items_processed integer,
  message text,
  triggered_by varchar
);

CREATE INDEX IF NOT EXISTS idx_job_runs_job_key_started ON job_runs (job_key, started_at);
CREATE INDEX IF NOT EXISTS idx_job_runs_started ON job_runs (started_at);

-- Documentation sync used to read its on/off switch from
-- docs_sync_schedule.is_enabled. Carry a turned-off sync over so it stays
-- off now that the Scheduler runs it. Its cadence keeps coming from
-- docs_sync_schedule.sync_interval_hours as the job's default.
INSERT INTO job_config (job_key, enabled)
SELECT 'docs_sync', false
FROM docs_sync_schedule
WHERE is_enabled = false
LIMIT 1
ON CONFLICT (job_key) DO NOTHING;
