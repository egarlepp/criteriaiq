
/**
 * Reusable sorting utilities for table components
 * 
 * This module provides a standardized way to handle sorting across all tables in the application.
 * It includes type-safe comparators, stable sorting, and URL state management.
 * 
 * @example
 * ```typescript
 * // Basic usage
 * const sortConfig = { key: 'name', direction: 'asc' };
 * const sortedData = stableSort(data, makeComparator(sortConfig));
 * 
 * // With nested fields
 * const sortConfig = { key: 'user.firstName', direction: 'desc' };
 * const sortedData = stableSort(data, makeComparator(sortConfig));
 * ```
 */

export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  direction: SortDirection;
}

export type Comparator<T> = (a: T, b: T) => number;

/**
 * Gets a nested property value from an object using dot notation
 * @param obj - The object to get the value from
 * @param path - The dot-notation path (e.g., 'user.firstName')
 * @returns The value at the specified path
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    return current[key];
  }, obj);
}

/**
 * Normalizes a value for comparison
 * Handles different data types consistently
 */
function normalizeValue(value: any): any {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.toLowerCase().trim();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  return String(value).toLowerCase().trim();
}

/**
 * String comparator with null/undefined handling
 */
export const stringComparator: Comparator<any> = (a, b) => {
  const aVal = normalizeValue(a);
  const bVal = normalizeValue(b);
  
  if (aVal === '' && bVal !== '') return 1;
  if (bVal === '' && aVal !== '') return -1;
  if (aVal === bVal) return 0;
  
  return aVal < bVal ? -1 : 1;
};

/**
 * Number comparator with null/undefined handling
 */
export const numberComparator: Comparator<any> = (a, b) => {
  const aVal = a === null || a === undefined ? Number.NEGATIVE_INFINITY : Number(a);
  const bVal = b === null || b === undefined ? Number.NEGATIVE_INFINITY : Number(b);
  
  if (isNaN(aVal) && isNaN(bVal)) return 0;
  if (isNaN(aVal)) return 1;
  if (isNaN(bVal)) return -1;
  
  return aVal - bVal;
};

/**
 * Date comparator with null/undefined handling
 */
export const dateComparator: Comparator<any> = (a, b) => {
  const aDate = a ? new Date(a) : null;
  const bDate = b ? new Date(b) : null;
  
  if (!aDate && !bDate) return 0;
  if (!aDate) return 1;
  if (!bDate) return -1;
  
  const aTime = aDate.getTime();
  const bTime = bDate.getTime();
  
  if (isNaN(aTime) && isNaN(bTime)) return 0;
  if (isNaN(aTime)) return 1;
  if (isNaN(bTime)) return -1;
  
  return aTime - bTime;
};

/**
 * Boolean comparator with null/undefined handling
 */
export const booleanComparator: Comparator<any> = (a, b) => {
  const aVal = a === null || a === undefined ? false : Boolean(a);
  const bVal = b === null || b === undefined ? false : Boolean(b);
  
  return Number(aVal) - Number(bVal);
};

/**
 * Auto-detecting comparator that chooses the appropriate comparison based on data type
 */
export const autoComparator: Comparator<any> = (a, b) => {
  // Handle null/undefined
  if ((a === null || a === undefined) && (b === null || b === undefined)) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  
  // Detect data type and use appropriate comparator
  if (typeof a === 'number' && typeof b === 'number') {
    return numberComparator(a, b);
  }
  
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return booleanComparator(a, b);
  }
  
  if (a instanceof Date || b instanceof Date || 
      (typeof a === 'string' && !isNaN(Date.parse(a))) ||
      (typeof b === 'string' && !isNaN(Date.parse(b)))) {
    return dateComparator(a, b);
  }
  
  // Default to string comparison
  return stringComparator(a, b);
};

/**
 * Special comparators for common field patterns
 */
export const specialComparators = {
  /**
   * User name comparator - handles user objects with firstName/lastName or email fallback
   */
  userName: (a: any, b: any) => {
    const getName = (user: any) => {
      if (!user) return 'Not assigned';
      if (typeof user === 'string') return user;
      if (typeof user === 'object') {
        const name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        return name || user.email || 'Unknown';
      }
      return String(user);
    };
    
    return stringComparator(getName(a), getName(b));
  },

  /**
   * Status comparator - handles status objects with color configuration
   */
  status: (a: any, b: any) => {
    const getStatusName = (status: any) => {
      if (!status) return '';
      if (typeof status === 'string') return status;
      if (typeof status === 'object' && status.name) return status.name;
      return String(status);
    };
    
    return stringComparator(getStatusName(a), getStatusName(b));
  },

  /**
   * ID comparator - handles numeric IDs
   */
  id: numberComparator,

  /**
   * Updated timestamp comparator
   */
  updatedAt: (a: any, b: any) => {
    const aDate = new Date(a.updatedAt || a.createdAt);
    const bDate = new Date(b.updatedAt || b.createdAt);
    return dateComparator(aDate, bDate);
  }
};

