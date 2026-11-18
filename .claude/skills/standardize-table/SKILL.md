# standardize-table — upgrade any CriteriaIQ table to the standard pattern

Applies the **Standard Table Pattern** documented in `PROJECT_REFERENCE.md` to an existing
component. Invoked as `/standardize-table <path/to/Component.tsx>` with the target file path.

This is a **Code-only skill** (runs inside Claude Code, not published to Chat/Cowork).

---

## What "standard" means

Every CriteriaIQ data table must have:

1. **Sortable column headers** — `SortableTable` / `SortableTableHead` from `client/src/components/ui/sortable-table.tsx`
2. **Sort state synced to URL** — `useUrlSortState(prefix)` from `client/src/lib/sorting.ts`
3. **Stable client-side sort** — `stableSort(array, makeComparator(sortConfig))`
4. **Pagination footer** — `TablePaginationFooter` from `client/src/components/ui/table-pagination-footer.tsx`, page size 10
5. **Decorative background icon** — `DecorativeCardIcon` from `client/src/components/ui/decorative-card-icon.tsx`; uses the same icon as the card title
6. **Card content at `z-10`** — `<CardHeader className="relative z-10">` and `<CardContent className="relative z-10">`
7. **Card `relative overflow-hidden`** — `<Card className="relative overflow-hidden">`

Reference implementation: `client/src/components/configuration/ComplianceSection.tsx`

---

## Step-by-step checklist

### 1. Read the target file
Read the full component. Identify:
- The data array being rendered (e.g. `items`, `workflows`, `users`)
- The current table markup (`<Table>`, `<table>`, etc.)
- Any existing sort or pagination logic (may be absent)
- The card/container structure
- The icon used in the card title (needed for `DecorativeCardIcon`)
- All existing imports

### 2. Determine the `useUrlSortState` prefix
Pick a short, URL-safe prefix that won't collide with other tables on the same page.
Format: 2–6 lowercase chars, e.g. `wf` for workflows, `user` for users, `reg` for regulations.
The same prefix is reused for the filter state (see Step 15).

### 3. Check which standard components are already imported
If `SortableTable`, `TablePaginationFooter`, etc. are already present, skip adding them.

### 4. Add missing imports

```ts
import { useUrlSortState, useUrlFilterState, makeComparator, stableSort, FilterMode } from "@/lib/sorting";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableHead,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
```

Add `useMemo`, `useEffect`, and `useState` to the React import if not already present.

### 5. Add sort state + sort memo

```ts
const [sortConfig, handleSort] = useUrlSortState("<prefix>");

const sortedItems = useMemo(
  () => stableSort(rawItems, makeComparator(sortConfig)),
  [rawItems, sortConfig]
);
```

Where `rawItems` is the unsorted data array from the query.

### 6. Add pagination state + paginate memo

```ts
const [currentPage, setCurrentPage] = useState(1);
const PAGE_SIZE = 10;

const paginatedItems = useMemo(() => {
  const start = (currentPage - 1) * PAGE_SIZE;
  return sortedItems.slice(start, start + PAGE_SIZE);
}, [sortedItems, currentPage]);
```

### 7. Add reset effects

```ts
// Reset to page 1 when sort changes
useEffect(() => { setCurrentPage(1); }, [sortConfig]);

// Clamp page when data shrinks
useEffect(() => {
  const totalPages = Math.ceil(sortedItems.length / PAGE_SIZE);
  if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
}, [sortedItems.length, currentPage]);
```

### 8. Update the Card wrapper

Change the `<Card>` opening tag to:
```tsx
<Card className="relative overflow-hidden ...existing-classes...">
```

Add `<DecorativeCardIcon icon={SameIconAsTitle} />` as the first child of `<Card>`.

Add `className="relative z-10"` to both `<CardHeader>` and `<CardContent>`.

### 9. Replace table headers

Replace every `<TableHead>` (or `<th>`) with `<SortableTableHead>`:
- Sortable column: `<SortableTableHead sortKey="fieldName" sortConfig={sortConfig} onSort={handleSort}>Label</SortableTableHead>`
- Non-sortable column (Actions, URLs, complex cells): `<SortableTableHead sortable={false}>Label</SortableTableHead>`

