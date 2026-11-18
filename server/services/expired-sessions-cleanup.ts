/**
 * Daily background prune of expired rows from the Postgres-backed
 * `sessions` table (Task #737).
 *
 * Why this exists: when the app runs against a Postgres-backed
 * session store (production, see `chooseSessionStore` in
 * `server/auth/session-config.ts`), connect-pg-simple's per-process
 * prune timer is the only thing that drops rows whose `expire`
 * timestamp has passed. That timer dies the moment the process is
 * replaced (rolling deploy, OOM kill, container restart) and starts
 * over from zero in the new process — so on a long-lived deployment
 * with frequent restarts the table just accumulates expired rows
 * forever, slowing down the `WHERE sid = $1` lookup that runs on
 * EVERY authenticated request.
 *
 * The Task #724 SESSION_SECRET-rotation handler already issues a
 * one-shot `DELETE FROM "sessions"` on rotation, but that is best-
 * effort and only fires when an admin clicks the rotate button in
 * the secrets panel. In normal operation we need a recurring sweep
 * that does not depend on which replica happens to be up at the
 * time.
 *
 * Behavior:
 *  - Runs `DELETE FROM "sessions" WHERE expire < NOW()` once per
 *    interval (default 24 h, override with
 *    `SESSIONS_CLEANUP_INTERVAL_HOURS=N`).
 *  - First run fires shortly after boot (default 60 s, override with
 *    `SESSIONS_CLEANUP_FIRST_RUN_DELAY_MS`) so operators can confirm
 *    the job is wired up without waiting a full day, and so the
 *    table is in a clean state immediately after a fresh deploy.
 *  - Logs the row count and elapsed ms on every tick:
 *      `[Sessions Cleanup] Pruned N expired session rows in Mms`
 *  - Skips ticks while the DB pool is in a known-bad state
 *    (`dbHealth.reachable === false`) so the job does not spam
 *    errors during outages — same pattern the EmailScheduler uses.
 *  - Idempotent. Concurrent ticks across replicas are safe — the
 *    DELETE has no side effects beyond removing rows that are
 *    already invalid.
 */

import { dbReady, pool as defaultPool } from "../db";
import { chooseSessionStore } from "../auth/session-config";
import type { DatabasePool } from "../lib/db-driver";
import { getJobState, scheduleJob, unscheduleJob, type JobOutcome } from "./jobs/scheduler";

/** Key on Configuration › Scheduler. */
export const SESSIONS_CLEANUP_JOB_KEY = "sessions_cleanup";

const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_FIRST_RUN_DELAY_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

let skipLoggedUnreachable = false;

/**
 * Live snapshot of the most recent prune attempt, exposed via
 * `getLastPruneSnapshot()` so the admin System Health surface can
 * answer "did the daily sweep actually run last night?" without
 * tailing the server log (Task #745). Mutated in-place by
 * `runScheduledTick` and reset by `stopExpiredSessionsCleanup`.
 *
 * Why module-scope state instead of pushing each tick into a DB
 * table: the prune fires once a day, the snapshot is read on demand
 * by `/api/system/health`, and we explicitly do NOT want a
 * persistence dependency on the very table the job is meant to
 * keep small. A per-process in-memory ref is good enough — the
 * contract is "what did THIS replica do most recently", and
 * operators reading the dashboard already pin themselves to a
 * single replica via the load balancer for the duration of a click.
 */
export interface LastPruneSnapshot {
  /** ISO timestamp of the most recent tick attempt (success or failure). */
  lastRunAt: string | null;
  /**
   * ISO timestamp of the most recent SUCCESSFUL tick. Distinct from
   * `lastRunAt` so the dashboard can show "last successful prune: N
   * rows, X ago" without mis-labeling a previous success with a
   * later failure's timestamp (Task #745 review feedback).
   */
  lastSuccessAt: string | null;
  /** Rows removed on the most recent SUCCESSFUL tick (paired with `lastSuccessAt`). */
  lastRowsPruned: number | null;
  /** Wall-clock duration of the most recent tick in milliseconds. */
  lastDurationMs: number | null;
  /** Error message captured from the most recent FAILED tick. */
  lastError: string | null;
  /**
   * ISO timestamp of the next scheduled tick. Set on `startExpiredSessionsCleanup`
   * (now + firstRunDelayMs) and recomputed after every tick (now + intervalMs)
   * so the dashboard can render an ETA without knowing the schedule itself.
   */
  nextRunAt: string | null;
  /** Configured tick interval in ms (null when scheduler is not running). */
  intervalMs: number | null;
  /**
   * True when the most recent tick was a no-op because
   * `dbHealth.reachable === false`. Operators use this to disambiguate
   * "the job is healthy but the DB just came back" from "the job
   * pruned 0 rows last night because the table was already clean".
   */
  skippedDueToUnreachableDb: boolean;
  /** True when the scheduler has been wired up (timers installed). */
  schedulerActive: boolean;
}

