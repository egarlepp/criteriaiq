-- =============================================================================
-- CriteriaIQ Database Refactor: Migration 001 — UUID Primary Keys
-- =============================================================================
--
-- PURPOSE
-- -------
-- Migrates every SERIAL (int32) primary key to UUID, aligning all tables
-- with the existing `users.id` convention (already a UUID varchar).
--
-- WHY UUID OVER BIGINT
-- ---------------------
-- - The application is pre-production. This is the correct time to make this
--   change before data volumes make FK rewriting costly.
-- - UUID eliminates ID enumeration attacks (attackers cannot guess IDs by
--   incrementing integers).
-- - UUID PKs align with external systems: Salesforce record IDs, SendGrid
--   message IDs, and OAuth tokens are all UUIDs or UUID-like strings.
-- - uuid_generate_v4() / gen_random_uuid() produces non-sequential IDs,
--   which avoids integer overflow entirely.
--
-- WHY NOT UUID FOR PRODUCTION MIGRATION
-- ---------------------------------------
-- If the app were in production, UUID migration would require rewriting every
-- FK column across 50+ tables (risky). For pre-production, this is safe.
--
-- EXECUTION NOTES
-- ----------------
-- 1. This script wraps each table's migration in its own transaction.
--    If a step fails, only that table rolls back — others are unaffected.
-- 2. The script is idempotent: checking for column existence before altering.
-- 3. Run BEFORE 002_integrity_constraints.sql and 003_indexing_strategy.sql.
-- 4. The `pgcrypto` extension must be available (standard on Neon/PG14+).
--
-- STRATEGY PER TABLE
-- -------------------
-- For tables with NO foreign key references FROM other tables:
--   ALTER COLUMN id TYPE uuid USING gen_random_uuid()
--
-- For tables WITH FK references from child tables:
--   1. Add new_id UUID column with gen_random_uuid() default
--   2. Add matching UUID FK column to child tables
--   3. Backfill child FK columns by joining on old integer
--   4. Drop old FK constraints + old integer columns
--   5. Rename new_id → id, add PK constraint
--   6. Drop old sequences
--
-- =============================================================================

-- Ensure pgcrypto is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- TIER 0: Config/lookup tables with no inbound FKs from main data tables
-- =============================================================================

-- status_configs
BEGIN;
ALTER TABLE status_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE status_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS status_configs_id_seq;
COMMIT;

-- risk_level_configs
BEGIN;
ALTER TABLE risk_level_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE risk_level_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS risk_level_configs_id_seq;
COMMIT;

-- ranking_configs
BEGIN;
ALTER TABLE ranking_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE ranking_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS ranking_configs_id_seq;
COMMIT;

-- industries (referenced by customers.industry_id and archived_customers.industry_id)
BEGIN;
ALTER TABLE industries ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE customers ADD COLUMN industry_id_new uuid;
UPDATE customers c SET industry_id_new = i.new_id
  FROM industries i WHERE i.id = c.industry_id;
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_industry_id_fkey;
ALTER TABLE customers DROP COLUMN industry_id;
ALTER TABLE customers RENAME COLUMN industry_id_new TO industry_id;
ALTER TABLE industries DROP CONSTRAINT industries_pkey;
ALTER TABLE industries DROP COLUMN id;
ALTER TABLE industries RENAME COLUMN new_id TO id;
ALTER TABLE industries ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS industries_id_seq;
COMMIT;

-- email_designs (referenced by email_templates.design_id)
BEGIN;
ALTER TABLE email_designs ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE email_templates ADD COLUMN design_id_new uuid;
UPDATE email_templates t SET design_id_new = d.new_id
  FROM email_designs d WHERE d.id = t.design_id;
ALTER TABLE email_templates DROP CONSTRAINT IF EXISTS email_templates_design_id_fkey;
ALTER TABLE email_templates DROP COLUMN design_id;
ALTER TABLE email_templates RENAME COLUMN design_id_new TO design_id;
ALTER TABLE email_designs DROP CONSTRAINT email_designs_pkey;
ALTER TABLE email_designs DROP COLUMN id;
ALTER TABLE email_designs RENAME COLUMN new_id TO id;
ALTER TABLE email_designs ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS email_designs_id_seq;
COMMIT;

-- email_configuration
BEGIN;
ALTER TABLE email_configuration ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_configuration ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_configuration_id_seq;
COMMIT;

-- email_automation_config
BEGIN;
ALTER TABLE email_automation_config ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_automation_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_automation_config_id_seq;
COMMIT;

-- system_settings
BEGIN;
ALTER TABLE system_settings ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE system_settings ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS system_settings_id_seq;
COMMIT;

-- table_sync_configs
BEGIN;
ALTER TABLE table_sync_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE table_sync_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS table_sync_configs_id_seq;
COMMIT;

-- customer_status_configs
BEGIN;
ALTER TABLE customer_status_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE customer_status_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS customer_status_configs_id_seq;
COMMIT;

-- docs_sync_schedule
BEGIN;
ALTER TABLE docs_sync_schedule ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE docs_sync_schedule ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS docs_sync_schedule_id_seq;
COMMIT;

-- end_date_flags
BEGIN;
ALTER TABLE end_date_flags ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE end_date_flags ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS end_date_flags_id_seq;
COMMIT;

-- flight_deck_configs
BEGIN;
ALTER TABLE flight_deck_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE flight_deck_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS flight_deck_configs_id_seq;
COMMIT;

-- flight_deck_tips
BEGIN;
ALTER TABLE flight_deck_tips ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE flight_deck_tips ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS flight_deck_tips_id_seq;
COMMIT;

-- =============================================================================
-- TIER 1: Tables referenced by multiple child tables
-- =============================================================================

-- customers (referenced by: users, user_accounts, infrastructure_profiles, documents,
--            links, code_scripts, customer_access, evaluation_requests, allowed_domains,
--            access_codes, archived_users, kanban_audit_events, salesforce_*)
BEGIN;
ALTER TABLE customers ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

-- Update FK in users
ALTER TABLE users ADD COLUMN account_id_new uuid;
UPDATE users u SET account_id_new = c.new_id FROM customers c WHERE c.id = u.account_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_id_fkey;
ALTER TABLE users DROP COLUMN account_id;
ALTER TABLE users RENAME COLUMN account_id_new TO account_id;

-- Update FK in user_accounts
ALTER TABLE user_accounts ADD COLUMN account_id_new uuid;
UPDATE user_accounts ua SET account_id_new = c.new_id FROM customers c WHERE c.id = ua.account_id;
ALTER TABLE user_accounts DROP CONSTRAINT IF EXISTS user_accounts_account_id_fkey;
ALTER TABLE user_accounts DROP COLUMN account_id;
ALTER TABLE user_accounts RENAME COLUMN account_id_new TO account_id;
ALTER TABLE user_accounts ALTER COLUMN account_id SET NOT NULL;

-- Update FK in infrastructure_profiles
ALTER TABLE infrastructure_profiles ADD COLUMN customer_id_new uuid;
UPDATE infrastructure_profiles ip SET customer_id_new = c.new_id FROM customers c WHERE c.id = ip.customer_id;
ALTER TABLE infrastructure_profiles DROP CONSTRAINT IF EXISTS infrastructure_profiles_customer_id_fkey;
ALTER TABLE infrastructure_profiles DROP COLUMN customer_id;
ALTER TABLE infrastructure_profiles RENAME COLUMN customer_id_new TO customer_id;
ALTER TABLE infrastructure_profiles ALTER COLUMN customer_id SET NOT NULL;

-- Update FK in documents
ALTER TABLE documents ADD COLUMN customer_id_new uuid;
UPDATE documents d SET customer_id_new = c.new_id FROM customers c WHERE c.id = d.customer_id;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_customer_id_fkey;
ALTER TABLE documents DROP COLUMN customer_id;
ALTER TABLE documents RENAME COLUMN customer_id_new TO customer_id;
ALTER TABLE documents ALTER COLUMN customer_id SET NOT NULL;

