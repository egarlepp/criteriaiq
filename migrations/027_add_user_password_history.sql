-- 027_add_user_password_history.sql
--
-- Adds a per-user password history so /api/users/me/password (and the
-- ForcePasswordChangeCard flow that hits the same endpoint) can reject a
-- new password that matches one of the user's recently used hashes. The
-- column is a text array of bcrypt hashes, capped on write to the
-- configurable history size (PASSWORD_HISTORY_SIZE env var, default 5).
--
-- The default of an empty array is a safe backfill: every existing user
-- starts with no recorded history, so no one is locked out at login. The
-- next time they change their password, their previous hash is pushed
-- onto the front of this list and the rotation enforcement begins.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_history TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
