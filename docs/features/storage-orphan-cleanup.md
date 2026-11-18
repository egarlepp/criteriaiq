# Spec — Generic orphan-file cleanup in Storage Health

> Status: **Not started** — captured 2026-06-18 as a follow-up from the Storage Health drill-down work in PR #163.
> Branch (suggested): `feat/storage-orphan-cleanup` off `main`.

## Why this exists

CriteriaIQ's storage layer has three places where DB rows hold a path or URL that points into the storage pipeline (`/api/files/...`, GCS, AWS, disk):

1. `customers.logo_url` + `customers.logo_size` — account logo blob
2. `branding_assets` rows — system branding (login_logo, sidebar logo, page background)
3. `documents.gcs_path` + `documents.file_size` — uploaded documents

When the underlying file is deleted manually (e.g. a legacy cleanup pass that swept Internal-branded assets, or an admin replacing a file outside the upload UI), the DB metadata isn't updated. Storage Health → Storage Path Conventions then shows phantom byte counts that can't be resolved when the admin clicks the drill-down.

We hit this with customer #31 (Internal) on 2026-06-18: `logo_url` pointed to `accounts/logos/Internal_Logo_Blue_1780442641641_2696e9d22873.png`, which 404'd against `/api/files/`, but the rollup reported 23.15 KB. We manually cleared it via SQL (`UPDATE customers SET logo_url = NULL, logo_size = NULL WHERE id = 31`). This spec is for making that repeatable & visible.

## What to build

### Backend

