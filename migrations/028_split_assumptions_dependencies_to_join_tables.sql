-- Task #88: Library/Project schema split for assumptions and dependencies.
--
-- Historically extracted out of `initializeAssumptionDependencyTables` in
-- server/storage.ts (Task #304). The CREATE TABLE / CREATE INDEX statements
-- are now owned by drizzle-kit (`shared/schema/assumptions.ts`); only the
-- one-time legacy data migration lives here.
--
-- Idempotent: every block is gated on the legacy column existing, so re-runs
-- against an already-migrated database are no-ops. Each block also guards on
-- the relevant tables existing so partially-provisioned environments (e.g.
-- a fresh DB where `db:push` has only created some tables) don't error.

-- ── Migrate existing project-scoped assumptions → project_assumptions ──────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'assumptions'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'project_assumptions'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assumptions' AND column_name = 'project_id'
  ) THEN
    -- Migrate with validation_check if that column already exists on assumptions
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'assumptions' AND column_name = 'validation_check'
    ) THEN
      INSERT INTO "project_assumptions" (
        "assumption_id", "project_id", "description", "notes", "validation_check",
        "created_by", "created_at", "updated_at"
      )
      SELECT
        a."id", a."project_id", a."description", a."notes", a."validation_check",
        a."created_by", a."created_at", a."updated_at"
      FROM "assumptions" a
      WHERE a."project_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "project_assumptions" pa
          WHERE pa."assumption_id" = a."id" AND pa."project_id" = a."project_id"
        );
    ELSE
      INSERT INTO "project_assumptions" (
        "assumption_id", "project_id", "description", "notes",
        "created_by", "created_at", "updated_at"
      )
      SELECT
        a."id", a."project_id", a."description", a."notes",
        a."created_by", a."created_at", a."updated_at"
      FROM "assumptions" a
      WHERE a."project_id" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "project_assumptions" pa
          WHERE pa."assumption_id" = a."id" AND pa."project_id" = a."project_id"
        );
    END IF;

    -- Defensively drop NOT NULL on project_id before nulling it
    ALTER TABLE "assumptions" ALTER COLUMN "project_id" DROP NOT NULL;

    -- Clear project_id on those assumptions (they become pure library items)
    UPDATE "assumptions" SET "project_id" = NULL WHERE "project_id" IS NOT NULL;

    -- Drop the now-obsolete column
    ALTER TABLE "assumptions" DROP COLUMN IF EXISTS "project_id";
  END IF;
END $$;

-- ── Migrate existing project-scoped dependencies → project_dependencies ────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'dependencies'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'project_dependencies'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dependencies' AND column_name = 'project_id'
  ) THEN
    INSERT INTO "project_dependencies" (
      "dependency_id", "project_id", "status", "owner", "due_date",
      "description", "notes", "validation_check", "success_criteria_id",
      "solution_id",
      "created_by", "created_at", "updated_at"
    )
    SELECT
      d."id", d."project_id",
      COALESCE(d."status", 'open'), d."owner", d."due_date",
      d."description", d."notes", d."validation_check", d."success_criteria_id",
      d."solution_id",
      d."created_by", d."created_at", d."updated_at"
    FROM "dependencies" d
    WHERE d."project_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "project_dependencies" pd
        WHERE pd."dependency_id" = d."id" AND pd."project_id" = d."project_id"
      );

    -- Defensively drop NOT NULL on columns before nulling them
    -- (handles legacy DBs where project_id/status were NOT NULL)
    ALTER TABLE "dependencies" ALTER COLUMN "project_id" DROP NOT NULL;

    -- Clear project-specific values from library table
    UPDATE "dependencies"
    SET "project_id" = NULL, "owner" = NULL, "due_date" = NULL,
        "success_criteria_id" = NULL
    WHERE "project_id" IS NOT NULL;

    -- Drop project-scoped columns from the library table
    ALTER TABLE "dependencies" DROP COLUMN IF EXISTS "project_id";
    ALTER TABLE "dependencies" DROP COLUMN IF EXISTS "owner";
    ALTER TABLE "dependencies" DROP COLUMN IF EXISTS "due_date";
    ALTER TABLE "dependencies" DROP COLUMN IF EXISTS "success_criteria_id";
    -- Keep status column drop separate (status becomes library-agnostic, stored in project_dependencies)
    ALTER TABLE "dependencies" DROP COLUMN IF EXISTS "status";
  END IF;
END $$;

-- ── Backfill icons on legacy system categories that pre-date the icon column ──
-- New rows inserted via `seedAssumptionDependencyCategories` already carry
-- icons; this UPDATE only fills in legacy rows where icon IS NULL.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('Access & Permissions', 'KeyRound'),
      ('Telemetry / Logging',  'Activity'),
      ('Integrations',         'Plug'),
      ('Network',              'Network'),
      ('Data & Scope',         'Database'),
      ('Operations',           'Cpu'),
      ('Environment',          'Server')
    ) AS t(name, icon)
  LOOP
    UPDATE "assumption_categories"
       SET "icon" = rec.icon
     WHERE "name" = rec.name AND "is_system" = true AND "icon" IS NULL;
    UPDATE "dependency_categories"
       SET "icon" = rec.icon
     WHERE "name" = rec.name AND "is_system" = true AND "icon" IS NULL;
  END LOOP;
END $$;
