-- Migration 119: project templates keep links and documents, and are
-- personal by default.
--
-- "Save As Project Template" on Create Project now carries the project's
-- links and existing-document references into the template, so projects
-- made from it start with them (docs/features/project-templates.md).
-- is_system now defaults to false: a new template lands in its creator's
-- My Templates until an admin promotes it. Existing rows keep their value.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS / SET DEFAULT.

ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS project_links jsonb;
ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS project_documents jsonb;
ALTER TABLE project_templates ALTER COLUMN is_system SET DEFAULT false;
