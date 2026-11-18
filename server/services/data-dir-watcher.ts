/**
 * Periodic data-directory writability watcher (Task #769).
 *
 * Why this exists: Task #741 added the boot-time + per-health-check
 * `checkDataDirWritable()` probe so the System Health dashboard can
 * show "data dir not writable" inline. But that signal is purely
 * pull-based — operators only learn about a degraded mount when they
 * happen to load the dashboard, OR when an admin action that needs
 * the file (promote / regenerate / unmanage SESSION_SECRET or
 * ENCRYPTION_KEY, or any edit to `data/db-config.json`'s connections
 * list) fails with `data_dir_not_writable`. On a long-lived
 * deployment whose disk fills up overnight nobody notices until the
 * next admin click.
 *
 * This watcher closes that gap by polling the probe in the
 * background and pushing a notification on every state TRANSITION:
 *
 *   writable → NOT writable: page every approved Admin via SMTP
 *                            and surface a dashboard banner.
 *   NOT writable → writable: send a matching "all clear" follow-up
 *                            so the inbox thread has a clean open /
 *                            close pair, and clear the banner.
 *
 * Behaviour:
 *  - Polls every `DATA_DIR_WATCHER_INTERVAL_MS` (default 5 min) with
 *    a first-run after `DATA_DIR_WATCHER_FIRST_RUN_DELAY_MS` (default
 *    30 s) so the operator can confirm the watcher is wired up
 *    without waiting for the full interval.
 *  - Emails fire on STATE CHANGE only, not on every probe — a
 *    healthy directory generates zero email traffic.
 *  - Per-state dedupe: if the directory flaps (probe succeeds, fails,
 *    succeeds, fails inside a single hour) we send AT MOST one email
 *    per state per `DATA_DIR_WATCHER_DEDUPE_MS` (default 1 hour).
 *    This stops a marginal disk from spamming Admin inboxes.
 *  - The banner reflects the most recent probe result the moment it
 *    completes, regardless of dedupe — operators looking at the
 *    dashboard always see the truth, the dedupe only gates the
 *    outbound mail.
 *  - Idempotent across replicas: every replica runs its own watcher.
 *    The mail traffic this generates IS proportional to the number of
 *    replicas (a 3-replica deploy will send 3 alerts when the shared
 *    volume goes read-only) — same posture as the migration-failure
 *    emailer. The cost (3 emails) is far better than the alternative
 *    (none).
 *  - Best-effort: probe + email both swallow their own errors and log
 *    with stable prefixes (`[data-dir-watcher]` / `[data-dir-alert:*]`).
 *    A flaky probe must NEVER crash the host process.
 */

import {
  checkDataDirWritable,
  type DataDirHealth,
} from "../lib/data-dir-health";
import {
  sendDataDirReadOnlyEmail,
  sendDataDirRecoveryEmail,
} from "../lib/data-dir-alert-emailer";
import { scheduleJob, unscheduleJob, type JobOutcome } from "./jobs/scheduler";

/** Key on Configuration › Scheduler. */
export const DATA_DIR_WATCHER_JOB_KEY = "data_dir_watcher";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FIRST_RUN_DELAY_MS = 30 * 1000;
const DEFAULT_DEDUPE_MS = 60 * 60 * 1000;


/**
 * Live snapshot of the most recent probe + the watcher's notification
 * state. Read by the admin dashboard banner endpoint. Always defined
 * — when the watcher has not run yet, `lastChecked` is null and the
 * banner renders nothing.
 */
export interface DataDirWatcherSnapshot {
  /** Most recent probe result (true === writable). */
  ok: boolean | null;
  /** Resolved data dir path. */
  dataDir: string | null;
  /** Diagnostic from the most recent probe (only set when !ok). */
  reason: string | null;
  /** ISO timestamp of the most recent probe attempt. */
  lastChecked: string | null;
  /** ISO timestamp of the most recent state TRANSITION (either direction). */
  lastTransitionAt: string | null;
  /** ISO timestamp of the most recent email we actually dispatched. */
  lastNotifiedAt: string | null;
  /**
   * Direction of the most recent dispatched email so the dashboard can
   * say "last alerted: read-only at 14:02" vs "last alerted: recovered
   * at 14:09" without inferring it from the current state.
   */
  lastNotifiedKind: "read_only" | "recovery" | null;
  /** True once the scheduler has installed its timers. */
  schedulerActive: boolean;
}

const EMPTY_SNAPSHOT: DataDirWatcherSnapshot = {
  ok: null,
  dataDir: null,
  reason: null,
  lastChecked: null,
  lastTransitionAt: null,
  lastNotifiedAt: null,
  lastNotifiedKind: null,
  schedulerActive: false,
};

