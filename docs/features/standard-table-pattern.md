# Standard Table Pattern

CriteriaIQ's reusable sortable / filterable / paginated table. New
list-style tables should use this pattern so sort, per-column filtering,
URL persistence, and pagination behave identically everywhere.

> **Audience:** developers building or upgrading a table-bearing
> component.

---

## The pieces

| Piece | Where | Role |
|---|---|---|
| `SortableTable*` primitives | [`client/src/components/ui/sortable-table.tsx`](../../client/src/components/ui/sortable-table.tsx) | `SortableTable`, `SortableTableHeader`, `SortableTableHead`, `SortableTableBody`, `SortableTableRow`, `SortableTableCell` |
| Sort + filter state | [`client/src/lib/sorting.ts`](../../client/src/lib/sorting.ts) | `useUrlSortState`, `useSortState`, `sortRows`, `makeComparator`, `stableSort`, `useUrlFilterState` |
| Pagination footer | [`client/src/components/ui/table-pagination-footer.tsx`](../../client/src/components/ui/table-pagination-footer.tsx) | `TablePaginationFooter` |
| Reference implementation | [`client/src/components/integrations/N8nTab.tsx`](../../client/src/components/integrations/N8nTab.tsx) | The fully-upgraded template — copy from here |

---

## `SortableTableHead` — column header with built-in filtering

The header cell carries both sort and per-column filter affordances. All
filter props are optional and backward-compatible — a bare
`<SortableTableHead sortKey="name">Name</SortableTableHead>` is just a
sortable header. Add filtering by opting in:

| Prop | Type | Purpose |
|---|---|---|
| `sortKey` | `string` | Column key for sorting (omit / `sortable={false}` for non-sortable columns) |
| `sortConfig` / `onSort` | — | Wire to `useUrlSortState` (or `useSortState` for a table that appears many times on a page) |
| `align` | `'left' \| 'center' \| 'right'` | Aligns the label and arrow; use `right` over numeric columns |
| `filterable` | `boolean` | Turn on the column filter popover |
| `filterValue` / `onFilter` | — | Controlled filter value (wire to `useUrlFilterState`) |
| `filterType` | `'text' \| 'dateRange'` | Text filter (default) or a From/To date-range picker |
| `filterOptions` | `FilterOption[]` | **Checkbox mode** for enum columns (status, type) — no typing |
| `filterSuggestions` | `string[]` | Autocomplete suggestions for a text filter (feed it the live column values) |
| `filterMode` | `FilterMode` | Text match mode: contains `~` / starts-with `^` / exact `=` / regex `.*` |

Pick the filter shape per column type: **text** (+ suggestions) for
free-form strings, **checkbox** (`filterOptions`) for enums, **dateRange**
for dates.

---

## Every table is sortable

Every header cell is a `SortableTableHead`, never a bare `TableHead` or
`<th>`. Only action columns get `sortable={false}`. The tooltip ("Sort by
…"), `aria-sort` and the filter popover text are translated inside the
component, so a table only has to pass its translated column label.

Sort the rows with `sortRows`:

```ts
const [sortConfig, handleSort] = useUrlSortState('pageUsage');
const rows = useMemo(
  () => sortRows(defaultOrdered, sortConfig, {
    page: (line) => labelOf(line.entry),       // translated label
    views: (line) => line.views,               // number
    lastViewedAt: (line) => (line.lastViewedAt ? new Date(line.lastViewedAt) : null),
  }),
  [defaultOrdered, sortConfig, t],
);
```

- With no column chosen it keeps the incoming order, so pre-sort the rows
  into the table's default order (newest first, least used first…).
- Give an accessor for any column whose cell shows a derived value. Return
  a number, boolean, `Date` or string; strings compare naturally and
  case-insensitively and are never guessed to be dates, so return a `Date`
  for date columns. Blank values sort last in both directions.
- Keys without an accessor fall back to `makeComparator` on the row field.
- **Server-paged tables** (Scheduler › Recent runs, Workflow Automation's
  execution feeds) send the sort to the API instead, so it orders the whole
  history rather than one page. Computed columns the server cannot order by
  stay `sortable={false}`.
- Tables grouped under header rows (Scheduler jobs, Trigger Origins) sort
  inside each group and keep the group order.

---

## URL-persisted filters — `useUrlFilterState`

```ts
const [columnFilters, handleFilter, clearFilters] = useUrlFilterState('myprefix');
```

- Returns `[ Record<string,string>, (key, value) => void, () => void ]`.
- Reads/writes URL search params prefixed `<prefix>f_` (e.g.
  `?myprefixf_status=active`), so a filtered view **survives refresh and
  back/forward navigation** and is shareable as a link.
- The prefix namespaces multiple tables on one page and keeps filter
  params from clobbering the sort params managed by `useUrlSortState`.

---

## Wiring it together (the shape to copy)

1. `const [sortConfig, handleSort] = useUrlSortState('mytable')`
2. `const [columnFilters, handleFilter, clearFilters] = useUrlFilterState('mytable')`
3. Apply filters to your data, then `sortRows(filtered, sortConfig, accessors)`.
4. Slice for the current page; render rows; drop in `<TablePaginationFooter currentPage … totalItems … pageSize … onPageChange … />`.
5. Each `<SortableTableHead>` gets its `sortKey`, the shared `sortConfig`/`onSort`, and (where useful) `filterable` + the matching `filterType`/`filterOptions`/`filterSuggestions` + `filterValue={columnFilters[key]}` + `onFilter`.

`N8nTab.tsx` is the canonical end-to-end example — including the
"Clear all filters" button and the active-filter count badge.

---

## Rollout status

This pattern is being applied across the codebase's ~49 table-bearing
components in a phased sweep — see
[`../plans/table-filter-upgrade-plan.md`](../plans/table-filter-upgrade-plan.md)
and [`../plans/backlog.md`](../plans/backlog.md). When
adding a **new** table, start from this pattern directly rather than the
plain `<Table>` primitives — that keeps the sweep's surface from growing.

When a file is also in the dark-mode or i18n sweep, apply those changes
first, then table standardization in the same PR (per the upgrade plan's
conflict-avoidance rule).

---

## Related files

| Concern | File |
|---|---|
| Table primitives | [`client/src/components/ui/sortable-table.tsx`](../../client/src/components/ui/sortable-table.tsx) |
| Sort + filter state helpers | [`client/src/lib/sorting.ts`](../../client/src/lib/sorting.ts) |
| Pagination footer | [`client/src/components/ui/table-pagination-footer.tsx`](../../client/src/components/ui/table-pagination-footer.tsx) |
| Reference implementation | [`client/src/components/integrations/N8nTab.tsx`](../../client/src/components/integrations/N8nTab.tsx) |
| Phased rollout plan | [`../plans/table-filter-upgrade-plan.md`](../plans/table-filter-upgrade-plan.md) |
| `/standardize-table` skill | [`.claude/skills/standardize-table/SKILL.md`](../../.claude/skills/standardize-table/SKILL.md) |
