-- =============================================================================
-- CriteriaIQ Database Refactor: Migration 003 — Indexing Strategy
-- =============================================================================
--
-- PURPOSE
-- -------
-- Creates B-Tree indexes for high-frequency lookup columns and GIN indexes for
-- JSONB columns used in filtering. All indexes use CONCURRENTLY to avoid
-- locking production tables during creation.
--
-- EXECUTION NOTES
-- ----------------
-- IMPORTANT: This script CANNOT run inside a transaction block because
-- CREATE INDEX CONCURRENTLY does not support transactions.
-- Run it directly against the database:
--   psql $DATABASE_URL -f 003_indexing_strategy.sql
--
-- All indexes use IF NOT EXISTS — safe to re-run.
--
-- OVER-INDEXING AVOIDANCE
-- ------------------------
-- The following columns were deliberately NOT indexed because they have
-- low selectivity, are never/rarely in WHERE clauses, or are write-heavy:
--   - projects.notes, projects.business_problem (free-text, use pg_trgm for FTS)
--   - sessions.sess (JSONB, never filtered — only retrieved by PK/sid)
--   - dashboard_layouts.layout_config, widget_configs.config (config blobs)
--   - email_logs.html_content, email_logs.text_content (large text, never filtered)
--   - users.password, users.totp_secret_enc (security fields, PK-lookup only)
--   - columns with boolean defaults that are nearly always the same value
--     (e.g., is_system = false on 99% of rows — index not selective enough)
--
-- =============================================================================

-- =============================================================================
-- SECTION 1: B-Tree Indexes — High-Frequency Lookup Columns
-- =============================================================================

