import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ArrowUpDown, ArrowUp, ArrowDown, ListFilter } from 'lucide-react';
import { SortConfig } from '@/lib/sorting';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from '@/components/ui/table';

import { cn } from '@/lib/utils';

export type FilterMode = 'contains' | 'startsWith' | 'equals' | 'regex';

interface FilterOption {
  label: string;
  value: string;
}

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey?: string;
  sortConfig?: SortConfig | null;

  onSort?: (key: string) => void;
  children?: React.ReactNode;
  tooltipText?: string;
  className?: string;
  sortable?: boolean;
  /** Horizontal alignment of the label + sort arrow (use 'right' for numeric columns). */
  align?: 'left' | 'center' | 'right';
  // Per-column filter props (all optional — backward compatible)
  filterable?: boolean;
  filterValue?: string;
  onFilter?: (key: string, value: string) => void;
  filterPlaceholder?: string;
  // Enhanced filter props
  filterOptions?: FilterOption[];                                         // checkbox mode for enum columns
  filterType?: 'text' | 'dateRange';                                     // 'text' (default) or 'dateRange'
  filterSuggestions?: string[];                                           // autocomplete suggestions
  filterMode?: FilterMode;                                                // text match mode
  onFilterModeChange?: (key: string, mode: FilterMode) => void;
  /** Optional control rendered after the label (e.g. a "sort by" field
   *  picker for a column that merges several fields). Kept outside the
   *  sort button so it can hold its own interactive element. */
  headerAddon?: React.ReactNode;
}

