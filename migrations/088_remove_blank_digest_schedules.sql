-- Remove blank workflow schedules left by the old Schedule Digest and Delay
-- actions. Both inserted email_schedules rows using columns that do not
-- exist (scheduled_for, frequency, email_data...), so Postgres stored only
-- the defaults: action_type 'email_digest', no cron, no rrule, no next run.
-- These rows never ran and showed as broken digest schedules in
-- Configuration > Scheduler. Real schedules always have a cron or rrule,
-- and the engine no longer creates these rows. Idempotent.
DELETE FROM email_schedules
WHERE action_type = 'email_digest'
  AND cron IS NULL
  AND rrule IS NULL
  AND next_run_at IS NULL
  AND action_config IS NULL;
