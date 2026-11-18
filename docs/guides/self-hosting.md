# Self-Hosting CriteriaIQ

This guide walks you from "I have a VPS / Hostinger / Dokploy account" to a
running CriteriaIQ install with an admin account in under 15 minutes. No shell
gymnastics required — the in-app wizard does everything.

## Prerequisites

- A Linux host with **Docker 24+** and **docker compose v2** (or a managed
  platform like Hostinger VPS, Dokploy, Coolify, Render, Railway, etc.)
- A **PostgreSQL 14+** database (Neon, Supabase, Railway, RDS, or the bundled
  Postgres container in `docker-compose.yml`)
- A public hostname pointing at your VPS (recommended)
- HTTPS (recommended — use a reverse proxy like Caddy / Traefik / NGINX in
  front of CriteriaIQ)

## Path A — `docker compose` (fastest)

```bash
git clone <your-fork-or-mirror>.git criteriaiq
cd criteriaiq
cp .env.example .env

# (optional) edit .env to point at an external Postgres or pre-set secrets
docker compose up -d --build
```

Open `http://your-host:5000/setup` and walk the wizard. Done.

The bundled `postgres` service stores data in the `postgres_data` Docker
volume; the app keeps secrets and uploads in the `app_data` and
`app_uploads` volumes. Back these volumes up.

### Pointing at an external Postgres

Edit `.env`:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@your-db-host:5432/criteriaiq
```

Then comment out the `postgres` service in `docker-compose.yml` (or just
ignore it — it's harmless to leave running unused).

## Path B — Hostinger VPS

1. Provision a "VPS Plan 2" or larger Ubuntu 22.04 host from the Hostinger
   panel.
2. SSH in and install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   ```
3. `git clone` your CriteriaIQ repo, `cp .env.example .env`, edit
   `PUBLIC_APP_URL=https://your-domain.com`.
4. `docker compose up -d --build`
5. Point your Hostinger DNS A-record at the VPS IP.
6. Put Caddy in front for free TLS. Use this Caddyfile (note the
   explicit upstream timeouts — without them, admin writes such as
   saving a Field Setting can surface as `504 Gateway Timeout` for the
   exact same reason described in
   [`dokploy-traefik-timeouts.md`](./dokploy-traefik-timeouts.md)):
   ```caddy
   your-domain.com {
     reverse_proxy localhost:5000 {
       transport http {
         dial_timeout    30s
         read_timeout    60s
         write_timeout   60s
       }
     }
   }
   ```
   Prefer NGINX? Use the equivalent `server` block from
   [§ NGINX reverse proxy](#nginx-reverse-proxy) below — it sets the
   matching `proxy_connect_timeout` / `proxy_read_timeout` /
   `proxy_send_timeout` values.
7. Visit `https://your-domain.com/setup` and complete the wizard.

### NGINX reverse proxy

If you prefer NGINX over Caddy, drop this `server` block into
`/etc/nginx/sites-available/criteriaiq.conf` (and symlink it into
`sites-enabled/`). The `proxy_*_timeout` values mirror the Caddy
snippet above and the Traefik
`responseHeaderTimeout=60s` / `dialTimeout=30s` defaults shipped
in `docker-compose.yml`, so a slow-but-not-stuck admin write will
not be clipped to `504 Gateway Timeout`:

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  # ssl_certificate / ssl_certificate_key — managed by certbot or your CA

  location / {
    proxy_pass         http://127.0.0.1:5000;
    proxy_http_version 1.1;
    proxy_set_header   Host              $host;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;

    # WebSocket upgrade (used by the in-app realtime channel)
    proxy_set_header   Upgrade           $http_upgrade;
    proxy_set_header   Connection        "upgrade";

    # Match Caddy's transport.http and Traefik's forwardingTimeouts.
    proxy_connect_timeout 30s;
    proxy_send_timeout    60s;
    proxy_read_timeout    60s;
  }
}
```

After reloading (`sudo nginx -t && sudo systemctl reload nginx`),
re-test saving a Field Setting (e.g. the Stretch ranking color). The
save should round-trip in well under a second. If you still see a
`504`, follow the Step 1 / Step 3 diagnostics in
[`dokploy-traefik-timeouts.md`](./dokploy-traefik-timeouts.md) — the
`slow_field_settings_save` warning is emitted regardless of which
proxy is in front.

## Path C — Dokploy

1. In Dokploy, create a new **Compose** application and paste the contents
   of `docker-compose.yml`.
2. **Uncomment the Traefik labels block** on the `app` service and replace
   `your-domain.com` with your real hostname. The bundled labels already
   set the recommended router (`websecure` + Let's Encrypt), a healthcheck
   pointing at `/api/setup/status`, and a per-router `serversTransport`
   that raises the upstream `responseHeaderTimeout` to `60s` so admin
   writes (e.g. saving a Field Setting) don't get clipped to
   `504 Gateway Timeout`. If your Dokploy/Traefik static config uses a
   certresolver name other than `letsencrypt` (e.g. `le`, `cf`,
   `default`), update `traefik.http.routers.criteriaiq.tls.certresolver`
   to match — otherwise Traefik will not issue a certificate. See
   [`dokploy-traefik-timeouts.md`](./dokploy-traefik-timeouts.md) for the
   underlying rationale.
3. Add the following environment variables in the Dokploy UI (all optional —
   the wizard handles them otherwise):
   - `PUBLIC_APP_URL=https://your-dokploy-domain`
   - `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` /
     `BOOTSTRAP_ADMIN_NAME` if you want the admin auto-created.
