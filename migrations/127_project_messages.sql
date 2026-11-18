-- Migration 127: project messages (customer workspace conversation).
--
-- One row per message on a project, between the customer and the project
-- team. author_user_id is a soft reference to users.id (like activity_logs)
-- so archived users keep their messages. Deleting a message sets deleted_at
-- and clears the body. Rows go when their project goes.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS project_messages (
  id serial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_user_id varchar,
  body text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  deleted_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_project_messages_project_created
  ON project_messages (project_id, created_at);
