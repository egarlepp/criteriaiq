/**
 * Cross-replica lock for Scheduler jobs marked `singleInstance`.
 *
 * Several CriteriaIQ containers can point at one database (see
 * docs/guides/self-hosting.md). An every-minute job such as the Workflow
 * Automation tick must not run on two of them at once, or a due digest is
 * sent twice. This takes a Postgres session-level advisory lock on the job
 * key, non-blocking: a copy that can't get it skips that tick.
 *
 * Same shape as `withMigrationAdvisoryLock` (server/lib/migrations-runner.ts):
 * the lock lives on a dedicated pooled client for the length of the run,
 * and Postgres frees it if that connection drops, so a crashed copy can't
 * wedge the job for the others.
 */
import type { DatabasePool } from "../../lib/db-driver";
import type { LockResult } from "./scheduler";

/** First half of the two-int advisory-lock key; keeps these apart from other locks. */
export const JOB_LOCK_NAMESPACE = 47_210;

export async function withJobAdvisoryLock<T>(
  pool: DatabasePool,
  jobKey: string,
  fn: () => Promise<T>,
): Promise<LockResult<T>> {
  const client = await pool.connect();
  let acquired = false;
  let unlockFailed = false;
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1, hashtext($2)) AS acquired",
      [JOB_LOCK_NAMESPACE, jobKey],
    );
    acquired = rows[0]?.acquired === true;
    if (!acquired) return { acquired: false };
    return { acquired: true, value: await fn() };
  } finally {
    if (acquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1, hashtext($2))", [JOB_LOCK_NAMESPACE, jobKey]);
      } catch (err) {
        unlockFailed = true;
        console.warn(`[Scheduler] Could not release the lock for ${jobKey}:`, err instanceof Error ? err.message : err);
      }
    }
    // A client that still holds the lock is destroyed rather than returned
    // to the pool; closing its session frees the lock.
    (client.release as (err?: Error) => void)(unlockFailed ? new Error("advisory unlock failed") : undefined);
  }
}