const EMPTY_SNAPSHOT: LastPruneSnapshot = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastRowsPruned: null,
  lastDurationMs: null,
  lastError: null,
  nextRunAt: null,
  intervalMs: null,
  skippedDueToUnreachableDb: false,
  schedulerActive: false,
};

let lastPruneSnapshot: LastPruneSnapshot = { ...EMPTY_SNAPSHOT };

/**
 * Read-only view of the most recent prune attempt. Returns a copy so
 * a caller can't accidentally mutate the cached state. Always defined
 * — when no tick has run yet, every numeric / string field is `null`
 * and the dashboard renders the "never run" state.
 */
export function getLastPruneSnapshot(): LastPruneSnapshot {
  return { ...lastPruneSnapshot };
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const hours = parsePositiveNumber(env.SESSIONS_CLEANUP_INTERVAL_HOURS);
  return (hours ?? DEFAULT_INTERVAL_HOURS) * HOUR_MS;
}

function resolveFirstRunDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const ms = parsePositiveNumber(env.SESSIONS_CLEANUP_FIRST_RUN_DELAY_MS);
  return ms ?? DEFAULT_FIRST_RUN_DELAY_MS;
}

/**
 * One-shot prune of expired rows. Returns the number of rows
 * removed. Throws on driver / SQL errors so callers can decide
 * whether to log-and-swallow (the scheduled tick) or rethrow (a
 * future admin-triggered manual prune).
 */
export async function pruneExpiredSessions(
  pool: DatabasePool = defaultPool,
): Promise<number> {
  if (!pool) {
    throw new Error("pruneExpiredSessions: pool is not initialized");
  }
  const result = await pool.query(
    'DELETE FROM "sessions" WHERE expire < NOW()',
  );
  return result.rowCount ?? 0;
}

/**
 * Admin-triggered "Run now" prune (Task #752). Runs the same
 * `pruneExpiredSessions()` SQL as `runScheduledTick` and stamps the
 * snapshot's `lastRunAt` / `lastSuccessAt` / `lastRowsPruned` /
 * `lastDurationMs` / `lastError`, but deliberately leaves
 * `nextRunAt` / `intervalMs` / `schedulerActive` and the
 * setInterval handle alone so the daily tick keeps its cadence.
 * Skips the `dbHealth.reachable` short-circuit so the operator
 * sees the real driver error if the DB is still down. Throws on
 * driver errors after stamping `lastError`.
 */
