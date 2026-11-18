# Dark-Mode Sweep Plan

> **Goal:** every UI component in `client/src/components/**/*.tsx` ships matched `dark:` siblings on every Tailwind color class, so dark-mode users see a coherent UI everywhere — no eye-burning saturated 500/600 fills against black, no white panels in modals, no orphaned "looks fine in light, breaks in dark" pockets.
>
> **Strategy:** ratcheting folder-by-folder sweep using the existing [`dark-mode-sweep`](../../.claude/skills/dark-mode-sweep/SKILL.md) skill. Each phase converts a coherent group of folders, lands as a single PR, and ratchets a coverage number upward. The list only grows; new components default to dark-mode-required after Phase 5.

---

## Current state (baseline)

Rough coverage per folder, based on whether each `.tsx` file has at least one `dark:` Tailwind class:

| Coverage tier | Folders (sorted by file count) |
|---|---|
| **100%** (17 folders, ~85 files) | `validation-criteria`, `templates`, `team-management`, `search`, `rich-text`, `projects`, `project`, `map`, `integrations`, `icons`, `flight-deck`, `config`, `automation`, `artifacts` (most of these are post-Phase-7 swept or already curated) |
| **80–99%** (4 folders, ~50 files) | `dashboard-widgets` (92%), `about` (91%), `ai-assessments` (88%), `project-form` (86%), `accounts` (80%) |
| **50–79%** (8 folders, ~75 files) | `project-detail` (75%), `gap-analysis` (75%), `requests` (66%), `announcements` (66%), `dashboard` (62%), `layout` (61%), `communications` (61%), `competitors` (60%), `analytics` (60%), `configuration` (58%) |
| **30–49%** (3 folders, ~25 files) | `outcomes` (50%), `security` (44%), `shared` (35%), `support` (33%), `audit` (33%) |
| **0–29%** (3 folders, ~80 files) | `ui` (29%, 68 files — see exclusion note), `salesforce` (0%, 3 files), `errors` (0%, 6 files) |

**The "having a `dark:` class somewhere" coverage above is a lower bound — it doesn't mean the file is FULLY swept.** The skill's strict scan flags missing siblings on individual classes, which is the real measure. We won't have a precise %-fully-swept number until each phase runs the audit.

**Exclusion:** `client/src/components/ui/` — these are shadcn primitives that use CSS-variable classes (`bg-card`, `text-foreground`, `border-border`) auto-adapting via the `:where(.dark, .dark *)` selector in `client/src/index.css`. The skill explicitly skips these. The 29% figure above is misleading — the unscanned 71% are correctly using CSS variables and don't need `dark:` siblings. Treat `ui/` as **out of scope** for the rollout.

---

## Phasing strategy

**Order by:**
1. **User traffic** — visible-on-every-page first (`layout`, `shared`, `errors`).
2. **Risk gradient** — low-risk-mechanical first; semantically risky last (status-color badges, AI assessment severity colors, gap-criticality MoSCoW pills — color ENCODES meaning, so dark variants need design judgment).
3. **Coherent feature group** — fold related folders into the same phase so reviewer can verify one feature surface at a time.

**Per-phase deliverables:**
- A single commit / PR per phase.
- Run the `/dark-mode-sweep` skill on each folder in the phase.
- After each folder: visual diff in dev (toggle the theme on the relevant pages).
- After all folders in the phase: a one-line coverage update to this doc and to `CLAUDE.md` § "App-wide dark-mode saturation pass".
- Commit message: `dark-mode: sweep <phase-name> (<folder-list>)`.

**Per-phase exit criteria (stricter than "skill ran clean"):**
- ✅ Skill reports 0 residual `bg-X-NN` / `text-X-NN` / `border-X-NN` classes without `dark:` siblings.
- ✅ Manually toggled the theme on every page rendered by the phase's folders. No white panels in modals, no eye-burn saturated fills.
- ✅ Status badges where color encodes meaning (Pass/Fail, Won/Lost/Deferred, MoSCoW pills, severity levels) reviewed individually — dark variant must preserve the semantic distinction (a "Pass" green should still read green-coded in dark mode, not just dim).
- ✅ Build green; `lint:i18n` still passes (no accidental regression).

---

## Phases

### Phase A — Always-visible chrome (foundation)

**Folders:** `layout/`, `shared/`, `errors/`, `flight-deck/`, `icons/`
**File count:** ~38
**Coverage today:** layout 61%, shared 35%, errors 0%, flight-deck 100%, icons 100%
**Why first:** these render on every page. Any dark-mode bug here is the first thing a dark-mode user sees. `errors/` at 0% is the highest-impact gap — error boundaries and dialogs are exactly the surfaces where a broken render mode is most jarring.
**Estimated effort:** 1.5–2 hours.

### Phase B — Account, search, admin surfaces

**Folders:** `accounts/`, `search/`, `security/`, `audit/`
**File count:** ~33
**Coverage today:** accounts 80%, search 100%, security 44%, audit 33%
**Why next:** account/login flows are visible to every user; security/audit screens to admins. `security/` (44%) and `audit/` (33%) are the largest gaps in this group — both surface lots of status pills (MFA enabled/disabled, login success/fail) that need careful dark-variant choices.
**Estimated effort:** 1.5–2 hours.

### Phase C — Dashboards, widgets, reporting

