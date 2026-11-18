import { describe, expect, it } from "vitest";
import { daysInRange, normalizeWorkDays, timeOffDates } from "../work-schedule";
import { addWorkingDays, nextWorkingDay } from "../working-calendar";

describe("work schedule", () => {
  it("normalizes work days and falls back to Monday to Friday", () => {
    expect(normalizeWorkDays([5, 1, 1, 9, 3])).toEqual([1, 3, 5]);
    expect(normalizeWorkDays([])).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeWorkDays(null)).toEqual([1, 2, 3, 4, 5]);
  });

  it("counts days in a range inclusively", () => {
    expect(daysInRange("2026-11-02", "2026-11-02")).toBe(1);
    expect(daysInRange("2026-11-02", "2026-11-06")).toBe(5);
  });

  it("lists time-off dates inside the window only", () => {
    const entries = [
      { startDate: "2026-10-30", endDate: "2026-11-03" },
      { startDate: "2026-11-03", endDate: "2026-11-04" },
      { startDate: "2026-12-01", endDate: "2026-12-02" },
    ];
    expect(timeOffDates(entries, "2026-11-01", "2026-11-30")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });

  it("schedules around time off and a short work week", () => {
    // Mon 2026-11-02 to Wed 11-04 off; works Mon to Thu.
    const cal = { holidays: new Set(timeOffDates([{ startDate: "2026-11-02", endDate: "2026-11-04" }], "2026-11-01", "2026-12-31")), workDays: [1, 2, 3, 4] };
    expect(nextWorkingDay("2026-11-02", cal)).toBe("2026-11-05");
    // Thursday 11-05, then Friday is off, so the next is Monday 11-09.
    expect(addWorkingDays("2026-11-02", 1, cal)).toBe("2026-11-09");
  });
});