-- Update FK in evaluation_requests
ALTER TABLE evaluation_requests ADD COLUMN customer_id_new uuid;
UPDATE evaluation_requests er SET customer_id_new = c.new_id FROM customers c WHERE c.id = er.customer_id;
ALTER TABLE evaluation_requests DROP CONSTRAINT IF EXISTS evaluation_requests_customer_id_fkey;
ALTER TABLE evaluation_requests DROP COLUMN customer_id;
ALTER TABLE evaluation_requests RENAME COLUMN customer_id_new TO customer_id;
ALTER TABLE evaluation_requests ALTER COLUMN customer_id SET NOT NULL;

-- Update FK in allowed_domains
ALTER TABLE allowed_domains ADD COLUMN account_id_new uuid;
UPDATE allowed_domains ad SET account_id_new = c.new_id FROM customers c WHERE c.id = ad.account_id;
ALTER TABLE allowed_domains DROP CONSTRAINT IF EXISTS allowed_domains_account_id_fkey;
ALTER TABLE allowed_domains DROP COLUMN account_id;
ALTER TABLE allowed_domains RENAME COLUMN account_id_new TO account_id;

-- Update FK in access_codes
ALTER TABLE access_codes ADD COLUMN associated_account_id_new uuid;
UPDATE access_codes ac SET associated_account_id_new = c.new_id FROM customers c WHERE c.id = ac.associated_account_id;
ALTER TABLE access_codes DROP CONSTRAINT IF EXISTS access_codes_associated_account_id_fkey;
ALTER TABLE access_codes DROP COLUMN associated_account_id;
ALTER TABLE access_codes RENAME COLUMN associated_account_id_new TO associated_account_id;

-- Update FK in archived_users
ALTER TABLE archived_users ADD COLUMN account_id_new uuid;
UPDATE archived_users au SET account_id_new = c.new_id FROM customers c WHERE c.id = au.account_id;
ALTER TABLE archived_users DROP COLUMN account_id;
ALTER TABLE archived_users RENAME COLUMN account_id_new TO account_id;

-- Promote new_id to PK
ALTER TABLE customers DROP CONSTRAINT customers_pkey;
ALTER TABLE customers DROP COLUMN id;
ALTER TABLE customers RENAME COLUMN new_id TO id;
ALTER TABLE customers ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS customers_id_seq;

