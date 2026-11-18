# i18n Sweep Plan

> Status: in-progress (ratcheting allowlist active). The build-time gate (`npm run lint:i18n` → `scripts/check-i18n-coverage.ts`) verifies allowlisted files stay clean and prints current coverage on every run.

## Where we are

- **6 supported languages:** en-US, fr-FR, de-DE, es-ES, pt-BR, it-IT.
  - Wired in `client/src/i18n/index.ts` via `i18next` + `react-i18next` + `i18next-browser-languagedetector`.
  - Each locale file is `client/src/i18n/locales/<locale>.json` — about 10,100 lines each.
  - Bare-language keys in i18next config (`en`, `fr`, etc.) — region codes only used for filenames and `<html lang>`.
- **Strict-checked coverage:** **188 of 452 components (~42%)** in `.i18n-allowlist.txt` (run `npm run lint:i18n` for the live number). Files NOT on the allowlist still hardcode English — they're exempt from the strict check until added. The list only grows.
- **Existing namespace structure** in `en-US.json` (top-level keys observed):
  - `common.*` — generic actions and labels (Save, Cancel, Edit, etc.). **Reuse these whenever possible** — many strings are already wrapped.
  - Plus per-feature namespaces matching folder names (`projects`, `accounts`, `dashboard`, `analytics`, `config`, `layout`, etc.).
- **Lockstep convention (since Phase 1, PR 9):** every new key goes into all 6 locale files in the same PR, with real translations (never an English copy or `[TODO]`). `client/src/i18n/__tests__/locale-parity.test.ts` fails the build if any en-US key is missing from de-DE, es-ES, fr-FR, it-IT or pt-BR. i18next's `fallbackLng: 'en'` remains as a safety net only. The older "en-US only at write-time" convention let untranslated keys pile up until one batch PR had to translate 1,410 keys per locale; the even older `[TODO] English` placeholder workflow is also retired.

## Strategy: ratcheting allowlist

Strict-gate-everything would fail the build (more than half the files still hardcode English). Instead:

1. **Maintain `.i18n-allowlist.txt`** at the repo root. Each line is a path to a file that has been fully i18n'd. The build gate (`npm run lint:i18n`) verifies every file on the allowlist still has zero hardcoded English.
2. **Files NOT on the allowlist are exempted** from strict checking — legacy code keeps working.
3. **Adoption ratchets up monotonically.** As we wrap a file in `t()`, we append it to the allowlist. The list only grows.
4. **New files default to "exempt"** unless explicitly added to the allowlist. (We can flip this default once adoption clears ~80%.)

## How to chip away

Use the `/i18n-extract` skill (`.claude/skills/i18n-extract/SKILL.md`) on a single file or folder at a time. The skill:

- Wraps JSX text, attributes (placeholder/title/aria-label/alt), and toast-helper string literals in `t()`.
- Picks namespace keys following the existing convention (reuses `common.*` for generic strings, creates `<feature>.<context>.<name>` for new ones).
- Adds each new key to `en-US.json` and, with a real translation, to the other 5 locale files in the same pass.
- Reports the count of new keys added per locale.

After running the skill on a file, append the file path to `.i18n-allowlist.txt`. Run `npm run lint:i18n` to confirm. Commit with message `i18n: wrap <file>` so the changelog reflects progress.

## Priority order (suggested)

Roughly by user traffic and visibility:

1. **`client/src/components/layout/`** — sidebar, header, page chrome. Visible on every page. **Status: 5/8 banner components done** (`ExcludedScreenNotice`, `PersonaBanner`, `SidebarDemoIndicator`, `DataDirReadOnlyBanner`, `EnvSourceWarningBanner`). Remaining: `header.tsx`, `sidebar.tsx`, `page-layout.tsx`, plus the smaller dev affordances (`DevPersonaSwitcher`, `SidebarVersionLabel`).
2. **`client/src/components/projects/`** — project list, board, detail. Core feature.
3. **`client/src/components/project-form/`** — create/edit project. High usage.
4. **`client/src/components/accounts/`** — user/customer dialogs. Onboarding-critical.
5. **`client/src/components/dashboard/`** — landing surface for most users.
6. **`client/src/components/map/`** — Mutual Action Plan UI. Customer-facing too.
7. **`client/src/components/analytics/`** — Schedule Report dialog and Login Audit (the Reports page itself, `client/src/components/reports/`, is already translated; builders archived).
8. **`client/src/components/communications/`** — email templates, designs.
9. **`client/src/components/configuration/`** + **`configuration/`** — admin surfaces (lower priority since admin-only).
10. The rest — `validation-criteria/`, `gap-analysis/`, `competitors/`, `outcomes/`, `templates/`, etc.

`client/src/components/ui/` (shadcn primitives) is **excluded** from this work — strings inside generic UI components are passed in by callers.

