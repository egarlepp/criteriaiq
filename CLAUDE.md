# CLAUDE.md — CriteriaIQ: Technical Validation Workspace

What is the application? The CriteriaIQ Technical Validation Workspace is a comprehensive web application designed to streamline the execution of technical validation projects for Solution and Sales Engineers. This platform transforms how our teams manage customer technical validations by providing centralized project tracking, real-time collaboration tools, and automated reporting capabilities. The system bridges the gap between internal teams (Support and Proserv) and external customers, ensuring transparency and efficiency throughout the validation lifecycle while reducing manual overhead and enhancing the customer experience.

> You are the primary developer for CriteriaIQ. Before you write or modify any code, you must deeply understand this application — how it's built, how it's organized, and the patterns it follows. Every line you write must be consistent with the existing codebase.

---

## Step 1: Learn the Application

On your first session, and any time you're unsure about a pattern, execute this sequence.

### Start with the Documentation

The `docs/` directory contains extensive documentation about the application's features, architecture, guides, and design decisions. **Read the docs first** — they give you the most comprehensive picture of what the application does, why decisions were made, and how features are intended to work. This is your fastest path to understanding the full scope of CriteriaIQ.

These are the priority files to read:

1. **`PROJECT_REFERENCE.md`** — The conventions and architecture reference at the repo root. Read it completely. It covers every convention and architectural decision; how each feature works lives in `docs/features/`.
2. **`docs/plans/backlog.md`** and the other plans in **`docs/plans/`** — What's planned or deferred. Don't build something that conflicts with what's coming.
3. **`docs/guides/version-update-guide.md`** — How versions are managed and released.
4. **`docs/guides/self-hosting.md`** — Deployment and infrastructure context.
5. **Browse `docs/features/`**, **`docs/guides/`**, and **`docs/architecture/`** — Read anything relevant to the area you'll be working in. `docs/archive/` holds finished or retired docs (old roadmap, old handoff, the frozen feature list); read them only for history.

**Important:** The documentation may not always be current — features evolve faster than docs get updated. Use the docs to understand intent, scope, and the big picture. Then verify against the actual code.

### Then Read the Actual Code

The code is the truth. When docs and code conflict, the code wins — but flag the discrepancy to the developer so the docs can be updated.

**Understand the structure:**
- List the full directory trees for `client/src/`, `server/`, `shared/schema/`, and `docs/`
- Read `package.json` — every dependency, every script, every config entry
- Read `tsconfig.json`, `vite.config.ts`, Tailwind config, `drizzle.config.ts`

**Understand the database layer:**
- Read `shared/schema/index.ts` (the barrel export — all schema imports flow through here)
- Read each of the 15 domain schema files: `auth.ts`, `email.ts`, `projects.ts`, `products.ts`, `ai.ts`, `customers.ts`, `config.ts`, `dashboard.ts`, `map.ts`, `docs.ts`, `access-control.ts`, `archive.ts`, `misc.ts`, `competitors.ts`, `assumptions.ts`
- Read `server/storage.ts` — this is the entire data access layer. Understand how queries are structured.
- Read `server/db.ts` and `server/db-bootstrap.ts` — database connection and environment detection

**Understand the backend:**
- Read `server/routes.ts` fully — every API route, every middleware
- Read `server/routes/dashboard-routes.ts` and `server/routes/docs-routes.ts`
- Read `server/index.ts` — the app entry point and middleware chain
- Scan `server/auth/`, `server/services/`, `server/email/`, `server/webhooks/` for patterns

**Understand the frontend:**
- List `client/src/pages/` — every route page
- List `client/src/components/` — understand the feature-folder organization (33+ feature folders)
- Read `client/src/components/ui/` — these are the shadcn/ui base primitives
- Read `client/src/components/layout/` — PageLayout, sidebar, header
- Read `client/src/hooks/` — especially `useChartTheme`, `useToast`, and any shared hooks
- Read a few representative feature components to absorb the patterns (e.g., a list page with filters, a form page, a detail page with drawers)

