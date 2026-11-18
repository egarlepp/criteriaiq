-- Migration 076: Admin › Appearance.
--
-- 1. `app_themes` — saved color themes for the app chrome (Theming tab).
--    At most one row is active (partial unique index); with none active the
--    app shows CriteriaIQ Classic, so a fresh install needs no seed row.
--
-- 2. Company Logo. The Media tab's three sidebar slots
--    (`sidebar_logo_expanded`, `sidebar_logo_collapsed`,
--    `sidebar_logo_watermark`) are replaced by one `company_logo` slot, shown
--    at the right end of the header bar. For each mode the header already
--    showed the expanded sidebar logo when one was uploaded, otherwise the
--    logo background, so that file becomes the Company Logo and the header
--    looks the same after the upgrade. The other rows of the retired slots
--    are left in place, unused, so no upload is lost.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS, and the slot carry-over only runs for
-- a mode that has no company_logo row yet.

CREATE TABLE IF NOT EXISTS app_themes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  colors JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_themes_single_active
  ON app_themes (is_active) WHERE is_active;

UPDATE branding_assets AS b
SET slot = 'company_logo',
    opacity = NULL
WHERE b.id IN (
  SELECT DISTINCT ON (mode) id
  FROM branding_assets
  WHERE slot IN ('sidebar_logo_expanded', 'sidebar_logo_watermark')
  ORDER BY mode, CASE slot WHEN 'sidebar_logo_expanded' THEN 0 ELSE 1 END
)
AND NOT EXISTS (
  SELECT 1 FROM branding_assets c
  WHERE c.slot = 'company_logo' AND c.mode = b.mode
);
