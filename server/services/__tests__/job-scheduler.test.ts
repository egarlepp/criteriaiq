// @vitest-environment node
//
// Coverage for the shared job scheduler behind Configuration › Scheduler
// (server/services/jobs/scheduler.ts). Pins:
//   1. A job fires on its default cadence, fixed-rate, after its first-run delay.
//   2. An admin override (job_config) changes the cadence; overrides below the
//      job's minimum, or on a job whose cadence isn't editable, are ignored.
//   3. A disabled job keeps ticking but does no work; Run now still runs it.
//   4. applyJobConfig re-arms immediately when the new cadence is shorter.
//   5. A run never overlaps the previous one still in flight.
//   6. Only runs that did work or failed are recorded; failures call onRunFailed.
//   7. Re-registering a key replaces the old timer instead of stacking one.
//   8. An event job has no timer: fireEventJob runs and records each
//      occurrence (side by side), honors the on/off switch, and Run now
//      refuses it.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InsertJobRun } from "@shared/schema";
import {
  applyJobConfig,
  configureJobScheduler,
  fireEventJob,
  getJobState,
  listJobStates,
  resetJobSchedulerForTests,
  runJobNow,
  scheduleJob,
  setJobConfigs,
  unscheduleJob,
  type JobDefinition,
} from "../jobs/scheduler";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function job(overrides: Partial<JobDefinition> = {}): JobDefinition {
  return {
    key: "test_job",
    category: "system",
    defaultIntervalMs: HOUR,
    cadenceEditable: true,
    task: vi.fn(async () => ({ status: "success" as const })),
    ...overrides,
  };
}

