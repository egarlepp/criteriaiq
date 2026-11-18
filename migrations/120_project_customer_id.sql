-- Migration 120: projects point at their account by id.
--
-- Until now a project found its account by name (projects.customer_name =
-- customers.account_name), so renaming an account silently detached its
-- projects. projects.customer_id (and its archived_projects mirror) holds
-- the account id instead; customer_name stays as the display copy and is
-- kept in step on rename by storage.updateCustomer().
--
-- Soft reference, no FK: archiving an account moves its row to
-- archived_customers and restore brings it back with the same id, so a
-- real FK would block archiving an account that has projects.
--
-- Backfill: a project gets an id only when exactly one account (active or
-- archived) has the same name, ignoring case and surrounding spaces. Names
-- shared by two accounts stay NULL and keep the old name join as a
-- fallback, so nothing that matched before stops matching.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS, and the backfill only fills NULLs.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id integer;
ALTER TABLE archived_projects ADD COLUMN IF NOT EXISTS customer_id integer;

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects (customer_id);

WITH all_accounts AS (
  SELECT id, lower(trim(account_name)) AS key FROM customers
  UNION ALL
  SELECT id, lower(trim(account_name)) AS key FROM archived_customers
),
unique_names AS (
  SELECT key, min(id) AS id
  FROM all_accounts
  GROUP BY key
  HAVING count(*) = 1
)
UPDATE projects p
SET customer_id = u.id
FROM unique_names u
WHERE p.customer_id IS NULL
  AND lower(trim(p.customer_name)) = u.key;

WITH all_accounts AS (
  SELECT id, lower(trim(account_name)) AS key FROM customers
  UNION ALL
  SELECT id, lower(trim(account_name)) AS key FROM archived_customers
),
unique_names AS (
  SELECT key, min(id) AS id
  FROM all_accounts
  GROUP BY key
  HAVING count(*) = 1
)
UPDATE archived_projects p
SET customer_id = u.id
FROM unique_names u
WHERE p.customer_id IS NULL
  AND lower(trim(p.customer_name)) = u.key;
