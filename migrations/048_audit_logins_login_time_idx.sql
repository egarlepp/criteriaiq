-- 048_audit_logins_login_time_idx.sql
--
-- Task #746: stop the `audit_logins` table from growing forever.
--
-- Background: every `/api/login` attempt (successful or failed) writes
-- one row to `audit_logins` (see `server/auth/simpleAuth.ts`). On a
-- public deployment with brute-force noise hitting the login endpoint
-- the table grows by thousands of rows per day forever — there was no
-- scheduled prune. The companion daily job in
-- `server/services/audit-logins-cleanup.ts` (`startAuditLoginsCleanup`)
-- runs `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL`
-- once per interval (default 24h, retention default 90 days, both
-- env-overridable — see docs/guides/self-hosting.md).
--
-- That DELETE — and the existing admin "recent logins" panel which
-- does `ORDER BY login_time DESC LIMIT N` (see
-- `storage.getAuditLogins` / `getAuditLoginsByDateRange`) — needs a
-- btree index on `login_time` to avoid degrading to a full table scan
-- as the table grows. The schema in `shared/schema/auth.ts` declares
-- this index under the same `IDX_audit_logins_login_time` name, so
-- `drizzle-kit push` and this migration converge on the same object
-- regardless of which one ran first.
--
-- Idempotent: CREATE INDEX IF NOT EXISTS — safe on a DB where
-- `drizzle-kit push` already created the index from the schema, and
-- safe to re-run.

CREATE INDEX IF NOT EXISTS "IDX_audit_logins_login_time"
  ON "audit_logins" ("login_time");
