-- 031_drop_unused_customer_archive_columns.sql
--
-- Removes three leftover columns from the live `customers` table:
--   - archived_at   (timestamp)
--   - archived_by   (text)
--   - archived_reason (text)
--
-- These columns were originally added in
-- `server/migrations/008-add-customer-archive-fields.sql` from a
-- previous "soft archive in place" pattern. The canonical archive flow
-- now moves customer rows into the separate `archived_customers` table
-- (matching the pattern used for users and projects), and an audit
-- of the codebase confirms no path reads or writes these three columns
-- on the live `customers` table — they have always been NULL in
-- practice. Keeping them around implies (incorrectly) that customers
-- can be archived two different ways.
--
-- The Archive Schema Validation health check
-- (`server/services/health-monitor.ts → getArchiveSchemaValidation`)
-- explicitly excludes the three `archived_*` metadata column names
-- from its source-vs-archive column comparison, so dropping them from
-- the source `customers` table keeps the customers pair Healthy.
--
-- `IF EXISTS` is used so re-running the migration on an environment
-- where the columns were never present (or have already been dropped)
-- is a safe no-op.

ALTER TABLE customers DROP COLUMN IF EXISTS archived_at;
ALTER TABLE customers DROP COLUMN IF EXISTS archived_by;
ALTER TABLE customers DROP COLUMN IF EXISTS archived_reason;
