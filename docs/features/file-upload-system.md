# File Upload System

## Overview

CriteriaIQ uses a provider-agnostic, quarantine-first file upload pipeline. All uploads pass through a validation chain before being stored to the active cloud provider. Supported providers: **Google Cloud Storage (GCS)**, **AWS S3**, **Azure Blob Storage**, and **local disk** (development/fallback).

---

## Architecture

```
Client → Multer (quarantine/) → Magic bytes check → SHA-256 hash
       → ClamAV scan → Upload to active provider → DB record insert
```

### Key Files

| File | Purpose |
|---|---|
| `server/lib/upload-processor.ts` | Quarantine-first pipeline orchestrator |
| `server/lib/upload-config.ts` | Allowed types, size limits, path helpers |
| `server/lib/cloud-storage.ts` | Multi-provider StorageDriver implementation |
| `server/lib/virus-scanner.ts` | ClamAV integration with graceful fallback |

---

## Storage Provider Priority

At startup and whenever admin saves a new configuration, the driver initialises in this order:

| Priority | Source | When Used |
|---|---|---|
| 1 | **DB config** (`storage_configuration` table, `enabled = true`) | Admin configured via UI |
| 2 | **Environment variables** | No DB config found |
| 3 | **Local disk** (`attached_assets/`) | No cloud config found |

---

## Provider Credential Reference

### Google Cloud Storage (GCS)

**Environment variables:**
```
GCS_BUCKET_NAME         — name of the GCS bucket (required)
GCS_KEY_JSON            — inline service account JSON string (preferred)
GOOGLE_APPLICATION_CREDENTIALS — path to key file (alternative to GCS_KEY_JSON)
```

**DB config fields:**
- `gcsBucketName` — bucket name
- `gcsKeyJson` — encrypted inline service account JSON

If `gcsKeyJson` is empty, GCS falls back to Application Default Credentials (ADC).

---

### AWS S3

**Environment variables:**
```
AWS_S3_BUCKET           — bucket name (required)
AWS_REGION              — AWS region, e.g. us-east-1 (required)
AWS_ACCESS_KEY_ID       — IAM access key ID (required)
AWS_SECRET_ACCESS_KEY   — IAM secret access key (required)
```

**DB config fields:**
- `awsBucketName`, `awsRegion`
- `awsAccessKeyId` (encrypted), `awsSecretAccessKey` (encrypted)

URLs are generated as **presigned S3 URLs** (default expiry: 60 minutes).

---

### Azure Blob Storage

**Environment variables:**
```
AZURE_STORAGE_ACCOUNT   — storage account name (required)
AZURE_STORAGE_CONTAINER — container name (required)
AZURE_STORAGE_KEY       — account key (required OR use SAS token)
AZURE_STORAGE_SAS_TOKEN — SAS token (alternative to account key)
```

**DB config fields:**
- `azureAccountName`, `azureContainerName`
- `azureAccountKey` (encrypted), `azureSasToken` (encrypted)

URLs are generated as **Blob SAS URLs** (default expiry: 60 minutes) when an account key is available. If only a SAS token is present, a direct URL is returned.

---

### Local Disk (development / fallback)

Files are stored in `attached_assets/<objectKey>` and served via:
```
GET /api/files/:key     — authenticated route, path-traversal protected
```

No configuration required. Used automatically when no cloud provider is configured.

---

## Credential Encryption

All sensitive fields in the `storage_configuration` table are encrypted at rest using **AES-256-GCM** via `encryptText()` / `decryptText()` from `server/auth/mfaUtils.ts`.

- Key: `ENCRYPTION_KEY` environment variable (64 hex characters = 32 bytes)
- Encrypted fields: `gcsKeyJson`, `awsAccessKeyId`, `awsSecretAccessKey`, `azureAccountKey`, `azureSasToken`
- Masked fields are never sent to the client — the UI displays `••••••••` for any saved credential

---

## Object Key Path Structure

