// Scheduled reports — mixin for DatabaseStorage.
//
// Backs Analytics › Calendar: report_generation schedules (email_schedules)
// with their run history (automation_run_logs) and upcoming occurrences
// expanded from each schedule's cron. Demo Mode sees only demo schedules,
// everyone else only real ones (email_schedules.is_demo, migration 117).
import { Cron } from "croner";
import { db } from "../db";
import { and, asc, count, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { applyDemoFilter } from "../lib/demo-storage";
import { automationRunLogs, customReports, emailSchedules, mapTasks, projects, users } from "@shared/schema";
import type { ReportDateBounds, ReportDateWindow } from "../lib/scheduled-report-format";
import { MAP_DONE_STATUSES } from "@shared/project-summary";
import {
  REPORT_CALENDAR_MAX_UPCOMING_PER_SCHEDULE,
  REPORT_SCHEDULE_ACTION_TYPE,
  frequencyFromCron,
  recipientsFromActionConfig,
  reportKey,
  reportRefFromActionConfig,
  type ReportCalendarEvent,
  type ReportCalendarResponse,
  type ReportCalendarSchedule,
} from "@shared/report-schedule-calendar";

/**
 * Upcoming run times of a cron expression in [from, to), never before `now`.
 * Invalid expressions yield none (the schedule still lists, with no dates).
 */
export function upcomingRunTimes(
  cron: string,
  timezone: string,
  from: Date,
  to: Date,
  now: Date,
  max = REPORT_CALENDAR_MAX_UPCOMING_PER_SCHEDULE,
): Date[] {
  const startAfter = new Date(Math.max(from.getTime() - 1, now.getTime()));
  if (startAfter >= to) return [];
  let job: Cron;
  try {
    job = new Cron(cron, { timezone, paused: true });
  } catch {
    return [];
  }
  try {
    const out: Date[] = [];
    let cursor: Date | null = job.nextRun(startAfter);
    while (cursor && cursor < to && out.length < max) {
      out.push(cursor);
      cursor = job.nextRun(cursor);
    }
    return out;
  } finally {
    job.stop();
  }
}

function displayName(u: { firstName: string | null; lastName: string | null; email: string | null }): string | null {
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name || u.email || null;
}

/** The project conditions for a scheduled report's date window. */
export function reportDateWindowConditions(window: ReportDateWindow): SQL[] {
  if (window.mode === "calendar") {
    return [
      lte(projects.startDate, window.end),
      or(isNull(projects.endDate), gte(projects.endDate, window.start))!,
    ];
  }
  const bound = (column: typeof projects.startDate | typeof projects.endDate, b: ReportDateBounds): SQL[] => [
    ...(b.from ? [gte(column, b.from)] : []),
    ...(b.to ? [lte(column, b.to)] : []),
  ];
  return [...bound(projects.startDate, window.start), ...bound(projects.endDate, window.end)];
}

/** Lives on CustomReportsStorageMixin; reached through the prototype chain. */
interface RunReportQueryShape {
  runReportQuery(
    selectedFields: string[],
    filters: unknown,
    options: { limit: number; context: string; extraConditions?: SQL[] },
  ): Promise<Array<Record<string, unknown>>>;
}

export interface ReportSchedulesStorageMixin extends RunReportQueryShape {}

export class ReportSchedulesStorageMixin {
  /**
   * Report schedules plus their runs and upcoming occurrences in [start, end).
   * `now` splits history from the future: before it come logged runs, from it
   * on the cron's occurrences (active schedules only).
   */
  async getReportScheduleCalendar(start: Date, end: Date, now: Date = new Date()): Promise<ReportCalendarResponse> {
    const rows = await db
      .select()
      .from(emailSchedules)
      .where(and(eq(emailSchedules.actionType, REPORT_SCHEDULE_ACTION_TYPE), applyDemoFilter(emailSchedules)))
      .orderBy(asc(emailSchedules.id));
    if (rows.length === 0) return { schedules: [], events: [] };

    const creatorIds = [
      ...new Set(
        rows
          .map((r) => (r.metadata as { createdBy?: unknown } | null)?.createdBy)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const creators = creatorIds.length
      ? await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(inArray(users.id, creatorIds))
      : [];
    const creatorName = new Map(creators.map((u) => [u.id, displayName(u)]));

    const schedules: ReportCalendarSchedule[] = rows.map((r) => {
      const meta = (r.metadata ?? {}) as { reportName?: unknown; reportCategory?: unknown; createdBy?: unknown };
      const config = (r.actionConfig ?? {}) as { reportName?: unknown; reportCategory?: unknown };
      const createdBy = typeof meta.createdBy === "string" ? meta.createdBy : null;
      const reportName = [meta.reportName, config.reportName].find((v): v is string => typeof v === "string" && v.trim() !== "");
      const category = [meta.reportCategory, config.reportCategory].find((v): v is string => typeof v === "string");
      const ref = reportRefFromActionConfig(r.actionConfig);
      return {
        id: r.id,
        reportName: reportName?.trim() ?? "",
        reportCategory: category ?? "system",
        reportKey: ref ? reportKey(ref.category, ref.id) : null,
        frequency: frequencyFromCron(r.cron ?? r.rrule),
        cron: r.cron ?? r.rrule ?? null,
        timezone: r.timezone || "America/New_York",
        active: r.active !== false,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        recipients: recipientsFromActionConfig(r.actionConfig),
        createdBy,
        creatorName: createdBy ? (creatorName.get(createdBy) ?? null) : null,
      };
    });

    const runs = await db
      .select({
        id: automationRunLogs.id,
        scheduleId: automationRunLogs.scheduleId,
        status: automationRunLogs.status,
        startedAt: automationRunLogs.startedAt,
        message: automationRunLogs.message,
        triggeredBy: automationRunLogs.triggeredBy,
        delivered: sql<boolean>`coalesce((${automationRunLogs.rawOutput} -> 'details' ->> 'delivered')::boolean, false)`,
      })
      .from(automationRunLogs)
      .where(
        and(
          inArray(automationRunLogs.scheduleId, rows.map((r) => r.id)),
          gte(automationRunLogs.startedAt, start),
          lt(automationRunLogs.startedAt, end),
        ),
      )
      .orderBy(asc(automationRunLogs.startedAt));

    const events: ReportCalendarEvent[] = runs.map((run) => ({
      key: `run-${run.id}`,
      scheduleId: run.scheduleId,
      at: run.startedAt.toISOString(),
      status: run.status !== "success" ? "failure" : run.delivered ? "sent" : "success",
      message: run.message ?? null,
      triggeredBy: run.triggeredBy,
    }));

    for (const s of schedules) {
      if (!s.active || !s.cron) continue;
      for (const at of upcomingRunTimes(s.cron, s.timezone, start, end, now)) {
        events.push({
          key: `next-${s.id}-${at.getTime()}`,
          scheduleId: s.id,
          at: at.toISOString(),
          status: "upcoming",
          message: null,
          triggeredBy: null,
        });
      }
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    return { schedules, events };
  }

  /** Run a report definition limited to a scheduled report's date window. */
  async runScheduledReport(
    selectedFields: string[],
    filters: unknown,
    window: ReportDateWindow,
    limit: number,
    context: string,
  ): Promise<Array<Record<string, unknown>>> {
    return this.runReportQuery(selectedFields, filters, {
      limit,
      context,
      extraConditions: reportDateWindowConditions(window),
    });
  }

  /** One schedule's settings, for delivering it. */
  async getReportScheduleForDelivery(scheduleId: number) {
    const [row] = await db
      .select({
        id: emailSchedules.id,
        actionType: emailSchedules.actionType,
        actionConfig: emailSchedules.actionConfig,
        metadata: emailSchedules.metadata,
        isDemo: emailSchedules.isDemo,
      })
      .from(emailSchedules)
      .where(eq(emailSchedules.id, scheduleId))
      .limit(1);
    return row;
  }

  /** A saved custom report's definition, whoever owns it. */
  async getCustomReportDefinition(reportId: number) {
    const [row] = await db
      .select({
        id: customReports.id,
        name: customReports.name,
        selectedFields: customReports.selectedFields,
        filters: customReports.filters,
        isDemo: customReports.isDemo,
      })
      .from(customReports)
      .where(eq(customReports.id, reportId))
      .limit(1);
    return row;
  }

  /** Users with these emails (matched case-insensitively), for recipient checks. */
  async getUsersByEmails(emails: readonly string[]) {
    const lowered = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    if (lowered.length === 0) return [];
    return db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        isApproved: users.isApproved,
      })
      .from(users)
      .where(inArray(sql`lower(${users.email})`, lowered));
  }

  /** MAP tasks done and total per project (done = complete/completed). */
  async getMapTaskProgress(projectIds: readonly number[]): Promise<Map<number, { done: number; total: number }>> {
    const out = new Map<number, { done: number; total: number }>();
    if (projectIds.length === 0) return out;
    const rows = await db
      .select({ projectId: mapTasks.projectId, status: mapTasks.status, n: count() })
      .from(mapTasks)
      .where(inArray(mapTasks.projectId, [...projectIds]))
      .groupBy(mapTasks.projectId, mapTasks.status);
    for (const row of rows) {
      if (row.projectId == null) continue;
      const entry = out.get(row.projectId) ?? { done: 0, total: 0 };
      const n = Number(row.n);
      entry.total += n;
      if (MAP_DONE_STATUSES.includes(row.status)) entry.done += n;
      out.set(row.projectId, entry);
    }
    return out;
  }
}
