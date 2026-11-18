-- Migration 083: move per-user Salesforce sign-in tokens off `users`.
--
-- New table `user_integrations`, one row per user per provider, so a
-- second CRM (e.g. HubSpot) adds rows instead of new columns on `users`.
-- Existing tokens are copied over as-is: they are already AES-256-GCM
-- ciphertext under the same ENCRYPTION_KEY, so no re-encryption is needed.
--
-- The old users.sf_* columns are left in place (not read any more) so a
-- rollback to the previous release still finds working tokens. A later
-- migration drops them.
--
-- Production applies migrations at boot via
-- `server/lib/migrations-runner.ts`; drizzle-kit push is NOT run on
-- redeploy. Idempotent: IF NOT EXISTS + ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS user_integrations (
  id serial PRIMARY KEY,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar NOT NULL,
  access_token text,
  refresh_token text,
  instance_url text,
  connected_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  CONSTRAINT unique_user_integration UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_provider ON user_integrations (provider);

INSERT INTO user_integrations (user_id, provider, access_token, refresh_token, instance_url, connected_at, updated_at)
SELECT id, 'salesforce', sf_access_token, sf_refresh_token, sf_instance_url,
       COALESCE(sf_connected_at, updated_at, now()), now()
FROM users
WHERE sf_access_token IS NOT NULL AND sf_refresh_token IS NOT NULL
ON CONFLICT (user_id, provider) DO NOTHING;
