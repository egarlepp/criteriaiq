-- Migration 130: project message reads (unread chat counts).
--
-- One row per user and project: the newest project_messages id the user
-- has seen. Messages after it, written by someone else, count as unread on
-- the Account Portal. Rows go with their user or project.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS project_message_reads (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  last_read_message_id integer NOT NULL,
  read_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT project_message_reads_user_project_unique UNIQUE (user_id, project_id)
);