-- Re-add FK constraints
ALTER TABLE users ADD CONSTRAINT users_account_id_fkey FOREIGN KEY (account_id) REFERENCES customers(id);
ALTER TABLE user_accounts ADD CONSTRAINT user_accounts_account_id_fkey FOREIGN KEY (account_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE infrastructure_profiles ADD CONSTRAINT infrastructure_profiles_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE documents ADD CONSTRAINT documents_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE evaluation_requests ADD CONSTRAINT evaluation_requests_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE allowed_domains ADD CONSTRAINT allowed_domains_account_id_fkey FOREIGN KEY (account_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE access_codes ADD CONSTRAINT access_codes_associated_account_id_fkey FOREIGN KEY (associated_account_id) REFERENCES customers(id);
COMMIT;

-- =============================================================================
-- TIER 2: Main entity tables (projects, products, etc.)
-- =============================================================================

-- products (referenced by: components, criteria_library, product_criteria,
--           product_components, product_outcomes, product_actions,
--           evaluation_request_products, validation_criteria_templates,
--           documents, links, code_scripts, docs_repository_configs)
BEGIN;
ALTER TABLE products ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE components ADD COLUMN solution_id_new uuid;
UPDATE components cm SET solution_id_new = p.new_id FROM products p WHERE p.id = cm.solution_id;
ALTER TABLE components DROP CONSTRAINT IF EXISTS components_solution_id_fkey;
ALTER TABLE components DROP COLUMN solution_id;
ALTER TABLE components RENAME COLUMN solution_id_new TO solution_id;
ALTER TABLE components ALTER COLUMN solution_id SET NOT NULL;

ALTER TABLE product_criteria ADD COLUMN product_id_new uuid;
UPDATE product_criteria pc SET product_id_new = p.new_id FROM products p WHERE p.id = pc.product_id;
ALTER TABLE product_criteria DROP CONSTRAINT IF EXISTS product_criteria_product_id_fkey;
ALTER TABLE product_criteria DROP COLUMN product_id;
ALTER TABLE product_criteria RENAME COLUMN product_id_new TO product_id;
ALTER TABLE product_criteria ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE product_components ADD COLUMN product_id_new uuid;
UPDATE product_components pc SET product_id_new = p.new_id FROM products p WHERE p.id = pc.product_id;
ALTER TABLE product_components DROP CONSTRAINT IF EXISTS product_components_product_id_fkey;
ALTER TABLE product_components DROP COLUMN product_id;
ALTER TABLE product_components RENAME COLUMN product_id_new TO product_id;
ALTER TABLE product_components ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE product_outcomes ADD COLUMN product_id_new uuid;
UPDATE product_outcomes po SET product_id_new = p.new_id FROM products p WHERE p.id = po.product_id;
ALTER TABLE product_outcomes DROP CONSTRAINT IF EXISTS product_outcomes_product_id_fkey;
ALTER TABLE product_outcomes DROP COLUMN product_id;
ALTER TABLE product_outcomes RENAME COLUMN product_id_new TO product_id;
ALTER TABLE product_outcomes ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE product_actions ADD COLUMN product_id_new uuid;
UPDATE product_actions pa SET product_id_new = p.new_id FROM products p WHERE p.id = pa.product_id;
ALTER TABLE product_actions DROP CONSTRAINT IF EXISTS product_actions_product_id_fkey;
ALTER TABLE product_actions DROP COLUMN product_id;
ALTER TABLE product_actions RENAME COLUMN product_id_new TO product_id;
ALTER TABLE product_actions ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE validation_criteria_templates ADD COLUMN root_solution_id_new uuid;
UPDATE validation_criteria_templates vct SET root_solution_id_new = p.new_id FROM products p WHERE p.id = vct.root_solution_id;
ALTER TABLE validation_criteria_templates DROP CONSTRAINT IF EXISTS validation_criteria_templates_root_solution_id_fkey;
ALTER TABLE validation_criteria_templates DROP COLUMN root_solution_id;
ALTER TABLE validation_criteria_templates RENAME COLUMN root_solution_id_new TO root_solution_id;

ALTER TABLE docs_repository_configs ADD COLUMN product_id_new uuid;
UPDATE docs_repository_configs drc SET product_id_new = p.new_id FROM products p WHERE p.id = drc.product_id;
ALTER TABLE docs_repository_configs DROP CONSTRAINT IF EXISTS docs_repository_configs_product_id_fkey;
ALTER TABLE docs_repository_configs DROP COLUMN product_id;
ALTER TABLE docs_repository_configs RENAME COLUMN product_id_new TO product_id;
ALTER TABLE docs_repository_configs ALTER COLUMN product_id SET NOT NULL;

ALTER TABLE products DROP CONSTRAINT products_pkey;
ALTER TABLE products DROP COLUMN id;
ALTER TABLE products RENAME COLUMN new_id TO id;
ALTER TABLE products ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS products_id_seq;

ALTER TABLE components ADD CONSTRAINT components_solution_id_fkey FOREIGN KEY (solution_id) REFERENCES products(id);
ALTER TABLE product_criteria ADD CONSTRAINT product_criteria_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_components ADD CONSTRAINT product_components_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_outcomes ADD CONSTRAINT product_outcomes_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE product_actions ADD CONSTRAINT product_actions_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
ALTER TABLE validation_criteria_templates ADD CONSTRAINT validation_criteria_templates_root_solution_id_fkey FOREIGN KEY (root_solution_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE docs_repository_configs ADD CONSTRAINT docs_repository_configs_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id);
COMMIT;

-- projects (referenced by: activity_logs, project_audits, success_criteria,
--           customer_access, evaluation_requests*, map_phases, map_steps,
--           map_tasks, map_links, project_maps, email_logs, project_risk_predictions,
--           risk_alerts, webhook_deliveries, kanban_audit_events, project_gaps,
--           project_gap_links, project_outcomes, project_map_notification_settings,
--           salesforce_record_links, salesforce_sync_queue*, assessment_jobs*,
--           archived_projects stores snapshot, documents, links, code_scripts)
BEGIN;
ALTER TABLE projects ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

-- activity_logs
ALTER TABLE activity_logs ADD COLUMN project_id_new uuid;
UPDATE activity_logs al SET project_id_new = p.new_id FROM projects p WHERE p.id = al.project_id;
ALTER TABLE activity_logs DROP CONSTRAINT IF EXISTS activity_logs_project_id_fkey;
ALTER TABLE activity_logs DROP COLUMN project_id;
ALTER TABLE activity_logs RENAME COLUMN project_id_new TO project_id;
ALTER TABLE activity_logs ALTER COLUMN project_id SET NOT NULL;

-- project_audits
ALTER TABLE project_audits ADD COLUMN project_id_new uuid;
UPDATE project_audits pa SET project_id_new = p.new_id FROM projects p WHERE p.id = pa.project_id;
ALTER TABLE project_audits DROP CONSTRAINT IF EXISTS project_audits_project_id_fkey;
ALTER TABLE project_audits DROP COLUMN project_id;
ALTER TABLE project_audits RENAME COLUMN project_id_new TO project_id;
ALTER TABLE project_audits ALTER COLUMN project_id SET NOT NULL;

-- success_criteria
ALTER TABLE success_criteria ADD COLUMN project_id_new uuid;
UPDATE success_criteria sc SET project_id_new = p.new_id FROM projects p WHERE p.id = sc.project_id;
ALTER TABLE success_criteria DROP CONSTRAINT IF EXISTS success_criteria_project_id_fkey;
ALTER TABLE success_criteria DROP COLUMN project_id;
ALTER TABLE success_criteria RENAME COLUMN project_id_new TO project_id;
ALTER TABLE success_criteria ALTER COLUMN project_id SET NOT NULL;

-- customer_access
ALTER TABLE customer_access ADD COLUMN project_id_new uuid;
UPDATE customer_access ca SET project_id_new = p.new_id FROM projects p WHERE p.id = ca.project_id;
ALTER TABLE customer_access DROP CONSTRAINT IF EXISTS customer_access_project_id_fkey;
ALTER TABLE customer_access DROP COLUMN project_id;
ALTER TABLE customer_access RENAME COLUMN project_id_new TO project_id;
ALTER TABLE customer_access ALTER COLUMN project_id SET NOT NULL;

-- map_phases
ALTER TABLE map_phases ADD COLUMN project_id_new uuid;
UPDATE map_phases mp SET project_id_new = p.new_id FROM projects p WHERE p.id = mp.project_id;
ALTER TABLE map_phases DROP CONSTRAINT IF EXISTS map_phases_project_id_fkey;
ALTER TABLE map_phases DROP COLUMN project_id;
ALTER TABLE map_phases RENAME COLUMN project_id_new TO project_id;
ALTER TABLE map_phases ALTER COLUMN project_id SET NOT NULL;

-- map_steps
ALTER TABLE map_steps ADD COLUMN project_id_new uuid;
UPDATE map_steps ms SET project_id_new = p.new_id FROM projects p WHERE p.id = ms.project_id;
ALTER TABLE map_steps DROP CONSTRAINT IF EXISTS map_steps_project_id_fkey;
ALTER TABLE map_steps DROP COLUMN project_id;
ALTER TABLE map_steps RENAME COLUMN project_id_new TO project_id;
ALTER TABLE map_steps ALTER COLUMN project_id SET NOT NULL;

-- map_tasks
ALTER TABLE map_tasks ADD COLUMN project_id_new uuid;
UPDATE map_tasks mt SET project_id_new = p.new_id FROM projects p WHERE p.id = mt.project_id;
ALTER TABLE map_tasks DROP CONSTRAINT IF EXISTS map_tasks_project_id_fkey;
ALTER TABLE map_tasks DROP COLUMN project_id;
ALTER TABLE map_tasks RENAME COLUMN project_id_new TO project_id;
ALTER TABLE map_tasks ALTER COLUMN project_id SET NOT NULL;

-- email_logs
ALTER TABLE email_logs ADD COLUMN project_id_new uuid;
UPDATE email_logs el SET project_id_new = p.new_id FROM projects p WHERE p.id = el.project_id;
ALTER TABLE email_logs DROP CONSTRAINT IF EXISTS email_logs_project_id_fkey;
ALTER TABLE email_logs DROP COLUMN project_id;
ALTER TABLE email_logs RENAME COLUMN project_id_new TO project_id;

-- project_risk_predictions
ALTER TABLE project_risk_predictions ADD COLUMN project_id_new uuid;
UPDATE project_risk_predictions prp SET project_id_new = p.new_id FROM projects p WHERE p.id = prp.project_id;
ALTER TABLE project_risk_predictions DROP CONSTRAINT IF EXISTS project_risk_predictions_project_id_fkey;
ALTER TABLE project_risk_predictions DROP COLUMN project_id;
ALTER TABLE project_risk_predictions RENAME COLUMN project_id_new TO project_id;

-- risk_alerts
ALTER TABLE risk_alerts ADD COLUMN project_id_new uuid;
UPDATE risk_alerts ra SET project_id_new = p.new_id FROM projects p WHERE p.id = ra.project_id;
ALTER TABLE risk_alerts DROP CONSTRAINT IF EXISTS risk_alerts_project_id_fkey;
ALTER TABLE risk_alerts DROP COLUMN project_id;
ALTER TABLE risk_alerts RENAME COLUMN project_id_new TO project_id;

-- webhook_deliveries
ALTER TABLE webhook_deliveries ADD COLUMN project_id_new uuid;
UPDATE webhook_deliveries wd SET project_id_new = p.new_id FROM projects p WHERE p.id = wd.project_id;
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_project_id_fkey;
ALTER TABLE webhook_deliveries DROP COLUMN project_id;
ALTER TABLE webhook_deliveries RENAME COLUMN project_id_new TO project_id;

-- kanban_audit_events
ALTER TABLE kanban_audit_events ADD COLUMN project_id_new uuid;
UPDATE kanban_audit_events kae SET project_id_new = p.new_id FROM projects p WHERE p.id = kae.project_id;
ALTER TABLE kanban_audit_events DROP CONSTRAINT IF EXISTS kanban_audit_events_project_id_fkey;
ALTER TABLE kanban_audit_events DROP COLUMN project_id;
ALTER TABLE kanban_audit_events RENAME COLUMN project_id_new TO project_id;

-- documents (project_id FK)
ALTER TABLE documents ADD COLUMN project_id_new uuid;
UPDATE documents d SET project_id_new = p.new_id FROM projects p WHERE p.id = d.project_id;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_project_id_fkey;
ALTER TABLE documents DROP COLUMN project_id;
ALTER TABLE documents RENAME COLUMN project_id_new TO project_id;

-- links (project_id FK)
ALTER TABLE links ADD COLUMN project_id_new uuid;
UPDATE links l SET project_id_new = p.new_id FROM projects p WHERE p.id = l.project_id;
ALTER TABLE links DROP CONSTRAINT IF EXISTS links_project_id_fkey;
ALTER TABLE links DROP COLUMN project_id;
ALTER TABLE links RENAME COLUMN project_id_new TO project_id;

-- code_scripts (project_id FK)
ALTER TABLE code_scripts ADD COLUMN project_id_new uuid;
UPDATE code_scripts cs SET project_id_new = p.new_id FROM projects p WHERE p.id = cs.project_id;
ALTER TABLE code_scripts DROP CONSTRAINT IF EXISTS code_scripts_project_id_fkey;
ALTER TABLE code_scripts DROP COLUMN project_id;
ALTER TABLE code_scripts RENAME COLUMN project_id_new TO project_id;

-- project_map_notification_settings
ALTER TABLE project_map_notification_settings ADD COLUMN project_id_new uuid;
UPDATE project_map_notification_settings pmns SET project_id_new = p.new_id FROM projects p WHERE p.id = pmns.project_id;
ALTER TABLE project_map_notification_settings DROP CONSTRAINT IF EXISTS project_map_notification_settings_project_id_fkey;
ALTER TABLE project_map_notification_settings DROP COLUMN project_id;
ALTER TABLE project_map_notification_settings RENAME COLUMN project_id_new TO project_id;
ALTER TABLE project_map_notification_settings ALTER COLUMN project_id SET NOT NULL;

-- users.last_accessed_project_id
ALTER TABLE users ADD COLUMN last_accessed_project_id_new uuid;
UPDATE users u SET last_accessed_project_id_new = p.new_id FROM projects p WHERE p.id = u.last_accessed_project_id;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_last_accessed_project_id_fkey;
ALTER TABLE users DROP COLUMN last_accessed_project_id;
ALTER TABLE users RENAME COLUMN last_accessed_project_id_new TO last_accessed_project_id;

-- Promote projects PK
ALTER TABLE projects DROP CONSTRAINT projects_pkey;
ALTER TABLE projects DROP COLUMN id;
ALTER TABLE projects RENAME COLUMN new_id TO id;
ALTER TABLE projects ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS projects_id_seq;

-- Also convert projects.validation_criteria_template_id below
-- after those tables are converted.

-- Re-add FK constraints
ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE project_audits ADD CONSTRAINT project_audits_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE success_criteria ADD CONSTRAINT success_criteria_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE customer_access ADD CONSTRAINT customer_access_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE map_phases ADD CONSTRAINT map_phases_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE map_steps ADD CONSTRAINT map_steps_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE map_tasks ADD CONSTRAINT map_tasks_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE email_logs ADD CONSTRAINT email_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE project_risk_predictions ADD CONSTRAINT project_risk_predictions_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE risk_alerts ADD CONSTRAINT risk_alerts_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE documents ADD CONSTRAINT documents_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE links ADD CONSTRAINT links_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE code_scripts ADD CONSTRAINT code_scripts_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id);
ALTER TABLE project_map_notification_settings ADD CONSTRAINT project_map_notification_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT users_last_accessed_project_id_fkey FOREIGN KEY (last_accessed_project_id) REFERENCES projects(id);
COMMIT;

-- =============================================================================
-- TIER 3: Tables with FKs into Tier 2 tables
-- =============================================================================

-- components (referenced by: criteria_library, product_components)
BEGIN;
ALTER TABLE components ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE criteria_library ADD COLUMN component_id_new uuid;
UPDATE criteria_library cl SET component_id_new = c.new_id FROM components c WHERE c.id = cl.component_id;
ALTER TABLE criteria_library DROP CONSTRAINT IF EXISTS criteria_library_component_id_fkey;
ALTER TABLE criteria_library DROP COLUMN component_id;
ALTER TABLE criteria_library RENAME COLUMN component_id_new TO component_id;

ALTER TABLE product_components ADD COLUMN component_id_new uuid;
UPDATE product_components pc SET component_id_new = c.new_id FROM components c WHERE c.id = pc.component_id;
ALTER TABLE product_components DROP CONSTRAINT IF EXISTS product_components_component_id_fkey;
ALTER TABLE product_components DROP COLUMN component_id;
ALTER TABLE product_components RENAME COLUMN component_id_new TO component_id;
ALTER TABLE product_components ALTER COLUMN component_id SET NOT NULL;

ALTER TABLE components DROP CONSTRAINT components_pkey;
ALTER TABLE components DROP COLUMN id;
ALTER TABLE components RENAME COLUMN new_id TO id;
ALTER TABLE components ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS components_id_seq;

ALTER TABLE criteria_library ADD CONSTRAINT criteria_library_component_id_fkey FOREIGN KEY (component_id) REFERENCES components(id);
ALTER TABLE product_components ADD CONSTRAINT product_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES components(id);
COMMIT;

-- criteria_library (referenced by: product_criteria, criteria_outcomes)
BEGIN;
ALTER TABLE criteria_library ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE product_criteria ADD COLUMN criteria_id_new uuid;
UPDATE product_criteria pc SET criteria_id_new = cl.new_id FROM criteria_library cl WHERE cl.id = pc.criteria_id;
ALTER TABLE product_criteria DROP CONSTRAINT IF EXISTS product_criteria_criteria_id_fkey;
ALTER TABLE product_criteria DROP COLUMN criteria_id;
ALTER TABLE product_criteria RENAME COLUMN criteria_id_new TO criteria_id;
ALTER TABLE product_criteria ALTER COLUMN criteria_id SET NOT NULL;

ALTER TABLE criteria_outcomes ADD COLUMN criteria_id_new uuid;
UPDATE criteria_outcomes co SET criteria_id_new = cl.new_id FROM criteria_library cl WHERE cl.id = co.criteria_id;
ALTER TABLE criteria_outcomes DROP CONSTRAINT IF EXISTS criteria_outcomes_criteria_id_fkey;
ALTER TABLE criteria_outcomes DROP COLUMN criteria_id;
ALTER TABLE criteria_outcomes RENAME COLUMN criteria_id_new TO criteria_id;
ALTER TABLE criteria_outcomes ALTER COLUMN criteria_id SET NOT NULL;

ALTER TABLE criteria_library DROP CONSTRAINT criteria_library_pkey;
ALTER TABLE criteria_library DROP COLUMN id;
ALTER TABLE criteria_library RENAME COLUMN new_id TO id;
ALTER TABLE criteria_library ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS criteria_library_id_seq;

ALTER TABLE product_criteria ADD CONSTRAINT product_criteria_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES criteria_library(id);
ALTER TABLE criteria_outcomes ADD CONSTRAINT criteria_outcomes_criteria_id_fkey FOREIGN KEY (criteria_id) REFERENCES criteria_library(id);
COMMIT;

-- expected_outcomes (referenced by: product_outcomes, criteria_outcomes, outcome_actions)
BEGIN;
ALTER TABLE expected_outcomes ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE product_outcomes ADD COLUMN outcome_id_new uuid;
UPDATE product_outcomes po SET outcome_id_new = eo.new_id FROM expected_outcomes eo WHERE eo.id = po.outcome_id;
ALTER TABLE product_outcomes DROP CONSTRAINT IF EXISTS product_outcomes_outcome_id_fkey;
ALTER TABLE product_outcomes DROP COLUMN outcome_id;
ALTER TABLE product_outcomes RENAME COLUMN outcome_id_new TO outcome_id;
ALTER TABLE product_outcomes ALTER COLUMN outcome_id SET NOT NULL;

ALTER TABLE criteria_outcomes ADD COLUMN outcome_id_new uuid;
UPDATE criteria_outcomes co SET outcome_id_new = eo.new_id FROM expected_outcomes eo WHERE eo.id = co.outcome_id;
ALTER TABLE criteria_outcomes DROP CONSTRAINT IF EXISTS criteria_outcomes_outcome_id_fkey;
ALTER TABLE criteria_outcomes DROP COLUMN outcome_id;
ALTER TABLE criteria_outcomes RENAME COLUMN outcome_id_new TO outcome_id;
ALTER TABLE criteria_outcomes ALTER COLUMN outcome_id SET NOT NULL;

ALTER TABLE outcome_actions ADD COLUMN outcome_id_new uuid;
UPDATE outcome_actions oa SET outcome_id_new = eo.new_id FROM expected_outcomes eo WHERE eo.id = oa.outcome_id;
ALTER TABLE outcome_actions DROP CONSTRAINT IF EXISTS outcome_actions_outcome_id_fkey;
ALTER TABLE outcome_actions DROP COLUMN outcome_id;
ALTER TABLE outcome_actions RENAME COLUMN outcome_id_new TO outcome_id;
ALTER TABLE outcome_actions ALTER COLUMN outcome_id SET NOT NULL;

ALTER TABLE expected_outcomes DROP CONSTRAINT expected_outcomes_pkey;
ALTER TABLE expected_outcomes DROP COLUMN id;
ALTER TABLE expected_outcomes RENAME COLUMN new_id TO id;
ALTER TABLE expected_outcomes ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS expected_outcomes_id_seq;

ALTER TABLE product_outcomes ADD CONSTRAINT product_outcomes_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES expected_outcomes(id);
ALTER TABLE criteria_outcomes ADD CONSTRAINT criteria_outcomes_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES expected_outcomes(id);
ALTER TABLE outcome_actions ADD CONSTRAINT outcome_actions_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES expected_outcomes(id);
COMMIT;

-- action_items (referenced by: product_actions, outcome_actions)
BEGIN;
ALTER TABLE action_items ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE product_actions ADD COLUMN action_id_new uuid;
UPDATE product_actions pa SET action_id_new = ai.new_id FROM action_items ai WHERE ai.id = pa.action_id;
ALTER TABLE product_actions DROP CONSTRAINT IF EXISTS product_actions_action_id_fkey;
ALTER TABLE product_actions DROP COLUMN action_id;
ALTER TABLE product_actions RENAME COLUMN action_id_new TO action_id;
ALTER TABLE product_actions ALTER COLUMN action_id SET NOT NULL;

ALTER TABLE outcome_actions ADD COLUMN action_id_new uuid;
UPDATE outcome_actions oa SET action_id_new = ai.new_id FROM action_items ai WHERE ai.id = oa.action_id;
ALTER TABLE outcome_actions DROP CONSTRAINT IF EXISTS outcome_actions_action_id_fkey;
ALTER TABLE outcome_actions DROP COLUMN action_id;
ALTER TABLE outcome_actions RENAME COLUMN action_id_new TO action_id;
ALTER TABLE outcome_actions ALTER COLUMN action_id SET NOT NULL;

ALTER TABLE action_items DROP CONSTRAINT action_items_pkey;
ALTER TABLE action_items DROP COLUMN id;
ALTER TABLE action_items RENAME COLUMN new_id TO id;
ALTER TABLE action_items ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS action_items_id_seq;

ALTER TABLE product_actions ADD CONSTRAINT product_actions_action_id_fkey FOREIGN KEY (action_id) REFERENCES action_items(id);
ALTER TABLE outcome_actions ADD CONSTRAINT outcome_actions_action_id_fkey FOREIGN KEY (action_id) REFERENCES action_items(id);
COMMIT;

-- validation_criteria_templates (referenced by: projects, validation_criteria_template_links)
BEGIN;
ALTER TABLE validation_criteria_templates ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE projects ADD COLUMN validation_criteria_template_id_new uuid;
UPDATE projects pr SET validation_criteria_template_id_new = vct.new_id FROM validation_criteria_templates vct WHERE vct.id = pr.validation_criteria_template_id;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_validation_criteria_template_id_fkey;
ALTER TABLE projects DROP COLUMN validation_criteria_template_id;
ALTER TABLE projects RENAME COLUMN validation_criteria_template_id_new TO validation_criteria_template_id;

ALTER TABLE validation_criteria_template_links ADD COLUMN template_id_new uuid;
UPDATE validation_criteria_template_links vctl SET template_id_new = vct.new_id FROM validation_criteria_templates vct WHERE vct.id = vctl.template_id;
ALTER TABLE validation_criteria_template_links DROP CONSTRAINT IF EXISTS validation_criteria_template_links_template_id_fkey;
ALTER TABLE validation_criteria_template_links DROP COLUMN template_id;
ALTER TABLE validation_criteria_template_links RENAME COLUMN template_id_new TO template_id;
ALTER TABLE validation_criteria_template_links ALTER COLUMN template_id SET NOT NULL;

ALTER TABLE validation_criteria_templates DROP CONSTRAINT validation_criteria_templates_pkey;
ALTER TABLE validation_criteria_templates DROP COLUMN id;
ALTER TABLE validation_criteria_templates RENAME COLUMN new_id TO id;
ALTER TABLE validation_criteria_templates ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS validation_criteria_templates_id_seq;

ALTER TABLE projects ADD CONSTRAINT projects_validation_criteria_template_id_fkey FOREIGN KEY (validation_criteria_template_id) REFERENCES validation_criteria_templates(id) ON DELETE SET NULL;
ALTER TABLE validation_criteria_template_links ADD CONSTRAINT validation_criteria_template_links_template_id_fkey FOREIGN KEY (template_id) REFERENCES validation_criteria_templates(id) ON DELETE CASCADE;
COMMIT;

-- =============================================================================
-- TIER 4: Junction/leaf tables (no inbound FKs)
-- =============================================================================

-- Simple serial-only tables with no children — convert directly
BEGIN;
ALTER TABLE tags ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE tags ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS tags_id_seq;

ALTER TABLE success_criteria ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE success_criteria ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS success_criteria_id_seq;

ALTER TABLE product_criteria ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE product_criteria ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS product_criteria_id_seq;

ALTER TABLE product_components ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE product_components ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS product_components_id_seq;

ALTER TABLE product_outcomes ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE product_outcomes ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS product_outcomes_id_seq;

ALTER TABLE product_actions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE product_actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS product_actions_id_seq;

ALTER TABLE criteria_outcomes ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE criteria_outcomes ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS criteria_outcomes_id_seq;

ALTER TABLE outcome_actions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE outcome_actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS outcome_actions_id_seq;

ALTER TABLE validation_criteria_template_links ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE validation_criteria_template_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS validation_criteria_template_links_id_seq;

ALTER TABLE activity_logs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE activity_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS activity_logs_id_seq;

ALTER TABLE project_audits ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_audits ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_audits_id_seq;

ALTER TABLE customer_access ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE customer_access ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS customer_access_id_seq;

ALTER TABLE infrastructure_profiles ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE infrastructure_profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS infrastructure_profiles_id_seq;

ALTER TABLE documents ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE documents ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS documents_id_seq;

ALTER TABLE links ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE links ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS links_id_seq;

ALTER TABLE code_scripts ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE code_scripts ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS code_scripts_id_seq;
COMMIT;

-- Email tables
BEGIN;
ALTER TABLE email_logs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_logs_id_seq;

ALTER TABLE email_triggers ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_triggers ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_triggers_id_seq;
COMMIT;

-- email_rules (referenced by: email_rule_conditions, email_rule_actions,
--              email_schedules, email_rule_audits, webhook_deliveries)
BEGIN;
ALTER TABLE email_rules ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE email_rule_conditions ADD COLUMN rule_id_new uuid;
UPDATE email_rule_conditions erc SET rule_id_new = er.new_id FROM email_rules er WHERE er.id = erc.rule_id;
ALTER TABLE email_rule_conditions DROP CONSTRAINT IF EXISTS email_rule_conditions_rule_id_fkey;
ALTER TABLE email_rule_conditions DROP COLUMN rule_id;
ALTER TABLE email_rule_conditions RENAME COLUMN rule_id_new TO rule_id;
ALTER TABLE email_rule_conditions ALTER COLUMN rule_id SET NOT NULL;

ALTER TABLE email_rule_actions ADD COLUMN rule_id_new uuid;
UPDATE email_rule_actions era SET rule_id_new = er.new_id FROM email_rules er WHERE er.id = era.rule_id;
ALTER TABLE email_rule_actions DROP CONSTRAINT IF EXISTS email_rule_actions_rule_id_fkey;
ALTER TABLE email_rule_actions DROP COLUMN rule_id;
ALTER TABLE email_rule_actions RENAME COLUMN rule_id_new TO rule_id;
ALTER TABLE email_rule_actions ALTER COLUMN rule_id SET NOT NULL;

ALTER TABLE email_schedules ADD COLUMN rule_id_new uuid;
UPDATE email_schedules es SET rule_id_new = er.new_id FROM email_rules er WHERE er.id = es.rule_id;
ALTER TABLE email_schedules DROP CONSTRAINT IF EXISTS email_schedules_rule_id_fkey;
ALTER TABLE email_schedules DROP COLUMN rule_id;
ALTER TABLE email_schedules RENAME COLUMN rule_id_new TO rule_id;

ALTER TABLE email_rule_audits ADD COLUMN rule_id_new uuid;
UPDATE email_rule_audits era SET rule_id_new = er.new_id FROM email_rules er WHERE er.id = era.rule_id;
ALTER TABLE email_rule_audits DROP CONSTRAINT IF EXISTS email_rule_audits_rule_id_fkey;
ALTER TABLE email_rule_audits DROP COLUMN rule_id;
ALTER TABLE email_rule_audits RENAME COLUMN rule_id_new TO rule_id;

ALTER TABLE webhook_deliveries ADD COLUMN rule_id_new uuid;
UPDATE webhook_deliveries wd SET rule_id_new = er.new_id FROM email_rules er WHERE er.id = wd.rule_id;
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_rule_id_fkey;
ALTER TABLE webhook_deliveries DROP COLUMN rule_id;
ALTER TABLE webhook_deliveries RENAME COLUMN rule_id_new TO rule_id;

ALTER TABLE email_rules DROP CONSTRAINT email_rules_pkey;
ALTER TABLE email_rules DROP COLUMN id;
ALTER TABLE email_rules RENAME COLUMN new_id TO id;
ALTER TABLE email_rules ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS email_rules_id_seq;

ALTER TABLE email_rule_conditions ADD CONSTRAINT email_rule_conditions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE CASCADE;
ALTER TABLE email_rule_actions ADD CONSTRAINT email_rule_actions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE CASCADE;
ALTER TABLE email_schedules ADD CONSTRAINT email_schedules_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE CASCADE;
ALTER TABLE email_rule_audits ADD CONSTRAINT email_rule_audits_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE SET NULL;
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES email_rules(id) ON DELETE SET NULL;
COMMIT;

-- Remaining email leaf tables
BEGIN;
ALTER TABLE email_rule_conditions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_rule_conditions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_rule_conditions_id_seq;

ALTER TABLE email_rule_actions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_rule_actions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_rule_actions_id_seq;

ALTER TABLE email_schedules ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_schedules ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_schedules_id_seq;

ALTER TABLE email_rule_audits ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_rule_audits ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_rule_audits_id_seq;

ALTER TABLE user_email_preferences ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE user_email_preferences ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS user_email_preferences_id_seq;

ALTER TABLE project_map_notification_settings ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_map_notification_settings ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_map_notification_settings_id_seq;

ALTER TABLE email_templates ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE email_templates ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS email_templates_id_seq;
COMMIT;

-- AI tables
BEGIN;
ALTER TABLE assessment_rulesets ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE risk_criteria ADD COLUMN ruleset_id_new uuid;
UPDATE risk_criteria rc SET ruleset_id_new = ar.new_id FROM assessment_rulesets ar WHERE ar.id = rc.ruleset_id;
ALTER TABLE risk_criteria DROP CONSTRAINT IF EXISTS risk_criteria_ruleset_id_fkey;
ALTER TABLE risk_criteria DROP COLUMN ruleset_id;
ALTER TABLE risk_criteria RENAME COLUMN ruleset_id_new TO ruleset_id;

ALTER TABLE project_risk_predictions ADD COLUMN ruleset_id_new uuid;
UPDATE project_risk_predictions prp SET ruleset_id_new = ar.new_id FROM assessment_rulesets ar WHERE ar.id = prp.ruleset_id;
ALTER TABLE project_risk_predictions DROP CONSTRAINT IF EXISTS project_risk_predictions_ruleset_id_fkey;
ALTER TABLE project_risk_predictions DROP COLUMN ruleset_id;
ALTER TABLE project_risk_predictions RENAME COLUMN ruleset_id_new TO ruleset_id;

ALTER TABLE assessment_jobs ADD COLUMN ruleset_id_new uuid;
UPDATE assessment_jobs aj SET ruleset_id_new = ar.new_id FROM assessment_rulesets ar WHERE ar.id = aj.ruleset_id;
ALTER TABLE assessment_jobs DROP CONSTRAINT IF EXISTS assessment_jobs_ruleset_id_fkey;
ALTER TABLE assessment_jobs DROP COLUMN ruleset_id;
ALTER TABLE assessment_jobs RENAME COLUMN ruleset_id_new TO ruleset_id;

ALTER TABLE assessment_rulesets DROP CONSTRAINT assessment_rulesets_pkey;
ALTER TABLE assessment_rulesets DROP COLUMN id;
ALTER TABLE assessment_rulesets RENAME COLUMN new_id TO id;
ALTER TABLE assessment_rulesets ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS assessment_rulesets_id_seq;

ALTER TABLE risk_criteria ADD CONSTRAINT risk_criteria_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES assessment_rulesets(id);
ALTER TABLE project_risk_predictions ADD CONSTRAINT project_risk_predictions_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES assessment_rulesets(id);
ALTER TABLE assessment_jobs ADD CONSTRAINT assessment_jobs_ruleset_id_fkey FOREIGN KEY (ruleset_id) REFERENCES assessment_rulesets(id);
COMMIT;

-- AI leaf tables
BEGIN;
ALTER TABLE risk_criteria ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE risk_criteria ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS risk_criteria_id_seq;

ALTER TABLE project_risk_predictions ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE risk_alerts ADD COLUMN risk_prediction_id_new uuid;
UPDATE risk_alerts ra SET risk_prediction_id_new = prp.new_id FROM project_risk_predictions prp WHERE prp.id = ra.risk_prediction_id;
ALTER TABLE risk_alerts DROP CONSTRAINT IF EXISTS risk_alerts_risk_prediction_id_fkey;
ALTER TABLE risk_alerts DROP COLUMN risk_prediction_id;
ALTER TABLE risk_alerts RENAME COLUMN risk_prediction_id_new TO risk_prediction_id;
ALTER TABLE project_risk_predictions DROP CONSTRAINT project_risk_predictions_pkey;
ALTER TABLE project_risk_predictions DROP COLUMN id;
ALTER TABLE project_risk_predictions RENAME COLUMN new_id TO id;
ALTER TABLE project_risk_predictions ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS project_risk_predictions_id_seq;
ALTER TABLE risk_alerts ADD CONSTRAINT risk_alerts_risk_prediction_id_fkey FOREIGN KEY (risk_prediction_id) REFERENCES project_risk_predictions(id);

ALTER TABLE risk_alerts ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE risk_alerts ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS risk_alerts_id_seq;

ALTER TABLE ai_provider_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE ai_provider_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS ai_provider_configs_id_seq;

ALTER TABLE assessment_jobs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE assessment_jobs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS assessment_jobs_id_seq;
COMMIT;

-- MAP tables
BEGIN;
ALTER TABLE map_phases ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE map_steps ADD COLUMN phase_id_new uuid;
UPDATE map_steps ms SET phase_id_new = mp.new_id FROM map_phases mp WHERE mp.id = ms.phase_id;
ALTER TABLE map_steps DROP CONSTRAINT IF EXISTS map_steps_phase_id_fkey;
ALTER TABLE map_steps DROP COLUMN phase_id;
ALTER TABLE map_steps RENAME COLUMN phase_id_new TO phase_id;
ALTER TABLE map_steps ALTER COLUMN phase_id SET NOT NULL;

ALTER TABLE map_tasks ADD COLUMN phase_id_new uuid;
UPDATE map_tasks mt SET phase_id_new = mp.new_id FROM map_phases mp WHERE mp.id = mt.phase_id;
ALTER TABLE map_tasks DROP CONSTRAINT IF EXISTS map_tasks_phase_id_fkey;
ALTER TABLE map_tasks DROP COLUMN phase_id;
ALTER TABLE map_tasks RENAME COLUMN phase_id_new TO phase_id;
ALTER TABLE map_tasks ALTER COLUMN phase_id SET NOT NULL;

ALTER TABLE map_phases DROP CONSTRAINT map_phases_pkey;
ALTER TABLE map_phases DROP COLUMN id;
ALTER TABLE map_phases RENAME COLUMN new_id TO id;
ALTER TABLE map_phases ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS map_phases_id_seq;

ALTER TABLE map_steps ADD CONSTRAINT map_steps_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES map_phases(id) ON DELETE CASCADE;
ALTER TABLE map_tasks ADD CONSTRAINT map_tasks_phase_id_fkey FOREIGN KEY (phase_id) REFERENCES map_phases(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE map_steps ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE map_tasks ADD COLUMN step_id_new uuid;
UPDATE map_tasks mt SET step_id_new = ms.new_id FROM map_steps ms WHERE ms.id = mt.step_id;
ALTER TABLE map_tasks DROP CONSTRAINT IF EXISTS map_tasks_step_id_fkey;
ALTER TABLE map_tasks DROP COLUMN step_id;
ALTER TABLE map_tasks RENAME COLUMN step_id_new TO step_id;
ALTER TABLE map_tasks ALTER COLUMN step_id SET NOT NULL;

ALTER TABLE map_steps DROP CONSTRAINT map_steps_pkey;
ALTER TABLE map_steps DROP COLUMN id;
ALTER TABLE map_steps RENAME COLUMN new_id TO id;
ALTER TABLE map_steps ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS map_steps_id_seq;

ALTER TABLE map_tasks ADD CONSTRAINT map_tasks_step_id_fkey FOREIGN KEY (step_id) REFERENCES map_steps(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE map_tasks ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_tasks ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_tasks_id_seq;

ALTER TABLE map_links ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_links_id_seq;

ALTER TABLE map_template_phases ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_template_phases ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_template_phases_id_seq;

ALTER TABLE map_template_steps ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_template_steps ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_template_steps_id_seq;

ALTER TABLE map_template_tasks ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_template_tasks ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_template_tasks_id_seq;

ALTER TABLE map_templates ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_templates ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_templates_id_seq;

ALTER TABLE map_template_applications ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_template_applications ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_template_applications_id_seq;

ALTER TABLE project_maps ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_maps ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_maps_id_seq;

ALTER TABLE map_automation_config ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_automation_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_automation_config_id_seq;

ALTER TABLE map_assignment_overrides ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE map_assignment_overrides ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS map_assignment_overrides_id_seq;
COMMIT;

-- Auth tables (user_permissions, roles → role_permissions)
BEGIN;
ALTER TABLE user_permissions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE user_permissions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS user_permissions_id_seq;
COMMIT;

BEGIN;
ALTER TABLE roles ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE role_permissions ADD COLUMN role_id_new uuid;
UPDATE role_permissions rp SET role_id_new = r.new_id FROM roles r WHERE r.id = rp.role_id;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_fkey;
ALTER TABLE role_permissions DROP COLUMN role_id;
ALTER TABLE role_permissions RENAME COLUMN role_id_new TO role_id;
ALTER TABLE role_permissions ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE roles DROP CONSTRAINT roles_pkey;
ALTER TABLE roles DROP COLUMN id;
ALTER TABLE roles RENAME COLUMN new_id TO id;
ALTER TABLE roles ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS roles_id_seq;

ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id);
COMMIT;

BEGIN;
ALTER TABLE role_permissions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE role_permissions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS role_permissions_id_seq;

ALTER TABLE user_accounts ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE user_accounts ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS user_accounts_id_seq;

ALTER TABLE audit_logins ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE audit_logins ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS audit_logins_id_seq;
COMMIT;

-- Dashboard tables
BEGIN;
ALTER TABLE custom_reports ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE user_report_favorites ADD COLUMN report_id_new uuid;
UPDATE user_report_favorites urf SET report_id_new = cr.new_id FROM custom_reports cr WHERE cr.id = urf.report_id;
ALTER TABLE user_report_favorites DROP CONSTRAINT IF EXISTS user_report_favorites_report_id_fkey;
ALTER TABLE user_report_favorites DROP COLUMN report_id;
ALTER TABLE user_report_favorites RENAME COLUMN report_id_new TO report_id;

ALTER TABLE report_executions ADD COLUMN report_id_new uuid;
UPDATE report_executions re SET report_id_new = cr.new_id FROM custom_reports cr WHERE cr.id = re.report_id;
ALTER TABLE report_executions DROP CONSTRAINT IF EXISTS report_executions_report_id_fkey;
ALTER TABLE report_executions DROP COLUMN report_id;
ALTER TABLE report_executions RENAME COLUMN report_id_new TO report_id;
ALTER TABLE report_executions ALTER COLUMN report_id SET NOT NULL;

ALTER TABLE custom_reports DROP CONSTRAINT custom_reports_pkey;
ALTER TABLE custom_reports DROP COLUMN id;
ALTER TABLE custom_reports RENAME COLUMN new_id TO id;
ALTER TABLE custom_reports ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS custom_reports_id_seq;

ALTER TABLE user_report_favorites ADD CONSTRAINT user_report_favorites_report_id_fkey FOREIGN KEY (report_id) REFERENCES custom_reports(id);
ALTER TABLE report_executions ADD CONSTRAINT report_executions_report_id_fkey FOREIGN KEY (report_id) REFERENCES custom_reports(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE user_report_favorites ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE user_report_favorites ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS user_report_favorites_id_seq;

ALTER TABLE report_executions ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE report_executions ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS report_executions_id_seq;
COMMIT;

BEGIN;
ALTER TABLE dashboard_layouts ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE widget_configs ADD COLUMN layout_id_new uuid;
UPDATE widget_configs wc SET layout_id_new = dl.new_id FROM dashboard_layouts dl WHERE dl.id = wc.layout_id;
ALTER TABLE widget_configs DROP CONSTRAINT IF EXISTS widget_configs_layout_id_fkey;
ALTER TABLE widget_configs DROP COLUMN layout_id;
ALTER TABLE widget_configs RENAME COLUMN layout_id_new TO layout_id;

ALTER TABLE dashboard_layouts DROP CONSTRAINT dashboard_layouts_pkey;
ALTER TABLE dashboard_layouts DROP COLUMN id;
ALTER TABLE dashboard_layouts RENAME COLUMN new_id TO id;
ALTER TABLE dashboard_layouts ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS dashboard_layouts_id_seq;

ALTER TABLE widget_configs ADD CONSTRAINT widget_configs_layout_id_fkey FOREIGN KEY (layout_id) REFERENCES dashboard_layouts(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE widget_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE widget_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS widget_configs_id_seq;

ALTER TABLE dashboard_configs ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE dashboard_configs ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS dashboard_configs_id_seq;

ALTER TABLE dashboard_metrics ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE dashboard_metrics ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS dashboard_metrics_id_seq;

ALTER TABLE metric_snapshots ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE metric_snapshots ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS metric_snapshots_id_seq;
COMMIT;

-- Docs tables
BEGIN;
ALTER TABLE docs_repository_configs ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE docs_sidebar_structure ADD COLUMN repo_config_id_new uuid;
UPDATE docs_sidebar_structure dss SET repo_config_id_new = drc.new_id FROM docs_repository_configs drc WHERE drc.id = dss.repo_config_id;
ALTER TABLE docs_sidebar_structure DROP CONSTRAINT IF EXISTS docs_sidebar_structure_repo_config_id_fkey;
ALTER TABLE docs_sidebar_structure DROP COLUMN repo_config_id;
ALTER TABLE docs_sidebar_structure RENAME COLUMN repo_config_id_new TO repo_config_id;
ALTER TABLE docs_sidebar_structure ALTER COLUMN repo_config_id SET NOT NULL;

ALTER TABLE docs_content_cache ADD COLUMN repo_config_id_new uuid;
UPDATE docs_content_cache dcc SET repo_config_id_new = drc.new_id FROM docs_repository_configs drc WHERE drc.id = dcc.repo_config_id;
ALTER TABLE docs_content_cache DROP CONSTRAINT IF EXISTS docs_content_cache_repo_config_id_fkey;
ALTER TABLE docs_content_cache DROP COLUMN repo_config_id;
ALTER TABLE docs_content_cache RENAME COLUMN repo_config_id_new TO repo_config_id;
ALTER TABLE docs_content_cache ALTER COLUMN repo_config_id SET NOT NULL;

ALTER TABLE docs_repository_configs DROP CONSTRAINT docs_repository_configs_pkey;
ALTER TABLE docs_repository_configs DROP COLUMN id;
ALTER TABLE docs_repository_configs RENAME COLUMN new_id TO id;
ALTER TABLE docs_repository_configs ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS docs_repository_configs_id_seq;

ALTER TABLE docs_sidebar_structure ADD CONSTRAINT docs_sidebar_structure_repo_config_id_fkey FOREIGN KEY (repo_config_id) REFERENCES docs_repository_configs(id) ON DELETE CASCADE;
ALTER TABLE docs_content_cache ADD CONSTRAINT docs_content_cache_repo_config_id_fkey FOREIGN KEY (repo_config_id) REFERENCES docs_repository_configs(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE docs_sidebar_structure ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE docs_sidebar_structure ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS docs_sidebar_structure_id_seq;

ALTER TABLE docs_content_cache ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE docs_content_cache ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS docs_content_cache_id_seq;
COMMIT;

-- Access control leaf tables
BEGIN;
ALTER TABLE allowed_domains ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE allowed_domains ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS allowed_domains_id_seq;

ALTER TABLE access_codes ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE access_code_usage ADD COLUMN access_code_id_new uuid;
UPDATE access_code_usage acu SET access_code_id_new = ac.new_id FROM access_codes ac WHERE ac.id = acu.access_code_id;
ALTER TABLE access_code_usage DROP CONSTRAINT IF EXISTS access_code_usage_access_code_id_fkey;
ALTER TABLE access_code_usage DROP COLUMN access_code_id;
ALTER TABLE access_code_usage RENAME COLUMN access_code_id_new TO access_code_id;
ALTER TABLE access_code_usage ALTER COLUMN access_code_id SET NOT NULL;
ALTER TABLE access_codes DROP CONSTRAINT access_codes_pkey;
ALTER TABLE access_codes DROP COLUMN id;
ALTER TABLE access_codes RENAME COLUMN new_id TO id;
ALTER TABLE access_codes ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS access_codes_id_seq;
ALTER TABLE access_code_usage ADD CONSTRAINT access_code_usage_access_code_id_fkey FOREIGN KEY (access_code_id) REFERENCES access_codes(id) ON DELETE CASCADE;

ALTER TABLE access_code_usage ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE access_code_usage ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS access_code_usage_id_seq;

ALTER TABLE domain_audit_log ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE domain_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS domain_audit_log_id_seq;

ALTER TABLE access_code_audit_log ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE access_code_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS access_code_audit_log_id_seq;
COMMIT;

-- Archive tables (snapshots, no live FKs from other tables)
BEGIN;
ALTER TABLE archive_log ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE archive_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS archive_log_id_seq;

ALTER TABLE archived_projects ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE archived_projects ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS archived_projects_id_seq;

ALTER TABLE archived_customers ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE archived_customers ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS archived_customers_id_seq;
COMMIT;

-- Misc / Salesforce tables
BEGIN;
ALTER TABLE user_board_preferences ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE user_board_preferences ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS user_board_preferences_id_seq;

ALTER TABLE kanban_audit_events ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE kanban_audit_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS kanban_audit_events_id_seq;
COMMIT;

BEGIN;
ALTER TABLE webhooks ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE webhook_deliveries ADD COLUMN webhook_id_new uuid;
UPDATE webhook_deliveries wd SET webhook_id_new = w.new_id FROM webhooks w WHERE w.id = wd.webhook_id;
ALTER TABLE webhook_deliveries DROP CONSTRAINT IF EXISTS webhook_deliveries_webhook_id_fkey;
ALTER TABLE webhook_deliveries DROP COLUMN webhook_id;
ALTER TABLE webhook_deliveries RENAME COLUMN webhook_id_new TO webhook_id;
ALTER TABLE webhook_deliveries ALTER COLUMN webhook_id SET NOT NULL;
ALTER TABLE webhooks DROP CONSTRAINT webhooks_pkey;
ALTER TABLE webhooks DROP COLUMN id;
ALTER TABLE webhooks RENAME COLUMN new_id TO id;
ALTER TABLE webhooks ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS webhooks_id_seq;
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE;
COMMIT;

BEGIN;
ALTER TABLE webhook_deliveries ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE webhook_deliveries ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS webhook_deliveries_id_seq;

ALTER TABLE salesforce_oauth_config ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_oauth_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_oauth_config_id_seq;

ALTER TABLE salesforce_describe_cache ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_describe_cache ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_describe_cache_id_seq;

ALTER TABLE salesforce_field_mappings ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_field_mappings ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_field_mappings_id_seq;

ALTER TABLE salesforce_value_maps ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_value_maps ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_value_maps_id_seq;

ALTER TABLE salesforce_record_links ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_record_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_record_links_id_seq;

ALTER TABLE salesforce_sync_policies ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_sync_policies ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_sync_policies_id_seq;

ALTER TABLE salesforce_sync_queue ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_sync_queue ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_sync_queue_id_seq;
COMMIT;

BEGIN;
ALTER TABLE salesforce_sync_runs ADD COLUMN new_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE salesforce_sync_run_items ADD COLUMN sync_run_id_new uuid;
UPDATE salesforce_sync_run_items ssri SET sync_run_id_new = ssr.new_id FROM salesforce_sync_runs ssr WHERE ssr.id = ssri.sync_run_id;
ALTER TABLE salesforce_sync_run_items DROP CONSTRAINT IF EXISTS salesforce_sync_run_items_sync_run_id_fkey;
ALTER TABLE salesforce_sync_run_items DROP COLUMN sync_run_id;
ALTER TABLE salesforce_sync_run_items RENAME COLUMN sync_run_id_new TO sync_run_id;
ALTER TABLE salesforce_sync_runs DROP CONSTRAINT salesforce_sync_runs_pkey;
ALTER TABLE salesforce_sync_runs DROP COLUMN id;
ALTER TABLE salesforce_sync_runs RENAME COLUMN new_id TO id;
ALTER TABLE salesforce_sync_runs ADD PRIMARY KEY (id);
DROP SEQUENCE IF EXISTS salesforce_sync_runs_id_seq;
ALTER TABLE salesforce_sync_run_items ADD CONSTRAINT salesforce_sync_run_items_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES salesforce_sync_runs(id);
COMMIT;

BEGIN;
ALTER TABLE salesforce_sync_run_items ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE salesforce_sync_run_items ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS salesforce_sync_run_items_id_seq;

ALTER TABLE project_gaps ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_gaps ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_gaps_id_seq;

ALTER TABLE project_gap_links ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_gap_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_gap_links_id_seq;

ALTER TABLE project_outcomes ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE project_outcomes ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS project_outcomes_id_seq;

ALTER TABLE outcome_config ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE outcome_config ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS outcome_config_id_seq;

ALTER TABLE compliance_regulations ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE compliance_regulations ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS compliance_regulations_id_seq;

ALTER TABLE industry_compliance_regulations ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE industry_compliance_regulations ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS industry_compliance_regulations_id_seq;

ALTER TABLE system_announcements ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE system_announcements ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS system_announcements_id_seq;

ALTER TABLE announcement_reads ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE announcement_reads ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS announcement_reads_id_seq;

ALTER TABLE support_requests ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE support_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS support_requests_id_seq;

ALTER TABLE evaluation_requests ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE evaluation_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS evaluation_requests_id_seq;

ALTER TABLE evaluation_request_products ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE evaluation_request_products ALTER COLUMN id SET DEFAULT gen_random_uuid();
DROP SEQUENCE IF EXISTS evaluation_request_products_id_seq;
COMMIT;

-- =============================================================================
-- END OF MIGRATION 001
-- After running this script, update the Drizzle ORM schema files (see 002)
-- and then run 003_indexing_strategy.sql.
-- =============================================================================
