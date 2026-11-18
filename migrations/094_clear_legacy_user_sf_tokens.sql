-- Migration 094: clear the legacy Salesforce token copies on users.
--
-- Since migration 083 a user's Salesforce tokens live in
-- `user_integrations`; nothing reads users.sf_access_token,
-- sf_refresh_token or sf_instance_url, but they still held the old
-- ciphertext (and archived_users kept a copy). This empties them so a
-- database copy no longer carries a second set of sign-in tokens.
--
-- The columns themselves stay: migration 083 reads them, and a fresh
-- install (drizzle push, then every migration in order) would fail at 083
-- if the schema no longer created them.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: clearing an already-empty column is a no-op.

-- Users with no user_integrations row only ever held half a pair (083 copied
-- every complete one), so their old values are cleared too.
UPDATE users
SET sf_access_token = NULL,
    sf_refresh_token = NULL,
    sf_instance_url = NULL
WHERE sf_access_token IS NOT NULL
   OR sf_refresh_token IS NOT NULL
   OR sf_instance_url IS NOT NULL;

UPDATE archived_users
SET sf_access_token = NULL,
    sf_refresh_token = NULL,
    sf_instance_url = NULL
WHERE sf_access_token IS NOT NULL
   OR sf_refresh_token IS NOT NULL
   OR sf_instance_url IS NOT NULL;
