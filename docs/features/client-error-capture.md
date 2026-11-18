# Client Error Capture & Audit Log

How CriteriaIQ catches bugs that happen in the user's browser, what it
records, and how operators see and manage that record.

> **Audience:** developers adding new error sources, and admins
> reviewing/clearing the captured-errors log surface.

---

## What gets captured

Three layers of the React client funnel into the same capture path:

| Source | Trigger | Captured context |
|---|---|---|
| **Global window error handler** | Uncaught synchronous JS errors (`window.addEventListener('error', …)`) | `'JavaScript Error'` |
| **Global unhandled-rejection handler** | Promises that reject without a `.catch()` | `'Unhandled Promise Rejection'` |
| **React Error Boundary** | A child component throws during render or lifecycle | `'React Error Boundary'` |
| **React Query mutation handler** | Any global mutation's `onError` fires | mutation-supplied context |

Alongside the error itself, two ambient buffers are captured and attached
to every report (see [Breadcrumbs & console buffer](#breadcrumbs--console-buffer)):

- **Breadcrumbs** — the user's last ~25 actions (navigations, clicks,
  fetch/mutation failures) before the error, so the log shows *what led
  up to* the failure, not just the crash itself.
- **Console buffer** — the last ~50 `console.*` lines, so warnings and
  diagnostics the app logged right before the error are preserved.

Filtered out **before** capture (so they never reach the log):
- WebSocket errors (`event.isTrusted === true && event.type === 'error'`)
- Vite HMR / dev-only errors (stack includes `@vite/client` or `/@vite/`)
- 8 low-signal canned messages — `'non-error promise rejection captured'`, `'script error'`, `'network error'`, `'loading chunk'`, `'loading css chunk'`, `'failed to fetch'`, `'authentication timeout'`, `'websocket closed'`

Filtered out **at the POST step** (captured locally but not sent to the server):
- Errors that happened on `/setup` (the wizard runs before auth)
- `503` / `401` responses against `/api/error-logs` itself (don't retry-spam a server that's rejecting)
- `401` on `/api/auth/user` (the pre-login auth probe is expected to 401)

---

## What gets stored

### Client-side (browser)
`localStorage` key `app_errors`:
- Keeps the **last 10 errors**, total size capped at **1 MB**
- Older entries dropped when the cap is hit
- Useful as a fallback inspection surface if the server is unreachable

### Server-side (database)
Table `client_error_logs` ([`shared/schema/misc.ts`](../../shared/schema/misc.ts)):

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `errorId` | varchar(255) NOT NULL | Format: `err_<ms-timestamp>_<random>` |
| `timestamp` | timestamp DEFAULT now() | |
| `context` | varchar(500) | Where the error was caught |
| `userId` | varchar(255) | Session user or `"Anonymous"` |
| `message` | text | Truncated to 10,000 chars |
| `stack` | text | Truncated to 10,000 chars |
| `url` | text | Truncated to 2,000 chars |
| `userAgent` | text | Truncated to 1,000 chars |
| `appVersion` | varchar(50) | **Server-stamped** build the error came from (from `version.json` via `getVersionInfo()`). Tells a current-build error apart from one a stale browser tab threw against an old build. |
| `httpStatus` | integer | HTTP status for API/query errors. The client always sent it; the v1 schema dropped it on insert. NULL for non-HTTP errors. |
| `errorHash` | varchar(64) | sha256 of `(context + message + first app/asset stack frame)`. Identical errors share a hash so the viewer can de-duplicate and count occurrences. **Indexed** (`idx_client_error_logs_error_hash`). |
| `details` | jsonb | Structured metadata (see below) |

Indexes: `(timestamp DESC)` for the list view, `(user_id)` for per-user
filters, and `(error_hash)` for the de-duplicated/grouped viewer query.

#### The `details` JSONB payload

Larger/array context that doesn't warrant its own column rides in
`details`. Beyond any caller-supplied fields, the server enriches every
row on ingest with:

| Key | Source | Notes |
|---|---|---|
| `resolvedStack` | server (on ingest) | Source-map de-minified stack — readable `client/src/...:line:col` frames. Omitted when no maps resolve (dev / sourcemaps off). See [Source maps & privacy](#source-maps--privacy-model). |
| `breadcrumbs` | client | Last ~25 user actions: `{ t (ISO), type, detail }`, `type ∈ navigate \| click \| fetch-error \| mutation`. No input values; all strings truncated. Server keeps the last 25. |
| `consoleLogs` | client | Last ~50 console entries: `{ t (ISO), level, text }`, `level ∈ log \| info \| warn \| error \| debug`. Server keeps the last 50. |
| `buildDate`, `gitCommit`, `environment` | server | Build metadata from `version.json`. |
| `serverReceivedAt` | server | ISO timestamp of the server insert. |

> The React component stack appended by the Error Boundary still rides in
> the `stack` column (`logError` joins it under a `--- React component
> stack ---` separator) — that behavior is unchanged from v1.

---

## Source maps & privacy model

Production client bundles are content-hashed and minified, so a raw
logged frame like `…/assets/config-DGP6sHOc.js:1:15033` is unreadable.
v2 de-minifies these **server-side**, without ever exposing source to the
browser:

- **Hidden source maps.** The client is built with Vite
  `build.sourcemap: "hidden"` ([`vite.config.ts`](../../vite.config.ts)).
  This emits a `*.js.map` next to each hashed chunk in
  `dist/public/assets/` but adds **no** `//# sourceMappingURL` comment, so
  browsers never request the maps.
- **Maps are never served.** A guard in
  [`server/vite.ts`](../../server/vite.ts) `serveStatic` returns `404` for
  any public `.map` request before the static handler can answer it, so
  original source can't be downloaded.
- **Server-only de-minification.** On every `POST /api/error-logs`,
  [`server/lib/sourcemap-resolver.ts`](../../server/lib/sourcemap-resolver.ts)
  reads the relevant map from `dist/public/assets` and rewrites each
  minified `…/assets/<chunk>.js:line:col` frame to its original
  `client/src/...` position, stored as `details.resolvedStack`.
- **No third-party dependency.** It uses Node's built-in `module.SourceMap`.
  Parsed maps are cached for the process (chunks are immutable per build).
- **Fully best-effort.** If maps are absent (dev, or sourcemaps disabled)
  the resolver returns `null` and the raw minified stack is kept.

Net effect: operators get readable stacks in the audit log, while end
users (and anyone else) can never fetch the original source.

---

## Breadcrumbs & console buffer

Client-side capture lives in
[`client/src/lib/breadcrumb-tracker.ts`](../../client/src/lib/breadcrumb-tracker.ts) —
two module-scope ring buffers (25 breadcrumbs, 50 console lines). It is
strictly defensive: capturing a breadcrumb or console entry must never
throw or alter normal app behavior, and **input values are never
recorded** — only element labels/roles, all truncated.

- `installConsoleCapture()` — monkey-patches `console.log/info/warn/error/debug`
  to push a truncated entry into the buffer, then always calls through to
  the original (so console output is unchanged).
- `installGlobalClickBreadcrumbs()` — a single capture-phase document
  click listener that records the nearest button/link label
  (`data-testid` → `aria-label` → text, never input values).
- `recordNavigationBreadcrumb(path)` — route changes.
- `recordBreadcrumb(type, detail)` — used by the React Query client to
  record `fetch-error` and `mutation` failures.

Wiring:
- `installConsoleCapture()` + `installGlobalClickBreadcrumbs()` are called
  at startup in
  [`global-error-handler.tsx`](../../client/src/components/errors/global-error-handler.tsx),
  alongside `setupGlobalErrorHandling()`.
- Route breadcrumbs are recorded from the wouter `useLocation` effect in
  [`client/src/App.tsx`](../../client/src/App.tsx).
- `logError` (`error-utils.ts`) reads both buffers and attaches
  `breadcrumbs` + `consoleLogs` to the POST body.

---

## Pipeline at a glance

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                     │
│                                                             │
│  console.* ───────────► console ring buffer (last 50)       │
│  clicks / nav / fetch ─► breadcrumb ring buffer (last 25)   │
│                                                             │
│  unhandled error  ─┐                                        │
│  rejected promise ─┼──► setupGlobalErrorHandling()          │
│  component crash  ─┼──► ErrorBoundary.componentDidCatch     │
│  mutation onError ─┘                                        │
│         │                                                   │
│         ▼                                                   │
│  logError(err, context)  ◄── client/src/lib/error-utils.ts  │
│         │  (+ attaches breadcrumbs + consoleLogs)           │
│         │                                                   │
│         ├──► localStorage["app_errors"]  (last 10, 1 MB)    │
│         │                                                   │
│         └──► POST /api/error-logs        (skip on /setup +  │
│                       │                   on 401/503 self) │
└───────────────────────┼─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ Server (server/routes/audit-and-reports-routes.ts)                 │
│                                                             │
│  POST   /api/error-logs        rate-limit 100/hr/user       │
│                                truncate; compute errorHash;  │
│                                stamp appVersion + build meta │
│                                from version.json; keep        │
│                                httpStatus; de-minify stack    │
│                                (sourcemap-resolver) →         │
│                                details.resolvedStack;         │
│                                INSERT into client_error_logs  │
│                                                             │
│  GET    /api/error-logs?limit  admin-only, newest first,    │
│                                leftJoin users, returns up    │
│                                to 500 rows (each with a      │
│                                resolved `user` object)       │
│                                                             │
│  GET    /api/error-logs/count  admin-only, COUNT(*)         │
│                                (KPI tile on Support &        │
│                                Features)                     │
│                                                             │
│  DELETE /api/error-logs        admin-only, wipes the table  │
└─────────────────────────────────────────────────────────────┘

  Plus, in server/services/health-monitor.ts:
    getClientErrorsHealth() → COUNT(*) of client_error_logs,
    folded into GET /api/system/health as the "Client Errors"
    System Health card (error when count > 0).
```

---

## What operators see

Three surfaces in the admin UI:

1. **KPI tile** — `About → Support & Features` header.
   The "Client Errors" tile (red, bug icon) shows the live row count.
   Refetched every 60 s. Click to jump into the Error Audit Log
   sub-tab. **Admin role only.**

2. **Error Audit Log table** — `About → Support & Features → Error Audit Log`.
   Latest 500 rows, severity-classified (Critical / High / Medium / Low),
   per-row "File as Support Request" button that opens a pre-filled
   support dialog. "Clear All" wipes the table after a confirmation
   prompt. **Admin role only.**

   The **User column resolves the raw session id to a real name**:
   `GET /api/error-logs` leftJoins `users.id = client_error_logs.user_id`
   and the cell renders "First Last" → email → raw id → "Anonymous" → "—"
   in that fallback order. The join is LEFT so anonymous, sentinel
   (`'Anonymous'`), and deleted-user rows still surface. Search also
   matches the resolved name/email, not just the raw id.

   v2 adds, to the same table:
   - A sortable **Version** column showing the `appVersion` the row was
     captured against (blank for pre-v2 rows).
   - An **HTTP status** badge from `httpStatus` — color-coded 5xx red /
     4xx amber / neutral for everything else.
   - A **"Group identical" toggle**. When on, rows that share the same
     non-null `errorHash` collapse into a single row carrying an
     occurrence count (`×N`) and a distinct-user count; the representative
     row shown is the most recent occurrence. Grouping is done client-side
     from the fetched rows, **null-hash rows are never merged**, and
     toggling resets to page 1.

   The **expanded detail panel** (per row) now shows, in order:
   - **Resolved stack (source-mapped)** — the readable `client/src/...`
     frames from `details.resolvedStack`, shown *above* the raw stack.
   - **Build** — version / git commit / environment / build date.
   - **HTTP status** — the color-coded badge.
   - **Breadcrumbs** — a timeline of the recent user actions, oldest →
     newest.
   - **Console** — the captured console buffer, color-coded by level.
   - The existing **raw stack**, **user-agent**, and **details-JSON**
     sections.
   - For a grouped row, it also lists **all occurrences** and notes that
     the detail shown is the most recent one.

3. **System Health card** — `Configuration → System Health → Overview`.
   The "Client Errors" tile counts the same `client_error_logs` rows
   and shows **error** (red) status whenever the count is > 0, rolling
   into the headline Healthy / Warnings / Errors strip. Clicking it
   deep-links to the Error Audit Log. This card is visible to **every
   System Health viewer**, not just admins — the count itself is not
   sensitive, though the underlying audit log remains admin-only.
   Sits alongside the sibling Feature Requests (warning > 0) and
   Support Requests (error > 0) demand cards.

---

## Retention & limits

- **No automatic retention policy.** Rows persist until manually cleared.
- **Server-side rate limit:** 100 errors per hour per user. Excess POSTs
  return `{ received: true, throttled: true }` and are silently dropped
  before insert.
- **Breadcrumb / console caps:** the client buffers the last **25**
  breadcrumbs and **50** console lines; the server defensively re-caps to
  the last 25 / 50 on insert. Breadcrumb details truncate at 200 chars,
  console text at 500.
- **Fresh-install reset:** on the first boot of a new install (defined as
  "no approved admin exists yet"), the bootstrap path clears any
  leftover rows in `client_error_logs`. This handles the case of
  pointing a new install at a database that previously hosted a
  dev/test install — operators expect the audit log to start empty.
  See [`server/auth/admin-bootstrap.ts`](../../server/auth/admin-bootstrap.ts) →
  `clearClientErrorLogsIfFreshInstall()`.

---

## Adding a new error source

If you're adding code that catches an error you want surfaced in the
audit log, call `logError()` from `client/src/lib/error-utils.ts` with
a stable context string. The helper handles localStorage rotation,
attaching breadcrumbs + console buffer, the server POST, and the
skip-server-log filter.

```ts
import { logError } from '@/lib/error-utils';

try {
  await riskyOperation();
} catch (err) {
  logError(err, 'Risky Operation Context');
  // …local UI handling
}
```

Use a **short, stable, human-readable** context string — it becomes
the badge in the audit log's "Context" column and the filter dropdown
groups errors by it. It also feeds the `errorHash` fingerprint, so a
stable context keeps identical errors grouping together. Avoid dynamic
strings (e.g. user IDs) in the context — those go in `details` instead.

If your error carries an HTTP status, set it on the thrown error's
`status` field — the POST handler reads it into the `httpStatus` column.

---

## Related files

| Concern | File |
|---|---|
| Capture helper | [`client/src/lib/error-utils.ts`](../../client/src/lib/error-utils.ts) (`logError`, `setupGlobalErrorHandling`) |
| Breadcrumb + console buffer | [`client/src/lib/breadcrumb-tracker.ts`](../../client/src/lib/breadcrumb-tracker.ts) (ring buffers, console/click capture) |
| Error boundary | [`client/src/components/errors/error-boundary.tsx`](../../client/src/components/errors/error-boundary.tsx) |
| Global handler wiring | [`client/src/components/errors/global-error-handler.tsx`](../../client/src/components/errors/global-error-handler.tsx) |
| Route breadcrumbs | [`client/src/App.tsx`](../../client/src/App.tsx) — `recordNavigationBreadcrumb` in the `useLocation` effect |
| Source-map de-minifier | [`server/lib/sourcemap-resolver.ts`](../../server/lib/sourcemap-resolver.ts) (`resolveMinifiedStack`, Node `module.SourceMap`) |
| Hidden source maps (build) | [`vite.config.ts`](../../vite.config.ts) — `build.sourcemap: "hidden"` |
| `.map` block (never served) | [`server/vite.ts`](../../server/vite.ts) — `serveStatic` 404s public `.map` requests |
| Server routes | [`server/routes/audit-and-reports-routes.ts`](../../server/routes/audit-and-reports-routes.ts) — search for `/api/error-logs` |
| Schema | [`shared/schema/misc.ts`](../../shared/schema/misc.ts) — `clientErrorLogs` table |
| Migration (create) | [`migrations/020_create_client_error_logs.sql`](../../migrations/020_create_client_error_logs.sql) |
| Migration (v2 columns) | [`migrations/066_error_audit_log_v2_columns.sql`](../../migrations/066_error_audit_log_v2_columns.sql) — `app_version`, `http_status`, `error_hash` + hash index |
| Audit log UI | [`client/src/components/about/ErrorAuditLogTab.tsx`](../../client/src/components/about/ErrorAuditLogTab.tsx) |
| KPI tile | [`client/src/components/about/SupportFeaturesTab.tsx`](../../client/src/components/about/SupportFeaturesTab.tsx) — search for `kpi-client-errors` |
| System Health card | [`server/services/health-monitor.ts`](../../server/services/health-monitor.ts) — `getClientErrorsHealth()`; rendered by [`SystemHealthSection.tsx`](../../client/src/components/configuration/SystemHealthSection.tsx) |
| Fresh-install clear | [`server/auth/admin-bootstrap.ts`](../../server/auth/admin-bootstrap.ts) — `clearClientErrorLogsIfFreshInstall` |
