-- Migration 132: a lucide icon for each solution.
--
-- A solution shows its uploaded graphic (products.solution_icon) when it has
-- one, otherwise this icon, otherwise a generic package icon. Demo Mode
-- solutions get an icon. See docs/features/icon-picker-system.md.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE products ADD COLUMN IF NOT EXISTS solution_icon_name varchar(64);