Replace `<TableHeader>` with `<SortableTableHeader>`.
Replace `<TableBody>` with `<SortableTableBody>`.
Replace `<TableRow>` with `<SortableTableRow>`.
Replace `<TableCell>` with `<SortableTableCell>`.

Wrap the whole table in `<div className="border rounded-lg overflow-hidden">`.

### 10. Replace the data source in the map

Change `items.map(...)` → `paginatedItems.map(...)`.

### 11. Add `TablePaginationFooter` after the table div

```tsx
<TablePaginationFooter
  totalItems={sortedItems.length}
  pageSize={PAGE_SIZE}
  currentPage={currentPage}
  onPageChange={setCurrentPage}
  entityLabel="items"   // ← lowercase plural noun: "workflows", "users", etc.
/>
```

### 12. Verify dark mode

All standard components handle dark mode automatically. Check only custom cell content
(badges, text spans, code blocks) for missing `dark:` classes.

### 13. Verify i18n

If the component is i18n-enabled (`useTranslation`), pass column header labels through `t()`
and add any missing keys to `client/src/i18n/locales/en-US.json`.

### 14. Run a TypeScript sanity check

After editing, mentally verify:
- No implicit `any` from the new `useMemo` / `useEffect` hooks
- `sortConfig` type is `SortConfig | null` — `useUrlSortState` returns that
- `makeComparator` accepts `SortConfig | null` — safe to call without a null guard
- `FilterMode` is imported from `@/lib/sorting` if used

If the component already has a filter step (`filteredItems`), pass `filteredItems` as the
input to `stableSort` (not the raw query result) so sorting and filtering compose correctly.
Also reset page on filter state changes:
```ts
useEffect(() => { setCurrentPage(1); }, [filterState1, filterState2]);
```

### 15. (Optional) Enable per-column filters

`SortableTableHead` supports full per-column filtering including text with mode selector,
checkbox multi-select for enum columns, date range pickers, and autocomplete from live data.
All props are optional — backward compatible with any existing usage.

#### 15a. Core filter state (URL-persisted)

```ts
// URL-synced filter state — survives page refresh and back/forward navigation
const [columnFilters, handleColumnFilter, clearAllFilters] = useUrlFilterState("<prefix>");

// Per-column match modes (component state — ephemeral)
const [filterModes, setFilterModes] = useState<Record<string, FilterMode>>({});
const handleFilterModeChange = (key: string, mode: FilterMode) => {
  setFilterModes(prev => ({ ...prev, [key]: mode }));
};

// Active filter count — for the badge and clear-all button
const activeFilterCount = Object.values(columnFilters)
  .filter(v => v && v.replace(/\|/g, '').trim()).length;
```

Reset page on filter and mode changes:
```ts
useEffect(() => { setCurrentPage(1); }, [columnFilters]);
useEffect(() => { setCurrentPage(1); }, [filterModes]);
```

#### 15b. Filter memo — insert BEFORE the sort memo, feed its output into `stableSort`

The filter pipeline must be: `rawItems → filteredItems → sortedItems → paginatedItems`.

```ts
const filteredItems = useMemo(() => {
  const CHECKBOX_COLUMNS = ['active', 'status']; // columns with filterOptions
  const DATE_RANGE_COLUMNS = ['createdAt', 'updatedAt']; // columns with filterType="dateRange"

  return rawItems.filter(item => {
    for (const [key, rawValue] of Object.entries(columnFilters)) {
      if (!rawValue) continue;

      // Checkbox / multi-select (comma-separated selected values)
      if (CHECKBOX_COLUMNS.includes(key)) {
        const selected = rawValue.split(',').filter(Boolean);
        if (selected.length === 0) continue;
        const display = getCheckboxDisplay(item, key); // implement per-column
        if (!selected.includes(display)) return false;
        continue;
      }

      // Date range ("from|to" pipe-separated ISO dates)
      if (DATE_RANGE_COLUMNS.includes(key) && rawValue.includes('|')) {
        const [from, to] = rawValue.split('|');
        const dateStr = (item as any)[key];
        if (!dateStr) { if (from || to) return false; continue; }
        const date = new Date(dateStr);
        if (from && !isNaN(new Date(from).getTime()) && date < new Date(from)) return false;
        if (to   && !isNaN(new Date(to).getTime())   && date > new Date(`${to}T23:59:59`)) return false;
        continue;
      }

      // Text filter with mode
      const term = rawValue.trim().toLowerCase();
      if (!term) continue;
      const haystack = String((item as any)[key] ?? '').toLowerCase();
      const mode = filterModes[key] ?? 'contains';
      let matches: boolean;
      switch (mode) {
        case 'startsWith': matches = haystack.startsWith(term); break;
        case 'equals':     matches = haystack === term; break;
        case 'regex':
          try { matches = new RegExp(term, 'i').test(haystack); }
          catch { matches = false; }
          break;
        default: matches = haystack.includes(term);
      }
      if (!matches) return false;
    }
    return true;
  });
}, [rawItems, columnFilters, filterModes]);

const sortedItems = useMemo(
  () => stableSort(filteredItems, makeComparator(sortConfig)),
  [filteredItems, sortConfig]
);
```

