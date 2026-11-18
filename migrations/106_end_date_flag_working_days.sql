-- End-date flags can count working days (weekends and the organization's
-- default holiday calendars don't count). See docs/features/working-calendar.md.
ALTER TABLE end_date_flags ADD COLUMN IF NOT EXISTS working_days BOOLEAN NOT NULL DEFAULT FALSE;

-- The two built-in "days before" flags switch to working days, keeping their
-- meaning: "Due Soon" 5 calendar days -> 3 working days, "Due This Week"
-- 7 calendar days -> 5 working days. Only rows still on their shipped values
-- change; flags an admin edited, and custom flags, keep counting calendar days.
UPDATE end_date_flags
SET working_days = TRUE,
    trigger_value = 3,
    description = 'Shows when project end date is within 3 working days',
    updated_at = NOW()
WHERE is_system = TRUE AND name = 'Due Soon' AND trigger_type = 'days_before'
  AND trigger_value = 5 AND working_days = FALSE;

UPDATE end_date_flags
SET working_days = TRUE,
    trigger_value = 5,
    description = 'Shows when project end date is within 5 working days',
    updated_at = NOW()
WHERE is_system = TRUE AND name = 'Due This Week' AND trigger_type = 'days_before'
  AND trigger_value = 7 AND working_days = FALSE;
