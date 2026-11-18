-- 034_users_email_lower_idx.sql
--
-- Functional index supporting the case-insensitive lookup in
-- `storage.getUserByEmail` (Task #535).
--
-- The route handlers and storage layer all match user emails using
-- `LOWER(email) = LOWER($1)` so a sign-in attempt or password-reset
-- request with arbitrary casing still resolves to the right row. Without
-- a functional index on `LOWER(email)` the planner falls back to a
-- sequential scan on the `users` table, which is fine on small
-- installations but degrades quickly on larger tenants. This index keeps
-- the comparison index-backed for any future install.
--
-- The plain `users_email_unique` btree on `email` (created by Drizzle
-- from the schema's `.unique()` modifier) is preserved — it still
-- enforces case-sensitive uniqueness at the row level. We are not
-- changing what counts as a duplicate email here, only how lookups are
-- performed. Duplicate-with-different-casing rows that already exist on
-- legacy tenants will continue to work; the LOWER lookup will return
-- the first matching row (deterministic per the storage layer's
-- `.limit(1)`).
--
-- Idempotent: `CREATE INDEX IF NOT EXISTS` is a no-op if the index is
-- already present (e.g. on environments that re-run boot migrations).

CREATE INDEX IF NOT EXISTS users_email_lower_idx
  ON users (LOWER(email));
