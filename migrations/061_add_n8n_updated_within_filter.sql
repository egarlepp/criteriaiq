-- Migration 061: Add time-window sync filter to n8n_config
-- Lets admins fetch only workflows updated within the last <value> <unit>
-- (days | weeks | months). Both columns null = no time filter (default).

ALTER TABLE n8n_config
  ADD COLUMN IF NOT EXISTS filter_updated_within_value INTEGER;

ALTER TABLE n8n_config
  ADD COLUMN IF NOT EXISTS filter_updated_within_unit VARCHAR(10);