4. Mount persistent volumes for `/app/data` and `/app/uploads`.
5. Deploy. On first hit, the wizard runs at `/setup`.
6. After the wizard restart-step, Dokploy's auto-restart picks the container
   back up with full DB access.

## The setup token

Until the first admin exists, the wizard asks for a **setup token** before it
changes anything, so nobody else who reaches the server can point it at their
own database or create the first admin. The token is printed in the server log
at startup (look for `Setup token`). To choose your own, set `SETUP_TOKEN` to a
value of 16 or more characters. Only the read-only status checks
(`GET /api/setup/status` and `GET /api/setup/migrations-summary`) work without it.

## What the wizard creates for you

- **Database schema** — runs `drizzle-kit push --force` against your URL.
- **`SESSION_SECRET` / `ENCRYPTION_KEY`** — strong random values, stored in
  `data/db-config.json` (which lives on the persistent volume).
- **`PUBLIC_APP_URL`** — saved so email links and WebAuthn passkeys use the
  right origin.
- **First admin** — `role=Admin`, `isApproved=true`, password hashed with
  bcrypt cost 10.

<a id="tuning-the-database-connection-pool"></a>

## Tuning the database connection pool

CriteriaIQ uses a single Postgres connection pool sized to **10 clients** by
default (the `pg` driver default). On busier installs — typically anything
running the scheduler-driven email automation, table sync, or AI risk scoring
jobs alongside a few concurrent admin users — that pool can be held in full
by background work, which makes the next admin write block in
`pool.connect()` until Traefik returns a `504 Gateway Timeout`.

The Database Health tab surfaces a **"raise `DB_POOL_MAX`"** hint as soon as
the live pool gauge has reported queued waiters across two consecutive polls
(see `client/src/components/configuration/system-health/DatabaseHealthTab.tsx`).
This section explains what number to actually pick when that hint fires.

Raise the ceiling without a code change by setting the `DB_POOL_MAX` env var
on your hosting platform and restarting the container:

```bash
DB_POOL_MAX=25
```

Accepted range is **1–1000** (defaults are defined in
`server/lib/db-pool-config.ts`). Values **above 1000 are clamped down to 1000**;
non-numeric, missing, zero, or negative values **fall back to 10**. Confirm
the override took effect by grepping the boot log for the line CriteriaIQ
prints once at startup:

```
[DB] Connection pool max=25 (override: DB_POOL_MAX=25)
```

The trailing tag distinguishes three cases:
- `(default; DB_POOL_MAX unset)` — env var was not set, you get 10
- `(override: DB_POOL_MAX=25)` — env var parsed cleanly to the printed value
- `(override: DB_POOL_MAX=abc → 10)` — env var was set but invalid /
  out-of-range, so it was coerced to the value after the arrow

### Picking a number

`DB_POOL_MAX` is a **per-Node-process** ceiling — every running CriteriaIQ
container will open up to that many Postgres clients of its own. The number
that actually matters at the database is Postgres' `max_connections`
setting (default `100`), which is shared across **every** client of that
server: CriteriaIQ, your `psql` sessions, replication slots, and any sibling
services pointed at the same database.

