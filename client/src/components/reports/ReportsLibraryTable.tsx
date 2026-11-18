// The Reports page's library: every report in one sortable table with its
// kind, next scheduled send and last run, plus Run / Schedule / Star / Delete.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronDown, LibraryBig, Play, Star, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SortableTable,
  SortableTableBody,
  SortableTableCell,
  SortableTableHead,
  SortableTableHeader,
  SortableTableRow,
} from "@/components/ui/sortable-table";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { cn } from "@/lib/utils";
import type { ReportCalendarEventStatus } from "@shared/report-schedule-calendar";
import type { LibraryReport, ReportKind } from "./reports-library-utils";

const KIND_CHIP: Record<ReportKind, string> = {
  builtIn: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
  security: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  saved: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
};

const LAST_RUN_CHIP: Record<Exclude<ReportCalendarEventStatus, "upcoming">, string> = {
  sent: "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/50 dark:text-green-200",
  success: "border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-200",
  failure: "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
};

export interface ReportsLibraryTableProps {
  rows: readonly LibraryReport[];
  totalCount: number;
  loading: boolean;
  canSchedule: boolean;
  onRun: (report: LibraryReport) => void;
  onSchedule: (report: LibraryReport) => void;
  onToggleStar: (report: LibraryReport) => void;
  onDelete: (report: LibraryReport) => void;
}

export function ReportsLibraryTable({
  rows,
  totalCount,
  loading,
  canSchedule,
  onRun,
  onSchedule,
  onToggleStar,
  onDelete,
}: ReportsLibraryTableProps) {
  const { t, i18n } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState("reports");
  const sendFormat = new Intl.DateTimeFormat(i18n.language, { weekday: "short", month: "short", day: "numeric", hour: "numeric" });
  const dayFormat = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });

  const sorted = useMemo(
    () =>
      sortRows(rows, sortConfig, {
        name: (r) => r.name,
        kind: (r) => t(`analytics.reports.kind.${r.kind}`),
        nextSendAt: (r) => (r.nextSendAt ? new Date(r.nextSendAt) : null),
        lastRun: (r) => (r.lastRun ? new Date(r.lastRun.at) : null),
      }),
    [rows, sortConfig, t],
  );

  const actionsFor = (r: LibraryReport): TableAction[] => [
    { id: "run", label: t("analytics.reports.actions.run"), icon: Play, onClick: () => onRun(r) },
    {
      id: "schedule",
      label: t("analytics.reports.actions.schedule"),
      icon: CalendarClock,
      onClick: () => onSchedule(r),
      hidden: !r.schedulable || !canSchedule,
      emphasized: r.activeSchedules > 0,
    },
    {
      id: "star",
      label: r.starred ? t("analytics.reports.actions.unstar") : t("analytics.reports.actions.star"),
      icon: Star,
      onClick: () => onToggleStar(r),
      emphasized: r.starred,
    },
    {
      id: "delete",
      label: t("analytics.reports.actions.delete"),
      icon: Trash2,
      onClick: () => onDelete(r),
      variant: "destructive",
      hidden: r.kind !== "saved",
    },
  ];

  return (
    <Card className="min-w-0" data-testid="reports-library">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-xl">
          <LibraryBig className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          {t("analytics.reports.table.title")}
          <Badge variant="secondary" className="text-xs">
            {rows.length === totalCount ? totalCount : t("analytics.reports.table.countFiltered", { shown: rows.length, total: totalCount })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {totalCount === 0 ? t("analytics.reports.table.emptyNone") : t("analytics.reports.table.emptyFiltered")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <SortableTable className="min-w-[600px]">
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap px-3">
                    {t("analytics.reports.table.report")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="kind" sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap px-3">
                    {t("analytics.reports.table.kind")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="nextSendAt" sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap px-3">
                    {t("analytics.reports.table.nextSend")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="lastRun" sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap px-3">
                    {t("analytics.reports.table.lastRun")}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right" className="whitespace-nowrap px-3">
                    {t("analytics.reports.table.actions")}
                  </SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {sorted.map((r) => (
                  <SortableTableRow key={r.key} data-testid={`report-row-${r.key}`}>
                    <SortableTableCell className="max-w-[260px] px-3">
                      <button type="button" onClick={() => onRun(r)} className="group flex items-center gap-1.5 text-left">
                        {r.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-yellow-500" aria-label={t("analytics.reports.table.starred")} />}
                        <span className="font-medium text-gray-900 group-hover:text-blue-700 group-hover:underline dark:text-gray-100 dark:group-hover:text-blue-300">
                          {r.name}
                        </span>
                      </button>
                      {r.description && <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{r.description}</p>}
                    </SortableTableCell>
                    <SortableTableCell className="px-3">
                      <Badge variant="outline" className={cn("whitespace-nowrap text-xs font-medium", KIND_CHIP[r.kind])}>
                        {t(`analytics.reports.kind.${r.kind}`)}
                      </Badge>
                    </SortableTableCell>
                    <SortableTableCell className="whitespace-nowrap px-3 text-sm">
                      {r.nextSendAt ? (
                        <span className="tabular-nums text-gray-900 dark:text-gray-100">{sendFormat.format(new Date(r.nextSendAt))}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">
                          {r.schedulable ? t("analytics.reports.table.notScheduled") : "—"}
                        </span>
                      )}
                    </SortableTableCell>
                    <SortableTableCell className="whitespace-nowrap px-3 text-sm">
                      {!r.lastRun ? (
                        <span className="text-gray-400 dark:text-gray-500">{r.schedulable ? t("analytics.reports.table.never") : "—"}</span>
                      ) : r.lastRun.status && r.lastRun.status !== "upcoming" ? (
                        <Badge variant="outline" className={cn("text-xs font-medium", LAST_RUN_CHIP[r.lastRun.status])}>
                          {t("analytics.reports.table.lastRunStatus", {
                            status: t(`analytics.calendar.status.${r.lastRun.status}`),
                            date: dayFormat.format(new Date(r.lastRun.at)),
                          })}
                        </Badge>
                      ) : (
                        <span className="tabular-nums text-gray-700 dark:text-gray-300">{dayFormat.format(new Date(r.lastRun.at))}</span>
                      )}
                    </SortableTableCell>
                    <SortableTableCell className="px-3">
                      <ResponsiveTableActionsMenu actions={actionsFor(r)} maxVisibleActions={2} />
                    </SortableTableCell>
                  </SortableTableRow>
                ))}
              </SortableTableBody>
            </SortableTable>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** The table, folded to one line while the calendar is open full width. */
export function ReportsLibraryCollapsed({ count, onExpand }: { count: number; onExpand: () => void }) {
  const { t } = useTranslation();
  return (
    <Card data-testid="reports-library-collapsed">
      <button
        type="button"
        onClick={onExpand}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <LibraryBig className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <span className="font-semibold text-gray-900 dark:text-gray-100">{t("analytics.reports.table.title")}</span>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
        <span className="hidden text-sm text-gray-500 dark:text-gray-400 sm:inline">{t("analytics.reports.calendar.tableCollapsed")}</span>
        <span className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-300">
          {t("analytics.reports.calendar.showTable")}
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
    </Card>
  );
}
