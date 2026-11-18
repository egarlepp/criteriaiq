-- Migration 111: Outlook write-back of MAP due dates.
--
-- outlook_signin_config.write_map_due_dates: the admin switch (off by
-- default). When on, Outlook sign-in also asks for Calendars.ReadWrite and
-- each person's open MAP due dates become all-day Free events in their
-- Outlook. outlook_map_events remembers the event made for each person and
-- item so it can be moved or removed (docs/features/working-calendar.md).
-- No existing row changes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE outlook_signin_config ADD COLUMN IF NOT EXISTS write_map_due_dates boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS outlook_map_events (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type varchar(8) NOT NULL,
  item_id integer NOT NULL,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  graph_event_id text NOT NULL,
  due_date varchar(10) NOT NULL,
  subject text NOT NULL,
  synced_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT outlook_map_events_user_item UNIQUE (user_id, item_type, item_id)
);
