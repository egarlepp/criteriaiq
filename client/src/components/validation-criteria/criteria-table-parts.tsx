import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Activity, CircleCheckBig, Component, HandHeart, LayoutList } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState, type SortConfig } from "@/lib/sorting";
import { criteriaStatusConfig, CRITERIA_STATUS_KEYS, type CriteriaStatusKey } from "./success-criteria-utils";

/**
 * Shared pieces of the success-criteria table (solution bar → lavender
 * column header → light component bands → rows). Used by the project form
 * (`SuccessCriteriaForm`) and View Project → Success Criteria so both read
 * the same way.
 */

/** Row shape the table reads; both callers pass API success_criteria rows. */
export interface CriteriaTableRow {
  id?: number;
  lineNumber?: number | null;
  status?: string | null;
  criterion?: string | null;
  expectedOutcome?: string | null;
  actionItem?: string | null;
  valueMappingName?: string | null;
  componentName?: string | null;
}

// Lavender band under the dark solution bar. The `[&_button]` / `[&_span]`
// overrides beat SortableTableHead's muted-foreground text colour.
const HEAD_CLASS =
  "h-11 px-3 bg-purple-50 dark:bg-purple-950/40 border-b-0 text-[11.5px] font-bold uppercase tracking-wider text-purple-950 dark:text-purple-100 [&_button]:uppercase [&_button]:tracking-wider [&_button]:text-left [&_button]:text-purple-950 [&_button:hover]:text-purple-700 dark:[&_button]:text-purple-100 dark:[&_button:hover]:text-purple-300 [&_span]:text-purple-950 dark:[&_span]:text-purple-100";
const HEAD_ICON_CLASS = "h-4 w-4 shrink-0 text-purple-600 dark:text-purple-300";

/** Data rows: divider + hover tint instead of zebra stripes. */
export const CRITERIA_ROW_CLASS =
  "border-b border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-purple-50/50 dark:hover:bg-slate-800/60 transition-colors";

function byLineNumber<T extends CriteriaTableRow>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => (a.lineNumber ?? Number.MAX_SAFE_INTEGER) - (b.lineNumber ?? Number.MAX_SAFE_INTEGER),
  );
}

/**
 * URL-backed sort for the criteria table. Sorting applies inside each
 * component group so the group bands stay put; with no sort chosen rows run
 * in line-number order.
 */
export function useCriteriaRowSort(paramPrefix: string): {
  sortConfig: SortConfig | null;
  handleSort: (key: string) => void;
  sortCriteriaRows: <T extends CriteriaTableRow>(rows: readonly T[]) => T[];
} {
  const [sortConfig, handleSort] = useUrlSortState(paramPrefix);
  const sortCriteriaRows = useCallback(
    <T extends CriteriaTableRow>(rows: readonly T[]): T[] =>
      sortRows(byLineNumber(rows), sortConfig, {
        lineNumber: (c) => (typeof c.lineNumber === "number" ? c.lineNumber : null),
        valueMapping: (c) => c.valueMappingName || null,
        criterion: (c) => c.criterion || null,
        expectedOutcome: (c) => c.expectedOutcome || null,
        actionItem: (c) => c.actionItem || null,
        status: (c) => CRITERIA_STATUS_KEYS.indexOf(normalizeCriteriaStatus(c.status)),
      }),
    [sortConfig],
  );
  return { sortConfig, handleSort, sortCriteriaRows };
}

/** The column header row. `showActions` adds the trailing Actions column. */
export function CriteriaTableHeadRow({
  sortConfig,
  onSort,
  showActions,
}: {
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  showActions: boolean;
}) {
  const { t } = useTranslation();
  return (
    <tr className="border-b-2 border-purple-300 dark:border-purple-800">
      <SortableTableHead sortKey="lineNumber" sortConfig={sortConfig} onSort={onSort} tooltipText={t("successCriteria.table.sortByNumber")} className={`${HEAD_CLASS} w-12 text-center`} align="center">
        {t("successCriteria.table.columns.number")}
      </SortableTableHead>
      <SortableTableHead sortKey="valueMapping" sortConfig={sortConfig} onSort={onSort} className={`${HEAD_CLASS} whitespace-nowrap`}>
        <span className="flex items-center gap-1.5"><HandHeart className={HEAD_ICON_CLASS} />{t("successCriteria.table.columns.valueMapping")}</span>
      </SortableTableHead>
      <SortableTableHead sortKey="criterion" sortConfig={sortConfig} onSort={onSort} className={`${HEAD_CLASS} whitespace-nowrap`}>
        <span className="flex items-center gap-1.5"><LayoutList className={HEAD_ICON_CLASS} />{t("successCriteria.table.columns.solutionCriteria")}</span>
      </SortableTableHead>
      <SortableTableHead sortKey="expectedOutcome" sortConfig={sortConfig} onSort={onSort} className={`${HEAD_CLASS} min-w-[240px]`}>
        <span className="flex items-center gap-1.5"><CircleCheckBig className={HEAD_ICON_CLASS} />{t("successCriteria.table.columns.expectedOutcomes")}</span>
      </SortableTableHead>
      <SortableTableHead sortKey="actionItem" sortConfig={sortConfig} onSort={onSort} className={`${HEAD_CLASS} whitespace-nowrap`}>
        <span className="flex items-center gap-1.5"><Activity className={HEAD_ICON_CLASS} />{t("successCriteria.table.columns.actionsTaken")}</span>
      </SortableTableHead>
      <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={onSort} className={`${HEAD_CLASS} w-[180px] whitespace-nowrap`}>
        {t("successCriteria.table.columns.status")}
      </SortableTableHead>
      {showActions && (
        <SortableTableHead sortable={false} className={`${HEAD_CLASS} w-[88px]`}>
          {t("successCriteria.table.columns.actions")}
        </SortableTableHead>
      )}
    </tr>
  );
}

