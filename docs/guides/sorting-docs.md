# Sorting & Filtering Utilities

> **Source file:** `client/src/lib/sorting.ts`  
> **UI components:** `client/src/components/ui/sortable-table.tsx`  
> **Last updated:** May 2026 (v0.7.30 — per-column filter enhancements shipped)

This document covers the complete sort + filter system used by every data table in CriteriaIQ. The system is composable: sort and filter state are independent URL-synced hooks that feed a deterministic pipeline (`raw → filtered → sorted → paginated`).

---

## Overview

| Capability | Hook / Function | Where |
|---|---|---|
| URL-synced sort state | `useUrlSortState(prefix)` | `sorting.ts` |
| URL-synced column filter state | `useUrlFilterState(prefix)` | `sorting.ts` |
| In-component sort state (no URL) | `useSortState()` | `sorting.ts` |
| Stable sort | `stableSort(array, comparator)` | `sorting.ts` |
| Column comparator factory | `makeComparator(sortConfig)` | `sorting.ts` |
| Sortable table headers with filter popovers | `SortableTableHead` | `sortable-table.tsx` |

---

## Types

```typescript
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export type Comparator<T> = (a: T, b: T) => number;

// Filter match modes for text columns
export type FilterMode = 'contains' | 'startsWith' | 'equals' | 'regex';
```

---

## Hooks

### `useUrlSortState(paramPrefix?)`

URL-aware sort state. Sort key and direction are encoded as `${prefix}Key` and `${prefix}Dir` URL params so sort state survives navigation and page refresh.

**Signature:**
```typescript
function useUrlSortState(paramPrefix?: string): [SortConfig | null, (key: string) => void]
```

**Returns:** `[sortConfig, handleSort]`
- `sortConfig` — the current `{ key, direction }` or `null` if no sort is active
- `handleSort(key)` — toggle sort for `key`; first click → `asc`, second click → `desc`

**URL format:**
```
?projectsSortKey=name&projectsSortDir=asc
```

**Example:**
```typescript
const [sortConfig, handleSort] = useUrlSortState('projects');

const sortedData = useMemo(
  () => stableSort(data, makeComparator(sortConfig)),
  [data, sortConfig]
);
```

**Multi-hook safety:** `handleSort` always reads fresh from `window.location.search` before writing, so multiple hooks on the same page (e.g. sort + filter) never clobber each other's URL params.

---

### `useUrlFilterState(paramPrefix)`

URL-aware per-column filter state. Each column's filter value is stored as `${prefix}f_${columnKey}` in the URL.

**Signature:**
```typescript
function useUrlFilterState(paramPrefix: string): [
  Record<string, string>,         // columnFilters
  (key: string, value: string) => void,  // handleFilter
  () => void                      // clearAllFilters
]
```

**Returns:** `[columnFilters, handleFilter, clearAllFilters]`
- `columnFilters` — `Record<string, string>` keyed by `sortKey`; value is the raw filter string
- `handleFilter(key, value)` — set/clear a single column's filter (`value = ""` clears it)
- `clearAllFilters()` — removes all filter params for this prefix from the URL at once

**URL format:**
```
?n8n-wff_name=critiq&n8n-wff_active=active
```

**Value encoding by filter type:**

| Filter type | Encoded as | Example |
|---|---|---|
| Text | raw string | `critiq` |
| Checkbox / multi-select | comma-separated values | `active,inactive` |
| Date range | `from\|to` (pipe-separated ISO dates) | `2025-01-01\|2026-12-31` |
| Single date bound | `from\|` or `\|to` | `2025-06-01\|` |

**Example:**
```typescript
const [columnFilters, handleColumnFilter, clearAllFilters] = useUrlFilterState('n8n-wf');
```

**Multi-hook safety:** same as `useUrlSortState` — always reads from `window.location.search` before writing.

---

### `useSortState(defaultSort?)`

Non-URL sort state for components where URL persistence is not needed (e.g. drawers, dialogs).

**Signature:**
```typescript
function useSortState(defaultSort?: SortConfig): {
  sortConfig: SortConfig | null;
  setSortConfig: (config: SortConfig | null) => void;
  handleSort: (key: string) => void;
  resetSort: () => void;
}
```

---

## Core functions

### `makeComparator(sortConfig, customComparator?)`

Returns a `Comparator<T>` for the given sort config. Handles `null` gracefully (returns identity comparator — no sort applied).

```typescript
function makeComparator<T>(
  sortConfig: SortConfig | null,
  customComparator?: Comparator<any>
): Comparator<T>
```

**Auto-detection by field name:**