#### 15c. Autocomplete suggestions (optional, for text columns)

Compute distinct values from the raw dataset and pass as `filterSuggestions`:

```ts
const nameSuggestions = useMemo(
  () => [...new Set(rawItems.map(i => i.name).filter(Boolean))].sort() as string[],
  [rawItems]
);
```

#### 15d. Card header filter count badge

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

#### 15e. Stats strip with "Clear all filters" button

```tsx
<div className="mb-3 flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
  {/* ...existing stats... */}
  <span>
    {activeFilterCount > 0
      ? `${sortedItems.length} of ${rawItems.length} total`
      : `${rawItems.length} total`}
  </span>
  {activeFilterCount > 0 && (
    <button
      type="button"
      onClick={clearAllFilters}
      className="ml-auto flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
    >
      <X className="h-3 w-3" />
      Clear all filters
    </button>
  )}
</div>
```

#### 15f. Wire up column headers

**Text column with autocomplete and mode selector:**
```tsx
<SortableTableHead
  sortKey="name"
  sortConfig={sortConfig} onSort={handleSort}
  filterable
  filterValue={columnFilters["name"]}
  onFilter={handleColumnFilter}
  filterSuggestions={nameSuggestions}
  filterMode={filterModes["name"]}
  onFilterModeChange={handleFilterModeChange}
>
  Name
</SortableTableHead>
```

**Checkbox column (enum: active/inactive, status values):**
```tsx
<SortableTableHead
  sortKey="active"
  sortConfig={sortConfig} onSort={handleSort}
  filterable
  filterValue={columnFilters["active"]}
  onFilter={handleColumnFilter}
  filterOptions={[
    { label: 'Active',   value: 'active'   },
    { label: 'Inactive', value: 'inactive' },
  ]}
>
  Status
</SortableTableHead>
```

**Date range column:**
```tsx
<SortableTableHead
  sortKey="createdAt"
  sortConfig={sortConfig} onSort={handleSort}
  filterable
  filterValue={columnFilters["createdAt"]}
  onFilter={handleColumnFilter}
  filterType="dateRange"
>
  Created
</SortableTableHead>
```

**Non-sortable column that's still filterable (e.g. URL):**
```tsx
<SortableTableHead
  sortKey="urlField"       {/* sortKey used as filter key even though sortable=false */}
  sortable={false}
  filterable
  filterValue={columnFilters["urlField"]}
  onFilter={handleColumnFilter}
  filterPlaceholder="filter by URL…"
  filterMode={filterModes["urlField"]}
  onFilterModeChange={handleFilterModeChange}
>
  URL
</SortableTableHead>
```

---

## Common pitfalls

