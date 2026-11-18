-- Migration 119: Demo Mode copy of Competitor Intelligence.
--
-- Fresh installs no longer seed technology spaces or competitors; the page
-- starts empty. Demo Mode seeds its own generic, fictional spaces and
-- competitors instead, so these two tables get the same is_demo flag as
-- the Validation Criteria library (migration 114): Demo Mode shows only
-- demo rows, the real library never shows them, and the wipe removes them.
-- Existing rows stay real (default false).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE technology_spaces ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE competitors       ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