All providers share the same structured path conventions:

| Context | Path Pattern |
|---|---|
| Documents | `accounts/{accountId}/documents/{filename}` |
| Customer logos | `accounts/{accountId}/logo/{filename}` |
| Email assets | `system/email-assets/{filename}` |
| Rich-text images | `system/rich-text/{filename}` |
| Support attachments | `system/support-attachments/{filename}` |
| Quarantine (local only) | `attached_assets/quarantine/{uuid}` |

Path builder helpers live in `server/lib/upload-config.ts`:
```typescript
buildDocumentPath(accountId, filename)
buildLogoPath(accountId, filename)
buildEmailAssetPath(filename)
buildRichTextPath(filename)
buildSupportPath(filename)
```

---

## File Validation Pipeline

1. **Extension + size check** — `validateFileAllowed()` checks against `ALLOWED_TYPES`, `BLOCKED_EXTENSIONS`, and per-context size limits
2. **Magic bytes check** — `validateMagicBytes()` reads file header bytes and compares to known signatures
3. **SHA-256 hash** — `hashFile()` for deduplication and audit
4. **ClamAV scan** — `scanFile()` via local ClamAV daemon; fails open if daemon is offline
5. **Cloud upload** — `uploadFile()` delegates to the active `StorageDriver`

SVG uploads are also cleaned by `sanitizeSvg()` (`server/lib/svg-sanitizer.ts`), which strips scripts, event handlers, `javascript:` links, `<foreignObject>` and external `<use>` refs, repeating until a pass removes nothing. `GET /api/files/:key` sends `X-Content-Type-Options: nosniff` on every file and, for SVGs, a `Content-Security-Policy` with no script and `sandbox`, so an SVG opened directly can't run script on the app's origin.

### Size Limits

| Context | Limit |
|---|---|
| Documents (PDF, Word, Excel, PPT) | 10 MB |
| Images (PNG, JPG, WEBP, GIF) | 5 MB |
| Logos | 5 MB |
| Support attachments | 5 MB |

### Blocked Types

Archive files are explicitly blocked: `.zip`, `.rar`, `.7z`, `.tar`, `.gz`, `.bz2`, `.xz`

---

## Virus Scanning (ClamAV)

### How It Works

