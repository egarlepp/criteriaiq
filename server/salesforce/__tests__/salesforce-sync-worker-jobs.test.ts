// @vitest-environment node
//
// The Salesforce sync worker runs its jobs on the shared Scheduler
// (Configuration › Scheduler). Pins:
//   1. start() registers the queue (every minute), the nightly link check
//      (03:00, editable) and one cron job per object with a scheduled sync.
//   2. A quiet queue tick isn't recorded; one that processed items reports
//      the counts.
//   3. A scheduled sync that failed outright is a failed run; a policy
//      change re-registers or removes the per-object job.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processQueue = vi.fn();
const getSyncPolicy = vi.fn();
const runScheduledSync = vi.fn();
const checkLinkHealth = vi.fn();

vi.mock("../salesforce-sync-service.js", () => ({
  salesforceSyncService: {
    processQueue: () => processQueue(),
    getSyncPolicy: (entity: string) => getSyncPolicy(entity),
    runScheduledSync: (entity: string) => runScheduledSync(entity),
  },
}));
vi.mock("../salesforce-link-health.js", () => ({ checkLinkHealth: () => checkLinkHealth() }));
// These jobs run as the active CRM; standing down is covered in
// server/crm/__tests__/salesforce-stand-down.test.ts.
vi.mock("../../crm/provider-setting", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../crm/provider-setting")>()),
  onlyWhenCrmActive: (_provider: string, task: () => Promise<unknown>) => task,
}));

import { getJobState, resetJobSchedulerForTests, runJobNow } from "../../services/jobs/scheduler";
import {
  SALESFORCE_LINK_CHECK_JOB_KEY,
  SALESFORCE_QUEUE_JOB_KEY,
  salesforceSyncWorker,
  scheduledSyncJobKey,
} from "../salesforce-sync-worker";

describe("Salesforce sync worker jobs", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    resetJobSchedulerForTests();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    getSyncPolicy.mockImplementation(async (entity: string) =>
      entity === "project"
        ? { scheduledEnabled: true, scheduledCron: "0 2 * * *", scheduledTimezone: "UTC" }
        : { scheduledEnabled: false, scheduledCron: null },
    );
    await salesforceSyncWorker.start();
  });

  afterEach(async () => {
    await salesforceSyncWorker.stop();
    resetJobSchedulerForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("registers the queue, the link check and the scheduled syncs", () => {
    expect(getJobState(SALESFORCE_QUEUE_JOB_KEY)).toMatchObject({
      category: "salesforce",
      scheduleType: "interval",
      intervalMs: 60_000,
      cadenceEditable: true,
    });
    expect(getJobState(SALESFORCE_LINK_CHECK_JOB_KEY)).toMatchObject({
      scheduleType: "daily",
      dailyAt: { hour: 3, minute: 0 },
      cadenceEditable: true,
    });
    expect(getJobState(scheduledSyncJobKey("project"))).toMatchObject({
      scheduleType: "cron",
      cronExpression: "0 2 * * *",
      timezone: "UTC",
      cadenceEditable: false,
    });
    expect(getJobState(scheduledSyncJobKey("project"))?.editPath).toContain("sync-policies");
    expect(getJobState(scheduledSyncJobKey("customer"))).toBeNull();
    expect(salesforceSyncWorker.getStatus().scheduledSyncs).toEqual(["project"]);
  });

  it("skips a quiet queue tick and reports counts when items were processed", async () => {
    processQueue.mockResolvedValueOnce({ processed: 0, succeeded: 0, failed: 0, retried: 0 });
    expect(await runJobNow(SALESFORCE_QUEUE_JOB_KEY)).toMatchObject({ status: "skipped" });

    processQueue.mockResolvedValueOnce({ processed: 3, succeeded: 2, failed: 0, retried: 1 });
    expect(await runJobNow(SALESFORCE_QUEUE_JOB_KEY)).toMatchObject({
      status: "success",
      message: "3 processed, 2 succeeded, 1 will retry, 0 failed",
    });
  });

  it("treats a sync that failed outright as a failed run", async () => {
    runScheduledSync.mockResolvedValueOnce({
      status: "failed",
      totalRecords: 4,
      successCount: 0,
      errorCount: 4,
      conflictCount: 0,
      skippedCount: 0,
    });
    const result = await runJobNow(scheduledSyncJobKey("project"));
    expect(result?.status).toBe("error");
    expect(result?.message).toContain("4 errors");

    runScheduledSync.mockResolvedValueOnce({
      status: "partial",
      totalRecords: 4,
      successCount: 3,
      errorCount: 1,
      conflictCount: 0,
      skippedCount: 0,
    });
    expect((await runJobNow(scheduledSyncJobKey("project")))?.status).toBe("success");
  });

  it("re-registers or removes a scheduled sync when its policy changes", async () => {
    await salesforceSyncWorker.updateScheduledSync("customer", true, "30 4 * * *", "UTC");
    expect(getJobState(scheduledSyncJobKey("customer"))?.cronExpression).toBe("30 4 * * *");

    await salesforceSyncWorker.updateScheduledSync("project", false);
    expect(getJobState(scheduledSyncJobKey("project"))).toBeNull();
    expect(salesforceSyncWorker.getStatus().scheduledSyncs).toEqual(["customer"]);
  });

  it("reports the link check's next run from the Scheduler", () => {
    expect(salesforceSyncWorker.getStatus().linkHealthNextRun).toEqual(
      new Date(getJobState(SALESFORCE_LINK_CHECK_JOB_KEY)!.nextRunAt!),
    );
  });
});
