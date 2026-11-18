-- Migration 100: retire Data Sync (Eric's call, 2026-10-27).
--
-- Monitoring & Audit › Data Sync only stored a per-table label (always /
-- conditional / never sync) in table_sync_configs. Nothing read those
-- labels to copy data, so the page, its two routes, the boot-time seeder
-- and the table all go. Backup & Restore is the supported way to move data
-- between installs (docs/features/backup-restore.md).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`. Idempotent: a second run finds no
-- table.

DROP TABLE IF EXISTS table_sync_configs;
