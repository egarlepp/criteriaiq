-- Migration 135: Demo Mode flag on automation rules, their run history,
-- AI assessment jobs and Criteria Builder templates.
--
-- Demo Mode seeds its own rules, run history, assessment jobs and criteria
-- templates. Each mode sees only its own rows, demo rules never run on real
-- events, and the Demo Mode wipe removes every flagged row. See
-- docs/admin/demo-mode.md.

ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_email_rules_is_demo ON email_rules (is_demo);

ALTER TABLE email_rule_audits ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_email_rule_audits_is_demo ON email_rule_audits (is_demo);

ALTER TABLE assessment_jobs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_assessment_jobs_is_demo ON assessment_jobs (is_demo);

ALTER TABLE validation_criteria_templates ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_validation_criteria_templates_is_demo ON validation_criteria_templates (is_demo);