/**
 * Creates a comparator function based on sort configuration
 * @param sortConfig - The sort configuration
 * @param customComparator - Optional custom comparator for the field
 * @returns A comparator function for the specified field and direction
 */
export function makeComparator<T>(
  sortConfig: SortConfig | null,
  customComparator?: Comparator<any>
): Comparator<T> {
  if (!sortConfig) {
    return () => 0; // No sorting
  }

  const { key, direction } = sortConfig;
  const compareFn = customComparator || autoComparator;
  
  return (a: T, b: T) => {
    let aValue = getNestedValue(a, key);
    let bValue = getNestedValue(b, key);

    // Handle special field patterns
    if (key.includes('primarySe') || key.includes('specialistSe') || key.includes('Engineer')) {
      aValue = aValue;
      bValue = bValue;
      const result = specialComparators.userName(aValue, bValue);
      return direction === 'desc' ? -result : result;
    }

    if (key === 'id') {
      const result = specialComparators.id(aValue, bValue);
      return direction === 'desc' ? -result : result;
    }

    if (key === 'updatedAt') {
      const result = specialComparators.updatedAt(a, b);
      return direction === 'desc' ? -result : result;
    }

    if (key.includes('status') || key.includes('Status')) {
      const result = specialComparators.status(aValue, bValue);
      return direction === 'desc' ? -result : result;
    }

    if (key.includes('Date') || key.includes('date')) {
      const result = dateComparator(aValue, bValue);
      return direction === 'desc' ? -result : result;
    }

    const result = compareFn(aValue, bValue);
    return direction === 'desc' ? -result : result;
  };
}

/**
 * Performs a stable sort on an array
 * Preserves the relative order of equal elements
 * @param array - The array to sort
 * @param comparator - The comparison function
 * @returns A new sorted array
 */
export function stableSort<T>(array: T[], comparator: Comparator<T>): T[] {
  const indexed = array.map((item, index) => ({ item, index }));
  
  indexed.sort((a, b) => {
    const result = comparator(a.item, b.item);
    return result !== 0 ? result : a.index - b.index;
  });
  
  return indexed.map(({ item }) => item);
}

/**
 * Per-column value getters for `sortRows`, keyed by the column's `sortKey`.
 * Use one when the cell shows a derived value (a translated label, a count,
 * a nested field under another name). Return a number, boolean, Date or
 * string; return null/undefined/'' for "no value".
 */
export type SortAccessors<T> = Partial<Record<string, (row: T) => unknown>>;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (v instanceof Date && isNaN(v.getTime()));
}

/**
 * Compares two accessor values. Unlike `autoComparator`, strings are never
 * guessed to be dates (V8's Date.parse accepts labels like "Stage 2"):
 * return a Date or a timestamp from the accessor for date columns.
 */