A safe starting formula:

```
DB_POOL_MAX  ≤  (postgres.max_connections − reserved_for_others) ÷ N_app_replicas
```

- `reserved_for_others`: leave at least **10–15** for `psql`, `pg_dump`,
  monitoring agents, and Postgres' own `superuser_reserved_connections`
  (default `3`).
- `N_app_replicas`: how many CriteriaIQ containers point at the same DB.
  A single docker-compose deployment is `1`. A horizontally-scaled Dokploy
  / Coolify setup with 3 app replicas is `3`.

Worked examples (assuming the stock Postgres `max_connections=100` and a
15-connection reservation for sibling tooling):

| Replicas | Headroom per replica | Suggested `DB_POOL_MAX` |
| -------- | -------------------- | ----------------------- |
| 1        | 85                   | **25** (4× the default; covers a busy scheduler tick) |
| 2        | 42                   | **20** |
| 3        | ~28                  | **15** |
| 5        | 17                   | **10** (don't go below the default — scale Postgres instead) |

If the hint keeps firing at a reasonable `DB_POOL_MAX`, the right next step
is **not** to keep doubling — it's to either (a) raise Postgres'
`max_connections` (and `shared_buffers` to match), (b) put PgBouncer in
front of Postgres so the app pool maps to a smaller upstream pool, or
(c) move the heaviest scheduled jobs (table sync, AI risk scoring) onto a
worker process with its own pool. Doubling `DB_POOL_MAX` past the Postgres
ceiling will surface as `FATAL: sorry, too many clients already` instead
of the original 504 — a noisier failure mode, but not a fixed one.

See [`dokploy-traefik-timeouts.md`](./dokploy-traefik-timeouts.md) Step 3 for
the full diagnostic procedure that points at this knob.

## Debug logging

Two opt-in environment variables turn on extra log lines that are useful when
diagnosing a specific problem but too noisy to leave on all the time. Both
default to **off** — set them in your platform's env-var panel (Dokploy →
Environment, Coolify → Application → Variables, `docker-compose.yml`,
`.env`, etc.) and restart the container to see the extra lines.

| Variable | Default | What it adds to the log |
| -------- | ------- | ----------------------- |
| `DEBUG_AUTH=true` | off | One `Login attempt - email: <email> password length: <N>` line per `POST /api/login`, useful when triaging "I can't sign in" reports. The password is logged as a length only, never as a value, but the email **is** logged in cleartext — keep this off in normal operation. |
| `DEBUG_DB_POOL=true` | off | One `Database client acquired. Active connections: <N>` and one matching `…released. Active connections: <N>` line per checked-out pool client. Useful when chasing pool exhaustion (`FATAL: sorry, too many clients already`) or correlating slow saves with a stuck connection. Produces several lines per request — leave it off unless you're actively debugging. |

The standard Express access log (`POST /api/login 200 in <ms>`) is unaffected
by these flags — it always renders.

<a id="scheduler-run-history-retention"></a>
## Scheduler run history retention

**Configuration → Scheduler** keeps a history of background-job runs in the
`job_runs` table (only runs that did work or failed). The `job_runs_cleanup`
job deletes rows older than the retention window once a day; its cadence
can be changed on the Scheduler page.

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `JOB_RUNS_RETENTION_DAYS` | `90` | How far back the Scheduler's run history goes. Values below 1 or unparseable values fall back to 90. |

<a id="login-history-retention"></a>
## Login history retention

