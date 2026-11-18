// Session-lifecycle middleware.
//
// Runs on every authenticated request to provide two related things
// the bare `express-session` middleware doesn't:
//
//   1. **Idle timeout.** A session that hasn't seen a request from
//      its owner in more than `SESSION_IDLE_TIMEOUT_MINUTES` is
//      destroyed server-side and the cookie is cleared on the
//      response. The user has to log in again. Independent of the
//      absolute TTL (`SESSION_TTL_HOURS`): an actively-clicking
//      user keeps rolling this forward indefinitely, while an idle
//      tab gets bounced. The shorter of (absolute, idle) wins.
//
//   2. **Session-resumption audit.** Writes an `audit_logins` row
//      with `event_type = 'session_resumed'` the first time we see
//      a request from a given session in a fresh hour-bucket. This
//      restores observability of returning visits — the existing
//      audit log only saw explicit `/api/login` POSTs, so a user
//      who logged in once and then came back day after day on the
//      same cookie was invisible to security review.
//
// Dedup strategy: track `req.session.lastAuditedAt`. Only write a
// resumption row when `now` and `lastAuditedAt` fall in different
// hour buckets (`floor(ms / hourMs)` differs). That gives one row
// per active hour per browser session — informative for "user was
// active 9am, 10am, 11am, …" timelines without flooding the table
// with a row per API call.
//
// `recordSuccessfulLogin` stamps `lastActivity` and `lastAuditedAt`
// at login time so the very first authenticated request after login
// doesn't write a duplicate `session_resumed` row right after the
// `login` row.
//
// Architect security review follow-up: closes the observability gap
// the user surfaced — auto-resumed sessions were not appearing in
// the User Management → Audit screen.

import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { SESSION_IDLE_TIMEOUT_MINUTES, SESSION_COOKIE_NAME, parseUserAgent } from "./simpleAuth";

const HOUR_MS = 60 * 60 * 1000;

/**
 * In-process synchronous dedup map for the `session_resumed` audit
 * writes. Why we need this on top of `req.session.lastAuditedAt`:
 *
 * express-session reads the session record from the store at the START
 * of a request and only persists mutations to the store at the END
 * (on `res.end()` via the `save` callback). When a browser fires
 * many parallel requests — which it does on every page load (audit
 * grid query + user info + page-meta + tanstack-query refetches all
 * hit at the same instant) — every parallel request reads the SAME
 * stale `lastAuditedAt` value, every one decides "different hour,
 * write a row", and every one sets `req.session.lastAuditedAt = now`
 * which the store doesn't know about until each response ends. Net
 * effect before this guard: 17+ duplicate rows all timestamped to
 * the same second.
 *
 * The Map fixes the race because JavaScript is single-threaded: the
 * `set` from request A is visible to request B's `get` synchronously
 * on the very next event-loop turn, no async store roundtrip in
 * between. We still update `req.session.lastAuditedAt` so the
 * persistent value survives a server restart — but the Map is the
 * source of truth for the dedup decision within a single process.
 *
 * Memory bound: one entry per active session id. With `SESSION_TTL_HOURS=8`
 * and bursty traffic, this stays in the low thousands even on a busy
 * deployment. The cleanup sweep below evicts any entry whose
 * `lastAuditedAt` is older than 2× the session TTL — far past the
 * point where the session itself has timed out.
 */
const auditDedupMap = new Map<string, number>();

/**
 * Companion set for the idle-timeout path. Same race condition risk
 * as `auditDedupMap`: when many parallel requests all observe
 * "idle exceeded" simultaneously, each would otherwise fire its own
 * `session_idle_timeout` audit row and call `req.session.destroy`.
 * The Set is checked + mutated synchronously so only the first
 * request wins the audit write; the rest still respond 401 but skip
 * the duplicate audit insert.
 */
const idledSessionIds = new Set<string>();

