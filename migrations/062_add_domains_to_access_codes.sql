-- Migration 062: Add per-code domain targeting to access_codes
-- A code can be valid for one, several, or all of its account's approved email
-- domains. NULL (or empty) = valid for ALL of the account's domains. When set,
-- signup requires the user's email domain to be one of these.

ALTER TABLE access_codes
  ADD COLUMN IF NOT EXISTS domains TEXT[];