Every `/api/login` attempt — successful or failed — writes one row to the
`audit_logins` table. That table powers the admin **"Recent logins"** /
**Login Audit** panel, but on any public deployment the brute-force noise
hitting the login endpoint will accumulate thousands of rows per day, so
a daily background job (added in Task #746) prunes anything older than
the retention window. The job lives in
`server/services/audit-logins-cleanup.ts` and is wired up at boot
alongside the expired-sessions cleanup in `server/routes.ts`.

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `AUDIT_LOGINS_RETENTION_DAYS` | `90` | How far back the **Recent logins** panel can show login history. Rows with `login_time` older than this are deleted on the next tick. Tighten this for stricter GDPR / compliance regimes — IP addresses recorded against each login attempt are personal data. |
| `AUDIT_LOGINS_CLEANUP_INTERVAL_HOURS` | `24` | How often the prune runs. Leave at 24h unless you have a specific reason to run it more often (a very high-traffic deployment with a short retention window, for example). |
| `AUDIT_LOGINS_CLEANUP_FIRST_RUN_DELAY_MS` | `60000` (60 s) | How long after boot the first prune fires. Lets the boot sequence finish before the DELETE hits, but is short enough that operators can confirm the job is wired up without waiting a full day. |

Non-positive or unparseable values fall back to the defaults — the
failure mode is "the table grows forever", which is exactly what this
job exists to prevent, so it never silently disables itself.

Confirm the prune is running by grepping the application log for the
operator-greppable line that fires on every tick:

```
[Audit Logins Cleanup] Pruned 1234 audit_logins rows older than 90 days in 42ms
```

The same information is also surfaced in the admin UI under
**Configuration → System Health → Database** in the **"Login history
cleanup"** panel (Task #751). The panel shows the timestamp of the
most recent successful prune, how many rows it removed, and the
active retention window — so admins can confirm at a glance that
login history is being trimmed and matches the configured compliance
window without ssh'ing in to grep the log line above. The values are
read from the scheduler's in-process state, so the panel resets to
"Awaiting first run" on boot until the first tick fires (default 60 s
after process start).

If you set `AUDIT_LOGINS_RETENTION_DAYS=30`, the corresponding
`Login Audit` admin page will only show the last 30 days of attempts —
older rows are gone, not hidden.

## MCP server rate limits

The read-only MCP server (Admin → Integrations → MCP Server, `docs/features/mcp-server.md`) has its own in-memory limits on top of the global API limit:

| Variable | Default | Effect |
| -------- | ------- | ------ |
| `MCP_RATE_PER_MIN` | `60` | Calls per `mcp:read` key per minute. |
| `MCP_RATE_PER_HOUR` | `1000` | Calls per key per hour. |
| `MCP_RATE_TENANT_DAILY` | `5000` | Calls across all keys per day. |

## Reconfiguring the database after install

Once an admin exists, the **Setup Health Check** view (the page that opens
when you visit `/setup` post-install) shows a **Reconfigure…** button that
drops you back into the wizard. The Database step's **Test Connection**
button is fully functional from this view — paste a candidate URL, click
Test Connection, and you'll see either a green **"Connection OK — <ms>ms"**
banner or the specific server-classified error (auth failed, connection
refused, SSL required, etc.). Test Connection is read-only — it never
persists the URL or touches your live install.

The app also opens this view by itself (as `/setup?reentry=1`) in one case
only: you signed in, and within two minutes the server no longer recognises
the session. That means the session cookie never stuck, usually a Secure
cookie over plain HTTP or a wrong trust-proxy hop count, and the view shows
which check fails. A session that simply ends, because the absolute
lifetime (`SESSION_TTL_HOURS`, default 8 hours) or the idle timeout
(`SESSION_IDLE_TIMEOUT_MINUTES`, default 180) ran out or an admin revoked it,
goes to the sign-in page with a "session expired" notice.

To actually **switch** the live database after install, edit `DATABASE_URL`
in your hosting platform's environment panel (Dokploy → Environment,
Coolify → Application → Variables, `docker-compose.yml`, etc.) and restart
the container. The wizard's Initialize / Save & Continue / Create Admin /
Save SMTP / Restart buttons are **visibly disabled** post-install with a
blue **"Reconfigure mode"** callout pinned above every step explaining
why and pointing back at this section. The hosted endpoints behind those
buttons (`POST /api/setup/initialize`, `/save-config`, `/public-url`,
`/create-admin`, `/smtp`, `/complete`) are only mounted during first-run
bootstrap — they were designed for a fresh install with no admin yet,
and re-running them against a live database (with existing users,
sessions, migration history, and a pinned `ENCRYPTION_KEY`) needs
backup, session-store, and migration-reconciliation primitives that are
out of scope for the Reconfigure flow today. Disabling the buttons in
the UI and refusing to mount the routes on the server are belt-and-
braces — the server-side gate (`server/index.ts` post-install branch
mounts only the read-only status + Test Connection routes) is the
authoritative one; the disabled buttons + callout exist so operators
understand the situation **before** they type anything they'd lose.

