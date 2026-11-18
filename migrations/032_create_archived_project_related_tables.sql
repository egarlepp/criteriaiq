-- 032_create_archived_project_related_tables.sql
--
-- Creates four companion archive tables that mirror the per-project
-- related rows that `archiveProject` was already reading out of the
-- live tables but never persisting anywhere before deleting them
-- (Task #517). Without these mirrors, archiving a project silently
-- dropped every linked deliverable, audit-trail entry, customer-access
-- grant, and activity log; restoring the project left it with none
-- of the above.
--
--   - archived_success_criteria  ← success_criteria
--   - archived_activity_logs     ← activity_logs
--   - archived_customer_access   ← customer_access
--   - archived_project_audits    ← project_audits
--
-- Each mirror keeps the source row's primary key (so a restore
-- reinstates the exact id and any lingering FK references like
-- `project_dependencies.success_criteria_id` continue to resolve)
-- and the original `project_id`. No FK constraints on these tables —
-- the rows they reference live in `archived_projects` while sitting
-- here, not in the `projects` source table. An `archived_at`
-- bookkeeping column captures when the row was moved over.
--
-- `IF NOT EXISTS` is used on every CREATE so re-running the migration
-- on a partially-fixed environment is a no-op.

CREATE TABLE IF NOT EXISTS archived_success_criteria (
  id INTEGER PRIMARY KEY NOT NULL,
  project_id INTEGER NOT NULL,
  product_name VARCHAR(255),
  criterion TEXT,
  expected_outcome TEXT,
  action_item TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  line_number INTEGER,
  component_name TEXT,
  value_mapping_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archived_activity_logs (
  id INTEGER PRIMARY KEY NOT NULL,
  project_id INTEGER NOT NULL,
  user_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  details TEXT,
  target_type VARCHAR,
  target_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archived_customer_access (
  id INTEGER PRIMARY KEY NOT NULL,
  project_id INTEGER NOT NULL,
  user_email VARCHAR NOT NULL,
  permission VARCHAR(10) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS archived_project_audits (
  id INTEGER PRIMARY KEY NOT NULL,
  project_id INTEGER NOT NULL,
  user_id VARCHAR NOT NULL,
  user_email VARCHAR NOT NULL,
  user_name VARCHAR NOT NULL,
  field_name VARCHAR NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP DEFAULT NOW()
);

-- Project_id lookup indexes — restoring a project always looks rows
-- up by `project_id`, so back the lookup with an index from day one.
CREATE INDEX IF NOT EXISTS idx_archived_success_criteria_project_id
  ON archived_success_criteria (project_id);
CREATE INDEX IF NOT EXISTS idx_archived_activity_logs_project_id
  ON archived_activity_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_archived_customer_access_project_id
  ON archived_customer_access (project_id);
CREATE INDEX IF NOT EXISTS idx_archived_project_audits_project_id
  ON archived_project_audits (project_id);