| Field pattern | Comparator used |
|---|---|
| `primarySe`, `specialistSe`, `*Engineer` | `specialComparators.userName` |
| `id` | numeric |
| `updatedAt` | `specialComparators.updatedAt` (falls back to `createdAt`) |
| `*status`, `*Status` | `specialComparators.status` (extracts `.name`) |
| `*Date`, `*date` | `dateComparator` |
| everything else | `autoComparator` (detects type at runtime) |

**Auto-detection by value type (for unlisted fields):**

| Runtime type | Comparator used |
|---|---|
| `number` | `numberComparator` |
| `boolean` | `booleanComparator` |
| ISO date string | `dateComparator` |
| everything else | `stringComparator` (case-insensitive) |

Null/undefined values sort to the **end** in both directions.

---

### `stableSort(array, comparator)`

Wraps the native sort with index-based tiebreaking to guarantee stable ordering.

```typescript
function stableSort<T>(array: T[], comparator: Comparator<T>): T[]
```

- Returns a **new array** — the original is not mutated
- Equal elements preserve their original relative order

---

## SortableTableHead — sort + filter column header

The primary UI component. Renders a `<TableHead>` cell that supports click-to-sort and an optional hover-reveal filter popover.

### Props

```typescript
interface SortableTableHeadProps {
  // ── Sort props ──────────────────────────────────────────────────────
  sortKey?: string;
  sortConfig?: SortConfig | null;
  onSort?: (key: string) => void;
  sortable?: boolean;          // default true; pass false for Actions columns
  tooltipText?: string;        // override auto-generated tooltip

  // ── Base filter props (all optional — backward compatible) ──────────
  filterable?: boolean;
  filterValue?: string;        // controlled from parent via columnFilters[sortKey]
  onFilter?: (key: string, value: string) => void;
  filterPlaceholder?: string;

  // ── Enhanced filter props ──────────────────────────────────────────
  filterOptions?: { label: string; value: string }[];  // checkbox mode for enum columns
  filterType?: 'text' | 'dateRange';                   // default 'text'
  filterSuggestions?: string[];                        // autocomplete options (text mode)
  filterMode?: FilterMode;                             // active match mode
  onFilterModeChange?: (key: string, mode: FilterMode) => void;

  // ── Standard HTML ──────────────────────────────────────────────────
  children: React.ReactNode;
  className?: string;
}
```

### Filter modes (text columns)

When `onFilterModeChange` is wired up, a 4-button segmented control appears inside the filter popover:

| Button | Mode | Behaviour |
|---|---|---|
| `~` | `contains` (default) | `haystack.includes(term)` |
| `^` | `startsWith` | `haystack.startsWith(term)` |
| `=` | `equals` | `haystack === term` |
| `.*` | `regex` | `new RegExp(term, 'i').test(haystack)` |

### Visual behaviour

- Filter icon (`ListFilter`) is **hidden** until the cell is hovered (`group-hover:opacity-100`)
- When a filter is **active** (`filterValue` non-empty), the icon stays permanently visible in **blue**
- `filterOptions` present → renders checkboxes instead of a text input
- `filterType="dateRange"` → renders From/To `<input type="date">` pickers
- Text input debounces at **200ms** to avoid firing on every keystroke
- Text input local value syncs to `filterValue` prop via `useEffect` — so `clearAllFilters()` from the parent immediately resets the input

---

## Standard table data pipeline

Every table must follow this order:

```
rawData  →  filteredData  →  sortedData  →  paginatedData
```

Never sort before filtering; never paginate before sorting.

### Full example — production pattern (N8nTab.tsx)

