-- Migration 092: personal in-app notifications and the digest preference.
--
-- user_notifications holds one row per recipient and event for the header
-- bell (server/services/notifications.ts). user_email_preferences gains
-- notification_digest: 'off' (in the app only) or 'daily' (also a daily
-- email of unread notifications, the notification_digest job).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: every statement checks before it creates.

CREATE TABLE IF NOT EXISTS user_notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(64) NOT NULL,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  link_path VARCHAR(512),
  actor_user_id VARCHAR,
  read_at TIMESTAMP,
  emailed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
  ON user_notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON user_notifications (user_id, read_at);

ALTER TABLE user_email_preferences
  ADD COLUMN IF NOT EXISTS notification_digest VARCHAR(16) NOT NULL DEFAULT 'off';