| Problem | Fix |
|---|---|
| `SortableTableHead` inside `<TableHeader>` instead of `<SortableTableHeader>` | Replace `<TableHeader>` → `<SortableTableHeader>` |
| Sort not working on date fields | Date ISO strings are auto-detected by `makeComparator` via `Date.parse` — ensure the field contains ISO-8601 strings |
| Page doesn't reset when filters change | Add `useEffect(() => { setCurrentPage(1); }, [columnFilters])` and also `[filterModes]` |
| `DecorativeCardIcon` not visible | Check that `<Card>` has `relative overflow-hidden` and `<CardContent>` has `relative z-10` |
| Tooltip errors | `SortableTableHead` uses Radix `<Tooltip>` — a `<TooltipProvider>` must wrap the page (global `PageLayout` provides this) |
| Filter icon never appears | Must pass all three together: `filterable`, `filterValue`, AND `onFilter`. Missing any one suppresses the icon. |
| Filter icon appears but is always visible (not hover-only) | `SortableTableHead` adds `group` automatically; only a problem if you override the entire `<TableHead>` cell |
| Boolean column not filtering with text | Add the column to `CHECKBOX_COLUMNS` and use `filterOptions` instead of free text |
| Filtering/sorting applied in wrong order | Pipeline must be: `rawItems → filteredItems → sortedItems → paginatedItems`. Do not sort before filtering. |
| Sort URL params cleared when filter changes | Both `useUrlSortState` and `useUrlFilterState` read from `window.location.search` before writing — they won't clobber each other as long as you use the same `prefix` for both hooks on the same table |
| `clearAllFilters` doesn't reset local input | It updates `filterValue` props to `""` which triggers `useEffect` inside `SortableTableHead` to sync the local debounce state |
| Checkbox `filterValue` shows as active even when empty | Checkbox clear sets value to `""` (not `"none"`) — the active icon check is `filterValue && filterValue.replace(/\|/g, '').trim()` which handles both `""` and `"|"` (cleared date range) |
| `FilterMode` type not found | Import from `@/lib/sorting`: `import { ..., FilterMode } from "@/lib/sorting"` |

---

## Quick reference — result shape

```
<Card className="relative overflow-hidden">
  <DecorativeCardIcon icon={TitleIcon} />
  <CardHeader className="relative z-10">
    <CardTitle className="flex items-center gap-2">
      My Table ({rawItems.length})
      {activeFilterCount > 0 && <Badge>N filters</Badge>}
    </CardTitle>
  </CardHeader>
  <CardContent className="relative z-10">
    {/* Stats strip with clear-all */}
    <div className="mb-3 flex items-center gap-2 text-xs ...">
      <span>{activeFilterCount > 0 ? `${sortedItems.length} of ${rawItems.length} total` : `${rawItems.length} total`}</span>
      {activeFilterCount > 0 && <button onClick={clearAllFilters}>Clear all filters</button>}
    </div>
    [optional <SearchFiltersSection>]
    <div className="border rounded-lg overflow-hidden">
      <SortableTable>
        <SortableTableHeader>
          <tr>
            {/* Text + autocomplete + mode selector */}
            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}
              filterable filterValue={columnFilters["name"]} onFilter={handleColumnFilter}
              filterSuggestions={nameSuggestions}
              filterMode={filterModes["name"]} onFilterModeChange={handleFilterModeChange}>
              Name
            </SortableTableHead>
            {/* Checkbox */}
            <SortableTableHead sortKey="active" sortConfig={sortConfig} onSort={handleSort}
              filterable filterValue={columnFilters["active"]} onFilter={handleColumnFilter}
              filterOptions={[{label:'Active',value:'active'},{label:'Inactive',value:'inactive'}]}>
              Status
            </SortableTableHead>
            {/* Date range */}
            <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort}
              filterable filterValue={columnFilters["createdAt"]} onFilter={handleColumnFilter}
              filterType="dateRange">
              Created
            </SortableTableHead>
            {/* Non-sortable Actions */}
            <SortableTableHead sortable={false}>Actions</SortableTableHead>
          </tr>
        </SortableTableHeader>
        <SortableTableBody>
          {paginatedItems.map(item => (
            <SortableTableRow key={item.id}>
              <SortableTableCell>{item.name}</SortableTableCell>
              <SortableTableCell>...</SortableTableCell>
            </SortableTableRow>
          ))}
        </SortableTableBody>
      </SortableTable>
    </div>
    <TablePaginationFooter
      totalItems={sortedItems.length}
      pageSize={10}
      currentPage={currentPage}
      onPageChange={setCurrentPage}
      entityLabel="items"
    />
  </CardContent>
</Card>
```
