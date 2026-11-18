-- Migration 109: holiday calendars per account.
--
-- An account's people (users whose account_id is the account) follow these
-- calendars when they have none of their own, before the organization
-- defaults, so a customer's public holidays count as days off for the MAP
-- tasks they own (docs/features/holiday-calendars.md). No existing row
-- changes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS account_holiday_calendars (
  account_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  calendar_id integer NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, calendar_id)
);
