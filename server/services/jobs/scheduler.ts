/**
 * Shared job scheduler behind Configuration › Scheduler (mirrors ImpactIQ's
 * Admin › Scheduling).
 *
 * Every recurring background job calls `scheduleJob()` instead of owning
 * its own setInterval or croner instance. The scheduler:
 *   - fires the job on its schedule, reading the admin's overrides from
 *     `job_config`, so turning a job off or changing when it runs needs no
 *     restart. Three kinds of schedule:
 *       interval  every N ms, fixed rate (setInterval semantics);
 *       daily     at a clock time in a timezone (default: the server's);
 *       cron      a cron expression owned elsewhere (e.g. a Salesforce
 *                 sync policy), shown here but edited on its own page;
 *       event     no timer: the job runs each time something happens
 *                 (e.g. the Welcome email on a registration), through
 *                 `fireEventJob()`;
 *   - never overlaps a run with the previous one still in flight, and with
 *     several server copies runs a `singleInstance` job on one copy at a
 *     time (injected advisory lock) and each clock-time slot exactly once
 *     (injected slot claim);
 *   - records a `job_runs` row when a run did work or failed, never for a
 *     quiet tick (a task returns `{ status: "skipped" }` for those);
 *   - exposes `runJobNow()` for the page's Run now button, which invokes
 *     the exact task the next tick would.
 *
 * This module has no database imports on purpose. Storage is injected at
 * boot by `startJobScheduler()` (server/services/jobs/index.ts), so the
 * job modules and their unit tests can use the scheduler with fake timers
 * and no database: with nothing injected, every job runs on its defaults,
 * locks and slot claims always succeed, and runs are not recorded.
 */
import { Cron } from "croner";
import type { JobConfig, JobRunSource, InsertJobRun } from "@shared/schema";

export type JobCategory = "system" | "salesforce" | "hubspot" | "workflow";
export type JobScheduleType = "interval" | "daily" | "cron" | "event";

export interface JobOutcome {
  /** "skipped" = nothing to do (or not applicable right now); no run row is written. */
  status: "success" | "skipped";
  message?: string;
  itemsProcessed?: number;
}

export interface DailyTime {
  hour: number;
  minute: number;
}

export interface JobDefinition {
  key: string;
  category: JobCategory;
  /** English name for emails and logs. The page uses scheduler.jobNames.<key>. */
  label?: string;
  /**
   * Set exactly one of these four. `defaultIntervalMs` = run every N ms;
   * `dailyAt` = once a day at a clock time; `cron` = an expression owned
   * by another page (never editable here); `event` = the event that runs
   * the job (e.g. "user.registration_completed"), with no timer.
   */
  defaultIntervalMs?: number;
  dailyAt?: DailyTime;
  cron?: { expression: string; timezone?: string | null };
  event?: string;
  /** Whether the Scheduler page lets an admin change when the job runs. */
  cadenceEditable: boolean;
  /** Smallest interval an admin may pick (interval jobs). Defaults to 1 minute. */
  minIntervalMs?: number;
  /** Delay before the first run after boot (interval jobs). Defaults to one full interval. */
  firstRunDelayMs?: number;
  /** Run on one server copy at a time (the injected lock). */
  singleInstance?: boolean;
  /** In-app link to where this job's schedule (or, for an event job, its content) is edited. */
  editPath?: string;
  /**
   * The work. Throw to record a failed run. Required for timer jobs; an
   * event job passes each occurrence's work to `fireEventJob()` instead.
   */
  task?: () => Promise<JobOutcome | void>;
}

export interface JobRunResult {
  /** True when a run row was written (the run did work or failed). */
  recorded: boolean;
  status: "success" | "skipped" | "error";
  message?: string;
}

