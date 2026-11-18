-- Migration 125: Demo Mode copy of Artifacts (documents, links, code scripts).
--
-- Demo Mode now seeds its own documents, links and code scripts for demo
-- accounts, projects and solutions, so these tables get the same is_demo
-- flag as the rest of the demo data: Demo Mode shows only demo rows, real
-- mode never shows them, and the wipe removes them (with their stored
-- files). Existing rows stay real (default false).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE documents    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE links        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE code_scripts ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
