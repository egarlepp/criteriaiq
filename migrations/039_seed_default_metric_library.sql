-- 039_seed_default_metric_library.sql
--
-- Seed the Metric Builder library with a starter set of ~18 metrics
-- spread across all seven Metric Builder categories so a brand-new
-- install (or an upgrade from an earlier version that never had any
-- saved metrics) opens the Metric Builder with a non-empty library
-- (Task #556).
--
-- Every seeded row is marked `is_system = true` so the UI can
-- distinguish platform-supplied starters from user-authored metrics
-- in a future "Built-in" badge. The CRUD endpoints in
-- `server/dashboard-routes.ts` do NOT treat is_system as a guard:
-- admins are allowed to edit AND delete starter metrics, the same
-- as any other library entry.
--
-- DELETION-STAYS-DELETED CONTRACT
-- -------------------------------
-- The migration runner records each applied filename in
-- `schema_migrations`, so this file runs at most once per database.
-- Once it has applied, nothing re-seeds these rows on subsequent
-- restarts. If an admin deletes "Total Projects" (or any other
-- starter), the row stays gone across boots, redeploys, and Docker
-- image rebuilds — exactly the contract the spec requires.
--
-- Each `INSERT … WHERE NOT EXISTS` is keyed on `name` so:
--   * If a customer already had a user-authored metric with the
--     same name, the seeder leaves it alone (no overwrite, no
--     duplicate). The user metric wins.
--   * If, in the unlikely event the file is ever re-applied
--     (e.g. operator manually wipes `schema_migrations`), the guard
--     still prevents duplicate inserts.
--
-- ENGINE COMPATIBILITY
-- --------------------
-- Every metric below uses an operation the runtime
-- (`client/src/hooks/useMetricEngine.ts → calculateSingleMetric`)
-- handles TODAY. No new metric kinds were introduced for this seed.
-- Filters use real columns on `projects` so previews compute against
-- live data without throwing.

INSERT INTO "dashboard_metrics" ("name", "description", "category", "type", "config", "is_system")
SELECT v.name, v.description, v.category, v.type, v.config::jsonb, true
FROM (VALUES
  -- ============================================================
  -- General
  -- ============================================================
  (
    'Total Projects',
    'Count of every project in the system (no filters).',
    'General',
    'scalar',
    '{"source":"projects","operation":"count","filters":[]}'
  ),
  (
    'Active Projects',
    'Projects that are not closed, won, lost, or cancelled.',
    'General',
    'scalar',
    '{"source":"projects","operation":"count_active","filters":[]}'
  ),
  (
    'Active Projects Trend (12 weeks)',
    'Cumulative active-project count snapshot over the last 12 weeks.',
    'General',
    'series',
    '{"source":"projects","operation":"sparkline_active","filters":[]}'
  ),

  -- ============================================================
  -- MAP Management
  -- ============================================================
  (
    'MAPs in Planning',
    'Projects whose status is currently "planning".',
    'MAP Management',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"status","operator":"equals","value":"planning"}]}'
  ),
  (
    'MAPs Completed',
    'Projects whose status is "completed".',
    'MAP Management',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"status","operator":"equals","value":"completed"}]}'
  ),
  (
    'Average MAP Cycle Time (days)',
    'Average duration in days between start and end date for closed projects.',
    'MAP Management',
    'scalar',
    '{"source":"projects","operation":"avg_cycle","filters":[]}'
  ),

  -- ============================================================
  -- Outcome Intelligence
  -- ============================================================
  (
    'Total ACV (All Projects)',
    'Sum of opportunity ACV across every project.',
    'Outcome Intelligence',
    'scalar',
    '{"source":"projects","operation":"sum","targetField":"opportunityAcvValue","filters":[]}'
  ),
  (
    'Win Rate (%)',
    'Closed-won projects as a percentage of closed-won + closed-lost projects.',
    'Outcome Intelligence',
    'scalar',
    '{"source":"projects","operation":"win_rate","filters":[]}'
  ),
  (
    'Won Projects Trend (12 weeks)',
    'Closed-won projects per week over the last 12 weeks.',
    'Outcome Intelligence',
    'series',
    '{"source":"projects","operation":"sparkline_won","filters":[]}'
  ),

  -- ============================================================
  -- AI Risk
  -- ============================================================
  (
    'Projects by Risk Level',
    'Distribution of projects across Red, Yellow, and None risk buckets.',
    'AI Risk',
    'distribution',
    '{"source":"projects","operation":"dist_risk","filters":[]}'
  ),
  (
    'High-Risk Projects',
    'Projects flagged with a Red risk rating.',
    'AI Risk',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"risk","operator":"equals","value":"Red"}]}'
  ),
  (
    'Percent At-Risk',
    'Red-risk projects as a percentage of all projects.',
    'AI Risk',
    'scalar',
    '{"source":"projects","operation":"percentage","filters":[{"field":"risk","operator":"equals","value":"Red"}]}'
  ),

  -- ============================================================
  -- Email Communications
  -- ============================================================
  (
    'Customers On Time',
    'Projects whose customer status is "On Time".',
    'Email Communications',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"customerStatus","operator":"equals","value":"On Time"}]}'
  ),
  (
    'Customers Behind Schedule',
    'Projects whose customer status is "Behind".',
    'Email Communications',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"customerStatus","operator":"equals","value":"Behind"}]}'
  ),

  -- ============================================================
  -- Workflow Automation
  -- ============================================================
  (
    'Projects in Pipeline',
    'Projects whose forecast category is "Pipeline".',
    'Workflow Automation',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"forecastCategory","operator":"equals","value":"Pipeline"}]}'
  ),

  -- ============================================================
  -- Automation Diagnostics
  -- ============================================================
  (
    'Projects by Status',
    'Distribution of projects across every status value.',
    'Automation Diagnostics',
    'distribution',
    '{"source":"projects","operation":"dist_status","filters":[]}'
  ),
  (
    'Projects Missing Risk Tag',
    'Projects with no risk rating set (risk = "None").',
    'Automation Diagnostics',
    'scalar',
    '{"source":"projects","operation":"count","filters":[{"field":"risk","operator":"equals","value":"None"}]}'
  )
) AS v(name, description, category, type, config)
WHERE NOT EXISTS (
  SELECT 1
  FROM "dashboard_metrics" dm
  WHERE dm.name = v.name
);
