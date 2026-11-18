-- 128: Drop the Execution Plan tables and columns.
--
-- A project's plan is its MAP (map_phases, map_steps, map_tasks). The app has
-- not been rolled out, so there is no data to carry over: this only removes
-- the old columns, the old table and the rows that named it.
--
-- Production applies migrations at boot via `server/lib/migrations-runner.ts`
-- (one transaction per file); drizzle-kit push is NOT run on redeploy.
-- Idempotent: every statement is a no-op once its target is gone.

DO $$
BEGIN
  IF to_regclass('public.map_links') IS NOT NULL THEN
    DELETE FROM map_links WHERE target_type = 'executionPlan';
  END IF;
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DELETE FROM role_permissions WHERE section = 'template_management.execution-plans';
  END IF;
  IF to_regclass('public.dashboard_metrics') IS NOT NULL THEN
    DELETE FROM dashboard_metrics WHERE name = 'Projects in Execution Mode' AND is_system = true;
  END IF;
  IF to_regclass('public.user_permissions') IS NOT NULL THEN
    DELETE FROM user_permissions WHERE section = 'template_management.execution-plans';
  END IF;
END $$;

ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS execution_plan;
ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS execution_plan_id;
ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS plan_mode;
ALTER TABLE IF EXISTS project_templates DROP COLUMN IF EXISTS execution_plan;
ALTER TABLE IF EXISTS project_templates DROP COLUMN IF EXISTS execution_plan_id;
ALTER TABLE IF EXISTS project_templates DROP COLUMN IF EXISTS execution_plan_name;
ALTER TABLE IF EXISTS project_templates DROP COLUMN IF EXISTS plan_mode;
ALTER TABLE IF EXISTS archived_projects DROP COLUMN IF EXISTS execution_plan;
ALTER TABLE IF EXISTS archived_projects DROP COLUMN IF EXISTS execution_plan_id;
ALTER TABLE IF EXISTS archived_projects DROP COLUMN IF EXISTS plan_mode;
ALTER TABLE IF EXISTS vrl_templates DROP COLUMN IF EXISTS plan_types;
DROP TABLE IF EXISTS execution_plans;
