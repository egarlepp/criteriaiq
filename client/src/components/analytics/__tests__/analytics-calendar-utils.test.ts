import { describe, expect, it } from "vitest";
import type { ReportCalendarEvent, ReportCalendarSchedule } from "@shared/report-schedule-calendar";
import {
  EMPTY_FILTERS,
  buildEntries,
  countActiveFilters,
  countsByDay,
  entriesInView,
  filterOptions,
  monthTotals,
} from "../analytics-calendar-utils";

const schedule = (over: Partial<ReportCalendarSchedule>): ReportCalendarSchedule => ({
  id: 1,
  reportName: "Project Status Report",
  reportCategory: "system",
  reportKey: "system:project-status",
  frequency: "weekly",
  cron: "0 9 * * 1",
  timezone: "UTC",
  active: true,
  nextRunAt: null,
  lastRunAt: null,
  recipients: ["a@x.com"],
  createdBy: "u1",
  creatorName: "Ann",
  ...over,
});

// Local-noon times, so the viewer's day is the same in every timezone.
const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();
const event = (scheduleId: number, iso: string, status: ReportCalendarEvent["status"], key: string): ReportCalendarEvent => ({
  key,
  scheduleId,
  at: iso,
  status,
  message: null,
  triggeredBy: status === "upcoming" ? null : "scheduler",
});

const schedules = [
  schedule({ id: 1 }),
  schedule({ id: 2, frequency: "daily", recipients: ["b@x.com"], createdBy: "u2", creatorName: "Bob" }),
];
const events = [
  event(2, at(2026, 10, 30), "failure", "e3"),
  event(1, at(2026, 10, 5), "success", "e1"),
  event(2, at(2026, 10, 5), "success", "e2"),
  event(1, at(2026, 11, 2), "upcoming", "e4"),
  event(99, at(2026, 10, 6), "success", "orphan"),
];

describe("analytics calendar utils", () => {
  it("joins, sorts and drops events of unknown schedules", () => {
    const entries = buildEntries(schedules, events, EMPTY_FILTERS);
    expect(entries.map((e) => e.event.key)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(entries[0].day).toBe("2026-10-05");
  });

  it("filters by creator, frequency, recipient and status", () => {
    const keys = (f: Partial<typeof EMPTY_FILTERS>) =>
      buildEntries(schedules, events, { ...EMPTY_FILTERS, ...f }).map((e) => e.event.key);
    expect(keys({ createdBy: "u2" })).toEqual(["e2", "e3"]);
    expect(keys({ frequency: "weekly" })).toEqual(["e1", "e4"]);
    expect(keys({ recipient: "b@x.com" })).toEqual(["e2", "e3"]);
    expect(keys({ status: "failure" })).toEqual(["e3"]);
  });

  it("counts per day and per month, and narrows to a selected day", () => {
    const entries = buildEntries(schedules, events, EMPTY_FILTERS);
    expect(countsByDay(entries).get("2026-10-05")).toEqual({ upcoming: 0, sent: 0, success: 2, failure: 0 });
    const october = new Date(2026, 9, 1);
    expect(monthTotals(entries, october)).toEqual({ upcoming: 0, sent: 0, success: 2, failure: 1, total: 3 });
    expect(entriesInView(entries, october, null)).toHaveLength(3);
    expect(entriesInView(entries, october, new Date(2026, 9, 30)).map((e) => e.event.key)).toEqual(["e3"]);
  });

  it("builds filter options and counts active filters", () => {
    expect(filterOptions(schedules)).toEqual({
      creators: [{ id: "u1", name: "Ann" }, { id: "u2", name: "Bob" }],
      recipients: ["a@x.com", "b@x.com"],
    });
    expect(countActiveFilters(EMPTY_FILTERS, null)).toBe(0);
    expect(countActiveFilters({ ...EMPTY_FILTERS, status: "failure" }, new Date())).toBe(2);
  });
});
