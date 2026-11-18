-- Migration 077: CriteriaIQ logo version per theme.
--
-- The sidebar shows the CriteriaIQ logo as either the navy wordmark
-- ("dark_text") or the white one ("light_text"). Admin › Appearance › Media
-- sets the default for each mode (system_settings `branding.logo_variants`);
-- these columns let a theme override either mode. NULL follows Media.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on redeploy.
-- Idempotent: ADD COLUMN IF NOT EXISTS.

ALTER TABLE app_themes ADD COLUMN IF NOT EXISTS logo_variant_light VARCHAR(20);
ALTER TABLE app_themes ADD COLUMN IF NOT EXISTS logo_variant_dark VARCHAR(20);
