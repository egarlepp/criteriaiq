-- Migration 060: Add bypass_limits flag to access_codes (Login Management)
-- When true, the access code ignores both its max-uses cap and its expiry,
-- allowing it to be used an unlimited number of times for as long as needed.
-- Auto-generated domain login codes default this to true; it is editable.
-- Access codes are not archived, so no mirror column is required.

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS bypass_limits BOOLEAN NOT NULL DEFAULT false;