In short: **Reconfigure → Test Connection is for verifying a candidate URL
works**; the actual swap happens via your platform's `DATABASE_URL`
env-var panel followed by a restart.

### One-click env-var swap helper (Task #681 / #690)

The Reconfigure-mode callout also surfaces a small **runtime helper** that
detects which hosting platform you're running on and shortens the
"manual edit + redeploy" loop above. Detection is purely env-var driven
(no network probes), so it's safe to evaluate on every wizard mount.

| Detected runtime | How we detect | What the helper offers |
| ---------------- | ------------- | ---------------------- |
| **Coolify** | `COOLIFY_URL` and/or `COOLIFY_RESOURCE_UUID` (auto-injected by Coolify v4 into every container). | **Open env-var editor** deep link to `<COOLIFY_URL>/applications/<uuid>/environment-variables`. If you also set `COOLIFY_API_TOKEN` (a Coolify API token with write access to this application), an additional **Apply DATABASE_URL & restart** button appears — it re-tests the URL, PATCHes Coolify's `/api/v1/applications/<uuid>/envs` endpoint, and POSTs `/restart` to trigger a redeploy with the new env. The button is gated behind an explicit confirm dialog and refuses to fire without a green Test Connection result on the candidate URL. |
| **Dokploy** | `DOKPLOY_URL` (operator-supplied). Optional: `DOKPLOY_PROJECT_ID` and `DOKPLOY_APPLICATION_ID` for a precise deep link. | **Open env-var editor** deep link to your Dokploy dashboard (service-deep when both IDs are set, project-deep with just `DOKPLOY_PROJECT_ID`, base URL otherwise). When you also set `DOKPLOY_APPLICATION_ID` and `DOKPLOY_API_TOKEN`, the same **Apply DATABASE_URL & restart** button as Coolify appears — it re-tests the URL, fetches the application's current env via `POST /api/application.one`, splices in (or replaces) the `DATABASE_URL` line, persists the merged env via `POST /api/application.saveEnvironment`, and triggers a redeploy via `POST /api/application.deploy`. Sibling env vars (`SESSION_SECRET`, `NODE_ENV`, …) are preserved verbatim — only `DATABASE_URL` is touched. |
| **Docker** | The `/.dockerenv` marker file is present (no Coolify/Dokploy env-var signals). | No deep link — we can't know which orchestrator owns this container. The disabled "No deep link available" hint shows alongside the existing docs guidance to edit `DATABASE_URL` and `docker compose up -d`. |
| **Standalone** | None of the above. | No helper buttons at all — the original docs hint is the only guidance. |

**Required env vars for the Coolify API path**

Set these on your host's environment editor (Coolify auto-injects the
first two; you only need to add the token yourself):

```
COOLIFY_URL=https://coolify.your-server.com   # auto-injected by Coolify
COOLIFY_RESOURCE_UUID=<your application UUID>  # auto-injected by Coolify
COOLIFY_API_TOKEN=<Coolify API token with write access>
```

Get the API token from **Coolify dashboard → Keys & Tokens → API Tokens
→ Create Token**. Scope it to the application you're running this app
under — it'll be used by `POST /api/admin/runtime-apply-database-url`
to update the env var and trigger a redeploy.

**Required env vars for the Dokploy API path**

Dokploy doesn't auto-inject identification vars, so you set all three
yourself in **Dokploy dashboard → Application → Environment**:

```
DOKPLOY_URL=https://dokploy.your-server.com
DOKPLOY_APPLICATION_ID=<your application UUID>
DOKPLOY_API_TOKEN=<Dokploy API token>
```

`DOKPLOY_PROJECT_ID` is optional — set it only if you want the
**Open env-var editor** deep link to land on the project page when
the app UUID is missing. Get the API token from **Dokploy dashboard
→ Settings → API/CLI → Create API key**. The token is sent to
Dokploy via the `x-api-key` header (the convention the Dokploy CLI
uses), never as a query string or in the response payload.

**Security model**

- Both helper endpoints (`GET /api/admin/runtime-info` and
  `POST /api/admin/runtime-apply-database-url`) are admin-gated, mirroring
  the same hand-rolled session check `POST /api/setup/test-connection`
  uses post-install. A signed-out caller gets a 401 and a non-Admin gets
  a 403 — the gate runs before any pool open or outbound API call.