/** Light component band with a purple left edge and a criteria count. */
export function CriteriaComponentRow({ name, count, colSpan }: { name: string; count: number; colSpan: number }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-purple-200 dark:border-purple-900/60 bg-purple-50/70 dark:bg-purple-950/30">
      <td colSpan={colSpan} className="px-4 py-2 border-l-4 border-l-purple-600 dark:border-l-purple-400">
        <div className="flex items-center gap-2">
          <Component size={14} className="text-purple-600 dark:text-purple-400 shrink-0" />
          <span className="text-sm font-semibold text-purple-950 dark:text-purple-100">{name}</span>
          <span className="inline-flex items-center rounded-full bg-purple-100 dark:bg-purple-900/60 px-2 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-200">
            {t("successCriteria.table.criteriaCount", { count })}
          </span>
        </div>
      </td>
    </tr>
  );
}

// Older rows can still carry pre-normalization values; show them as the
// status the project form maps them to on save.
const LEGACY_STATUS: Record<string, CriteriaStatusKey> = {
  pending: "not_started",
  "n/a": "cancelled",
  "in progress": "in_progress",
  completed: "complete",
};

/** Canonical status key for display and sorting. */
export function normalizeCriteriaStatus(status: string | null | undefined): CriteriaStatusKey {
  const raw = status || "not_started";
  return LEGACY_STATUS[raw] ?? (raw as CriteriaStatusKey);
}

function statusConfigFor(status: string | null | undefined) {
  const key = normalizeCriteriaStatus(status);
  return { key, config: criteriaStatusConfig[key] as (typeof criteriaStatusConfig)[CriteriaStatusKey] | undefined };
}

/** Read-only status pill (for viewers without edit access). */
export function CriteriaStatusPill({ status }: { status: string | null | undefined }) {
  const { t } = useTranslation();
  const { key, config } = statusConfigFor(status);
  const Icon = config?.icon;
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ${config?.pillClass ?? criteriaStatusConfig.not_started.pillClass}`}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
      {config ? t(`successCriteria.table.status.${key}.label`) : (status ?? "")}
    </span>
  );
}

/** Status picker styled as a colored pill, with a description per option. */
export function CriteriaStatusSelect({
  value,
  onValueChange,
}: {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { key, config } = statusConfigFor(value);
  const CurrentIcon = config?.icon;
  return (
    <Select value={key} onValueChange={onValueChange}>
      <SelectTrigger
        aria-label={t("successCriteria.table.columns.status")}
        className={`h-7 w-auto min-w-[118px] gap-1.5 !rounded-full !border-transparent px-2.5 text-xs font-semibold whitespace-nowrap shadow-none focus:ring-2 focus:ring-purple-500 ${config?.pillClass ?? criteriaStatusConfig.not_started.pillClass}`}
      >
        <SelectValue>
          <span className="flex items-center gap-1.5">
            {CurrentIcon && <CurrentIcon className="h-3.5 w-3.5 shrink-0" />}
            <span className="whitespace-nowrap">{config ? t(`successCriteria.table.status.${key}.label`) : key}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-[340px]">
        {CRITERIA_STATUS_KEYS.map((statusKey) => {
          const option = criteriaStatusConfig[statusKey];
          const Icon = option.icon;
          return (
            <SelectItem key={statusKey} value={statusKey}>
              <div className="flex items-start gap-1.5 py-0.5">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${option.textColor}`} />
                <div>
                  <div>{t(`successCriteria.table.status.${statusKey}.label`)}</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">{t(`successCriteria.table.status.${statusKey}.description`)}</div>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