export function SortableTableHead({
  sortKey,
  sortConfig,
  onSort,
  children,
  tooltipText,
  className = '',
  sortable = true,
  align = 'left',
  filterable = false,
  filterValue,
  onFilter,
  filterPlaceholder,
  filterOptions,
  filterType = 'text',
  filterSuggestions,
  filterMode,
  onFilterModeChange,
  headerAddon,
  ...props
}: SortableTableHeadProps) {
  const { t } = useTranslation();
  const [filterOpen, setFilterOpen] = useState(false);
  // Local input value with 200 ms debounce so the filter memo doesn't fire on every keystroke
  const [localValue, setLocalValue] = useState(filterValue ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when external filterValue changes (e.g. clear-all from parent)
  useEffect(() => {
    setLocalValue(filterValue ?? '');
  }, [filterValue]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const isActive = sortKey != null && sortConfig?.key === sortKey;
  const direction = isActive && sortConfig ? sortConfig.direction : null;

  const isNotSortable = !sortable || !sortKey || !onSort ||
    (typeof children === 'string' &&
      (children.toLowerCase().includes('actions') || children.toLowerCase().includes('action')));

  const renderSortIcon = () => {
    if (isNotSortable) return null;
    if (isActive) {
      return direction === 'asc'
        ? <ArrowUp className="h-3 w-3" />
        : <ArrowDown className="h-3 w-3" />;
    }
    return <ArrowUpDown className="h-3 w-3 opacity-40 group-hover:opacity-70 transition-opacity" />;
  };

  const resolvedTooltip = tooltipText ??
    (isNotSortable ? undefined :
      (typeof children === 'string' && children.length > 0
        ? t('common.table.sortBy', { column: children })
        : t('common.table.clickToSort')));

  const sortControl = isNotSortable ? (
    <span className="text-muted-foreground">{children}</span>
  ) : (
    <button
      type="button"
      onClick={() => onSort && sortKey && onSort(sortKey)}
      className={cn(
        "group inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {children}
      {renderSortIcon()}
    </button>
  );

  // Own provider so the header also works outside the app shell (tests, portals).
  const sortWithTooltip = resolvedTooltip ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{sortControl}</TooltipTrigger>
        <TooltipContent side="top" className="!bg-white !text-black !text-xs !px-2 !py-1 !border !border-gray-200 !shadow-md !font-normal dark:!bg-gray-900 dark:!text-gray-100 dark:!border-gray-700">
          {resolvedTooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : sortControl;

  const hasFilter = filterable && sortKey && onFilter;
  const filterLabel = typeof children === 'string' ? children : sortKey ?? '';
  const resolvedPlaceholder = filterPlaceholder ?? t('common.table.filterPlaceholder', { column: filterLabel.toLowerCase() });

  // Debounced text input handler
  const handleTextInput = (val: string) => {
    setLocalValue(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilter?.(sortKey!, val);
    }, 200);
  };

  // Autocomplete: matching suggestions from dataset (text mode only)
  const matchingSuggestions = (filterSuggestions && localValue.trim())
    ? filterSuggestions
        .filter(s =>
          s.toLowerCase().includes(localValue.toLowerCase()) &&
          s.toLowerCase() !== localValue.toLowerCase()
        )
        .slice(0, 5)
    : [];

  // An active filter is any non-empty value (handles "", "|" for cleared date ranges)
  const isFilterActive = !!(filterValue && filterValue.replace(/\|/g, '').trim());

  // ── Popover content ──────────────────────────────────────────────────────
  const renderFilterContent = () => {
    if (!hasFilter) return null;

    // ─ Checkbox / multi-select mode (enum columns: active, trigger type, etc.) ─
    if (filterOptions && filterOptions.length > 0) {
      const selectedValues = filterValue ? filterValue.split(',').filter(Boolean) : [];
      const toggleValue = (val: string) => {
        const next = selectedValues.includes(val)
          ? selectedValues.filter(v => v !== val)
          : [...selectedValues, val];
        onFilter!(sortKey!, next.join(','));
      };
      return (
        <>
          <p className="text-xs font-medium text-muted-foreground">{filterLabel}</p>
          <div className="space-y-1.5">
            {filterOptions.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-xs cursor-pointer text-foreground hover:text-foreground/80"
              >
                <input
                  type="checkbox"
                  checked={selectedValues.includes(opt.value)}
                  onChange={() => toggleValue(opt.value)}
                  className="h-3.5 w-3.5 rounded accent-blue-600"
                />
                {opt.label}
              </label>
            ))}
          </div>
          {filterValue && (
            <Button
              size="sm" variant="ghost" className="w-full h-6 text-xs"
              onClick={() => { onFilter!(sortKey!, ''); setFilterOpen(false); }}
            >
              {t('common.table.clearFilter')}
            </Button>
          )}
        </>
      );
    }

    // ─ Date range mode ───────────────────────────────────────────────────
    if (filterType === 'dateRange') {
      const parts = (filterValue || '').split('|');
      const fromVal = parts[0] || '';
      const toVal = parts[1] || '';
      const updateRange = (newFrom: string, newTo: string) => {
        const val = newFrom || newTo ? `${newFrom}|${newTo}` : '';
        onFilter!(sortKey!, val);
      };
      return (
        <>
          <p className="text-xs font-medium text-muted-foreground">{filterLabel}</p>
          <div className="space-y-2">
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">{t('common.table.from')}</p>
              <input
                type="date"
                value={fromVal}
                onChange={e => updateRange(e.target.value, toVal)}
                className="w-full h-7 text-xs border rounded-md px-2 bg-background text-foreground dark:bg-gray-900 dark:border-gray-700"
              />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground">{t('common.table.to')}</p>
              <input
                type="date"
                value={toVal}
                onChange={e => updateRange(fromVal, e.target.value)}
                className="w-full h-7 text-xs border rounded-md px-2 bg-background text-foreground dark:bg-gray-900 dark:border-gray-700"
              />
            </div>
          </div>
          {filterValue && (
            <Button
              size="sm" variant="ghost" className="w-full h-6 text-xs"
              onClick={() => { onFilter!(sortKey!, ''); setFilterOpen(false); }}
            >
              {t('common.table.clearDates')}
            </Button>
          )}
        </>
      );
    }

    // ─ Text mode (default) ───────────────────────────────────────────────
    const MODES: { value: FilterMode; label: string; title: string }[] = [
      { value: 'contains',   label: '~',  title: t('common.table.modeContains') },
      { value: 'startsWith', label: '^',  title: t('common.table.modeStartsWith') },
      { value: 'equals',     label: '=',  title: t('common.table.modeEquals') },
      { value: 'regex',      label: '.*', title: t('common.table.modeRegex') },
    ];
    const currentMode = filterMode ?? 'contains';

    return (
      <>
        <p className="text-xs font-medium text-muted-foreground">{filterLabel}</p>
        {/* Mode selector — only rendered when parent wires up onFilterModeChange */}
        {onFilterModeChange && sortKey && (
          <div className="flex rounded-md border overflow-hidden divide-x text-[10px]">
            {MODES.map(m => (
              <button
                key={m.value}
                type="button"
                title={m.title}
                onClick={() => onFilterModeChange(sortKey!, m.value)}
                className={cn(
                  'flex-1 px-1.5 py-1 font-mono transition-colors',
                  currentMode === m.value
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'text-muted-foreground hover:bg-muted'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        <Input
          autoFocus
          placeholder={resolvedPlaceholder}
          value={localValue}
          onChange={e => handleTextInput(e.target.value)}
          className="h-7 text-xs"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setFilterOpen(false); }}
        />
        {/* Autocomplete suggestions */}
        {matchingSuggestions.length > 0 && (
          <div className="border rounded-md overflow-hidden divide-y max-h-[120px] overflow-y-auto">
            {matchingSuggestions.map(s => (
              <button
                key={s}
                type="button"
                className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  setLocalValue(s);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  onFilter!(sortKey!, s);
                  setFilterOpen(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {filterValue && (
          <Button
            size="sm" variant="ghost" className="w-full h-6 text-xs"
            onClick={() => {
              setLocalValue('');
              if (debounceRef.current) clearTimeout(debounceRef.current);
              onFilter!(sortKey!, '');
              setFilterOpen(false);
            }}
          >
            {t('common.table.clearFilter')}
          </Button>
        )}
      </>
    );
  };

  const filterButton = hasFilter ? (
    <Popover open={filterOpen} onOpenChange={setFilterOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={e => e.stopPropagation()}
          className={cn(
            "rounded p-0.5 transition-all shrink-0",
            isFilterActive
              ? "opacity-100 text-blue-600 dark:text-blue-400"
              : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          )}
          aria-label={t('common.table.filterBy', { column: filterLabel })}
        >
          <ListFilter className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-56 p-3 space-y-2"
        align="start"
        side="bottom"
        onClick={e => e.stopPropagation()}
      >
        {renderFilterContent()}
      </PopoverContent>
    </Popover>
  ) : null;

  const ariaSort = isNotSortable ? undefined : direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none';

  return (
    <TableHead
      className={cn("font-medium px-3 py-3 group", align === 'right' && 'text-right', align === 'center' && 'text-center', className)}
      aria-sort={ariaSort}
      {...props}
    >
      <div className={cn("flex items-center gap-1", align === 'right' && 'justify-end', align === 'center' && 'justify-center')}>
        {sortWithTooltip}
        {headerAddon}
        {filterButton}
      </div>
    </TableHead>
  );
}

interface StaticTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: React.ReactNode;
  className?: string;
}

export function StaticTableHead({ children, className = '', ...props }: StaticTableHeadProps) {
  return (
    <TableHead
      className={cn("font-medium px-3 py-3 text-muted-foreground", className)}
      {...props}
    >
      {children}
    </TableHead>
  );
}

interface SortableTableProps {
  children?: React.ReactNode;
  className?: string;
}

export function SortableTable({ children, className = '', ...props }: SortableTableProps) {
  return (
    <Table className={`border border-separate border-spacing-0 rounded-lg overflow-hidden ${className}`} {...props}>
      {children}
    </Table>
  );
}

export function SortableTableHeader({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return (
    <thead ref={ref} className={cn("[&_tr]:border-b table-header bg-gray-50 dark:bg-gray-800", className)} {...props} />
  );
}

export {
  Table as SortableTableBase,
  TableBody as SortableTableBody,
  TableRow as SortableTableRow,
  TableCell as SortableTableCell,
  TableFooter as SortableTableFooter,
  TableCaption as SortableTableCaption,
};
