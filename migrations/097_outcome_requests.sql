-- Migration 097: outcome requests (docs/features/outcome-intelligence-system.md).
--
-- One row per closed project recording whether the Outcome Intelligence
-- rules asked for its outcome. Written when a project closes
-- (server/services/outcome-requests.ts).
--
-- Projects already closed when this migration runs are recorded once, so
-- the new close detection does not prompt for every old project at once:
-- those with an outcome as "captured", the rest as "preexisting" (they stay
-- on Missing Outcomes, as before, but nobody is prompted for them).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: every statement checks before it creates.

CREATE TABLE IF NOT EXISTS outcome_requests (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  outcome_type VARCHAR(20) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'status',
  required BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  closed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  captured_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT outcome_requests_project_id_unique UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_outcome_requests_status ON outcome_requests (status);

-- Same closed test the old Missing Outcomes list used: Internal Status
-- "Cancelled", otherwise Sales Stage "Closed Won" / "Closed Lost".
INSERT INTO outcome_requests (project_id, outcome_type, source, required, reason, status, closed_at, captured_at)
SELECT
  p.id,
  CASE
    WHEN LOWER(COALESCE(p.status, '')) = 'cancelled' THEN 'cancelled'
    WHEN LOWER(COALESCE(p.sales_stage, '')) = 'closed won' THEN 'won'
    ELSE 'lost'
  END,
  'preexisting',
  FALSE,
  NULL,
  CASE WHEN o.id IS NULL THEN 'preexisting' ELSE 'captured' END,
  COALESCE(p.completed_date, p.updated_at, NOW()),
  o.created_at
FROM projects p
LEFT JOIN project_outcomes o ON o.project_id = p.id
WHERE (
  LOWER(COALESCE(p.status, '')) = 'cancelled'
  OR LOWER(COALESCE(p.sales_stage, '')) IN ('closed won', 'closed lost')
)
ON CONFLICT (project_id) DO NOTHING;
