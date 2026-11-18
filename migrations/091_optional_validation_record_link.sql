-- Migration 091: the validation record link is optional when the CRM is None.
--
-- The validation record link (Evaluation / POC / POV ...) is only required
-- while the install uses a CRM. With the CRM set to None a project can be
-- saved without one, so the column must accept NULL. Archived copies follow.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: DROP NOT NULL is a no-op once applied.

ALTER TABLE projects ALTER COLUMN salesforce_evaluation_link DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'archived_projects' AND column_name = 'salesforce_evaluation_link'
  ) THEN
    ALTER TABLE archived_projects ALTER COLUMN salesforce_evaluation_link DROP NOT NULL;
  END IF;
END $$;
