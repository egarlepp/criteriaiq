# Local Dev Server Setup

This guide explains how to run CriteriaIQ locally on Windows for development and visual troubleshooting. Each step is here because something real went wrong without it.

---

## Prerequisites

- **Node.js 24+** — check with `node --version`. Matches the production Docker image and CI; Salesforce features (jsforce → undici 8) don't load on Node 20.
- **Rancher Desktop** (or Docker Desktop) — needed for the local Postgres container
- Rancher Desktop must be **running** before you start. It takes ~80 seconds to be ready after launch.

---

## One-time setup

### 1. Install dependencies

Run from the repo root (wherever you cloned it — the clone path varies by machine, so nothing in the local setup hardcodes it):

```bash
npm install --no-audit --no-fund --legacy-peer-deps
```

### 2. Start the local Postgres container

```powershell
docker run -d `
  --name criteriaiq-dev-db `
  -e POSTGRES_USER=criteriaiq `
  -e POSTGRES_PASSWORD=devpassword `
  -e POSTGRES_DB=criteriaiq `
  -p 5432:5432 `
  --restart unless-stopped `
  postgres:16
```

Wait for it to be ready:

```powershell
docker exec criteriaiq-dev-db pg_isready -U criteriaiq
# Should print: /var/run/postgresql:5432 - accepting connections
```

### 3. Create `.env` in the repo root

The server reads env vars via `node --env-file`. Create `.env` in the repo root:

```env
DATABASE_URL=postgresql://criteriaiq:devpassword@localhost:5432/criteriaiq?sslmode=disable
NODE_ENV=development
PORT=5000
PUBLIC_APP_URL=http://localhost:5000

# Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
SESSION_SECRET=<96-hex-char string>

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64-hex-char string>

# Auto-creates an admin user on first boot if none exists
BOOTSTRAP_ADMIN_EMAIL=admin@criteriaiq.local
BOOTSTRAP_ADMIN_PASSWORD=Admin1234!
BOOTSTRAP_ADMIN_NAME=Dev Admin
```

> **Important:** `.env` is gitignored. Never commit it. It holds dev secrets.

### 4. Push the schema

```bash
npm run db:push
```

This creates all tables in the local database. Only needed once (or after schema changes).

---

## Starting the server

### Via the Claude preview tool

The `.claude/launch.json` in the active worktree is configured for Windows. Start with:

```
preview_start "App (full-stack)"
```

This runs:
```
node --env-file=.env --import tsx/esm server/index.ts
```

from the repo root. The `--env-file` path is relative on purpose — an absolute path breaks as soon as the repo is cloned anywhere else.

> **Worktrees:** `.env` is gitignored, so a fresh worktree under `.claude/worktrees/<name>/` won't have one. Copy the repo-root `.env` into the worktree before running `preview_start`. `node_modules` are resolved up the directory tree, so no separate install is needed per worktree.

### Manually (PowerShell)

```powershell
cd <repo-root>
node --env-file=.env --import tsx/esm server/index.ts
```

---

## First login

After a clean start, the bootstrap admin is auto-created on first boot:

- **URL:** `http://localhost:5000`
- **Email:** `admin@criteriaiq.local`
- **Password:** `Admin1234!`

You'll see `[admin-bootstrap] ✅ Created bootstrap admin from environment` in the server log confirming creation.

---

## Visual troubleshooting workflow (Claude)

For inspecting UI issues with Claude:

1. Start server via `preview_start "App (full-stack)"`
2. Open Chrome → navigate to `http://localhost:5000`
3. Activate the **Claude in Chrome** browser extension
4. Navigate to the page with the issue — Claude can see screenshots and interact with the DOM

Claude can make code changes and the Vite HMR layer hot-reloads frontend changes without a restart.

---

## Known gotchas

### `data/db-config.json` overwrites `DATABASE_URL`

The app writes an encrypted copy of the active DB URL to `data/db-config.json` on first successful boot. On subsequent boots this file takes **priority over the `.env` DATABASE_URL**. The file is gitignored and environment-specific.

**If the server connects to the wrong database:** delete `data/db-config.json` and restart. The server will re-read from `.env`.

The decryption uses `ENCRYPTION_KEY`. If that key is missing or wrong, `decryptUrl` silently returns the raw ciphertext as the URL, producing nonsensical connection errors like `ENOTFOUND base`. Always ensure `ENCRYPTION_KEY` is set in `.env`.

### `reusePort` on Windows

`server.listen({ reusePort: true })` throws `ENOTSUP` on Windows. The codebase conditionally skips `reusePort` on `win32` — no action needed, already fixed.

### Rancher Desktop vs Docker Desktop

Either works — the `docker` CLI comes from whichever one is installed. If `docker` commands fail with `failed to connect to the docker API`, the daemon isn't running. Start the app and wait for it to be ready (~80 seconds for Rancher Desktop).

```powershell
# Docker Desktop:
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# — or Rancher Desktop:
Start-Process "C:\Program Files\Rancher Desktop\Rancher Desktop.exe"
# Poll until ready:
while (-not (docker info 2>$null)) { Start-Sleep 5 }
```

### Port 5000 already in use

```powershell
$p = Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object -ExpandProperty OwningProcess -First 1
Stop-Process -Id $p -Force
```

### `db-config.json` recreated on every boot

The server saves its active connection to `data/db-config.json` as part of bootstrap. This is expected. As long as `ENCRYPTION_KEY` stays constant in `.env`, subsequent boots decrypt and use it correctly.

---

## Resetting to a clean state

```powershell
# Delete runtime state
Remove-Item "data\db-config.json" -Force -ErrorAction SilentlyContinue

# Wipe and recreate the database
docker rm -f criteriaiq-dev-db
docker run -d --name criteriaiq-dev-db -e POSTGRES_USER=criteriaiq -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=criteriaiq -p 5432:5432 --restart unless-stopped postgres:16
npm run db:push
```