export interface JobState {
  key: string;
  category: JobCategory;
  label: string;
  scheduleType: JobScheduleType;
  /** Interval jobs only; null for daily and cron jobs. */
  defaultIntervalMs: number | null;
  intervalMs: number | null;
  minIntervalMs: number;
  /** Daily jobs only. */
  defaultDailyAt: DailyTime | null;
  dailyAt: DailyTime | null;
  /** Daily and cron jobs: the timezone the clock time is read in. */
  timezone: string | null;
  /** Daily and cron jobs: the cron expression the schedule resolves to. */
  cronExpression: string | null;
  /** Event jobs: the event that runs the job. */
  eventKey: string | null;
  cadenceEditable: boolean;
  editPath: string | null;
  enabled: boolean;
  notifyOnError: boolean;
  running: boolean;
  nextRunAt: string | null;
}

export type JobConfigOverrides = Partial<
  Pick<JobConfig, "enabled" | "intervalMs" | "scheduleHour" | "scheduleMinute" | "timezone" | "notifyOnError">
>;

export type LockResult<T> = { acquired: true; value: T } | { acquired: false };

export interface JobSchedulerDeps {
  loadConfigs?: () => Promise<JobConfig[]>;
  recordRun?: (run: InsertJobRun) => Promise<void>;
  /** Called after a failed run is recorded (error emails). */
  onRunFailed?: (jobKey: string, message: string) => Promise<void>;
  /** Run `fn` while holding a cross-replica lock on the job; `acquired: false` if another copy holds it. */
  withLock?: <T>(jobKey: string, fn: () => Promise<T>) => Promise<LockResult<T>>;
  /** Claim one clock-time slot for this copy; false when another copy already ran it. */
  claimSlot?: (jobKey: string, slot: Date) => Promise<boolean>;
}

const DEFAULT_MIN_INTERVAL_MS = 60_000;
// setTimeout overflows above 2^31-1 ms (~24.8 days); a cron job further out
// than that is armed in steps and re-checked.
const MAX_TIMER_MS = 2 ** 31 - 1;

interface Registered {
  def: JobDefinition;
  timer: NodeJS.Timeout | null;
  nextRunAt: number | null;
}

const jobs = new Map<string, Registered>();
const configCache = new Map<string, JobConfigOverrides>();
// Keyed by job, not registration, so re-registering a job mid-run (a
// Salesforce policy edit) can't start a second, overlapping run.
const runningKeys = new Set<string>();
let deps: JobSchedulerDeps = {};
let recordFailureLogged = false;

/** The server's own timezone: the default for daily jobs. */
export function serverTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function configureJobScheduler(next: JobSchedulerDeps): void {
  deps = next;
  recordFailureLogged = false;
}

/** Replace the cached `job_config` overrides (boot and periodic refresh). */
export function setJobConfigs(rows: Array<JobConfigOverrides & { jobKey: string }>): void {
  const previous = new Map(configCache);
  configCache.clear();
  for (const row of rows) {
    configCache.set(row.jobKey, {
      enabled: row.enabled,
      intervalMs: row.intervalMs,
      scheduleHour: row.scheduleHour,
      scheduleMinute: row.scheduleMinute,
      timezone: row.timezone,
      notifyOnError: row.notifyOnError,
    });
  }
  // A clock time saved on another replica moves this copy's timer too.
  for (const entry of jobs.values()) {
    if (scheduleTypeOf(entry.def) !== "daily") continue;
    if (clockKey(previous.get(entry.def.key)) !== clockKey(configCache.get(entry.def.key))) armClock(entry);
  }
}

function clockKey(cfg: JobConfigOverrides | undefined): string {
  return `${cfg?.scheduleHour ?? ""}:${cfg?.scheduleMinute ?? ""}:${cfg?.timezone ?? ""}`;
}

export async function refreshJobConfigs(): Promise<void> {
  if (!deps.loadConfigs) return;
  try {
    setJobConfigs(await deps.loadConfigs());
  } catch (err) {
    // Keep the last known overrides; a transient read failure must not
    // flip every job back to its defaults.
    console.warn("[Scheduler] Failed to refresh job config:", err instanceof Error ? err.message : err);
  }
}

function scheduleTypeOf(def: JobDefinition): JobScheduleType {
  if (def.event) return "event";
  if (def.cron) return "cron";
  if (def.dailyAt) return "daily";
  return "interval";
}

