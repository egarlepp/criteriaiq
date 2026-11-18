/**
 * Singleton `app_state` row helpers. Tracks the timestamp at which the
 * setup wizard's final step was acknowledged so that re-entries to
 * `/setup` (intentional, or via the post-Redeploy useAuth bounce) can
 * land on the read-only health-check view instead of restarting the
 * 7-step wizard at step 1 and silently overwriting the operator's
 * existing config.
 *
 * Both helpers are guarded — they return `null` / no-op rather than
 * throwing if the database is not yet bound (pre-bootstrap setup-only
 * mode) or if the table does not exist yet (fresh container before
 * `drizzle-kit push` has run). This is essential for
 * `/api/setup/status`: it MUST keep returning a usable JSON response
 * even on the first /setup hit before any DB exists.
 */

import { sql } from "drizzle-orm";
import { db, dbReady } from "../db";
import { appState } from "@shared/schema";

/**
 * Returns the persisted `setup_completed_at` timestamp as an ISO
 * string, or `null` when:
 *   - the DB isn't bound yet (no DATABASE_URL configured);
 *   - the `app_state` table does not exist yet;
 *   - no row exists yet (setup has not been acknowledged).
 *
 * Never throws — caller is the public `/api/setup/status` endpoint.
 */
export async function getSetupCompletedAt(): Promise<string | null> {
  if (!dbReady || !db) return null;
  try {
    const rows = await db
      .select({ completedAt: appState.setupCompletedAt })
      .from(appState)
      .limit(1);
    const row = rows[0];
    if (!row || !row.completedAt) return null;
    return row.completedAt instanceof Date
      ? row.completedAt.toISOString()
      : new Date(row.completedAt as unknown as string).toISOString();
  } catch {
    // Table missing / pool unreachable / any other DB-not-ready
    // condition. Status endpoint stays alive.
    return null;
  }
}

/**
 * Idempotently marks setup as completed. If `setup_completed_at` is
 * already non-null we leave it alone — repeated POSTs to
 * `/api/setup/complete` (e.g. operator re-clicking Restart) must NOT
 * move the timestamp. Returns the resolved timestamp (existing or
 * just-set), or `null` if the DB is not yet bound.
 */
export async function markSetupCompleted(): Promise<string | null> {
  if (!dbReady || !db) return null;
  try {
    // Insert the singleton row if missing; on conflict, only set the
    // timestamp when the existing row's value is null. The COALESCE
    // pattern preserves the original completion time across repeat
    // calls — this is the idempotency contract.
    //
    // We RETURNING the resolved timestamp from the same statement
    // rather than performing a follow-up SELECT — this closes a
    // race window in pg-pool deployments where the SELECT could
    // land on a different connection before the INSERT had
    // committed (architect review HIGH #1).
    const result = await db.execute<{ setup_completed_at: Date | string | null }>(sql`
      INSERT INTO app_state (id, setup_completed_at, updated_at)
      VALUES (1, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE
        SET setup_completed_at = COALESCE(app_state.setup_completed_at, EXCLUDED.setup_completed_at),
            updated_at = NOW()
      RETURNING setup_completed_at
    `);
    // node-postgres returns `{ rows: [...] }`; Drizzle wraps it the
    // same way for `db.execute`. Defensive optional-chain so an
    // unexpected driver shape surfaces as the guarded-null fallback
    // instead of an uncaught TypeError.
    const row = (result as { rows?: Array<{ setup_completed_at: Date | string | null }> })
      .rows?.[0];
    if (!row || !row.setup_completed_at) return null;
    return row.setup_completed_at instanceof Date
      ? row.setup_completed_at.toISOString()
      : new Date(row.setup_completed_at as unknown as string).toISOString();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[app-state] markSetupCompleted failed:", message);
    return null;
  }
}
