-- 050_audit_logins_event_type.sql
--
-- Task #767: extend `audit_logins` so the same table can carry
-- non-login security events — specifically the four "reveal a
-- sensitive value" handlers (SESSION_SECRET, ENCRYPTION_KEY,
-- DATABASE_URL, per-row db-connections) introduced by Tasks #739 /
-- #741.
--
-- Background: today the reveal handlers only emit a tagged
-- `console.log` line. That gets rotated off the host after a few
-- days and is invisible to a security review or incident
-- investigation ("who looked at the production database URL last
-- Tuesday?"). The existing `audit_logins` table already carries
-- everything we need for those rows (actor user_id/email/name,
-- timestamp, ip, user_agent, session_id) and is already surfaced in
-- the admin Login Audit UI; we just need a column that says "this
-- row isn't a login event" so reveal events don't pollute login
-- analytics and so the UI can filter by event type.
--
-- Schema change:
--   - `event_type`    VARCHAR NOT NULL DEFAULT 'login'
--                     existing rows get backfilled with 'login' via
--                     the column default; new reveal rows write
--                     `secret_reveal`.
--   - `event_subject` VARCHAR NULL
--                     for `secret_reveal` rows this stores the key
--                     that was revealed (e.g. 'SESSION_SECRET',
--                     'DATABASE_URL', 'db-connection:42'). The
--                     value itself is NEVER stored.
--   - `IDX_audit_logins_event_type` btree on `event_type` so the
--                     new admin filter ("secret reveals only") stays
--                     cheap as the table grows.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
-- — safe to re-run, and safe on a DB where `drizzle-kit push` has
-- already created the columns from the schema declaration.

ALTER TABLE "audit_logins"
  ADD COLUMN IF NOT EXISTS "event_type" VARCHAR NOT NULL DEFAULT 'login';

ALTER TABLE "audit_logins"
  ADD COLUMN IF NOT EXISTS "event_subject" VARCHAR;

CREATE INDEX IF NOT EXISTS "IDX_audit_logins_event_type"
  ON "audit_logins" ("event_type");