---

## Phased rollout — concrete waves

The unstructured "priority order" above evolved into a phased rollout with explicit deliverables. Each phase is ~1 commit/PR, ~1.5–4 hours of work, and ends at a translator-batch boundary so non-English locales can catch up before the next phase.

### Phase 1 — Always-visible chrome (foundation)

**Folders:** `layout/`, `shared/`, `errors/`, `flight-deck/`, `search/`, `icons/`, `notifications/`
**Files:** ~41
**Status today:** layout 76%, shared 57%, errors 67%, search 0%, flight-deck 0%, icons 0%, notifications 0%
**Why first:** every page renders these. Without i18n on the chrome, switching language is visibly half-applied — the top bar still says "Settings" while the content translates. Ship this before anything else and the language switcher feels real.
**Estimated effort:** 2 hours.
**New keys (estimate):** ~80 keys across `layout.*`, `errors.*`, `common.*`.

### Phase 2 — Account, auth, security

**Folders:** `accounts/`, `security/`, `audit/`, `teams/`
**Files:** ~45
**Status today:** accounts 73%, security 100%, audit 67%, teams 0%
**Why next:** account creation, login dialogs, MFA enrollment, password reset — every user touches at least the login flow on first visit. Security/audit screens are admin-only but high-stakes.
**Estimated effort:** 2.5 hours.
**New keys (estimate):** ~150.

### Phase 3 — Project workspace (the core)

**Folders:** `project-detail/`, `project-form/`, `projects/`, `templates/`, `validation-criteria/`, `customer-workspace/`, `value-journey/`
**Files:** ~83
**Status today:** project-detail 69%, project-form 78%, projects 42%, validation-criteria 33%, templates 0%, customer-workspace 80%, value-journey 100%
**Why next:** the primary daily surface for SEs. Lots of strings — form labels, status pills, action menus, success toasts, empty states. This is the largest single phase by string count and the most user-facing.
**Estimated effort:** 4 hours.
**New keys (estimate):** ~400.

### Phase 4 — Dashboards, analytics, outcomes

**Folders:** `dashboard/`, `dashboard-widgets/`, `analytics/`, `outcomes/`, `reports/`
**Files:** ~29
**Status today:** dashboard 80%, outcomes 67%, analytics 0%, dashboard-widgets 0%, reports 100%
**Why next:** the home surface. Heavy on labels (KPI titles, axis labels, legend text) but light on dynamic content. Most data values are user-supplied (already locale-agnostic) — only the chrome around them needs translation.
**Estimated effort:** 2.5 hours.
**New keys (estimate):** ~200.

### Phase 5 — MAP, gaps, criteria builders