/** Advance fake time and let the async tick bodies settle. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("job scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
    resetJobSchedulerForTests();
  });

  afterEach(() => {
    resetJobSchedulerForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs on the default cadence after the first-run delay", async () => {
    const def = job({ firstRunDelayMs: 5 * MINUTE });
    scheduleJob(def);

    await advance(5 * MINUTE - 1);
    expect(def.task).not.toHaveBeenCalled();
    await advance(1);
    expect(def.task).toHaveBeenCalledTimes(1);
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(2);
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(3);
  });

  it("waits one full interval when no first-run delay is given", async () => {
    const def = job();
    scheduleJob(def);
    await advance(HOUR - 1);
    expect(def.task).not.toHaveBeenCalled();
    await advance(1);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("honours an admin cadence override at or above the minimum", async () => {
    setJobConfigs([{ jobKey: "test_job", enabled: true, intervalMs: 10 * MINUTE }]);
    const def = job({ minIntervalMs: 5 * MINUTE });
    scheduleJob(def);

    expect(getJobState("test_job")?.intervalMs).toBe(10 * MINUTE);
    await advance(10 * MINUTE);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("ignores overrides below the minimum or on a fixed-cadence job", () => {
    setJobConfigs([
      { jobKey: "short", enabled: true, intervalMs: MINUTE },
      { jobKey: "fixed", enabled: true, intervalMs: 2 * HOUR },
    ]);
    scheduleJob(job({ key: "short", minIntervalMs: HOUR }));
    scheduleJob(job({ key: "fixed", cadenceEditable: false }));

    expect(getJobState("short")?.intervalMs).toBe(HOUR);
    expect(getJobState("fixed")?.intervalMs).toBe(HOUR);
  });

  it("skips the work while disabled but keeps the schedule alive", async () => {
    setJobConfigs([{ jobKey: "test_job", enabled: false, intervalMs: null }]);
    const def = job();
    scheduleJob(def);

    await advance(3 * HOUR);
    expect(def.task).not.toHaveBeenCalled();
    expect(getJobState("test_job")?.enabled).toBe(false);
    expect(getJobState("test_job")?.nextRunAt).not.toBeNull();

    applyJobConfig("test_job", { enabled: true, intervalMs: null });
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("re-arms immediately when a shorter cadence is saved", async () => {
    const def = job({ defaultIntervalMs: 24 * HOUR });
    scheduleJob(def);

    applyJobConfig("test_job", { enabled: true, intervalMs: HOUR });
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(1);
  });

  it("keeps the current timer when a longer cadence is saved", async () => {
    const def = job();
    scheduleJob(def);

    applyJobConfig("test_job", { enabled: true, intervalMs: 6 * HOUR });
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(1);
    await advance(HOUR);
    expect(def.task).toHaveBeenCalledTimes(1);
    await advance(5 * HOUR);
    expect(def.task).toHaveBeenCalledTimes(2);
  });

  it("never overlaps a run that is still in flight", async () => {
    let release: () => void = () => {};
    const task = vi.fn(
      () =>
        new Promise<{ status: "success" }>((resolve) => {
          release = () => resolve({ status: "success" });
        }),
    );
    scheduleJob(job({ task, defaultIntervalMs: MINUTE }));

    await advance(MINUTE);
    expect(task).toHaveBeenCalledTimes(1);
    expect(getJobState("test_job")?.running).toBe(true);

    // The next tick lands while the first run is still going.
    await advance(MINUTE);
    expect(task).toHaveBeenCalledTimes(1);
    await expect(runJobNow("test_job")).resolves.toEqual({
      recorded: false,
      status: "skipped",
      message: "already_running",
    });

    release();
    await advance(0);
    expect(getJobState("test_job")?.running).toBe(false);
    await advance(MINUTE);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("records runs that did work and leaves quiet runs out", async () => {
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    configureJobScheduler({ recordRun });
    const outcomes = [
      { status: "skipped" as const, message: "nothing_to_do" },
      { status: "success" as const, itemsProcessed: 7, message: "pruned" },
    ];
    scheduleJob(job({ task: vi.fn(async () => outcomes.shift()!) }));

    await advance(HOUR);
    expect(recordRun).not.toHaveBeenCalled();

    await advance(HOUR);
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][0]).toMatchObject({
      jobKey: "test_job",
      status: "success",
      source: "scheduled",
      itemsProcessed: 7,
      message: "pruned",
      triggeredBy: null,
    });
  });

  it("records a failed run and notifies onRunFailed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    const onRunFailed = vi.fn(async () => {});
    configureJobScheduler({ recordRun, onRunFailed });
    scheduleJob(
      job({
        task: vi.fn(async () => {
          throw new Error("disk full");
        }),
      }),
    );

    await advance(HOUR);
    expect(recordRun).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][0]).toMatchObject({ status: "error", message: "disk full" });
    expect(onRunFailed).toHaveBeenCalledWith("test_job", "disk full");
    // A failure doesn't stop the schedule.
    expect(getJobState("test_job")?.nextRunAt).not.toBeNull();
  });

  it("Run now runs a disabled job and records who started it", async () => {
    const recordRun = vi.fn(async (_run: InsertJobRun) => {});
    configureJobScheduler({ recordRun });
    setJobConfigs([{ jobKey: "test_job", enabled: false, intervalMs: null }]);
    const def = job();
    scheduleJob(def);

    await expect(runJobNow("test_job", "user-1")).resolves.toEqual({
      recorded: true,
      status: "success",
      message: undefined,
    });
    expect(def.task).toHaveBeenCalledTimes(1);
    expect(recordRun.mock.calls[0][0]).toMatchObject({ source: "manual", triggeredBy: "user-1" });
    await expect(runJobNow("unknown_job")).resolves.toBeNull();
  });

  it("a failing recorder doesn't break the run", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    configureJobScheduler({
      recordRun: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    scheduleJob(job());
    await expect(runJobNow("test_job")).resolves.toMatchObject({ recorded: false, status: "success" });
  });

  it("re-registering a key replaces the old timer", async () => {
    const first = job();
    const second = job();
    scheduleJob(first);
    scheduleJob(second);

    await advance(HOUR);
    expect(first.task).not.toHaveBeenCalled();
    expect(second.task).toHaveBeenCalledTimes(1);
    expect(listJobStates()).toHaveLength(1);

    unscheduleJob("test_job");
    await advance(HOUR);
    expect(second.task).toHaveBeenCalledTimes(1);
    expect(getJobState("test_job")).toBeNull();
  });

  describe("event jobs", () => {
    function eventJob(overrides: Partial<JobDefinition> = {}): JobDefinition {
      return {
        key: "event_job",
        category: "system",
        event: "user.registration_completed",
        cadenceEditable: false,
        ...overrides,
      };
    }

    it("registers with no timer and reports its event", async () => {
      scheduleJob(eventJob());
      const state = getJobState("event_job");
      expect(state).toMatchObject({
        scheduleType: "event",
        eventKey: "user.registration_completed",
        nextRunAt: null,
        cronExpression: null,
        timezone: null,
      });
      await advance(7 * 24 * HOUR);
      expect(getJobState("event_job")?.nextRunAt).toBeNull();
    });

    it("rejects a timer job without a task", () => {
      expect(() => scheduleJob(job({ task: undefined }))).toThrow(/needs a task/);
      expect(() => scheduleJob(eventJob({ defaultIntervalMs: HOUR }))).toThrow(/exactly one/);
    });

    it("records each occurrence with source event, even side by side", async () => {
      const runs: InsertJobRun[] = [];
      configureJobScheduler({ recordRun: async (run) => void runs.push(run) });
      scheduleJob(eventJob());
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const first = fireEventJob("event_job", async () => {
        await gate;
        return { status: "success", itemsProcessed: 1, message: "first" };
      });
      const second = fireEventJob("event_job", async () => ({ status: "success", itemsProcessed: 1, message: "second" }));
      expect(await second).toMatchObject({ status: "success", recorded: true });
      release();
      expect(await first).toMatchObject({ status: "success", recorded: true });
      expect(runs.map((r) => [r.source, r.message])).toEqual([
        ["event", "second"],
        ["event", "first"],
      ]);
    });

    it("does nothing while disabled", async () => {
      scheduleJob(eventJob());
      setJobConfigs([{ jobKey: "event_job", enabled: false }]);
      const task = vi.fn(async () => ({ status: "success" as const }));
      expect(await fireEventJob("event_job", task)).toMatchObject({ status: "skipped", message: "disabled" });
      expect(task).not.toHaveBeenCalled();
    });

    it("records a failure and notifies onRunFailed", async () => {
      const onRunFailed = vi.fn(async () => {});
      const runs: InsertJobRun[] = [];
      configureJobScheduler({ recordRun: async (run) => void runs.push(run), onRunFailed });
      scheduleJob(eventJob());
      const result = await fireEventJob("event_job", async () => {
        throw new Error("SMTP down");
      });
      expect(result).toMatchObject({ status: "error", message: "SMTP down" });
      expect(runs[0]).toMatchObject({ status: "error", source: "event" });
      expect(onRunFailed).toHaveBeenCalledWith("event_job", "SMTP down");
    });

    it("runs on defaults when the job isn't registered", async () => {
      const task = vi.fn(async () => ({ status: "success" as const }));
      expect(await fireEventJob("unregistered", task)).toMatchObject({ status: "success" });
      expect(task).toHaveBeenCalledTimes(1);
    });

    it("Run now refuses an event job", async () => {
      scheduleJob(eventJob());
      expect(await runJobNow("event_job")).toEqual({ recorded: false, status: "skipped", message: "event_job" });
    });
  });
});
