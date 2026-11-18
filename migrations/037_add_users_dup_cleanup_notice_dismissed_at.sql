-- 037_add_users_dup_cleanup_notice_dismissed_at.sql
--
-- Per-admin "duplicate-cleanup notice dismissed" marker.
--
-- The Account & User Management page surfaces a one-time notice
-- listing users that migration 035 deactivated as case-variant
-- duplicates. This column records when each admin dismissed that
-- notice. The notice re-surfaces if a future dedup run produces
-- a loser whose `users.updated_at` is newer than this stamp.
--
-- NULL means the admin has not dismissed the notice yet. Non-admin
-- users never load the notice (the route guard rejects them) so the
-- column is harmless on their rows.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dup_cleanup_notice_dismissed_at TIMESTAMP;
