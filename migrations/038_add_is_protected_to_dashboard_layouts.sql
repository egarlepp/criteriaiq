-- 038_add_is_protected_to_dashboard_layouts.sql
--
-- Add the `is_protected` flag to dashboard_layouts so the platform can
-- mark the built-in "Analytics - Dashboard Builder" Overview dashboard
-- as a system-owned row that admins are allowed to edit but not delete
-- (Task #555).
--
-- Defaults to FALSE so every pre-existing row stays an ordinary,
-- fully-mutable user layout. The boot-time seeder
-- (`seedProtectedDashboardLayouts` in server/storage.ts) is responsible
-- for stamping `is_protected = true` on the seeded Overview row, both
-- on a brand-new install and on an existing install that already had
-- a saved Overview layout from earlier versions of the product.
--
-- We add a partial UNIQUE index on (page_key, role) WHERE is_protected
-- so the seeder can rely on at most one protected row per page+role
-- pair. The existing non-unique `idx_dashboard_layouts_lookup` stays
-- in place — it covers the unprotected lookup path (per-user/per-role
-- layouts that legitimately can have multiple rows in some flows).
-- Restricting uniqueness with a WHERE clause leaves user-saved layouts
-- alone while guaranteeing protected rows can never duplicate.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS and CREATE UNIQUE INDEX IF NOT
-- EXISTS make re-running this migration on an environment where it
-- already landed a no-op.

ALTER TABLE "dashboard_layouts"
  ADD COLUMN IF NOT EXISTS "is_protected" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_dashboard_layouts_protected_page_role"
  ON "dashboard_layouts" ("page_key", "role")
  WHERE "is_protected" = true;
