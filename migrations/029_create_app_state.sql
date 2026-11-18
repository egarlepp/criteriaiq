-- 029_create_app_state.sql
--
-- Task #387: Backfill the singleton `app_state` table for self-hosted
-- deployments that finished the setup wizard BEFORE Task #378 introduced
-- the table. Fresh installs already get this table via the wizard's
-- `drizzle-kit push --force` step, but already-set-up environments would
-- otherwise be missing it — and the helpers in `server/lib/app-state.ts`
-- swallow the "missing table" error and return null, which makes
-- `/api/setup/status` advertise `setupCompletedAt: null`. That, in turn,
-- causes any re-entry into `/setup` (intentional or via the post-Redeploy
-- useAuth bounce) to land on step 1 of the 7-step wizard instead of the
-- read-only health-check view, defeating the whole point of Task #378.
--
-- Shape mirrors `shared/schema/auth.ts → appState`:
--   id                 INTEGER PRIMARY KEY DEFAULT 1   (singleton)
--   setup_completed_at TIMESTAMP WITH TIME ZONE        (nullable)
--   updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
--
-- Idempotent:
--   - CREATE TABLE IF NOT EXISTS — re-runs against a DB where the wizard
--     (or a previous run of this migration) already created the table
--     are no-ops.
--   - INSERT ... ON CONFLICT (id) DO NOTHING — never overwrites an
--     existing singleton row, so the "first time setup was completed"
--     timestamp is preserved across re-runs.
--   - The seed timestamp is best-effort backfilled from the earliest
--     approved admin's `users.created_at` (a reliable proxy for "when
--     did this deployment first finish setup"). If no approved admin
--     exists yet — which would be unusual for an upgrade path, but
--     possible on a brand-new DB the wizard only just provisioned — we
--     fall back to NOW().
--
-- Safe to run multiple times; safe to run on a fresh DB that hasn't seen
-- the wizard yet (the table will be created and seeded with NOW(); the
-- wizard's own `markSetupCompleted` COALESCE preserves that value on its
-- next /api/setup/complete call).

CREATE TABLE IF NOT EXISTS "app_state" (
  "id"                 integer PRIMARY KEY DEFAULT 1,
  "setup_completed_at" timestamp with time zone,
  "updated_at"         timestamp with time zone DEFAULT now()
);

-- Seed the singleton row. The backfill SELECT references `users`, so
-- guard on its existence — partially-provisioned DBs (e.g. someone runs
-- data migrations before schema sync) should still get a usable
-- `app_state` row rather than failing with "relation users does not
-- exist". When `users` isn't there yet we fall back to NOW(); a later
-- /api/setup/complete call will COALESCE-preserve that timestamp.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'users'
  ) THEN
    INSERT INTO "app_state" ("id", "setup_completed_at", "updated_at")
    VALUES (
      1,
      COALESCE(
        (
          SELECT MIN("created_at")
          FROM "users"
          WHERE "is_approved" = true
            AND "role" = 'admin'
        ),
        now()
      ),
      now()
    )
    ON CONFLICT ("id") DO NOTHING;
  ELSE
    INSERT INTO "app_state" ("id", "setup_completed_at", "updated_at")
    VALUES (1, now(), now())
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;