New storage mixin under `server/storage/orphans.ts` (or extend `server/storage/branding.ts` — it already owns the branding-asset orphan logic that's the template here).

- **`scanCustomerLogoOrphans(): Promise<Array<{ customerId, accountName, logoUrl, logoSize, resolves: boolean }>>`** — for every `customers` row with `logo_url IS NOT NULL`, check whether the resolved path returns content via the same fallback chain `/api/files` uses (files-DB → cloud driver → disk under `attached_assets/`+`uploads/`). Use the existing `cloud-storage.ts` helpers + `files-db.ts` `getUploadedFile` so the check matches the real `/api/files` lookup, not a guess.
- **`scanDocumentOrphans(): Promise<Array<{ documentId, gcsPath, fileSize, customerId, resolves: boolean }>>`** — same logic for `documents` rows where `deleted_at IS NULL AND gcs_path IS NOT NULL`. Soft-deleted docs are out of scope.
- **`scanFilesDbOrphans(): Promise<Array<{ objectKey, sizeBytes, referencedBy }>>`** — reverse direction: every `uploaded_files` row whose `object_key` has NO referring DB row. Easy detect for standard prefixes; flag everything under `system/` as `'unknown'` rather than auto-deleting, since seeders / system-bootstrap may legitimately produce keys with no DB row.

Existing `branding_assets` orphan logic is in `server/storage/branding.ts` — reuse it; the new mixin should compose with it, not duplicate it.

### Admin routes (extend `server/routes/admin-storage-routes.ts`)

- **`GET /api/admin/storage/orphans`** returns:
  ```ts
  {
    customerLogos: Array<{ customerId, accountName, logoUrl, logoSize }>,
    documents:     Array<{ documentId, gcsPath, fileSize, customerId? }>,
    filesDbOrphans: Array<{ objectKey, sizeBytes, prefix }>,
    brandingOrphans: <existing shape from branding.ts>,
    summary: { totalCount, totalReclaimableBytes }
  }
  ```

- **`POST /api/admin/storage/orphans/cleanup`** with body:
  ```ts
  {
    customerLogos: number[],      // customer IDs whose logo_url/logo_size to NULL
    documents:     number[],      // document IDs to soft-delete (set deleted_at = now())
    filesDbKeys:   string[],      // object_keys to DELETE from uploaded_files (hard)
    brandingIds:   number[],      // branding_assets row IDs to clean up
  }
  ```

  Performs the cleanup transactionally. Asymmetric retention:
  - Customer logos → NULL the metadata; the actual blob (if any) is dealt with by the files-DB cleanup section.
  - Documents → **soft-delete** (`deleted_at = now()`) — a missing file may be a temporary upload-pipeline outage, never hard-delete.
  - Files-DB orphans → **hard-delete** the row from `uploaded_files` (the blob is the bytes; there's no other recovery path).
  - Branding → defer to the existing helper.

  Log every action via the existing audit-log helper.

Admin-only on both. Cap scan at 1000 rows per category to bound runtime.

### Frontend (`client/src/components/configuration/system-health/StorageHealthTab.tsx`)

- New **"Orphaned Storage"** card under the existing Files Database card. Hidden when the scan reports 0 orphans.
- Tabbed sections (Customer Logos / Documents / Files DB / Branding) with row list + per-row checkbox.
- Summary banner: *"12 orphaned references / 47.3 MB potentially reclaimable"* with a single **"Clean Up Selected"** action button.
- Confirmation dialog (use the shared `ConfirmationDialog` component) before any cleanup runs — explicitly call out that document orphans are soft-deleted (recoverable) and files-DB orphans are hard-deleted (not recoverable).
- After cleanup, invalidate the storage-health query so byte counts refresh.
- All strings go through `t()` — i18n keys under `storage.orphans.*` in `client/src/locales/en-US.json`.

### Verification

- Manual: seed a customer-logo orphan (`UPDATE customers SET logo_url = '/api/files/accounts/nope.png', logo_size = 1234 WHERE id = <some id>`), run the scan, confirm it appears, hit cleanup, confirm the row is NULLed and the Customer Logos rollup goes to 0.
- Same dry-run for documents (insert a `documents` row with a bogus `gcs_path`).
- Same for files-DB orphans (manually `INSERT INTO uploaded_files` with no `documents/customers/branding` referrer).
- Run the lint subset before push (see CLAUDE.md "Mandatory pre-push verification").
- No schema change; confirm `lint:schema` passes.

### Out of scope

- Hard-deleting `documents` rows (soft-delete only).
- Auto-running on a schedule.
- Cleaning up `attached_assets/` files on disk that have no DB referrer (that's the "legacy disk junk" cleanup, a separate concern).
- Reaping the actual blob from cloud storage when a customer-logo orphan was previously resolvable — that's a separate "actually free the bytes" pass.

## Specific data-audit pass needed alongside this feature

While the generic scanner is being built, also reap one known class of stale URL that's hitting the UI today:

**Edit Project page → "Account & Company Logo"** field renders a 404 broken image whenever the project's `customers.logo_url` (or the project's denormalized `projects.customer_logo` copy) points at a file that was swept during a prior maintenance pass (the most common is the Internal-asset cleanup that deleted everything under `attached_assets/system/branding/` and `accounts/logos/`). We patched the symptom with an `onError` fallback in `client/src/components/project-form/EssentialsSection.tsx` (PR for v0.7.51) so the form gracefully shows "No logo available" instead of a broken image, but the data underneath still drifts.

The scanner's customer-logo pass should:

- Detect every `customers` row whose `logo_url` 404s against `/api/files`.
- Detect every `projects` row whose `customer_logo` value 404s **AND** whose linked customer's `logo_url` is either NULL or different — these are denormalized copies that never got refreshed when the customer's logo was changed/deleted.
- Cleanup action: NULL both columns. Surface the customer name + project ID list in the report so the admin understands what they're clearing.

This isn't speculative — it's exactly the case we just hit live (Walmart project on deployed env, 2026-06-18). The component-level `onError` is a band-aid; the scanner is the durable fix.

## Why we didn't build it inline with PR #163

The drill-down work in PR #163 made this *visible* (the Customer Logos row finally shows whether the file resolves). The actual cleanup mechanism is independent, additive, and has its own surface area (admin route + UI card + i18n + tests). Bundling would have bloated #163 well past its existing scope.
