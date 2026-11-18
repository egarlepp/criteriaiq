import { describe, expect, it } from "vitest";
import {
  REPORT_CALENDAR_MAX_RANGE_DAYS,
  frequencyFromCron,
  recipientsFromActionConfig,
  reportCalendarQuerySchema,
  reportKey,
  reportRefFromActionConfig,
} from "../report-schedule-calendar";

describe("frequencyFromCron", () => {
  it("maps Schedule Report's presets", () => {
    expect(frequencyFromCron("0 * * * *")).toBe("hourly");
    expect(frequencyFromCron("0 9 * * *")).toBe("daily");
    expect(frequencyFromCron("0 9 * * 1")).toBe("weekly");
    expect(frequencyFromCron("0 9 1 * *")).toBe("monthly");
  });

  it("calls anything else custom", () => {
    expect(frequencyFromCron("*/15 9-17 * * 1-5")).toBe("custom");
    expect(frequencyFromCron("0 9 1 1 *")).toBe("custom");
    expect(frequencyFromCron("0 9 1 * 1")).toBe("custom");
    expect(frequencyFromCron("RRULE:FREQ=DAILY")).toBe("custom");
    expect(frequencyFromCron(null)).toBe("custom");
    expect(frequencyFromCron("  0  9 * *  1 ")).toBe("weekly");
  });
});

describe("recipientsFromActionConfig", () => {
  it("prefers the array, trimmed and de-duplicated", () => {
    expect(
      recipientsFromActionConfig({ selectedRecipients: [" a@x.com", "a@x.com", "", 3, "b@x.com"], recipients: "z@x.com" }),
    ).toEqual(["a@x.com", "b@x.com"]);
  });

  it("falls back to the comma string", () => {
    expect(recipientsFromActionConfig({ recipients: "a@x.com, b@x.com," })).toEqual(["a@x.com", "b@x.com"]);
  });

  it("handles missing config", () => {
    expect(recipientsFromActionConfig(null)).toEqual([]);
    expect(recipientsFromActionConfig("nope")).toEqual([]);
  });
});

describe("reportCalendarQuerySchema", () => {
  it("widens the inclusive day range by a day each side", () => {
    const parsed = reportCalendarQuerySchema.parse({ from: "2026-10-25", to: "2026-12-05" });
    expect(parsed.start.toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(parsed.end.toISOString()).toBe("2026-12-07T00:00:00.000Z");
  });

  it("rejects bad input", () => {
    expect(reportCalendarQuerySchema.safeParse({ from: "2026-10-25" }).success).toBe(false);
    expect(reportCalendarQuerySchema.safeParse({ from: "25/10/2026", to: "2026-10-30" }).success).toBe(false);
    expect(reportCalendarQuerySchema.safeParse({ from: "2026-10-30", to: "2026-10-01" }).success).toBe(false);
    expect(reportCalendarQuerySchema.safeParse({ from: "2026-02-30", to: "2026-03-01" }).success).toBe(false);
    const tooLong = new Date(Date.UTC(2026, 0, 1) + (REPORT_CALENDAR_MAX_RANGE_DAYS + 1) * 86_400_000);
    expect(
      reportCalendarQuerySchema.safeParse({ from: "2026-01-01", to: tooLong.toISOString().slice(0, 10) }).success,
    ).toBe(false);
  });
});

describe("reportRefFromActionConfig", () => {
  it("reads what Schedule Report saves", () => {
    expect(reportRefFromActionConfig({ reportCategory: "system", reportId: "map-progress" })).toEqual({ category: "system", id: "map-progress" });
    expect(reportRefFromActionConfig({ reportCategory: "custom", reportId: "12" })).toEqual({ category: "custom", id: "12" });
    expect(reportRefFromActionConfig({ reportCategory: "custom", reportId: 12 })).toEqual({ category: "custom", id: "12" });
  });

  it("maps the older editor's report types to built-in ids", () => {
    expect(reportRefFromActionConfig({ reportType: "project_summary" })).toEqual({ category: "system", id: "project-status" });
    expect(reportRefFromActionConfig({ reportType: "custom", customReportId: 7 })).toEqual({ category: "custom", id: "7" });
  });

  it("returns null when no report is named", () => {
    expect(reportRefFromActionConfig(null)).toBeNull();
    expect(reportRefFromActionConfig({})).toBeNull();
    expect(reportRefFromActionConfig({ reportCategory: "system", reportId: "  " })).toBeNull();
  });

  it("keys a report the way the Reports page does", () => {
    expect(reportKey("system", "risk-analysis")).toBe("system:risk-analysis");
    expect(reportKey("custom", 4)).toBe("custom:4");
  });
});