let snapshot: DataDirWatcherSnapshot = { ...EMPTY_SNAPSHOT };

// Per-state last-notify timestamps used by the dedupe gate. Distinct
// keys (rather than a single "last alert sent" stamp) so a directory
// that flaps writable→not→writable→not in the same hour still gets
// the read-only alert AND the recovery alert exactly once each per
// dedupe window for THAT state, instead of the second pair being
// fully suppressed because the previous-direction notification used
// up the only slot.
const lastNotifiedAtByKind: {
  read_only: number | null;
  recovery: number | null;
} = { read_only: null, recovery: null };

/** Read-only view of the most recent watcher state. Returns a copy. */
export function getDataDirWatcherSnapshot(): DataDirWatcherSnapshot {
  return { ...snapshot };
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveNumber(env.DATA_DIR_WATCHER_INTERVAL_MS) ?? DEFAULT_INTERVAL_MS;
}

function resolveFirstRunDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  return (
    parsePositiveNumber(env.DATA_DIR_WATCHER_FIRST_RUN_DELAY_MS) ??
    DEFAULT_FIRST_RUN_DELAY_MS
  );
}

function resolveDedupeMs(env: NodeJS.ProcessEnv = process.env): number {
  return parsePositiveNumber(env.DATA_DIR_WATCHER_DEDUPE_MS) ?? DEFAULT_DEDUPE_MS;
}

export interface StartDataDirWatcherOptions {
  /** Override the env-derived interval. Useful for tests. */
  intervalMs?: number;
  /** Override the env-derived first-run delay. Useful for tests. */
  firstRunDelayMs?: number;
  /** Override the env-derived dedupe window. Useful for tests. */
  dedupeMs?: number;
  /** Inject a probe (tests). Defaults to `checkDataDirWritable`. */
  probe?: () => DataDirHealth;
  /** Inject the read-only emailer (tests). */
  notifyReadOnly?: typeof sendDataDirReadOnlyEmail;
  /** Inject the recovery emailer (tests). */
  notifyRecovery?: typeof sendDataDirRecoveryEmail;
  /** Inject a clock (tests). Defaults to `() => Date.now()`. */
  now?: () => number;
}

let activeOptions: Required<
  Pick<StartDataDirWatcherOptions, "dedupeMs" | "probe" | "notifyReadOnly" | "notifyRecovery" | "now">
> | null = null;

/**
 * Wire up the periodic data-dir watcher. Safe to call more than once:
 * the second call clears prior timers before installing fresh ones, so
 * a hot-reload during dev does not stack handlers.
 */
export function startDataDirWatcher(options: StartDataDirWatcherOptions = {}): void {
  const intervalMs = options.intervalMs ?? resolveIntervalMs();
  const firstRunDelayMs = options.firstRunDelayMs ?? resolveFirstRunDelayMs();

  activeOptions = {
    dedupeMs: options.dedupeMs ?? resolveDedupeMs(),
    probe: options.probe ?? checkDataDirWritable,
    notifyReadOnly: options.notifyReadOnly ?? sendDataDirReadOnlyEmail,
    notifyRecovery: options.notifyRecovery ?? sendDataDirRecoveryEmail,
    now: options.now ?? (() => Date.now()),
  };

  snapshot.schedulerActive = true;

  // Registering again replaces the previous registration, so a hot
  // reload during dev does not stack handlers.
  scheduleJob({
    key: DATA_DIR_WATCHER_JOB_KEY,
    category: "system",
    label: "Data folder check",
    defaultIntervalMs: intervalMs,
    cadenceEditable: true,
    firstRunDelayMs,
    task: runScheduledCheck,
  });

  const intervalMin = intervalMs / 60_000;
  console.log(
    `[data-dir-watcher] started (every ${intervalMin}m, first run in ${Math.round(firstRunDelayMs / 1000)}s)`,
  );
}

/**
 * Tear down the timers. Used by tests so they can swap in a fresh
 * watcher between cases without bleeding handlers across the file.
 */
export function stopDataDirWatcher(): void {
  unscheduleJob(DATA_DIR_WATCHER_JOB_KEY);
  snapshot = { ...EMPTY_SNAPSHOT };
  lastNotifiedAtByKind.read_only = null;
  lastNotifiedAtByKind.recovery = null;
  activeOptions = null;
}

/**
 * Run one probe + transition handling cycle. Exported so admin
 * surfaces (or tests) can force a fresh check on demand without
 * waiting for the next scheduled tick. Safe to call concurrently —
 * the probe itself is concurrency-safe and the snapshot mutation is
 * a single synchronous assignment.
 */
