// @vitest-environment node
//
// Coverage for the clock-time side of the shared job scheduler
// (server/services/jobs/scheduler.ts), added for the Salesforce and
// Workflow jobs. Pins:
//   1. A daily job fires at its clock time in the server timezone, and an
//      admin can move the time and the timezone; a fixed job ignores both.
//   2. A time saved on another replica (setJobConfigs) re-arms the timer.
//   3. A cron job (schedule owned by another page) fires on its expression.
//   4. Each clock slot is claimed first: a slot another copy claimed is
//      skipped; a claim that errors runs anyway rather than miss the slot.
//   5. A singleInstance job runs under the lock: not acquired = skipped;
//      a lock that throws is a recorded failure.
//   6. A definition must set exactly one schedule kind.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsertJobRun } from "@shared/schema";
import {
  applyJobConfig,
  configureJobScheduler,
  getJobState,
  resetJobSchedulerForTests,
  runJobNow,
  scheduleJob,
  serverTimezone,
  setJobConfigs,
  type JobDefinition,
} from "../jobs/scheduler";

function dailyJob(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "nightly",
    category: "salesforce",
    dailyAt: { hour: 3, minute: 0 },
    cadenceEditable: true,
    task: vi.fn(async () => ({ status: "success" as const })),
    ...overrides,
  };
}

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

const HOUR = 60 * 60_000;

