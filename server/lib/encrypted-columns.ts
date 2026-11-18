// Every column that holds AES-256-GCM ciphertext. Used by key rotation
// (server/routes/system-routes.ts) and by Restore with masking
// (server/services/backup/masking.ts), which clears them all.
/**
 * Manifest of every column that stores AES-256-GCM ciphertext under the
 * current ENCRYPTION_KEY. Used by the regenerate flow to walk every row
 * and re-encrypt it when an admin rotates the key. Adding a new
 * encrypted column ANYWHERE in the codebase requires a matching entry
 * here — otherwise rotation will leave that column locked under the
 * old key and the next read will throw "Unsupported state or unable to
 * authenticate data".
 *
 * `idColumn` defaults to `id` and is split out so we can target the
 * row precisely in the UPDATE without relying on the encrypted value
 * itself (which can collide on `(name, value)` pairs in theory).
 *
 * Drift guard (Task #732): every encrypted column in `shared/schema/*.ts`
 * carries an `// @encrypted` trailing comment, and
 * `server/__tests__/encrypted-column-manifest-coverage.test.ts` parses
 * those markers and asserts a strict bijection with this manifest.
 * Forgetting to add a new encrypted column here — or to mark a new
 * encrypted schema column — fails that test with the missed
 * `(table, column)` named explicitly, before the change can ship.
 */
export type EncryptedColumnSpec = {
  table: string;
  idColumn: string;
  columns: string[];
};

export const ENCRYPTED_COLUMN_MANIFEST: EncryptedColumnSpec[] = [
  { table: 'db_connections', idColumn: 'id', columns: ['connection_url'] },
  { table: 'email_configuration', idColumn: 'id', columns: ['username', 'password', 'graph_client_secret', 'graph_certificate_pem'] },
  {
    table: 'users',
    idColumn: 'id',
    columns: ['totp_secret_enc', 'sf_access_token', 'sf_refresh_token', 'sf_instance_url'],
  },
  {
    table: 'archived_users',
    idColumn: 'id',
    columns: ['totp_secret_enc', 'sf_access_token', 'sf_refresh_token', 'sf_instance_url'],
  },
  // Per-user sign-in tokens: Salesforce (migration 083, server/salesforce/
  // salesforce-config-service.ts) and Outlook (migration 102, server/outlook/).
  { table: 'user_integrations', idColumn: 'id', columns: ['access_token', 'refresh_token', 'instance_url'] },
  { table: 'salesforce_oauth_config', idColumn: 'id', columns: ['client_id', 'client_secret'] },
  { table: 'webhooks', idColumn: 'id', columns: ['signing_secret'] },
  { table: 'ai_provider_configs', idColumn: 'id', columns: ['api_key'] },
  // Okta OIDC client secret (server/auth/oidcAuth.ts). Left under the old
  // key, SSO login fails on the first decrypt after a rotation.
  { table: 'sso_config', idColumn: 'id', columns: ['client_secret_enc'] },
  // HubSpot service key (server/hubspot/config.ts). Left under the old key,
  // every HubSpot call fails until an admin pastes the key again.
  { table: 'hubspot_connection', idColumn: 'id', columns: ['access_token'] },
  // ImpactIQ effort:read key (server/impactiq/config.ts). Left under the old
  // key, the project page's ImpactIQ hours stop until an admin pastes it again.
  { table: 'impactiq_connection', idColumn: 'id', columns: ['api_key'] },
  // Outlook sign-in app secret (server/outlook/config.ts). Left under the old
  // key, nobody can link or refresh their Outlook calendar until an admin
  // pastes the secret again.
  { table: 'outlook_signin_config', idColumn: 'id', columns: ['client_secret'] },
  // n8n API key (server/routes/n8n-integration-routes.ts).
  { table: 'n8n_config', idColumn: 'id', columns: ['api_key_enc'] },
  // Cloud-storage credentials (server/lib/cloud-storage.ts encrypts these on
  // write and decrypts on read). Must stay in sync with that file — adding a
  // new encrypted column there without listing it here would silently leave
  // the column under the OLD key after rotation, breaking object storage.
  {
    table: 'storage_configuration',
    idColumn: 'id',
    columns: [
      'gcs_key_json',
      'aws_access_key_id',
      'aws_secret_access_key',
      'azure_account_key',
      'azure_sas_token',
    ],
  },
];
