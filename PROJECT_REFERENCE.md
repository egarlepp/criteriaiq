# CriteriaIQ — Project Reference

> **What this file is:** the conventions and architecture reference for
> CriteriaIQ: how the app is built, the rules every change follows, and where
> things live. It is not a feature catalogue or a roadmap.
>
> | Looking for | Go to |
> |---|---|
> | How a feature works | [`docs/features/`](docs/features/) (one doc per feature) |
> | What changed in a release | In-app Change Log (`client/src/components/about/ChangeLogDrawer.tsx`) |
> | What is planned or deferred | [`docs/plans/backlog.md`](docs/plans/backlog.md) and the sweep plans in [`docs/plans/`](docs/plans/) |
> | Goals, stakeholders, milestones | [`docs/architecture/project-overview.md`](docs/architecture/project-overview.md) |
> | Release steps | [`docs/guides/version-update-guide.md`](docs/guides/version-update-guide.md) and the `/version-bump` skill |
>
> The per-feature summary list that used to live here is archived at
> [`docs/archive/feature-specifications.md`](docs/archive/feature-specifications.md).

## Overview

CriteriaIQ is a full-stack web application for running technical validation
projects. Solution Engineers use it to manage validation criteria, Mutual Action
Plans (MAP), customer and partner collaboration, AI-assisted risk analysis,
email automation, CRM sync (Salesforce or HubSpot) and reporting, with
role-based access for internal staff and outside users (Customer, Partner,
Guest).

## Dark Mode Standards (MANDATORY)

All UI components MUST include dark mode support. Follow these patterns:
- Backgrounds: `bg-blue-50 dark:bg-blue-900/20`, `bg-gray-100 dark:bg-gray-800`
- Text: `text-gray-900 dark:text-gray-100`, `text-gray-700 dark:text-gray-300`, `text-gray-500 dark:text-gray-400`
- Borders: `border-blue-200 dark:border-blue-800`, `border-gray-200 dark:border-gray-700`
- Badges/Status: Include both light and dark variants for all colors
- Charts: Use `useChartTheme` hook from `@/hooks/useChartTheme` for theme-aware chart colors
- Tables: Include dark mode variants for all header, row, and cell styles
- Cards: Include dark background, border, and text color variants

## System Architecture

### UI/UX Design Standards

**Page Layout:**
- All pages use the `PageLayout` component, which applies **91px left/right** and **24px top/bottom** margins as standard padding. Do not add additional outer margins inside page components.

**Tab Menu Standards:**
- Top-level page tabs are rendered on a single line using `flex flex-wrap gap-0`. Do not use `gap-*` spacing between tabs or stack them vertically.

**Navigation:**
- 3-Tier Navigation Architecture using URL parameters with bidirectional state synchronization.
- **Second-tier:** `SubNavPopover` component (`@/components/ui/sub-nav-popover`) — a hover-reveal dropdown with "View:" label, active icon+title in blue-600, ChevronDown rotation, blue-50 active state with dot indicator, and full dark mode support. Replaces all previous `TabsList`/`TabsTrigger` patterns for second-tier navigation.
- **Template Management:** Top-level nav item at `/templates`; each of its pages has its own `template_management.*` permission key.
- **Sidebar implementation:** `sidebar.tsx` reads `window.location.search` directly (not React state) for active URL detection. Accordion open state uses `isOpen || active` pattern so parent menus stay open when a child item is active.
- **Nested accordions** auto-expand when their child route is active.

**Search & Filter Areas:**
- Use `SearchFiltersSection` and `FilterMultiSelectButton` for consistent filtering across all list pages.
- `SearchFiltersSection` default title uses the i18n key `common.searchAndFilters` (auto-translated across all 6 supported languages).
- Complex filter dropdowns use React Portals to avoid z-index clipping.

**Table Actions:** `ResponsiveTableActionsMenu` for consistent action display.

**Confirmation Dialogs:** `ConfirmationDialog` for all destructive actions — `destructive` variant for deletions, `warning` variant for other confirmations. Full dark mode support.

**Context Preservation:** Right-side sliding drawers (Sheet component) for viewing related data without navigation.

**Tooltips:** Use base shadcn/ui `TooltipContent` with minimal overrides.

**Decorative Card Icons:** `DecorativeCardIcon` component adds large, rotated watermark-style background icons to cards.

**Toast Notifications:** Semantic variants (`success`, `error`, `warning`, `info`, `confirm`, `loading`) with automatic icons and durations via `useToast()`.

**Chart Theme System:** Use `useChartTheme` hook for dark/light mode aware chart colors. Provides `isDark`, `getColor()`, `getPalette()`, `defaultPalette`, and style helpers for tooltips, axes, and legends.

**MAP Iconography:** Standardized icons for Phases (`ClipboardPenLine` - purple), Steps (`Boxes` - blue), and Tasks (`PackageCheck` - green).

### Technical Implementations

**Frontend Architecture:**
- **Framework:** React 19 with TypeScript 6
- **Build System:** Vite 8
- **Styling:** Tailwind CSS 4 (CSS-first configuration via `@theme` directive in `client/src/index.css` — no `tailwind.config.js`) with shadcn/ui
- **State Management:** TanStack Query
- **Routing:** Wouter
- **Form Management:** React Hook Form 7 with Zod 4 validation (via `@hookform/resolvers` 5.x)
- **Rich Text Editing:** Tiptap v3, TinyMCE 8
- **Real-time Updates:** WebSocket integration (singleton broadcaster, session-cookie verified)
- **Internationalization:** i18next 26 / react-i18next 15 (supporting 6 languages)

**Backend Architecture:**
- **Runtime:** Node.js with Express.js
- **Language:** TypeScript with ES modules
- **Database Integration:** Drizzle ORM with PostgreSQL dialect
- **Authentication:** Custom session-based authentication with bcrypt and comprehensive MFA (TOTP, WebAuthn, recovery codes)
- **Security:** AES-256-GCM encryption, rate limiting, trusted device management
- **Real-time Communication:** WebSocket Manager (singleton, auto-reconnect, event deduplication)
- **File Management:** Multer for secure uploads
- **Email System:** Nodemailer