function effectiveIntervalMs(entry: Registered): number {
  const fallback = entry.def.defaultIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const override = configCache.get(entry.def.key)?.intervalMs;
  const min = entry.def.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  if (override && entry.def.cadenceEditable && override >= min) return override;
  return fallback;
}

function effectiveDailyAt(entry: Registered): DailyTime | null {
  const base = entry.def.dailyAt;
  if (!base) return null;
  if (!entry.def.cadenceEditable) return base;
  const cfg = configCache.get(entry.def.key);
  const hour = cfg?.scheduleHour;
  const minute = cfg?.scheduleMinute;
  return {
    hour: hour != null && hour >= 0 && hour <= 23 ? hour : base.hour,
    minute: minute != null && minute >= 0 && minute <= 59 ? minute : base.minute,
  };
}

function effectiveTimezone(entry: Registered): string | null {
  const type = scheduleTypeOf(entry.def);
  if (type === "interval" || type === "event") return null;
  if (type === "cron") return entry.def.cron?.timezone || serverTimezone();
  const override = entry.def.cadenceEditable ? configCache.get(entry.def.key)?.timezone : null;
  return override && isValidTimezone(override) ? override : serverTimezone();
}

function effectiveCron(entry: Registered): string | null {
  if (entry.def.cron) return entry.def.cron.expression;
  const daily = effectiveDailyAt(entry);
  return daily ? `${daily.minute} ${daily.hour} * * *` : null;
}

