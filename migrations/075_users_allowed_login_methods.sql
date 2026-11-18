-- Migration 075: per-user "Allowed Login Methods".
--
-- Adds `allowed_login_methods` to `users` and mirrors it onto
-- `archived_users` (archive-mirror rule, see migration 072). Values:
-- 'okta_only' | 'okta_password' | 'password_only'. The default
-- 'okta_password' matches the pre-075 behavior (both sign-in paths
-- accepted), so this is a no-op for every existing account.
--
-- Enforced in server/auth/simpleAuth.ts (/api/login rejects
-- okta_only) and server/auth/oidcAuth.ts (callback + link-confirm
-- reject password_only).
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent via IF NOT EXISTS.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS allowed_login_methods VARCHAR NOT NULL DEFAULT 'okta_password';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'archived_users') THEN
    ALTER TABLE archived_users
      ADD COLUMN IF NOT EXISTS allowed_login_methods VARCHAR NOT NULL DEFAULT 'okta_password';
  END IF;
END $$;
