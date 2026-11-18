# Native Ubuntu install (scaffolding)

> **Status: scaffolding / non-binding.** The supported install path is still
> `docker compose up -d --build` (see [`../self-hosting.md`](../self-hosting.md)).
> The artifacts in this folder exist so the team can evaluate a Docker-free
> deployment to a fresh Ubuntu LTS host. They are not wired into CI, are not
> referenced by any lint gate, and can be deleted without affecting the app.

## What this is

Three files that, together, install CriteriaIQ on a blank Ubuntu 22.04 or
24.04 LTS server without Docker:

| File | Purpose |
|---|---|
| [`install-ubuntu.sh`](install-ubuntu.sh) | Idempotent installer. Updates the OS, hardens it, installs Node 24 + Chromium + (optionally) PostgreSQL, creates a system user, clones the repo, builds, generates secrets, and enables the systemd unit. |
| [`criteriaiq.service`](criteriaiq.service) | Hardened systemd unit template. Runs `node dist/index.js` as an unprivileged user with strict namespace isolation. |
| `README.md` (this file) | Walkthrough, hardening notes, reverse-proxy templates, update/rollback runbook, and the differences vs. the Docker path. |

## Two different "users" to keep straight

The install flow involves two completely separate accounts that share the
word "user." They never overlap and serve different purposes:

