# Database Connection Architecture

## The Problem

Relying only on a single PostgreSQL connection string provided via the `DATABASE_URL` environment variable creates two problems:

1. **Host dependency** — changing the database means editing the host's environment variables and redeploying.
2. **The chicken-and-egg problem** — to allow the database URL to be configurable through a UI, you need a database connection to read the configuration. But you cannot connect to the database without already knowing the URL.

---

## Connection Sources

Every install resolves its database the same way:

| Capability | Behavior |
|---|---|
| Bootstrap config file | Read first at startup |
| `DATABASE_URL` env var | Fallback after the file |
| Setup wizard | Shown when no source is available |
| Activate action | Writes to the file + requires restart |
| Restart endpoint | Calls `process.exit(0)` |

---

## The Chicken-and-Egg Problem

Standard configuration approaches (e.g. storing the connection string in the database itself) fail at startup: the app needs to know which database to connect to before it can query anything. There is no "before the database" place to read configuration in a purely DB-backed system.

The solution is a **two-layer configuration architecture** where Layer 1 (file-based) exists outside the database and is read first.

---

## Two-Layer Configuration Architecture

### Layer 1: Bootstrap Config File (`/data/db-config.json`)

- **What it is:** A JSON file on the local filesystem containing an encrypted PostgreSQL connection URL.
- **When it is read:** At process startup, before any database connection is attempted.
- **Format:** `{ "connectionUrl": "<AES-256-GCM encrypted>", "updatedAt": "<ISO timestamp>" }`
- **Encryption:** Uses the same `ENCRYPTION_KEY` environment variable as backup destinations and MFA secrets.
- **Who writes it:** The "Activate" action in the Database Connection UI, and the first-boot setup wizard.
- **Location:** `<cwd>/data/db-config.json` — the `/data/` directory is created automatically if it doesn't exist.

### Layer 2: `db_connections` Database Table

- **What it is:** A table in the active PostgreSQL database storing named, encrypted connection strings.
- **When it is read:** After the server is fully started with an active DB connection, via the `/api/db-connections` endpoint.
- **Purpose:** Provides the UI to add, test, and manage connections before deciding which to activate.
- **Contents:** name, encrypted URL, isActive flag, test history, timestamps.

---

## Full Startup Sequence

```
Server starts
     |
     v
Read /data/db-config.json          <- Layer 1 check
     |
     +-- File exists + decrypts OK?
     |       |
     |       v YES
     |   Use decrypted URL, source = "file", dbReady = true
     |
     +-- NO (file missing / decryption failed)
             |
             v
         DATABASE_URL set?          <- Env fallback
             |
             +-- YES -> Use env var, source = "env", dbReady = true
             |
             +-- NO -> dbReady = false, SETUP MODE
                     |
                     v
                 Server serves only /api/setup/* routes
                 All other /api/* routes return 503
                 Client redirects to /setup wizard
                     |
                     +-- User completes wizard:
                         POST /api/setup/initialize -> writes db-config.json
                         POST /api/setup/restart -> process.exit(0)
                         Process manager restarts server
                         Server reads file -> full boot
```

---

## Bootstrap Flow Details

**`server/db-bootstrap.ts`** — the bootstrap module:

- `resolveConnectionUrl()` — returns `{ url, source }` using the full resolution chain
- `readBootstrapConfig()` — reads and decrypts the file, returns URL string or `null`.
- `writeBootstrapConfig(url)` — encrypts and writes; creates `/data/` if needed
- `clearBootstrapConfig()` — deletes the file (used for testing / reset)
- `bootstrapConfigExists()` — returns `true` if the file is present

**`server/db.ts`** — uses `resolveConnectionUrl()` from the bootstrap module:

```typescript
const resolved = resolveConnectionUrl();
export const dbReady = resolved.url !== null;
export const dbSource = resolved.source;
export const pool = dbReady ? new Pool({ connectionString: resolved.url }) : null;
export const db = dbReady ? drizzle({ client: pool, schema }) : null;
```

When neither source yields a URL, `dbReady` is `false` and the server boots into setup mode.

**`server/index.ts`** — guards the main route registration:

```typescript
if (!dbReady) {
  // mount /api/setup/* handlers only via setup-routes.ts
  // serve setup wizard via Vite/static
  return; // skip registerRoutes() and all table initialization
}
// normal boot: registerRoutes(), initializeAllTables(), etc.
```

---

## Setup Mode API

When `dbReady === false`, only these endpoints are available:

| Endpoint | Description |
|---|---|
| `GET /api/setup/status` | Returns `{ setupRequired, dbConfigured, dbReachable, adminExists, ... }` |
| `POST /api/setup/test-connection` | Test a URL with a temporary pool |
| `POST /api/setup/initialize` | Verify connection and write URL to `/data/db-config.json` |
| `POST /api/setup/restart` | Call `process.exit(0)` for restart |

All other `/api/*` routes return `503 { setupRequired: true, message: "..." }`.

The client detects the 503 response in the auth hook and redirects to `/setup`.

---

## Security Model

**Encryption:** AES-256-GCM with a random 12-byte IV per write. Ciphertext format: `<iv_hex>:<ciphertext_hex>:<authTag_hex>`.

**Key source:** `ENCRYPTION_KEY` environment variable, expected as a 32-byte hex string. This is the same key used for backup destination URLs and MFA recovery codes.

**Implications:**
- If `ENCRYPTION_KEY` changes between writes and reads, the bootstrap config file cannot be decrypted — the server will fall back to `DATABASE_URL` or setup mode.
- Connection URLs are never returned in plaintext via any API endpoint — only a masked preview (password replaced with `****`) is shown.
- The `/data/db-config.json` file should be excluded from version control (add `/data/` to `.gitignore`).

---

## Schema Migration Strategy

When a new database is activated and the server restarts, the startup sequence calls all `initializeXTable()` functions which execute `CREATE TABLE IF NOT EXISTS` statements. This is safe to run against:

- A **fresh empty database** — creates all tables
- An **existing database with the schema already applied** — no-ops due to `IF NOT EXISTS`
- A **partially initialized database** — creates only the missing tables

No destructive migrations are performed automatically. Additive schema changes (new columns, new tables) are deployed via the same `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern used throughout the application.

---

## Restart Mechanism

**Why a restart is required:** The application creates a `Pool` of database connections at startup. Swapping the active database at runtime would require:

1. Draining and closing the existing pool
2. Re-creating the pool with the new URL
3. Re-initializing all storage objects and route handlers

This is complex and error-prone — especially with in-flight requests and cached query plans. A clean restart guarantees a fresh pool with the correct URL and is the standard approach for database failover in Node.js applications.

**How it works:** `process.exit(0)` — most process managers restart the process automatically when it exits with code 0.

**Client behavior:** The UI calls `POST /api/db-connections/restart`, then reloads the page after 3 seconds.

---

## Future Considerations

- **Migration runner UI** — a future tab could allow running pending Drizzle migrations against the active or a target database directly from the UI.
- **Read replica support** — a `role` field (`primary` / `replica`) could route read queries to replicas and write queries to the primary.
- **Connection health monitoring** — a background job could periodically test all stored connections and surface failures as dashboard alerts.
- **Multi-tenant routing** — for SaaS deployments, the `db_connections` table could be extended with a `tenantId` field to route each tenant to their own database at the storage layer.
- **Import/export** — allow exporting connection entries (names only, no URLs) for documentation; importing with a URL prompt.
