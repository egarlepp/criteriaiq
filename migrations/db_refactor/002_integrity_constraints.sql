-- =============================================================================
-- CriteriaIQ Database Refactor: Migration 002 — Data Integrity Constraints
-- =============================================================================
--
-- PURPOSE
-- -------
-- Adds CHECK constraints, NOT NULL constraints, and missing FOREIGN KEY
-- declarations that enforce business logic at the database level rather than
-- relying solely on application-layer validation.
--
-- EXECUTION NOTES
-- ----------------
-- 1. Run AFTER 001_uuid_pk_migration.sql (or on any schema version).
-- 2. All constraints use IF NOT EXISTS / DO $$ pattern for idempotency.
-- 3. PRE-FLIGHT validation queries are included before each constraint.
--    Run those first in a read-only transaction to check for violations.
-- 4. This script is safe to re-run — duplicate constraint additions will
--    raise a notice but not fail.
--
-- =============================================================================

-- =============================================================================
-- PRE-FLIGHT: Validate no existing data violates new CHECK constraints.
-- Run these SELECTs first. Any rows returned = data must be fixed before
-- applying the constraints below.
-- =============================================================================

-- Check projects.status values
-- SELECT id, status FROM projects
-- WHERE status NOT IN ('planning', 'active', 'completed', 'cancelled', 'on_hold',
--                      'closed', 'closed_won', 'closed_lost', 'archived')
-- AND status IS NOT NULL;

-- Check projects.customer_access_level values
-- SELECT id, customer_access_level FROM projects
-- WHERE customer_access_level NOT IN ('read_only', 'write', 'none')
-- AND customer_access_level IS NOT NULL;

-- Check audit_logins.login_method values
-- SELECT id, login_method FROM audit_logins
-- WHERE login_method NOT IN ('email', 'google', 'saml', 'webauthn', 'totp')
-- AND login_method IS NOT NULL;

-- =============================================================================
-- SECTION 1: CHECK Constraints on enum-like columns
-- =============================================================================

-- projects.status — allow known business statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_projects_status'
    AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT chk_projects_status
      CHECK (status IN (
        'planning', 'active', 'completed', 'cancelled', 'on_hold',
        'closed', 'closed_won', 'closed_lost', 'archived'
      ));
  END IF;
END $$;

-- projects.customer_access_level
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_projects_customer_access_level'
    AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT chk_projects_customer_access_level
      CHECK (customer_access_level IN ('read_only', 'write', 'none'));
  END IF;
END $$;

-- audit_logins.login_method
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_audit_logins_login_method'
    AND table_name = 'audit_logins'
  ) THEN
    ALTER TABLE audit_logins
      ADD CONSTRAINT chk_audit_logins_login_method
      CHECK (login_method IN ('email', 'google', 'saml', 'webauthn', 'totp', 'access_code'));
  END IF;
END $$;

-- map_phases.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_map_phases_status'
    AND table_name = 'map_phases'
  ) THEN
    ALTER TABLE map_phases
      ADD CONSTRAINT chk_map_phases_status
      CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'skipped'));
  END IF;
END $$;

-- map_steps.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_map_steps_status'
    AND table_name = 'map_steps'
  ) THEN
    ALTER TABLE map_steps
      ADD CONSTRAINT chk_map_steps_status
      CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'skipped'));
  END IF;
END $$;

-- map_tasks.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_map_tasks_status'
    AND table_name = 'map_tasks'
  ) THEN
    ALTER TABLE map_tasks
      ADD CONSTRAINT chk_map_tasks_status
      CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked', 'skipped', 'assigned'));
  END IF;
END $$;

-- success_criteria.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_success_criteria_status'
    AND table_name = 'success_criteria'
  ) THEN
    ALTER TABLE success_criteria
      ADD CONSTRAINT chk_success_criteria_status
      CHECK (status IN ('pending', 'in_progress', 'met', 'not_met', 'deferred'));
  END IF;
END $$;

-- customer_access.permission
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_customer_access_permission'
    AND table_name = 'customer_access'
  ) THEN
    ALTER TABLE customer_access
      ADD CONSTRAINT chk_customer_access_permission
      CHECK (permission IN ('View', 'Edit'));
  END IF;
END $$;

-- email_logs: success is boolean, not a status string — no CHECK needed

-- assessment_jobs.status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_assessment_jobs_status'
    AND table_name = 'assessment_jobs'
  ) THEN
    ALTER TABLE assessment_jobs
      ADD CONSTRAINT chk_assessment_jobs_status
      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));
  END IF;
END $$;

