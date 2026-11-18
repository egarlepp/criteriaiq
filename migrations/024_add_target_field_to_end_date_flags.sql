-- Add target_field column to end_date_flags table
-- This allows each flag to target any date field in the system
-- rather than being hardcoded to project endDate only.
ALTER TABLE end_date_flags
  ADD COLUMN IF NOT EXISTS target_field varchar NOT NULL DEFAULT 'project.endDate';

-- Backfill existing system flags to target project end date (already the default)
UPDATE end_date_flags
  SET target_field = 'project.endDate'
  WHERE target_field IS NULL OR target_field = '';