Virus scanning is performed by `server/lib/virus-scanner.ts` using the [`clamscan`](https://www.npmjs.com/package/clamscan) npm package. The scanner prefers the ClamAV daemon (`clamdscan`) over the CLI scanner for performance.

| Connection method | Default value |
|---|---|
| Unix socket (preferred) | `/var/run/clamav/clamd.ctl` |
| TCP fallback | `127.0.0.1:3310` |

The daemon is initialised once at first use and cached for the lifetime of the process.

---

### Graceful Fallback (Development)

If the ClamAV daemon is not running, the scanner **fails open** — uploads still succeed and scanning is silently skipped. This is intentional so the development environment works without requiring ClamAV to be installed.

The initialization result is cached, so you will see this log message once (on the first upload attempt) when the daemon is absent:

```
[virus-scanner] ClamAV not available — virus scanning is DISABLED.
To enable, install and start the ClamAV daemon (clamd).
```

**This is expected and not an error in development.** No action is required unless you are preparing a production deployment.

---

### Threat Detection

When ClamAV _is_ running and detects an infected file:

- `scanFile()` returns `{ clean: false, reason: "<virus name>" }`
- The upload pipeline rejects the file immediately and removes it from quarantine storage
- The `scan_status` column is set to `blocked` or `quarantined` and `quarantine_reason` records the virus name
- The client receives a `422` response with a rejection message

When the file is clean, `scanFile()` returns `{ clean: true }` and the pipeline continues to cloud upload.

If the daemon times out or disconnects mid-scan, the scanner also fails open with a console error, so a transient daemon crash does not block all uploads.

---

### DB Tracking

Scan results are persisted on the `documents` table. See the [DB Record Columns](#db-record-columns) section for the full column list. Relevant columns:

| Column | Values | Description |
|---|---|---|
| `scan_status` | `pending` / `clean` / `blocked` / `quarantined` | Set by the pipeline after scanning |
| `scanned_at` | timestamp | Time the scan completed |
| `quarantine_reason` | virus name or block reason | Populated only when `scan_status` is not `clean` |

---

### Enabling ClamAV in Production

No code changes are needed. The scanner initialises lazily on first use and auto-detects the daemon socket automatically.

**Debian / Ubuntu (including Azure VM / container):**

```bash
apt-get update
apt-get install -y clamav clamav-daemon
freshclam           # update virus definitions
service clamav-daemon start
```

**Verify the socket exists:**

```bash
ls /var/run/clamav/clamd.ctl
```

Once the daemon is running you will see this in the application log instead of the disabled warning:

```
[virus-scanner] ClamAV initialized successfully
```

**Source file:** `server/lib/virus-scanner.ts`

---

## Admin Configuration UI

Provider setup is in **System Health → Storage** tab:

1. **Provider Setup** — tabbed credential form for GCS / AWS / Azure / Local, enable/disable toggle, Save button
2. **Test Connection** — fires a write/read/delete round-trip against the active provider, returns pass/fail with latency
3. **Migrate Legacy Files** — scans `uploads_customerlogo/`, `uploads_documents/`, `uploads_email/` and re-uploads each file to the active provider using structured paths

**API endpoints (admin only):**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/storage/config` | Returns masked config + active provider |
| POST | `/api/admin/storage/config` | Saves encrypted config, reinitialises driver |
| POST | `/api/admin/storage/test` | Runs round-trip test against active provider |
| POST | `/api/admin/storage/migrate-legacy` | Migrates legacy files to current provider |

---

## Legacy File Migration

Legacy upload directories from before the structured path system are migrated with
entity-aware DB record updates:

| Source directory | Object key template | DB table updated |
|---|---|---|
| `uploads_documents/` | `accounts/{customerId}/documents/{filename}` (or `system/documents/{filename}` if no customer) | `documents.gcsPath`, `documents.storedPath` |
| `uploads_customerlogo/` | `accounts/{customerId}/logo/{filename}` | `customers.logoUrl` |
| `uploads_email/` | `system/email-assets/{filename}` | *(no DB rows — system files)* |

Migration is **idempotent**: documents already pointing at a non-local `gcsPath` are skipped,
and logos whose `logoUrl` is already a cloud-hosted URL are skipped.

Use the **Migrate Legacy Files** button in the Storage Health admin panel, or call `POST /api/admin/storage/migrate-legacy`. Legacy files are **not** deleted from disk automatically — review the migration report before removing them.

---

## DB Record Columns

Uploaded file records in the `documents` table include:

| Column | Description |
|---|---|
| `gcs_path` | Object key (same format across all providers) |
| `file_hash` | SHA-256 hex string |
| `sensitivity_label` | `internal` / `confidential` / `public` |
| `scan_status` | `pending` / `clean` / `blocked` / `quarantined` |
| `quarantine_reason` | Virus name or block reason |
| `scanned_at` | Timestamp of last scan |
| `deleted_at` | Soft-delete timestamp |

---

## Environment Variables Summary

```bash
# Storage provider selection (env var fallback)
GCS_BUCKET_NAME=
GCS_KEY_JSON=
GOOGLE_APPLICATION_CREDENTIALS=

AWS_S3_BUCKET=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

AZURE_STORAGE_ACCOUNT=
AZURE_STORAGE_CONTAINER=
AZURE_STORAGE_KEY=
AZURE_STORAGE_SAS_TOKEN=

# Encryption (required for DB-backed credentials + MFA)
ENCRYPTION_KEY=<64 hex characters>
```

---

*Documented: March 31, 2026 — Virus Scanning section added March 31, 2026*
