// Reports › Run for a built-in report (shared/system-reports.ts): the same
// definition a scheduled send uses, run in the app over every project the
// viewer's mode can see (no date window), capped at
// BUILT_IN_REPORT_RUN_MAX_ROWS rows. Staff only; the route checks that.
import { storage } from "../storage";
import { addMapProgress, columnsFor } from "../email/scheduled-report-email";
import {
  BUILT_IN_REPORT_RUN_MAX_ROWS,
  getSystemReport,
  type BuiltInReportRunResult,
} from "@shared/system-reports";

export class UnknownBuiltInReportError extends Error {
  constructor(reportId: string) {
    super(`Unknown built-in report "${reportId}"`);
    this.name = "UnknownBuiltInReportError";
  }
}

export async function runBuiltInReport(reportId: string, now: Date = new Date()): Promise<BuiltInReportRunResult> {
  const report = getSystemReport(reportId);
  if (!report) throw new UnknownBuiltInReportError(reportId);

  const rows = await storage.runReportQuery([...report.selectedFields], report.filters.map((f) => ({ ...f })), {
    limit: BUILT_IN_REPORT_RUN_MAX_ROWS + 1,
    context: `built-in report run: ${report.id}`,
  });
  const truncated = rows.length > BUILT_IN_REPORT_RUN_MAX_ROWS;
  if (truncated) rows.length = BUILT_IN_REPORT_RUN_MAX_ROWS;

  const fields = [...report.selectedFields];
  if (report.includeMapProgress) {
    await addMapProgress(rows);
    fields.push("mapTasksDone", "mapTasksTotal", "mapPercentComplete");
  }

  return {
    reportId: report.id,
    reportName: report.name,
    columns: columnsFor(fields),
    rows,
    truncated,
    executedAt: now.toISOString(),
  };
}