**Database Design:**
- **Primary Database:** PostgreSQL (self-hosted alongside the app; see `docs/guides/self-hosting.md`)
- **ORM:** Drizzle with comprehensive schema definitions
- **Session Storage:** Database-backed
- **Migration System:** idempotent `migrations/NNN_*.sql` files applied at boot by `server/lib/migrations-runner.ts` (`drizzle-kit push` is not run on deploy); `lint:schema` checks `shared/schema-snapshot.json`
- **Environment Synchronization:** Categorized sync strategy for dev/prod schema and data

**Security & Authentication:**
- **Session Management:** Secure cookie-based with CSRF protection
- **Password Security:** bcrypt hashing
- **MFA Implementation:** TOTP, WebAuthn (passkeys), encrypted recovery codes
- **User Management:** Role-based access control: one None / View / Edit value per sidebar page (Account Portal has scoped levels), no inheritance; keys in `shared/permissions.ts`, see `docs/features/role-permissions.md`
- **View As (Dev Persona Switcher):** an Admin's session temporarily becomes the viewed user (`session.viewAs.realUser` keeps the Admin), read only for every route; code that needs the person actually signed in uses `realSessionUser()` from `server/auth/view-as.ts`, see `docs/features/view-as.md`
- **Device Trust:** Trusted device tokens
- **Rate Limiting:** Configurable for authentication

### Build Pipeline & CI Gates

The production `npm run build` chain enforces hard pre-build gates: `lint:toasts`, `lint:api-request-json`, `lint:version`, `lint:traefik`, `lint:dokploy-app-labels`, `lint:healthcheck`, `lint:slow-save`, `lint:slow-save-payload`, `lint:db-pool`, `lint:proxy-timeouts`, `lint:self-hosting-traefik`, `lint:heavy-imports`, `lint:i18n`, `lint:doc-dates`, `lint:schema` (all seconds-fast), followed by `vite build` for the frontend, `esbuild` for the backend, runtime documentation bundling, and a production bundle verifier.

**Type-checking is intentionally NOT in the production build.** `tsc --extendedDiagnostics` (`npm run check`) needs ~2.4 GB of working memory and dominated the wall-clock on the 4 GB Hostinger VPS, pushing deploys from ~3 min to ~14 min as it spilled into swap. It is now developer-time only — run `npm run check` locally before pushing, or use `npm run build:typed` to run the type-check + full build in one shot on a beefy machine. Type errors caught locally still block the build; what we removed is the cost of re-running it on a memory-starved deploy host.

**GitHub Actions CI (v0.8.0).** `.github/workflows/ci.yml` runs on every pull request and every push to `main` on Node 24 (matching the Dockerfile base image): `npm ci`, `npm run check`, `npm run build`, and `npx vitest run`. The checkout uses `fetch-depth: 0` because `lint:doc-dates` derives dates from full git history and fails on a shallow clone. DB-backed integration suites skip themselves when `DATABASE_URL` is unset; wiring a Postgres service container for them is a follow-up.

### Archive Mirror Rule

Every column added to `users`, `projects`, `customers`, `activity_logs`, or `customer_access` MUST also be added to the corresponding `archived_*` table in `shared/schema/archive.ts`, plus a SQL migration to `ALTER TABLE` the archive table. The archive logic uses `...spread` to copy all source columns — if the archive table lacks the column, Drizzle silently drops it and the value is lost on archive→restore round-trip. The `archive-restore-roundtrip.test.ts` test catches this drift automatically.

### Schema Organization (shared/schema/)

The Drizzle ORM schema is logically organized into **15 domain-based files**, accessed via a shared barrel export (`shared/schema/index.ts`). The schema is fully managed by `drizzle-kit`, with `migrations/` reserved for data migrations only.

- `auth.ts`, `email.ts`, `projects.ts`, `products.ts`, `ai.ts`, `customers.ts`, `config.ts`, `dashboard.ts`, `map.ts`, `docs.ts`, `access-control.ts`, `archive.ts`, `competitors.ts`, `assumptions.ts`, `misc.ts`.

### Storage Layer Composition (Phase 7 mixin pattern)

`server/storage.ts` is now a thin composition shell. The `DatabaseStorage` class is empty — every method is provided by a domain mixin under `server/storage/` and composed back via interface declaration-merge plus `applyMixins(DatabaseStorage, [...])`. The pattern is documented in `server/storage/_mixins.ts`.

The 28 mixins are: `core` (User + Dashboard Metrics + Project ops), `criteria`, `products`, `dashboard-stats`, `users`, `activity`, `requests`, `custom-reports`, `roles`, `audit-risk`, `infrastructure`, `security`, `dashboard`, `project-resources`, `pcos`, `validation-criteria-templates`, `industries`, `mfa`, `email`, `map`, `archive`, `customer-access`, `status-configs`, `end-date-flags`, `tags`, `seeders`, `value-journey`, `backfills`. Cross-mixin calls (e.g. `this.getProjectAuditCount()` from `core` reaching into `audit-risk`) work through the prototype chain at runtime; tsc resolves them via small phantom interfaces declared on each mixin (e.g. `AuditCountShape`).

Two shared helpers live at `server/storage/_errors.ts` (`RestoreUserEmailConflictError` + `sanitizeCustomerFolder`) — extracted to break the import cycle between `archive.ts` and `storage.ts`.

When adding a new method, place it in the matching mixin file (or create a new mixin if the domain is new). Avoid putting new methods in `server/storage.ts` itself — that file should stay thin.

### File Storage Layout: `uploads/` vs `attached_assets/`

The app keeps **bundled defaults** and **runtime admin uploads** in separate top-level directories so a deploy never has to worry about persisting image-layer content while still surviving container rebuilds for things admins type into the UI.

| Path | What lives here | Persistence | Volume |
|---|---|---|---|
| `<cwd>/attached_assets/` | Bundled defaults shipped IN the Docker image (`criteriaiq-logo_white.png`, `5a_steps/**`, fonts, etc.). Read-only at runtime. | Survives because it's in the read-only image layer; no volume needed. | Not mounted (intentional). |
| `<cwd>/uploads/` | EVERY runtime admin write — customer logos (`accounts/logos/`), branding (`system/branding/<slot>/<mode>/`), 5A attachments (`5a_steps/<step>/attachments/`), user doc uploads (`system/documents/user_<id>/`). | Must persist across container rebuilds — that's where Dokploy/redeploy used to wipe everything. | `app_uploads:/app/uploads` named volume (declared in BOTH Dockerfile `VOLUME` directive AND docker-compose.yml). |

