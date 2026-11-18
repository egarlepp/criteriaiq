-- Task #84: Make dependencies.project_id nullable to support library-level items
-- Items with project_id IS NULL are library items (not tied to any specific project)
--
-- Idempotent:
--   - No-op if `dependencies.project_id` is already nullable.
--   - No-op if the column has since been dropped entirely (Task #88 / migration
--     028 moved project-scoped rows out to `project_dependencies` and dropped
--     the column from the library table). Without this guard the migration
--     would fail boot on any environment where `drizzle-kit push` has already
--     synced the post-028 schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dependencies' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE "dependencies" ALTER COLUMN "project_id" DROP NOT NULL;
  END IF;
END $$;