**Folders:** `map/`, `gap-analysis/`, `validation-criteria/` (top-up if not finished in Phase 3)
**Files:** ~32
**Status today:** map 46%, gap-analysis 0%
**Why next:** customer-facing portal screens — when an external customer logs in to view their MAP, those strings ARE the experience. MoSCoW pills (Must Have / Should Have / Nice to Have / Won't Have) need careful key naming since they're acronyms — keys should be `gap.priority.must` etc. with English value `"Must Have"`.
**Estimated effort:** 2.5 hours.
**New keys (estimate):** ~250.

### Phase 6 — Communications, automation, integrations

**Folders:** `communications/`, `automation/`, `integrations/`, `requests/`, `support/`, `announcements/`, `scheduler/`, `resource-content/`
**Files:** ~61
**Status today:** requests 100%, integrations 48%, automation 33%, communications 0%, support 0%, announcements 0%, scheduler 78%, resource-content 83%
**Why next:** email template builder, workflow automation rules, Salesforce field mapping, support request forms. Mostly admin/internal surfaces but surfaces a lot of dialog-based flows where un-translated strings stand out.
**Estimated effort:** 3 hours.
**New keys (estimate):** ~250.

### Phase 7 — AI, competitors, artifacts, rich-text

**Folders:** `ai-assessments/`, `competitors/`, `artifacts/`, `rich-text/`, `requests/`, `audit/` (top-ups)
**Files:** ~24
**Status today:** ai-assessments 0%, competitors 0%, artifacts 0%, rich-text 0%
**Why next:** specialty surfaces. AI-assessment severity labels (Critical / High / Medium / Low) follow the same key-stability rule as MoSCoW — keys are stable identifiers, English value is the human label.
**Estimated effort:** 2 hours.
**New keys (estimate):** ~150.

### Phase 8 — Admin/config surfaces (last and largest)

**Folders:** `configuration/`, `about/`, `appearance/`, `guide/`
**Files:** ~70
**Status today:** configuration 29%, about 9%, appearance 67%, guide 88%
**Why last:** `configuration/` is the largest single folder by file count. It's also admin-only so impact-per-key is lowest. Knock this out at the end when the patterns are well-rehearsed.
**Estimated effort:** 4 hours.
**New keys (estimate):** ~400.

### Pages directory (separate concern)

**Files:** 38 in `client/src/pages/`
**Status today:** mixed; many already use shared components from `client/src/components/`
**When:** during each Phase, fold in the corresponding pages (e.g. Phase 3 includes `pages/project.tsx`, `pages/projects.tsx`, etc.) so the pages and their nested components ratchet together.

---

## Translator hand-off cadence

Translations are written in the same PR as the key, so there is no end-of-phase batch any more. A native reviewer can still review a phase's new strings afterwards. To find any key missing from a locale (the parity test lists them too):

```bash
# Print every key present in en-US but missing from a target locale
node -e "
const en = require('./client/src/i18n/locales/en-US.json');
const target = require('./client/src/i18n/locales/fr-FR.json');
function flatten(o, p='') {
  return Object.entries(o).flatMap(([k,v]) =>
    v && typeof v === 'object' ? flatten(v, p+k+'.') : [[p+k, v]]
  );
}
const targetKeys = new Set(flatten(target).map(([k])=>k));
for (const [k, v] of flatten(en)) {
  if (!targetKeys.has(k)) console.log(k + ' = ' + JSON.stringify(v));
}
" > /tmp/i18n-fr-missing.txt
```

Repeat for `de-DE`, `es-ES`, `pt-BR` and `it-IT`. The output should always be empty on `main`; if it isn't, the parity test is failing.

---

## When to flip the default to "strict"

When the allowlist covers ≥80% of `client/src/components/**/*.tsx` files (about 362 of the 452 that `npm run lint:i18n` counts), invert the gate: the allowlist becomes a `.i18n-exempt.txt` (legacy hold-outs) and every other file is strict-checked by default. At that point, new components default to i18n-required.

---

## Tracking

After each phase, append a row:

| Phase | Date | Folders | Files | New keys | Allowlist coverage |
|---|---|---|---|---|---|
| 1 | _pending_ | layout, shared, errors, flight-deck, search, icons | — | — | — |
| 2 | _pending_ | accounts, security, audit | — | — | — |
| 3 | _pending_ | project, project-detail, project-form, projects, templates, validation-criteria | — | — | — |
| 4 | _pending_ | dashboard, dashboard-widgets, analytics, outcomes | — | — | — |
| 5 | _pending_ | map, gap-analysis | — | — | — |
| 6 | _pending_ | communications, automation, integrations, salesforce, requests, support, announcements | — | — | — |
| 7 | _pending_ | ai-assessments, competitors, artifacts, rich-text | — | — | — |
| 8 | _pending_ | configuration, config, about | — | — | — |
| **Gate inversion** | _pending_ | rename allowlist → exempt-list; flip strict-by-default | — | — | 100% |

The lint gate emits a status line on every successful run:

```
OK: i18n allowlist coverage — N of M components (X.X%) fully i18n'd. 0 violations.
```

That percentage is a single number to chart over time.

## Translator hand-off

The current convention:

1. Every new key is added to all 6 locale files in the same PR, with real translations. No `[TODO]` values and no English copies.
2. The parity test (`client/src/i18n/__tests__/locale-parity.test.ts`) fails if any en-US key is missing from a locale. i18next's `fallbackLng: 'en'` only covers mistakes.
3. To list keys missing from a locale, diff the en-US file against it:

   ```bash
   # Print every key present in en-US but missing from a target locale
   node -e "
   const en = require('./client/src/i18n/locales/en-US.json');
   const target = require('./client/src/i18n/locales/fr-FR.json');
   function flatten(o, p='') {
     return Object.entries(o).flatMap(([k,v]) =>
       v && typeof v === 'object' ? flatten(v, p+k+'.') : [[p+k, v]]
     );
   }
   const enKeys = new Set(flatten(en).map(([k])=>k));
   const targetKeys = new Set(flatten(target).map(([k])=>k));
   for (const [k, v] of flatten(en)) {
     if (!targetKeys.has(k)) console.log(k + ' = ' + JSON.stringify(v));
   }
   " > /tmp/i18n-fr-missing.txt
   ```

   Repeat per locale (`fr-FR`, `de-DE`, `es-ES`, `pt-BR`, `it-IT`). On `main` the output is empty.

## When to flip the default to "strict"

When the allowlist covers ≥80% of `client/src/components/**/*.tsx` files (about 290 of 360), invert the gate: the allowlist becomes a `.i18n-exempt.txt` (legacy hold-outs) and every other file is strict-checked by default. At that point, new components default to i18n-required.

## Tracking

The lint gate emits a status line on every successful run:

```
OK: i18n allowlist coverage — N of M components (X.X%) fully i18n'd. 0 violations.
```

That percentage is a single number we can chart over time.