-- assessment_jobs.type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_assessment_jobs_type'
    AND table_name = 'assessment_jobs'
  ) THEN
    ALTER TABLE assessment_jobs
      ADD CONSTRAINT chk_assessment_jobs_type
      CHECK (type IN ('one_off', 'scheduled', 'batch'));
  END IF;
END $$;

-- risk_criteria.severity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_risk_criteria_severity'
    AND table_name = 'risk_criteria'
  ) THEN
    ALTER TABLE risk_criteria
      ADD CONSTRAINT chk_risk_criteria_severity
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;

-- users.role — known application roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_users_role'
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT chk_users_role
      CHECK (role IN ('se', 'manager', 'admin', 'superadmin', 'customer', 'specialist', 'tam'));
  END IF;
END $$;

-- email_rules.priority — must be a positive integer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_email_rules_priority_positive'
    AND table_name = 'email_rules'
  ) THEN
    ALTER TABLE email_rules
      ADD CONSTRAINT chk_email_rules_priority_positive
      CHECK (priority >= 0);
  END IF;
END $$;

-- documents.file_size — must be positive
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_documents_file_size_positive'
    AND table_name = 'documents'
  ) THEN
    ALTER TABLE documents
      ADD CONSTRAINT chk_documents_file_size_positive
      CHECK (file_size > 0);
  END IF;
END $$;

-- =============================================================================
-- SECTION 2: NOT NULL Constraints on columns always populated in practice
-- =============================================================================

-- projects.status — has a default, should always be set
ALTER TABLE projects ALTER COLUMN status SET NOT NULL;

-- projects.customer_access_level — has a default, should always be set
ALTER TABLE projects ALTER COLUMN customer_access_level SET NOT NULL;

-- projects.risk — has a default
ALTER TABLE projects ALTER COLUMN risk SET NOT NULL;

-- projects.ranking — has a default
ALTER TABLE projects ALTER COLUMN ranking SET NOT NULL;

-- email_logs.to_email, from_email, subject — already notNull in schema, enforcing at DB level
-- (These are already NOT NULL in the Drizzle schema definition, just ensuring DB reflects it)
ALTER TABLE email_logs ALTER COLUMN to_email SET NOT NULL;
ALTER TABLE email_logs ALTER COLUMN from_email SET NOT NULL;
ALTER TABLE email_logs ALTER COLUMN subject SET NOT NULL;

-- users.is_approved — has a default
ALTER TABLE users ALTER COLUMN is_approved SET NOT NULL;

-- users.is_active — has a default
ALTER TABLE users ALTER COLUMN is_active SET NOT NULL;

-- customers.is_active — has a default
ALTER TABLE customers ALTER COLUMN is_active SET NOT NULL;

-- customers.account_name — already notNull, DB-level enforcement
ALTER TABLE customers ALTER COLUMN account_name SET NOT NULL;

-- assessment_rulesets.is_active — has a default
ALTER TABLE assessment_rulesets ALTER COLUMN is_active SET NOT NULL;

-- =============================================================================
-- SECTION 3: Missing FOREIGN KEY declarations
-- =============================================================================

-- projects.account_representative_id → users.id
-- (Currently bare text with no FK constraint declared)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_projects_account_representative'
    AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT fk_projects_account_representative
      FOREIGN KEY (account_representative_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- projects.opportunity_engineer_id → users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_projects_opportunity_engineer'
    AND table_name = 'projects'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT fk_projects_opportunity_engineer
      FOREIGN KEY (opportunity_engineer_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- customers.account_representative_id → users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_customers_account_representative'
    AND table_name = 'customers'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_account_representative
      FOREIGN KEY (account_representative_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- customers.account_engineer_id → users.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_customers_account_engineer'
    AND table_name = 'customers'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_account_engineer
      FOREIGN KEY (account_engineer_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- users.manager_id → users.id (self-referential)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_users_manager'
    AND table_name = 'users'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT fk_users_manager
      FOREIGN KEY (manager_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- SECTION 4: UNIQUE constraints for data deduplication
-- =============================================================================

-- user_accounts: ensure each (user_id, account_id) pair is unique
-- (may already exist as unique_user_account — idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'unique_user_account'
    AND table_name = 'user_accounts'
  ) THEN
    ALTER TABLE user_accounts
      ADD CONSTRAINT unique_user_account UNIQUE (user_id, account_id);
  END IF;
END $$;

-- project_map_notification_settings: one row per (project_id, user_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'unique_project_user_notif'
    AND table_name = 'project_map_notification_settings'
  ) THEN
    ALTER TABLE project_map_notification_settings
      ADD CONSTRAINT unique_project_user_notif UNIQUE (project_id, user_id);
  END IF;
END $$;

-- =============================================================================
-- END OF MIGRATION 002
-- =============================================================================