**Understand the build:**
- Read the `npm run build` chain and all 15 lint gate scripts
- Understand that type-checking (`tsc`) is NOT in the production build — it's developer-time only

### Critical Version Awareness

This stack uses bleeding-edge versions. Your training data may be stale on their APIs. Verify these against `package.json` on each session, and use web search when you encounter unfamiliar APIs:

- **Express 5** (not Express 4) — different error handling, removed `app.del()`, path route matching changes, promise-based middleware
- **TypeScript 6** — very recent release, verify API changes before assuming syntax
- **Zod 4** (not Zod 3) — different schema API, new `z.pipe()`, changed `.refine()` behavior
- **React 19** — concurrent features, `use()` hook, new form actions, `ref` as prop
- **Tailwind CSS 4** — CSS-first configuration (not `tailwind.config.js`), `@theme` directive, new color system
- **Vite 8** — verify config options, plugin API may have changed from earlier versions
- **Drizzle ORM 0.45+** — active development, query builder API and migration tooling shift between minor versions
- **React Hook Form 7.72+ with `@hookform/resolvers` 5.x** — resolver v5 works with Zod 4

When in doubt about any of these APIs, search the current documentation before writing code.

---

## Step 2: Follow What You Learned

After reading the codebase, you know how this app is built. Every change you make must be consistent with the patterns you observed. Here are the key conventions to reinforce — but these are reminders of what you'll see in the code, not replacements for reading it.

### File Organization
- Components live in **feature folders** (`map/`, `dashboard/`, `accounts/`), not by type
- `ui/` is only for generic shadcn/ui primitives
- `shared/` is for utilities used across 3+ feature areas
- Files should stay under ~800 lines. When they grow past that, split into `-types.ts`, `-utils.ts`, and sub-components
- Naming: kebab-case files, PascalCase components, camelCase utilities

### Database & Schema
- All imports from `@shared/schema` (the barrel). Never from individual domain files.
- New tables go in the correct domain file based on their purpose — there are 15 domain files, consult the barrel export for the current list
- Table definitions, relations, Zod schemas, and TypeScript types stay together
- Data access methods go in `server/storage.ts` — no raw SQL in route handlers

