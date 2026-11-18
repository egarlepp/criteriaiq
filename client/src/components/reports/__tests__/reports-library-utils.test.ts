import { describe, expect, it } from "vitest";
import type { ReportCalendarEvent, ReportCalendarSchedule } from "@shared/report-schedule-calendar";
import {
  EMPTY_LIBRARY_FILTERS,
  LOGIN_AUDIT_KEY,
  buildLibrary,
  computeKpis,
  countLibraryFilters,
  filterLibrary,
  labelFromFieldKey,
  toCsv,
} from "../reports-library-utils";

const NOW = new Date("2026-11-05T12:00:00.000Z");

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

const event = (scheduleId: number, at: string, status: ReportCalendarEvent["status"], key = `${scheduleId}-${at}`): ReportCalendarEvent => ({
  key,
  scheduleId,
  at,
  status,
  message: null,
  triggeredBy: status === "upcoming" ? null : "scheduler",
});

const builtIn = [
  { id: "project-status", name: "Project Status Report", description: "Every validation" },
  { id: "risk-analysis", name: "Risk Analysis Report", description: "Risk level" },
  { id: "map-progress", name: "MAP Progress Report", description: "Tasks done" },
];

describe("buildLibrary", () => {
  const schedules = [
    schedule({ id: 1 }),
    schedule({ id: 2, reportName: "EMEA pipeline", reportCategory: "custom", reportKey: "custom:9", frequency: "monthly" }),
    schedule({ id: 3, reportName: "MAP Progress Report", reportKey: "system:map-progress", active: false, lastRunAt: "2026-10-01T09:00:00.000Z" }),
  ];
  const events = [
    event(1, "2026-11-02T09:00:00.000Z", "sent"),
    event(1, "2026-11-09T09:00:00.000Z", "upcoming"),
    event(1, "2026-11-16T09:00:00.000Z", "upcoming"),
    event(2, "2026-11-03T09:00:00.000Z", "failure"),
    event(2, "2026-12-01T09:00:00.000Z", "upcoming"),
  ];
  const rows = buildLibrary({
    builtIn,
    loginAudit: { id: "login-audit-report", name: "Login Audit", description: "Sign-ins" },
    saved: [{ id: 9, name: "EMEA pipeline", description: null }],
    favorites: [{ reportType: "system", systemReportId: "risk-analysis" }],
    schedules,
    events,
    now: NOW,
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  it("lists every report once, Login Audit included", () => {
    expect(rows.map((r) => r.key).sort()).toEqual(
      ["custom:9", LOGIN_AUDIT_KEY, "system:map-progress", "system:project-status", "system:risk-analysis"].sort(),
    );
    expect(byKey.get(LOGIN_AUDIT_KEY)?.schedulable).toBe(false);
    expect(byKey.get("custom:9")?.kind).toBe("saved");
  });

  it("joins each report to its earliest upcoming send and latest run", () => {
    expect(byKey.get("system:project-status")).toMatchObject({
      nextSendAt: "2026-11-09T09:00:00.000Z",
      lastRun: { at: "2026-11-02T09:00:00.000Z", status: "sent" },
      activeSchedules: 1,
    });
    expect(byKey.get("custom:9")).toMatchObject({
      nextSendAt: "2026-12-01T09:00:00.000Z",
      lastRun: { at: "2026-11-03T09:00:00.000Z", status: "failure" },
    });
  });

  it("uses a paused schedule's stored last run, with no next send", () => {
    expect(byKey.get("system:map-progress")).toMatchObject({
      nextSendAt: null,
      lastRun: { at: "2026-10-01T09:00:00.000Z", status: null },
      activeSchedules: 0,
    });
  });

  it("puts starred reports first, then the soonest send, then by name", () => {
    expect(rows.map((r) => r.key)).toEqual([
      "system:risk-analysis",
      "system:project-status",
      "custom:9",
      LOGIN_AUDIT_KEY,
      "system:map-progress",
    ]);
    expect(rows[0].starred).toBe(true);
  });

  it("filters by text, kind, schedule state and star", () => {
    expect(filterLibrary(rows, { ...EMPTY_LIBRARY_FILTERS, search: "risk" }).map((r) => r.key)).toEqual(["system:risk-analysis"]);
    expect(filterLibrary(rows, { ...EMPTY_LIBRARY_FILTERS, kinds: ["saved", "security"] }).map((r) => r.key)).toEqual([
      "custom:9",
      LOGIN_AUDIT_KEY,
    ]);
    expect(filterLibrary(rows, { ...EMPTY_LIBRARY_FILTERS, schedule: "scheduled" }).map((r) => r.key)).toEqual([
      "system:project-status",
      "custom:9",
    ]);
    expect(filterLibrary(rows, { ...EMPTY_LIBRARY_FILTERS, schedule: "notScheduled" })).toHaveLength(3);
    expect(filterLibrary(rows, { ...EMPTY_LIBRARY_FILTERS, starred: "starred" })).toHaveLength(1);
    expect(countLibraryFilters({ search: " x ", kinds: ["saved"], schedule: "scheduled", starred: "starred" })).toBe(4);
    expect(countLibraryFilters(EMPTY_LIBRARY_FILTERS)).toBe(0);
  });
});

describe("computeKpis", () => {
  it("counts this month's sends and failures, and finds the next send", () => {
    const schedules = [
      schedule({ id: 1, recipients: ["a@x.com", "B@x.com"] }),
      schedule({ id: 2, reportName: "EMEA pipeline", frequency: "monthly", recipients: ["b@x.com", "c@x.com"] }),
      schedule({ id: 3, active: false }),
    ];
    const kpis = computeKpis(
      schedules,
      [
        event(1, "2026-10-28T09:00:00.000Z", "sent"), // last month
        event(1, "2026-11-02T09:00:00.000Z", "sent"),
        event(2, "2026-11-01T09:00:00.000Z", "success"),
        event(2, "2026-11-03T09:00:00.000Z", "failure"),
        event(1, "2026-11-09T09:00:00.000Z", "upcoming"),
        event(2, "2026-11-07T09:00:00.000Z", "upcoming"),
      ],
      NOW,
    );
    expect(kpis).toEqual({
      activeSchedules: 2,
      pausedSchedules: 1,
      byFrequency: { weekly: 1, monthly: 1 },
      sentThisMonth: 2,
      sentToPeople: 3,
      failedThisMonth: 1,
      lastFailure: { reportName: "EMEA pipeline", at: "2026-11-03T09:00:00.000Z" },
      nextSend: { reportName: "EMEA pipeline", at: "2026-11-07T09:00:00.000Z" },
    });
  });

  it("falls back to a schedule's stored next run outside the fetched window", () => {
    const kpis = computeKpis([schedule({ nextRunAt: "2027-01-04T09:00:00.000Z" })], [], NOW);
    expect(kpis.nextSend).toEqual({ reportName: "Project Status Report", at: "2027-01-04T09:00:00.000Z" });
    expect(kpis.failedThisMonth).toBe(0);
    expect(kpis.lastFailure).toBeNull();
  });
});

describe("toCsv", () => {
  it("quotes, escapes and neutralises formulas in text only", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "acv", label: "ACV" },
      ],
      [
        { name: 'Acme, "Big"', acv: -5 },
        { name: "=HYPERLINK(1)", acv: null },
      ],
    );
    expect(csv).toBe('Name,ACV\r\n"Acme, ""Big""",-5\r\n\'=HYPERLINK(1),');
  });
});

describe("labelFromFieldKey", () => {
  it("turns field keys into labels", () => {
    expect(labelFromFieldKey("customerName")).toBe("Customer Name");
    expect(labelFromFieldKey("opportunity_acv")).toBe("Opportunity acv");
  });
});
