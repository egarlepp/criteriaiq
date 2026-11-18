-- 129: Value journey on the MAP.
--
-- Adds the admin-defined journey stages that tag MAP phases, the
-- must-have / nice-to-have priority and MAP phase on each success
-- criterion, MAP task <-> criterion links, the customer's agreement to
-- the criteria, and the warm handoff team. Removes the Value Realization
-- Lifecycle tables and columns.
--
-- Production applies migrations at boot via `server/lib/migrations-runner.ts`
-- (one transaction per file); drizzle-kit push is NOT run on redeploy.
-- Idempotent: every statement is a no-op once applied.

CREATE TABLE IF NOT EXISTS journey_stages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_name VARCHAR(100) NOT NULL DEFAULT 'Circle',
  color VARCHAR(50) NOT NULL DEFAULT '#1e40af',
  order_index INTEGER NOT NULL DEFAULT 0,
  agreement_gate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

ALTER TABLE map_phases
  ADD COLUMN IF NOT EXISTS stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL;
ALTER TABLE map_template_phases
  ADD COLUMN IF NOT EXISTS stage_id INTEGER REFERENCES journey_stages(id) ON DELETE SET NULL;

ALTER TABLE success_criteria
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'must_have';
ALTER TABLE success_criteria
  ADD COLUMN IF NOT EXISTS map_phase_id INTEGER REFERENCES map_phases(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_success_criteria_project ON success_criteria (project_id);
CREATE INDEX IF NOT EXISTS idx_success_criteria_map_phase ON success_criteria (map_phase_id);

ALTER TABLE archived_success_criteria
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'must_have';
ALTER TABLE archived_success_criteria
  ADD COLUMN IF NOT EXISTS map_phase_id INTEGER;

CREATE TABLE IF NOT EXISTS map_task_criteria (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES map_tasks(id) ON DELETE CASCADE,
  criterion_id INTEGER NOT NULL REFERENCES success_criteria(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_map_task_criterion UNIQUE (task_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS idx_map_task_criteria_project ON map_task_criteria (project_id);
CREATE INDEX IF NOT EXISTS idx_map_task_criteria_criterion ON map_task_criteria (criterion_id);

CREATE TABLE IF NOT EXISTS criteria_agreements (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id VARCHAR,
  requested_at TIMESTAMP NOT NULL DEFAULT now(),
  recipient_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  agreed_by_user_id VARCHAR,
  agreed_by_name VARCHAR(255),
  agreed_by_title VARCHAR(255),
  agreed_at TIMESTAMP,
  criteria_snapshot JSONB,
  created_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_criteria_agreements_project ON criteria_agreements (project_id, requested_at);

CREATE TABLE IF NOT EXISTS project_handoff_contacts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL,
  responsibility VARCHAR(100),
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  CONSTRAINT uq_project_handoff_contact UNIQUE (project_id, user_id)
);

DO $$
BEGIN
  IF to_regclass('public.role_permissions') IS NOT NULL THEN
    DELETE FROM role_permissions WHERE section = 'config.vrl-lifecycle';
  END IF;
  IF to_regclass('public.user_permissions') IS NOT NULL THEN
    DELETE FROM user_permissions WHERE section = 'config.vrl-lifecycle';
  END IF;
END $$;

ALTER TABLE IF EXISTS projects DROP COLUMN IF EXISTS vrl_template_id;
ALTER TABLE IF EXISTS project_templates DROP COLUMN IF EXISTS vrl_template_id;
ALTER TABLE IF EXISTS archived_projects DROP COLUMN IF EXISTS vrl_template_id;
DROP TABLE IF EXISTS project_vrl_progress;
DROP TABLE IF EXISTS vrl_steps;
DROP TABLE IF EXISTS vrl_phases;
DROP TABLE IF EXISTS vrl_templates;
