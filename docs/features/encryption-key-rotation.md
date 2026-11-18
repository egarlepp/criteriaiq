# Encryption Key Rotation

How CriteriaIQ rotates its master `ENCRYPTION_KEY` — and the
`SESSION_SECRET` — without locking itself out of its own encrypted data,
and what an admin sees while it happens.

> **Audience:** admins rotating secrets (credential exposure, compliance,
> offboarding, routine hygiene) and developers adding a new encrypted
> column.
>
> **Status:** Implemented and shipped. Rotation runs through an admin
> endpoint, described below.

---

## What gets encrypted

All sensitive values stored at rest use **AES-256-GCM** via `encryptText`
/ `decryptText` in [`server/auth/mfaUtils.ts`](../../server/auth/mfaUtils.ts).
Wire format is `iv:ciphertext:authTag`, all hex-encoded, with a 12-byte
random IV per value. The 32-byte key is a 64-character hex string.

The authoritative list of encrypted columns is
`ENCRYPTED_COLUMN_MANIFEST` in
[`server/lib/encrypted-columns.ts`](../../server/lib/encrypted-columns.ts) (the same
list the rotation walk uses, and the list a masked restore clears). Schema columns are tagged with an
`// @encrypted` marker, and a drift-guard test
([`server/__tests__/encrypted-column-manifest-coverage.test.ts`](../../server/__tests__/encrypted-column-manifest-coverage.test.ts))
asserts a bijection between the markers and the manifest — so adding an
encrypted column without registering it for rotation fails CI.

