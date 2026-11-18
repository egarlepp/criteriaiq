# Standard Table Pattern Sweep Plan

> **Goal:** every data table in CriteriaIQ uses the full Standard Table Pattern — sortable headers, URL-persisted sort + filter state, per-column filtering (text/checkbox/date range/autocomplete), pagination, and the decorative card icon. 28 of 49 table-bearing components already use the pattern; 21 remain on plain `<Table>` / `<TableHead>` with no sort or filter capability.
>
> **Strategy:** ratcheting sweep using the [`/standardize-table`](../../.claude/skills/standardize-table/SKILL.md) skill. Each phase converts a coherent feature group, landing as a single PR. The skill's 15-step checklist handles all mechanical work; reviewers focus on the column-filter type choices (text vs. checkbox vs. date range) and correct `entityLabel` values.
>
> **Reference implementation:** `client/src/components/integrations/N8nTab.tsx` (fully upgraded including all filter enhancements as of v0.7.30)

---

## Current state (baseline — May 2026)

| Status | Count | Notes |
|---|---|---|
| ✅ Fully upgraded | 28 | Using `SortableTableHead` + pagination |
| ⬜ Not yet upgraded | 21 | Using plain `<Table>` / `<TableHead>` |
| **Total table-bearing files** | **49** | Excludes `ui/sortable-table.tsx` itself |

The 28 already-upgraded tables do not yet have per-column filters wired up (they use `SortableTableHead` but without `filterable` props). The sweep below upgrades the 21 remaining tables **and** optionally back-fills filters on the existing 28. The phasing covers the 21 first.

---

## Relationship to other sweeps

This sweep runs **in parallel** with the dark-mode and i18n sweeps — all three touch similar component surfaces. To minimize conflicts:

- **Dark mode sweep** (see `dark-mode-sweep-plan.md`): when a table component is scheduled for both sweeps in the same phase, run dark-mode first, then standardize-table in the same PR. Dark-mode changes are purely additive Tailwind classes; table changes restructure JSX.
- **i18n sweep** (see `i18n-sweep-plan.md`): column header strings and entity labels added by this sweep should go through `t()` immediately if the file already uses `useTranslation`. Add the keys to `en-US.json` at the same time.

---

## Phasing strategy

**Order by:**
1. **User traffic** — tables that admins and SEs interact with daily first.
2. **Table size** — full-page tables before drawer/dialog tables (drawers may skip pagination and `DecorativeCardIcon`; see "Lite mode" note below).
3. **Feature coherence** — group by the same feature area so a single PR is reviewable in context.

**Per-phase deliverables:**
- A single commit / PR per phase using the `/standardize-table` skill.
- Column type decisions documented in the PR description (which columns get checkboxes vs. text vs. date range).
- Stats strip with active filter count and "Clear all" button in every upgraded table.
- Active filter count badge on the card title.
- After each phase: a one-line coverage update to this doc and to `CLAUDE.md` § "Open follow-ups".

**Lite mode (drawer / dialog tables):**
Some tables live inside `<Dialog>`, `<Sheet>`, or `<Drawer>` components where the data set is always small (< 20 rows). For these, apply:
- ✅ `SortableTableHead` (sort arrows)
- ✅ Per-column filters if the column count makes it useful
- ❌ Skip `TablePaginationFooter` (data is small enough)
- ❌ Skip `DecorativeCardIcon` (no card wrapper in most drawers)

The skill's checklist notes when to skip these steps.

---

## Phases

### Phase 1 — Communications (3 tables)

**Effort estimate:** 2–3 hours  
**Why first:** highest admin interaction frequency — email templates and webhooks are managed on initial setup and whenever automations change.

| File | Table shows | Filter types to wire |
|---|---|---|
| `client/src/components/communications/email-templates/EmailTemplatesSection.tsx` | Email template catalog | text (name, subject), checkbox (active/inactive) |
| `client/src/components/communications/webhooks/WebhooksSection.tsx` | Webhook configuration list | text (name, URL), checkbox (service type, active) |
| `client/src/components/configuration/AnnouncementsManager.tsx` | System announcements | text (title), checkbox (active), date range (publish date) |

---

### Phase 2 — Configuration admin (4 tables)

**Effort estimate:** 3–4 hours  
**Why second:** admin-only surfaces with low traffic but high importance when accessed; domain allowlist and flight deck rules are critical security-adjacent configs.

| File | Table shows | Filter types to wire |
|---|---|---|
| `client/src/components/accounts/LoginManagementSection.tsx` | Domain allowlist + login rules | text (domain), checkbox (rule type) |
| `client/src/components/configuration/TagsManager.tsx` | Custom tags | text (name, description), checkbox (category) |
| `client/src/components/configuration/FlightDeckRulesManager.tsx` | Flight deck rule definitions | text (name), checkbox (rule type, enabled) |
| `client/src/components/configuration/ValueTranslationsDialog.tsx` | Value translation mappings | text (key, value) — **lite mode** (in dialog) |

---

### Phase 3 — Integrations (2 tables)

