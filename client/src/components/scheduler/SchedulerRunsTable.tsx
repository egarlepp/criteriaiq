/**
 * Configuration › Scheduler › Recent runs. Only runs that did work or
 * failed are recorded, so a quiet job shows no rows here. The page wraps
 * it in a bordered box with the pager underneath. Sorting happens on the
 * server (the list is paged), so only stored columns are sortable.
 */
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import type { SortConfig } from "@/lib/sorting";
import { CheckCircle2, Hand, Timer, XCircle, Zap } from "lucide-react";
import { jobGroup } from "@shared/job-categories";
import { formatDateTime, formatDuration, type JobRun } from "./scheduler-utils";

interface SchedulerRunsTableProps {
  runs: JobRun[];
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
}

export function SchedulerRunsTable({ runs, sortConfig, onSort }: SchedulerRunsTableProps) {
  const { t, i18n } = useTranslation();

  if (runs.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("scheduler.runs.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 dark:bg-gray-800/50">
            <SortableTableHead sortKey="jobKey" sortConfig={sortConfig} onSort={onSort}>
              {t("scheduler.runs.colJob")}
            </SortableTableHead>
            <SortableTableHead sortable={false}>{t("scheduler.runs.colCategory")}</SortableTableHead>
            <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={onSort}>
              {t("scheduler.runs.colStatus")}
            </SortableTableHead>
            <SortableTableHead sortKey="startedAt" sortConfig={sortConfig} onSort={onSort}>
              {t("scheduler.runs.colStarted")}
            </SortableTableHead>
            <SortableTableHead sortKey="durationMs" sortConfig={sortConfig} onSort={onSort}>
              {t("scheduler.runs.colDuration")}
            </SortableTableHead>
            <SortableTableHead sortKey="source" sortConfig={sortConfig} onSort={onSort}>
              {t("scheduler.runs.colSource")}
            </SortableTableHead>
            <SortableTableHead sortable={false}>{t("scheduler.runs.colResult")}</SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {runs.map((run) => {
            const failed = run.status === "error";
            return (
              <TableRow key={run.id}>
                <TableCell className="font-medium text-gray-900 dark:text-gray-100">
                  {t(`scheduler.jobNames.${run.jobKey}.name`, { defaultValue: run.jobKey })}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {t(`scheduler.groups.${jobGroup(run.jobKey)}`)}
                </TableCell>
                <TableCell>
                  {failed ? (
                    <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                      <XCircle className="mr-1 h-3 w-3" />
                      {t("scheduler.runs.statusError")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      {t("scheduler.runs.statusSuccess")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {formatDateTime(run.startedAt, i18n.language)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                  {formatDuration(run.durationMs, t)}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                    {run.source === "manual" ? (
                      <Hand className="h-3.5 w-3.5" />
                    ) : run.source === "event" ? (
                      <Zap className="h-3.5 w-3.5" />
                    ) : (
                      <Timer className="h-3.5 w-3.5" />
                    )}
                    {t(`scheduler.runs.source.${run.source}`)}
                  </span>
                </TableCell>
                <TableCell className="max-w-md text-sm">
                  {failed ? (
                    <span className="break-words text-rose-700 dark:text-rose-300">{run.message}</span>
                  ) : (
                    <span className="text-gray-700 dark:text-gray-300">
                      {run.itemsProcessed != null ? t("scheduler.runs.items", { count: run.itemsProcessed }) : null}
                      {run.itemsProcessed != null && run.message ? " · " : null}
                      {run.message}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
