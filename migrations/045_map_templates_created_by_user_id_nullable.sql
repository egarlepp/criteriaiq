-- 045_map_templates_created_by_user_id_nullable.sql
--
-- Drop the lingering NOT NULL constraint on
-- `map_templates.created_by_user_id` and normalise the legacy
-- `'system'` sentinel value to NULL (Task #704).
--
-- Background -----------------------------------------------------------
-- `shared/schema/map.ts` declares `createdByUserId: varchar(...)`
-- without `.notNull()`, with a comment explicitly stating the column
-- is "Nullable so platform-owned templates (e.g. the canonical
-- 'Standard Technical Validation' seed) can be represented as NULL
-- rather than a fake 'system' sentinel string". The accompanying
-- intent (referenced in the schema comment as "see migration 020")
-- was that the column would become nullable when migration 020
-- landed, but no migration ever materialised that change in the
-- database — `created_by_user_id` is still `NOT NULL` in the
-- physical schema.
--
-- The drift causes a noisy boot-time error on every restart:
--
--   `Error initializing default MAP template: ... null value in
--    column "created_by_user_id" of relation "map_templates"
--    violates not-null constraint`
--
-- because `storage.initializeDefaultMapTemplate()` always tries to
-- normalise the canonical seed row's `createdByUserId` to NULL on
-- boot. The error is harmless (the template already exists) but
-- spams logs and looks alarming to operators on every reboot. On
-- fresh installs that don't have a system user yet the same
-- constraint blocks the very first seed insert as well.
--
-- This migration closes the gap:
--   1. `ALTER COLUMN ... DROP NOT NULL` on
--      `map_templates.created_by_user_id`, finally matching the
--      Drizzle schema and the documented intent.
--   2. Normalise the legacy `'system'` sentinel to NULL so the
--      steady-state matches the schema convention. Real
--      user-created templates (`created_by_user_id` referencing
--      a `users.id`) are left untouched.
--
-- Both steps are idempotent — a re-run after a manual
-- `schema_migrations` reset is safe (the `DROP NOT NULL` is a
-- no-op once the constraint is gone, and the UPDATE is filtered
-- by `created_by_user_id = 'system'` which becomes empty after
-- the first run).

-- Step 1: drop the NOT NULL constraint to match the Drizzle schema.
ALTER TABLE map_templates
  ALTER COLUMN created_by_user_id DROP NOT NULL;

-- Step 2: normalise the legacy `'system'` sentinel value to NULL so
-- platform-owned templates are represented uniformly going forward.
-- Only touch rows that still carry the literal sentinel — never
-- rewrite real user ids.
UPDATE map_templates
   SET created_by_user_id = NULL
 WHERE created_by_user_id = 'system';
