// Analytics › Calendar: the scheduled-report calendar contract.
//
// Scheduled reports are email_schedules rows with action_type
// 'report_generation', created from Analytics › Reports › Schedule Report.
// GET /api/report-schedules returns them with one event per day they ran
// (from automation_run_logs) or are due to run (expanded from their cron).
import { z } from "zod";

export const REPORT_SCHEDULE_ACTION_TYPE = "report_generation";

/** Longest window one calendar request may cover (a 6-week month grid plus slack). */
export const REPORT_CALENDAR_MAX_RANGE_DAYS = 62;

/** Upcoming occurrences listed per schedule per request; hourly schedules stop here. */
export const REPORT_CALENDAR_MAX_UPCOMING_PER_SCHEDULE = 400;

export const REPORT_SCHEDULE_FREQUENCIES = ["hourly", "daily", "weekly", "monthly", "custom"] as const;
export type ReportScheduleFrequency = (typeof REPORT_SCHEDULE_FREQUENCIES)[number];

/**
 * Run outcomes, plus an occurrence still to come. 'sent' is a successful run
 * that emailed the report; 'success' is a successful run from before report
 * delivery existed (it only recorded the run).
 */
export const REPORT_CALENDAR_EVENT_STATUSES = ["upcoming", "sent", "success", "failure"] as const;
export type ReportCalendarEventStatus = (typeof REPORT_CALENDAR_EVENT_STATUSES)[number];

export interface ReportCalendarSchedule {
  id: number;
  reportName: string;
  /** 'system' or 'custom', as chosen in Schedule Report. */
  reportCategory: string;
  /**
   * Which report the schedule sends, as `system:<id>` or `custom:<id>`
   * (see reportKey). Null when the schedule names no report.
   */
  reportKey: string | null;
  frequency: ReportScheduleFrequency;
  cron: string | null;
  timezone: string;
  active: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  recipients: string[];
  createdBy: string | null;
  creatorName: string | null;
}

export interface ReportCalendarEvent {
  /** `run-<log id>` for a past run, `next-<schedule id>-<epoch ms>` for an upcoming one. */
  key: string;
  scheduleId: number;
  at: string;
  status: ReportCalendarEventStatus;
  /** Run message (the failure reason for a failed run); null for upcoming. */
  message: string | null;
  /** 'scheduler' or 'manual'; null for upcoming. */
  triggeredBy: string | null;
}

export interface ReportCalendarResponse {
  schedules: ReportCalendarSchedule[];
  events: ReportCalendarEvent[];
}

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

/** Query of GET /api/report-schedules: an inclusive day range, both ends required. */
export const reportCalendarQuerySchema = z
  .object({ from: isoDay, to: isoDay })
  .transform(({ from, to }, ctx) => {
    const start = new Date(`${from}T00:00:00.000Z`);
    const endInclusive = new Date(`${to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endInclusive.getTime())) {
      ctx.addIssue({ code: "custom", message: "Invalid date" });
      return z.NEVER;
    }
    const days = (endInclusive.getTime() - start.getTime()) / 86_400_000;
    if (days < 0) {
      ctx.addIssue({ code: "custom", message: "'from' must not be after 'to'" });
      return z.NEVER;
    }
    if (days > REPORT_CALENDAR_MAX_RANGE_DAYS) {
      ctx.addIssue({ code: "custom", message: `Range may span at most ${REPORT_CALENDAR_MAX_RANGE_DAYS} days` });
      return z.NEVER;
    }
    // A day of slack on each side so every timezone's local days are covered;
    // the client buckets events into its own local days.
    return {
      start: new Date(start.getTime() - 86_400_000),
      end: new Date(endInclusive.getTime() + 2 * 86_400_000),
    };
  });

/**
 * The frequency Schedule Report's preset picker would show for a cron
 * expression (see ScheduleReportDialog getCronFromFrequency). Anything the
 * presets don't produce is 'custom'.
 */
export function frequencyFromCron(cron: string | null | undefined): ReportScheduleFrequency {
  const parts = (cron ?? "").trim().split(/\s+/);
  if (parts.length !== 5) return "custom";
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const fixed = (v: string) => /^\d+$/.test(v);
  if (!fixed(minute) || month !== "*") return "custom";
  if (hour === "*" && dayOfMonth === "*" && dayOfWeek === "*") return "hourly";
  if (!fixed(hour)) return "custom";
  if (dayOfMonth === "*" && dayOfWeek === "*") return "daily";
  if (dayOfMonth === "*" && fixed(dayOfWeek)) return "weekly";
  if (fixed(dayOfMonth) && dayOfWeek === "*") return "monthly";
  return "custom";
}

/** Report types the older generic schedule editor saved, mapped to built-in ids. */
export const LEGACY_REPORT_TYPES: Readonly<Record<string, string>> = {
  project_summary: "project-status",
  map_progress: "map-progress",
  customer_activity: "customer-activity",
  team_performance: "team-performance",
};

export interface ScheduledReportRef {
  category: "system" | "custom";
  /** A built-in report id (shared/system-reports.ts) or a custom report's numeric id as text. */
  id: string;
}

/**
 * The report a report_generation schedule sends, read from its action
 * config the way delivery reads it: Schedule Report saves reportCategory +
 * reportId; the older editor saved reportType (a legacy name or "custom"
 * with customReportId). Null when the config names no report.
 */
export function reportRefFromActionConfig(config: unknown): ScheduledReportRef | null {
  if (!config || typeof config !== "object") return null;
  const c = config as Record<string, unknown>;
  const legacyCustom = c.reportType === "custom" && c.customReportId != null;
  const category = c.reportCategory === "custom" || legacyCustom ? "custom" : "system";
  const rawId = legacyCustom && c.reportId == null ? c.customReportId : (c.reportId ?? c.reportType);
  if (typeof rawId !== "string" && typeof rawId !== "number") return null;
  const id = String(rawId).trim();
  if (!id) return null;
  return { category, id: category === "system" ? (LEGACY_REPORT_TYPES[id] ?? id) : id };
}

/** One string per report, used to match schedules to the Reports library. */
export function reportKey(category: "system" | "custom", id: string | number): string {
  return `${category}:${id}`;
}

/** Recipient emails saved by Schedule Report (array form, or the legacy comma string). */
export function recipientsFromActionConfig(config: unknown): string[] {
  if (!config || typeof config !== "object") return [];
  const { selectedRecipients, recipients } = config as { selectedRecipients?: unknown; recipients?: unknown };
  const list = Array.isArray(selectedRecipients)
    ? selectedRecipients
    : typeof recipients === "string"
      ? recipients.split(",")
      : [];
  return [...new Set(list.filter((r): r is string => typeof r === "string").map((r) => r.trim()).filter(Boolean))];
}
