-- Migration 099: retire Backup Destinations and the database_backup
-- workflow action (Eric's call, 2026-10-27).
--
-- Admin › Monitoring & Audit › Backup & Restore (docs/features/backup-restore.md)
-- replaced them. The old action piped pg_dump into a Neon or custom
-- PostgreSQL destination whose connection string was stored, encrypted, in
-- backup_destinations.
--
--   1. Delete every workflow schedule of the removed action type. The
--      server no longer runs it, so such a schedule would only fail on each
--      tick. Its run history cascades with it.
--   2. Drop backup_destinations, so the stored destination connection
--      strings (credentials for other databases) don't linger.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`. Idempotent: a second run finds no
-- such schedule and no table.

DELETE FROM email_schedules WHERE action_type = 'database_backup';

DROP TABLE IF EXISTS backup_destinations;
