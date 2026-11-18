-- 044_add_industry_compliance_regulations_unique.sql
--
-- Materialise the missing unique constraint on
-- `industry_compliance_regulations (industry_id, compliance_regulation_id)`
-- (Task #670 — same class of bug Task #592 fixed for
-- `compliance_regulations.name`).
--
-- Background -----------------------------------------------------------
-- The Drizzle schema in `shared/schema/misc.ts` (around line 1145)
-- declares
--   `industryRegulationUnique: unique("industry_compliance_regulations_industry_regulation_unique")
--      .on(table.industryId, table.complianceRegulationId)
--      .nullsNotDistinct()`
-- but no migration ever materialised the constraint in the database.
-- The `seedIndustryComplianceRegulations()` startup seeder added in
-- Task #585 relies on `ON CONFLICT (industry_id, compliance_regulation_id)
-- DO NOTHING` to stay idempotent — without a real unique constraint
-- Postgres rejects that statement with `ERROR: there is no unique or
-- exclusion constraint matching the ON CONFLICT specification`
-- (SQLSTATE 42P10) and the seeder aborts mid-run on every restart.
--
-- The seeder failure is non-fatal (the boot continues) but it leaves
-- the join table only partially seeded, and the noisy stack trace
-- reappears in production logs on every boot, drowning out real
-- errors.
--
-- This migration closes the gap: it deduplicates any pre-existing
-- rows that share an `(industry_id, compliance_regulation_id)` pair
-- and then creates the missing unique constraint.
--
-- Step 1 — dedupe pre-existing duplicate pairs ------------------------
-- Because the seeder aborts on the first conflict, a database that
-- previously hit this bug usually has *no* duplicates (the conflict
-- is what triggered the abort), but a partial historical seed run
-- could in theory have inserted dupes before crashing. For each
-- `(industry_id, compliance_regulation_id)` group with more than one
-- row we keep the row with the lowest `created_at` (oldest by
-- creation time, ties broken by lowest `id`) and delete the rest.
--
-- Deletion is safe here because no other table FKs back to
-- `industry_compliance_regulations.id` (`rg "industry_compliance_regulations"
-- shared/schema/` only finds the table's own definition and a
-- non-FK reference in `tableSyncConfigs`). Unlike Task #592's
-- compliance-regulations rename strategy — where joiners point at
-- the row's id — losing rows here are pure leaves and can be
-- removed without breaking referential integrity.
--
-- The dedupe is idempotent — once each pair group has size 1 the
-- CTE produces zero `losers` and the DELETE is a no-op, so
-- re-running the migration (e.g. after manually deleting the
-- `schema_migrations` row) stays safe.
--
-- NOTE on NULL handling: the schema uses `NULLS NOT DISTINCT` so
-- Postgres treats `(industry_id, NULL)` as colliding with another
-- `(industry_id, NULL)` row (this is how the `is_all = true` rows
-- are kept unique-per-industry). The dedupe CTE below uses
-- `IS NOT DISTINCT FROM`-equivalent grouping — a plain `GROUP BY`
-- already treats NULLs as equal in PostgreSQL, so the existing
-- `PARTITION BY industry_id, compliance_regulation_id` window has
-- the right behaviour without further adjustment.
--
-- Step 2 — add the unique constraint ----------------------------------
-- We create the constraint with the exact name Drizzle expects
-- (`industry_compliance_regulations_industry_regulation_unique`) so
-- a future `db:push` recognises the existing object instead of
-- trying to add a duplicate. The constraint is declared
-- `NULLS NOT DISTINCT` to match `shared/schema/misc.ts` — without
-- this the `is_all = true` rows (which carry
-- `compliance_regulation_id = NULL`) would still be allowed to
-- duplicate per industry under Postgres' default `NULLS DISTINCT`
-- behaviour. (`NULLS NOT DISTINCT` requires PostgreSQL 15+, which
-- this project already targets — the same syntax is used elsewhere
-- in `shared/schema/`.)
--
-- The `ALTER TABLE ... ADD CONSTRAINT` is wrapped in an idempotent
-- `DO` block guard so a re-run after a manual `schema_migrations`
-- reset does not error out on the second attempt.

-- Step 1: delete duplicate `(industry_id, compliance_regulation_id)`
-- losers, keeping the oldest row per group.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY industry_id, compliance_regulation_id
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM industry_compliance_regulations
),
losers AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM industry_compliance_regulations
WHERE id IN (SELECT id FROM losers);

-- Step 2: add the unique constraint. Idempotent guard so a re-run of
-- this migration after a manual `schema_migrations` reset does not
-- error out on the second attempt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industry_compliance_regulations_industry_regulation_unique'
      AND conrelid = 'industry_compliance_regulations'::regclass
  ) THEN
    ALTER TABLE industry_compliance_regulations
      ADD CONSTRAINT industry_compliance_regulations_industry_regulation_unique
      UNIQUE NULLS NOT DISTINCT (industry_id, compliance_regulation_id);
  END IF;
END $$;
