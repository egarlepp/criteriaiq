// Demo Mode scheduled reports for Analytics › Calendar.
//
// A few report_generation schedules owned by Demo Staff, sent to Demo
// Staff (never a real address), with past runs so the Calendar shows
// completed and failed days as well as upcoming ones. Every row is
// is_demo: the scheduler never runs them and real lists never show them;
// the wipe deletes them (run logs cascade).
import { Cron } from "croner";
import { inArray } from "drizzle-orm";
import { db } from "../db";
import { automationRunLogs, emailSchedules, users } from "@shared/schema";
import { REPORT_SCHEDULE_ACTION_TYPE } from "@shared/report-schedule-calendar";
import type { DemoStaff } from "./demo-story";

const DAY_MS = 86_400_000;
/** How far back demo run history goes. */
const HISTORY_DAYS = 42;
const TIMEZONE = "America/New_York";

export interface DemoReportSchedulePlan {
  reportName: string;
  reportCategory: "system" | "custom";
  /** System report id from Schedule Report; custom schedules use the report's row id. */
  reportId: string;
  cron: string;
  active: boolean;
  owner: keyof Omit<DemoStaff, "engineers" | "all">;
  recipients: ReadonlyArray<keyof Omit<DemoStaff, "engineers" | "proserv" | "all"> | "engineers">;
  /** Runs (counted back from the newest) recorded as failed. */
  failedRuns: readonly number[];
}

export const DEMO_REPORT_SCHEDULE_PLAN: readonly DemoReportSchedulePlan[] = [
  {
    reportName: "Project Status Report",
    reportCategory: "system",
    reportId: "project-status",
    cron: "0 9 * * 1",
    active: true,
    owner: "lead",
    recipients: ["lead", "engineers"],
    failedRuns: [2],
  },
  {
    reportName: "MAP Progress Report",
    reportCategory: "system",
    reportId: "map-progress",
    cron: "0 9 * * *",
    active: true,
    owner: "specialist",
    recipients: ["specialist", "lead"],
    failedRuns: [4, 11],
  },
  {
    reportName: "[demo] Pipeline by forecast category",
    reportCategory: "custom",
    reportId: "",
    cron: "0 9 1 * *",
    active: true,
    owner: "sales",
    recipients: ["sales", "lead"],
    failedRuns: [],
  },
  {
    reportName: "Risk Analysis Report",
    reportCategory: "system",
    reportId: "risk-analysis",
    cron: "0 9 * * 5",
    active: false,
    owner: "lead",
    recipients: ["lead"],
    failedRuns: [0],
  },
];

/** Past run times of a cron within the last `days` days, oldest first. */
export function pastRunTimes(cron: string, timezone: string, now: Date, days = HISTORY_DAYS): Date[] {
  const job = new Cron(cron, { timezone, paused: true });
  try {
    const since = now.getTime() - days * DAY_MS;
    const out: Date[] = [];
    let cursor = job.nextRun(new Date(since));
    while (cursor && cursor < now) {
      out.push(cursor);
      cursor = job.nextRun(cursor);
    }
    return out;
  } finally {
    job.stop();
  }
}

/**
 * Seeds the demo report schedules and their run history. `customReports`
 * are the demo custom reports just created, matched by name.
 * Returns the number of schedules created.
 */
export async function seedDemoReportSchedules(
  staff: DemoStaff,
  customReports: ReadonlyArray<{ id: number; name: string }>,
  now: Date = new Date(),
): Promise<number> {
  const staffRows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, staff.all));
  const emailOf = new Map(staffRows.map((u) => [u.id, u.email]));
  const emailsFor = (slots: DemoReportSchedulePlan["recipients"]) => [
    ...new Set(
      slots
        .flatMap((slot) => (slot === "engineers" ? staff.engineers : [staff[slot]]))
        .map((id) => emailOf.get(id))
        .filter((e): e is string => typeof e === "string" && e.length > 0),
    ),
  ];

  let created = 0;
  for (const plan of DEMO_REPORT_SCHEDULE_PLAN) {
    const reportId =
      plan.reportCategory === "custom"
        ? String(customReports.find((r) => r.name === plan.reportName)?.id ?? "")
        : plan.reportId;
    if (plan.reportCategory === "custom" && !reportId) continue;

    const recipients = emailsFor(plan.recipients);
    const runs = pastRunTimes(plan.cron, TIMEZONE, now);
    const job = new Cron(plan.cron, { timezone: TIMEZONE, paused: true });
    const nextRunAt = plan.active ? job.nextRun(now) : null;
    job.stop();

    const [schedule] = await db
      .insert(emailSchedules)
      .values({
        actionType: REPORT_SCHEDULE_ACTION_TYPE,
        actionConfig: {
          reportCategory: plan.reportCategory,
          reportId,
          reportName: plan.reportName,
          reportType: reportId,
          dateRangeMode: "calendar",
          dateRange: "last_30_days",
          selectedRecipients: recipients,
          recipients: recipients.join(", "),
        },
        cron: plan.cron,
        timezone: TIMEZONE,
        active: plan.active,
        metadata: {
          reportName: plan.reportName,
          reportCategory: plan.reportCategory,
          createdFrom: "reports_section",
          createdBy: staff[plan.owner],
        },
        isDemo: true,
        nextRunAt,
        lastRunAt: runs.at(-1) ?? null,
        createdAt: new Date(now.getTime() - (HISTORY_DAYS + 3) * DAY_MS),
      })
      .returning({ id: emailSchedules.id });
    created++;

    if (runs.length === 0) continue;
    await db.insert(automationRunLogs).values(
      runs.map((startedAt, i) => {
        const failed = plan.failedRuns.includes(runs.length - 1 - i);
        const durationMs = 900 + ((i * 377) % 2400);
        return {
          scheduleId: schedule.id,
          actionType: REPORT_SCHEDULE_ACTION_TYPE,
          status: failed ? "failure" : "success",
          triggeredBy: "scheduler",
          startedAt,
          completedAt: new Date(startedAt.getTime() + durationMs),
          durationMs,
          message: failed
            ? "Report not sent: Email service not configured"
            : `Sent "${plan.reportName}" to ${recipients.length} ${recipients.length === 1 ? "recipient" : "recipients"}`,
          // details.delivered marks the run "Sent" on Analytics › Calendar.
          rawOutput: { success: !failed, demo: true, details: { delivered: !failed } },
        };
      }),
    );
  }
  return created;
}
