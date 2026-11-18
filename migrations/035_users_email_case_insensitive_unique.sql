-- 035_users_email_case_insensitive_unique.sql
--
-- Enforce case-insensitive uniqueness on `users.email` (Task #538).
--
-- Background -----------------------------------------------------------
-- The schema's `.unique()` modifier on `users.email` (see
-- `shared/schema/auth.ts`) creates a *case-sensitive* btree unique
-- constraint, so two rows with `Foo@x.com` and `foo@x.com` could
-- legally co-exist. Task #535 made every login and password-reset
-- lookup case-insensitive by switching to `LOWER(email) = LOWER($1)`,
-- and the defensive code in `storage.getUserByEmail` picks the
-- lowest-id row when more than one matches and logs a loud warning,
-- but the underlying ambiguity at the database level is still real.
-- This migration closes that loophole at the database layer.
--
-- Step 1 — dedupe pre-existing case-variant duplicates ---------------
-- For each `LOWER(email)` group with more than one row we keep the
-- lowest-id row (the same row `storage.getUserByEmail` was already
-- returning thanks to its `ORDER BY id LIMIT 2`) and rename every
-- other row's email by inserting `+dup<id>+<random>` immediately
-- before the `@` (e.g. `Foo@x.com` becomes
-- `Foo+dup42+a3f1c8d2@x.com`). The 8-char random suffix is included
-- so the rename target cannot coincidentally collide with an existing
-- row's email — without it, an adversarial or accidental pre-existing
-- email of the form `foo+dup<same_id>@example.com` would trip the
-- existing case-sensitive `users_email_unique` btree and abort the
-- migration. The renamed rows are also flipped to `is_active = false`
-- so a confused operator can spot them in the admin UI.
--
-- Renaming is deliberately preferred over merging: merging would have
-- to reassign ownership of every project, audit row, MAP, AI run,
-- etc., owned by the loser to the winner, and that surgery deserves
-- a deliberate per-tenant decision rather than a blind boot-time
-- migration. Renaming keeps every existing FK intact, makes the loser
-- non-loginable (it's deactivated and its email no longer matches the
-- original case-insensitive value), and is fully reversible by hand.
--
-- The dedupe is idempotent: once each `LOWER(email)` group has size
-- 1, the CTE produces zero `losers` and the UPDATE is a no-op. Re-runs
-- of this migration (e.g. after manually deleting the
-- `schema_migrations` row) therefore stay safe.
--
-- Step 2 — replace the non-unique LOWER(email) index with a UNIQUE one
-- Migration 034 created the non-unique `users_email_lower_idx` to
-- keep the case-insensitive lookup index-backed. We now drop that
-- index and replace it with `users_email_lower_unique`, a UNIQUE
-- functional index on `LOWER(email)`. From this point forward the
-- lookup in `storage.getUserByEmail` can match at most one row, and
-- the database itself will reject any future INSERT/UPDATE that would
-- introduce a case-variant collision.
--
-- The case-sensitive `users_email_unique` btree constraint (created
-- by Drizzle from the schema's `.unique()` modifier) is intentionally
-- preserved — it is a strict subset of the new case-insensitive
-- constraint, removing it would just cause the next `db:push` to add
-- it right back, and keeping both costs nothing. NULL emails remain
-- allowed (Postgres treats NULL as distinct in unique indexes by
-- default, so multiple users with NULL email still co-exist).
--
-- The schema declaration in `shared/schema/auth.ts` mirrors the new
-- index so a future `db:push --force` will not drop it. The two paths
-- agree on the index name (`users_email_lower_unique`) so drizzle-kit
-- recognises the existing object instead of creating a duplicate.

-- Step 1: rename the losers in each LOWER(email) duplicate group.
WITH ranked AS (
  SELECT
    id,
    email,
    ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY id) AS rn
  FROM users
  WHERE email IS NOT NULL
),
losers AS (
  SELECT id, email FROM ranked WHERE rn > 1
)
UPDATE users u
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
  is_active = false,
  updated_at = NOW()
FROM losers l
WHERE u.id = l.id;

-- Step 2: drop the non-unique LOWER(email) index from migration 034
-- and replace it with a UNIQUE one.
DROP INDEX IF EXISTS users_email_lower_idx;
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
  ON users (LOWER(email));