-- projects: most heavily queried table in the application
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status
  ON projects(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_primary_engineer_id
  ON projects(primary_engineer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_customer_user_id
  ON projects(customer_user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_end_date
  ON projects(end_date)
  WHERE end_date IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_created_at_desc
  ON projects(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status_engineer
  ON projects(status, primary_engineer_id);

-- email_logs: high-volume audit/history table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_to_email
  ON email_logs(to_email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_sent_at_desc
  ON email_logs(sent_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_success
  ON email_logs(success);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_project_id
  ON email_logs(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_logs_user_id
  ON email_logs(user_id)
  WHERE user_id IS NOT NULL;

-- activity_logs: composite for timeline queries (most common access pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_logs_project_created
  ON activity_logs(project_id, created_at DESC);

-- project_audits: composite for audit trail queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_audits_project_created
  ON project_audits(project_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_audits_user_id
  ON project_audits(user_id);

-- assessment_jobs: AI job polling
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assessment_jobs_status
  ON assessment_jobs(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assessment_jobs_created_at
  ON assessment_jobs(created_at DESC);

-- project_risk_predictions: risk analysis queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_risk_predictions_project
  ON project_risk_predictions(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_risk_predictions_created
  ON project_risk_predictions(created_at DESC);

-- risk_alerts: alert management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_alerts_project_id
  ON risk_alerts(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_alerts_acknowledged
  ON risk_alerts(acknowledged)
  WHERE acknowledged = false;

-- salesforce_sync_queue: sync processing queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_sync_queue_status_created
  ON salesforce_sync_queue(status, created_at);

-- salesforce_sync_run_items: run detail lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sf_sync_run_items_sync_run
  ON salesforce_sync_run_items(sync_run_id);

-- webhook_deliveries: delivery history and retry queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_webhook_created
  ON webhook_deliveries(webhook_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_status
  ON webhook_deliveries(status_code)
  WHERE status_code IS NOT NULL;

-- tags: frequently looked up by name for autocomplete / filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tags_name
  ON tags(name);

-- customers: account lookup patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_is_active
  ON customers(is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_account_name
  ON customers(account_name);

-- users: lookup patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users(email)
  WHERE email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_is_approved_active
  ON users(is_approved, is_active);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_account_id
  ON users(account_id)
  WHERE account_id IS NOT NULL;

-- success_criteria: project-scoped queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_success_criteria_project
  ON success_criteria(project_id);

-- documents: customer-scoped document queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_customer_id
  ON documents(customer_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_project_id
  ON documents(project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_uploaded_at_desc
  ON documents(uploaded_at DESC)
  WHERE is_active = true;

-- =============================================================================
-- SECTION 2: GIN Indexes — JSONB Columns Used for Filtering
-- =============================================================================
-- GIN indexes allow deep searching inside JSONB arrays and objects.
-- Use jsonb_path_ops operator class for @> (contains) queries — smaller index.

-- projects.customer_users: access control filtering
-- Query pattern: WHERE customer_users @> '[{"email": "x@example.com"}]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_customer_users_gin
  ON projects USING GIN (customer_users jsonb_path_ops)
  WHERE customer_users IS NOT NULL;

-- projects.additional_access: access control filtering
-- Query pattern: WHERE additional_access @> '[{"userId": "abc123"}]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_additional_access_gin
  ON projects USING GIN (additional_access jsonb_path_ops)
  WHERE additional_access IS NOT NULL;

-- customers.contact_users: stakeholder type filtering
-- Query pattern: WHERE contact_users @> '[{"userId": "abc"}]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_contact_users_gin
  ON customers USING GIN (contact_users jsonb_path_ops)
  WHERE contact_users IS NOT NULL;

-- system_announcements.target_roles: role-based targeting
-- Query pattern: WHERE target_roles @> '["admin"]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_announcements_target_roles_gin
  ON system_announcements USING GIN (target_roles jsonb_path_ops)
  WHERE target_roles IS NOT NULL;

-- system_announcements.target_user_ids: user-targeted announcements
-- Query pattern: WHERE target_user_ids @> '["user-uuid"]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_system_announcements_target_users_gin
  ON system_announcements USING GIN (target_user_ids jsonb_path_ops)
  WHERE target_user_ids IS NOT NULL;

-- risk_criteria.trigger_conditions: AI rule engine matching
-- Query pattern: WHERE trigger_conditions @> '{"field": "status"}'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_criteria_trigger_conditions_gin
  ON risk_criteria USING GIN (trigger_conditions jsonb_path_ops)
  WHERE trigger_conditions IS NOT NULL;

-- email_rules.trigger_keys: email rule matching
-- Query pattern: WHERE trigger_keys @> '["project.status_changed"]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_rules_trigger_keys_gin
  ON email_rules USING GIN (trigger_keys jsonb_path_ops);

-- assessment_jobs.project_ids: batch job project lookup
-- Query pattern: WHERE project_ids @> '["project-uuid"]'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assessment_jobs_project_ids_gin
  ON assessment_jobs USING GIN (project_ids jsonb_path_ops)
  WHERE project_ids IS NOT NULL;

-- =============================================================================
-- SECTION 3: Partial Indexes — Highly Selective Filtered Indexes
-- =============================================================================
-- Partial indexes are smaller and faster than full indexes for common
-- filtered query patterns.

-- Active projects only (most queries filter out archived/cancelled)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_active_only
  ON projects(primary_engineer_id, created_at DESC)
  WHERE status NOT IN ('completed', 'cancelled', 'closed', 'archived');

-- Pending email schedules (scheduler polls for due jobs)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_schedules_due
  ON email_schedules(next_run_at)
  WHERE active = true AND next_run_at IS NOT NULL;

-- Unacknowledged risk alerts (alert dashboard query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_risk_alerts_unacked
  ON risk_alerts(project_id, sent_at DESC)
  WHERE acknowledged = false;

-- Active products (most product lookups filter inactive out)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_active
  ON products(name)
  WHERE is_active = true;

-- Enabled email rules (rule engine only processes enabled rules)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_rules_enabled_priority
  ON email_rules(priority)
  WHERE enabled = true;

-- =============================================================================
-- END OF MIGRATION 003
-- =============================================================================