The `LocalDriver` in `server/lib/cloud-storage.ts` writes to `uploads/`. The `/api/files/<key>` route in `server/routes/misc-routes.ts` resolves a key by checking `uploads/` first then falling back to `attached_assets/`, so URLs in the database (`/api/files/accounts%2Flogos%2F<file>.png`) keep working for both new and bundled content without any migration. The orphan-scan in `server/storage/branding.ts` uses the same candidate list so it never false-positives a freshly saved upload.

**When you add a new feature with persistent uploads**, just call `cloud-storage.uploadFile(...)` — files automatically land in the active provider. Do NOT write to `attached_assets/<subdir>/` at runtime; those writes go to the ephemeral container layer and get wiped on every redeploy. The legacy mistake (everything wrote to `attached_assets/`) is documented for the operators who hit it before this split — see commit `c4b544c5` for the redeploy-wipe symptoms.

### Storage Providers — where uploads actually live

The `LocalDriver` above is one of five interchangeable storage providers behind a single `StorageDriver` abstraction in `server/lib/cloud-storage.ts`. An admin picks the active provider in **Configuration → System Settings → Storage Providers** (admin-only; the editable form, with a read-only status mirror in **System Health → Storage**). Priority order: DB-backed config row (`storage_configuration`) > environment variables > local-disk fallback. The choice matters entirely because of the ephemeral-filesystem problem — only some providers survive a redeploy without operator-supplied deploy config:

| Provider | Persists across redeploy? | Deploy config required | Notes |
|---|---|---|---|
| **`db` (Database)** | ✅ Yes, with zero config | None | Stores files as BYTEA rows in a **separate `<main>_files` database** on the same Postgres server (rides the existing `postgres_data` volume). Keeps blobs out of main-DB backups (`pg_dump <main>` stays lean). The recommended fallback for self-hosted without cloud. See below. |
| **`gcs` / `aws` / `azure` (Cloud)** | ✅ Yes | Bucket + credentials (entered in-app) | Industry-standard. Files live in the bucket, fully decoupled from the container. Best for large media libraries / multi-instance. |
| **`local` (Local Disk)** | ⚠️ Only if a volume is mounted at `/app/uploads` | Yes — the deploy tool must mount it | Dokploy "Application" mode ignores docker-compose volumes; operator must add the mount in its UI. Without it, uploads vanish on redeploy. The Storage Providers UI's Local Disk tab spells this out. |

**The `db` provider (server/lib/files-db.ts).** Owns a *second* Postgres connection end-to-end, separate from the main `server/db.ts` pool: it derives the files-DB URL from the active main connection (swap the database name to `<main>_files`; or set `FILES_DATABASE_URL` to override), creates that database on first boot if missing (needs `CREATEDB`; degrades gracefully and logs an actionable error if the user lacks it), opens a dedicated pool, and ensures a self-managed `uploaded_files` table (`id, object_key UNIQUE, mime_type, size_bytes, data BYTEA, sha256, uploaded_by, created_at, updated_at`). This table is **deliberately excluded from the `@shared/schema` barrel and the migrations-runner** — it lives in its own database and is created via idempotent boot DDL, so the `lint:schema` snapshot (which scans the main barrel) is untouched. Blob CRUD uses raw parameterized pool queries (node-postgres maps a JS `Buffer` ↔ `BYTEA` automatically). `DatabaseBlobDriver` returns the same `/api/files/<key>` URL shape as `LocalDriver`; the `/api/files` route checks the files DB *first*, then the disk candidates, so bundled image-layer defaults still serve and existing DB rows keep resolving with no migration. Boot order in `server/index.ts`: `initFilesDb()` runs before `initStorageDriver()` so a saved `db` provider is usable on the first request. **Back up `<main>` and `<main>_files` independently.**

**Test Connection** (`POST /api/admin/storage/test`) builds a *throwaway* driver from the credentials in the request body (masked secrets fall back to the stored decrypted value) and pings it — so an admin validates typed creds *before* saving, without mutating the active driver. A body with no `provider` falls back to pinging the currently-active driver (the System Health mirror path).

### Boot-Time Seeds & Backfills

The server performs idempotent seed/backfill operations upon startup, including initializing default MAP templates, allowed domains, system tags, industries, the default value journey stages, and backfilling project names and customer logo sizes. It also applies specific field settings defaults once per database.

### Database Connection Manager (Task #739)

