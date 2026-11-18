/**
 * Scheduled report delivery: what a report_generation schedule (Analytics ›
 * Reports › Schedule Report) does when it runs.
 *
 * 1. The schedule's creator (metadata.createdBy) must still be an active,
 *    approved staff user. The report runs on their behalf; a schedule whose
 *    creator left or became an outside user stops sending. Schedules saved
 *    before the creator was recorded still run.
 * 2. The report is built: a custom report from its saved Report Builder
 *    definition, a built-in one from shared/system-reports.ts, both through
 *    the same runReportQuery as Run Report, narrowed to the schedule's date
 *    window. The MAP Progress report adds task counts per project.
 * 3. It goes to the recipients who are active, approved staff users; anyone
 *    else is skipped and named in the run message. The email shows the
 *    first rows as a table and attaches every row as CSV.
 *
 * Sent through the main email service (configured transport, Email Design,
 * email log, per-user "receive emails" opt-out, never in Demo Mode) and
 * rerouted to the Workflow Automation test addresses while test mode is on.
 * Scheduled reports are not held by quiet hours or the hourly send limit:
 * the person chose the time when they scheduled it.
 *
 * The result's details.delivered tells Analytics › Calendar the run sent
 * the report ("Sent" rather than the legacy "Completed").
 */
import { storage } from "../storage";
import { getPublicAppUrl } from "../lib/app-config";
import { isExternalRole } from "../lib/internal-access";
import { getReportFieldDefinition } from "../lib/report-fields";
import { getSystemReport } from "@shared/system-reports";
import {
  REPORT_SCHEDULE_ACTION_TYPE,
  recipientsFromActionConfig,
  reportRefFromActionConfig,
} from "@shared/report-schedule-calendar";
import {
  REPORT_DELIVERY_MAX_ROWS,
  REPORT_EMAIL_PREVIEW_ROWS,
  buildReportCsv,
  buildReportHtmlTable,
  checkReportRecipients,
  describeReportDateWindow,
  describeSkipped,
  escapeHtml,
  reportCsvFilename,
  resolveReportDateWindow,
  type ReportColumn,
  type ReportDateWindow,
} from "../lib/scheduled-report-format";

export interface ReportDeliveryResult {
  success: boolean;
  message: string;
  details?: {
    delivered: boolean;
    reportName: string;
    rows: number;
    truncated: boolean;
    sentTo: string[];
    failedTo: string[];
    skipped: Array<{ email: string; reason: string }>;
    testMode: boolean;
  };
}

/** Labels for fields that live outside the report field catalog. */
const EXTRA_COLUMN_LABELS: Record<string, string> = {
  primaryEngineer: "Primary Engineer",
  mapTasksDone: "MAP Tasks Done",
  mapTasksTotal: "MAP Tasks Total",
  mapPercentComplete: "MAP % Complete",
};

export function columnsFor(fields: readonly string[]): ReportColumn[] {
  return fields.map((key) => {
    const def = getReportFieldDefinition(key);
    return { key, label: def?.label ?? EXTRA_COLUMN_LABELS[key] ?? key, type: def?.type };
  });
}

interface ReportDefinition {
  name: string;
  selectedFields: string[];
  filters: unknown;
  includeMapProgress: boolean;
}

function fail(message: string): ReportDeliveryResult {
  return { success: false, message };
}

async function loadDefinition(config: Record<string, unknown>): Promise<ReportDefinition | string> {
  const ref = reportRefFromActionConfig(config);
  if (ref?.category !== "custom") {
    const report = getSystemReport(ref?.id ?? null);
    if (!report) return `Unknown built-in report "${ref?.id ?? ""}"`;
    return {
      name: report.name,
      selectedFields: [...report.selectedFields],
      filters: report.filters.map((f) => ({ ...f })),
      includeMapProgress: report.includeMapProgress === true,
    };
  }
  const id = Number(ref.id);
  if (!Number.isInteger(id) || id <= 0) return "The schedule does not name a saved report";
  const report = await storage.getCustomReportDefinition(id);
  if (!report || report.isDemo) return "The saved report was deleted";
  const fields = Array.isArray(report.selectedFields)
    ? (report.selectedFields as unknown[]).filter((f): f is string => typeof f === "string")
    : [];
  if (fields.length === 0) return `The saved report "${report.name}" has no fields`;
  return { name: report.name, selectedFields: fields, filters: report.filters, includeMapProgress: false };
}

