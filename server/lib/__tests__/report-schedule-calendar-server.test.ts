import { describe, expect, it } from "vitest";
import { upcomingRunTimes } from "../../storage/report-schedules";
import { DEMO_REPORT_SCHEDULE_PLAN, pastRunTimes } from "../demo-report-schedules";
import { keepScheduleCreator, newScheduleIsDemo, scheduleVisibleInMode } from "../schedule-permissions";

const NY = "America/New_York";

describe("upcomingRunTimes", () => {
  it("lists weekly runs inside the window, after now", () => {
    const from = new Date("2026-11-01T00:00:00Z");
    const to = new Date("2026-12-01T00:00:00Z");
    const now = new Date("2026-11-10T00:00:00Z");
    const runs = upcomingRunTimes("0 9 * * 1", NY, from, to, now);
    // Mondays after Nov 10, 2026 at 09:00 New York (EST = UTC-5).
    expect(runs.map((d) => d.toISOString())).toEqual([
      "2026-11-16T14:00:00.000Z",
      "2026-11-23T14:00:00.000Z",
      "2026-11-30T14:00:00.000Z",
    ]);
  });

  it("includes a run exactly at the window start", () => {
    const from = new Date("2026-11-16T14:00:00Z");
    const runs = upcomingRunTimes("0 9 * * 1", NY, from, new Date("2026-11-17T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    expect(runs).toHaveLength(1);
  });

  it("returns nothing for a past window, an invalid cron, and caps hourly", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(upcomingRunTimes("0 9 * * 1", NY, new Date("2026-10-01T00:00:00Z"), new Date("2026-11-01T00:00:00Z"), now)).toEqual([]);
    expect(upcomingRunTimes("not a cron", NY, now, new Date("2026-12-01T00:00:00Z"), now)).toEqual([]);
    expect(upcomingRunTimes("0 * * * *", NY, now, new Date("2026-12-10T00:00:00Z"), now, 50)).toHaveLength(50);
  });
});

describe("pastRunTimes", () => {
  it("lists runs of the last weeks, oldest first, all before now", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const runs = pastRunTimes("0 9 * * 1", NY, now, 21);
    expect(runs).toHaveLength(3);
    expect(runs[0] < runs[1]).toBe(true);
    expect(runs.every((d) => d < now)).toBe(true);
  });

  it("every demo plan cron parses and has history", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    for (const plan of DEMO_REPORT_SCHEDULE_PLAN) {
      expect(pastRunTimes(plan.cron, NY, now).length).toBeGreaterThan(0);
    }
  });
});

describe("schedule Demo Mode isolation", () => {
  it("hides real scheduled reports in demo and demo rows outside it", () => {
    const realReport = { actionType: "report_generation", isDemo: false };
    const demoReport = { actionType: "report_generation", isDemo: true };
    const realCleanup = { actionType: "database_cleanup", isDemo: false };
    expect(scheduleVisibleInMode(realReport, false)).toBe(true);
    expect(scheduleVisibleInMode(demoReport, false)).toBe(false);
    expect(scheduleVisibleInMode(realReport, true)).toBe(false);
    expect(scheduleVisibleInMode(demoReport, true)).toBe(true);
    expect(scheduleVisibleInMode(realCleanup, true)).toBe(true);
  });

  it("treats email digests like reports, since their rules carry the demo flag", () => {
    const realDigest = { actionType: "email_digest", isDemo: false };
    const demoDigest = { actionType: "email_digest", isDemo: true };
    expect(scheduleVisibleInMode(realDigest, true)).toBe(false);
    expect(scheduleVisibleInMode(demoDigest, true)).toBe(true);
    expect(scheduleVisibleInMode(demoDigest, false)).toBe(false);
  });

  it("flags only reports and digests created in demo", () => {
    expect(newScheduleIsDemo("report_generation", true)).toBe(true);
    expect(newScheduleIsDemo("report_generation", false)).toBe(false);
    expect(newScheduleIsDemo("email_digest", true)).toBe(true);
    expect(newScheduleIsDemo("email_digest", false)).toBe(false);
    expect(newScheduleIsDemo("database_cleanup", true)).toBe(false);
  });
});

describe("keepScheduleCreator", () => {
  it("keeps the recorded creator over whatever the client sends", () => {
    expect(keepScheduleCreator({ reportName: "A", createdBy: "x" }, { createdBy: "u1" })).toEqual({ reportName: "A", createdBy: "u1" });
    expect(keepScheduleCreator(null, { createdBy: "u1" })).toEqual({ createdBy: "u1" });
    expect(keepScheduleCreator({ reportName: "A" }, null)).toEqual({ reportName: "A" });
    expect(keepScheduleCreator(null, null)).toBeNull();
  });
});
