-- Migration 096: move the built-in Welcome email from Workflow Automation
-- to Configuration › Scheduler (docs/features/scheduler.md).
--
-- The "Welcome Email — New User Registration" rule was seeded at boot by
-- the old email-rule-seeder (created_by NULL, trigger
-- user.registration_completed, one send_email action: template "welcome"
-- to "trigger_user"). The Welcome email is now the "welcome_email" event
-- job, so the rule must go or every new user would get two emails.
--
--   1. Keep its on/off state: a disabled rule becomes a disabled job.
--      Only when such a rule exists, and never over a saved job setting.
--   2. Delete the rule when the Welcome send is its only action.
--   3. If an admin added other actions to it, keep the rule and remove
--      only the Welcome send.
--
-- A rule matches when it was seeded (created_by IS NULL), fires only on
-- user.registration_completed, and sends the "welcome" template (or any
-- template, under the seeded name) to the registering user. Rules admins
-- built themselves are never touched.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`. Idempotent: a second run finds no
-- matching rule and changes nothing.

INSERT INTO job_config (job_key, enabled, updated_at)
SELECT 'welcome_email', bool_or(COALESCE(r.enabled, true)), NOW()
FROM email_rules r
WHERE r.created_by IS NULL
  AND r.trigger_keys = '["user.registration_completed"]'::jsonb
  AND EXISTS (
    SELECT 1 FROM email_rule_actions a
    WHERE a.rule_id = r.id
      AND a.action = 'send_email'
      AND a.params->>'recipientId' = 'trigger_user'
      AND (a.params->>'templateKey' = 'welcome' OR r.name = 'Welcome Email — New User Registration')
  )
HAVING count(*) > 0
ON CONFLICT (job_key) DO NOTHING;

DELETE FROM email_rules r
WHERE r.created_by IS NULL
  AND r.trigger_keys = '["user.registration_completed"]'::jsonb
  AND EXISTS (
    SELECT 1 FROM email_rule_actions a
    WHERE a.rule_id = r.id
      AND a.action = 'send_email'
      AND a.params->>'recipientId' = 'trigger_user'
      AND (a.params->>'templateKey' = 'welcome' OR r.name = 'Welcome Email — New User Registration')
  )
  AND NOT EXISTS (
    SELECT 1 FROM email_rule_actions a
    WHERE a.rule_id = r.id
      AND NOT (
        a.action = 'send_email'
        AND a.params->>'recipientId' = 'trigger_user'
        AND (a.params->>'templateKey' = 'welcome' OR r.name = 'Welcome Email — New User Registration')
      )
  );

DELETE FROM email_rule_actions a
USING email_rules r
WHERE a.rule_id = r.id
  AND r.created_by IS NULL
  AND r.trigger_keys = '["user.registration_completed"]'::jsonb
  AND a.action = 'send_email'
  AND a.params->>'recipientId' = 'trigger_user'
  AND (a.params->>'templateKey' = 'welcome' OR r.name = 'Welcome Email — New User Registration');