/** Next clock-time slot strictly after `after`, or null for an invalid schedule. */
function nextClockRun(entry: Registered, after: Date): Date | null {
  const expression = effectiveCron(entry);
  if (!expression) return null;
  try {
    const cron = new Cron(expression, { timezone: effectiveTimezone(entry) ?? undefined, paused: true });
    const next = cron.nextRun(after);
    cron.stop();
    return next ?? null;
  } catch (err) {
    console.warn(`[Scheduler] Job ${entry.def.key} has an invalid schedule:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function isEnabled(key: string): boolean {
  return configCache.get(key)?.enabled ?? true;
}

function setTimer(entry: Registered, delayMs: number, fn: () => void): void {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    entry.timer = null;
    fn();
  }, Math.min(Math.max(0, delayMs), MAX_TIMER_MS));
  if (typeof entry.timer.unref === "function") entry.timer.unref();
}

function armInterval(entry: Registered, delayMs: number): void {
  entry.nextRunAt = Date.now() + delayMs;
  setTimer(entry, delayMs, () => void tickInterval(entry));
}

async function tickInterval(entry: Registered): Promise<void> {
  // Re-arm first so the cadence is fixed-rate (setInterval semantics) and a
  // slow run can't push every later run back.
  armInterval(entry, effectiveIntervalMs(entry));
  if (!isEnabled(entry.def.key)) return;
  await execute(entry, "scheduled");
}

function armClock(entry: Registered, after: Date = new Date()): void {
  const next = nextClockRun(entry, after);
  if (!next) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.nextRunAt = null;
    return;
  }
  const slot = next.getTime();
  entry.nextRunAt = slot;
  setTimer(entry, slot - Date.now(), () => {
    // A slot more than ~24.8 days out is reached in steps.
    if (Date.now() < slot) {
      armClock(entry);
      return;
    }
    void tickClock(entry, next);
  });
}

async function tickClock(entry: Registered, slot: Date): Promise<void> {
  armClock(entry, slot);
  if (!isEnabled(entry.def.key)) return;
  await execute(entry, "scheduled", undefined, slot);
}

async function execute(
  entry: Registered,
  source: JobRunSource,
  triggeredBy?: string,
  slot?: Date,
): Promise<JobRunResult> {
  const key = entry.def.key;
  if (runningKeys.has(key)) {
    return { recorded: false, status: "skipped", message: "already_running" };
  }
  runningKeys.add(key);
  try {
    if (slot && deps.claimSlot) {
      let claimed = true;
      try {
        claimed = await deps.claimSlot(entry.def.key, slot);
      } catch (err) {
        // Can't tell whether another copy ran it: run rather than miss it.
        console.warn(`[Scheduler] Could not claim ${entry.def.key} slot:`, err instanceof Error ? err.message : err);
      }
      if (!claimed) return { recorded: false, status: "skipped", message: "claimed_elsewhere" };
    }
    if (entry.def.singleInstance && deps.withLock) {
      const startedAt = new Date();
      let locked: LockResult<JobRunResult>;
      try {
        locked = await deps.withLock(entry.def.key, () => runAndRecord(entry, source, triggeredBy));
      } catch (err) {
        // The lock itself failed (no connection): that is a failed run.
        return fail(entry, source, triggeredBy, startedAt, err);
      }
      if (!locked.acquired) return { recorded: false, status: "skipped", message: "already_running" };
      return locked.value;
    }
    return await runAndRecord(entry, source, triggeredBy);
  } finally {
    runningKeys.delete(key);
  }
}

async function runAndRecord(
  entry: Registered,
  source: JobRunSource,
  triggeredBy?: string,
  task: (() => Promise<JobOutcome | void>) | undefined = entry.def.task,
): Promise<JobRunResult> {
  const startedAt = new Date();
  try {
    if (!task) throw new Error(`Job ${entry.def.key} has no task`);
    const outcome = (await task()) ?? { status: "success" as const };
    if (outcome.status === "skipped") {
      return { recorded: false, status: "skipped", message: outcome.message };
    }
    const recorded = await record(entry.def.key, {
      status: "success",
      source,
      startedAt,
      message: outcome.message ?? null,
      itemsProcessed: outcome.itemsProcessed ?? null,
      triggeredBy: triggeredBy ?? null,
    });
    return { recorded, status: "success", message: outcome.message };
  } catch (err) {
    return fail(entry, source, triggeredBy, startedAt, err);
  }
}

async function fail(
  entry: Registered,
  source: JobRunSource,
  triggeredBy: string | undefined,
  startedAt: Date,
  err: unknown,
): Promise<JobRunResult> {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[Scheduler] Job ${entry.def.key} failed:`, message);
  const recorded = await record(entry.def.key, {
    status: "error",
    source,
    startedAt,
    message,
    itemsProcessed: null,
    triggeredBy: triggeredBy ?? null,
  });
  if (deps.onRunFailed) {
    deps.onRunFailed(entry.def.key, message).catch((notifyErr) =>
      console.error(`[Scheduler] Failure notification for ${entry.def.key} failed:`, notifyErr),
    );
  }
  return { recorded, status: "error", message };
}

async function record(
  jobKey: string,
  run: Omit<InsertJobRun, "jobKey" | "finishedAt" | "durationMs"> & { startedAt: Date },
): Promise<boolean> {
  if (!deps.recordRun) return false;
  const finishedAt = new Date();
  try {
    await deps.recordRun({
      ...run,
      jobKey,
      finishedAt,
      durationMs: finishedAt.getTime() - run.startedAt.getTime(),
    });
    recordFailureLogged = false;
    return true;
  } catch (err) {
    if (!recordFailureLogged) {
      console.warn("[Scheduler] Could not record job run:", err instanceof Error ? err.message : err);
      recordFailureLogged = true;
    }
    return false;
  }
}

/**
 * Register a job and arm its first run. Calling it again with the same key
 * replaces the previous registration (no stacked timers on hot reload, and
 * how a cron job owned elsewhere picks up a changed expression).
 */
export function scheduleJob(def: JobDefinition): void {
  const kinds = [def.defaultIntervalMs !== undefined, !!def.dailyAt, !!def.cron, !!def.event].filter(Boolean).length;
  if (kinds !== 1) {
    throw new Error(`Job ${def.key} must set exactly one of defaultIntervalMs, dailyAt, cron or event`);
  }
  if (!def.event && !def.task) {
    throw new Error(`Job ${def.key} needs a task`);
  }
  const existing = jobs.get(def.key);
  if (existing?.timer) clearTimeout(existing.timer);
  const entry: Registered = { def, timer: null, nextRunAt: null };
  jobs.set(def.key, entry);
  const type = scheduleTypeOf(def);
  if (type === "interval") {
    armInterval(entry, def.firstRunDelayMs ?? effectiveIntervalMs(entry));
  } else if (type !== "event") {
    armClock(entry);
  }
}

/** Stop and forget a job (tests, and jobs that shut themselves down). */
export function unscheduleJob(key: string): void {
  const entry = jobs.get(key);
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  jobs.delete(key);
}

export function isJobRegistered(key: string): boolean {
  return jobs.has(key);
}

/** English name for emails and logs. */
export function getJobLabel(key: string): string {
  return jobs.get(key)?.def.label ?? key;
}

/**
 * Run a job right now (the page's Run now button). Ignores the on/off
 * switch. An event job only runs when its event happens, so it returns
 * `skipped` with the message "event_job".
 */
export async function runJobNow(key: string, triggeredBy?: string): Promise<JobRunResult | null> {
  const entry = jobs.get(key);
  if (!entry) return null;
  if (entry.def.event) return { recorded: false, status: "skipped", message: "event_job" };
  return execute(entry, "manual", triggeredBy);
}

/**
 * Run one occurrence of an event job (e.g. one Welcome email). Honors the
 * on/off switch, then records the run and sends the error email like a
 * scheduled run. Occurrences may run side by side: each is its own piece
 * of work, so there is no overlap guard. With the job not registered (no
 * database at boot, unit tests) the work runs on the job's defaults.
 */
export async function fireEventJob(key: string, task: () => Promise<JobOutcome | void>): Promise<JobRunResult> {
  if (!isEnabled(key)) return { recorded: false, status: "skipped", message: "disabled" };
  const entry: Registered = jobs.get(key) ?? {
    def: { key, category: "system", event: key, cadenceEditable: false },
    timer: null,
    nextRunAt: null,
  };
  return runAndRecord(entry, "event", undefined, task);
}

/**
 * Apply a just-saved config change in this process without waiting for
 * the next refresh. A shorter interval takes effect now and a longer one
 * from the next run; a changed clock time moves the next run right away.
 */
export function applyJobConfig(key: string, overrides: JobConfigOverrides): void {
  configCache.set(key, { ...configCache.get(key), ...overrides });
  const entry = jobs.get(key);
  if (!entry) return;
  const type = scheduleTypeOf(entry.def);
  if (type === "event") return;
  if (type !== "interval") {
    armClock(entry);
    return;
  }
  if (entry.nextRunAt === null) return;
  const interval = effectiveIntervalMs(entry);
  if (Date.now() + interval < entry.nextRunAt) armInterval(entry, interval);
}

export function getJobState(key: string): JobState | null {
  const entry = jobs.get(key);
  if (!entry) return null;
  const type = scheduleTypeOf(entry.def);
  return {
    key,
    category: entry.def.category,
    label: entry.def.label ?? key,
    scheduleType: type,
    defaultIntervalMs: type === "interval" ? (entry.def.defaultIntervalMs ?? null) : null,
    intervalMs: type === "interval" ? effectiveIntervalMs(entry) : null,
    minIntervalMs: entry.def.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS,
    defaultDailyAt: entry.def.dailyAt ?? null,
    dailyAt: effectiveDailyAt(entry),
    timezone: effectiveTimezone(entry),
    cronExpression: type === "interval" || type === "event" ? null : effectiveCron(entry),
    eventKey: entry.def.event ?? null,
    cadenceEditable: entry.def.cadenceEditable,
    editPath: entry.def.editPath ?? null,
    enabled: isEnabled(key),
    notifyOnError: configCache.get(key)?.notifyOnError ?? false,
    running: runningKeys.has(key),
    nextRunAt: entry.nextRunAt === null ? null : new Date(entry.nextRunAt).toISOString(),
  };
}

export function listJobStates(): JobState[] {
  return Array.from(jobs.keys())
    .map((key) => getJobState(key))
    .filter((s): s is JobState => s !== null);
}

/** Test helper: drop every job, override and injected dependency. */
export function resetJobSchedulerForTests(): void {
  for (const entry of jobs.values()) {
    if (entry.timer) clearTimeout(entry.timer);
  }
  jobs.clear();
  configCache.clear();
  runningKeys.clear();
  deps = {};
  recordFailureLogged = false;
}