/** Adds MAP task counts to each row of the MAP Progress report (rows need `id`). */
export async function addMapProgress(rows: Array<Record<string, unknown>>): Promise<void> {
  const ids = [...new Set(rows.map((r) => r.id).filter((id): id is number => typeof id === "number"))];
  const progress = await storage.getMapTaskProgress(ids);
  for (const row of rows) {
    const p = typeof row.id === "number" ? progress.get(row.id) : undefined;
    row.mapTasksDone = p?.done ?? 0;
    row.mapTasksTotal = p?.total ?? 0;
    row.mapPercentComplete = p && p.total > 0 ? Math.round((p.done / p.total) * 100) : null;
  }
}

export function buildScheduledReportEmail(input: {
  reportName: string;
  window: ReportDateWindow;
  columns: readonly ReportColumn[];
  rows: ReadonlyArray<Record<string, unknown>>;
  truncated: boolean;
  reportsUrl: string;
  generatedAt: Date;
}) {
  const { reportName, window, columns, rows, truncated, reportsUrl, generatedAt } = input;
  const windowLine = describeReportDateWindow(window);
  const total = rows.length.toLocaleString("en-US");
  const preview = rows.slice(0, REPORT_EMAIL_PREVIEW_ROWS);
  const countLine =
    rows.length === 0
      ? "No projects matched this report."
      : rows.length > preview.length
        ? `Showing the first ${preview.length} of ${total} rows. Every row is in the attached CSV.`
        : `${total} ${rows.length === 1 ? "row" : "rows"}. The same data is in the attached CSV.`;
  const truncatedLine = truncated
    ? `The report stopped at ${REPORT_DELIVERY_MAX_ROWS.toLocaleString("en-US")} rows. Narrow its filters or date range in CriteriaIQ to see the rest.`
    : null;

  const subject = `[CriteriaIQ] ${reportName}`;
  const text = [
    reportName,
    windowLine,
    `Generated ${generatedAt.toISOString()}`,
    "",
    countLine,
    ...(truncatedLine ? [truncatedLine] : []),
    "",
    `Open Reports in CriteriaIQ: ${reportsUrl}`,
    "",
    "You get this because someone scheduled this report for you in Analytics > Reports.",
  ].join("\n");
  const html =
    `<h2 style="margin: 24px 0 4px 0;">${escapeHtml(reportName)}</h2>` +
    `<p style="margin: 0 0 4px 0; color: #495057;">${escapeHtml(windowLine)}</p>` +
    `<p style="margin: 0 0 16px 0; font-size: 12px; color: #6c757d;">Generated ${escapeHtml(generatedAt.toISOString())}</p>` +
    (preview.length > 0 ? buildReportHtmlTable(columns, preview) : "") +
    `<p style="margin: 0 0 12px 0;">${escapeHtml(countLine)}</p>` +
    (truncatedLine ? `<p style="margin: 0 0 12px 0; color: #b45309;">${escapeHtml(truncatedLine)}</p>` : "") +
    `<p style="margin: 0 0 12px 0;"><a href="${escapeHtml(reportsUrl)}">Open Reports in CriteriaIQ</a></p>` +
    `<p style="margin: 0; font-size: 12px; color: #6c757d;">You get this because someone scheduled this report for you in Analytics &gt; Reports.</p>`;
  return { subject, text, html };
}

