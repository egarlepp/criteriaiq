-- Task #723 — Admin Demo Mode isolation.
-- Adds is_demo flag (default false, indexed) to every tagged table,
-- demo_mode_forced_on to users, and the demo_mode_app_wide system
-- setting. Idempotent: safe to re-run on environments where some
-- columns/indexes were applied via earlier ad-hoc ALTERs.

-- ---- per-table is_demo columns + indexes ----
ALTER TABLE customers           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_customers_is_demo            ON customers (is_demo);

ALTER TABLE customer_access     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_customer_access_is_demo      ON customer_access (is_demo);

ALTER TABLE projects            ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_projects_is_demo             ON projects (is_demo);

ALTER TABLE project_templates   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_project_templates_is_demo    ON project_templates (is_demo);

ALTER TABLE activity_logs       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_activity_logs_is_demo        ON activity_logs (is_demo);

ALTER TABLE map_templates       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_templates_is_demo        ON map_templates (is_demo);

ALTER TABLE map_template_phases       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_template_phases_is_demo       ON map_template_phases (is_demo);

ALTER TABLE map_template_steps        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_template_steps_is_demo        ON map_template_steps (is_demo);

ALTER TABLE map_template_tasks        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_template_tasks_is_demo        ON map_template_tasks (is_demo);

ALTER TABLE map_template_applications ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_template_applications_is_demo ON map_template_applications (is_demo);

ALTER TABLE map_phases          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_phases_is_demo           ON map_phases (is_demo);

ALTER TABLE map_steps           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_steps_is_demo            ON map_steps (is_demo);

ALTER TABLE map_tasks           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_tasks_is_demo            ON map_tasks (is_demo);

ALTER TABLE map_links           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_map_links_is_demo            ON map_links (is_demo);

ALTER TABLE custom_reports      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_custom_reports_is_demo       ON custom_reports (is_demo);

ALTER TABLE dashboard_layouts   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_is_demo    ON dashboard_layouts (is_demo);

ALTER TABLE tags                ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tags_is_demo                 ON tags (is_demo);

ALTER TABLE products            ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_is_demo             ON products (is_demo);

ALTER TABLE assumptions         ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assumptions_is_demo          ON assumptions (is_demo);

ALTER TABLE dependencies        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_dependencies_is_demo         ON dependencies (is_demo);

ALTER TABLE email_templates     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_email_templates_is_demo      ON email_templates (is_demo);

ALTER TABLE ai_provider_configs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_is_demo  ON ai_provider_configs (is_demo);

-- ---- per-user forced flag ----
ALTER TABLE users               ADD COLUMN IF NOT EXISTS demo_mode_forced_on boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_users_demo_mode_forced_on    ON users (demo_mode_forced_on);

-- ---- app-wide system setting ----
INSERT INTO system_settings (key, value, description, created_at, updated_at)
VALUES (
  'demo_mode_app_wide',
  '{"enabled": false}'::jsonb,
  'Task #723 — when enabled, every authenticated user is in demo mode regardless of session/per-user flags.',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;
