-- Migration 114: Demo Mode copy of the Validation Criteria library.
--
-- The demo seed creates its own solutions (products.is_demo, migration
-- 051) together with their components, criteria, expected outcomes,
-- actions taken and value mappings. These tables get the
-- same is_demo flag so Demo Mode shows only the demo library and the real
-- library never shows demo rows. Existing rows stay real (default false).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS.

ALTER TABLE components        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE criteria_library  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE expected_outcomes ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE action_items      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE value_mappings    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_components_is_demo        ON components (is_demo);
CREATE INDEX IF NOT EXISTS idx_criteria_library_is_demo  ON criteria_library (is_demo);
CREATE INDEX IF NOT EXISTS idx_expected_outcomes_is_demo ON expected_outcomes (is_demo);
CREATE INDEX IF NOT EXISTS idx_action_items_is_demo      ON action_items (is_demo);
CREATE INDEX IF NOT EXISTS idx_value_mappings_is_demo    ON value_mappings (is_demo);