**Folders:** `dashboard/`, `dashboard-widgets/`, `analytics/`, `outcomes/`
**File count:** ~34
**Coverage today:** dashboard 62%, dashboard-widgets 92%, analytics 60%, outcomes 50%
**Why next:** the home surface for most users. Charts use `useChartTheme` (already theme-aware) — skip those per skill instructions. Focus is KPI cards, sparklines, metric widgets, and the report builder.
**Estimated effort:** 1.5 hours.

### Phase D — Project workspace

**Folders:** `project/`, `project-detail/`, `project-form/`, `projects/`, `templates/`, `validation-criteria/`
**File count:** ~58
**Coverage today:** project 100%, project-detail 75%, project-form 86%, projects 100%, templates 100%, validation-criteria 100%
**Why next:** core feature surface, but most folders already 100% — the real work is in `project-detail/` (75%). Project-form is at 86% which is a quick top-up.
**Estimated effort:** 1 hour (mostly verification + small fixes).

### Phase E — Communications, automation, integrations

**Folders:** `communications/`, `automation/`, `integrations/`, `salesforce/`, `requests/`, `support/`
**File count:** ~26
**Coverage today:** communications 61%, automation 100%, integrations 100%, salesforce 0%, requests 66%, support 33%
**Why next:** less-trafficked but still real surfaces. `salesforce/` (0%, 3 files) is small enough to clear in one sweep. `support/` and `requests/` are admin tools used regularly.
**Estimated effort:** 1.5 hours.

### Phase F — Specialty surfaces (last)

**Folders:** `ai-assessments/`, `competitors/`, `gap-analysis/`, `outcomes/` *(if not done in C)*, `announcements/`, `about/`, `configuration/`, `config/`, `artifacts/`, `rich-text/`
**File count:** ~80 (configuration alone is 48)
**Coverage today:** mostly 60-100% with `configuration/` (58%) the largest folder by file count
**Why last:** `configuration/` is admin-heavy with status pills carrying real meaning (active/inactive, system/user-defined, locked/editable), so it needs the most design judgment. AI-assessments (88%) has severity-color pills that encode risk level — handle those carefully. About/announcements are low-stakes catch-up.
**Estimated effort:** 2.5–3 hours (configuration is the bulk of it).

---

## End state — gate inversion

When **all six phases close** (~10–12 hours of work spread across ~6 PRs):

1. Every folder under `client/src/components/` (excluding `ui/`) is fully swept.
2. Add a build-time lint gate that scans for `bg-<color>-{500,600}` / `text-<color>-{700,800}` / `border-<color>-{200,300}` without `dark:` siblings, and fails the build on regression. The gate would live at `scripts/check-dark-mode-coverage.ts`, modeled after `scripts/check-i18n-coverage.ts`.
3. Flip the polarity: the new gate is **strict by default** with a small `.dark-mode-exempt.txt` allowlist for the handful of cases that intentionally don't carry a `dark:` (e.g. brand-color components in `LanguageSwitcher` that intentionally render light against the dark sidebar header).
4. Update `CLAUDE.md` § 6 "Open follow-ups": move the dark-mode bullet from "deferred" to "complete; gate enforced".
5. Drop a final PR title: `dark-mode: enforce strict dark-coverage gate (rollout complete)`.

---

## Cross-cutting considerations

- **Charts:** `useChartTheme` from `@/hooks/useChartTheme` is the single source of truth for chart colors. Don't add `dark:` to chart components; verify they consume the hook and the hook's palette has reasonable dark values. If a chart component bypasses the hook (uses inline hex), file a separate small task — out of scope for the sweep.
- **Status badges with semantic color:** every Pass/Fail, Won/Lost/Deferred, MoSCoW (Must/Should/Nice/Won't), severity (Critical/High/Med/Low), MFA state, etc. needs a dark variant that **preserves the semantic distinction**, not just dims the light variant. The convention from `client/src/components/map/`'s sweep is: saturated `bg-X-500` → `dark:bg-X-600`, saturated `bg-X-600` → `dark:bg-X-700` ("one shade darker"). For tinted backgrounds (`bg-X-50/100`) the convention is `dark:bg-X-900/20` (project-wide).
- **Rich-text editors:** Tiptap and TinyMCE manage their own styling via CSS variables (`--card`, `--border`). Don't add `dark:` inside those component bodies; verify the wrapper's CSS variables are defined correctly in `client/src/index.css`.
- **Inline `style={{ color: '#hex' }}`:** flag for manual review — could be a brand-color component (e.g. login button on a brand background). Don't blindly add `dark:` overrides without checking the design intent.
- **Modal / dialog / drawer overlays:** the `Sheet`, `Dialog`, and `AlertDialog` shadcn primitives use CSS variables and adapt automatically. The body content inside them is the responsibility of the calling component — that's where most "white panel in dark mode" bugs live.

---

## Tracking

After each phase, append a row to this section:

| Phase | Date | Folders | Files | dark: classes added | Coverage % (post-phase) |
|---|---|---|---|---|---|
| A | _pending_ | layout, shared, errors, flight-deck, icons | — | — | — |
| B | _pending_ | accounts, search, security, audit | — | — | — |
| C | _pending_ | dashboard, dashboard-widgets, analytics, outcomes | — | — | — |
| D | _pending_ | project, project-detail, project-form, projects, templates, validation-criteria | — | — | — |
| E | _pending_ | communications, automation, integrations, salesforce, requests, support | — | — | — |
| F | _pending_ | ai-assessments, competitors, gap-analysis, announcements, about, configuration, config, artifacts, rich-text | — | — | — |
| **Final** | _pending_ | gate inversion + lint:dark-mode added to build chain | — | — | 100% |