| | Linux **system user** (`criteriaiq`) | App **admin user** |
|---|---|---|
| **Where it lives** | `/etc/passwd` on the Ubuntu host | `users` table in PostgreSQL |
| **Created by** | `install-ubuntu.sh` (Phase 4 — `useradd --system`) | The in-app setup wizard at `/setup` (or via `BOOTSTRAP_ADMIN_*` env vars) |
| **Has a password?** | No (`--shell /usr/sbin/nologin`) | Yes (bcrypt-hashed) |
| **Can SSH or log in?** | No | N/A — logs in to the web UI only |
| **What it's used for** | Owning the app files and running `node dist/index.js` under systemd | Signing in to CriteriaIQ as a human, managing projects, configuring settings |
| **Equivalent in Docker path** | The `node` user inside the runtime image (see `Dockerfile`'s `USER node` directive) | Same — the wizard works identically in both deployment modes |

**Why the OS account exists:** running long-lived web processes as `root`
is the textbook way to turn an application bug into a host compromise.
The `criteriaiq` system user is unprivileged, has no shell, and is
sandboxed further by the systemd unit's `NoNewPrivileges`,
`ProtectSystem=strict`, and `RestrictNamespaces` directives. If the Node
process is ever exploited, the attacker lands on a powerless account
instead of the host's root.

**Why the app admin is separate:** it's a row in the database, not an OS
account. It has an email, a password, MFA enrolment, RBAC role
assignments — the whole identity stack the application manages.
Multiple human admins can exist; only one Linux system user runs the
service.

The install sequence: the script creates the **OS account** and starts
the service → you open `http://<host>:5000/setup` in a browser → the
wizard creates the **app admin user**. The two are independent and
neither knows the other exists.

## Prerequisites

- Ubuntu **22.04 LTS** or **24.04 LTS** (other distros may work; they're not tested).
- A user with `sudo` (the script must run as root — `sudo bash install-ubuntu.sh`).
- A public hostname with DNS pointing at the host (recommended — needed for
  TLS via Caddy / NGINX / Traefik).
- 2 vCPU, 4 GB RAM, 20 GB disk minimum. The build itself peaks around 2 GB
  of RSS; the running server stays under 1 GB.
- Outbound HTTPS to `deb.nodesource.com` and your Git remote.

## One-shot install (interactive)

```bash
# On a fresh Ubuntu host:
sudo apt-get update && sudo apt-get -y install git
git clone https://github.com/your-org/criteriaiq.git /tmp/criteriaiq
sudo bash /tmp/criteriaiq/docs/guides/native-install/install-ubuntu.sh
```

The script will prompt three times:

1. **Apply OS hardening?** — enables `unattended-upgrades` (daily security
   patches) and UFW (only 22, 80, 443 inbound). Decline with `n` or pass
   `--no-harden` if you manage these via cloud-init / Ansible.
2. **PostgreSQL choice:**
   - `1` — install PostgreSQL 16 locally on this host. The script generates
     a random password and writes the connection string to `/etc/criteriaiq/env`.
   - `2` — paste an existing `DATABASE_URL` (managed Postgres on Neon,
     Supabase, RDS, etc.).
   - `3` — skip; you'll set `DATABASE_URL` in `/etc/criteriaiq/env` yourself
     before starting the service.
3. **Continue on non-Ubuntu?** — only fires if the OS isn't recognized as
   Ubuntu.

When it completes, browse to `http://<host>:5000/setup` and walk the
in-app wizard. The wizard is identical to the Docker path — same encryption
key handling, same first-admin flow, same Drizzle migration step.

### Cleanup after install

The `git clone https://.../criteriaiq.git /tmp/criteriaiq` step above is
**only there to fetch the install script**. The script itself does the
real clone into `/opt/criteriaiq` (Phase 5), so the `/tmp` copy serves
no further purpose once the script has finished.

It is *not* deleted automatically. Ubuntu's `systemd-tmpfiles-clean.timer`
will eventually sweep it (default policy: files older than 10 days), but
clean it up explicitly once the service is healthy:

```bash
# Confirm the service is up first
sudo systemctl status criteriaiq

# Then remove the bootstrap clone
sudo rm -rf /tmp/criteriaiq
```

Leaving it in place is harmless — it's a ~50 MB shallow clone with no
secrets — but removing it keeps the host's state matching what's
documented and avoids confusion later about which copy of the repo is
the live one (`/opt/criteriaiq` is; `/tmp/criteriaiq` was scaffolding).

### Dry run

```bash
sudo bash install-ubuntu.sh --dry-run
```

Prints every action without changing anything. Useful for review or for
forking the script to a different OS.

### Override defaults

All paths and the repo URL are environment-variable-driven:

```bash
sudo INSTALL_DIR=/srv/criteriaiq \
     DATA_DIR=/srv/criteriaiq-data \
     REPO_URL=https://github.com/your-fork/criteriaiq.git \
     REPO_REF=v0.7.20 \
     bash install-ubuntu.sh
```

See the top of `install-ubuntu.sh` for the full list of variables.

## OS hardening detail

When you accept hardening, the script:

- Installs `unattended-upgrades` and `apt-listchanges` and runs
  `dpkg-reconfigure -f noninteractive unattended-upgrades` so Ubuntu's
  default security-only auto-update policy is active.
- Installs and enables `ufw` with: deny all incoming, allow outgoing,
  permit 22 (SSH), 80 (HTTP), 443 (HTTPS). Port 5000 is **not** exposed —
  put a reverse proxy in front (see below).

Hardening you should layer on top, outside this script:

- **SSH keys only.** Disable password auth in `/etc/ssh/sshd_config`
  (`PasswordAuthentication no`), then `systemctl restart ssh`.
- **fail2ban.** `apt-get install fail2ban` blocks brute-force SSH attacks
  with sensible defaults out of the box.
- **Non-default SSH port** if your environment expects it. Update the UFW
  rule accordingly.
- **Subscribe to Ubuntu USN.** `sudo ua attach <token>` if you have an
  Ubuntu Pro subscription — gives you the additional `esm-apps` and
  `esm-infra` channels.

## Reverse proxy

Port 5000 is bound to `0.0.0.0` by the systemd unit. **Don't expose it
directly to the internet** — terminate TLS at a reverse proxy.

### Caddy (simplest — auto-TLS via Let's Encrypt)

```caddy
your-domain.com {
    reverse_proxy 127.0.0.1:5000 {
        # Match the upstream timeouts the Docker / Traefik path uses
        # (see docs/guides/dokploy-traefik-timeouts.md).
        transport http {
            response_header_timeout 60s
            dial_timeout            30s
        }
    }
    encode gzip
}
```

Install: `sudo apt-get install caddy && sudo nano /etc/caddy/Caddyfile`,
then `sudo systemctl reload caddy`. Caddy auto-issues and renews the cert.

### NGINX

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    client_max_body_size 50m;

    location / {
        proxy_pass         http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";

        # Match the Traefik timeouts used in the Docker path so admin
        # writes (e.g. saving Field Settings) do not get clipped.
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
```

Use `certbot --nginx -d your-domain.com` for the cert.

### Traefik

If you run Traefik on the same host outside Docker, point a router at
`http://127.0.0.1:5000` and copy the `serversTransport` block from
[`../dokploy-traefik-timeouts.md`](../dokploy-traefik-timeouts.md) to
raise `responseHeaderTimeout` to 60s.

## Service operations

```bash
# Status + recent logs
sudo systemctl status criteriaiq
sudo journalctl -u criteriaiq -n 200 --no-pager

# Tail live
sudo journalctl -u criteriaiq -f

# Restart after a config change
sudo systemctl restart criteriaiq

# Disable autostart (e.g. while debugging)
sudo systemctl disable criteriaiq
```

The service environment lives in `/etc/criteriaiq/env` (mode 0640, owned
`root:criteriaiq`). To rotate `SESSION_SECRET` or `ENCRYPTION_KEY`, edit
the file and `systemctl restart criteriaiq` — note that rotating
`ENCRYPTION_KEY` invalidates previously stored secrets (API keys, encrypted
recovery codes), so plan that change carefully.

## Updating to a new release

```bash
cd /opt/criteriaiq
sudo -u criteriaiq git fetch --depth 1 origin v0.7.21
sudo -u criteriaiq git checkout v0.7.21
sudo -u criteriaiq npm ci --legacy-peer-deps
sudo -u criteriaiq npm run build
sudo -u criteriaiq npm prune --omit=dev --legacy-peer-deps
sudo systemctl restart criteriaiq
```

Drizzle migrations run automatically on first request via the setup
wizard's `npx drizzle-kit push --force` step the same way as in the
Docker image.

### Rollback

The simplest rollback is a `git checkout` of the previous tag plus another
`npm ci && npm run build && systemctl restart`. For a faster rollback path,
deploy into versioned directories (`/opt/criteriaiq-releases/v0.7.20`,
`v0.7.21`, …) and flip an `/opt/criteriaiq` symlink — the systemd unit
follows the symlink, so `ln -sfn .../v0.7.20 /opt/criteriaiq && systemctl
restart criteriaiq` is a sub-second swap.

## Backups

Two paths matter:

- **`/var/lib/criteriaiq/data`** — `db-config.json` (encrypted bootstrap
  state) plus the wizard's session/encryption material. Lose this and the
  app can no longer decrypt at-rest secrets.
- **`/var/lib/criteriaiq/uploads`** — user-uploaded files (logos, project
  attachments).
- **PostgreSQL** — if you chose option `1`, dump with
  `sudo -u postgres pg_dump criteriaiq | gzip > criteriaiq-$(date +%F).sql.gz`.

Pair these with `/etc/criteriaiq/env` (held separately — it's a secret) and
you have a complete restore set.

## Differences vs. the Docker path

| Concern | Docker path | Native path |
|---|---|---|
| Process supervisor | `tini` PID 1 inside container | `systemd` on the host |
| Chromium for PDF rendering | Bundled into image | `apt-get install chromium-browser` |
| Postgres | Bundled `postgres:16-alpine` service | Optional local install via `apt-get`, or external |
| Volumes | Named Docker volumes (`app_data`, `app_uploads`) | Plain host directories under `/var/lib/criteriaiq/` |
| Secrets | Compose `environment:` block / Dokploy UI | `/etc/criteriaiq/env` (mode 0640) |
| Reverse proxy | Traefik via Dokploy/Coolify labels | Caddy / NGINX / standalone Traefik |
| Updates | `docker compose pull && up -d` | `git pull && npm ci && npm run build && systemctl restart` |
| Rollback | Tag the previous image | Symlink-swap to the previous release dir |
| Build memory ceiling | 2 GB (matches the deploy host) | 2 GB (same — build is identical) |
| Type-checking in build | Skipped (memory) | Skipped (same reason) |

The application code is identical in both paths. The build chain is
identical. The 15 lint gates run identically. This is purely a deployment
mechanism difference.

## Troubleshooting

### `chromium-browser` is missing or under a different path

Ubuntu 22.04 ships Chromium as a Snap by default. The script installs the
classic `chromium-browser` deb. If you've replaced it with the Snap, set
`PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium` in `/etc/criteriaiq/env`
and restart. Verify with `sudo -u criteriaiq /usr/bin/chromium-browser
--version`.

### Service starts then exits with `EACCES`

`ProtectSystem=strict` in the unit file makes `/` read-only except the
explicit `ReadWritePaths`. If you changed `DATA_DIR` or `UPLOADS_DIR`
without updating the unit, requests that try to write upload bytes will
fail. Edit `/etc/systemd/system/criteriaiq.service`, fix the
`ReadWritePaths` line, then `systemctl daemon-reload && systemctl restart
criteriaiq`.

### Port 5000 reachable from the internet

UFW only opens 22/80/443. If you can reach 5000 directly, your provider's
firewall is permitting it independently of UFW (Hostinger / DigitalOcean /
AWS panel firewalls). Lock that down at the provider level too.

### `npm run build` fails with `JavaScript heap out of memory`

The build target peaks around 2 GB. On a 2 GB host you'll OOM. Either
upgrade to 4 GB temporarily for the build, add a 2 GB swapfile
(`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile &&
swapon /swapfile`), or build elsewhere and rsync `dist/` over.

### The wizard says `database migration failed`

Drizzle runs `npx drizzle-kit push --force` against an empty database on
first start. If your `DATABASE_URL` points at a Postgres user without
`CREATE` permission on the target database, this fails. Grant the user
`ALL PRIVILEGES ON DATABASE criteriaiq` (option `1` in the installer does
this automatically) or use a superuser-like role for the wizard step, then
downgrade afterwards.

## Promoting this from scaffolding to supported

Before this path becomes a first-class option alongside Docker, the
following items need to be tracked:

1. CI smoke test — provision a fresh Ubuntu 24.04 cloud-init VM, run
   `install-ubuntu.sh`, hit `/api/setup/status` until 200, run a
   sanity-check API call, tear down. Could live as a workflow gated on
   changes under `docs/guides/native-install/**`.
2. Version pinning — the script currently tracks `main`. The supported
   variant should default to the latest tag from `version.json`.
3. Multi-distro testing — at least Debian 12 and one RHEL-family release.
4. A `lint:native-install` shell-check that runs `shellcheck` on
   `install-ubuntu.sh` and `systemd-analyze verify` on the unit file.
5. A documented promotion of `REPO_URL` from a placeholder to the
   canonical repo URL, and inclusion in `docs/docs-manifest.ts` so the
   in-app docs surface picks this guide up.

Until those land, treat the files in this folder as a working draft.