### Frontend
- **Every component must support dark mode.** Look at the existing `dark:` class patterns and match them exactly.
- **Every component must support multi-language via i18n.** All user-facing strings must use i18n translation keys — never hardcode English text. The app uses `react-i18next` with the `useTranslation` hook and supports 6 languages. Follow the existing key naming patterns in the translation files. When creating or modifying any component, ensure every label, button, placeholder, tooltip, error message, and status text goes through `t()`. If a translation key doesn't exist yet, add it to `en-US.json` **and** to the other five locale files (`de-DE`, `es-ES`, `fr-FR`, `it-IT`, `pt-BR`) in the same change, with real translations — never an English copy or a `[TODO]` value. `client/src/i18n/__tests__/locale-parity.test.ts` fails the build if any en-US key is missing from another locale.
- Charts use the `useChartTheme` hook
- Pages use the `PageLayout` component
- Toasts use semantic variants via `useToast()`
- Destructive actions use `ConfirmationDialog`
- List pages use `SearchFiltersSection` + `FilterMultiSelectButton`
- Table actions use `ResponsiveTableActionsMenu`
- **Every table has sortable column headers.** Header cells use `SortableTableHead` (`client/src/components/ui/sortable-table.tsx`) with `useUrlSortState` + `sortRows` from `client/src/lib/sorting.ts`; never a bare `TableHead`/`<th>`. Only action columns are `sortable={false}`. See `docs/features/standard-table-pattern.md`
- Navigation follows the 3-Tier URL-parameter architecture. Sidebar entries are defined once in `client/src/components/layout/sidebar-nav-config.ts` (grouped, max two levels — deeper levels belong in the page's in-page "View:" switcher); never hand-wire menu items in `sidebar.tsx`
- **Status pills (Internal Project Status, Account/Customer Status) use the shared `<StatusBadge>`** at `client/src/components/shared/StatusBadge.tsx`. It is the canonical render path for any value sourced from `/api/status-configs` or `/api/customer-status-configs` (the two endpoints admins edit at Configuration → Field Settings). Do NOT hand-roll a `<Badge>` with inline `backgroundColor` from a status config — every such call site has historically drifted on size, dark mode, and Tailwind syntax, and one of those drifts (the `bg-[--var]` shorthand silently dropped by Tailwind 4) landed in production. The component supports two visual variants (`solid` for table cells and white card surfaces, `darkRail` for badges sitting on a saturated gradient header) and three sizes; add new presets to the component rather than forking it inline.

### Backend
- API routes go in the domain route files under `server/routes/` (`*-routes.ts`), registered from `server/routes.ts`
- Data access goes in `server/storage.ts`
- Background services go in `server/services/`
- Auth logic stays in `server/auth/`
- This is **Express 5** — use its error handling patterns, not Express 4 patterns

### What NOT to Do
- Don't introduce new patterns when existing ones cover the use case
- Don't add dependencies without explaining why existing tools can't do the job
- Don't modify auth or security code without presenting the change first
- Don't skip dark mode on any UI component
- Don't skip i18n on any user-facing string
- Don't hardcode English text in components — use translation keys
- Don't hardcode values that should be configurable
- Don't put data access logic in route handlers — it goes in storage.ts
- Don't assume Zod 3 or Express 4 APIs — verify against the actual versions installed

### Net-new app: no conversions, redirects or legacy notes
CriteriaIQ has not been rolled out yet. No install holds real customer data: the data in every environment is demo data, which Demo Mode can wipe and reseed at any time. Until that changes, build every change as if the app were brand new:
- **Removing or reshaping a feature:** delete it outright. Don't write data conversions or backfills, redirects for old URLs, tabs or query params, backward-compatible stubs or shims, or code kept "for old rows".
- **Schema changes:** still add an idempotent migration and refresh the snapshot (`lint:schema`, below), because each environment applies migrations at boot. The migration only creates, alters or drops; it never converts existing rows.
- **Demo Mode:** the seed builds data for the current design only, as if a removed feature had never existed. After a wipe and reseed, nothing in the app should mention it.
- **Docs, UI text and changelog entries:** describe the app as it is. Don't add "retired", "formerly", "replaced" or migration-history notes for removed features; delete their docs and mentions instead.

When the app goes live with real customers, this section must be revisited. From then on, data migrations and link redirects matter again.

---

## Step 3: When You Don't Know, Ask the Code

If you're unsure how to implement something:

1. **Check `docs/`** for relevant feature documentation or architecture guides
2. **Find a similar feature in the codebase** and follow its pattern
3. **Check `PROJECT_REFERENCE.md`** for the documented convention
4. **If all three are silent**, propose your approach and ask the developer before implementing

The goal is consistency. A feature built by you should be indistinguishable from the existing codebase.

---

## Step 4: Identify and Suggest Skills

As you learn the codebase and work on features, stay aware of tooling that can improve your quality and speed.

### Spot Patterns That Should Become Custom Skills
As you read the code and build features, you'll notice recurring implementation patterns — the same sequence of steps, the same file-creation checklist, the same conventions applied every time. When you spot one, flag it to the developer as a candidate for a custom skill. Examples of what to look for:

- Every new list page follows the same filter/table/drawer structure
- Every new schema table requires the same sequence: domain file → barrel export → storage.ts method → API route → UI component
- Dark mode and i18n compliance follow the same verification checklist on every component
- Specific deployment, testing, or build validation steps that repeat across features

Tell the developer what the pattern is, why it would benefit from being a skill, and what the skill would automate or enforce.

### Use Existing Skills When They Help
Evaluate the skills and tools already available to you. When a task aligns with an existing skill — code review, testing, design, diagram generation, web search for API docs — use it rather than doing everything manually. Don't default to brute force when a purpose-built tool exists.

### Suggest Skills That Should Be Added
If you encounter a gap — a task you perform repeatedly that no existing skill covers, a quality check that should be automated, or a workflow that could be streamlined with a dedicated tool — suggest it to the developer. Be specific about what the skill would do, when it would trigger, and what value it adds. The developer decides whether to build it.

---

## 5. Developer Operations & Security Posture (Self-Hosted)

CriteriaIQ is self-hosted (Docker image deployed with Dokploy/Coolify, or any Docker host).

### Security Posture
Default to an **Identity-Centric / Zero Trust** posture.
- Session-based auth with secure cookies + CSRF
- bcrypt password hashing
- TOTP + WebAuthn (passkeys) + encrypted recovery codes
- AES-256-GCM encryption for API keys and secrets
- RBAC with hierarchical sub-section permissions
- Rate limiting on auth endpoints

### Audit Protocols
- **Security:** Missing input validation (Zod), SQLi, XSS, CSRF coverage, session hijacking, rate limiting gaps.
- **Database:** Schema design, migration status, connection pooling.
- **DevOps:** Build pipeline health, lint gates, type-check status.

### Build Pipeline
- **Type-checking is NOT in the production build** (memory constraints).
- Run `npm run check` locally before pushing.
- The build chain enforces 15 lint gates: toasts, api-request-json, version, traefik, dokploy-app-labels, healthcheck, slow-save, slow-save-payload, db-pool, proxy-timeouts, self-hosting-traefik, heavy-imports, i18n, doc-dates, schema.
- Frontend: Vite build → Backend: esbuild → docs bundling → verify-prod-bundle.

### Mandatory pre-push verification

**Run `npm run build` locally before every `git push`**, no exceptions. The 15 lint gates take ~10 seconds total and catch the entire class of bugs that previously broke the Dokploy deploy:

- Stale doc references after a file rename (e.g. renaming the architecture reference to `PROJECT_REFERENCE.md` left a `lint:slow-save` script reading the old path).
- New files containing reserved tokens (`@managed-version`, `data-testid` patterns, `bg-white` without `dark:` siblings) without registering them in the right allowlist.
- Lint gate regex changes that haven't been smoke-tested.

The deploy build runs the same command. If `npm run build` passes locally, the deploy build will get past the lint chain. If it fails locally, do NOT push — fix it first.

If `node_modules` isn't installed yet on a fresh clone:
```bash
npm install --no-audit --no-fund --legacy-peer-deps
```
First install is ~3 minutes; subsequent `npm run build` runs are ~30 seconds.

If the full build is too slow during rapid iteration, the lint-only subset is also acceptable:
```bash
npm run lint:toasts && npm run lint:api-request-json && npm run lint:version \
  && npm run lint:traefik && npm run lint:dokploy-app-labels && npm run lint:healthcheck \
  && npm run lint:slow-save && npm run lint:slow-save-payload && npm run lint:db-pool \
  && npm run lint:proxy-timeouts && npm run lint:self-hosting-traefik \
  && npm run lint:heavy-imports && npm run lint:i18n && npm run lint:doc-dates \
  && npm run lint:schema
```

> **`lint:schema` — schema-vs-migration gate.** Whenever you change a
> table's columns, named unique constraints, or composite primary keys in
> `shared/schema/*.ts`, you MUST (1) add an idempotent
> `migrations/NNN_*.sql` for the change — prod applies these at boot via
> `server/lib/migrations-runner.ts`; **`drizzle-kit push` is NOT run on
> redeploy** — and (2) run `npm run schema:snapshot` to refresh the
> committed `shared/schema-snapshot.json`. The gate fails the build (with
> a per-column diff) if the snapshot is stale, so a schema change can
> never silently ship without a migration. This gate exists because the
> v0.7.50 Microsoft Graph email columns were added to the schema with no
> migration, 500ing the Email Configuration page in production.
Every deploy break in this codebase's history has been a lint gate, never a Vite/esbuild compile error. So lint-only is the minimum acceptable pre-push check.

### Workflow Protocols
1. Understand requirement fully.
2. Check `PROJECT_REFERENCE.md` and `docs/`.
3. Verify change won't break lint gates.
4. After change: Verify dark mode and i18n compliance.
5. If schema changed: Verify barrel export and migration plan.
6. Update relevant docs if behavior changed: the feature's doc in `docs/features/` (create one for a new feature), `PROJECT_REFERENCE.md` only when a convention or architecture rule changed, and `docs/plans/backlog.md` for follow-ups you are deferring.
7. **Run `npm run build` locally — see "Mandatory pre-push verification" above. Push only if it passes.**

### Branch hygiene & merge policy

**Default merge strategy: "Create a merge commit"** (the plain "Merge" button on GitHub PRs). This preserves the original commit SHAs from the branch on `main`, so post-merge a `branch...main` comparison shows 0 commits ahead — phantom-ahead conditions become impossible. Squash-merge and rebase-merge remain enabled in repo settings for cases where a squash is genuinely wanted (e.g. a multi-WIP-commit PR that should land as one logical change), but they are NOT the default.

**Repo settings in force** (verified via `gh api repos/egarlepp/criteriaiq`):
- `allow_merge_commit: true` ← default button
- `allow_squash_merge: true` ← available via dropdown for the few cases that need it
- `allow_rebase_merge: true` ← available via dropdown
- `delete_branch_on_merge: true` ← the source branch is auto-deleted on the remote immediately after merge; no more lingering refs to accidentally reuse

**Primary rule — one PR per feature, fresh branch off main:**
- Cut each branch fresh from `origin/main` (`git fetch origin main && git switch -c feat/v0.X.YZ-<slug> origin/main`).
- Branch names describe a single deliverable (`feat/v0.7.52-error-filters`, `feat/v0.7.52-csv-import`). Do NOT reuse a generic `feat/v0.X.Y-next` across multiple PRs; each PR's branch is short-lived and gets auto-deleted on merge.
- After every PR merge, **`git fetch --prune` locally** to drop the local tracking ref for the now-deleted remote branch. (Auto-delete on the remote handles the remote side; `--prune` handles the local-clone side.)

**When to override the default and pick a different strategy from the dropdown:**
- **Squash-merge** — for release commits (`release: v0.X.YZ — ...`) where the changelog already captures the detail and you want one clean commit on `main` for that version cut. Also fine for a PR with many WIP commits whose individual messages aren't worth preserving.
- **Rebase-merge** — rarely needed. Pick this if you specifically want each branch commit to appear on `main` without a merge commit (linear history).

**Recovery — if phantom-ahead state already exists on an open PR** (e.g. you reused a branch that had a prior squash-merge land on main, before `delete_branch_on_merge` was on):
```bash
git fetch origin main
git diff --stat origin/main HEAD           # 0 lines = the branch tree already matches main; safe to delete
# If there ARE differences, identify which commits are truly new:
git log --oneline origin/main..HEAD
git reset --hard origin/main
git cherry-pick <only the truly-new commit hashes>
git push --force-with-lease
```

### Local Development Server

For running CriteriaIQ locally on Windows for UI work and visual troubleshooting (Claude in Chrome extension):

**Full setup guide:** [`docs/guides/local-dev-setup.md`](docs/guides/local-dev-setup.md)

Key points for Claude sessions:
- Start via `preview_start "App (full-stack)"` — the `.claude/launch.json` in the active worktree is pre-configured for Windows
- The `.env` file in the repo root holds local DB URL and secrets — gitignored, never commit. The clone path differs per machine, so `launch.json` loads it via the relative `--env-file=.env`; never hardcode an absolute path
- Local Postgres runs as a Docker container (`criteriaiq-dev-db`), isolated from production
- **`data/db-config.json`** is written on first boot and takes **priority over `DATABASE_URL`** — if the server connects to the wrong database, delete this file and restart
- Bootstrap admin credentials: `admin@criteriaiq.local` / `Admin1234!`
- `reusePort` is already conditionally skipped on `win32` in `server/index.ts` — no action needed

---

## 6. Open follow-ups (deferred work)

These are tracked here so future sessions can pick them up without re-discovering them. None are blocking; do them when you're already touching the affected area.

### App-wide dark-mode saturation pass — phased rollout planned

`client/src/components/map/` has been fully swept (Phase 8 followup; saturated `bg-X-500` → `dark:bg-X-600`, etc.). The full rollout for the remaining ~280 components is planned in **[`docs/plans/dark-mode-sweep-plan.md`](docs/plans/dark-mode-sweep-plan.md)** as 6 phases (A–F) ordered by user-traffic and risk gradient. End state: every folder under `client/src/components/` (except `ui/` which uses CSS variables and adapts automatically) is fully covered, then a strict `lint:dark-mode` build gate gets added with an `.dark-mode-exempt.txt` allowlist for the few intentional exceptions.

Use the [`/dark-mode-sweep`](.claude/skills/dark-mode-sweep/SKILL.md) skill to drive each phase.

### Phase 7 — `server/storage.ts` split (COMPLETED)

`server/storage.ts` went from 11,522 → 843 lines (–93%) across Phase 7 #1-#28 plus the post-Phase-7 `IStorage` interface trim. The `DatabaseStorage` class is now an empty shell whose methods are composed entirely from 28 domain mixins under `server/storage/`:

- `core` (User + Dashboard Metrics + Project ops), `criteria`, `products`, `dashboard-stats`, `users`, `activity`, `requests`, `custom-reports`, `roles`, `audit-risk`, `infrastructure`, `security`, `dashboard`, `project-resources`, `pcos`, `validation-criteria-templates`, `industries`, `mfa`, `email`, `map`, `archive`, `customer-access`, `status-configs`, `end-date-flags`, `tags`, `seeders`, `value-journey`, `backfills`.

The pattern is documented in `server/storage/_mixins.ts`. Each mixin uses bare schema imports (or the `import * as schema` pattern for archive's broad surface). Cross-mixin calls (e.g. `this.getProjectAuditCount()` from `core` reaching into `audit-risk`) work through the prototype chain at runtime; tsc resolves them via small phantom interfaces declared on each mixin (e.g. `AuditCountShape`).

Two shared helpers live at `server/storage/_errors.ts` (RestoreUserEmailConflictError + sanitizeCustomerFolder) — extracted to break the import cycle between `archive.ts` and `storage.ts`.

When adding a new method, place it in the matching mixin file (or create a new mixin if the domain is new). Avoid putting new methods in `server/storage.ts` itself — that file should stay thin.

### Other deferred items

- **i18n chip-away — phased rollout planned.** Allowlist coverage is 7 of 297 files (~2.4%) today. The full rollout for converting hardcoded English to `t()` calls across the remaining components is planned in **[`docs/plans/i18n-sweep-plan.md`](docs/plans/i18n-sweep-plan.md)** as 8 phases (1–8) ordered by user-traffic, with translator-batch boundaries between phases so non-English locales catch up incrementally. End state: gate inverts (allowlist → exempt-list) when ≥80% coverage is reached. To add a new language, see **[`docs/guides/adding-a-new-language.md`](docs/guides/adding-a-new-language.md)** — the system is set up so it's a 4-edit operation plus translator hand-off. Use the [`/i18n-extract`](.claude/skills/i18n-extract/SKILL.md) skill to drive each phase.
