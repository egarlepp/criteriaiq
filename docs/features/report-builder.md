# Report Builder

> **Archived 2026-11-05.** The Report Builder screen, Dashboard Builder and
> Metric Builder were removed from the app and kept under
> [`archive/analytics-builders/`](../../archive/analytics-builders/README.md).
> The field catalog and query executor described below
> ([`server/lib/report-fields.ts`](../../server/lib/report-fields.ts)) are
> still live: scheduled report emails and saved custom reports run through
> them. The create, update, preview and sources routes are gone.

The custom-report authoring surface was **Analytics → Report Builder**
(`/analytics?tab=report-builder`). Users picked fields, added filters, chose
an output format, and saved a reusable report. This doc covers how the
field catalog, filters, and query executor work, and how to extend them.

> **Audience:** developers extending the reportable surface (new fields
> or sources) and admins understanding what reports can do.

---

## The four-tab flow

The whole builder is one component —
[`ReportBuilderContent.tsx`](../../client/src/components/analytics/ReportBuilderContent.tsx) —
with four sub-tabs:

| Tab | Purpose |
|---|---|
| **General** | Report name, description, tags, output type (`table` / `table+chart` / `dashboard`), chart type |
| **Fields** | Pick columns, grouped by source table; drag to reorder; the order becomes the column order |
| **Filters** | "Common Filter Examples" quick-add chips + custom per-field filter rows |
| **Preview** | Config summary, run-preview (first rows), save, export |

Saved reports persist to the `custom_reports` table
([`shared/schema/dashboard.ts`](../../shared/schema/dashboard.ts)):
`selectedFields` + `filters` (both JSONB), `sortBy`, `groupBy`, `tags`,
`reportType`, `chartType`, `isShared`, `isDemo`.

---

## Field catalog (server-driven registry)

Available fields are **not** hardcoded in the React component — they come
from a server-side registry in
[`server/lib/report-fields.ts`](../../server/lib/report-fields.ts),
served via `GET /api/report-builder/fields`. Each field carries:

```
{ field, label, type, source, description, example }
```

- `type` is `string | number | date | boolean | array` (drives which
  filter operators and value inputs are offered).
- `source` is the group label the Fields tab renders under (e.g.
  "Projects", "Customers").
- `example` is pulled **live from the database** at request time
  (`buildAvailableReportFieldsWithExamples`) so each field shows a real
  sample value, with a graceful fallback to no-example if the query
  fails.

The registry is built from a `REPORT_TABLES` array. Each registration
declares its `source` label, the Drizzle `table`, the `include` list of
columns to expose, per-column `overrides` (label, type, description),
and (for non-base sources) a `joinFromProjects` clause plus optional
`oneToMany` and `filterExamples` metadata.

