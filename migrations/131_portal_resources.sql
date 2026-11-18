-- Migration 131: Resource Content (Library › Knowledge › Resource Content).
--
-- The links on the Account Portal's "Learning & Documentation" and
-- "Support & Community" cards. Each row belongs to one card and opens an
-- app page or an external URL. System rows ship with the app (system_key,
-- seeded at boot); portal_position orders the at most four a card shows
-- (NULL = not on the card). owner_id is a soft ref to users.id, like the
-- Artifacts tables. See docs/features/resource-content.md.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS portal_resources (
  id serial PRIMARY KEY,
  card varchar(20) NOT NULL,
  title varchar(120) NOT NULL,
  description text NOT NULL DEFAULT '',
  icon varchar(60) NOT NULL,
  icon_color varchar(7) NOT NULL,
  link_type varchar(10) NOT NULL,
  url text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  system_key varchar(60),
  portal_position integer,
  owner_id varchar,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS portal_resources_system_key_unique ON portal_resources (system_key);
CREATE INDEX IF NOT EXISTS idx_portal_resources_card ON portal_resources (card);
