# CriteriaIQ Version Update Guide

> **Last Updated:** April 30, 2026  
> **Current Version:** v0.12.0 <!-- @managed-version: written by ./update-version.sh from version.json -->

This document describes the complete version update process for CriteriaIQ, including all files that need to be updated, the order of updates, and the content format for each file.

## Quick Reference

When updating the version, simply tell the agent: **"Update version to vX.X.XX"** and provide the new features/changes to document. The agent will use this guide to update all necessary files.

> **Single source of truth (task-389):** the build version displayed across every UI surface — the **login footer**, **setup footer**, **sidebar**, **About → Introduction "Recent Updates (vX)" header**, and the **Flight Deck "What's New!" widget** — is read from `version.json` via `/api/version`. To bump the build version, edit `version.json` (or run `./update-version.sh <new-version>`) and **nothing else**. Do not re-introduce a hardcoded `CURRENT_VERSION` constant in `client/src/components/about/RecentUpdatesContent.tsx`; the source-level regression tests at `client/src/components/about/__tests__/IntroductionTab.version-source.test.ts` and `client/src/components/flight-deck/__tests__/FlightDeckModal.version-source.test.ts` will fail if you do.

> **Doc-marker sweep (task-393):** the same `./update-version.sh <version>` invocation now also rewrites the version literal on every line of the long-form reference docs that carries an `<!-- @managed-version: ... -->` HTML-comment marker — top-of-doc `Version:` / `Application Version:` / `Current Stage:` / `Current Version:` headers and the `Recent Updates (vX)` / `Recent Achievements (vX)` section headers in `project-overview.md`, `design-document.md`, `workflow-diagram.md`, `deployment.md`, `navigation-sitemap.md`, `api-reference.md`, `email-triggers-reference.md`, and this file. **Do not hand-edit those literals.** To audit what the script will touch, run `grep -rn '@managed-version' docs/`. To extend the sweep to a new doc, add a marker to the line and add the file to the `MANAGED_DOCS` list in `update-version.sh`. Append-only history (the `Version History` table below, "Previous Updates" / "Older Achievements" sections, and "Version System Update" changelog bullets) is intentionally **not** marked — those literals describe a fixed historical event and must not change on a version bump.

## Version Format

