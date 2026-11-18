-- 049_audit_logins_cleanup_state.sql
--
-- Task #757: persist the audit_logins prune scheduler's last-run
-- snapshot across process restarts and replicas.
--
-- Background: the daily prune job in
-- `server/services/audit-logins-cleanup.ts` (Task #746) used to keep
-- the "last pruned at X, removed N rows" values in module-level
-- memory only. The Task #751 admin "Login history cleanup" panel on
-- System Health → Database read that snapshot via
-- `getAuditLoginsCleanupStatus()`. Every process restart (rolling
-- deploy, OOM kill, container restart) reset the snapshot to
-- "Awaiting first run" until the next scheduled tick fired — even
-- though the table itself had been pruned recently. On a busy
-- deployment with frequent restarts an admin glancing at the panel
-- could mistakenly think the prune wasn't running. The snapshot was
-- also process-local: replica A's prune was invisible to replica B's
-- status panel.
--
-- Fix: a singleton key/value-style metadata table holds the most
-- recent successful prune's timestamp + row count. The scheduler
-- UPSERTs the row at the end of every successful tick, and the
-- status surface reads from this table so the values survive
-- restarts and are consistent across replicas.
--
-- Schema choice: the `id integer PRIMARY KEY CHECK (id = 1)` pattern
-- mirrors `app_state` (see `shared/schema/auth.ts`) so there is one
-- and only one row in the table — this avoids the "which row is the
-- real one?" confusion that unconstrained singleton patterns invite,
-- and makes the UPSERT a trivial `ON CONFLICT (id) DO UPDATE`.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS plus an INSERT ... ON
-- CONFLICT for the seed row — safe to re-run, safe on a DB where
-- `drizzle-kit push` already created the table from the schema in
-- `shared/schema/auth.ts`.

CREATE TABLE IF NOT EXISTS "audit_logins_cleanup_state" (
  "id" integer PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "last_run_at" timestamptz,
  "last_removed" integer,
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);

-- Seed the singleton row so the scheduler's first persist can be a
-- no-op UPDATE (via ON CONFLICT) rather than racing two replicas to
-- INSERT id=1 at once.
INSERT INTO "audit_logins_cleanup_state" ("id") VALUES (1)
  ON CONFLICT ("id") DO NOTHING;
