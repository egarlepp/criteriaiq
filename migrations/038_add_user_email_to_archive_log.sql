-- 038_add_user_email_to_archive_log.sql
--
-- Adds a snapshot `user_email` column to `archive_log` so the Activity Log
-- on the Archive Management page can render the archiver's identity even
-- after the archiver has been hard-deleted with no `archived_users` mirror
-- left to fall back to. Task #552.
--
-- Task #547 enriched the three list endpoints
-- (`/api/archive/{users,projects,customers}`) with server-resolved
-- `archivedByName` / `archivedByEmail` via LEFT JOIN against `users` +
-- `archived_users`. Task #552 extends the same pattern to
-- `/api/archive/log`. When the archiver is still active OR has been
-- archived, the JOINs resolve and the snapshot is unused. When neither
-- side resolves (e.g. the archiver was hard-deleted before the
-- `archived_users` mirror existed, or after their archive row was
-- permanently deleted), the snapshot column is the final fallback so the
-- UI no longer collapses to a raw user-id string.
--
-- Nullable so existing rows backfill to NULL and the historical fallback
-- (raw `archived_by` id) still applies for entries written before the
-- column existed. New writes from `archiveUser` / `archiveProject` /
-- `archiveCustomer` populate this column.

ALTER TABLE archive_log
  ADD COLUMN IF NOT EXISTS user_email VARCHAR;
