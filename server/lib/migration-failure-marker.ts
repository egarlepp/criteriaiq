/**
 * On-disk marker for the last failed boot-time migration (Task #394).
 *
 * The marker survives container restarts so the wizard / status endpoint
 * can surface "your last upgrade failed: 023_…" on the next boot rather
 * than leaving the operator to dig through container logs. Sibling of
 * `data/db-config.json`, written under the same `data/` mount that
 * persists across deploys on Dokploy / Coolify / Hostinger.
 *
 * Lifecycle:
 *   - written by server/index.ts immediately before `process.exit(1)`
 *     when `runPendingMigrations` throws a `MigrationFailedError`;
 *   - cleared by server/index.ts on the next successful migration pass;
 *   - read by `/api/setup/status` so the wizard can show it.
 *
 * All three helpers swallow filesystem errors and return / no-op rather
 * than throw — they MUST NOT crash the process they're trying to
 * diagnose. A failed marker write is logged to stderr but never
 * propagates.
 */

import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const MARKER_FILE = path.join(DATA_DIR, "last-migration-failure.json");

export interface MigrationFailureMarker {
  /** Migration filename that failed, e.g. `023_add_foo_index.sql`. */
  filename: string;
  /** SQLSTATE code from the underlying driver, when available. */
  sqlState?: string | null;
  /** Human-readable error message captured from the driver / runner. */
  error: string;
  /** ISO-8601 UTC timestamp of when the failure was recorded. */
  failedAt: string;
}

/**
 * Persist a failure marker to `data/last-migration-failure.json`. The
 * `data/` directory is created if it doesn't exist (matches the
 * convention used by `db-bootstrap.ts` and the SMTP setup route).
 *
 * Returns `true` on success, `false` if the write failed (the caller
 * is exiting anyway — we just log so the operator sees both signals).
 */
export function recordMigrationFailure(
  marker: MigrationFailureMarker,
): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      MARKER_FILE,
      JSON.stringify(marker, null, 2) + "\n",
      "utf8",
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[migrations] WARNING: failed to write last-migration-failure marker: ${message}`,
    );
    return false;
  }
}

/**
 * Remove the marker file if it exists. Called on successful migration
 * runs so a subsequent green boot clears the "last upgrade failed"
 * banner without operator intervention.
 *
 * No-op when the file is already absent.
 */
export function clearMigrationFailureMarker(): void {
  try {
    if (fs.existsSync(MARKER_FILE)) {
      fs.unlinkSync(MARKER_FILE);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[migrations] WARNING: failed to clear last-migration-failure marker: ${message}`,
    );
  }
}

/**
 * Returns the parsed marker if one is present and well-formed, or
 * `null` when:
 *   - the file does not exist (steady-state / fresh install);
 *   - the file is unreadable or contains invalid JSON;
 *   - the parsed JSON is missing the required `filename` / `error`
 *     / `failedAt` fields.
 *
 * Never throws — caller is the public `/api/setup/status` endpoint.
 */
export function readMigrationFailureMarker(): MigrationFailureMarker | null {
  try {
    if (!fs.existsSync(MARKER_FILE)) return null;
    const raw = fs.readFileSync(MARKER_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<MigrationFailureMarker>;
    if (
      !parsed ||
      typeof parsed.filename !== "string" ||
      typeof parsed.error !== "string" ||
      typeof parsed.failedAt !== "string"
    ) {
      return null;
    }
    return {
      filename: parsed.filename,
      sqlState:
        typeof parsed.sqlState === "string" ? parsed.sqlState : null,
      error: parsed.error,
      failedAt: parsed.failedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Test-only seam — returns the absolute path of the marker file so
 * the unit tests can clean it up between cases without re-deriving
 * the path themselves.
 */
export function _markerFilePathForTests(): string {
  return MARKER_FILE;
}
