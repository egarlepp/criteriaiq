import { describe, expect, it } from "vitest";
import {
  addWorkingDays,
  isWorkingDay,
  nextWorkingDay,
  planOffsetDates,
  previousWorkingDay,
  scheduledDate,
  subtractWorkingDays,
  workingDaysBetween,
} from "../working-calendar";

// 2026-12-24 is a Thursday; 12-25 Friday (holiday); 12-26/27 weekend; 12-28 Monday.
const cal = { holidays: new Set(["2026-12-25"]) };

describe("working calendar", () => {
  it("treats weekends and holidays as days off", () => {
    expect(isWorkingDay("2026-12-24", cal)).toBe(true);
    expect(isWorkingDay("2026-12-25", cal)).toBe(false);
    expect(isWorkingDay("2026-12-26", cal)).toBe(false);
  });

  it("moves a day off to the next working day", () => {
    expect(nextWorkingDay("2026-12-25", cal)).toBe("2026-12-28");
    expect(nextWorkingDay("2026-12-24", cal)).toBe("2026-12-24");
  });

  it("counts working days across a weekend and a holiday", () => {
    expect(addWorkingDays("2026-12-24", 0, cal)).toBe("2026-12-24");
    expect(addWorkingDays("2026-12-24", 1, cal)).toBe("2026-12-28");
    expect(addWorkingDays("2026-12-24", 5, cal)).toBe("2027-01-01");
    expect(addWorkingDays("2026-12-26", 0, cal)).toBe("2026-12-28");
    expect(addWorkingDays("2026-12-24", -3, cal)).toBe("2026-12-24");
  });

  it("follows a custom work week", () => {
    const sunToThu = { holidays: new Set<string>(), workDays: [0, 1, 2, 3, 4] };
    expect(nextWorkingDay("2026-12-25", sunToThu)).toBe("2026-12-27");
  });

  it("never plans a due date before the start", () => {
    expect(planOffsetDates("2026-12-21", 5, 2, cal)).toEqual({ start: "2026-12-29", due: "2026-12-29" });
    expect(planOffsetDates("2026-12-21", 0, 7, cal)).toEqual({ start: "2026-12-21", due: "2026-12-31" });
  });

  it("stores a scheduled date at noon UTC", () => {
    expect(scheduledDate("2026-12-28").toISOString()).toBe("2026-12-28T12:00:00.000Z");
    expect(() => scheduledDate("2026-02-30")).toThrow();
  });

  it("counts working days backwards and between dates", () => {
    expect(previousWorkingDay("2026-12-27", cal)).toBe("2026-12-24");
    expect(subtractWorkingDays("2026-12-28", 1, cal)).toBe("2026-12-24");
    expect(subtractWorkingDays("2026-12-29", 2, cal)).toBe("2026-12-24");
    expect(subtractWorkingDays("2026-12-26", 0, cal)).toBe("2026-12-24");
    expect(workingDaysBetween("2026-12-24", "2026-12-28", cal)).toBe(1);
    expect(workingDaysBetween("2026-12-24", "2026-12-24", cal)).toBe(0);
    expect(workingDaysBetween("2026-12-28", "2026-12-24", cal)).toBe(0);
  });
});
