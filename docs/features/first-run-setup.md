# First-Run Setup & Self-Hosting Bootstrap

CriteriaIQ ships with an 8-step browser-based wizard that takes a **fresh
PostgreSQL database** and an **empty container** and produces a working,
logged-in admin without ever needing a shell session.

This page documents what the wizard does, every API it calls, and how the
"escape hatches" (env vars, file overrides) interact.

## When does the wizard run?

The wizard is served at `/setup` whenever **all** of the following are true:

- `data/db-config.json` does not exist OR `dbReady` is false at boot
- Standard `DATABASE_URL` env var has not been provided

When any of those conditions are not met, `/setup` redirects to `/` and the
main app boots normally.

## The 8 steps

| # | Step | Endpoint | What it persists |
| - | ---- | -------- | ---------------- |
| 1 | **Database** — paste a connection URL, latency-tested | `POST /api/setup/test-connection` | nothing (smoke test only) |
| 2 | **Initialize** — phased: connect → secrets → migrate → write | `POST /api/setup/initialize` | `data/db-config.json` (encrypted), all schema tables |
| 3 | **Secrets** — review SESSION_SECRET / ENCRYPTION_KEY origin | `GET  /api/setup/secrets` | nothing (read-only inspection) |
| 4 | **Public URL** — what users / emails / WebAuthn will see | `POST /api/setup/public-url` | `publicAppUrl` in bootstrap store |
| 5 | **Admin** — email, name, password (validated) | `POST /api/setup/create-admin` | row in `users` (`role=Admin, isApproved=true`) |
| 6 | **Email** — recommended skip; configure post-install in UI | n/a | nothing |
| 7 | **CRM** — Salesforce (preselected), HubSpot or no CRM; see [CRM provider](crm-provider.md) | `POST /api/setup/crm-provider` | `crmProvider` in `data/db-config.json`, written to `system_settings` on the next boot by `server/crm/setup-hydrate.ts` |
| 8 | **Done** — health checks, then `POST /api/setup/restart` | `GET /api/setup/status`, `POST /api/setup/restart` | exits the process so the host restarts it with full DB access |

## Persistence layout

All wizard outputs land in **`data/db-config.json`**:

```json
{
  "connectionUrl": "<AES-256-GCM ciphertext>",
  "sessionSecret": "<96 hex chars>",
  "encryptionKey": "<64 hex chars>",
  "publicAppUrl": "https://app.example.com",
  "updatedAt": "2026-04-23T22:00:00.000Z"
}
```

This file MUST live on a persistent volume (see `Dockerfile` —
`VOLUME ["/app/data", "/app/uploads"]`). The encryption key for the connection
URL is derived from the host fingerprint so that the file is portable across
restarts but useless if exfiltrated alone.

## Resolution order for every secret

`server/lib/app-config.ts` is the single source of truth:

1. **Process environment** — `SESSION_SECRET`, `ENCRYPTION_KEY`, `PUBLIC_APP_URL`
2. **`data/db-config.json`** — wizard-generated fallbacks
3. **Hard-coded dev defaults** (`http://localhost:5000`)

`hydrateProcessEnvFromBootstrap()` is called at the very top of
`server/index.ts` before anything else imports auth / mfa / email modules, so
the file values become "real" env vars early.

## Production hardening (`enforceProductionSecrets`)

Called once after database connectivity is established. With
`autoGenerate: true` (default) it:

- Generates and persists a strong `SESSION_SECRET` if missing or matching the
  development fallback string.
- Generates and persists a 64-hex `ENCRYPTION_KEY` if missing or invalid.

With `autoGenerate: false` (or in scripted CI environments where you want a
hard failure), it instead **`process.exit(1)`** in production with a clear
remediation message.

`mfaUtils.ts` and `simpleAuth.ts` independently refuse to start with insecure
defaults in production — defense in depth.

## Bootstrap admin via env vars

For unattended installs (CI, Dokploy auto-deploy, IaC pipelines) you may set:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=ChangeMeStrongP@ssw0rd!
BOOTSTRAP_ADMIN_NAME="Site Admin"
```

`ensureBootstrapAdmin()` runs once on boot. If **no approved admin exists**,
it creates the user with `role=Admin, isApproved=true`. Once any admin
exists, the env vars become inert — they are NOT a back door.

## Health-check endpoint

`GET /api/setup/status` returns:

```json
{
  "setupRequired": false,
  "adminExists": true,
  "publicAppUrl": "https://app.example.com",
  "hasSessionSecret": true,
  "hasEncryptionKey": true,
  "sessionSecretSource": "file",
  "encryptionKeySource": "file",
  "publicAppUrlSource": "file"
}
```

The Done step in the wizard polls this after restart to render a green/red
checklist before redirecting to the login screen.

## Files of interest

- `server/lib/app-config.ts` — secret/URL helpers, hardening, hydration
- `server/auth/admin-bootstrap.ts` — admin creation + env-var bootstrap
- `server/db-bootstrap.ts` — encrypted bootstrap store
- `server/routes/setup-routes.ts` — every `/api/setup/*` endpoint
- `client/src/pages/setup.tsx` — the 8-step wizard UI
- `Dockerfile`, `docker-compose.yml`, `.env.example` — container artifacts