```typescript
// 1. URL-synced state
const [sortConfig, handleSort]                       = useUrlSortState('n8n-wf');
const [columnFilters, handleColumnFilter, clearAll]  = useUrlFilterState('n8n-wf');
const [filterModes, setFilterModes]                  = useState<Record<string, FilterMode>>({});
const [page, setPage]                                = useState(1);
const PAGE_SIZE = 10;

// Helpers
const handleFilterModeChange = (key: string, mode: FilterMode) => {
  setFilterModes(prev => ({ ...prev, [key]: mode }));
};
const activeFilterCount = Object.values(columnFilters)
  .filter(v => v && v.replace(/\|/g, '').trim()).length;

// Autocomplete suggestions from live data
const nameSuggestions = useMemo(
  () => [...new Set(rawItems.map(i => i.name).filter(Boolean))].sort() as string[],
  [rawItems]
);

// 2. Filter step
const filteredItems = useMemo(() => {
  return rawItems.filter(item => {
    for (const [key, rawValue] of Object.entries(columnFilters)) {
      if (!rawValue) continue;

      // Checkbox: comma-separated selected values
      if (key === 'active') {
        const selected = rawValue.split(',').filter(Boolean);
        if (selected.length === 0) continue;
        const display = item.active ? 'active' : 'inactive';
        if (!selected.includes(display)) return false;
        continue;
      }

      // Date range: "from|to"
      if (key === 'createdAt' && rawValue.includes('|')) {
        const [from, to] = rawValue.split('|');
        const date = new Date(item.createdAt ?? '');
        if (from && date < new Date(from)) return false;
        if (to   && date > new Date(`${to}T23:59:59`)) return false;
        continue;
      }

      // Text with mode
      const term = rawValue.trim().toLowerCase();
      if (!term) continue;
      const haystack = String((item as any)[key] ?? '').toLowerCase();
      const mode = filterModes[key] ?? 'contains';
      let matches: boolean;
      switch (mode) {
        case 'startsWith': matches = haystack.startsWith(term); break;
        case 'equals':     matches = haystack === term; break;
        case 'regex':
          try { matches = new RegExp(term, 'i').test(haystack); } catch { matches = false; }
          break;
        default: matches = haystack.includes(term);
      }
      if (!matches) return false;
    }
    return true;
  });
}, [rawItems, columnFilters, filterModes]);

// 3. Sort step
const sortedItems = useMemo(
  () => stableSort(filteredItems, makeComparator(sortConfig)),
  [filteredItems, sortConfig]
);

// 4. Paginate step
const paginatedItems = useMemo(() => {
  const start = (page - 1) * PAGE_SIZE;
  return sortedItems.slice(start, start + PAGE_SIZE);
}, [sortedItems, page]);

// 5. Reset effects
useEffect(() => { setPage(1); }, [sortConfig]);
useEffect(() => { setPage(1); }, [columnFilters]);
useEffect(() => { setPage(1); }, [filterModes]);
useEffect(() => {
  const total = Math.ceil(sortedItems.length / PAGE_SIZE);
  if (page > total && total > 0) setPage(total);
}, [sortedItems.length, page]);
```

### Column headers

```tsx
{/* Text + mode selector + autocomplete */}
<SortableTableHead
  sortKey="name" sortConfig={sortConfig} onSort={handleSort}
  filterable filterValue={columnFilters["name"]} onFilter={handleColumnFilter}
  filterSuggestions={nameSuggestions}
  filterMode={filterModes["name"]} onFilterModeChange={handleFilterModeChange}
>
  Name
</SortableTableHead>

{/* Checkbox — no mode selector, no text input */}
<SortableTableHead
  sortKey="active" sortConfig={sortConfig} onSort={handleSort}
  filterable filterValue={columnFilters["active"]} onFilter={handleColumnFilter}
  filterOptions={[
    { label: 'Active',   value: 'active'   },
    { label: 'Inactive', value: 'inactive' },
  ]}
>
  Status
</SortableTableHead>

{/* Date range */}
<SortableTableHead
  sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort}
  filterable filterValue={columnFilters["createdAt"]} onFilter={handleColumnFilter}
  filterType="dateRange"
>
  Created
</SortableTableHead>

{/* Non-sortable but filterable (e.g. URL column) */}
<SortableTableHead
  sortKey="webhookUrl" sortable={false}
  filterable filterValue={columnFilters["webhookUrl"]} onFilter={handleColumnFilter}
  filterPlaceholder="filter by URL…"
  filterMode={filterModes["webhookUrl"]} onFilterModeChange={handleFilterModeChange}
>
  Webhook URL
</SortableTableHead>

{/* Non-filterable non-sortable */}
<SortableTableHead sortable={false}>Actions</SortableTableHead>
```

### Stats strip + clear-all button

```tsx
<div className="mb-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
  <span>
    {activeFilterCount > 0
      ? `${sortedItems.length} of ${rawItems.length} total`
      : `${rawItems.length} total`}
  </span>
  {activeFilterCount > 0 && (
    <button
      type="button"
      onClick={clearAll}
      className="ml-auto flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
    >
      <X className="h-3 w-3" />
      Clear all filters
    </button>
  )}
</div>
```

### Card title badge

```tsx
<CardTitle className="flex items-center gap-2">
  My Table ({rawItems.length})
  {activeFilterCount > 0 && (
    <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
      {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
    </Badge>
  )}
</CardTitle>
```

---

## Other sortable table exports

```typescript
// From sortable-table.tsx
export { SortableTable }         // <Table> wrapper with border/overflow styles
export { SortableTableHeader }   // <thead> with gray-50 dark:gray-800 background
export { SortableTableHead }     // sortable+filterable <th> cell (documented above)
export { StaticTableHead }       // plain non-interactive <th> cell

// Re-exported from ui/table.tsx for convenience:
export {
  Table as SortableTableBase,
  TableBody as SortableTableBody,
  TableRow as SortableTableRow,
  TableCell as SortableTableCell,
  TableFooter as SortableTableFooter,
  TableCaption as SortableTableCaption,
}
```