/**
 * Seed the in-memory dedup map from outside this module. Called by
 * `recordSuccessfulLogin` so that parallel requests firing right
 * after `/api/login` (the browser's natural "load the app shell"
 * burst) don't trip the dedup race and write spurious
 * `session_resumed` rows on top of the just-recorded `login` row.
 *
 * Exported (rather than module-private) because the login route
 * lives in `simpleAuth.ts` and a static import here would create a
 * cycle. Callers reach this via a dynamic `import("./session-lifecycle")`.
 */
export function markSessionAudited(sessionId: string, atMs: number): void {
  if (!sessionId) return;
  auditDedupMap.set(sessionId, atMs);
}

const SWEEP_MS = 60 * 60 * 1000; // every hour
const SWEEP_MAX_AGE_MS = 24 * 60 * 60 * 1000; // entries older than 24h
const sweepInterval = setInterval(() => {
  const cutoff = Date.now() - SWEEP_MAX_AGE_MS;
  for (const [sid, ts] of auditDedupMap) {
    if (ts < cutoff) auditDedupMap.delete(sid);
  }
  // The idle-session marker set is harder to age out (no per-entry
  // timestamp), but we can safely drop it whenever it grows past a
  // generous ceiling — once a session is destroyed it will never
  // re-enter the middleware as the same session id, so retention is
  // purely defensive. 10k entries ≈ a few KB of memory.
  if (idledSessionIds.size > 10_000) {
    idledSessionIds.clear();
  }
}, SWEEP_MS);
// Don't keep the process alive solely on this interval (matters for
// test runs and graceful shutdowns).
if (typeof sweepInterval.unref === "function") sweepInterval.unref();

/**
 * Type augmentation for the session fields this middleware reads /
 * writes. Lives here rather than `server/types/session.d.ts` because
 * it's specific to the lifecycle helper's contract; the global
 * `req.session.user` shape is declared elsewhere.
 */
declare module "express-session" {
  interface SessionData {
    /** Epoch ms of the last request seen for this session. */
    lastActivity?: number;
    /** Epoch ms of the last `session_resumed` audit write (hour-bucket dedup). */
    lastAuditedAt?: number;
  }
}

