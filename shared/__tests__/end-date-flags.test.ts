import { describe, expect, it } from "vitest";
import { calendarDaysUntil, endDateFlagMatches, pickEndDateFlag } from "../end-date-flags";

// 2026-12-23 Wednesday; 12-25 Friday (holiday); 12-28 Monday; 12-30 Wednesday.
const calendar = { holidays: new Set(["2026-12-25"]) };
const soon = { name: "Due Soon", triggerType: "days_before", triggerValue: 3, priority: 2, workingDays: true };
const week = { name: "Due This Week", triggerType: "days_before", triggerValue: 7, priority: 1 };
const overdue = { name: "Overdue", triggerType: "days_after", triggerValue: 1, priority: 4 };
const today = { name: "Due Today", triggerType: "exact_date", triggerValue: 0, priority: 3 };

describe("end-date flags", () => {
  it("counts calendar days", () => {
    expect(calendarDaysUntil("2026-12-23", "2026-12-30")).toBe(7);
    expect(calendarDaysUntil("2026-12-23", "2026-12-22")).toBe(-1);
  });

  it("counts working days for working-day flags", () => {
    // 12-30 is 7 calendar days but only 4 working days away (24, 28, 29, 30).
    expect(endDateFlagMatches(soon, { todayIso: "2026-12-23", dueIso: "2026-12-29", calendar })).toBe(true);
    expect(endDateFlagMatches(soon, { todayIso: "2026-12-23", dueIso: "2026-12-30", calendar })).toBe(false);
    // Without a calendar it falls back to calendar days.
    expect(endDateFlagMatches(soon, { todayIso: "2026-12-23", dueIso: "2026-12-26" })).toBe(true);
    expect(endDateFlagMatches(soon, { todayIso: "2026-12-23", dueIso: "2026-12-29" })).toBe(false);
  });

  it("keeps calendar days for flags without workingDays", () => {
    expect(endDateFlagMatches(week, { todayIso: "2026-12-23", dueIso: "2026-12-30", calendar })).toBe(true);
    expect(endDateFlagMatches(week, { todayIso: "2026-12-23", dueIso: "2026-12-31", calendar })).toBe(false);
  });

  it("picks the highest-priority match and respects statuses", () => {
    const flags = [soon, week, overdue, today];
    expect(pickEndDateFlag(flags, { todayIso: "2026-12-23", dueIso: "2026-12-23", calendar })?.name).toBe("Due Today");
    expect(pickEndDateFlag(flags, { todayIso: "2026-12-23", dueIso: "2026-12-22", calendar })?.name).toBe("Overdue");
    expect(pickEndDateFlag(flags, { todayIso: "2026-12-23", dueIso: "2026-12-28", calendar })?.name).toBe("Due Soon");
    expect(pickEndDateFlag(flags, { todayIso: "2026-12-23", dueIso: "2026-12-22", projectStatus: "Completed" })).toBeNull();
    const scoped = { ...soon, projectStatuses: ["In Progress"] };
    expect(pickEndDateFlag([scoped], { todayIso: "2026-12-23", dueIso: "2026-12-24", projectStatus: "Planning" })).toBeNull();
    expect(pickEndDateFlag([{ ...soon, targetField: "mapTask.dueDate" }], { todayIso: "2026-12-23", dueIso: "2026-12-24" })).toBeNull();
  });
});