export async function runManualPrune(
  pool: DatabasePool = defaultPool,
): Promise<{ rowsPruned: number; durationMs: number }> {
  const startedAt = Date.now();
  try {
    const removed = await pruneExpiredSessions(pool);
    const elapsed = Date.now() - startedAt;
    const finishedAt = new Date().toISOString();
    lastPruneSnapshot.lastRunAt = finishedAt;
    lastPruneSnapshot.lastSuccessAt = finishedAt;
    lastPruneSnapshot.lastRowsPruned = removed;
    lastPruneSnapshot.lastDurationMs = elapsed;
    lastPruneSnapshot.lastError = null;
    lastPruneSnapshot.skippedDueToUnreachableDb = false;
    console.log(
      `[Sessions Cleanup] Manual prune removed ${removed} expired session row${removed === 1 ? "" : "s"} in ${elapsed}ms`,
    );
    return { rowsPruned: removed, durationMs: elapsed };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    lastPruneSnapshot.lastRunAt = new Date().toISOString();
    lastPruneSnapshot.lastDurationMs = elapsed;
    lastPruneSnapshot.lastError =
      err instanceof Error ? err.message : String(err);
    console.error(
      `[Sessions Cleanup] Manual prune failed after ${elapsed}ms:`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
}

function bumpNextRunAt(): void {
  // Recompute `nextRunAt` from the current intervalMs after every
  // tick (success, failure, or skipped) so the dashboard's "next
  // run" ETA stays accurate even when ticks were short-circuited.
  // The Scheduler owns the cadence (an admin may have changed it on
  // Configuration › Scheduler), so read it from there when registered.
  const state = getJobState(SESSIONS_CLEANUP_JOB_KEY);
  if (state) {
    lastPruneSnapshot.intervalMs = state.intervalMs;
    lastPruneSnapshot.nextRunAt = state.nextRunAt;
    return;
  }
  if (lastPruneSnapshot.intervalMs !== null) {
    lastPruneSnapshot.nextRunAt = new Date(
      Date.now() + lastPruneSnapshot.intervalMs,
    ).toISOString();
  }
}

async function runScheduledTick(): Promise<JobOutcome> {
  // Mirror the EmailScheduler short-circuit (server/services/scheduler.ts):
  // when the pool is in a known-bad state, skip the tick so we don't
  // emit a fresh stack trace every interval. Logged once on the
  // transition into / out of the unreachable state.
  const { dbHealth } = await import("../lib/db-probe");
  if (!dbHealth.reachable) {
    if (!skipLoggedUnreachable) {
      console.warn(
        "[Sessions Cleanup] DB unreachable, skipping prune until recovery",
      );
      skipLoggedUnreachable = true;
    }
    lastPruneSnapshot.skippedDueToUnreachableDb = true;
    bumpNextRunAt();
    return { status: "skipped", message: "database_unreachable" };
  }
  if (skipLoggedUnreachable) {
    console.log("[Sessions Cleanup] DB reachable again, resuming");
    skipLoggedUnreachable = false;
  }
  lastPruneSnapshot.skippedDueToUnreachableDb = false;

  const startedAt = Date.now();
  try {
    const removed = await pruneExpiredSessions();
    const elapsed = Date.now() - startedAt;
    const finishedAt = new Date().toISOString();
    lastPruneSnapshot.lastRunAt = finishedAt;
    lastPruneSnapshot.lastSuccessAt = finishedAt;
    lastPruneSnapshot.lastRowsPruned = removed;
    lastPruneSnapshot.lastDurationMs = elapsed;
    lastPruneSnapshot.lastError = null;
    console.log(
      `[Sessions Cleanup] Pruned ${removed} expired session row${removed === 1 ? "" : "s"} in ${elapsed}ms`,
    );
    return { status: "success", itemsProcessed: removed };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    lastPruneSnapshot.lastRunAt = new Date().toISOString();
    lastPruneSnapshot.lastDurationMs = elapsed;
    lastPruneSnapshot.lastError =
      err instanceof Error ? err.message : String(err);
    console.error(
      `[Sessions Cleanup] Prune failed after ${elapsed}ms:`,
      err instanceof Error ? err.message : err,
    );
    // Rethrow so the Scheduler records the failed run; it logs and keeps
    // the job on its cadence.
    throw err;
  } finally {
    bumpNextRunAt();
  }
}

export interface StartExpiredSessionsCleanupOptions {
  /** Override the env-derived interval. Useful for tests. */
  intervalMs?: number;
  /** Override the env-derived first-run delay. Useful for tests. */
  firstRunDelayMs?: number;
}

/**
 * Wire up the daily prune timer. No-op when:
 *  - The DB has not been provisioned yet (`dbReady === false`) — the
 *    setup wizard is being served, there is no `sessions` table
 *    to prune.
 *  - The active session store is not Postgres (dev / setup-only mode
 *    runs MemoryStore, which has its own per-process `checkPeriod`).
 *
 * Safe to call more than once: the second call clears the previous
 * timers before installing fresh ones, so a hot-reload during dev
 * does not stack handlers.
 */
export function startExpiredSessionsCleanup(
  options: StartExpiredSessionsCleanupOptions = {},
): void {
  if (!dbReady) {
    console.log(
      "[Sessions Cleanup] Skipping: no database configured (setup wizard mode)",
    );
    return;
  }
  if (chooseSessionStore(process.env) !== "postgres") {
    console.log(
      "[Sessions Cleanup] Skipping: session store is not Postgres-backed",
    );
    return;
  }

  const intervalMs = options.intervalMs ?? resolveIntervalMs();
  const firstRunDelayMs = options.firstRunDelayMs ?? resolveFirstRunDelayMs();

  // Stamp the snapshot so the System Health surface (Task #745) can
  // render a meaningful "next run" ETA *before* the first tick has
  // fired. `lastRunAt` / `lastRowsPruned` stay null until the tick
  // actually runs — the dashboard distinguishes "scheduled, never
  // run yet" from "ran successfully" by checking those fields.
  lastPruneSnapshot.intervalMs = intervalMs;
  lastPruneSnapshot.schedulerActive = true;
  lastPruneSnapshot.nextRunAt = new Date(
    Date.now() + firstRunDelayMs,
  ).toISOString();

  // Registering again replaces the previous registration, so a hot
  // reload during dev does not stack handlers.
  scheduleJob({
    key: SESSIONS_CLEANUP_JOB_KEY,
    category: "system",
    label: "Expired sessions cleanup",
    defaultIntervalMs: intervalMs,
    cadenceEditable: true,
    minIntervalMs: HOUR_MS,
    firstRunDelayMs,
    task: runScheduledTick,
  });

  const intervalHours = intervalMs / HOUR_MS;
  console.log(
    `[Sessions Cleanup] Scheduler started (every ${intervalHours}h, first run in ${Math.round(firstRunDelayMs / 1000)}s)`,
  );
}

/**
 * Tear down both timers. Used by tests so they can swap in a fresh
 * scheduler between cases without bleeding handlers across the test
 * file.
 */
export function stopExpiredSessionsCleanup(): void {
  unscheduleJob(SESSIONS_CLEANUP_JOB_KEY);
  skipLoggedUnreachable = false;
  lastPruneSnapshot = { ...EMPTY_SNAPSHOT };
}
