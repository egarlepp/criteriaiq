/**
 * Daily background prune of old rows from the `audit_logins` table
 * (Task #746).
 *
 * Why this exists: every `/api/login` attempt — successful or failed —
 * writes a row to `audit_logins` (see `server/auth/simpleAuth.ts`),
 * and nothing trims it. On a public deployment the brute-force noise
 * hitting `POST /api/login` is enough to add thousands of rows per
 * day forever, which makes the admin "recent logins" panel
 * (`SELECT … ORDER BY login_time DESC LIMIT N`) progressively slower
 * and bloats backups for no operator-facing reason. This is the same
 * shape of problem Task #737 fixed for the `sessions` table; this
 * job is the audit-logins sibling that runs alongside it.
 *
 * Behavior:
 *  - Runs `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL …`
 *    once per interval (default 24 h, override with
 *    `AUDIT_LOGINS_CLEANUP_INTERVAL_HOURS=N`).
 *  - The retention window defaults to 90 days (override with
 *    `AUDIT_LOGINS_RETENTION_DAYS=N`). Operators tightening this for
 *    GDPR can drop it as low
 *    as they like; setting it to a non-positive value falls back to
 *    the 90-day default rather than disabling the prune entirely
 *    (the failure mode of "table grows forever" is exactly what this
 *    job exists to prevent).
 *  - First run fires shortly after boot (default 60 s, override with
 *    `AUDIT_LOGINS_CLEANUP_FIRST_RUN_DELAY_MS`) so operators can
 *    confirm the job is wired up without waiting a full day.
 *  - Logs the row count and elapsed ms on every tick:
 *      `[Audit Logins Cleanup] Pruned N audit_logins rows older than 90 days in Mms`
 *  - Skips ticks while the DB pool is in a known-bad state
 *    (`dbHealth.reachable === false`) so the job does not spam
 *    errors during outages — same pattern the EmailScheduler and
 *    expired-sessions cleanup use.
 *  - Idempotent. Concurrent ticks across replicas are safe — the
 *    DELETE has no side effects beyond removing rows that are
 *    already past the retention window.
 *  - The `IDX_audit_logins_login_time` index (declared in
 *    `shared/schema/auth.ts` and installed by migration
 *    `048_audit_logins_login_time_idx.sql`) backs both the prune's
 *    `WHERE login_time < …` predicate and the admin panel's
 *    `ORDER BY login_time DESC` lookup.
 *  - On every successful tick the last-run timestamp + row count are
 *    UPSERTed into the `audit_logins_cleanup_state` singleton row
 *    (Task #757) so the Task #751 admin "Login history cleanup"
 *    panel survives process restarts and reflects the latest prune
 *    across all replicas, not just whichever replica happens to be
 *    serving the status request.
 */

import { dbReady, pool as defaultPool } from "../db";
import type { DatabasePool } from "../lib/db-driver";
import { scheduleJob, unscheduleJob, type JobOutcome } from "./jobs/scheduler";

/** Key on Configuration › Scheduler. */
export const AUDIT_LOGINS_CLEANUP_JOB_KEY = "audit_logins_cleanup";

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_FIRST_RUN_DELAY_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

let skipLoggedUnreachable = false;
// Latch so a recurring failure of the persisted-state SELECT (missing
// table on a really fresh install, permission flap, DB outage) does
// not produce one warn line per status poll. Cleared the moment a
// read succeeds, so the next failure after a recovery is logged
// fresh — same pattern the `dbHealth.reachable` gate already uses
// for the prune itself. Keeps an admin who left the System Health
// tab open from filling stdout with the same "Failed to read
// persisted state" line every 60 seconds.
let persistedReadFailureLogged = false;

/**
 * Last-run snapshot exposed via `getAuditLoginsCleanupStatus()` so the
 * System Health → Database admin surface can render "last pruned at
 * X, removed N rows, retention M days" without operators needing to
 * grep server logs (Task #751).
 *
 * The authoritative source for `lastRunAt` / `lastRemoved` is the
 * `audit_logins_cleanup_state` singleton row in Postgres (Task #757)
 * — the in-memory copy below is a write-through cache, refreshed by
 * `getAuditLoginsCleanupStatus()` on every read and updated locally
 * after every successful tick. The cache exists so the panel still
 * has *something* to render when the DB is unreachable (in which
 * case we surface the most recent values this replica has observed
 * rather than incorrectly downgrading to "Awaiting first run").
 *
 * `retentionDays` is set when the scheduler is started so the panel
 * can display the active window even before the first tick has fired
 * (i.e. during the configurable first-run delay window after boot).
 * It is intentionally process-local — different replicas can be
 * running with different `AUDIT_LOGINS_RETENTION_DAYS` env values
 * during a rolling deploy, and the panel should report the local
 * replica's active window rather than whichever replica wrote the
 * row last. It is cleared back to `null` by `stopAuditLoginsCleanup`
 * so test cases that re-start the scheduler with a fresh window
 * don't see stale state.
 */