---

## Field-specific comparator notes

### Date fields
`makeComparator` auto-detects ISO-8601 strings via `Date.parse`. Fields named `*Date` or `*date` (e.g. `startDate`, `endDate`) also explicitly use `dateComparator`. No manual override needed for standard ISO strings.

### Boolean fields
`autoComparator` detects `boolean` at runtime. `false` sorts before `true` ascending. Use `filterOptions` (checkbox) for filtering boolean columns — free-text filtering booleans requires adding them to `CHECKBOX_COLUMNS` in the filter memo.

### Nested fields (dot notation)
```typescript
const sortConfig = { key: 'user.profile.name', direction: 'asc' };
// makeComparator traverses the object graph automatically
```

### Custom comparator
```typescript
const priorityOrder = { High: 3, Medium: 2, Low: 1 };
const priorityComparator = (a: string, b: string) =>
  (priorityOrder[a] ?? 0) - (priorityOrder[b] ?? 0);

const comparator = makeComparator(sortConfig, priorityComparator);
```

---

## Migration guide (existing tables → standard pattern)

Use the `/standardize-table` Claude Code skill — it automates all 15 steps. Manual path:

1. **Sort state** — replace any `useState`/`useSortState` with `useUrlSortState(prefix)`
2. **Filter state** — add `useUrlFilterState(prefix)` with the same prefix
3. **Pipeline** — `raw → filtered → sorted → paginated` in that order
4. **Headers** — replace `<TableHead>` with `<SortableTableHead>` + add filter props
5. **Footer** — add `<TablePaginationFooter>` wired to `sortedItems.length`
6. **Card** — add `relative overflow-hidden` to `<Card>`, `relative z-10` to `<CardHeader>` and `<CardContent>`, and `<DecorativeCardIcon>` as the first child

Full checklist: [`.claude/skills/standardize-table/SKILL.md`](../../.claude/skills/standardize-table/SKILL.md)

---

## Common pitfalls

| Problem | Fix |
|---|---|
| Sort clears filter params from URL | Both hooks read from `window.location.search` before writing — ensure you're not on a stale version of `sorting.ts` |
| Filter icon never appears | All three must be passed together: `filterable`, `filterValue`, AND `onFilter` |
| Checkbox column shows text input | Add `filterOptions` prop with the enum values |
| Date column shows text input | Add `filterType="dateRange"` prop |
| Autocomplete doesn't appear | Must pass `filterSuggestions` AND have a non-empty `localValue` that matches at least one suggestion |
| Mode selector doesn't appear | `onFilterModeChange` must be passed (not just `filterMode`) |
| "Clear all" doesn't reset text inputs | The `useEffect` inside `SortableTableHead` syncs `localValue` when `filterValue` becomes `""` — only works if `clearAllFilters` sets the URL params to `""` (not deletes them with `null`) |
| Filter pipeline in wrong order | Always: `filteredItems → sortedItems → paginatedItems`. Sorting before filtering means filters apply to a pre-sorted view only. |
| Page doesn't reset on filter mode change | Add `useEffect(() => { setPage(1); }, [filterModes])` |
| `FilterMode` type not found | `import { FilterMode } from "@/lib/sorting"` |

---

## Best practices

1. **Always use `useUrlFilterState` over `useState`** for filter state on full-page tables — URL persistence costs nothing and users appreciate filters surviving navigation
2. **Match filter type to data type** — enums get checkboxes, dates get date pickers, free text gets the mode selector; never make users type `"active"` when a checkbox exists
3. **Provide `filterSuggestions`** for columns with high cardinality free text (names, owners, projects) — computing from the raw dataset is cheap and avoids typo mismatches
4. **Keep `CHECKBOX_COLUMNS` and `DATE_RANGE_COLUMNS` as local constants** inside the filter memo so the intent is self-documenting
5. **Memoize suggestions** with `useMemo` keyed on the raw data array — they're cheap to compute but re-running on every render is wasteful
6. **Don't skip the stats strip** — showing `"N of M total"` when filters are active is the primary affordance that tells users their view is narrowed

---

## Version history

| Version | Changes |
|---|---|
| v0.7.30 | Added `useUrlFilterState`, `FilterMode` type. Added per-column filter capabilities to `SortableTableHead`: text with debounce + mode selector + autocomplete, checkbox multi-select, date range picker. Fixed `useUrlSortState.handleSort` to read from `window.location.search` to prevent multi-hook URL param clobbering. |
| v0.7.10 | `useUrlSortState` introduced; `SortableTableHead`, `SortableTableBody`, `SortableTableRow`, `SortableTableCell` components. |
| v0.1.60 | Initial sort utilities: `stableSort`, `makeComparator`, `useSortState`, error boundary integration, i18n support. |
