-- Migration 134: Demo Mode's own event log.
--
-- Each Demo Mode switch, seed, reseed and wipe is recorded here and listed
-- under Recent activity on the Demo Mode page. These rows used to go to
-- activity_logs with project_id -1, which its foreign key to projects
-- refuses, so none were ever written. See docs/admin/demo-mode.md.

CREATE TABLE IF NOT EXISTS demo_mode_events (
  id serial PRIMARY KEY,
  user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  action varchar(64) NOT NULL,
  details text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_mode_events_created_at ON demo_mode_events (created_at);