interface AuditLoginsCleanupStatus {
  lastRunAt: string | null;
  lastRemoved: number | null;
  retentionDays: number | null;
}

const status: AuditLoginsCleanupStatus = {
  lastRunAt: null,
  lastRemoved: null,
  retentionDays: null,
};

/**
 * Read the persisted last-run snapshot from the
 * `audit_logins_cleanup_state` singleton row. Returns `null` when
 * the row is missing (fresh install before the seed migration has
 * run, or after a manual truncate) and lets the caller fall back to
 * whatever in-memory state it has.
 *
 * This helper does NOT throw — driver errors are caught and treated
 * the same as a missing row. The status surface that calls it must
 * still be able to render *something* during a DB outage; surfacing
 * the in-memory cache is a strictly better operator experience than
 * propagating a 500 to the panel for what is fundamentally a
 * read-only "show me the last prune" request.
 */
async function readPersistedSnapshot(
  pool: DatabasePool,
): Promise<{ lastRunAt: string | null; lastRemoved: number | null } | null> {
  try {
    const result = await pool.query(
      `SELECT "last_run_at", "last_removed" FROM "audit_logins_cleanup_state" WHERE "id" = 1`,
    );
    // Successful read → reset the failure latch so the next failure
    // after a recovery is logged fresh rather than being silently
    // swallowed by a stale latch.
    if (persistedReadFailureLogged) {
      persistedReadFailureLogged = false;
    }
    const row = result.rows?.[0] as
      | { last_run_at: Date | string | null; last_removed: number | null }
      | undefined;
    if (!row) return null;
    const rawRunAt = row.last_run_at;
    let lastRunAt: string | null = null;
    if (rawRunAt instanceof Date) {
      lastRunAt = rawRunAt.toISOString();
    } else if (typeof rawRunAt === "string" && rawRunAt.length > 0) {
      const parsed = new Date(rawRunAt);
      lastRunAt = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    const rawRemoved = row.last_removed;
    const lastRemoved =
      typeof rawRemoved === "number" && Number.isFinite(rawRemoved)
        ? rawRemoved
        : rawRemoved == null
          ? null
          : Number(rawRemoved);
    return {
      lastRunAt,
      lastRemoved:
        lastRemoved === null || Number.isNaN(lastRemoved) ? null : lastRemoved,
    };
  } catch (err) {
    // Latch the warn so a recurring failure (missing table, permission
    // denied, DB outage) does not produce one log line per status
    // poll — an admin who leaves the System Health tab open polls at
    // 60s and we'd otherwise spam stdout with the same line forever.
    // The latch is cleared the next time a read succeeds, so a
    // subsequent failure after a recovery still surfaces in the log.
    if (!persistedReadFailureLogged) {
      console.warn(
        "[Audit Logins Cleanup] Failed to read persisted state, falling back to in-memory snapshot (suppressing further warnings until next successful read):",
        err instanceof Error ? err.message : err,
      );
      persistedReadFailureLogged = true;
    }
    return null;
  }
}

/**
 * UPSERT the most recent successful prune into the singleton
 * `audit_logins_cleanup_state` row so the Task #751 admin panel
 * survives a process restart and reads consistently across replicas
 * (Task #757). Errors are logged and swallowed — failing to persist
 * the cosmetic snapshot must never abort the prune itself, which is
 * the part operators actually care about.
 *
 * The seed row is installed by migration
 * `049_audit_logins_cleanup_state.sql`; the `ON CONFLICT (id) DO
 * UPDATE` here is what every subsequent successful tick uses, so
 * this query never INSERTs in steady state.
 */
async function persistSnapshot(
  pool: DatabasePool,
  lastRunAtIso: string,
  lastRemoved: number,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO "audit_logins_cleanup_state" ("id", "last_run_at", "last_removed", "updated_at")
       VALUES (1, $1, $2, NOW())
       ON CONFLICT ("id") DO UPDATE
         SET "last_run_at" = EXCLUDED."last_run_at",
             "last_removed" = EXCLUDED."last_removed",
             "updated_at" = NOW()`,
      [lastRunAtIso, lastRemoved],
    );
  } catch (err) {
    console.warn(
      "[Audit Logins Cleanup] Failed to persist last-run snapshot:",
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Read-only snapshot of the most recent prune. Reads the persisted
 * row from `audit_logins_cleanup_state` so the value survives a
 * process restart (Task #757) and reflects the latest tick across
 * all replicas, not just whichever replica is serving this request.
 *
 * Falls back to the in-process write-through cache when the DB is
 * unreachable or the metadata row is missing — the panel must still
 * be able to render *something* during a partial outage.
 *
 * `retentionDays` always comes from the in-process state because it
 * reflects this replica's active env-derived window, which can
 * legitimately differ from another replica's during a rolling
 * deploy. The persisted row deliberately doesn't store it.
 *
 * The returned object is a fresh shallow copy so callers cannot
 * mutate the module-level state by accident.
 */
export async function getAuditLoginsCleanupStatus(
  pool: DatabasePool = defaultPool,
): Promise<AuditLoginsCleanupStatus> {
  if (pool && dbReady) {
    const persisted = await readPersistedSnapshot(pool);
    if (persisted) {
      // Refresh the in-process cache so a subsequent DB outage still
      // surfaces the most recent values this replica has seen rather
      // than reverting to the older locally-stamped snapshot.
      status.lastRunAt = persisted.lastRunAt;
      status.lastRemoved = persisted.lastRemoved;
      return {
        lastRunAt: persisted.lastRunAt,
        lastRemoved: persisted.lastRemoved,
        retentionDays: status.retentionDays,
      };
    }
  }
  return {
    lastRunAt: status.lastRunAt,
    lastRemoved: status.lastRemoved,
    retentionDays: status.retentionDays,
  };
}

function parsePositiveNumber(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function resolveRetentionDays(env: NodeJS.ProcessEnv = process.env): number {
  const days = parsePositiveNumber(env.AUDIT_LOGINS_RETENTION_DAYS);
  return days ?? DEFAULT_RETENTION_DAYS;
}

function resolveIntervalMs(env: NodeJS.ProcessEnv = process.env): number {
  const hours = parsePositiveNumber(env.AUDIT_LOGINS_CLEANUP_INTERVAL_HOURS);
  return (hours ?? DEFAULT_INTERVAL_HOURS) * HOUR_MS;
}

function resolveFirstRunDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const ms = parsePositiveNumber(env.AUDIT_LOGINS_CLEANUP_FIRST_RUN_DELAY_MS);
  return ms ?? DEFAULT_FIRST_RUN_DELAY_MS;
}

/**
 * One-shot prune of `audit_logins` rows older than `retentionDays`.
 * Returns the number of rows removed. Throws on driver / SQL errors
 * so callers can decide whether to log-and-swallow (the scheduled
 * tick) or rethrow (a future admin-triggered manual prune).
 *
 * The interval literal is built from a server-side integer rather
 * than a bound parameter because `INTERVAL '$1 days'` is not legal
 * SQL — Postgres parses the interval at plan time, not at bind
 * time. `retentionDays` is validated to a positive finite integer
 * upstream so there's no SQL-injection surface here.
 */
export async function pruneOldAuditLogins(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  pool: DatabasePool = defaultPool,
): Promise<number> {
  if (!pool) {
    throw new Error("pruneOldAuditLogins: pool is not initialized");
  }
  const days = Number.isFinite(retentionDays) && retentionDays > 0
    ? Math.floor(retentionDays)
    : DEFAULT_RETENTION_DAYS;
  const result = await pool.query(
    `DELETE FROM "audit_logins" WHERE login_time < NOW() - INTERVAL '${days} days'`,
  );
  return result.rowCount ?? 0;
}

/**
 * Admin-triggered, on-demand prune (Task #756). Mirrors the
 * scheduled tick's bookkeeping — runs the same `pruneOldAuditLogins`
 * delete, stamps the success snapshot so the System Health → Database
 * "Login history cleanup" panel reflects the manual run immediately,
 * and emits the same `[Audit Logins Cleanup] Pruned …` log line for
 * grep parity with the scheduled path. Returns the row count + the
 * timestamp it stamped so the calling route can echo both back to the
 * UI without a follow-up GET.
 *
 * Differences from `runScheduledTick`:
 *  - No `dbHealth.reachable` short-circuit. The admin has explicitly
 *    asked for a prune; if the DB is wedged we want the failure to
 *    surface to them in the response (and the toast) rather than
 *    silently no-op.
 *  - Throws on driver / SQL errors instead of swallowing them. The
 *    scheduled path log-and-swallows so the next tick still fires;
 *    the manual path returns the error to the admin so they can act
 *    on it.
 *  - Resolves the retention window from the env on every call so an
 *    operator who tightens `AUDIT_LOGINS_RETENTION_DAYS` for
 *    compliance and presses "Prune now" gets the new window applied
 *    immediately, without having to restart the process so the
 *    scheduler picks it up.
 *
 * The published `retentionDays` on the status snapshot is also
 * refreshed to the value that was actually used for this run, so the
 * panel and the response stay consistent if the env was changed
 * since boot.
 */
export async function runManualAuditLoginsPrune(
  pool: DatabasePool = defaultPool,
): Promise<{ removed: number; lastRunAt: string; retentionDays: number }> {
  const retentionDays = resolveRetentionDays();
  const startedAt = Date.now();
  const removed = await pruneOldAuditLogins(retentionDays, pool);
  const elapsed = Date.now() - startedAt;
  const lastRunAt = new Date().toISOString();
  status.lastRunAt = lastRunAt;
  status.lastRemoved = removed;
  status.retentionDays = retentionDays;
  // Persist the manual-prune snapshot to the singleton metadata row
  // so the result survives a process restart and is consistent
  // across replicas (Task #757). Without this, a manual prune's
  // values would be visible on the local replica's panel until the
  // next status refresh — at which point the persisted-row read
  // (which `getAuditLoginsCleanupStatus()` prefers) would happily
  // overwrite them with whatever older value the singleton row
  // still holds. Persistence failures are logged + swallowed inside
  // `persistSnapshot` so a write hiccup against the metadata table
  // never aborts the manual-prune response the admin is awaiting.
  await persistSnapshot(pool, lastRunAt, removed);
  console.log(
    `[Audit Logins Cleanup] Pruned ${removed} audit_logins row${removed === 1 ? "" : "s"} older than ${retentionDays} days in ${elapsed}ms (manual)`,
  );
  return { removed, lastRunAt, retentionDays };
}

async function runScheduledTick(retentionDays: number): Promise<JobOutcome> {
  // Mirror the EmailScheduler short-circuit (server/services/scheduler.ts):
  // when the pool is in a known-bad state, skip the tick so we don't
  // emit a fresh stack trace every interval. Logged once on the
  // transition into / out of the unreachable state.
  const { dbHealth } = await import("../lib/db-probe");
  if (!dbHealth.reachable) {
    if (!skipLoggedUnreachable) {
      console.warn(
        "[Audit Logins Cleanup] DB unreachable, skipping prune until recovery",
      );
      skipLoggedUnreachable = true;
    }
    return { status: "skipped", message: "database_unreachable" };
  }
  if (skipLoggedUnreachable) {
    console.log("[Audit Logins Cleanup] DB reachable again, resuming");
    skipLoggedUnreachable = false;
  }

  const startedAt = Date.now();
  try {
    const removed = await pruneOldAuditLogins(retentionDays);
    const elapsed = Date.now() - startedAt;
    // Record the successful tick so the System Health → Database
    // admin surface can render "last pruned at <ISO>, removed N
    // rows" without operators having to grep the application log
    // (Task #751). We deliberately stamp this only on success — a
    // failed tick should leave the previous good snapshot in place
    // rather than imply the prune executed and removed zero rows.
    const finishedAt = new Date().toISOString();
    status.lastRunAt = finishedAt;
    status.lastRemoved = removed;
    // Persist to the singleton metadata row so the snapshot survives
    // process restarts and reads consistently across replicas
    // (Task #757). Persistence failures are logged + swallowed
    // inside `persistSnapshot` so a write hiccup against the
    // metadata table never aborts the actual prune.
    await persistSnapshot(defaultPool, finishedAt, removed);
    console.log(
      `[Audit Logins Cleanup] Pruned ${removed} audit_logins row${removed === 1 ? "" : "s"} older than ${retentionDays} days in ${elapsed}ms`,
    );
    return { status: "success", itemsProcessed: removed };
  } catch (err) {
    const elapsed = Date.now() - startedAt;
    console.error(
      `[Audit Logins Cleanup] Prune failed after ${elapsed}ms:`,
      err instanceof Error ? err.message : err,
    );
    // Rethrow so the Scheduler records the failed run.
    throw err;
  }
}

export interface StartAuditLoginsCleanupOptions {
  /** Override the env-derived interval. Useful for tests. */
  intervalMs?: number;
  /** Override the env-derived first-run delay. Useful for tests. */
  firstRunDelayMs?: number;
  /** Override the env-derived retention window in days. Useful for tests. */
  retentionDays?: number;
}

/**
 * Wire up the daily prune timer. No-op when the DB has not been
 * provisioned yet (`dbReady === false`) — the setup wizard is being
 * served and there is no `audit_logins` table to prune.
 *
 * Unlike the sessions cleanup, this scheduler does NOT short-circuit
 * on session-store choice: `audit_logins` is written by every
 * `/api/login` attempt regardless of whether sessions live in
 * Postgres or MemoryStore, so the table grows in dev / setup-only
 * mode too. The `dbReady` gate is the only environment branch.
 *
 * Safe to call more than once: the second call clears the previous
 * timers before installing fresh ones, so a hot-reload during dev
 * does not stack handlers.
 */
export function startAuditLoginsCleanup(
  options: StartAuditLoginsCleanupOptions = {},
): void {
  if (!dbReady) {
    console.log(
      "[Audit Logins Cleanup] Skipping: no database configured (setup wizard mode)",
    );
    return;
  }

  const intervalMs = options.intervalMs ?? resolveIntervalMs();
  const firstRunDelayMs = options.firstRunDelayMs ?? resolveFirstRunDelayMs();
  const retentionDays = options.retentionDays ?? resolveRetentionDays();

  // Publish the active retention window immediately so the admin
  // status panel can render "Retention: N days" before the first
  // tick has fired (the first-run delay is configurable but defaults
  // to 60 s, and operators should not see a blank window in the
  // meantime).
  status.retentionDays = retentionDays;

  // Hydrate the in-memory cache from the persisted singleton row so
  // a fresh process restart immediately renders the previous prune's
  // values rather than "Awaiting first run" until the first tick
  // fires (Task #757). Best-effort: if the metadata table is not yet
  // installed (very fresh install) or the read fails we just leave
  // the cache empty — the next successful tick will populate it.
  void hydrateInMemoryCacheFromPersisted(defaultPool);

  // Registering again replaces the previous registration, so a hot
  // reload during dev does not stack handlers.
  scheduleJob({
    key: AUDIT_LOGINS_CLEANUP_JOB_KEY,
    category: "system",
    label: "Login history cleanup",
    defaultIntervalMs: intervalMs,
    cadenceEditable: true,
    minIntervalMs: HOUR_MS,
    firstRunDelayMs,
    task: () => runScheduledTick(retentionDays),
  });

  const intervalHours = intervalMs / HOUR_MS;
  console.log(
    `[Audit Logins Cleanup] Scheduler started (every ${intervalHours}h, retention ${retentionDays}d, first run in ${Math.round(firstRunDelayMs / 1000)}s)`,
  );
}

/**
 * Best-effort hydration of the in-memory cache from the persisted
 * singleton row, called once when the scheduler starts. Lives in a
 * dedicated helper so the synchronous `startAuditLoginsCleanup` call
 * site can fire-and-forget it without awaiting — the cache is only
 * read by the status surface, which itself reads the DB first.
 */
async function hydrateInMemoryCacheFromPersisted(
  pool: DatabasePool,
): Promise<void> {
  if (!pool) return;
  const persisted = await readPersistedSnapshot(pool);
  if (persisted) {
    status.lastRunAt = persisted.lastRunAt;
    status.lastRemoved = persisted.lastRemoved;
  }
}

/**
 * Tear down both timers. Used by tests so they can swap in a fresh
 * scheduler between cases without bleeding handlers across the test
 * file.
 */
export function stopAuditLoginsCleanup(): void {
  unscheduleJob(AUDIT_LOGINS_CLEANUP_JOB_KEY);
  skipLoggedUnreachable = false;
  persistedReadFailureLogged = false;
  // Reset the published status so test cases that re-start the
  // scheduler with a fresh retention window don't observe stale
  // values from a previous case. Production never calls
  // `stopAuditLoginsCleanup`, so this is a test-mode concern only.
  status.lastRunAt = null;
  status.lastRemoved = null;
  status.retentionDays = null;
}
