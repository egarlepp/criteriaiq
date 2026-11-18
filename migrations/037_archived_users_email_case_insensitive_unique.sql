-- 037_archived_users_email_case_insensitive_unique.sql
--
-- Mirror migration 035 against `archived_users` (Task #543).
--
-- Background -----------------------------------------------------------
-- Migration 035 added a UNIQUE functional index on `LOWER(email)` for
-- the live `users` table so two accounts could no longer share the
-- same email in different cases. The parallel `archived_users` table
-- still only carries the case-sensitive `users_email_unique`-style
-- btree created by Drizzle's `.unique()` modifier, so:
--   * a tenant can end up with archived rows for `Foo@x.com` and
--     `foo@x.com` and never know,
--   * a future restore of an archived user can produce a case-variant
--     collision against a live row that the live-side index now
--     correctly forbids — but the restore path will surface that as
--     a raw 500 from Postgres rather than as a clean "this email is
--     already in use" error.
--
-- This migration closes both gaps at the database layer for the
-- archive table. The matching `uniqueIndex` declaration in
-- `shared/schema/archive.ts` mirrors the new index name so a future
-- `db:push` recognises the existing object instead of creating a
-- duplicate (or worse, dropping it).
--
-- Step 1 — dedupe pre-existing case-variant duplicates ---------------
-- Identical strategy to migration 035: for each `LOWER(email)` group
-- with more than one row we keep the lowest-id row and rename every
-- other row's email by inserting `+dup<id>+<random>` immediately
-- before the `@` (or appending to the email if it has no `@`). The
-- 8-char random suffix protects the rename target from coincidentally
-- colliding with an existing row's email.
--
-- Renaming is preferred over merging here too — merging archived
-- snapshots would have to reconcile every per-user column (login
-- count, last login, sf tokens, password history, etc.) and that
-- deserves a deliberate per-tenant decision rather than a blind
-- boot-time migration. The renamed rows stay archived, so they are
-- already not loginable; we don't flip `is_active` (unlike migration
-- 035) because the archive table's `is_active` is a snapshot of the
-- live row at archive time, not a runtime gate, and overwriting it
-- would corrupt that snapshot for any future restore. The renamed
-- email is enough to make the row inert from the case-insensitive
-- index's perspective.
--
-- The dedupe is idempotent: once each `LOWER(email)` group has size
-- 1 the CTE produces zero `losers` and the UPDATE is a no-op. Re-runs
-- (e.g. after manually deleting the `schema_migrations` row) stay
-- safe.
--
-- Step 2 — create the UNIQUE functional index on LOWER(email) -------
-- Unlike the live-side migration, there is no pre-existing non-unique
-- LOWER(email) index on `archived_users` to drop first (migration 034
-- only touched `users`). We just create
-- `archived_users_email_lower_unique` directly. From this point
-- forward the database itself will reject any future INSERT/UPDATE
-- that would introduce a case-variant collision into the archive,
-- and the user-restore path can rely on a single clean SQLSTATE
-- 23505 from the live-side index when a case-variant collision
-- against `users` is the real problem.
--
-- The case-sensitive btree created by Drizzle's `.unique()` modifier
-- on `archived_users.email` is intentionally preserved alongside the
-- new functional index — case-sensitive uniqueness is a strict
-- subset of case-insensitive uniqueness, so the two co-exist without
-- conflict and removing it would just cause the next `db:push` to
-- add it back. NULL emails remain allowed (Postgres treats NULL as
-- distinct in unique indexes by default).

-- Step 1: rename the losers in each LOWER(email) duplicate group.
WITH ranked AS (
  SELECT
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY id) AS rn
  FROM archived_users
  WHERE email IS NOT NULL
),
losers AS (
  SELECT id, email FROM ranked WHERE rn > 1
)
UPDATE archived_users au
SET
  email = CASE
    WHEN position('@' IN l.email) > 0
      THEN regexp_replace(
        l.email,
        '@',
        '+dup' || l.id || '+'
          || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
          || '@'
      )
    ELSE l.email
      || '+dup' || l.id || '+'
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  END,
  updated_at = NOW()
FROM losers l
WHERE au.id = l.id;

-- Step 2: create the UNIQUE functional index on LOWER(email).
CREATE UNIQUE INDEX IF NOT EXISTS archived_users_email_lower_unique
  ON archived_users (LOWER(email));
