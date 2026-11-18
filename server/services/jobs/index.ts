/**
 * Boot wiring for the shared Scheduler (Configuration › Scheduler).
 *
 * `startJobScheduler()` runs once at startup, before the individual jobs
 * register: it injects storage into the scheduler (config overrides, run
 * recording, the cross-replica lock and slot claim, and the "Scheduled
 * job failed" email), loads the saved overrides, refreshes them every
 * minute so a change saved on another replica is picked up, and registers
 * the scheduler's own housekeeping job, the run-history prune.
 */
import { storage } from "../../storage";
import { dbReady, pool } from "../../db";
import { configureJobScheduler, getJobLabel, refreshJobConfigs, scheduleJob, type JobOutcome } from "./scheduler";
import { withJobAdvisoryLock } from "./locks";

/** Key on Configuration › Scheduler. */
export const JOB_RUNS_CLEANUP_JOB_KEY = "job_runs_cleanup";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const CONFIG_REFRESH_MS = 60_000;
const DEFAULT_JOB_RUNS_RETENTION_DAYS = 90;
/** At most one "Scheduled job failed" email per job per day, like ImpactIQ. */
export const ERROR_EMAIL_MIN_GAP_MS = DAY_MS;

let refreshHandle: NodeJS.Timeout | null = null;

export function resolveJobRunsRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.JOB_RUNS_RETENTION_DAYS);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_JOB_RUNS_RETENTION_DAYS;
}

async function pruneJobRunHistory(): Promise<JobOutcome> {
  const { dbHealth } = await import("../../lib/db-probe");
  if (!dbHealth.reachable) return { status: "skipped", message: "database_unreachable" };
  const days = resolveJobRunsRetentionDays();
  const removed = await storage.pruneJobRuns(new Date(Date.now() - days * DAY_MS));
  if (removed > 0) {
    console.log(`[Scheduler] Pruned ${removed} job run${removed === 1 ? "" : "s"} older than ${days} days`);
  }
  return { status: "success", itemsProcessed: removed };
}

/**
 * Email the admins about a failed run when the job has "Email admins on
 * error" on and no such email went out for it in the last day. The slot is
 * reserved before sending, so two replicas can't both send one.
 */
export async function notifyJobFailure(jobKey: string, message: string, now: Date = new Date()): Promise<boolean> {
  const claimed = await storage.claimJobErrorEmail(jobKey, now, ERROR_EMAIL_MIN_GAP_MS);
  if (!claimed) return false;
  const { sendScheduledJobFailedEmail } = await import("../../email/scheduled-job-failed-email");
  await sendScheduledJobFailedEmail({ jobKey, jobName: getJobLabel(jobKey), message, failedAt: now });
  return true;
}

export async function startJobScheduler(): Promise<void> {
  if (!dbReady) {
    console.log("[Scheduler] Skipping: no database configured (setup wizard mode)");
    return;
  }

  configureJobScheduler({
    loadConfigs: () => storage.listJobConfigs(),
    recordRun: (run) => storage.insertJobRun(run),
    onRunFailed: async (jobKey, message) => {
      await notifyJobFailure(jobKey, message);
    },
    // `pool` is read at call time: the setup wizard can rebuild it.
    withLock: (jobKey, fn) => withJobAdvisoryLock(pool, jobKey, fn),
    claimSlot: (jobKey, slot) => storage.claimJobSlot(jobKey, slot),
  });
  await refreshJobConfigs();

  if (refreshHandle) clearInterval(refreshHandle);
  refreshHandle = setInterval(() => void refreshJobConfigs(), CONFIG_REFRESH_MS);
  refreshHandle.unref();

  scheduleJob({
    key: JOB_RUNS_CLEANUP_JOB_KEY,
    category: "system",
    label: "Run history cleanup",
    defaultIntervalMs: DAY_MS,
    cadenceEditable: true,
    minIntervalMs: HOUR_MS,
    firstRunDelayMs: 10 * 60 * 1000,
    task: pruneJobRunHistory,
  });
}