describe("job scheduler clock-time jobs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Absolute times below pin a UTC timezone explicitly, so the tests
    // pass whatever the machine's TZ is.
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    resetJobSchedulerForTests();
  });

  afterEach(() => {
    resetJobSchedulerForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires a daily job at its clock time in the server timezone", async () => {
    const def = dailyJob({ dailyAt: { hour: 12, minute: 30 } });
    scheduleJob(def);
    const state = getJobState("nightly")!;
    expect(state.scheduleType).toBe("daily");
    expect(state.timezone).toBe(serverTimezone());
    expect(state.cronExpression).toBe("30 12 * * *");
    expect(state.intervalMs).toBeNull();

    const expected = new Date(new Date("2026-10-20T12:00:00Z").getTime());
    const next = new Date(state.nextRunAt!);
    expect(next.getTime()).toBeGreaterThan(expected.getTime());
    await advance(next.getTime() - Date.now() - 1);
    expect(def.task).not.toHaveBeenCalled();
    await advance(1);
    expect(def.task).toHaveBeenCalledTimes(1);
    // And again a day later, not sooner.
    await advance(24 * HOUR - 1);
    expect(def.task).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(def.task).toHaveBeenCalledTimes(2);
  });

  it("uses an admin's run time and timezone", async () => {
    const def = dailyJob();
    scheduleJob(def);
    applyJobConfig("nightly", { scheduleHour: 9, scheduleMinute: 15, timezone: "America/New_York" });
    const state = getJobState("nightly")!;
    expect(state.dailyAt).toEqual({ hour: 9, minute: 15 });
    expect(state.timezone).toBe("America/New_York");
    // 09:15 in New York on 2026-10-20 (EDT, UTC-4) = 13:15 UTC.
    expect(state.nextRunAt).toBe("2026-10-20T13:15:00.000Z");
    await advance(75 * 60_000);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("ignores run-time overrides on a fixed daily job and invalid ones on an editable job", () => {
    scheduleJob(dailyJob({ key: "fixed", cadenceEditable: false }));
    applyJobConfig("fixed", { scheduleHour: 9, scheduleMinute: 0, timezone: "Asia/Tokyo" });
    expect(getJobState("fixed")!.dailyAt).toEqual({ hour: 3, minute: 0 });
    expect(getJobState("fixed")!.timezone).toBe(serverTimezone());

    scheduleJob(dailyJob({ key: "editable" }));
    applyJobConfig("editable", { scheduleHour: 25, scheduleMinute: 99, timezone: "Not/AZone" });
    expect(getJobState("editable")!.dailyAt).toEqual({ hour: 3, minute: 0 });
    expect(getJobState("editable")!.timezone).toBe(serverTimezone());
  });

  it("re-arms when another replica saves a new run time", () => {
    setJobConfigs([
      { jobKey: "nightly", enabled: true, intervalMs: null, scheduleHour: null, scheduleMinute: null, timezone: "UTC", notifyOnError: false },
    ]);
    scheduleJob(dailyJob());
    expect(getJobState("nightly")!.nextRunAt).toBe("2026-10-21T03:00:00.000Z");
    setJobConfigs([
      { jobKey: "nightly", enabled: true, intervalMs: null, scheduleHour: 18, scheduleMinute: 0, timezone: "UTC", notifyOnError: false },
    ]);
    expect(getJobState("nightly")!.nextRunAt).toBe("2026-10-20T18:00:00.000Z");
  });

  it("fires a cron job on its expression and shows where it's edited", async () => {
    const task = vi.fn(async () => ({ status: "success" as const }));
    scheduleJob({
      key: "policy_sync",
      category: "salesforce",
      cron: { expression: "0 */6 * * *", timezone: "UTC" },
      cadenceEditable: false,
      editPath: "/config?tab=x",
      task,
    });
    const state = getJobState("policy_sync")!;
    expect(state.scheduleType).toBe("cron");
    expect(state.cronExpression).toBe("0 */6 * * *");
    expect(state.editPath).toBe("/config?tab=x");
    expect(state.nextRunAt).toBe("2026-10-20T18:00:00.000Z");
    await advance(6 * HOUR);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("skips a slot another copy already claimed, and runs when the claim errors", async () => {
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    const claimSlot = vi.fn(async () => false);
    configureJobScheduler({ recordRun, claimSlot });
    setJobConfigs([
      { jobKey: "nightly", enabled: true, intervalMs: null, scheduleHour: null, scheduleMinute: null, timezone: "UTC", notifyOnError: false },
    ]);
    const def = dailyJob({ dailyAt: { hour: 13, minute: 0 } });
    scheduleJob(def);
    await advance(HOUR);
    expect(claimSlot).toHaveBeenCalledWith("nightly", new Date("2026-10-20T13:00:00.000Z"));
    expect(def.task).not.toHaveBeenCalled();
    expect(recordRun).not.toHaveBeenCalled();

    claimSlot.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await advance(24 * HOUR);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("Run now doesn't claim a slot", async () => {
    const claimSlot = vi.fn(async () => true);
    configureJobScheduler({ claimSlot });
    const def = dailyJob();
    scheduleJob(def);
    await runJobNow("nightly");
    expect(def.task).toHaveBeenCalledTimes(1);
    expect(claimSlot).not.toHaveBeenCalled();
  });

  it("runs a singleInstance job under the lock", async () => {
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    const withLock = vi.fn(async <T,>(_key: string, fn: () => Promise<T>) => ({ acquired: true as const, value: await fn() }));
    configureJobScheduler({ recordRun, withLock });
    const task = vi.fn(async () => ({ status: "success" as const, itemsProcessed: 2 }));
    scheduleJob({ key: "tick", category: "workflow", defaultIntervalMs: 60_000, cadenceEditable: false, singleInstance: true, task });

    const result = await runJobNow("tick");
    expect(withLock).toHaveBeenCalledWith("tick", expect.any(Function));
    expect(result).toMatchObject({ recorded: true, status: "success" });
    expect(recordRun).toHaveBeenCalledTimes(1);
  });

  it("skips a singleInstance run when another copy holds the lock", async () => {
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    configureJobScheduler({ recordRun, withLock: async () => ({ acquired: false }) });
    const task = vi.fn(async () => ({ status: "success" as const }));
    scheduleJob({ key: "tick", category: "workflow", defaultIntervalMs: 60_000, cadenceEditable: false, singleInstance: true, task });

    expect(await runJobNow("tick")).toEqual({ recorded: false, status: "skipped", message: "already_running" });
    expect(task).not.toHaveBeenCalled();
    expect(recordRun).not.toHaveBeenCalled();
  });

  it("records a failed run when the lock itself throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    const onRunFailed = vi.fn(async () => {});
    configureJobScheduler({
      recordRun,
      onRunFailed,
      withLock: async () => {
        throw new Error("no connection");
      },
    });
    scheduleJob({ key: "tick", category: "workflow", defaultIntervalMs: 60_000, cadenceEditable: false, singleInstance: true, task: vi.fn() });

    const result = await runJobNow("tick");
    expect(result).toMatchObject({ recorded: true, status: "error", message: "no connection" });
    expect(recordRun.mock.calls[0][0]).toMatchObject({ jobKey: "tick", status: "error" });
    expect(onRunFailed).toHaveBeenCalledWith("tick", "no connection");
  });

  it("requires exactly one schedule kind", () => {
    expect(() =>
      scheduleJob({ key: "none", category: "system", cadenceEditable: false, task: vi.fn() }),
    ).toThrow(/exactly one/);
    expect(() =>
      scheduleJob({
        key: "two",
        category: "system",
        defaultIntervalMs: 60_000,
        dailyAt: { hour: 1, minute: 0 },
        cadenceEditable: false,
        task: vi.fn(),
      }),
    ).toThrow(/exactly one/);
  });
});
