// Analytics › Calendar against a live DB: getReportScheduleCalendar returns
// report schedules with their runs and upcoming occurrences, and keeps
// Demo Mode and real scheduled reports apart.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, dbReady } from "../db";
import { automationRunLogs, emailSchedules } from "@shared/schema";
import { runWithDemoContext } from "../lib/demo-mode";
import { storage } from "../storage";

const SHOULD_RUN = Boolean(process.env.DATABASE_URL) && dbReady;
const TAG = `calendar-test-${Date.now()}`;

describe.skipIf(!SHOULD_RUN)("Scheduled reports calendar (integration)", () => {
  const ids: number[] = [];
  const now = new Date("2026-11-10T12:00:00Z");
  const start = new Date("2026-11-01T00:00:00Z");
  const end = new Date("2026-12-01T00:00:00Z");

  beforeAll(async () => {
    const rows = await db
      .insert(emailSchedules)
      .values([
        { actionType: "report_generation", cron: "0 9 * * 1", timezone: "UTC", active: true, metadata: { reportName: `${TAG} real` }, actionConfig: { selectedRecipients: ["a@x.com"] } },
        { actionType: "report_generation", cron: "0 9 * * 1", timezone: "UTC", active: false, metadata: { reportName: `${TAG} paused` } },
        { actionType: "report_generation", cron: "0 9 * * 1", timezone: "UTC", active: true, isDemo: true, metadata: { reportName: `${TAG} demo` } },
        { actionType: "database_cleanup", cron: "0 9 * * 1", timezone: "UTC", active: true, metadata: { reportName: `${TAG} cleanup` } },
      ])
      .returning({ id: emailSchedules.id });
    ids.push(...rows.map((r) => r.id));
    await db.insert(automationRunLogs).values([
      { scheduleId: ids[0], actionType: "report_generation", status: "success", startedAt: new Date("2026-11-02T09:00:00Z") },
      { scheduleId: ids[1], actionType: "report_generation", status: "failure", message: "boom", startedAt: new Date("2026-11-09T09:00:00Z") },
      { scheduleId: ids[0], actionType: "report_generation", status: "success", startedAt: new Date("2026-10-26T09:00:00Z") },
      { scheduleId: ids[0], actionType: "report_generation", status: "success", startedAt: new Date("2026-11-05T09:00:00Z"), rawOutput: { success: true, details: { delivered: true } } },
    ]);
  });

  afterAll(async () => {
    if (ids.length) await db.delete(emailSchedules).where(inArray(emailSchedules.id, ids));
  });

  const mine = <T extends { scheduleId?: number; id?: number }>(list: T[]) =>
    list.filter((x) => ids.includes((x.scheduleId ?? x.id)!));

  it("returns real report schedules, their runs in range and upcoming runs", async () => {
    const { schedules, events } = await storage.getReportScheduleCalendar(start, end, now);
    expect(mine(schedules).map((s) => s.reportName)).toEqual([`${TAG} real`, `${TAG} paused`]);
    expect(mine(schedules)[0]).toMatchObject({ frequency: "weekly", recipients: ["a@x.com"], active: true });
    const statuses = mine(events).map((e) => `${e.scheduleId === ids[0] ? "real" : "paused"}:${e.status}:${e.at.slice(0, 10)}`);
    expect(statuses).toEqual([
      "real:success:2026-11-02",
      "real:sent:2026-11-05",
      "paused:failure:2026-11-09",
      "real:upcoming:2026-11-16",
      "real:upcoming:2026-11-23",
      "real:upcoming:2026-11-30",
    ]);
    expect(mine(events).find((e) => e.status === "failure")?.message).toBe("boom");
  });

  it("in Demo Mode returns only demo report schedules", async () => {
    const { schedules } = await runWithDemoContext({ active: true, source: "session", excluded: false }, () =>
      storage.getReportScheduleCalendar(start, end, now),
    );
    expect(mine(schedules).map((s) => s.reportName)).toEqual([`${TAG} demo`]);
  });
});
