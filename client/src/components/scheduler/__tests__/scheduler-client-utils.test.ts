import { describe, expect, it } from "vitest";
import {
  describeCron,
  generateCronFromBuilder,
  isComplexCron,
  parseCronToBuilderValues,
  scheduleEditorState,
  scheduleSource,
  type WorkflowSchedule,
} from "../workflow-schedule-utils";
import { formatHour, parseMaxEmailsPerHour, sendWindowPatch, type SendWindowSettings } from "../send-window-utils";

const schedule = (patch: Partial<WorkflowSchedule>): WorkflowSchedule => ({
  id: 1,
  actionType: "email_digest",
  ruleId: 4,
  actionConfig: null,
  cron: "0 9 * * 1",
  rrule: null,
  timezone: "Europe/Berlin",
  nextRunAt: null,
  lastRunAt: null,
  active: true,
  metadata: null,
  ...patch,
});

describe("workflow schedule cron helpers", () => {
  it("round-trips the simple builder", () => {
    const weekly = parseCronToBuilderValues("30 8 * * 1,3");
    expect(weekly).toMatchObject({ frequency: "weekly", minute: 30, hour: 8, daysOfWeek: [1, 3], isComplex: false });
    expect(generateCronFromBuilder(weekly.frequency, weekly.minute, weekly.hour, weekly.daysOfWeek, weekly.dayOfMonth)).toBe(
      "30 8 * * 1,3",
    );
    expect(parseCronToBuilderValues("15 * * * *").frequency).toBe("hourly");
    expect(parseCronToBuilderValues("0 6 1 * *")).toMatchObject({ frequency: "monthly", dayOfMonth: 1 });
  });

  it("flags expressions the builder can't show", () => {
    expect(isComplexCron("*/15 9-17 * * 1-5")).toBe(true);
    expect(isComplexCron("0 9 * * *")).toBe(false);
    expect(parseCronToBuilderValues("*/15 9-17 * * 1-5").isComplex).toBe(true);
  });

  it("describes a cron in words", () => {
    expect(describeCron("0 9 * * *")).toContain("Daily");
    expect(describeCron("not a cron")).not.toBe("");
  });
});

describe("scheduleSource", () => {
  it("maps the page that created a schedule", () => {
    expect(scheduleSource(undefined)).toBe("workflowAutomation");
    expect(scheduleSource("salesforce_sync_config")).toBe("salesforce");
    expect(scheduleSource("analytics_reports")).toBe("analytics");
    expect(scheduleSource("ai_assessment_analysis_config")).toBe("aiAssessments");
    expect(scheduleSource("something_else")).toBe("manual");
  });
});

describe("scheduleEditorState", () => {
  it("starts a new schedule as a daily digest on global quiet hours", () => {
    const { form, builder } = scheduleEditorState(null);
    expect(form).toMatchObject({ actionType: "email_digest", cron: "0 9 * * *", active: true });
    expect(form.actionConfig).toEqual({ useGlobalQuietHours: true });
    expect(builder.frequency).toBe("daily");
  });

  it("loads an existing schedule", () => {
    const { form, builder } = scheduleEditorState(schedule({ active: false }));
    expect(form).toMatchObject({ ruleId: "4", cron: "0 9 * * 1", timezone: "Europe/Berlin", active: false });
    expect(builder).toMatchObject({ frequency: "weekly", daysOfWeek: [1] });
  });

  it("upgrades older report schedules", () => {
    const { form } = scheduleEditorState(
      schedule({
        actionType: "report_generation",
        actionConfig: { recipients: "a@x.com, b@x.com", reportType: "poc-status-overview" },
        metadata: { reportName: "POC Status Overview" },
      }),
    );
    expect(form.actionConfig).toMatchObject({
      selectedRecipients: ["a@x.com", "b@x.com"],
      reportId: "poc-status-overview",
      reportName: "POC Status Overview",
    });
  });
});

describe("send window helpers", () => {
  const saved: SendWindowSettings = {
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 7,
    quietHoursScope: "digests",
    timezone: null,
    maxEmailsPerHour: 500,
  };

  it("sends only the fields that changed", () => {
    expect(sendWindowPatch(saved, saved)).toEqual({});
    expect(sendWindowPatch(saved, { ...saved, quietHoursEnabled: true, quietHoursScope: "all", timezone: "UTC" })).toEqual({
      quietHoursEnabled: true,
      quietHoursScope: "all",
      timezone: "UTC",
    });
  });

  it("accepts whole numbers from 0 to 100,000", () => {
    expect(parseMaxEmailsPerHour("0")).toBe(0);
    expect(parseMaxEmailsPerHour(" 250 ")).toBe(250);
    expect(parseMaxEmailsPerHour("100000")).toBe(100000);
    expect(parseMaxEmailsPerHour("100001")).toBeNull();
    expect(parseMaxEmailsPerHour("-1")).toBeNull();
    expect(parseMaxEmailsPerHour("2.5")).toBeNull();
    expect(parseMaxEmailsPerHour("")).toBeNull();
  });

  it("formats hours as HH:00", () => {
    expect(formatHour(7)).toBe("07:00");
    expect(formatHour(22)).toBe("22:00");
  });
});
