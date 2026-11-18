import { describe, expect, it } from "vitest";
import { crmJobAccess, jobGroup, JOB_GROUPS } from "@shared/job-categories";
import { groupJobs, jobHealth, type SchedulerJob } from "../scheduler-utils";

const job = (patch: Partial<SchedulerJob>): SchedulerJob => ({
  key: "sessions_cleanup",
  category: "system",
  scheduleType: "interval",
  defaultIntervalMs: 60_000,
  intervalMs: 60_000,
  minIntervalMs: 60_000,
  defaultDailyAt: null,
  dailyAt: null,
  timezone: null,
  cronExpression: null,
  eventKey: null,
  cadenceEditable: true,
  editPath: null,
  enabled: true,
  notifyOnError: false,
  running: false,
  nextRunAt: null,
  waitingForCrm: false,
  latestRun: null,
  ...patch,
});

describe("jobGroup", () => {
  it("files known jobs, per-entity Salesforce syncs and unknown jobs", () => {
    expect(jobGroup("salesforce_sync_queue")).toBe("crm_sync");
    expect(jobGroup("hubspot_link_check")).toBe("crm_refresh");
    expect(jobGroup("salesforce_scheduled_sync_project")).toBe("crm_refresh");
    expect(jobGroup("welcome_email")).toBe("notifications");
    expect(jobGroup("sessions_cleanup")).toBe("security");
    expect(jobGroup("job_runs_cleanup")).toBe("maintenance");
    expect(jobGroup("brand_new_job")).toBe("other");
    // Inherited object keys must not be read as groups.
    expect(jobGroup("toString")).toBe("other");
  });
});

describe("crmJobAccess", () => {
  it("leaves non-CRM jobs alone whatever the CRM", () => {
    for (const crm of ["none", "salesforce", "hubspot"] as const) {
      expect(crmJobAccess("system", crm)).toBe("available");
      expect(crmJobAccess("workflow", crm)).toBe("available");
    }
  });

  it("holds every CRM job while no CRM is chosen", () => {
    expect(crmJobAccess("salesforce", "none")).toBe("waiting");
    expect(crmJobAccess("hubspot", "none")).toBe("waiting");
  });

  it("shows the chosen CRM's jobs and hides the other's", () => {
    expect(crmJobAccess("salesforce", "salesforce")).toBe("available");
    expect(crmJobAccess("hubspot", "salesforce")).toBe("hidden");
    expect(crmJobAccess("hubspot", "hubspot")).toBe("available");
    expect(crmJobAccess("salesforce", "hubspot")).toBe("hidden");
  });
});

describe("groupJobs", () => {
  const run = (status: "success" | "error") => ({
    id: 1,
    jobKey: "x",
    status,
    source: "scheduled" as const,
    startedAt: "2026-10-26T00:00:00Z",
    finishedAt: "2026-10-26T00:00:01Z",
    durationMs: 1000,
    itemsProcessed: null,
    message: null,
    triggeredBy: null,
  });

  it("groups in display order, drops empty groups and counts active, inactive and errors", () => {
    const groups = groupJobs(
      [
        job({ key: "job_runs_cleanup", latestRun: run("error") }),
        job({ key: "salesforce_sync_queue", category: "salesforce", waitingForCrm: true, enabled: false }),
        job({ key: "sessions_cleanup", enabled: false }),
        job({ key: "docs_sync", latestRun: run("success") }),
      ],
      (key) => key,
    );
    expect(groups.map((g) => g.group)).toEqual(["crm_sync", "security", "maintenance"]);
    expect(groups.map((g) => g.group)).toEqual(JOB_GROUPS.filter((g) => groups.some((x) => x.group === g)));
    const maintenance = groups.find((g) => g.group === "maintenance")!;
    expect(maintenance.jobs.map((j) => j.key)).toEqual(["docs_sync", "job_runs_cleanup"]);
    expect(maintenance).toMatchObject({ errorCount: 1, activeCount: 2, inactiveCount: 0 });
    expect(groups.find((g) => g.group === "crm_sync")).toMatchObject({ activeCount: 0, inactiveCount: 1 });
    expect(groups.find((g) => g.group === "security")).toMatchObject({ activeCount: 0, inactiveCount: 1 });
  });

  it("reports a waiting CRM job as waiting, not as an error", () => {
    expect(jobHealth(job({ waitingForCrm: true, enabled: false, latestRun: run("error") }))).toBe("waiting");
  });
});