export async function runTick(): Promise<void> {
  if (!activeOptions) {
    // Watcher was never started (or has been stopped). The on-demand
    // call from the status endpoint is a no-op in that case — the
    // dashboard banner just renders the empty snapshot.
    return;
  }

  const { probe, notifyReadOnly, notifyRecovery, dedupeMs, now } = activeOptions;

  let result: DataDirHealth;
  try {
    result = probe();
  } catch (err) {
    // The probe itself is wrapped in try/catches at every fs call,
    // so reaching this branch means something truly unexpected
    // happened (out-of-memory, etc.). Log + bail rather than letting
    // an uncaught throw kill the interval.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[data-dir-watcher] probe crashed: ${message}`);
    return;
  }

  const checkedAt = new Date(now()).toISOString();
  const previousOk = snapshot.ok;
  const transitioned =
    previousOk !== null && previousOk !== result.ok;

  // ALWAYS update the snapshot — the dashboard banner reflects
  // current truth even on the steady-state branches that don't
  // dispatch email.
  snapshot.ok = result.ok;
  snapshot.dataDir = result.dataDir;
  snapshot.reason = result.ok ? null : result.reason ?? "Unknown error";
  snapshot.lastChecked = checkedAt;

  if (transitioned) {
    snapshot.lastTransitionAt = checkedAt;
  }

  // Decide whether to send. Two cases dispatch email:
  //   1. Genuine state transition (writable ↔ not-writable). Always
  //      attempted, but still gated by the per-state dedupe window
  //      below — a flapping mount that crosses the boundary multiple
  //      times in the same hour gets exactly one email per direction.
  //   2. Initial unhealthy boot: the watcher's very first probe
  //      finds the dir already not-writable. We DO send a one-shot
  //      alert here so an operator who started a fresh container
  //      against a misconfigured volume hears about it within
  //      minutes instead of waiting for a transition that may
  //      never come. The recovery direction has no equivalent —
  //      a first-probe-healthy boot is the steady state and
  //      generates no mail.
  let kind: "read_only" | "recovery" | null = null;
  if (transitioned) {
    kind = result.ok ? "recovery" : "read_only";
  } else if (previousOk === null && !result.ok) {
    kind = "read_only";
  }

  if (kind === null) return;

  const lastForKind = lastNotifiedAtByKind[kind];
  const nowMs = now();
  if (lastForKind !== null && nowMs - lastForKind < dedupeMs) {
    // Within the per-state dedupe window — banner already shows the
    // truth, skip the duplicate email.
    return;
  }

  try {
    const recipients =
      kind === "read_only"
        ? await notifyReadOnly({
            dataDir: result.dataDir,
            reason: result.reason ?? null,
            detectedAt: checkedAt,
          })
        : await notifyRecovery({
            dataDir: result.dataDir,
            detectedAt: checkedAt,
          });

    // Only stamp the dedupe marker when at least one admin actually
    // received the alert. The emailer returns 0 when SMTP is
    // unconfigured, no approved admin recipients exist, or the
    // transport rejected — in every one of those cases the next tick
    // SHOULD retry instead of getting silently suppressed for the
    // full dedupe window. A successful boot that pages 3 admins
    // genuinely consumes the slot; a no-op return means nothing was
    // delivered, so nothing should be deduped.
    if (recipients > 0) {
      lastNotifiedAtByKind[kind] = nowMs;
      snapshot.lastNotifiedAt = checkedAt;
      snapshot.lastNotifiedKind = kind;
    }
  } catch (err) {
    // The emailer already swallows its own errors and logs with the
    // `[data-dir-alert:*]` prefix, so this branch is defence-in-depth
    // for any future code path that learns to throw. We deliberately
    // do NOT update `lastNotifiedAtByKind` here so the next tick
    // retries the alert.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[data-dir-watcher] notify failed (${kind}): ${message}`);
  }
}

/**
 * The Scheduler's view of one check. A healthy folder with no change is a
 * quiet tick (no run row); an unwritable folder records a failed run so
 * the job shows as in error on Configuration › Scheduler; recovering
 * records a successful one.
 */
async function runScheduledCheck(): Promise<JobOutcome> {
  await runTick();
  if (snapshot.ok === false) {
    const folder = snapshot.dataDir ? `Data folder ${snapshot.dataDir}` : "Data folder";
    throw new Error(`${folder} is not writable: ${snapshot.reason ?? "unknown error"}`);
  }
  if (snapshot.ok === true && snapshot.lastTransitionAt !== null && snapshot.lastTransitionAt === snapshot.lastChecked) {
    return { status: "success", message: "recovered" };
  }
  return { status: "skipped" };
}

/** Test-only seam exposing the dedupe map for assertions. */
export const _internals = {
  resolveIntervalMs,
  resolveFirstRunDelayMs,
  resolveDedupeMs,
  getLastNotifiedAtByKind: () => ({ ...lastNotifiedAtByKind }),
};