function compareAccessorValues(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorts table rows for a `SortableTableHead` column. Returns a new array and
 * leaves `rows` alone; with no sort chosen the incoming order is kept, so
 * pre-sort `rows` into the table's default order. Ties keep their incoming
 * order (stable). Keys with an accessor compare the accessor's value and put
 * blanks last in both directions; other keys fall back to `makeComparator`.
 *
 * @example
 * const [sortConfig, handleSort] = useUrlSortState('pageUsage');
 * const rows = useMemo(() => sortRows(lines, sortConfig, { page: (l) => labelOf(l) }), [lines, sortConfig]);
 */
export function sortRows<T>(
  rows: readonly T[],
  sortConfig: SortConfig | null,
  accessors: SortAccessors<T> = {},
): T[] {
  if (!sortConfig) return [...rows];
  // The key comes from the URL, so only the table's own accessors count
  // (`?sort=constructor` must not pick up an Object.prototype method).
  const accessor = Object.hasOwn(accessors, sortConfig.key) ? accessors[sortConfig.key] : undefined;
  if (!accessor) return stableSort([...rows], makeComparator<T>(sortConfig));
  const sign = sortConfig.direction === 'desc' ? -1 : 1;
  return stableSort([...rows], (x, y) => {
    const a = accessor(x);
    const b = accessor(y);
    const aBlank = isBlank(a);
    const bBlank = isBlank(b);
    if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    return sign * compareAccessorValues(a, b);
  });
}

/**
 * Hook for managing sort state
 * @param defaultSort - Default sort configuration
 * @returns Sort state and handlers
 */
export function useSortState(defaultSort?: SortConfig) {
  const [sortConfig, setSortConfig] = React.useState<SortConfig | null>(defaultSort || null);

  const handleSort = (key: string) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const resetSort = () => {
    setSortConfig(null);
  };

  return {
    sortConfig,
    setSortConfig,
    handleSort,
    resetSort
  };
}

/**
 * URL-aware sort state hook
 * Manages sort state in URL search parameters
 * @param paramPrefix - Prefix for URL parameters (default: 'sort')
 * @returns Sort state and handlers that sync with URL
 */
export function useUrlSortState(paramPrefix = 'sort'): [SortConfig | null, (key: string) => void] {
  const [searchParams, setSearchParams] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });

  const sortConfig = React.useMemo(() => {
    const key = searchParams.get(`${paramPrefix}Key`);
    const direction = searchParams.get(`${paramPrefix}Dir`) as SortDirection;
    
    if (key && (direction === 'asc' || direction === 'desc')) {
      return { key, direction };
    }
    return null;
  }, [searchParams, paramPrefix]);

  const handleSort = React.useCallback((key: string) => {
    // Always read fresh URL params to avoid clobbering sibling hooks (e.g. useUrlFilterState)
    const newParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    const currentKey = newParams.get(`${paramPrefix}Key`);
    const currentDir = newParams.get(`${paramPrefix}Dir`) as SortDirection;

    const direction: SortDirection =
      currentKey === key && currentDir === 'asc' ? 'desc' : 'asc';

    newParams.set(`${paramPrefix}Key`, key);
    newParams.set(`${paramPrefix}Dir`, direction);

    setSearchParams(newParams);

    if (typeof window !== 'undefined') {
      const newUrl = `${window.location.pathname}?${newParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [paramPrefix]);

  return [sortConfig, handleSort];
}

/**
 * URL-aware column filter state hook
 * Manages per-column filter values in URL search parameters so they persist across navigation.
 * Uses `${prefix}f_${columnKey}` URL param format (e.g. `n8n-wff_name=critiq`).
 *
 * @param paramPrefix - Prefix for URL parameters (must match the sort prefix for the same table)
 * @returns [columnFilters, handleFilter, clearAllFilters]
 */
export function useUrlFilterState(paramPrefix: string): [
  Record<string, string>,
  (key: string, value: string) => void,
  () => void
] {
  const [searchParams, setSearchParams] = React.useState(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new URLSearchParams();
  });

  const columnFilters = React.useMemo(() => {
    const filters: Record<string, string> = {};
    searchParams.forEach((value, param) => {
      if (param.startsWith(`${paramPrefix}f_`) && value) {
        const key = param.slice(`${paramPrefix}f_`.length);
        filters[key] = value;
      }
    });
    return filters;
  }, [searchParams, paramPrefix]);

  const handleFilter = React.useCallback((key: string, value: string) => {
    // Always read fresh URL to avoid clobbering sort params managed by useUrlSortState
    const newParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    const paramKey = `${paramPrefix}f_${key}`;
    if (value) {
      newParams.set(paramKey, value);
    } else {
      newParams.delete(paramKey);
    }
    setSearchParams(newParams);
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?${newParams.toString()}`
      );
    }
  }, [paramPrefix]);

  const clearAllFilters = React.useCallback(() => {
    const newParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.search : ''
    );
    const keysToDelete: string[] = [];
    newParams.forEach((_, param) => {
      if (param.startsWith(`${paramPrefix}f_`)) keysToDelete.push(param);
    });
    keysToDelete.forEach(k => newParams.delete(k));
    setSearchParams(newParams);
    if (typeof window !== 'undefined') {
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}?${newParams.toString()}`
      );
    }
  }, [paramPrefix]);

  return [columnFilters, handleFilter, clearAllFilters];
}

export type FilterMode = 'contains' | 'startsWith' | 'equals' | 'regex';

// React import for hooks
import React from 'react';
