# Database Connection Manager

## Overview

The Database Connection Manager is a system settings feature that allows administrators to manage named PostgreSQL connections, test connectivity, and switch the active database — all from within the CriteriaIQ UI. It also includes a first-boot setup wizard for fresh installs where no database is pre-configured.

The bootstrap file and setup wizard apply to every install (VPS, Docker, or any other host).

### Key Capabilities

- **Named connection library** — store multiple PostgreSQL URLs encrypted at rest
- **Connection testing** — test any stored connection and see latency in milliseconds
- **One-click activation** — promote a stored connection to active; writes to bootstrap config and requires restart
- **First-boot wizard** — when no database URL exists, a guided setup wizard runs instead of the main app
- **Bootstrap file override** — active connection is persisted in `/data/db-config.json`, read before any DB access

---

## Connection Resolution

The bootstrap file is checked first, then `DATABASE_URL`. Activate writes to the file and triggers a restart. The setup wizard appears if no connection source is available.

---

## User Guide

### Accessing the Feature

Navigate to **Config > System Settings > Database Connection** in the sidebar.

### Adding a Connection

1. Click **Add Connection**
2. Enter a **Name** (e.g. "Production", "Staging", "Neon Dev")
3. Paste the full **PostgreSQL Connection URL** (stored encrypted)
4. Optionally add **Notes**
5. Click **Save Connection**

The URL is stored encrypted with AES-256-GCM — it cannot be read back through the UI, only the masked preview is shown.

### Testing a Connection

Click the **Test** button next to any connection. A live test is performed and the result (success + latency in ms, or error message) appears inline for 6 seconds. The result is also persisted to the record and shown as a badge afterward.

### Activating a Connection

Click **Activate** next to any non-active connection.

This:

1. Decrypts the stored URL
2. Encrypts and writes it to `/data/db-config.json` (the bootstrap config file)
3. Marks the record as `isActive = true`
4. Returns a **Restart Required** banner

Click **Restart Server** in the amber banner. The server restarts and on the next boot it reads the new connection URL from the file before connecting to any database.

> **Note:** The application will be briefly unavailable during restart (typically 2-5 seconds).

### Editing a Connection

Click the **pencil icon** next to any connection. You can update the name, notes, or connection URL. Leave the URL field blank to keep the existing encrypted value unchanged.

### Deleting a Connection

Click the **trash icon**. The active connection cannot be deleted — activate another connection first.

---

## First-Boot Setup Wizard

When CriteriaIQ starts with no database connection available (no `DATABASE_URL` environment variable and no `/data/db-config.json` file), the server enters **Setup Mode** and serves a three-step wizard instead of the main application.

### Step 1: Connect

Enter a PostgreSQL connection URL and click **Test Connection**. The server attempts a real connection and reports success with latency, or the specific error. You cannot proceed until the test passes.

### Step 2: Initialize

Click **Initialize Database** to write the connection URL to the bootstrap config file. The schema is created automatically on the next server start.

### Step 3: Launch

Click **Launch Application** to restart the server. A countdown timer counts down from 8 seconds, then redirects to the main application login page.

---

## UI Reference

### Status Banner

At the top of the Database Connection section, a green dot banner shows the **current active source**:

| Source label | Meaning |
|---|---|
| Environment variable (DATABASE_URL) | Server is using the `DATABASE_URL` env var set on the host |
| Bootstrap Config File | Server is using `/data/db-config.json` |

### Connection Card Fields

| Field | Description |
|---|---|
| Name | Human-readable label |
| URL preview | Masked connection string (e.g. `postgresql://****@host:5432/db`) |
| Active badge | Shown when this connection is the one marked active |
| Last tested | Latency in ms + pass/fail + time ago |

### Restart Required Banner

Appears in amber after activating a connection. Contains a **Restart Server** button that calls the restart API and reloads the page after 3 seconds.

---

## API Reference

All endpoints require authentication. Admin role required for write operations.

### `GET /api/db-connections`

Returns all stored connections with masked URLs.

**Response:**
```json
{
  "connections": [
    {
      "id": 1,
      "name": "Production",
      "connectionUrlPreview": "postgresql://****@host:5432/db",
      "isActive": true,
      "notes": null,
      "lastTestedAt": "2026-02-26T10:00:00Z",
      "lastTestSuccess": true,
      "lastTestLatencyMs": 42,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

### `POST /api/db-connections`

Add a new connection. Admin only.

**Body:** `{ name, connectionUrl, notes? }`

### `PUT /api/db-connections/:id`

Update name, notes, and optionally connection URL. Admin only.

**Body:** `{ name, notes?, connectionUrl? }`

### `DELETE /api/db-connections/:id`

Delete a connection. Returns 400 if the connection is currently active. Admin only.

### `POST /api/db-connections/:id/test`

Test a stored connection by decrypting and attempting a real `SELECT 1` query. Updates `lastTestedAt`, `lastTestSuccess`, and `lastTestLatencyMs`.

**Response:** `{ success: boolean, latencyMs: number, error?: string }`

### `POST /api/db-connections/:id/activate`

Mark connection as active and write it to `/data/db-config.json`. Admin only.

**Response:** `{ success: true, restartRequired: true, message: "..." }`

### `POST /api/db-connections/test-url`

Test an ad-hoc (unsaved) connection URL. Used by the setup wizard.

**Body:** `{ connectionUrl }`

### `POST /api/db-connections/restart`

Restart the server process. Admin only. Calls `process.exit(0)`; the process manager restarts the server.

---

## Troubleshooting

### "Connection failed" when testing

- Verify the URL format: `postgresql://user:password@host:5432/database`
- Check that the host is accessible from the server (firewall/VPC rules)
- For Neon, verify the project is active and the connection string includes `?sslmode=require`
- Timeout is 8 seconds; slow cold-starts on serverless DBs may cause false failures

### Activation succeeded but restart did not apply the new database

- Verify the `/data/` directory exists and is writable by the server process
- Check that `ENCRYPTION_KEY` is set and consistent between restarts — if it changes, the bootstrap config cannot be decrypted
- Review server startup logs for `readBootstrapConfig` errors

### Setup wizard does not appear

- The setup wizard only appears when no database is configured
- The bootstrap config file at `/data/db-config.json` takes precedence over the env var — delete the file if you want to force setup mode

### Schema errors after switching databases

- The new database must be empty or compatible; the server calls all `initialize*Table()` functions on startup which use `CREATE TABLE IF NOT EXISTS` — they are safe to run on existing schemas