**Effort estimate:** 2–3 hours  
**Why third:** Salesforce is an optional integration so lower traffic, but when used the mapping table is large and difficult to navigate without filtering.

| File | Table shows | Filter types to wire |
|---|---|---|
| `client/src/components/integrations/SalesforceConfigurationTab.tsx` | Salesforce field mapping | text (CriteriaIQ field, SF field), checkbox (sync direction, mapped/unmapped) |
| `client/src/components/salesforce/SalesforceLinkageModal.tsx` | SF object linkage | text (object name) — **lite mode** (in modal) |

---

### Phase 4 — Project forms & detail (5 tables)

**Effort estimate:** 4–5 hours  
**Why fourth:** project-form tables are rendered frequently during project setup; detail drawers less so. Mixed lite/full mode.

| File | Table shows | Mode | Filter types |
|---|---|---|---|
| `client/src/components/project-form/AccessSection.tsx` | Project access users | lite | text (name, email), checkbox (role) |
| `client/src/components/project-form/TeamSection.tsx` | Project team members | lite | text (name), checkbox (role) |
| `client/src/components/project-detail/GapAnalysisTab.tsx` | Gap analysis items | full | text (criterion, gap description), checkbox (status, priority) |
| `client/src/components/project-detail/project-drill-down-sheet.tsx` | Project metrics detail | lite | text (metric name), checkbox (status) |
| `client/src/pages/create-project.tsx` | Team/stakeholder assignment | lite | text (name, email) |

---

### Phase 5 — System health tabs (3 tables)

**Effort estimate:** 2–3 hours  
**Why fifth:** admin-only; accessed infrequently but valuable when troubleshooting. All three are in the same `system-health/` folder.

| File | Table shows | Filter types |
|---|---|---|
| `client/src/components/configuration/system-health/EmailHealthTab.tsx` | Email service health | text (check name), checkbox (status) |
| `client/src/components/configuration/system-health/IntegrationHealthTab.tsx` | Integration health | text (service name), checkbox (status) |
| `client/src/components/configuration/system-health/StorageHealthTab.tsx` | Storage metrics | text (table name), checkbox (sync category) |

---

### Phase 6 — Utility & drawer tables (4 tables)

**Effort estimate:** 3–4 hours  
**Why last:** drawer/dialog context, small data sets, lite mode; lower ROI for filtering but completes full coverage.

| File | Table shows | Mode | Filter types |
|---|---|---|---|
| `client/src/components/accounts/CreateCustomerDialog.tsx` | Stakeholder assignment | lite | text (name, email) |
| `client/src/components/accounts/InfrastructureDiscoveryDrawer.tsx` | Infrastructure profile | lite | text (component, version), checkbox (type) |
| `client/src/components/dashboard-widgets/KPIDetailDrawer.tsx` | KPI metrics detail | lite | text (metric), checkbox (category) |
| `client/src/components/shared/end-date-flags-section.tsx` | End-date flag rules | lite | text (rule), checkbox (enabled) |

---

## Phase 7 (optional) — Back-fill filters on already-upgraded tables

The 28 tables already on `SortableTableHead` don't have `filterable` props wired. This optional phase adds per-column filtering to the highest-traffic already-upgraded tables:

**Candidates (ordered by traffic):**
1. `components/dashboard/main-dashboard-table.tsx` — primary dashboard, daily use
2. `components/projects/ValidationProjectsPage.tsx` — project list, daily use
3. `components/accounts/AccountDirectorySection.tsx` — account list
4. `components/accounts/TeamUsersSection.tsx` — user management
5. `components/automation/WorkflowAutomationSection.tsx` — automation rules
6. `components/artifacts/DocumentsSection.tsx`, `CodeScriptsSection.tsx`, `LinksSection.tsx`
7. `components/communications/email-logs/EmailLogsSection.tsx`
8. `components/communications/email-designs/EmailDesignsSection.tsx`

Each can be done independently; they don't need to land together.

---

## Verification checklist (per phase)

After running `/standardize-table` on each file:

- [ ] Column headers show sort arrows on hover; clicking sorts; URL updates with sort params
- [ ] Filter icon appears on cell hover; active filter stays blue and visible
- [ ] Text columns: type in filter → rows update in ~200ms; clear button works
- [ ] Checkbox columns: checkboxes appear instead of text input; multi-select works
- [ ] Date columns: From/To date pickers appear; partial range (one side only) works
- [ ] Autocomplete: typing in text columns shows up to 5 matching suggestions from live data
- [ ] Mode selector (`~ ^ = .*`): switching mode changes matching behavior
- [ ] "Clear all filters" button appears in stats strip when any filter is active; clears all at once
- [ ] Card title shows filter count badge when active
- [ ] Pagination footer shows correct "Showing X–Y of N" count using filtered total
- [ ] URL encodes active filters: `?{prefix}f_name=value` — survives page refresh
- [ ] Dark mode: all new UI elements render correctly with dark theme toggled
- [ ] Build passes: `npm run build` exits 0
