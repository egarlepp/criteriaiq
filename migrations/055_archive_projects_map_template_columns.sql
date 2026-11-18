-- Migration 055: Add map_template_id and map_template_name to archived_projects
--
-- The projects table gained these two columns in migration 054 but they were
-- not mirrored in archived_projects at that time. Adding them here so that
-- newly archived projects retain the MAP template reference, and the archive
-- schema validation health check reports all three tables as Healthy.
--
-- Both columns are nullable (matching the source table) and use IF NOT EXISTS
-- so the migration is safe to re-run on environments that may have already
-- applied a manual fix.

ALTER TABLE archived_projects
  ADD COLUMN IF NOT EXISTS map_template_id   INTEGER,
  ADD COLUMN IF NOT EXISTS map_template_name VARCHAR(255);
