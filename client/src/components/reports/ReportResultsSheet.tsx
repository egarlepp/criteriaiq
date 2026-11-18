// Reports › Run: a report's rows in a side drawer, sortable, with Download
// CSV. Built-in reports come from GET /api/built-in-reports/:id/results
// (up to 1,000 rows); saved custom reports from their execute route
// (up to 100 rows).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertCircle, Download, FileChartPie, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  SortableTable,
  SortableTableBody,
  SortableTableCell,
  SortableTableHead,
  SortableTableHeader,
  SortableTableRow,
} from "@/components/ui/sortable-table";
import { sortRows, useSortState } from "@/lib/sorting";
import type { BuiltInReportRunResult } from "@shared/system-reports";
import { labelFromFieldKey, toCsv, type LibraryReport } from "./reports-library-utils";

interface ResultTable {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
  executedAt: string | null;
}

interface SavedReportExecution {
  data?: Array<Record<string, unknown>>;
  metadata?: { executedAt?: string };
}

async function fetchResults(report: LibraryReport): Promise<ResultTable> {
  if (report.kind === "builtIn") {
    const res = await fetch(`/api/built-in-reports/${encodeURIComponent(report.id)}/results`, { credentials: "include" });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as BuiltInReportRunResult;
    return { columns: body.columns, rows: body.rows, truncated: body.truncated, executedAt: body.executedAt };
  }
  const res = await fetch(`/api/custom-reports/${encodeURIComponent(report.id)}/execute`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as SavedReportExecution;
  const rows = Array.isArray(body.data) ? body.data : [];
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    columns: keys.map((key) => ({ key, label: labelFromFieldKey(key) })),
    rows,
    truncated: false,
    executedAt: body.metadata?.executedAt ? String(body.metadata.executedAt) : null,
  };
}

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function sortValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

export function ReportResultsSheet({ report, onClose }: { report: LibraryReport | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { sortConfig, handleSort } = useSortState();
  const open = report !== null;

  const { data, isLoading, error } = useQuery<ResultTable>({
    queryKey: ["report-results", report?.kind, report?.id],
    queryFn: () => fetchResults(report!),
    enabled: open && report?.kind !== "security",
    staleTime: 60_000,
    retry: false,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const accessors = Object.fromEntries(
      data.columns.map((c) => [c.key, (r: Record<string, unknown>) => sortValue(r[c.key])]),
    );
    return sortRows(data.rows, sortConfig, accessors);
  }, [data, sortConfig]);

  const downloadCsv = () => {
    if (!data || !report) return;
    const blob = new Blob([`﻿${toCsv(data.columns, rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${report.name.replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "report"}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const when = data?.executedAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.executedAt))
    : null;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-[min(1100px,92vw)]" data-testid="report-results-sheet">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-8">
            <FileChartPie className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span className="truncate">{report?.name}</span>
          </SheetTitle>
          <SheetDescription>{report?.description}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {data
              ? [t("analytics.reports.results.rowCount", { count: data.rows.length }), when && t("analytics.reports.results.ranAt", { time: when })]
                  .filter(Boolean)
                  .join(" · ")
              : " "}
          </p>
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!data || data.rows.length === 0} data-testid="report-results-download">
            <Download className="mr-2 h-4 w-4" />
            {t("analytics.reports.actions.downloadCsv")}
          </Button>
        </div>

        {data?.truncated && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            {t("analytics.reports.results.truncated", { count: data.rows.length })}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-auto rounded-lg border dark:border-gray-700">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              {t("analytics.reports.results.loading")}
            </div>
          ) : error ? (
            <div className="m-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {t("analytics.reports.results.loadFailed")}
            </div>
          ) : !data || data.rows.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">{t("analytics.reports.results.empty")}</p>
          ) : (
            <SortableTable>
              <SortableTableHeader className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                <SortableTableRow>
                  {data.columns.map((c) => (
                    <SortableTableHead key={c.key} sortKey={c.key} sortConfig={sortConfig} onSort={handleSort} className="whitespace-nowrap">
                      {c.label}
                    </SortableTableHead>
                  ))}
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {rows.map((row, i) => (
                  <SortableTableRow key={i}>
                    {data.columns.map((c) => (
                      <SortableTableCell key={c.key} className="whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {cellText(row[c.key])}
                      </SortableTableCell>
                    ))}
                  </SortableTableRow>
                ))}
              </SortableTableBody>
            </SortableTable>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
