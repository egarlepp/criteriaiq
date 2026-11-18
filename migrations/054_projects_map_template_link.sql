-- Task #788 — Add map_template_id / map_template_name columns to
-- `projects` so MAP-driven projects (including demo-seeded ones)
-- carry an explicit pointer back to the `map_templates` row they
-- were spawned from.
--
-- Why: prior to this migration the relationship between a project
-- and its MAP template was implicit — only the per-project
-- map_phases / map_steps / map_tasks rows survived. The customer
-- dashboard had no template pointer to show; the demo seeder's "Done looks like"
-- contract requires a persisted template pointer so the originating
-- template id/name round-trip across reload, and so future UI work
-- can render "Spawned from template …" without re-deriving it from
-- the per-project map row chain.
--
-- Idempotent — safe to re-run on environments that already have one
-- or both columns. No data backfill is required: existing projects
-- created from a project_template already received their MAP rows
-- via storage.createProjectMapFromTemplate; the new columns simply
-- start NULL on those rows and get populated going forward by the
-- demo seeder and any project-create flow that wires them up.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS map_template_id integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS map_template_name varchar(255);