**Currently registered sources:** **Projects** (the base table),
**Customers** (joined by `customerName`), and **Validation Criteria**
(per-project `success_criteria` rows, joined on `projectId`). Validation
Criteria is one-to-many: selecting one of its fields returns one row per
criterion with the parent project columns repeating — the Fields tab
shows a "one row per criterion" badge on that group to warn of the
fan-out. **Teams** exposes the project's owning team and subteam
(`teamName` from `teams`, `subteamName` from `subteams`, each joined on
the project's `teamId` / `subteamId`; see [Teams](teams.md)). Two table
registrations share the one "Teams" group. Additional sources (MAP Tasks, Gaps, Products, …) follow the
same registration recipe — see "Adding a source" below.

---

## Color-coded field groups

Each source group on the Fields tab renders in its own accent color so
the catalog reads as distinct groups rather than a wall of identical
panels. The palette lives in
[`report-builder-utils.ts`](../../client/src/components/analytics/report-builder-utils.ts)
as `groupAccent(source)`, returning a class triple (container / border /
header text / chevron / hover). Projects = blue, Customers = emerald,
Teams = teal, with purple / amber / rose / cyan / indigo / orange **pre-staged** for
additional sources. Unknown sources fall back to the blue default, so a
newly registered source renders cleanly even before it gets a dedicated
color.

Nested field rows use a neutral white / dark-gray background (not the
group tint) so the row checkboxes stay legible against any accent.

---

## Filters

Two mechanisms on the Filters tab:

1. **Common Filter Examples** — quick-add chips (Active Projects Only,
   High Risk Projects, Recently Updated, etc.) that append a
   pre-configured filter on click. These are **registry-owned**: each
   source declares its own `filterExamples` in `report-fields.ts`,
   served by `GET /api/report-builder/sources`, and rendered grouped by
   source with the matching accent color. Date-relative examples use a
   `valueResolver` (`today` / `startOfYear` / `thirtyDaysAgo`) so the
   value is computed at click time rather than baked in.
2. **Custom Filters** — per-row Field + Operator + Value controls. The
   value input adapts to the field type (date picker for dates, true/false
   select for booleans, chip input for list operators, text/number
   otherwise). Incompatible operator/type combinations are flagged
   inline before the report runs.

### Operator vocabulary

Defined in
[`report-filter-helpers.ts`](../../client/src/components/analytics/report-filter-helpers.ts)
and enforced server-side in `report-fields.ts`:
`equals`, `not_equals`, `contains` (strings only), `greater_than` /
`less_than` (numbers/dates), `in` / `not_in` (array of values). Each
filter is coerced to the field's type and incompatible combinations are
skipped with a logged reason rather than failing the whole query.

---

## Query execution

Both the save-time executor (`executeCustomReport`) and the live
**preview** (`previewReport`) live in
[`server/storage/custom-reports.ts`](../../server/storage/custom-reports.ts).
They:

1. Build a base query from `projects`, leftJoining `users` (for the
   legacy `primaryEngineer` virtual field) and `customers` (for the
   Customers source fields).
2. **Dynamically inject leftJoins** for any *other* source referenced by
   the report's selected fields or filters. `getDynamicJoinRegistrations()`
   inspects the field/filter set, looks up which sources are referenced,
   and injects only their `joinFromProjects` clauses — sources not
   referenced are never joined, keeping the query lean. This is how
   Validation Criteria (and future sources) get pulled in on demand.
3. Translate the saved/preview filters into Drizzle `WHERE` conditions
   via the shared `buildReportFilterConditions` helper — so a saved
   report runs against the exact same clause its preview did.
4. Project each result row down to the selected fields via
   `projectReportRow`, warning once per unknown field (drift between the
   picker and the executor) instead of silently emitting null.

Filters reference fields through the registry, so a filter on any
registered field resolves to the correct joined column without
hardcoding. Aliased includes (`{ column, alias }`) let two sources
expose a same-named column without colliding — e.g.
`successCriteria.status` registers as `criterionStatus`.

---

## Permissions & sharing

Saved reports are keyed by `createdBy`. The `isShared` flag exists in the
schema. **Note:** RBAC enforcement on reports is currently minimal —
execute/preview are not role-gated beyond authentication, and the
`isShared` flag is not yet consulted by the routes. Demo isolation *is*
enforced (`applyDemoFilter` / `applyDemoFlag`) so demo sessions can't see
or modify production-tenant reports. Tightening report RBAC is tracked as
a future enhancement.

---

## Adding a source

The registry + dynamic-JOIN design makes adding a reportable source a
contained, repeatable change:

1. **Import the table** from `@shared/schema` into `report-fields.ts`.
2. **Append a `REPORT_TABLES` registration** with the `source` label,
   `include` column list, per-column `overrides`, and a
   `joinFromProjects` clause (the `eq(...)` join condition from the base
   `projects` row). Set `oneToMany: true` if a project can have many
   rows in this source (drives the fan-out badge).
3. **Use `{ column, alias }` includes** for any column whose bare name
   would collide with an already-registered field (e.g.
   `successCriteria.status` → `criterionStatus`).
4. **Declare `filterExamples`** on the registration for the per-source
   quick-add chips.
5. **Pick an accent** in `report-builder-utils.ts` — colors are
   pre-staged for the planned sources: MAP Tasks = amber, Gaps = rose,
   Products = cyan, Evaluation Requests = indigo, Audit Findings =
   orange. Unknown sources fall back to blue.

No frontend changes are needed beyond the accent: the Fields tab, the
filter chips, and the executor all derive from the registry. The
one-to-many fan-out warning and the dynamic JOIN are automatic.

**Projects column coverage** has also been backfilled with the
analytically useful columns the original registry skipped —
`opportunityName`, `salesStage`, `forecastCategory`,
`customerObjective`, `mapTemplateName`, etc. — while leaving
operational/freeform blobs (`notes`, `mgmtNotes`,
`riskPredictionData`) out.

---

## Related files

| Concern | File |
|---|---|
| Builder UI (4 tabs) | [`client/src/components/analytics/ReportBuilderContent.tsx`](../../client/src/components/analytics/ReportBuilderContent.tsx) |
| Group accent palette | [`client/src/components/analytics/report-builder-utils.ts`](../../client/src/components/analytics/report-builder-utils.ts) |
| Filter operator helpers | [`client/src/components/analytics/report-filter-helpers.ts`](../../client/src/components/analytics/report-filter-helpers.ts) |
| Field registry + filter execution | [`server/lib/report-fields.ts`](../../server/lib/report-fields.ts) |
| Query executor (run + preview) | [`server/storage/custom-reports.ts`](../../server/storage/custom-reports.ts) |
| API routes | [`server/routes/audit-and-reports-routes.ts`](../../server/routes/audit-and-reports-routes.ts) — search for `/api/report-builder` and `/api/custom-reports` |
| Saved-report schema | [`shared/schema/dashboard.ts`](../../shared/schema/dashboard.ts) — `customReports` table |
