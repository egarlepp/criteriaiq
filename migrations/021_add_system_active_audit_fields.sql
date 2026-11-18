-- Migration: Add is_active, is_system, created_by, updated_by to template tables
-- Applied via db:push; this file documents the schema changes for record-keeping.

-- validation_criteria_templates: uses created_by / updated_by column naming
ALTER TABLE validation_criteria_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by varchar(255) REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by varchar(255) REFERENCES users(id) ON DELETE SET NULL;

-- map_templates: uses created_by_user_id / updated_by_user_id column naming (matches existing schema)
ALTER TABLE map_templates
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by_user_id varchar(255) REFERENCES users(id) ON DELETE SET NULL;
-- Note: created_by_user_id already existed on map_templates prior to this migration.