- **Format:** `vMAJOR.MINOR.PATCH` (e.g., v0.10.3)
- **Patch** rises automatically after every merge to main. `.github/workflows/version-patch.yml` runs `./update-version.sh --patch`, which sets `version` to the last release plus the number of commits merged since it, and commits `version.json` as `chore(version): vX.Y.Z`. Nothing else changes: no changelog, no Recent Updates, no doc markers. PRs never edit `version.json`, so open PRs can't conflict over it.
- **Minor** rises only when a release is cut with the `/version-bump` skill (`./update-version.sh vX.Y.0`), which resets the patch to 0 and writes up every change since the previous release. **Major** (v1.0.0) is a deliberate, separate decision.
- `version.json` holds `version` (what the app shows), `release` (the last cut) and `updates` (the interim updates in the current release). `@managed-version` doc markers and `lint:version` follow `release`.
- **Interim updates.** `--patch` (`scripts/version-patch.mjs`) also rebuilds `updates` from git history: one row per first-parent commit since the release, newest first, as `{ version, date, pr, title, category }`. The title is the merged PR's title (a GitHub merge commit's body, or a squash subject minus its `(#N)`), so **the PR title is the interim release note** — write it for a reader. A release cut writes `"updates": []`, so the list only ever covers the current release. Internal users see it by clicking the version under the CriteriaIQ logo and in About → Introduction's Recent Updates card (which shows only this list, not the release highlights), from `GET /api/version/updates` (signed-in internal users only; PR titles can name internal or security work, so Customer, Guest and Partner get 403 and see the plain version). Titles are not translated.
- **Update categories.** Each interim update carries one of the four Change Categories below (`security`, `feature`, `improvement`, `fix`; list in `shared/version-updates.ts`), and both the version popover and Introduction show it as a colored heading (🔒 Security & Compliance, 🆕 New Features, 🔧 Improvements, 🐛 Fixes), laid out like ImpactIQ's What's new. The popover shows the newest three and folds the rest into "Earlier updates"; Introduction lists them all. `scripts/version-patch.mjs` (`categorizeUpdate`) picks the category, first match wins: a `Release-Category: <category>` trailer on any commit in the PR; a `[Security]` / `[Feature]` / `[Improvement]` / `[Fix]` tag at the start or end of the PR title (removed from the shown title); dependency updates → Security; security words in the title (security, vulnerability, CVE, XSS, CSRF, SSRF, injection, harden, MFA, lock down, staff only) → Security; a title starting with "Fix" (after an `Area:` label) → Fixes; the conventional type of the PR's first non-docs/chore/test commit (`feat` → New Features, `fix` → Fixes, `fix(security)` → Security, `perf`/`refactor`/`style` → Improvements; a plain "Add …" commit → New Features); otherwise Improvements. To set a category on purpose, tag the PR title or add the trailer. Rows written before categories existed read as Improvements until the next merge rebuilds the list.
- **Major Release Change Log.** The About → Introduction button (formerly "View Change Log") and its drawer show only the rolled-up release entries `/version-bump` writes in `ChangeLogDrawer.tsx`; interim updates never appear there.
- If a release PR conflicts on `version.json` because patch commits landed on main meanwhile, keep the release branch's `version.json`.
- **Build Date:** ISO 8601 format `YYYY-MM-DDTHH:MM:SSZ`

## Change Categories

All changes MUST be categorized into one of the following four categories. Each category has a designated icon, color, and border style for consistent presentation across all documentation and UI components.

### Category Definitions

| Icon | Category | Color | Border Class | Description |
|------|----------|-------|--------------|-------------|
| 🔒 | **Security Changes** | Red | `border-red-500` | Security-related fixes, dependency updates with security implications, architecture changes for security, authentication/authorization updates |
| 🆕 | **New Features** | Green | `border-green-500` | Anything newly added to the application - new pages, features, functions, systems, or capabilities |
| 🔧 | **Improvements** | Blue | `border-blue-500` | Enhancements to existing features and functions - UI polish, performance improvements, UX refinements, code quality improvements |
| 🐛 | **Fixes** | Orange | `border-orange-500` | Bug fixes, error corrections, issues resolved with features, functions, pages, or data handling |

### Styling Guide

#### ChangeLogDrawer.tsx (Change Log Accordion)

Each category section uses a colored left border and styled header:

```tsx
{/* Security Changes - Red */}
<div className="border-l-4 border-red-500 pl-4">
  <h4 className="font-semibold text-red-600 dark:text-red-400 mb-2">
    🔒 Security Changes
  </h4>
  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
    <li>• Change description here</li>
  </ul>
</div>

{/* New Features - Green */}
<div className="border-l-4 border-green-500 pl-4">
  <h4 className="font-semibold text-green-600 dark:text-green-400 mb-2">
    🆕 New Features
  </h4>
  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
    <li>• Feature description here</li>
  </ul>
</div>

{/* Improvements - Blue */}
<div className="border-l-4 border-blue-500 pl-4">
  <h4 className="font-semibold text-blue-600 dark:text-blue-400 mb-2">
    🔧 Improvements
  </h4>
  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
    <li>• Improvement description here</li>
  </ul>
</div>

{/* Fixes - Orange */}
<div className="border-l-4 border-orange-500 pl-4">
  <h4 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">
    🐛 Fixes
  </h4>
  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
    <li>• Fix description here</li>
  </ul>
</div>
```

#### Documentation Files (Markdown)

Use the emoji icons and bold colored text references:

```markdown
### Recent Updates (vX.X.XX)

**🔒 Security Changes**
- Description of security update

**🆕 New Features**
- Description of new feature

**🔧 Improvements**
- Description of improvement

**🐛 Fixes**
- Description of fix
```

### Category Order

Always present categories in this order:
1. 🔒 Security Changes (most critical first)
2. 🆕 New Features (what's new)
3. 🔧 Improvements (enhancements)
4. 🐛 Fixes (bug fixes last)

**Note:** Only include categories that have changes. If a version has no security changes, omit that section entirely.

## Files That Require Updates

### 1. Primary Version Source

| File | What to Update |
|------|----------------|
| `version.json` | `version`, `release` and `buildDate` — single source of truth read by `/api/version`; `./update-version.sh vX.Y.0` sets both `version` and `release`, the CI patch job raises `version` only |

### 2. Documentation Files (/docs/) — auto-managed by `update-version.sh`

`./update-version.sh <version>` rewrites the version literal on every line in
these files that carries an `<!-- @managed-version: ... -->` marker. **Do not
hand-edit those literals.** Hand-edit only the surrounding prose (the
"Recent Updates" / "Recent Achievements" body that describes what changed in
the new version).

| File | Auto-managed line(s) | Hand-edit on each release |
|------|----------------------|---------------------------|
| `docs/architecture/project-overview.md` | `Current Stage: Live (vX)`, `### 🎖️ Recent Achievements (vX)` | Achievement bullets under the section header |
| `docs/architecture/design-document.md` | `- **Application Version:** vX`, `### Recent Updates (vX)` | Update bullets under the section header |
| `docs/architecture/workflow-diagram.md` | `- **Application Version:** vX`, `### Recent Updates (vX)` | Update bullets under the section header |
| `docs/guides/deployment.md` | `## Recent Updates (vX)` | Update bullets under the section header |
| `docs/architecture/navigation-sitemap.md` | `> **Version:** vX` | (none — header only) |
| `docs/guides/api-reference.md` | `**Version:** vX` | (none — header only) |
| `docs/features/email-triggers-reference.md` | `**Version:** vX` | (none — header only) |
| `docs/guides/version-update-guide.md` | `> **Current Version:** vX` | Add a row to the `Version History` table at the bottom |

To audit: `grep -rn '@managed-version' docs/`. To extend the sweep to a new
doc, add the marker to the line and add the file to `MANAGED_DOCS` in
`update-version.sh`.

#### Drift guard — `pnpm lint:version` (task-397)

The doc-marker sweep above only protects us if everyone runs
`./update-version.sh`. To catch hand-edits, direct edits to
`version.json`, or a forgotten sweep, the repo ships
`scripts/check-managed-version-markers.ts`, exposed as:

```bash
npm run lint:version
```

It walks the whole repo, finds every line containing `@managed-version`,
and asserts the first `vN.N.NN` literal on that line equals
`version.json`'s `version`. It exits non-zero with a precise
`file:line: found vA.B.C, expected vX.Y.Z` report on any mismatch. The
same check runs as a vitest spec
(`scripts/check-managed-version-markers.test.ts`) so `npm test` catches
drift in CI without any extra wiring. Marker lines whose literal is the
documentation placeholder `vX.X.XX` (the markdown examples in this file
and the example comment in `update-version.sh`) carry no numeric
literal and are intentionally skipped.

It additionally parses the `MANAGED_DOCS=( ... )` array out of
`update-version.sh` and asserts the set of files carrying a marker is
exactly `MANAGED_DOCS` plus a small infrastructure allow-list (the
release script itself, the checker, and its test file). This catches
the silent-skip failure mode where someone adds a marker to a brand-new
doc but forgets to register it: the literal looks in-sync today, but
every subsequent release would skip the file and the literal would rot
(task-403). The mirror case — a file in `MANAGED_DOCS` that no longer
carries a marker — is reported the same way. Fix either by adding the
new path to `MANAGED_DOCS` in `update-version.sh`, or by removing the
stale registration.

#### Build gate — chained into `npm run build` (task-467)

Running the lint locally and via vitest still leaves room for a stale
marker to slip through if a contributor never runs either command. To
close that gap, `npm run lint:version` is also chained into the
production build, immediately ahead of `vite build` (alongside
`lint:toasts`):

```jsonc
// package.json
"build": "npm run lint:toasts && npm run lint:version && vite build && ..."
```

A failing drift check therefore short-circuits the build with a
non-zero exit code before any bundle artefacts are produced, so a stale
`vN.N.NN` marker — anywhere in the repo — can no longer reach a
published bundle. If `npm run build` fails with a `FAIL: ... lines out
of sync with version.json` report, run `./update-version.sh <version>`
(or fix `version.json`) and re-build; do not bypass the check.

### 3. UI Components

| File | Update Type | Details |
|------|-------------|---------|
| `client/src/components/about/ChangeLogDrawer.tsx` | Version History Accordion | Add new accordion tab for the version in the Change Log drawer |
| `client/src/components/about/RecentUpdatesContent.tsx` | Recent Updates Card body | Update the "NEW:" items shown in the Flight Deck "What's New!" widget (the Introduction page's Recent Updates card lists interim updates instead) |

**IMPORTANT:** The changelog and introduction are split across TWO files:
1. **ChangeLogDrawer.tsx** - Add a new accordion tab with the version features (this is the Change Log sliding drawer content)
2. **RecentUpdatesContent.tsx** - Update only the Recent Updates body (CardContent showing "NEW:" items with amber icons and green checkmark items). The "Recent Updates (vX)" header and the Flight Deck "What's New!" version line are wired to `/api/version` automatically — **do not** add a `CURRENT_VERSION` constant here.

> **Removed (task-389):** the previous `CURRENT_VERSION` export in `RecentUpdatesContent.tsx` and the related fallback strings in `client/src/components/sidebar.tsx` and `client/src/pages/landing.tsx` are gone. All five UI surfaces now resolve the version through `/api/version`.

## Update Order

Execute updates in this order to maintain consistency:

1. **`./update-version.sh <version>`** — writes `version.json` (drives every UI surface via `/api/version`) **and** rewrites all `@managed-version` literals across the long-form docs in one shot
2. **Documentation files** — hand-edit the surrounding "Recent Updates" / "Recent Achievements" prose to describe the new release (the version literal in the section header is already done)
3. **`docs/features/`** — add a feature doc if you shipped a new feature
4. **ChangeLogDrawer.tsx** — Add new version accordion tab in the Change Log drawer
5. **RecentUpdatesContent.tsx** — Update Recent Updates body (the "NEW:" items)

## File-Specific Update Instructions

### version.json

```json
{
  "version": "vX.X.XX",
  "release": "vX.X.XX",
  "buildDate": "YYYY-MM-DDTHH:MM:SSZ",
  "gitCommit": "brief-description-of-main-feature",
  "environment": "production"
}
```

### Documentation Headers

The version literal in these headers is rewritten by `update-version.sh` —
the marker is what you keep, the literal is what gets bumped:

```markdown
> **Version:** vX.X.XX <!-- @managed-version: written by ./update-version.sh from version.json -->  
> **Last Updated:** Month DD, YYYY
```

(`docs/architecture/navigation-sitemap.md`, `docs/guides/api-reference.md`,
`docs/features/email-triggers-reference.md` all use this format.)

### Recent Updates Sections

For `design-document.md`, `workflow-diagram.md`, `deployment.md` — the
section header (with the version literal and the marker) is auto-managed;
the bullets underneath are hand-edited to describe the new release:

```markdown
### Recent Updates (vX.X.XX) <!-- @managed-version: written by ./update-version.sh from version.json -->

**Feature Name (vX.X.XX)**
- Description of feature 1
- Description of feature 2
```

> The `**Feature Name (vX.X.XX)**` line *inside* the section is hand-edited
> historical content — it tags the feature with the version it shipped in,
> not the current build version, so it is intentionally not marked.

### project-overview.md Achievements

```markdown
### 🎖️ Recent Achievements (vX.X.XX) <!-- @managed-version: written by ./update-version.sh from version.json -->

**Feature Name (vX.X.XX)**
- Achievement description
```

### ChangeLogDrawer.tsx Version Accordion

Add a new AccordionItem for each version inside the `<Accordion>` in `client/src/components/about/ChangeLogDrawer.tsx`. Place new versions at the TOP of the accordion (before existing entries). Also update the `defaultValue` prop on the `<Accordion>` to match the new version:

```tsx
<AccordionItem
  value="vX.X.XX"
  className="border dark:border-gray-700 rounded-lg px-4 bg-white dark:bg-gray-800"
>
  <AccordionTrigger className="hover:no-underline">
    <div className="text-left">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Version X.X.XX
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        <strong>Month DD, YYYY</strong> - Brief Summary
      </p>
    </div>
  </AccordionTrigger>
  <AccordionContent className="pt-4">
    <div className="space-y-4">
      {/* Use the 4 category sections (Security, New Features, Improvements, Fixes) as needed */}
    </div>
  </AccordionContent>
</AccordionItem>
```

### Fallback Versions

There are no longer any fallback version literals to bump. Task-380 / 383 / 389 replaced every hardcoded fallback (sidebar, landing footer, About header, Flight Deck "What's New!" widget) with a render through `<AppVersionLabel />` / `<AppVersionInline />` driven by `/api/version`. When the API can't read `version.json`, the surfaces show the literal `"unknown"` sentinel with the shared amber+italic+tooltip cue instead — never a stale-looking version literal. Bumping the version is therefore strictly a `version.json` (or `./update-version.sh <version>`) edit.

## Feature Documentation Format

When documenting new features for a version update, include:

1. **Feature Name** - Clear, descriptive title
2. **Category** - What area of the app it affects
3. **Description** - What the feature does
4. **Technical Details** (optional) - Implementation specifics for the feature's doc in `docs/features/`

## Checklist for Version Updates

- [ ] Run `./update-version.sh <version>` — writes `version.json` AND rewrites every `@managed-version` literal across the long-form docs in one shot
- [ ] Hand-edit the new release's bullets in `project-overview.md` Recent Achievements section
- [ ] Hand-edit the new release's bullets in `design-document.md` Recent Updates section
- [ ] Hand-edit the new release's bullets in `workflow-diagram.md` Recent Updates section
- [ ] Hand-edit the new release's bullets in `deployment.md` Recent Updates section
- [ ] Add a row to the `Version History` table at the bottom of this file
- [ ] If a new feature shipped, add its doc under `docs/features/`
- [ ] Add new version accordion entry to `ChangeLogDrawer.tsx` (Version History Accordion in Change Log drawer)
- [ ] **Update Recent Updates body in `RecentUpdatesContent.tsx`** (the "NEW:" items shown in the Flight Deck widget)
- [ ] `grep -rn '@managed-version' docs/` — confirm every marked line shows the new version
- [ ] Verify the version displayed in the sidebar, login footer, setup footer, About → Introduction "Recent Updates (vX)" header, and Flight Deck "What's New!" widget all match the new `version.json` value

## Staged Features (pending version bump)

No features are currently staged for the next release.

---

## Version History

| Version | Date | Main Features |
|---------|------|---------------|
| v0.12.0 | 2026-11-17 | Value Journey, Customer Workspace (project page + Account Portal) with Messages & Calendar, Resource Content, CRM-Linked Accounts & Contact Import, Teams from SSO/CRM, Evaluation Requests Page, MAP Drawer & Reports Redesign, Full Demo Mode, Major Dependency Upgrades |
| v0.11.0 | 2026-10-30 | Teams, Working-Day Scheduling, One Admin Page, Backup & Restore, Personal Notifications & Digest, Outcome Capture on Close, ImpactIQ & VectorIQ Links |
| v0.10.0 | 2026-10-26 | CRM Choice (Salesforce / HubSpot / None) & HubSpot Integration, Working Salesforce Sync Queue & Sync Issues, Configuration › Scheduler, Terminology, Role-Based Guide, MFA for Every User & Session Revocation, Outside-User & Role Access Fixes |
| v0.9.0 | 2026-10-20 | Integrations Overview & Rate Limiting, Okta + Azure SSO, MCP Server, n8n Event Subscriptions & Scoped API Keys, Admin › Appearance Theming, 70px Header & Admin Second-Tier Menu, Success-Criteria & Library Access Fixes |
| v0.8.1 | 2026-10-11 | User-Management Authorization & List Scoping, Per-User Allowed Login Methods, Vendor-Neutral Identity & Support Email Setting, Job-Based Sidebar Navigation, Sidebar-Driven Global Search |
| v0.7.20 | 2026-04-30 | App-Managed Bootstrap Secrets (Promote/Unmanage + Reveal-for-10s, Task #741), Multi-DB Connection Management (Task #739), Set-Active-for-Next-Restart DB Switch (Task #740), Encryption-Key Rotation Race Fix (Task #726), Forced Logout on Session-Secret Rotation (Task #724/#736), Rotation Banner (Task #734), Sessions & Login-History Cleanup Schedulers + Admin Panels (Tasks #737/#745/#746/#751/#752/#756), JSON-Parsing Antipattern Sweep (Task #754), Boot-Time Data-Dir Health Check |
| v0.7.10 | 2026-04-23 | MDXEditor → Tiptap v3 Migration (Task #196), Tiptap Round-Trip Test Suite (Task #204), First-Run Setup Wizard (7-step), Self-Hosting Bootstrap (Docker/Hostinger/Dokploy), Production Secret Hardening, Conditional Bootstrap Gating, Public-URL Reachability Probe |
| v0.7.00 | 2026-04-02 | Security stack hardening (React 19.2, Express 5.2, TS 6.0, Zod 4.3, Vite 8.0), Reports redesign, Date picker dropdowns, Tech Stack refresh |
| v0.6.50 | 2026-03-27 | Assumptions & Dependencies System, VC Library 4-Category Sections, Active/System Toggles, Hard Delete, Detailed Delete Errors |
| v0.6.20 | 2026-03-12 | SubNavPopover Navigation, Error Audit Log Sidebar Submenu, URL-Synced Subtabs |
| v0.6.11 | 2026-03-11 | Competitor Intelligence Module, Account Competitor Linking, Detail Drawer Polish |
| v0.6.10 | 2026-03-07 | Validation Criteria Revamp, WebhookWizard Brand Icons, Smart Step Selection |
| v0.6.00 | 2026-02-26 | Database Connection Manager, Backup Destinations, DB Branching, Setup Wizard |
| v0.5.50 | 2026-02-25 | PDF Multi-Tab Capture, Email Design Variables, Sidebar & UI Improvements |
| v0.5.40 | 2026-02-14 | GitHub Docs Sync, Centralized Scheduling, AI Assessment Enhancements, Schema Reorganization |
| v0.5.30 | 2026-02-04 | System Health Monitoring, Archive Management, Dark Mode Charts, Dependency Updates |
| v0.5.20 | 2026-01-27 | Custom Dashboard Widgets, AI Providers Integration, Account Portal Overview Dashboard |
| v0.5.10 | 2026-01-12 | Multi-Profile Infrastructure Intelligence, Toast Notification System |
| v0.5.00 | 2025-12-21 | Guided Project Form, UI/UX Library Expansion |
