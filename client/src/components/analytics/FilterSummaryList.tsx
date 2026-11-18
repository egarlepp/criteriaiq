import React, { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { FilterChipsInput } from "./FilterChipsInput";
import type { ReportField, ReportFilter } from "./report-types";
import {
  REPORT_FILTER_OPERATOR_LABELS,
  type ReportFilterOperator,
} from "./report-filter-helpers";

export interface FilterSummaryListProps {
  filters: ReportFilter[];
  /**
   * Optional field metadata used to resolve display labels and the
   * underlying field type. When omitted, the raw `filter.field` is
   * shown and chip values render as plain strings.
   */
  fields?: ReportField[];
  /**
   * Updates the underlying filter when chips are added or removed in
   * editable mode. When omitted (or `readOnly` is true) the chip group
   * renders without remove buttons.
   */
  onFiltersChange?: (next: ReportFilter[]) => void;
  /** Render every value as read-only. Defaults to true. */
  readOnly?: boolean;
  /** Shown when there are no filters. */
  emptyMessage?: string;
  /** Heading shown above the list when provided. */
  title?: string;
  testIdPrefix?: string;
  className?: string;
}

const LIST_OPERATORS = new Set<string>(["in", "not_in"]);

function operatorLabel(operator: string): string {
  return (
    REPORT_FILTER_OPERATOR_LABELS[operator as ReportFilterOperator] ?? operator
  );
}

function formatScalarValue(value: string, fieldType?: string): string {
  if (value === "" || value === undefined || value === null) return "—";
  if (fieldType === "boolean") {
    if (value === "true") return "True";
    if (value === "false") return "False";
  }
  return value;
}

/**
 * Read-only or chip-editable summary of a list of report filters.
 *
 * Used everywhere a filter row is shown outside the Report Builder's
 * "Custom Filters" editor — the inline preview tab and the schedule
 * report dialog today, plus any future filter UI that wants the same
 * chip presentation. `in` / `not_in` filter values are rendered with
 * the same `FilterChipsInput` component the editor uses, so a long
 * list of values is scannable instead of being shown as a single
 * comma-joined blob of text.
 */
export function FilterSummaryList({
  filters,
  fields,
  onFiltersChange,
  readOnly = true,
  emptyMessage = "No filters configured.",
  title,
  testIdPrefix,
  className,
}: FilterSummaryListProps) {
  const fieldsByName = useMemo(() => {
    const map = new Map<string, ReportField>();
    (fields ?? []).forEach((field) => {
      if (field?.field) map.set(field.field, field);
    });
    return map;
  }, [fields]);

  if (!filters || filters.length === 0) {
    return (
      <div
        className={cn("text-sm text-muted-foreground", className)}
        data-testid={
          testIdPrefix ? `${testIdPrefix}-empty` : "filter-summary-empty"
        }
      >
        {title ? <div className="font-medium mb-1">{title}</div> : null}
        {emptyMessage}
      </div>
    );
  }

  const handleChipChange = (index: number, nextValue: string | string[]) => {
    if (!onFiltersChange) return;
    const next = filters.slice();
    next[index] = { ...next[index], value: nextValue };
    onFiltersChange(next);
  };

  return (
    <div
      className={cn("space-y-2", className)}
      data-testid={
        testIdPrefix ? `${testIdPrefix}-list` : "filter-summary-list"
      }
    >
      {title ? (
        <div className="text-sm font-medium text-foreground">{title}</div>
      ) : null}
      <ul className="space-y-2">
        {filters.map((filter, index) => {
          const fieldInfo = fieldsByName.get(filter.field);
          const fieldLabel = fieldInfo?.label ?? filter.field ?? "(unknown field)";
          const fieldType = fieldInfo?.type;
          const isList = LIST_OPERATORS.has(filter.operator);
          const rowTestId = testIdPrefix
            ? `${testIdPrefix}-row-${index}`
            : `filter-summary-row-${index}`;
          return (
            <li
              key={`${filter.field}-${filter.operator}-${index}`}
              className="flex flex-wrap items-center gap-2 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm"
              data-testid={rowTestId}
            >
              <Badge
                variant="outline"
                className="font-medium"
                data-testid={`${rowTestId}-field`}
              >
                {fieldLabel}
              </Badge>
              <span
                className="text-muted-foreground"
                data-testid={`${rowTestId}-operator`}
              >
                {operatorLabel(filter.operator)}
              </span>
              {isList ? (
                <FilterChipsInput
                  value={filter.value ?? ""}
                  fieldType={fieldType}
                  readOnly={readOnly || !onFiltersChange}
                  onChange={
                    readOnly || !onFiltersChange
                      ? undefined
                      : (next) => handleChipChange(index, next)
                  }
                  testIdPrefix={`${rowTestId}-value`}
                />
              ) : (
                <span
                  className="text-foreground"
                  data-testid={`${rowTestId}-value`}
                >
                  {formatScalarValue(Array.isArray(filter.value) ? filter.value.join(", ") : (filter.value ?? ""), fieldType)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