The canonical store for database connections is the encrypted file `data/db-config.json` (managed by `server/db-bootstrap.ts`). The file holds a `connections[]` array of `ConnectionRecord` rows (id slug, name, encrypted URL, branch, isSystem, isDefault, notes, lastTested* timestamps) plus `activeConnectionId` and `pendingActiveConnectionId` (Task #740 will wire the second). The branch field is fixed to the canonical triad **production / staging / development**; `LEGACY_BRANCH_MAP` in `server/db-bootstrap.ts` quietly normalizes earlier values (testing→staging, qa→staging, sandbox→development, other→production) on read, and the next save persists the canonical value. On every boot, after migrations run, `syncConnectionsToDb()` in `server/storage.ts` mirrors the file's `connections[]` into the `db_connections` table by name (insert/update/delete). The file is the canonical source, so any orphaned table rows (including `isSystem` rows) are purged on sync — this lets a system-row rename in the file resolve to a single table row instead of leaving an undeletable duplicate behind (the per-row delete endpoint refuses isSystem rows). On a host-env-managed install whose file is empty, the sync auto-seeds a "Bootstrap (initial install)" record from the resolved URL so the panel never renders empty. The first time `readConnections()` sees a pre-#739 file with a single legacy `connectionUrl` field, it folds it into a `bootstrap-initial-install` record AND immediately persists the canonical shape so the old field is dropped after one boot. Admin POST/PUT/DELETE on `/api/db-connections` write through the file helpers and then call the sync; URL changes on the currently-active row return `errorCode: pending_active_required` and the client gates them behind a typed-name-confirmation modal pointing at the Task #740 workflow. A new `POST /api/db-connections/:id/reveal` admin-only endpoint returns the decrypted URL once; the client re-masks after 10 seconds. Both the global response logger and the error middleware in `server/index.ts` redact response bodies and request keys for the reveal/secrets endpoints so plaintext credentials never reach the access log. Delete buttons in the UI are disabled for active OR system rows with distinct tooltips ("Switch to a different connection before deleting" / "System connections cannot be deleted").

### Debug Logging Flags

Two opt-in env vars gate noisy diagnostic logs that are off by default so production logs in Dokploy/Coolify stay clean:

- **`DEBUG_AUTH=true`** — wraps the `Login attempt - email: <email> password length: <N>` line in `server/auth/simpleAuth.ts` (~line 1050). The email is logged in cleartext when this is on (PII), the password as a length only. Off by default so login traffic doesn't write user emails to stdout.
- **`DEBUG_DB_POOL=true`** — wraps every `Database client acquired/released. Active connections: <N>` line in `server/storage.ts` (10 call sites in the audit/sessions wrappers around lines 9760–9830). Each `withClient`-style helper logs an acquire+release pair, so a single login can produce 6–10 lines. Off by default; turn on when diagnosing pool exhaustion (`FATAL: sorry, too many clients already`).

Set the flag in the platform's env-var panel and restart the container. The standard Express request log (`POST /api/login 200 in <ms>`) is unaffected by either flag and keeps rendering. Operator-facing copy of the same info lives in `docs/guides/self-hosting.md` under the "Debug logging" section.

### Expired Session Row Prune (Task #737)

On boot, after `setupSimpleAuth`, `routes.ts` calls `startExpiredSessionsCleanup()` from `server/services/expired-sessions-cleanup.ts`. The job runs `DELETE FROM "sessions" WHERE expire < NOW()` once per interval (default 24 h, override with `SESSIONS_CLEANUP_INTERVAL_HOURS=N`) and logs the result in the operator-greppable form `[Sessions Cleanup] Pruned N expired session row(s) in Mms`. The first tick fires shortly after boot (default 60 s, override with `SESSIONS_CLEANUP_FIRST_RUN_DELAY_MS`) so operators can confirm the job is wired up without waiting a full day. The scheduler is a no-op when the active session store would be MemoryStore (`chooseSessionStore(process.env) !== "postgres"`, i.e. dev / setup-only mode) or when the DB has not been provisioned (`dbReady === false`, setup wizard mode) — both branches log which they took. Each tick short-circuits while `dbHealth.reachable === false` to avoid log spam during outages, mirroring the EmailScheduler pattern. The DELETE is idempotent and safe to run concurrently across replicas. This is the recurring counterpart to the one-shot `DELETE FROM "sessions"` that the SESSION_SECRET-rotation handler issues (Task #724) — that path only fires on rotation, this one keeps the table small in normal operation regardless of which replica is up. Tests in `server/services/__tests__/expired-sessions-cleanup.test.ts`.

### Scheduler (Configuration → Scheduler)

Every recurring background job registers with the shared scheduler in `server/services/jobs/scheduler.ts` (`scheduleJob({ key, category, label, task, ... })` with exactly one of `defaultIntervalMs`, `dailyAt` or `cron`) instead of owning its own `setInterval` or croner instance. **Admin › Monitoring & Audit › Scheduler** (`/admin?tab=scheduler`, `client/src/components/scheduler/`) lists them with an on/off switch, a cadence picker or run time and timezone (daily jobs), an Email on error switch (at most one email per job per day to every Admin, `server/email/scheduled-job-failed-email.ts`), Run now and run history, ImpactIQ-style. `singleInstance` jobs run under a Postgres advisory lock (`server/services/jobs/locks.ts`) and daily/cron slots are claimed in `job_config.last_slot_at`, so with several replicas each runs once. Overrides live in `job_config` (no row = defaults, so env-var intervals still apply); `job_runs` records only runs that did work or failed and is pruned after `JOB_RUNS_RETENTION_DAYS` (90) by the `job_runs_cleanup` job. `startJobScheduler()` (`server/services/jobs/index.ts`) is called in `routes.ts` before the jobs start, injects storage (`server/storage/scheduler.ts`) and re-reads `job_config` every minute. Routes in `server/routes/scheduler-routes.ts`, gated by the `config.scheduler` section (view / edit). On the scheduler today: sessions cleanup, login history cleanup, MCP activity cleanup, data folder check, documentation sync, run history cleanup, the Salesforce sync queue, the nightly Salesforce broken-link check, Salesforce scheduled syncs per object (cron from the Sync Policy, edited there) and the Workflow Automation schedules tick. The page also holds the workflow schedules (`email_schedules`, moved from Workflow Automation's removed Schedules tab; old links redirect) and the **Send Email Window**: quiet hours (off by default; scope "digests" or "all" automated email; own timezone) and max emails per hour (shared per-hour count in `email_hourly_send_counts`, atomic across replicas, 0 = no limit), enforced in `server/email/send-window.ts`; over-limit and quiet-hours emails are skipped, not queued, and sign-in (Authentication) emails are exempt (`GET`/`PUT /api/scheduler/send-window`, migration `087_email_send_window.sql`). Workflow schedule routes (`/api/email-automation/schedules*`) are gated per action type by `server/lib/schedule-permissions.ts`: `config.scheduler` covers every type, and the page that owns a type (e.g. Workflow Automation for `email_digest`, Documentation Sources for `docs_sync`) covers that type only; cleanup and status checks need the Scheduler. Digests: a rule's Schedule Digest action queues the event on its `email_rule_audits` row (`digestRecipientIds`), and the rule's Email Digest schedule sends each recipient one summary and marks them in `digestSentTo` (`server/email/digest-utils.ts`; migration `088_remove_blank_digest_schedules.sql` deletes blank schedules the old action created). New jobs: return `{ status: "skipped" }` for a quiet tick, throw to record a failure, and add `scheduler.jobNames.<key>` strings. See `docs/features/scheduler.md`. Tests in `server/services/__tests__/job-scheduler*.test.ts`, `job-advisory-lock.test.ts`, `scheduler-failure-email.test.ts` and `server/salesforce/__tests__/salesforce-sync-worker-jobs.test.ts`.

### Admin Demo Mode (Task #723)

Admin sandbox under **Admin › Demo › Demo Mode** (`/admin?tab=demo-mode`) lets an Admin demo the application against fully synthetic, isolated data without exposing real customer/project records. Three independent OR-ed sources can put a request into demo: per-session (`req.session.demoMode`), per-user (`users.demoModeForcedOn`), or app-wide (`system_settings.demo_mode_app_wide` jsonb `{enabled:bool}`). Every tagged table gained an `is_demo boolean NOT NULL DEFAULT false` column with a single-column `idx_*_is_demo` index: customers, customer_access, projects, activity_logs, map_phases/steps/tasks/links/templates, custom_reports, dashboard_layouts, tags, products, email_templates, ai_provider_configs, assumptions, dependencies. The demo middleware (`server/lib/demo-mode.ts`) is mounted **before** any sub-route group in `registerRoutes` (so dashboard/docs/competitor/system handlers all run inside demo context), resolves the three flags once per request, attaches `req.demoMode = {active, source, excluded}`, and runs the rest of the chain inside an `AsyncLocalStorage` so storage helpers can consult `isCurrentRequestDemo()` via `applyDemoFilter(table)` (`server/lib/demo-storage.ts`) without threading the flag everywhere. `applyDemoFilter` is wired into the high-traffic list reads in `server/storage.ts`: `getCustomers`/`getAllCustomersIncludingInactive`, `getTags`/`getAllSystemTags`, `getEmailTemplates`, `getCustomReports`, `getDashboardLayouts`, `getMapTemplates` — so demo sessions only see demo rows and production sessions never see demo rows on those screens. Excluded API paths (`/api/system/*`, `/api/users`, `/api/roles`, `/api/audit`, `/api/archive*`, `/api/about`, `/api/getting-started`, `/api/demo/*`, `/api/admin/schema-migrations`, `/api/db-connections`) bypass demo context entirely. The persistent yellow `DemoModeBanner` is source-aware (different copy for session/user/app_wide combinations) and offers an inline "Exit demo" button when the per-session flag is on; whether the *currently rendered* page is excluded is decided client-side via `client/src/lib/demoExcluded.ts` against `window.location.pathname` (the server cannot answer because the `/api/demo/status` request path is itself excluded). Excluded screens additionally show an inline `ExcludedScreenNotice` badge. The faker-based seeder (`server/lib/demo-seeder.ts`) creates customers/projects/per-project maps/tags/library items/dashboard layouts/custom reports, all flagged `is_demo=true`. The wipe runs inside a single `db.transaction` — each tagged table gets a hand-written `DELETE … WHERE is_demo = true` in child→parent order (never inspects `is_demo=false` rows), then a final non-demo-row safety assertion runs against the top-level tables before COMMIT — and the route refuses any `confirm` body other than the literal `WIPE DEMO DATA` phrase. Admin-only routes (`server/routes/demo-routes.ts`) cover status, session toggle, per-user toggle, app-wide toggle, seed, wipe, audit list, and users list — every toggle/seed/wipe writes one `activity_logs` row with `targetType='demo_mode'`. The Demo Mode page UI uses a searchable user picker (capped at 50 hits) instead of a full users table and pops an `AlertDialog` confirmation when enabling the app-wide flag. Client uses `useDemoStatus()` (`client/src/hooks/useDemoStatus.ts`) polling `/api/demo/status` every 30 s. Operator reference doc at `docs/admin/demo-mode.md`. Tests: `server/__tests__/demo-mode.test.ts` (35 tests — resolver, AsyncLocalStorage, excluded path matchers for both server and client, wipe SQL safety static check including transaction wrapping).

### Field Settings Save Instrumentation (Task #495)

The two Field Settings save handlers (`PUT /api/ranking-configs/:id` and `PUT /api/end-date-flags/:id`) are wrapped with `warnIfSlowSave` from `server/lib/slow-save-warn.ts`. If either handler exceeds the threshold (default **2000 ms**, override at runtime via the `SLOW_SAVE_THRESHOLD_MS` env var — positive integer ms; invalid/zero/negative values fall back to the default) the server emits one `console.warn` JSON line: `{"event":"slow_field_settings_save","handler":"...","durationMs":N,"thresholdMs":N,"id":"..."}`. This makes Dokploy / Coolify / Traefik / Caddy / NGINX `504 Gateway Timeout` reports triageable from the deployment log alone — if the warning is absent but the browser still saw a 504, the timeout was injected by the upstream proxy (raise Traefik's `forwardingTimeouts.responseHeaderTimeout`, Caddy's `transport http { read_timeout }`, or NGINX's `proxy_read_timeout`); if the warning is present, the slowness is in the app/DB. Full diagnostic procedure and per-proxy snippets (Traefik labels + Caddy/NGINX equivalents in the new "Other reverse proxies" section) live in `docs/guides/dokploy-traefik-timeouts.md` (linked from `docs/guides/self-hosting.md`). Helper unit tests in `server/lib/__tests__/slow-save-warn.test.ts`.

## Project Directory Structure

```
client/src/
├── components/
│   ├── about/              # About page tabs, changelog, UI showcase
│   ├── accounts/           # User/customer dialogs, profile editor, team management
│   ├── ai-assessments/     # AI risk assessment components
│   ├── analytics/          # Schedule Report dialog, Login Audit, calendar helpers
│   ├── reports/            # Reports page: library table, calendar, counts, results drawer
│   ├── announcements/      # Banner, bell, detail dialog
│   ├── artifacts/          # Documents, links, code snippets
│   ├── automation/         # Workflow automation, schedule creator
│   ├── communications/     # Email templates, messaging
│   ├── configuration/      # System config, compliance, field settings
│   ├── dashboard/          # Main dashboard, calendar dashboard, admin builder
│   ├── dashboard-widgets/  # KPI cards, sparklines, metric widgets
│   ├── errors/             # Error boundaries, displays, recovery
│   ├── flight-deck/        # Welcome modal system
│   ├── gap-analysis/       # Gap drawers and forms
│   ├── icons/              # Custom icon components
│   ├── integrations/       # Salesforce, AI providers config
│   ├── layout/             # Header, sidebar, page layout
│   ├── map/                # Mutual Action Plan components
│   ├── outcomes/           # Project outcomes components
│   ├── project/            # Project-level shared components (DeliverabilityVisibilityModal, etc.)
│   ├── project-detail/     # Project detail views, TAP, audit
│   ├── project-form/       # Guided project create/edit form (split into sections)
│   ├── projects/           # Project board, projects section, validation page
│   ├── requests/           # Evaluation requests, action buttons
│   ├── rich-text/          # MDX/TinyMCE editors
│   ├── salesforce/         # Salesforce UI components
│   ├── search/             # Global search command palette
│   ├── security/           # MFA, security badges, status
│   ├── shared/             # Reusable utilities (theme toggle, badges, help)
│   ├── support/            # Support feature components
│   ├── templates/          # Project templates, MAP library tab
│   ├── ui/                 # shadcn/ui base components
│   └── validation-criteria/# Success criteria form, tabs
│
├── hooks/                  # Custom React hooks
├── lib/                    # Utility libraries (celebration.ts, etc.)
├── pages/                  # Route page components
├── types/                  # TypeScript type definitions
├── constants/              # Shared constants
└── utils/                  # Utility functions

server/
├── ai/                     # AI service, risk engine, data sources
├── auth/                   # Authentication (simple, MFA)
├── email/                  # Email service, automation, triggers, providers
├── salesforce/             # Salesforce integration services
├── services/               # Health monitor, scheduler, WebSocket, docs sync, metric snapshots
├── storage/                # Phase 7 mixin files (28 domain mixins composed into DatabaseStorage)
├── routes/                 # Domain route files (`*-routes.ts`), each registered from `routes.ts`
├── webhooks/               # Webhook services and templates
├── migrations/             # SQL migration files
│   └── db_refactor/        # UUID PK migration, integrity constraints, indexing strategy
├── assets/                 # Server-side assets (logos)
├── index.ts                # App entry point
├── routes.ts               # Route registration entry point (mounts every file in `routes/`)
├── storage.ts              # Data access layer (composition shell — see Storage Layer Composition)
├── db.ts                   # Database connection
├── db-bootstrap.ts         # Environment detection + file-based config bootstrap
├── auditHelper.ts          # Audit logging utility
└── vite.ts                 # Vite dev server config

shared/                     # Shared between client and server
├── schema/                 # Drizzle ORM schema (15 domain-based files)
│   ├── index.ts            # Barrel re-export — ALL imports use `@shared/schema` (this file)
│   ├── auth.ts             # Users, sessions, MFA, permissions, roles, trusted devices, WebAuthn, audit logins
│   ├── email.ts            # Email logs, triggers, rules, conditions, actions, schedules, templates, designs, automation config, automation_run_logs (scheduler run history)
│   ├── projects.ts         # Projects, project templates, activity logs, project audits, evaluation requests, end date flags, deliverablesVisibility JSONB
│   ├── products.ts         # Products, components, criteria library, expected outcomes, action items, tags, validation criteria templates, success criteria, value_mappings, product_value_mappings, criteria_value_mappings
│   ├── ai.ts               # Assessment rulesets, risk criteria, risk predictions, risk alerts, AI provider configs, assessment jobs
│   ├── customers.ts        # Customers, infrastructure profiles, customer access, documents, links, code scripts, customer competitors
│   ├── config.ts           # Status configs, risk level configs, ranking configs, industries, customer status configs, system settings, table sync configs, storage configuration
│   ├── dashboard.ts        # Dashboard layouts, widget configs, dashboard configs, dashboard metrics, metric snapshots, custom reports, report executions, user report favorites
│   ├── map.ts              # MAP phases, steps, tasks, links, templates, template phases/steps/tasks/applications, project_maps, automation config, assignment overrides, journey stages
│   ├── docs.ts             # Docs repository configs, sidebar structure, content cache, sync schedule
│   ├── access-control.ts   # Allowed domains, access codes, access code usage, domain audit log, access code audit log, schema_migration_audit
│   ├── archive.ts          # Archived users, archived projects, archived customers, archived success criteria, archived activity logs, archived customer access, archived project audits, archive_log
│   ├── competitors.ts      # Technology spaces, competitors, competitor spaces, competitor solutions, competitor tags, project_competitors, competitor documents/links/activity
│   ├── assumptions.ts      # Assumption categories, dependency categories, assumptions, dependencies, project_assumptions, project_dependencies
│   └── misc.ts             # Webhooks, Salesforce (OAuth, field mappings, sync logs/queue/runs), system announcements, flight deck, gap analysis (project_gaps, project_gap_links), project outcomes/closure, compliance regulations, support requests, kanban audit, board preferences, db_connections, client_error_logs
└── fiscal-utils.ts         # Fiscal year utilities

docs/
├── features/               # Feature-specific documentation
├── guides/                 # How-to guides and operational docs
├── architecture/           # System architecture and design docs
└── diagrams/               # Raw .excalidraw source files
```

## Global Search System

The global search is a role-aware command palette (Ctrl+K) that searches records, documentation and every page the viewer can open.

### Architecture

**Pages come from the sidebar.** `client/src/components/search/page-search-index.ts` builds the page results on the client from `SIDEBAR_NAV` in `sidebar-nav-config.ts`, after the same `filterSidebarNav` permission filter the sidebar and top tab bar use. Every sidebar entry is a result under its current name, with its location as the description (e.g. "Library › Template Management"). A page that is moved, renamed or removed in the sidebar changes in search automatically, and pages that are not in the sidebar are not searchable.

**In-page views.** `IN_PAGE_VIEWS` in the same file lists the "View:" options of sidebar pages (Salesforce, System Settings, User Management, Workflow Automation, Artifacts), each attached to the sidebar entry that hosts it. A view is shown only when its sidebar entry is visible; `adminOnly` views only to Admins. Labels live under `globalSearch.views.*` (Salesforce reuses its `layout.sidebar.items.*` labels). A test fails if a view's URL is not on its sidebar entry's page, so a page move can't leave stale results behind.

**API endpoint:** `GET /api/search?q=<query>&limit=<n>` in `server/routes/misc-routes.ts` searches DB records (projects, customers, MAPs, users) plus the static lists in `server/search/searchConfig.ts`. `GlobalSearch.tsx` merges the page results into the API results by score (same scoring on both sides).

### Static lists in searchConfig.ts

| Export | Purpose |
|---|---|
| `documentationItems` | Internal documentation articles (About → Documentation tab) |
| `gettingStartedItems` | Guide page tabs (sidebar: Help › Guide) |
| `aboutItems` | Content inside About pages: Clear2Close phases and Introduction capabilities (some internal-only) |

### How to Add a New Searchable Page or Feature

- A new page: add it to `sidebar-nav-config.ts`. It is searchable with no other change. If it has a `section`, add that key to `PAGE_PERMISSION_KEYS` in `shared/permissions.ts` at the same menu position, or Role Management can't grant it (`permission-tree.test.ts` fails).
- A new "View:" option on an existing page: add it to `IN_PAGE_VIEWS` and its label to `globalSearch.views` in `en-US.json`.

## Version Update Process

- Every merge to `main` raises the patch number automatically (`.github/workflows/version-patch.yml` runs `./update-version.sh --patch`). PRs never edit the version.
- Releases are cut with the `/version-bump` skill (`.claude/skills/version-bump/SKILL.md`), which raises the minor number and writes the release notes.
- Version history/changelog entries go in `client/src/components/about/ChangeLogDrawer.tsx` (the Change Log sliding drawer). Add new AccordionItem entries at the top.
- The Recent Updates card summary lives in `client/src/components/about/RecentUpdatesContent.tsx` (only the "NEW:" highlight items).
- Full update checklist and file list in `docs/guides/version-update-guide.md`.

## Development Guidelines

**IMPORTANT: This section defines conventions for maintaining the organized codebase structure. Follow these rules when adding new code.**

### Local Development Setup

Running CriteriaIQ locally on Windows requires a Postgres container, a `.env` file with secrets, and the correct Node launch command. See the full guide at **[`docs/guides/local-dev-setup.md`](docs/guides/local-dev-setup.md)**.

Quick reference:
- Launch: `node --env-file=.env --import tsx/esm server/index.ts` from the repo root (relative path — the clone location varies by machine), or use `preview_start "App (full-stack)"` via the Claude preview tool
- Bootstrap admin: `admin@criteriaiq.local` / `Admin1234!`
- Critical gotcha: `data/db-config.json` (gitignored) overrides `DATABASE_URL` on every boot — delete it if connecting to the wrong database

### Adding New Database Tables (shared/schema/)

The database schema is split into **15 domain-based files** within `shared/schema/`, exported through the barrel `shared/schema/index.ts`. When adding a new table:

1. **Choose the correct domain file** based on the table's purpose:

| Domain File | When to Use | Example Tables |
|---|---|---|
| `auth.ts` | User identity, login, sessions, permissions, MFA | users, sessions, roles, webauthnCredentials, trustedDevices |
| `email.ts` | Email sending, rules, templates, automation | emailLogs, emailTemplates, emailSchedules, automationRunLogs |
| `projects.ts` | Project lifecycle, tracking, auditing | projects, projectTemplates, activityLogs, projectAudits |
| `products.ts` | Products, validation criteria, templates, value mappings | products, components, criteriaLibrary, valueMappings, successCriteria |
| `ai.ts` | AI/ML features, risk assessment, providers | assessmentRulesets, riskCriteria, aiProviderConfigs |
| `customers.ts` | Customer data, documents, access, code scripts | customers, infrastructureProfiles, documents, customerAccess, customerCompetitors |
| `config.ts` | System-wide settings, status options | statusConfigs, systemSettings, industries |
| `dashboard.ts` | Dashboard layouts, metrics, reports | dashboardLayouts, widgetConfigs, customReports, metricSnapshots |
| `map.ts` | Mutual Action Plan structure and value journey stages | mapPhases, mapSteps, mapTasks, mapTemplates, mapAssignmentOverrides, journeyStages |
| `docs.ts` | Documentation sync from GitHub | docsRepositoryConfigs, docsContentCache, docsSyncSchedule |
| `access-control.ts` | Domain restrictions, access codes | allowedDomains, accessCodes, schemaMigrationAudit |
| `archive.ts` | Soft-deleted records (mirrors source-table columns 1:1) | archivedUsers, archivedProjects, archivedCustomers |
| `competitors.ts` | Competitor intelligence library | technologySpaces, competitors, competitorSpaces, projectCompetitors |
| `assumptions.ts` | Project assumptions and dependencies | assumptions, dependencies, projectAssumptions, projectDependencies |
| `misc.ts` | Webhooks, Salesforce, announcements, gap analysis, outcomes, flight deck, compliance, support, db connections | webhooks, salesforceOAuthConfig, announcements, projectGaps, projectOutcomes, complianceRegulations, dbConnections |

2. **If a table doesn't fit any existing domain**, add it to `misc.ts`. If `misc.ts` grows too large or you're adding 3+ related tables for a new feature, create a new domain file (e.g., `shared/schema/notifications.ts`).

3. **Cross-references between domains**: Use Drizzle's lazy callback pattern for foreign keys (`.references(() => otherTable.id)`) and relations. Import the referenced table from its domain file. Drizzle handles circular references automatically via lazy evaluation.

4. **Always export from the barrel**: After adding tables to a domain file, verify `shared/schema/index.ts` has `export * from './your-domain-file'`. New domain files must be added to the barrel.

5. **Keep all related items together**: Put the table definition, its relations, its Zod insert/select schemas, and its TypeScript types (`$inferSelect`, `$inferInsert`) in the same domain file.

6. **Import convention**: All application code imports from `@shared/schema` (the barrel). Never import from individual domain files like `@shared/schema/auth` — this keeps imports consistent and allows tables to be reorganized without breaking consumers.

### Standard Table Pattern

Every data table in CriteriaIQ follows the same visual and behavioural pattern. **Do not build one-off tables with plain `<table>` markup — always use the components below.** Reference implementation: `client/src/components/configuration/ComplianceSection.tsx`.

#### Required components (all in `client/src/components/ui/`)

| Component / file | Purpose |
|---|---|
| `SortableTable`, `SortableTableHead` — `sortable-table.tsx` | Column headers with sort-direction arrows and tooltips |
| `TablePaginationFooter` — `table-pagination-footer.tsx` | "Showing X–Y of N items" text + Previous / Next buttons |
| `DecorativeCardIcon` — `decorative-card-icon.tsx` | Faint rotated background icon inside the card |
| `SearchFiltersSection` — `search-filters-section.tsx` | Collapsible filter strip above the table (when filtering is needed) |

#### Required hooks & utilities (`client/src/lib/sorting.ts`)

- `useUrlSortState(prefix)` — sort state synced to URL params so sort survives navigation
- `makeComparator(sortConfig)` — auto-detects field type (ISO date strings, booleans, numbers, strings) and returns the right comparator
- `stableSort(array, comparator)` — stable client-side sort preserving original order for equal elements

#### Standard card + table structure

```tsx
<Card className="relative overflow-hidden">
  <DecorativeCardIcon icon={YourTitleIcon} />
  <CardHeader className="relative z-10">
    <CardTitle>{Title} ({totalCount})</CardTitle>
  </CardHeader>
  <CardContent className="relative z-10">
    {/* Optional: <SearchFiltersSection> for filter controls */}
    <div className="border rounded-lg overflow-hidden">
      <SortableTable>
        <SortableTableHeader>
          <tr>
            <SortableTableHead sortKey="fieldName" sortConfig={sortConfig} onSort={handleSort}>
              Column Label
            </SortableTableHead>
            <SortableTableHead sortable={false}>Actions</SortableTableHead>
          </tr>
        </SortableTableHeader>
        <SortableTableBody>
          {paginatedItems.map(item => (
            <SortableTableRow key={item.id}>
              <SortableTableCell>…</SortableTableCell>
            </SortableTableRow>
          ))}
        </SortableTableBody>
      </SortableTable>
    </div>
    <TablePaginationFooter
      totalItems={filteredItems.length}
      pageSize={10}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      entityLabel="items"
    />
  </CardContent>
</Card>
```

#### Mandatory rules

- **Default page size is 10.** Never render unlimited rows.
- **Reset `currentPage` to 1** whenever filter state or sort key changes (useEffect).
- **Clamp `currentPage`** when data shrinks below the current page (useEffect watching `filteredItems.length`).
- **`DecorativeCardIcon` uses the same icon as the card title** — keeps visual identity consistent.
- **Use `useUrlSortState`** (not `useSortState`) so sort survives route navigation.
- **Every column header is sortable.** Use `SortableTableHead` for every header cell, never a bare `TableHead`/`<th>`; only Actions-style columns (and computed columns a server-paged table cannot order by) get `sortable={false}`. Sort with `sortRows(rows, sortConfig, accessors)` from `lib/sorting.ts`, giving an accessor for any column whose cell shows a derived value (translated label, count, nested field). A server-paged table sends the sort to its API instead of sorting one page. See `docs/features/standard-table-pattern.md`.
- **Mark non-sortable columns** with `sortable={false}` on `SortableTableHead` (e.g. Webhook URL, Actions).
- **All standard components handle dark mode automatically** — only custom cell content needs dark-mode classes.
- **Tooltip provider**: `SortableTableHead` and `TablePaginationFooter` use Radix tooltips; ensure a `<TooltipProvider>` wraps the page (the global `PageLayout` does this).

---

### Adding New Client Components (client/src/components/)

1. **Place components in the feature folder they belong to.** Match the feature area, not the component type:
   - A new chart for the dashboard → `dashboard/` (not a generic `charts/` folder)
   - A new dialog for user creation → `accounts/` (not a generic `dialogs/` folder)
   - A new MAP milestone tracker → `map/`
   - Project-level shared components (visible/invisible controls, deliverability modal) → `project/`

2. **Use `ui/` only for generic, reusable primitives** (shadcn/ui components, design system atoms). Feature-specific components go in their feature folder.

3. **Use `shared/` for cross-cutting utilities** that are used by 3+ feature areas (e.g., theme toggle, help tooltips, status badges).

4. **Split large components**: If a component file exceeds ~800 lines, extract sub-components, types, and utilities into sibling files within the same folder. Follow the pattern used in `project-form/` and `projects/project-board*`:
   - `feature-name.tsx` — main orchestrator component
   - `feature-name-types.ts` — TypeScript interfaces and constants
   - `feature-name-utils.ts` — helper functions
   - `FeatureSubComponent.tsx` — extracted sub-components

### Adding New Server Files (server/)

1. **Place files in the correct subdirectory:**
   - `server/ai/` — AI service logic, risk engines, data sources
   - `server/auth/` — Authentication strategies, MFA, session management
   - `server/email/` — Email sending, automation engine, triggers, providers
   - `server/salesforce/` — Salesforce OAuth, field mapping, sync
   - `server/services/` — Background services, schedulers, WebSocket, health monitoring, docs sync, metric snapshots
   - `server/storage/` — Domain-specific storage mixins (Phase 7 split — one file per domain)
   - `server/webhooks/` — Webhook delivery, templates, retry logic

2. **API routes live in the domain route files under `server/routes/`** (`*-routes.ts`), registered from `server/routes.ts`. Add a route to the matching domain file; create a new one only for a new domain.

3. **Data access stays in the storage mixins** (`server/storage/<domain>.ts`) — this is the data access layer. Add new query methods to the matching mixin rather than putting raw SQL in route handlers, and never put new method bodies in `server/storage.ts` itself (which is now a thin composition shell).

### Toast Notifications:
1. All error/success/warning/info toasts in client/src MUST use the helpers from client/src/lib/toast-helper.ts — showErrorToast(), showSuccessToast(), showWarningToast(), showInfoToast(). Never use direct toast({ variant: "destructive" }) calls.
2. The old destructive variant was retired in Task #461. The lint:toasts build gate enforces this at deploy time. See docs/features/toast-notification-system.md for the full convention.

### General File Organization Rules

- **No loose files at directory root level**: Every component, service, or utility should be in a meaningful subdirectory.
- **Maximum file size target: ~800 lines.** Files over 1000 lines should be considered for splitting.
- **Naming conventions**: Use kebab-case for file names (`my-component.tsx`), PascalCase for component names (`MyComponent`), and camelCase for utilities (`myHelper.ts`).
- **Documentation files** go in `docs/features/` (feature docs), `docs/guides/` (how-to guides), `docs/architecture/` (system design docs), `docs/plans/` (active plans and the backlog), or `docs/archive/` (finished or retired docs, kept as history).
