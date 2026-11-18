-- 043_create_auth_rate_limits.sql
--
-- Task #630: persist login + MFA rate-limit buckets across restarts and
-- across workers.
--
-- Background: the in-memory `mfaAttempts` Map inside
-- `server/auth/mfaUtils.ts` was the single source of truth for the
-- 5-failure ceiling on `/api/mfa/challenge`, the 10/30-failure ceiling
-- on `/api/login`, and the 5-failure ceiling on `/api/mfa/totp/verify`.
-- Two failure modes were silently in scope:
--
--   1. A rolling restart (Dokploy redeploy, container OOM, idle
--      bounce) wiped every locked-out attacker's bucket
--      back to zero. Every brute-force defence in the auth surface
--      effectively had a free reset every time the process restarted.
--
--   2. A multi-worker deployment never reached the ceiling at all —
--      each worker had its own empty Map, so 10 failed attempts on
--      worker A still left an empty 10-attempt budget on worker B for
--      the same attacker to keep guessing.
--
-- This table moves the buckets into Postgres so both invariants hold:
-- the row survives restarts AND every worker reads/writes the same
-- row via a single ON CONFLICT UPSERT.
--
-- Shape mirrors `shared/schema/auth.ts → authRateLimits`:
--   bucket_key   VARCHAR PRIMARY KEY            -- e.g. mfa_challenge:<userId>
--   failed_count INTEGER NOT NULL DEFAULT 0     -- failure streak in window
--   reset_at     TIMESTAMPTZ NOT NULL           -- when the window expires
--   updated_at   TIMESTAMPTZ DEFAULT NOW()
--
-- The auth path looks rows up by primary key, so the only secondary
-- index we need is on `reset_at` to support a periodic cleanup query
-- that purges expired rows. The table is small (one row per
-- locked-out identifier per 15-minute window) so unbounded growth is
-- a paper risk, but the index keeps the cleanup cheap if it ever
-- gets wired in.
--
-- Idempotent:
--   - CREATE TABLE IF NOT EXISTS — safe on a DB where `drizzle-kit
--     push` already created the table from `shared/schema/auth.ts`.
--   - CREATE INDEX IF NOT EXISTS — same.
--
-- The runtime helpers in `server/auth/mfaUtils.ts` retain an
-- in-memory fallback that fires when `dbReady` is false (setup
-- wizard, tests) or when the DB op throws (transient hiccup) so the
-- failure mode is "fall back to the old behaviour" rather than "open
-- the gate".

CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
  "bucket_key"   varchar PRIMARY KEY,
  "failed_count" integer NOT NULL DEFAULT 0,
  "reset_at"     timestamp with time zone NOT NULL,
  "updated_at"   timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_auth_rate_limits_reset_at"
  ON "auth_rate_limits" ("reset_at");