- The apply endpoint refuses without an explicit `confirm: true` flag in
  the request body, so a stray cURL can't accidentally swap the live
  `DATABASE_URL`. The wizard's AlertDialog is the only intended caller.
- Host API tokens never leave the server: detection only reports the
  **name** of the token env var (`COOLIFY_API_TOKEN` or
  `DOKPLOY_API_TOKEN`) so the wizard can show a "set this on your host"
  hint, never the value. The actual Bearer / `x-api-key` token only
  rides in the outbound HTTP header to the host.
- The apply endpoint re-runs Test Connection on the candidate URL
  before pushing it to the host, so a typo never lands in your host's
  env editor.
- For Dokploy, the merge is line-anchored: only the FIRST existing
  `DATABASE_URL=...` line is replaced (or one is appended when none
  exists), so duplicate entries and sibling vars are preserved exactly
  as the operator left them.

**When the helper isn't enough**

Both buttons fall back to the existing manual flow when:

- Your runtime isn't Coolify or Dokploy — edit `DATABASE_URL` in your
  host's env editor and redeploy as before.
- You're on Coolify or Dokploy but haven't set the corresponding
  `*_API_TOKEN` (or, on Dokploy, are missing `DOKPLOY_APPLICATION_ID`)
  — the deep link is still useful, but the Apply button shows a hint
  pointing at the missing env var rather than firing.
- The host's API call fails (auth rejected, app UUID drifted, network
  unreachable) — the wizard surfaces a localized error code (e.g.
  `controlApiUnauthorized`, `controlApiUnreachable`,
  `controlApiAppNotFound`) and the manual edit path remains available.

## Post-install checklist

- [ ] Create an account for **your own organization**, mark it **Internal**, and link your email domain(s) to it under **User Management → Login Management** — users from those domains are treated as internal staff (all-account access, auto-approved)
- [ ] Set a **Support Contact Email** under **Configuration → System Settings → Media** — it appears on error pages and in the Get Help menus (they stay hidden until it is set)
- [ ] Configure SMTP under **Configuration → System Settings → Email Settings**
- [ ] Add cloud storage credentials under **System Settings → Storage** (S3,
      GCS, Azure) if you don't want files on the local volume
- [ ] Add AI provider keys under **Configuration → AI Providers** for the
      assessment engine
- [ ] Schedule database backups under **System Settings → Backup Destinations**
- [ ] Rotate the wizard-generated secrets to your secret manager (set
      `SESSION_SECRET` / `ENCRYPTION_KEY` in your hosting platform's env-var
      panel; env values override the file values)
- [ ] Lock down the `BOOTSTRAP_ADMIN_*` env vars (remove them from your
      platform — they become inert once an admin exists, but cleanliness wins)

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| `/setup` keeps reappearing after the wizard | The `data/` volume is not persistent. Mount it. |
| WebAuthn passkeys fail in production | `PUBLIC_APP_URL` doesn't match the real origin. Update it under the wizard's URL step or set the env var. |
| "ENCRYPTION_KEY is unset or invalid in production" exit | You set `NODE_ENV=production` without persisting the wizard's generated values. Either let the wizard run, or set `ENCRYPTION_KEY` to 64 hex chars. |
| Email links go to `localhost:5000` | `PUBLIC_APP_URL` not set. Re-run the wizard's URL step or set the env var. |
| Wizard's "Initialize" phase fails on `migrate` | Your DB user needs `CREATE TABLE` privileges. Use a superuser or a role with `ALL ON SCHEMA public`. |
| Saving Field Settings (e.g. ranking color) returns `504 Gateway Timeout` behind any reverse proxy | Almost always an upstream-timeout knob on the proxy — the in-app save itself is a single-row UPDATE that finishes in milliseconds. See [`dokploy-traefik-timeouts.md`](./dokploy-traefik-timeouts.md) for the diagnostic procedure (grep the access log for the `slow_field_settings_save` warning) and the known-good snippet for your proxy: [Traefik labels](./dokploy-traefik-timeouts.md#recommended-traefik-snippet-for-dokploy), [Caddyfile](#path-b--hostinger-vps) (Path B step 6), or [NGINX `server` block](#nginx-reverse-proxy). |

## Upgrading

```bash
git pull
docker compose build --pull
docker compose up -d
```

Schema migrations run automatically on boot (no wizard re-run needed).
