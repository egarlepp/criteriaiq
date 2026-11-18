-- Migration 107: each person's work week and time off.
--
-- user_work_schedules holds a person's working days (0 = Sunday); no row
-- means Monday to Friday. user_time_off holds days they're away, inclusive.
-- MAP scheduling counts both as days off, alongside holidays
-- (docs/features/working-calendar.md). "outlook" rows come from the
-- person's Outlook calendar; external_id is the Outlook event id.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS. No existing row changes.

CREATE TABLE IF NOT EXISTS user_work_schedules (
  user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  work_days smallint[] NOT NULL,
  source varchar(20) NOT NULL DEFAULT 'manual',
  updated_by varchar REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT user_work_schedules_source_check CHECK (source IN ('manual', 'outlook'))
);

CREATE TABLE IF NOT EXISTS user_time_off (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  note varchar(200),
  source varchar(20) NOT NULL DEFAULT 'manual',
  external_id varchar(512),
  created_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT user_time_off_user_external_unique UNIQUE (user_id, external_id),
  CONSTRAINT user_time_off_range_check CHECK (end_date >= start_date),
  CONSTRAINT user_time_off_source_check CHECK (source IN ('manual', 'outlook'))
);

CREATE INDEX IF NOT EXISTS idx_user_time_off_user_end ON user_time_off (user_id, end_date);