export function sessionLifecycleMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Don't touch unauthenticated requests, the auth flow itself
  // (login / mfa / setup), the WebSocket upgrade path, or static
  // assets — there's no session subject to time out and no point in
  // auditing a request that hasn't authenticated yet.
  const sessionAny = req.session as any;
  // During View As the session's user is the person viewed; the audit rows
  // below must name the Admin actually signed in.
  const user = (sessionAny?.viewAs?.realUser ?? sessionAny?.user) as { id?: string; email?: string } | undefined;
  if (!user || !user.id) {
    return next();
  }

  // Skip the auth surface itself — login / logout / MFA challenge / setup
  // wizard / register. These are either pre-auth or already write their
  // own audit rows via recordSuccessfulLogin.
  const p = req.path;
  if (
    p === "/api/login" ||
    p === "/api/logout" ||
    p === "/api/register" ||
    p.startsWith("/api/setup/") ||
    p.startsWith("/api/mfa/")
  ) {
    return next();
  }

  const now = Date.now();
  const idleThresholdMs = SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
  const lastActivity = sessionAny.lastActivity as number | undefined;

  // ── Idle-timeout check ────────────────────────────────────────────
  if (typeof lastActivity === "number" && now - lastActivity > idleThresholdMs) {
    const idleMinutes = Math.round((now - lastActivity) / 60000);
    const sessionId = req.sessionID || "unknown";

    // Race guard: only the first parallel request through this block
    // writes the audit row + calls destroy. Subsequent requests with
    // the same session id (firing in the same event-loop window
    // before the first destroy completes) still respond 401 but
    // skip the duplicate writes.
    const alreadyIdled = idledSessionIds.has(sessionId);
    if (!alreadyIdled) {
      idledSessionIds.add(sessionId);
      // Drop the dedup map entry too — the session is gone, no
      // future request will resume it.
      auditDedupMap.delete(sessionId);
    }

    const ipAddress = req.ip || (req.socket as any)?.remoteAddress || "unknown";
    const userAgent = req.get("user-agent") || "unknown";
    const idleUserId = user.id;
    const idleUserEmail = user.email || "";

    // Best-effort audit row BEFORE we destroy the session. Fire-and-
    // forget — losing the audit must not block the response. The
    // destroy callback ends the request itself.
    if (!alreadyIdled) {
      storage
        .createAuditLogin({
          userId: idleUserId,
          userEmail: idleUserEmail,
          userName: idleUserEmail,
          ipAddress,
          userAgent,
          sessionId,
          loginMethod: "session_cookie",
          success: false,
          failureReason: `Idle timeout (${idleMinutes} min)`,
          eventType: "session_idle_timeout",
        } as any)
        .catch((err) => {
          console.error("[session-lifecycle] failed to audit idle timeout:", err);
        });
    }

    req.session.destroy((err) => {
      if (err) {
        console.error("[session-lifecycle] session.destroy error:", err);
      }
      res.clearCookie(SESSION_COOKIE_NAME);
      res
        .status(401)
        .json({ message: "Session expired due to inactivity. Please sign in again.", code: "SESSION_IDLE_TIMEOUT" });
    });
    return;
  }

  // ── Resumption audit (hour-bucket dedup) ──────────────────────────
  //
  // Decision sources, in order of authority:
  //   1. `auditDedupMap` (in-process, synchronous) — primary. Solves
  //      the parallel-requests race where many requests from the
  //      same session land in the same event-loop tick and all see
  //      a stale `req.session.lastAuditedAt` value.
  //   2. `req.session.lastAuditedAt` (persisted via express-session
  //      store) — fallback for the first request after a process
  //      restart, when the map is empty.
  //
  // If EITHER says we're still in the same hour bucket, skip the
  // write. The Map check has to run first AND mutate immediately on
  // a positive decision so the next parallel request sees the
  // updated entry.
  const sid = req.sessionID || "";
  const mapLastAuditedAt = sid ? auditDedupMap.get(sid) : undefined;
  const sessionLastAuditedAt = sessionAny.lastAuditedAt as number | undefined;
  const lastAuditedAt =
    typeof mapLastAuditedAt === "number"
      ? mapLastAuditedAt
      : sessionLastAuditedAt;
  const inDifferentHour =
    typeof lastAuditedAt !== "number" ||
    Math.floor(now / HOUR_MS) !== Math.floor(lastAuditedAt / HOUR_MS);

  if (inDifferentHour) {
    // Stamp BOTH stores synchronously BEFORE firing the async audit
    // insert. The Map mutation prevents the race; the session
    // mutation gets persisted by express-session on response end so
    // the dedup state survives a server restart.
    if (sid) auditDedupMap.set(sid, now);
    sessionAny.lastAuditedAt = now;
    // First request of a new hour-bucket — record the resumption.
    // Fire-and-forget so an audit insert failure can't break a normal
    // page load. The bucket boundary is hour-aligned (UTC), not
    // sliding, so the next row appears at the top of the next hour
    // and a continuously-active user produces one row per active
    // hour — exactly the shape security review wants for incident
    // timelines.
    const ipAddress = req.ip || (req.socket as any)?.remoteAddress || "unknown";
    const userAgent = req.get("user-agent") || "unknown";
    const sessionId = req.sessionID || "unknown";
    const ua = parseUserAgent(userAgent);
    const userName = user.email || ua.deviceName || "";

    storage
      .createAuditLogin({
        userId: user.id,
        userEmail: user.email || "",
        userName,
        ipAddress,
        userAgent,
        sessionId,
        loginMethod: "session_cookie",
        success: true,
        failureReason: null,
        eventType: "session_resumed",
      } as any)
      .catch((err) => {
        console.error("[session-lifecycle] failed to audit session_resumed:", err);
      });
  }

  // ── Roll forward activity timestamp ───────────────────────────────
  // Always update on every request that reached this point — the
  // idle check above already gated this on "not idle yet."
  sessionAny.lastActivity = now;

  next();
}
