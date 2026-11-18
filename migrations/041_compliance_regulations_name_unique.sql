-- 041_compliance_regulations_name_unique.sql
--
-- Enforce uniqueness on `compliance_regulations.name` (Task #592).
--
-- Background -----------------------------------------------------------
-- The `compliance_regulations` table has carried a `.unique()` modifier
-- on its `name` column in `shared/schema/misc.ts` (around line 1113)
-- for some time, but no migration ever materialised the constraint in
-- the database. As a result two callers of `createComplianceRegulation`
-- could each insert a row with the same name without anything
-- complaining. The new `seedComplianceRegulations()` seeder also
-- relies on `ON CONFLICT (name) DO NOTHING` to stay idempotent — and
-- without a real unique constraint Postgres rejects that statement
-- with `ERROR: there is no unique or exclusion constraint matching
-- the ON CONFLICT specification`. This migration closes both gaps in
-- one shot: it deduplicates any pre-existing rows that share a name
-- and then creates the missing unique index.
--
-- Step 1 — dedupe pre-existing duplicate names ------------------------
-- For each `name` group with more than one row we keep the lowest-id
-- row (oldest by creation order) and rename every other row's name by
-- appending ` (duplicate <id> <random>)` to it. The 8-char random
-- suffix prevents the rename target from coincidentally colliding
-- with another existing name (or with another loser in the same
-- group). The renamed rows are also flipped to `is_active = false`
-- and `status = 'inactive'` so a confused operator can spot them in
-- the admin UI and decide whether to delete them outright.
-- ('inactive' is used rather than e.g. 'archived' because it is the
-- canonical not-current status value already used elsewhere in the
-- product UI; the column is a free-text varchar at the DB level so
-- either would persist, but staying inside the known status set
-- keeps filters/badges happy.)
--
-- Renaming is preferred over deletion: foreign-key references from
-- `industry_compliance_regulations` (and any other future joiners)
-- stay intact, and the operator keeps the original payload available
-- for inspection. The dedupe is idempotent — once each `name` group
-- has size 1, the CTE produces zero `losers` and the UPDATE is a
-- no-op, so re-running the migration (e.g. after manually deleting
-- the `schema_migrations` row) stays safe.
--
-- Step 2 — add the unique constraint ----------------------------------
-- Drizzle's `.unique()` modifier on the `name` column auto-generates
-- a constraint named `compliance_regulations_name_unique`. We create
-- the same name here so a future `db:push` recognises the existing
-- object instead of trying to add a duplicate. NULL names are
-- impossible (the column is `NOT NULL`), so we don't need to worry
-- about NULL handling in the index.

-- Step 1: rename the losers in each `name` duplicate group.
WITH ranked AS (
  SELECT
    id,
    name,
    ROW_NUMBER() OVER (PARTITION BY name ORDER BY id) AS rn
  FROM compliance_regulations
),
losers AS (
  SELECT id, name FROM ranked WHERE rn > 1
)
UPDATE compliance_regulations c
SET
  name = l.name
    || ' (duplicate ' || l.id || ' '
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
    || ')',
  is_active = false,
  status = 'inactive',
  updated_at = NOW()
FROM losers l
WHERE c.id = l.id;

-- Step 2: add the unique constraint. Idempotent guard so a re-run of
-- this migration after a manual `schema_migrations` reset does not
-- error out on the second attempt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'compliance_regulations_name_unique'
      AND conrelid = 'compliance_regulations'::regclass
  ) THEN
    ALTER TABLE compliance_regulations
      ADD CONSTRAINT compliance_regulations_name_unique UNIQUE (name);
  END IF;
END $$;
