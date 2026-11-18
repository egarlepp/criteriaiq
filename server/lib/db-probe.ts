/**
 * DB health probe + shared `dbHealth` singleton (task #361). Used by
 * the wizard, scheduler, and admin-bootstrap to short-circuit when
 * DATABASE_URL is unreachable. No raw passwords are ever logged or
 * returned; only the host and a normalized error code are exposed.
 */

export type DbErrorCode =
  | "authFailed"
  | "connRefused"
  | "hostNotFound"
  | "dbMissing"
  | "timeout"
  | "unknown";

export interface DbHealth {
  reachable: boolean;
  lastError: string | null;
  lastCode: DbErrorCode | null;
  checkedAt: Date | null;
}

// Mutable singleton. Starts reachable=true so the first probe (or
// first successful query) sets a confirmed state. Callers that need a
// confirmed-good state should also check `checkedAt !== null`.
export const dbHealth: DbHealth = {
  reachable: true,
  lastError: null,
  lastCode: null,
  checkedAt: null,
};

// Map pg/Neon driver errors onto a stable enum the wizard can localize.
// SQLSTATE: 28P01/28000 -> authFailed, 3D000 -> dbMissing.
// net errors: ECONNREFUSED, ENOTFOUND, ETIMEDOUT.
export function normalizeDbErrorCode(err: unknown): DbErrorCode {
  if (!err || typeof err !== "object") return "unknown";
  const e = err as { code?: unknown; cause?: unknown; message?: unknown };

  const sqlState = typeof e.code === "string" ? e.code : null;
  if (sqlState === "28P01" || sqlState === "28000") return "authFailed";
  if (sqlState === "3D000") return "dbMissing";
  if (sqlState === "ECONNREFUSED") return "connRefused";
  if (sqlState === "ENOTFOUND") return "hostNotFound";
  if (sqlState === "ETIMEDOUT") return "timeout";

  // Neon serverless wraps the underlying pg error in `cause`.
  if (e.cause) {
    const nested = normalizeDbErrorCode(e.cause);
    if (nested !== "unknown") return nested;
  }

  const msg = typeof e.message === "string" ? e.message.toLowerCase() : "";
  if (msg.includes("password authentication failed")) return "authFailed";
  if (msg.includes("does not exist")) return "dbMissing";
  if (msg.includes("econnrefused")) return "connRefused";
  if (msg.includes("enotfound") || msg.includes("getaddrinfo")) return "hostNotFound";
  if (msg.includes("timeout") || msg.includes("etimedout")) return "timeout";
  return "unknown";
}

// Return host[:port] from a connection URL, with no userinfo.
export function sanitizeConnectionHost(url: string | null | undefined): string {
  if (!url) return "unknown-host";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}`;
  } catch {
    return "unknown-host";
  }
}

export interface ProbeOk { ok: true }
export interface ProbeFail {
  ok: false;
  code: DbErrorCode;
  message: string;
}
export type ProbeResult = ProbeOk | ProbeFail;

// Run SELECT 1 with a hard timeout. Updates dbHealth and ends its
// single-connection probe pool so no socket is left open.
export async function probeDatabase(
  connectionUrl: string,
  timeoutMs = 5000,
): Promise<ProbeResult> {
  const checkedAt = new Date();
  let probePool: { end: () => Promise<void> } | null = null;

  try {
    // Task #479: route through the shared driver helper so a probe
    // against a self-hosted Postgres URL (e.g. a Dokploy-internal
    // hostname) uses node-postgres and connects to the port in the
    // URL, instead of the previous Neon-only path that always tried
    // wss://<host>:443.
    const { createPool } = await import("./db-driver");
    const pool = createPool(connectionUrl, {
      connectionTimeoutMillis: timeoutMs,
      max: 1,
    });
    probePool = pool;
    // Silence pool 'error' so failures surface only via the awaited
    // query rejection, never as an uncaught event.
    pool.on("error", () => { /* swallowed */ });

    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    const queryPromise = (async () => {
      const client = await pool.connect();
      try {
        await client.query("SELECT 1");
      } finally {
        client.release();
      }
    })();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const err = new Error("Probe timed out") as Error & { code: string };
        err.code = "ETIMEDOUT";
        reject(err);
      }, timeoutMs);
    });

    try {
      await Promise.race([queryPromise, timeoutPromise]);
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }

    dbHealth.reachable = true;
    dbHealth.lastError = null;
    dbHealth.lastCode = null;
    dbHealth.checkedAt = checkedAt;
    return { ok: true };
  } catch (err) {
    const code = normalizeDbErrorCode(err);
    const message = err instanceof Error ? err.message : String(err);
    dbHealth.reachable = false;
    dbHealth.lastError = message;
    dbHealth.lastCode = code;
    dbHealth.checkedAt = checkedAt;
    return { ok: false, code, message };
  } finally {
    if (probePool) {
      try { await probePool.end(); } catch { /* may already be closed */ }
    }
  }
}

// Mark unhealthy from a runtime error without running a fresh probe.
// Called from server/db.ts pool.on('error', …).
export function markUnreachableFromError(err: unknown): void {
  dbHealth.reachable = false;
  dbHealth.lastError = err instanceof Error ? err.message : String(err);
  dbHealth.lastCode = normalizeDbErrorCode(err);
  dbHealth.checkedAt = new Date();
}

// Mark reachable after a successful query.
export function markReachable(): void {
  dbHealth.reachable = true;
  dbHealth.lastError = null;
  dbHealth.lastCode = null;
  dbHealth.checkedAt = new Date();
}