/** Build and email one scheduled report. Never throws. */
export async function deliverScheduledReport(
  scheduleId: number | undefined,
  config: Record<string, unknown>,
  now: Date = new Date(),
): Promise<ReportDeliveryResult> {
  try {
    if (!scheduleId) return fail("Scheduled reports need a schedule to run from");
    const schedule = await storage.getReportScheduleForDelivery(scheduleId);
    if (!schedule || schedule.actionType !== REPORT_SCHEDULE_ACTION_TYPE) return fail("Report schedule not found");
    if (schedule.isDemo) return fail("Demo report schedules do not send email");
    const actionConfig = { ...((schedule.actionConfig ?? {}) as Record<string, unknown>), ...config };

    const createdBy = (schedule.metadata as { createdBy?: unknown } | null)?.createdBy;
    if (typeof createdBy === "string" && createdBy) {
      const creator = await storage.getUser(createdBy);
      if (!creator) return fail("The person who scheduled this report no longer has an account");
      if (creator.isActive === false || creator.isApproved === false) {
        return fail("The person who scheduled this report is no longer active");
      }
      if (isExternalRole(creator.role)) return fail("The person who scheduled this report is not a staff user");
    }

    const emails = recipientsFromActionConfig(actionConfig);
    if (emails.length === 0) return fail("The schedule has no recipients");
    const check = checkReportRecipients(emails, await storage.getUsersByEmails(emails));
    if (check.allowed.length === 0) {
      return fail(`No recipient may receive reports: ${describeSkipped(check.skipped)}`);
    }

    const definition = await loadDefinition(actionConfig);
    if (typeof definition === "string") return fail(definition);

    let window: ReportDateWindow;
    try {
      window = resolveReportDateWindow(actionConfig, now);
    } catch (err) {
      return fail(err instanceof Error ? err.message : "Invalid date range");
    }

    const rows = await storage.runScheduledReport(
      definition.selectedFields,
      definition.filters,
      window,
      REPORT_DELIVERY_MAX_ROWS + 1,
      `scheduled report: schedule ${scheduleId}`,
    );
    const truncated = rows.length > REPORT_DELIVERY_MAX_ROWS;
    if (truncated) rows.length = REPORT_DELIVERY_MAX_ROWS;
    const fields = [...definition.selectedFields];
    if (definition.includeMapProgress) {
      await addMapProgress(rows);
      fields.push("mapTasksDone", "mapTasksTotal", "mapPercentComplete");
    }
    const columns = columnsFor(fields);

    const { subject, text, html } = buildScheduledReportEmail({
      reportName: definition.name,
      window,
      columns,
      rows,
      truncated,
      reportsUrl: `${getPublicAppUrl()}/reports`,
      generatedAt: now,
    });
    const attachment = {
      filename: reportCsvFilename(definition.name, now),
      content: Buffer.from(`﻿${buildReportCsv(columns, rows)}`, "utf8"),
      contentType: "text/csv; charset=utf-8",
    };

    const emailConfig = await storage.getEmailAutomationConfig();
    const testAddresses = ((emailConfig?.testEmailAddresses as string[] | null) ?? []).filter(Boolean);
    const testMode = Boolean(emailConfig?.testModeEnabled) && testAddresses.length > 0;
    const targets = testMode ? testAddresses : check.allowed;
    const subjectFor = testMode ? `[TEST MODE - Original: ${check.allowed.join(", ")}] ${subject}` : subject;

    const { sendEmail } = await import("./email");
    const sentTo: string[] = [];
    const failedTo: string[] = [];
    const errors = new Set<string>();
    for (const to of targets) {
      const result = await sendEmail({
        to,
        from: process.env.GMAIL_USER || "noreply@example.com",
        subject: subjectFor,
        text,
        html,
        emailType: "scheduled_report",
        attachments: [attachment],
      });
      if (result.success) sentTo.push(to);
      else {
        failedTo.push(to);
        if (result.error) errors.add(result.error);
      }
    }

    const details = {
      delivered: sentTo.length > 0,
      reportName: definition.name,
      rows: rows.length,
      truncated,
      sentTo,
      failedTo,
      skipped: check.skipped,
      testMode,
    };
    if (sentTo.length === 0) {
      return { success: false, message: `Report not sent: ${[...errors].join("; ") || "every send failed"}`, details };
    }
    const parts = [
      `Sent "${definition.name}" (${rows.length}${truncated ? "+" : ""} rows) to ${sentTo.length} ${sentTo.length === 1 ? "recipient" : "recipients"}${testMode ? " (test mode)" : ""}`,
    ];
    if (failedTo.length) parts.push(`failed for ${failedTo.join(", ")}`);
    if (check.skipped.length) parts.push(`skipped ${describeSkipped(check.skipped)}`);
    return { success: true, message: parts.join("; "), details };
  } catch (err) {
    console.error(`[ScheduledReport] Schedule ${scheduleId ?? "?"} failed:`, err);
    return fail(err instanceof Error ? err.message : "Report delivery failed");
  }
}

/**
 * For saving a report schedule: the recipients who could never receive it
 * (no account, inactive, or an outside user), as one message, or null when
 * every recipient is fine. Delivery checks again at send time.
 */
export async function reportRecipientProblem(actionConfig: unknown): Promise<string | null> {
  const emails = recipientsFromActionConfig(actionConfig);
  if (emails.length === 0) return null;
  const check = checkReportRecipients(emails, await storage.getUsersByEmails(emails));
  if (check.skipped.length === 0) return null;
  return `Scheduled reports go only to active staff users. Remove: ${describeSkipped(check.skipped)}`;
}
