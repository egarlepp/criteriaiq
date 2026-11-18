-- Migration 101: holiday calendars (Admin › System Settings › Calendar).
--
-- Ported from ImpactIQ. A calendar holds either a country's public holidays,
-- downloaded from date.nager.at (code = ISO country code), or an admin's own
-- list of company closures. Users get the calendars assigned to them (up to
-- three), else the organization defaults (is_default). Later work uses these
-- dates to skip non-working days in project scheduling.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS holiday_calendars (
  id serial PRIMARY KEY,
  code varchar(40) NOT NULL,
  name varchar(120) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  last_refreshed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT holiday_calendars_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS holiday_dates (
  id serial PRIMARY KEY,
  calendar_id integer NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
  date date NOT NULL,
  name varchar(200) NOT NULL,
  CONSTRAINT holiday_dates_calendar_date_unique UNIQUE (calendar_id, date)
);

CREATE TABLE IF NOT EXISTS user_holiday_calendars (
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  calendar_id integer NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, calendar_id)
);
