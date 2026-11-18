# Reverse-proxy upstream timeouts (Traefik / Caddy / NGINX)

This guide explains how to diagnose and fix `504 Gateway Timeout` responses
when saving Field Settings (or any other `PUT /api/...` admin write) on a
Dokploy / Coolify / generic-Traefik install of CriteriaIQ — or on a
Caddy / NGINX install set up via Path B of
[`self-hosting.md`](./self-hosting.md). The diagnostic in Step 1 is
proxy-agnostic; the knob you raise in Step 2 depends on which proxy you
run.

> **Filename note.** The file is still called `dokploy-traefik-timeouts.md`
> for backwards-compatibility with existing inbound links, but every
> section below applies to Caddy and NGINX too. See
> [§ Other reverse proxies (Caddy & NGINX)](#other-reverse-proxies-caddy--nginx)
> for the per-proxy knob map.

## TL;DR

If the in-app access log shows the request finishing in well under a second
but the browser still gets a `504`, the timeout is being enforced by your
reverse proxy, not by CriteriaIQ. Raise (or remove) the proxy's
upstream/forwarding timeout — the snippets below show every place those
knobs live for Traefik, and the
[Other reverse proxies](#other-reverse-proxies-caddy--nginx) section
maps each Traefik knob to its Caddy and NGINX counterpart.

## Why Field Settings saves were the trigger

The save endpoints themselves are tiny:

- `PUT /api/ranking-configs/:id` → one row UPDATE on `ranking_configs`
- `PUT /api/end-date-flags/:id` → one row UPDATE on `end_date_flags`

Both fire one in-process WebSocket broadcast (no fan-out to other services)
and return the updated row. Round-trip time on a healthy install is
**typically 5–50 ms** including the broadcast. Anything over ~2 seconds is
either (a) a database-side anomaly or (b) the request is sitting in the
Node event loop behind another long-running operation.

## Step 1 — Confirm whether the slowness is app-side or proxy-side

This step is **proxy-agnostic** — the access-log line and the
`slow_field_settings_save` warning are emitted by CriteriaIQ itself, so
the same `grep` recipe works whether Traefik, Caddy, or NGINX is in
front. Every `/api/*` request emits one access-log line at completion:

```
PUT /api/ranking-configs/3 200 in 24ms :: {"id":3,"name":"Stretch",...}
```

When a Field Settings save takes longer than the configurable threshold
(default **2000 ms**; override at runtime via the
`SLOW_SAVE_THRESHOLD_MS` env var — positive integer ms; invalid/zero/
negative values fall back to the default. See
`server/lib/slow-save-warn.ts`), the server also emits a structured
warning line that is easy to grep for in Dokploy / Loki / Datadog:

```
{"event":"slow_field_settings_save","handler":"PUT /api/ranking-configs/:id","durationMs":12345,"thresholdMs":2000,"id":"3"}
```

In the Dokploy log viewer (or `docker compose logs app`) run:

```bash
docker compose logs app | grep -E "slow_field_settings_save|PUT /api/(ranking-configs|end-date-flags)"
```

- **No `slow_field_settings_save` line, but the browser sees a 504**
  → CriteriaIQ replied quickly. The 504 was injected by your reverse
    proxy. Skip to Step 2 (Traefik) or
    [§ Other reverse proxies](#other-reverse-proxies-caddy--nginx)
    (Caddy / NGINX).
- **`slow_field_settings_save` line present with a multi-second `durationMs`**
  → The slowness is inside the app or its DB driver. See Step 3.

## Step 2 — Raise the Traefik forwarding timeout

> Running Caddy or NGINX instead? Skip ahead to
> [§ Other reverse proxies (Caddy & NGINX)](#other-reverse-proxies-caddy--nginx)
> for the equivalent knobs.

Traefik enforces upstream timeouts in **two** unrelated places. Both
default to no limit (`0`) in upstream Traefik, but Dokploy ships an
opinionated preset that may have shortened them. Check both.

### 2a. Static config — `traefik.yml` / `--serversTransport.forwardingTimeouts.*`

```yaml
serversTransport:
  forwardingTimeouts:
    dialTimeout: "30s"               # connection establishment to upstream
    responseHeaderTimeout: "0s"      # how long Traefik waits for headers
                                     # 0s = wait forever (recommended for
                                     # admin writes).
    idleConnTimeout: "90s"
```

Equivalent CLI flags:

```
--serversTransport.forwardingTimeouts.responseHeaderTimeout=0s
--serversTransport.forwardingTimeouts.dialTimeout=30s
```

`responseHeaderTimeout` is the one that produces a `504 Gateway Timeout` —
raise it (or set it to `0s`) if the symptom matches Step 1's "no
slow_field_settings_save line" branch.

### 2b. Dynamic config — per-router `serversTransport`

If your Dokploy template attaches a named `serversTransport` to the
CriteriaIQ router, the per-router setting overrides the global default:

```yaml
http:
  serversTransports:
    criteriaiq-transport:
      forwardingTimeouts:
        responseHeaderTimeout: "60s"   # ← raise / set to 0s
        dialTimeout: "30s"
```

Or via Docker labels on the `app` service:

```yaml
labels:
  - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s"
  - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.dialTimeout=30s"
  - "traefik.http.routers.criteriaiq.service=criteriaiq"
  - "traefik.http.services.criteriaiq.loadbalancer.serversTransport=criteriaiq-transport"
```

### 2c. EntryPoint timeouts — `respondingTimeouts`

These bound Traefik's read/write of the *client* connection, not the
upstream, but a too-low `writeTimeout` on the entry point will also
manifest as a closed connection / 504 to the browser:

```yaml
entryPoints:
  websecure:
    address: ":443"
    transport:
      respondingTimeouts:
        readTimeout: "60s"
        writeTimeout: "60s"
        idleTimeout: "180s"
```

Recommended minimum for an admin-heavy app: `60s` for both read and write.

## Other reverse proxies (Caddy & NGINX)

If Step 1 said the 504 was injected by the proxy but you're not running
Traefik, raise the corresponding upstream timeout on your proxy. The
table below maps each Traefik knob from Step 2 to its Caddy and NGINX
counterpart. Known-good full snippets for both proxies live in
[`self-hosting.md`](./self-hosting.md) — see Path B step 6 for the
[Caddyfile](./self-hosting.md#path-b--hostinger-vps) and the
[`§ NGINX reverse proxy`](./self-hosting.md#nginx-reverse-proxy)
section for the `server` block.

| Traefik (Step 2)                                  | Caddy (`reverse_proxy ... { transport http { ... } }`) | NGINX (`location { ... }`)            |
| ------------------------------------------------- | ------------------------------------------------------ | ------------------------------------- |
| `forwardingTimeouts.dialTimeout`                  | `dial_timeout`                                         | `proxy_connect_timeout`               |
| `forwardingTimeouts.responseHeaderTimeout` ⭐     | `read_timeout` ⭐                                       | `proxy_read_timeout` ⭐                |
| `respondingTimeouts.writeTimeout` (entry point)   | `write_timeout`                                        | `proxy_send_timeout`                  |
| `forwardingTimeouts.idleConnTimeout`              | `keep_alive` / connection reuse defaults               | `keepalive_timeout` (upstream block)  |

⭐ = the knob that produces the `504 Gateway Timeout` symptom from Step 1
when set too low. If the `slow_field_settings_save` warning is **absent**
but the browser still sees a 504, this is the value to raise (or set to
`0` / a large value such as `60s`).

### Caddy

```caddy
your-domain.com {
  reverse_proxy localhost:5000 {
    transport http {
      dial_timeout    30s   # ↔ Traefik dialTimeout
      read_timeout    60s   # ↔ Traefik responseHeaderTimeout — raise this
      write_timeout   60s   # ↔ Traefik respondingTimeouts.writeTimeout
    }
  }
}
```

Reload with `caddy reload --config /etc/caddy/Caddyfile` (or
`sudo systemctl reload caddy`) and re-test. The full Caddyfile —
including the TLS auto-issuance and WebSocket upgrade behaviour — is
in [`self-hosting.md` Path B step 6](./self-hosting.md#path-b--hostinger-vps).

### NGINX

```nginx
location / {
  proxy_pass         http://127.0.0.1:5000;
  proxy_http_version 1.1;

  # WebSocket upgrade (used by the in-app realtime channel)
  proxy_set_header   Upgrade    $http_upgrade;
  proxy_set_header   Connection "upgrade";

  proxy_connect_timeout 30s;   # ↔ Traefik dialTimeout
  proxy_read_timeout    60s;   # ↔ Traefik responseHeaderTimeout — raise this
  proxy_send_timeout    60s;   # ↔ Traefik respondingTimeouts.writeTimeout
}
```

Reload with `sudo nginx -t && sudo systemctl reload nginx` and re-test.
The full `server` block — including the standard
`X-Forwarded-*` headers and TLS configuration — is in
[`self-hosting.md` § NGINX reverse proxy](./self-hosting.md#nginx-reverse-proxy).

If the 504 persists **after** raising the proxy-side knob, jump to Step 3
— the slowness has moved from the proxy into the app.

## Step 3 — App-side slowness (if Step 1 found a slow_field_settings_save line)

If the app is genuinely taking multiple seconds to complete a single-row
UPDATE, the usual culprits are:

1. **DB connection pool exhaustion.** The default pool size is `10`
   (the `pg` driver default; see `server/lib/db-pool-config.ts`). If a
   long-running scheduled job (email automation, table sync, AI risk
   scoring) is holding all 10 clients, the next request will block in
   `pool.connect()`. Symptom: `slow_field_settings_save` spikes
   correlate with scheduler kicks every minute. **Fix:** raise the
   ceiling without a code change by setting the `DB_POOL_MAX` env var
   on your hosting platform (e.g. `DB_POOL_MAX=25`) and restarting the
   container. Accepted range is 1–1000; values above 1000 are clamped
   to 1000, and non-numeric / missing / zero / negative values fall
   back to 10. For how to pick the ceiling relative to Postgres'
   `max_connections` (per-replica formula and worked examples), see
   [Tuning the database connection pool → Picking a number](./self-hosting.md#tuning-the-database-connection-pool)
   in the self-hosting guide — that is the same anchor the Database
   Health tab's "raise `DB_POOL_MAX`" hint links to, so renaming the
   section forces both call sites to update together. Confirm the new
   value took effect by grepping the boot log for the
   `[DB] Connection pool max=…` line — the trailing tag reads
   `(default; DB_POOL_MAX unset)`, `(override: DB_POOL_MAX=N)` when
   the parse was clean, or
   `(override: DB_POOL_MAX=<raw> → <resolved>)` when the value was
   coerced (so a typo is loud at boot rather than silent). If raising the pool doesn't
   help, the next step is to move the heavy jobs off the request
   pool (a separate dedicated pool, or a worker process).

2. **DB cold start.** Bundled Postgres on the same host should respond
   in single-digit ms, but a managed serverless DB (Neon, Supabase Free,
   etc.) can take several seconds to wake from idle. CriteriaIQ already
   uses the Neon driver when the URL contains `?driver=neon` or matches
   the Neon hostname pattern. Confirm with the DB provider's slow-query
   log.

3. **Long-running boot seed leaking into request handling.** Boot seeds
   and backfills (`backfillFieldSettingsDefaults`, `seedSystemTags`,
   etc.) run **before** `server.listen()` in `server/index.ts`, so by
   the time port 5000 is open they are already done. They cannot
   block a request mid-session. They CAN, however, delay the first
   request after a deploy: if Traefik is configured to send traffic to
   the upstream the moment the container is up but before the listener
   is bound, the user sees `502 Bad Gateway` (not 504) for ~30–60s.
   The Dockerfile `HEALTHCHECK` `start-period=90s` exists for this
   reason; if your Dokploy template is bypassing it, add a Traefik
   load-balancer health check pointing at `/api/setup/status`.

## Recommended Traefik snippet for Dokploy

Drop this into your Dokploy compose template (alongside the standard
`traefik.enable=true` labels) for a known-good baseline:

```yaml
services:
  app:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.criteriaiq.rule=Host(`your-domain.com`)"
      - "traefik.http.routers.criteriaiq.entrypoints=websecure"
      - "traefik.http.routers.criteriaiq.tls.certresolver=letsencrypt"
      - "traefik.http.routers.criteriaiq.service=criteriaiq"
      - "traefik.http.services.criteriaiq.loadbalancer.server.port=5000"
      - "traefik.http.services.criteriaiq.loadbalancer.healthcheck.path=/api/setup/status"
      - "traefik.http.services.criteriaiq.loadbalancer.healthcheck.interval=30s"
      - "traefik.http.services.criteriaiq.loadbalancer.serversTransport=criteriaiq-transport"
      - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.responseHeaderTimeout=60s"
      - "traefik.http.serversTransports.criteriaiq-transport.forwardingTimeouts.dialTimeout=30s"
```

After applying, reload Traefik (or redeploy the stack) and re-test
saving the Stretch ranking color. The save should round-trip in well
under a second. If the `slow_field_settings_save` warning starts
appearing, jump to Step 3.

## Recommended Traefik labels for Dokploy "Application" (Dockerfile) app type

If your Dokploy app type is **Application** (Dockerfile build) rather
than **Compose**, the YAML snippet above does not apply directly.
Dokploy auto-generates the router rule, the entry point, the TLS
certificate resolver, and the `traefik.enable=true` label from the
**Domains** tab in the app's settings — duplicating those labels
manually produces undefined behaviour (depending on Dokploy version,
the router ends up defined twice and Traefik silently drops one of
the definitions). Only the service-port, LB-healthcheck, and
serversTransport-timeout labels need to be added by hand, in
**Advanced → Labels**.

Paste the following six lines into Dokploy → app → **Advanced → Labels**,
with `<service>` substituted for the Traefik service name Dokploy
auto-generated for this app:

```
traefik.http.services.<service>.loadbalancer.server.port=5000
traefik.http.services.<service>.loadbalancer.healthcheck.path=/api/setup/status
traefik.http.services.<service>.loadbalancer.healthcheck.interval=30s
traefik.http.services.<service>.loadbalancer.serversTransport=<service>-transport
traefik.http.serversTransports.<service>-transport.forwardingTimeouts.responseHeaderTimeout=60s
traefik.http.serversTransports.<service>-transport.forwardingTimeouts.dialTimeout=30s
```

Note the format: bare `key=value` per line, **no** leading hyphen and
**no** surrounding quotes — that is the format Dokploy's Labels panel
expects. (The YAML-list-of-strings format from the snippet above is
only for `docker-compose.yml`, which Application-type apps do not
read.)

### How to find `<service>`

Three options, easiest first:

1. Open the Traefik dashboard (typically `https://traefik.<your-domain>`
   on a standard Dokploy install) → **HTTP → Services**. Look for the
   entry whose URL ends in `:5000`. The service name is the part
   before `@docker`.
2. From the Dokploy host shell:

   ```
   docker inspect <container-name> | grep 'traefik.http.routers' | head -1
   ```

   The `service=` value in the matched label is the name to use.
3. Or just guess: Dokploy v0.5+ derives the service name from
   `<project-slug>-<app-slug>`. After redeploying with the guess in
   place, verify via step 1.

### What this fixes

| Label                                                                                              | Without it                                                                                                                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loadbalancer.server.port=5000`                                                                    | Traefik defaults to the container's first `EXPOSE`d port. Already `5000` here, so cosmetic — but explicit beats implicit when debugging.                  |
| `loadbalancer.healthcheck.path=/api/setup/status` + `loadbalancer.healthcheck.interval=30s`        | Cold-start **502 Bad Gateway** for ~12–60 s on every redeploy until something forces a routing-table refresh (e.g. a manual restart). This is the one. |
| `serversTransport.forwardingTimeouts.responseHeaderTimeout=60s`                                    | **504 Gateway Timeout** on slow admin saves (Field Settings) — the original symptom Step 1 was written for.                                               |
| `serversTransport.forwardingTimeouts.dialTimeout=30s`                                              | Spurious 502 if the upstream momentarily drops a TCP connection during boot under high load.                                                              |

### Verifying the fix

Anchor `t = 0` at the moment Dokploy starts the redeploy (i.e. the
first log line in the new container — typically
`[DB] Connection pool max=10`).

1. In the Dokploy log viewer, watch the app log for the line
   `serving on port 5000`. On a typical install this lands at
   roughly `t + 12 s` (DB pool → migrations → seeders → listener);
   on a cold Neon branch (which has to wake from idle) it can
   stretch to ~`t + 25 s`. This is the moment the listener is bound
   and `/api/setup/status` starts returning 200.
2. From the Dokploy host:

   ```
   curl -fsS http://localhost:5000/api/setup/status
   ```

   This should return `200 OK` by `t + 15 s` on a warm DB and by
   `t + 30 s` on a cold Neon branch. (Same anchor as Step 1 — `t = 0`
   at redeploy start.) This curl bypasses Traefik entirely, so a
   non-200 here means the listener did not bind and the bug is
   app-side, not Traefik-side.
3. From the public domain:

   ```
   curl -I https://<your-domain>/api/setup/status
   ```

   This should return `HTTP/2 200` within ~30 s of the listener
   coming up — that is the worst case for Traefik's healthcheck loop
   to notice the upstream is now healthy and put the route back into
   service. If it keeps returning 502 for more than ~60 s after the
   app log shows `serving on port 5000`, the labels did not take —
   recheck the `<service>` substitution (step "How to find
   `<service>`" above) and confirm Dokploy's **Advanced → Labels**
   field actually saved your paste.

### Why both deploy modes work with the same labels

The `loadbalancer.healthcheck.path=/api/setup/status` probe returns
200 in both supported deploy modes the moment `server.listen()` binds,
which is what makes a single label set sufficient regardless of which
mode the operator picks:

- **Fresh DB / first-run wizard mode** — deploy with no pre-existing
  database. The first-run wizard at `/setup` collects admin
  credentials and calls `/api/setup/initialize`, which shells out to
  `npx drizzle-kit push --force` to build the schema (this is why
  `drizzle-kit` is intentionally a runtime dependency in the
  Dockerfile, not a build-only one). `/api/setup/status` is the
  endpoint the wizard itself polls, so it is alive from the first
  millisecond after `server.listen()`.
- **Existing DB mode** — point `DATABASE_URL` at an already-populated
  Postgres (e.g. a Neon branch holding a dump of the live DB). The
  migrations runner detects already-applied migrations and the
  seeders short-circuit with lines like
  `All N migration(s) already applied — nothing to do.` in the boot
  log. `server.listen()` then binds and `/api/setup/status` starts
  returning 200 — the same readiness signal as the wizard path.

No mode-specific labels or branching is needed.