Currently encrypted (verify against the manifest, it's the source of truth):

| Table | Encrypted columns |
|---|---|
| `users` / `archived_users` | `totp_secret_enc`, `sf_access_token`, `sf_refresh_token`, `sf_instance_url` (the `sf_*` columns are legacy since migration 083 and are dropped later) |
| `user_integrations` | `access_token`, `refresh_token`, `instance_url` (per-user Salesforce tokens) |
| `db_connections` | `connection_url` |
| `email_configuration` | `username`, `password`, `graph_client_secret`, `graph_certificate_pem` |
| `salesforce_oauth_config` | `client_id`, `client_secret` |
| `webhooks` | `signing_secret` |
| `ai_provider_configs` | `api_key` |
| `sso_config` | `client_secret_enc` |
| `n8n_config` | `api_key_enc` |
| `storage_configuration` | `gcs_key_json`, `aws_access_key_id`, `aws_secret_access_key`, `azure_account_key`, `azure_sas_token` |

---

## Two distinct operations — don't conflate them

| | Rotate the **secret value** | Re-encrypt the **data** |
|---|---|---|
| `SESSION_SECRET` | New random secret; all existing session cookies become invalid → forced logout | n/a (cookies aren't re-signed; they're invalidated) |
| `ENCRYPTION_KEY` | New random key | **Every encrypted column in every row is decrypted with the old key and re-encrypted with the new key** |

For `ENCRYPTION_KEY`, the two happen together in a single endpoint call —
generating the new key *and* re-encrypting all data are one atomic
operation. There is no "swap the env var and hope" path; that naive
approach (which §12 warned about) is exactly what the implementation
avoids.

---

## The rotation flow (`ENCRYPTION_KEY`)

Endpoint: `POST /api/system/secrets/regenerate` (admin-only) in
[`server/routes/system-routes.ts`](../../server/routes/system-routes.ts).

1. **Single PostgreSQL transaction** with `pg_try_advisory_xact_lock`
   (serializes concurrent rotation attempts) and `LOCK TABLE … IN SHARE
   MODE` on every encrypted table.
2. **Manifest walk:** SELECT all rows from the manifest tables, decrypt
   each non-null encrypted value with the **old** key, re-encrypt with
   the **new** key, collect the updates.
3. **Pre-arm the new key as the in-process fallback BEFORE `COMMIT`.**
4. `COMMIT`.
5. **After commit succeeds:** persist the new key to `data/db-config.json`
   + `process.env`, then flip the in-process fallback to the **old** key
   and schedule its teardown (~5 s tail, configurable via
   `__ROTATION_FALLBACK_TAIL_MS`).

### The race the dual-key fallback closes (Task #726)

There's a window between `COMMIT` (data now under the new key) and the
`process.env.ENCRYPTION_KEY` swap completing. A request landing in that
window could try to decrypt a freshly-re-encrypted row with the *old*
env key and fail.

`decryptText()` ([`server/auth/mfaUtils.ts`](../../server/auth/mfaUtils.ts))
handles this: it tries the primary key first, and on failure retries
with `getFallbackEncryptionKey()`
([`server/lib/app-config.ts`](../../server/lib/app-config.ts)) — an
**in-process-memory** slot (never persisted to disk) holding the other
key for the duration of the rotation tail. Either key works during the
window; after the ~5 s tail the fallback is cleared.

### Failure safety

- **Fails before COMMIT** → transaction rolls back, fallback cleared,
  data still under the old key, old key still in `process.env`. Safe to
  retry.
- **Commits but the disk persist fails** → data is under the new key,
  `process.env` still has the old key, fallback keeps the app running,
  and the new key is returned in the response body so the operator can
  save it manually before the next restart.

---

## The rotation flow (`SESSION_SECRET`)

Also via `POST /api/system/secrets/regenerate`. On success:

1. Generate the new secret, persist to disk + env.
2. Call `notifySessionSecretRotated()`
   ([`server/auth/simpleAuth.ts`](../../server/auth/simpleAuth.ts)) which
   swaps the live secret inside the express-session middleware **at
   runtime** — every existing cookie is now signed with an unknown key
   and fails validation on the next request.
3. Clear PG-backed sessions, destroy the admin's own session, and wipe
   their cookie via `Set-Cookie: connect.sid=; Expires=…`.
4. Return `sessionsInvalidated: true` so the UI shows a "you've been
   logged out" notice on the next page load.

Covered end-to-end by
[`server/auth/__tests__/session-secret-rotation.integration.test.ts`](../../server/auth/__tests__/session-secret-rotation.integration.test.ts)
(v1 cookie replayed after rotation → 401).

---

## Rotation-In-Progress banner (Task #734)

[`RotationStatusBanner.tsx`](../../client/src/components/configuration/RotationStatusBanner.tsx)
polls `GET /api/system/secrets/rotation-status` once per second while a
rotation tail is active, showing a live countdown and the re-encryption
counts (tables + rows). Server state comes from `getRotationStatus()` in
[`server/lib/app-config.ts`](../../server/lib/app-config.ts) — an
in-process slot reporting `active`, `tailRemainingMs`, `tailDurationMs`,
`lastCompletedAt`, and `reencrypted: { tables, rows }`. The banner
stops polling when `active` flips false.

---

## App-managed secrets vs. host-env secrets (Task #741)

`SESSION_SECRET` and `ENCRYPTION_KEY` can live in two places:

- **Host env** — set as real environment variables on the container/host.
- **App-managed** — promoted into the encrypted app file
  `data/db-config.json` and hydrated into `process.env` at boot by
  `hydrateProcessEnvFromBootstrap()` in
  [`server/lib/app-config.ts`](../../server/lib/app-config.ts).

Admins promote / unmanage / reveal (10-second masked window) / regenerate
from **System Settings → Bootstrap Secrets**. The boot hydration captures
the original host-env values so "unmanage" can safely fall back to them.

> **Chicken-and-egg note.** The app file is itself protected by
> `ENCRYPTION_KEY`, so rotating `ENCRYPTION_KEY` does **not** re-encrypt
> the file — it re-encrypts the *database rows*. The new key is written
> to the file and used to decrypt DB rows from the next boot onward. The
> data-directory writability probe on System Health → Environment
> Variables catches a read-only `/data` mount before it can silently
> break this persist step.

---

## When to rotate

- **Credential exposure** — the key may have been seen by an unauthorized
  party (leaked in logs, shared accidentally).
- **Compliance mandates** — SOC 2 / ISO 27001 / FedRAMP periodic rotation.
- **Staff offboarding** — someone with infra access has left.
- **Routine hygiene** — scheduled rotation per security policy.

Always have a recent database backup before rotating `ENCRYPTION_KEY` —
the rotation is transactional and self-protecting, but a backup is cheap
insurance against an unforeseen edge case.

---

## Related files

| Concern | File |
|---|---|
| Encrypt / decrypt + dual-key fallback | [`server/auth/mfaUtils.ts`](../../server/auth/mfaUtils.ts) |
| Rotation endpoint | [`server/routes/system-routes.ts`](../../server/routes/system-routes.ts) — `POST /api/system/secrets/regenerate` |
| Encrypted-column manifest | [`server/lib/encrypted-columns.ts`](../../server/lib/encrypted-columns.ts) — `ENCRYPTED_COLUMN_MANIFEST` |
| Fallback key slot + rotation status + boot hydration | [`server/lib/app-config.ts`](../../server/lib/app-config.ts) |
| Session-secret runtime swap | [`server/auth/simpleAuth.ts`](../../server/auth/simpleAuth.ts) — `notifySessionSecretRotated()` |
| Rotation banner | [`client/src/components/configuration/RotationStatusBanner.tsx`](../../client/src/components/configuration/RotationStatusBanner.tsx) |
| Manifest drift guard | [`server/__tests__/encrypted-column-manifest-coverage.test.ts`](../../server/__tests__/encrypted-column-manifest-coverage.test.ts) |
