import type { Express, RequestHandler } from "express";
import session from "express-session";
import { storage } from "../storage";
import MemoryStore from "memorystore";
import connectPg from "connect-pg-simple";
import { sendWelcomeEmail } from "../email/email";
import { evaluateAndExecute } from "../email/email-automation-engine";
import { sendRegistrationWelcomeEmail } from "../email/welcome-email-job";
import bcrypt from "bcryptjs";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { chooseSessionStore, resolveSessionConfig } from "./session-config";
import { toSafeUser } from "../lib/safe-user";
import {
  ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE,
  adminErrorFallback,
  PASSWORD_RECENTLY_USED_ERROR_CODE,
  validateAdminPasswordField,
} from "@shared/admin-validation";
import {
  checkRateLimit,
  getRateLimitResetTime,
  recordAttemptResult,
} from "./mfaUtils";
import { getUserSecurityHealth, mfaEnforcementActive, mfaSetupRequiredFor, passesMfaGate } from "./mfa-enforcement";
import { checkSessionUser, revokeUserAccess } from "./session-revocation";
import { viewAsGuard } from "./view-as";

/**
 * Per-account / per-IP rate-limit budget for `/api/login`. Mirrors the
 * 5-attempt / 15-minute pattern the MFA challenge route uses
 * (Task #596 / #613) but with a more generous attempt count for the
 * password endpoint — passwords are typo-prone and shared between many
 * users behind a NAT, whereas a TOTP / passkey assertion is short and
 * single-user. The per-IP bucket is wider still so a single shared
 * office IP can't lock out unrelated accounts when one user fat-fingers
 * their password.
 *
 * Exported so the integration test in
 * `server/auth/__tests__/login-failed-attempts.integration.test.ts`
 * can hammer exactly N+1 attempts and assert that the next request
 * flips to 429 with a "Too many login attempts" audit row, without
 * either side hard-coding the threshold (Task #616).
 */
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL = 10;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP = 30;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_REASON = "Too many login attempts";

/**
 * Absolute upper bound on a session's lifetime, measured from the
 * `/api/login` POST that created it. Once exceeded the cookie is
 * dead regardless of how active the user has been. Defaults to 8h
 * — industry baseline (M365, AWS console). Configurable per
 * deployment via `SESSION_TTL_HOURS` env var.
 *
 * Was 7 days (1 week) prior to this change. The 7-day window meant a
 * stolen cookie was usable for a week before forcing re-MFA; 8 hours
 * caps that to a single working day.
 */
export const SESSION_TTL_HOURS = (() => {
  const raw = process.env.SESSION_TTL_HOURS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
})();

/**
 * Idle timeout. When the gap between a session's most recent request
 * and `Date.now()` exceeds this value, the session is destroyed
 * server-side on the next request — the user has to log in again.
 *
 * Independent of `SESSION_TTL_HOURS`: an active user keeps rolling
 * this forward indefinitely until the absolute TTL hits, while an
 * idle tab gets bounced. The shorter of (absolute remaining, idle
 * threshold) wins.
 *
 * Defaults to 180 minutes (3 hours) — generous enough that a
 * Solution Engineer running a long technical validation can step
 * away for lunch + a meeting without losing their work. Configurable
 * per deployment via `SESSION_IDLE_TIMEOUT_MINUTES`.
 */
export const SESSION_IDLE_TIMEOUT_MINUTES = (() => {
  const raw = process.env.SESSION_IDLE_TIMEOUT_MINUTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
})();

/**
 * The role every account created via the public `/api/register`
 * endpoint must receive, regardless of what the caller submits.
 *
 * Pinned to a constant rather than read from `req.body.role` so the
 * sign-up path cannot ever self-grant a higher role — see architect
 * security review finding #5. To promote an account to a different
 * role (Admin, Manager, Sales, etc.), an existing admin must do so
 * explicitly via the admin user-management surface.
 *
 * `"Engineer"` is the historical default for this route and matches
 * the lowest-privilege role used by routine self-signups. If a
 * customer-portal-only role is added later (e.g. `"Customer"`),
 * change this constant rather than re-introducing the body-driven
 * path.
 */
export const DEFAULT_REGISTRATION_ROLE = "Engineer";
/**
 * Stable, machine-readable code returned in the 429 JSON body when
 * `/api/login` refuses a request because the per-account or per-IP
 * brute-force ceiling has fired (Task #629). The login form keys off
 * this exact string to render a distinct "you're locked out — try
 * again in N minutes" notice instead of the generic "invalid
 * credentials" message it shows for 401s. Treat it like a public API
 * contract: renaming it without a coordinated front-end change will
 * regress the lockout messaging.
 */
export const LOGIN_RATE_LIMIT_CODE = "LOGIN_RATE_LIMITED";

/**
 * Code returned in the 403 JSON body when `/api/login` verified the
 * password but the account's `allowedLoginMethods` is `okta_only`.
 * The login form keys off it to show the "Continue with Okta" CTA.
 */
export const LOGIN_METHOD_NOT_ALLOWED_CODE = "LOGIN_METHOD_NOT_ALLOWED";

/**
 * Build the two rate-limit bucket keys used by `/api/login`. Kept in
 * one place so the route, the success-reset path, and the integration
 * test all agree on the exact key shape (an off-by-one in the prefix
 * silently breaks the success-resets-counter contract). The email is
 * already normalized (`trim().toLowerCase()`) by the route before this
 * runs so `Foo@Example.com` and `foo@example.com` share one bucket.
 */
export function loginRateLimitKeys(email: string, ipAddress: string): {
  emailKey: string;
  ipKey: string;
} {
  return {
    emailKey: `login:email:${email}`,
    ipKey: `login:ip:${ipAddress}`,
  };
}

/**
 * Names + path scope of the HttpOnly cookies that carry the HMAC-signed
 * WebAuthn *registration* challenge token between the begin and finish
 * legs of the passkey enrollment flow (Task #623). The login flow has
 * its own cookie defined in `mfaChallengeRoute.ts` — these are
 * deliberately separate so a stale enrollment token can never be
 * cross-replayed at the login verify endpoint (and vice versa) even
 * though both go through the same SimpleWebAuthn library.
 *
 * Self-enrollment (`/api/webauthn/register/{begin,finish}`) and
 * admin-mode enrollment (`.../{begin,finish}/:userId`) use distinct
 * cookie *names* so they never clobber each other in the same browser
 * session — an admin who back-to-back enrolls themselves and then a
 * target user must not have the second begin step overwrite the first
 * begin's cookie. Path scope is shared because the admin route's URL
 * is a prefix-match of the self route's path; restricting both cookies
 * to `/api/webauthn/register/finish` keeps them from riding along on
 * unrelated `/api/*` requests that telemetry might log.
 */
export const REGISTER_WEBAUTHN_CHALLENGE_COOKIE = "webauthn_register_challenge";
export const ADMIN_REGISTER_WEBAUTHN_CHALLENGE_COOKIE =
  "webauthn_register_admin_challenge";
export const REGISTER_WEBAUTHN_CHALLENGE_COOKIE_PATH =
  "/api/webauthn/register/finish";
export const REGISTER_WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Reads the named registration-challenge cookie off the inbound request
 * without depending on cookie-parser middleware (the rest of the app
 * doesn't mount it — see the same inline parsing pattern in
 * `mfaChallengeRoute.ts`). The stored value was URI-encoded by
 * `res.cookie(...)`, so we decode it back to the raw `base64.hex`
 * shape `verifyRegistrationWebAuthnChallengeToken` expects.
 */
function readRegisterChallengeCookieByName(
  req: any,
  cookieName: string,
): string | undefined {
  const header = req?.headers?.cookie;
  if (typeof header !== "string" || header.length === 0) return undefined;
  for (const pair of header.split(";")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    if (name !== cookieName) continue;
    const raw = pair.slice(eqIdx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}


/**
 * Drops the self-mode `webauthn_register_challenge` cookie from the
 * browser by emitting a Set-Cookie with the same `path` /begin issued
 * the cookie under (Task #652). MUST be called with the same path or
 * the browser keeps the stale cookie around because clearCookie does
 * a (name, path, domain) lookup. Centralised so both the /finish
 * route and the new /cancel route stay in lockstep — a future change
 * to the cookie path only has to be made here.
 */
function clearRegisterWebAuthnChallengeCookie(res: any): void {
  res.clearCookie(REGISTER_WEBAUTHN_CHALLENGE_COOKIE, {
    path: REGISTER_WEBAUTHN_CHALLENGE_COOKIE_PATH,
  });
}

function clearAdminRegisterWebAuthnChallengeCookie(res: any): void {
  res.clearCookie(ADMIN_REGISTER_WEBAUTHN_CHALLENGE_COOKIE, {
    path: REGISTER_WEBAUTHN_CHALLENGE_COOKIE_PATH,
  });
}

/**
 * Reads the configured password-history size, falling back to the shared
 * default when the env var is missing/blank/non-numeric. Bounded to the
 * inclusive range [0, 50] so an operator typo can't push us into runaway
 * bcrypt comparisons or store unbounded credential material on the user
 * record. A value of 0 disables the history check entirely (so legacy
 * environments can opt out) while still keeping the column populated.
 */
export function getPasswordHistorySize(): number {
  const raw = process.env.PASSWORD_HISTORY_SIZE;
  if (raw === undefined || raw === "") {
    return ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return ADMIN_PASSWORD_HISTORY_DEFAULT_SIZE;
  }
  return Math.min(parsed, 50);
}

/**
 * Returns true if `candidate` matches any of the (bounded) bcrypt hashes in
 * `history`. Mirrors the loop the self-change route uses so the admin
 * password-reset endpoints can reject reuse with the exact same semantics.
 *
 * `historySize <= 0` short-circuits to false so callers can disable the
 * feature centrally via `PASSWORD_HISTORY_SIZE=0` without each route
 * re-implementing the guard.
 */
export async function isPasswordInHistory(
  candidate: string,
  history: unknown,
  historySize: number,
): Promise<boolean> {
  if (historySize <= 0) return false;
  const previousHashes = Array.isArray(history) ? (history as string[]) : [];
  if (previousHashes.length === 0) return false;
  for (const oldHash of previousHashes.slice(0, historySize)) {
    if (!oldHash) continue;
    const reused = await bcrypt.compare(candidate, oldHash);
    if (reused) return true;
  }
  return false;
}

/**
 * Computes the next password-history array after rotating to a new
 * password. The just-replaced hash is prepended (so the most-recent entries
 * sit at the front) and the result is trimmed to `historySize`. When the
 * feature is disabled (`historySize <= 0`) we return an empty array so the
 * column doesn't silently retain stale hashes from a prior configuration.
 */
export function buildNextPasswordHistory(
  replacedHash: string | null | undefined,
  previousHistory: unknown,
  historySize: number,
): string[] {
  if (historySize <= 0) return [];
  const previousHashes = Array.isArray(previousHistory)
    ? (previousHistory as string[])
    : [];
  const next = replacedHash
    ? [replacedHash, ...previousHashes]
    : previousHashes;
  return next.slice(0, historySize);
}

// Enhanced user agent parser
export function parseUserAgent(userAgent: string) {
  const ua = userAgent || "";

  // Detect browser (order matters - check most specific first)
  let browser = "Unknown Browser";
  if (ua.includes("curl")) {
    browser = "curl";
  } else if (ua.includes("Edg/") || ua.includes("Edge/")) {
    browser = "Microsoft Edge";
  } else if (ua.includes("OPR/") || ua.includes("Opera/")) {
    browser = "Opera";
  } else if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
    browser = "Google Chrome";
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    browser = "Safari";
  } else if (ua.includes("Firefox/")) {
    browser = "Mozilla Firefox";
  } else if (ua.includes("MSIE") || ua.includes("Trident/")) {
    browser = "Internet Explorer";
  }

  // Detect OS
  let os = "Unknown OS";
  if (ua.includes("Windows NT 10.0")) {
    os = "Windows 10/11";
  } else if (ua.includes("Windows NT 6.3")) {
    os = "Windows 8.1";
  } else if (ua.includes("Windows NT 6.2")) {
    os = "Windows 8";
  } else if (ua.includes("Windows NT 6.1")) {
    os = "Windows 7";
  } else if (ua.includes("Windows")) {
    os = "Windows";
  } else if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X (\d+)[_.](\d+)/);
    if (match) {
      os = `macOS ${match[1]}.${match[2]}`;
    } else {
      os = "macOS";
    }
  } else if (ua.includes("Linux") && ua.includes("Android")) {
    os = "Android";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    os = "iOS";
  }

  // Generate device name
  const deviceName = `${browser} on ${os}`;

  return { browser, os, deviceName };
}

/**
 * Shared post-authentication bookkeeping used by every successful login
 * branch: writes an `audit_logins` row, increments `loginCount`, sets
 * `lastLogin`, and creates a `user_sessions` row for active-session
 * tracking. Centralised here so the no-MFA login branch in /api/login
 * and the post-challenge branch in /api/mfa/challenge stay in lock-step
 * (Task #596 — MFA logins were previously invisible to the audit trail
 * and login statistics because /api/login skipped this work behind the
 * MFA gate added in Task #583 and the challenge route never replayed
 * it).
 *
 * Each step is wrapped in its own try/catch so one failing subsystem
 * (e.g. session-tracking insert) never aborts the login itself —
 * matching the behaviour the original inline blocks already had.
 */
export async function recordSuccessfulLogin(
  req: any,
  user: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    loginCount?: number | null;
  },
  loginMethod: string,
): Promise<{ loginCount: number; lastLogin: Date }> {
  const now = new Date();
  const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";
  const userAgent = req.get?.("User-Agent") || req.headers?.["user-agent"] || "unknown";
  const sessionId = req.sessionID || "unknown";
  const userName =
    `${user.firstName || ""} ${user.lastName || ""}`.trim() ||
    user.email ||
    "";

  try {
    await storage.createAuditLogin({
      userId: user.id,
      userEmail: user.email || "",
      userName,
      ipAddress,
      userAgent,
      sessionId,
      loginMethod,
      success: true,
      failureReason: null,
    });
  } catch (auditError) {
    console.error("Failed to record audit login:", auditError);
  }

  // Stamp the activity + audit timestamps on the session so the
  // session-lifecycle middleware doesn't immediately write a
  // duplicate `session_resumed` row on the next request, AND so the
  // idle-timeout clock starts ticking from login time rather than
  // from session creation. See server/auth/session-lifecycle.ts.
  if (req.session) {
    req.session.lastActivity = now.getTime();
    req.session.lastAuditedAt = now.getTime();
  }
  // ALSO seed the in-memory dedup map so the parallel request burst
  // the browser fires right after a successful login (the app-shell
  // loads /api/auth/user, the audit grid, the dashboard widgets, etc.
  // all at once) doesn't see an empty map and write a spurious
  // `session_resumed` row in the same second as the just-written
  // `login` row. Dynamic import avoids a simpleAuth ↔ session-
  // lifecycle cycle.
  if (req.sessionID) {
    const capturedSessionId = req.sessionID;
    const capturedNow = now.getTime();
    void import("./session-lifecycle")
      .then(({ markSessionAudited }) => markSessionAudited(capturedSessionId, capturedNow))
      .catch((err) => {
        console.error("[recordSuccessfulLogin] failed to seed session-lifecycle dedup:", err);
      });
  }

  const nextLoginCount = (user.loginCount || 0) + 1;
  try {
    await storage.updateUser(user.id, {
      loginCount: nextLoginCount,
      lastLogin: now,
    });
  } catch (updateError) {
    console.error("Failed to update login statistics:", updateError);
  }

  // Fire the user.first_login automation trigger on the very first login
  // (loginCount just went from 0 → 1). Lets admins configure a welcome /
  // onboarding email via Workflow Automation → Trigger Origins → User Management.
  //
  // Fire-and-forget — we deliberately do NOT `await`. Architect security
  // review finding #14: awaiting blocks the login response on the entire
  // automation engine, including any SMTP / webhook handlers configured
  // against this trigger. A misconfigured rule (slow SMTP, 30s webhook
  // timeout) would stall the user's login indefinitely. The promise's
  // error path is captured for log visibility; the route returns
  // promptly regardless.
  if (nextLoginCount === 1) {
    void evaluateAndExecute({
      triggerKey: "user.first_login",
      userId: user.id,
      metadata: {
        email: user.email || "",
        userId: user.id,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        loginMethod,
        ipAddress,
      },
    }).catch((triggerError) => {
      console.error("Failed to fire user.first_login trigger:", triggerError);
    });
  }

  try {
    const userAgentInfo = parseUserAgent(userAgent);
    await storage.createUserSession({
      userId: user.id,
      sessionId,
      deviceName: userAgentInfo.deviceName,
      browser: userAgentInfo.browser,
      os: userAgentInfo.os,
      ipAddress,
      userAgent,
      lastActive: now,
    });
  } catch (sessionError) {
    console.error("Failed to create session record:", sessionError);
  }

  return { loginCount: nextLoginCount, lastLogin: now };
}

/**
 * Shared bookkeeping for failed login attempts. Used by the MFA challenge
 * route so bad TOTP codes, bad recovery codes, and expired temp tokens
 * all show up in the audit trail with success=false and a human-readable
 * `failureReason` (Task #596).
 *
 * `userInfo` may be partial (e.g. only userId is known when an expired
 * temp token is decoded unsafely). Best-effort identity fields are used
 * so the row still says something meaningful when the caller has no
 * email or name on hand.
 */
export async function recordFailedLogin(
  req: any,
  userInfo: {
    id?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
  loginMethod: string,
  failureReason: string,
): Promise<void> {
  const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";
  const userAgent = req.get?.("User-Agent") || req.headers?.["user-agent"] || "unknown";
  const sessionId = req.sessionID || "unknown";
  const userName =
    `${userInfo.firstName || ""} ${userInfo.lastName || ""}`.trim() ||
    userInfo.email ||
    "unknown";

  try {
    await storage.createAuditLogin({
      userId: userInfo.id || "unknown",
      userEmail: userInfo.email || "unknown",
      userName,
      ipAddress,
      userAgent,
      sessionId,
      loginMethod,
      success: false,
      failureReason,
    });
  } catch (auditError) {
    console.error("Failed to record failed-login audit row:", auditError);
  }
}

/**
 * Stable machine codes written to `audit_logins.failure_reason` when a
 * sensitive-value reveal handler refuses or errors out (Task #767). The
 * UI keys off these strings to render a short explanation next to the
 * "denied" badge, so renaming any of them without a coordinated UI
 * change will degrade the audit timeline. Treat them like a public
 * contract.
 */
export const SECRET_REVEAL_DENY_REASONS = {
  /**
   * No authenticated session — the request hit the reveal route
   * without a logged-in user. Distinct from NOT_ADMIN so an audit
   * review can tell "logged-in user tried to escalate" apart from
   * "unauthenticated probe" (Task #767).
   */
  UNAUTHENTICATED: "unauthenticated",
  /**
   * Convenience alias for guard-level "you're not allowed" rejections
   * that don't fall into the more specific NOT_ADMIN bucket. Reserved
   * for future per-permission gates so the deny taxonomy can grow
   * without renaming what already exists.
   */
  FORBIDDEN: "forbidden",
  /** Caller is logged in but is not in the Admin role. */
  NOT_ADMIN: "not_admin",
  /**
   * The secret has not been generated yet (the bootstrap snapshot
   * reports `source !== 'file'` and is not env-managed). Replaces
   * an earlier ad-hoc `not_generated:${source}` form so the audit
   * timeline ships stable, finite, analytics-friendly reason codes
   * (the source label still appears in the response body for the
   * caller's own UI).
   */
  NOT_GENERATED: "not_generated",
  /** Request body asked to reveal a secret name we do not understand. */
  INVALID_KEY: "invalid_key",
  /** Per-row reveal got a non-numeric / out-of-range :id parameter. */
  INVALID_ID: "invalid_id",
  /** Per-row reveal: the requested connection row does not exist. */
  NOT_FOUND: "not_found",
  /**
   * Bootstrap-secret reveal: the secret is being supplied by the host
   * environment instead of `data/db-config.json`, so the file-backed
   * panel has nothing to show.
   */
  ENV_MANAGED: "env_managed",
  /**
   * Bootstrap-secret reveal: the host env var and the file disagree —
   * the runtime is using the env value, so showing the file value would
   * mislead the operator.
   */
  ENV_FILE_DIVERGENCE: "env_file_divergence",
  /**
   * Bootstrap-secret reveal: the snapshot says source=file but the
   * value slot was empty (race against the rotate path).
   */
  EMPTY_VALUE: "empty_value",
  /** DATABASE_URL reveal: no DATABASE_URL is configured at all. */
  NOT_SET: "not_set",
  /**
   * Per-row db-connections reveal: the stored ciphertext could not be
   * decrypted with the current ENCRYPTION_KEY (key was rotated since
   * the row was saved, ciphertext was tampered with, etc.).
   */
  DECRYPT_FAILED: "decrypt_failed",
  /** Catch-all for an unexpected throw inside the handler. */
  INTERNAL_ERROR: "internal_error",
} as const;

export type SecretRevealDenyReason =
  (typeof SECRET_REVEAL_DENY_REASONS)[keyof typeof SECRET_REVEAL_DENY_REASONS];

/**
 * Shared audit writer for the four sensitive-value reveal handlers
 * introduced by Tasks #739 and #741 (Task #767):
 *   - POST /api/system/secrets/reveal              (SESSION_SECRET / ENCRYPTION_KEY)
 *   - POST /api/system/secrets/reveal-database-url (live DATABASE_URL)
 *   - POST /api/db-connections/:id/reveal          (per-row stored URL)
 *
 * Writes one `audit_logins` row tagged `event_type='secret_reveal'`
 * with the actor (user id, email, name), the key whose value was
 * revealed (NOT the value itself — that would defeat the entire
 * point of the audit), the originating IP / user-agent / session,
 * and either `success=true` for an OK reveal or `success=false`
 * with a stable `SECRET_REVEAL_DENY_REASONS` code for guard
 * rejections and mid-flight throws. The latter make brute-force or
 * unauthorized attempts visible to a security review.
 *
 * Best-effort like every other audit writer in this file: a storage
 * failure is logged and swallowed so the reveal handler's user-
 * facing response is not blocked by an audit-table outage. Adding
 * audit *coverage* of a security event must never break the event.
 */
export async function recordSecretRevealAudit(
  req: any,
  params: {
    /**
     * The secret that was (attempted to be) revealed. Stored verbatim
     * in `event_subject`. Examples: 'SESSION_SECRET', 'ENCRYPTION_KEY',
     * 'DATABASE_URL', 'db-connection:42'.
     */
    key: string;
    /** True for a successful reveal, false for a guard rejection / error. */
    success: boolean;
    /**
     * Required when `success` is false. Stored in `failure_reason` so
     * the existing audit-row shape carries the deny code without a
     * new column. Use one of the `SECRET_REVEAL_DENY_REASONS` values
     * so the UI badge stays consistent.
     */
    reason?: SecretRevealDenyReason | string | null;
    /**
     * Optional override for the actor identity. Defaults to
     * `req.session.user`. Useful for tests and for handlers that
     * have already cached the actor in a local variable.
     */
    actor?: {
      id?: string | null;
      email?: string | null;
      firstName?: string | null;
      lastName?: string | null;
    } | null;
  },
): Promise<void> {
  const sessionUser = req?.session?.user ?? {};
  const actor = params.actor ?? sessionUser;
  const ipAddress = req?.ip || req?.connection?.remoteAddress || "unknown";
  const userAgent =
    req?.get?.("User-Agent") || req?.headers?.["user-agent"] || "unknown";
  const sessionId = req?.sessionID || "unknown";
  const userName =
    `${actor?.firstName || sessionUser?.firstName || ""} ${actor?.lastName || sessionUser?.lastName || ""}`
      .trim() ||
    actor?.email ||
    sessionUser?.email ||
    "unknown";

  try {
    await storage.createAuditLogin({
      userId: actor?.id || sessionUser?.id || "unknown",
      userEmail: actor?.email || sessionUser?.email || "unknown",
      userName,
      ipAddress,
      userAgent,
      sessionId,
      // Leave `loginMethod` unset so the column defaults to its
      // login-only "email" value — this row is a reveal event, not a
      // sign-in, and a `loginMethod` of "email" alongside
      // event_type='secret_reveal' is harmless because the UI keys
      // its login/reveal branch off `eventType` directly.
      success: params.success,
      failureReason: params.success ? null : params.reason ?? null,
      eventType: "secret_reveal",
      eventSubject: params.key,
    });
  } catch (auditError) {
    // Match the swallow-and-log behaviour of recordSuccessfulLogin /
    // recordFailedLogin so an audit-table outage never converts a
    // successful reveal into a 500.
    console.error("Failed to record secret-reveal audit row:", auditError);
  }
}

/**
 * Stable `loginMethod` tags written to `audit_logins` for passkey
 * *enrollment* events (Task #653). Distinct from the `mfa-webauthn`
 * tag the login-side flow uses for assertion attempts so an admin
 * filtering the Activity Log can tell "user added a new passkey"
 * apart from "user signed in with their passkey" — and so the
 * lockout-streak grouping in `client/src/lib/loginAuditGrouping.ts`
 * (which only folds rows tagged with the MFA *assertion* methods)
 * never accidentally swallows an enrollment row.
 *
 * Self vs admin lives in the tag itself rather than in a free-form
 * detail column so the existing `loginMethod` query parameter on the
 * audit feed (`server/routes.ts`) can filter on either flavour
 * without bespoke parsing.
 */
export const WEBAUTHN_ENROLL_SELF_AUDIT_METHOD = "webauthn-enroll-self";
export const WEBAUTHN_ENROLL_ADMIN_AUDIT_METHOD = "webauthn-enroll-admin";

/**
 * Writes an `audit_logins` row for a WebAuthn passkey *enrollment*
 * attempt (Task #653). Mirrors the role `recordSuccessful/FailedLogin`
 * play for the assertion side (Task #596 / #610) so passkey
 * enrollments — both successful and failed — show up in the same
 * Activity Log timeline that already surfaces passkey logins, instead
 * of being invisible outside the server stderr stream.
 *
 * Deliberately separate from `recordSuccessfulLogin` because
 * enrollment must NOT bump `loginCount`, set `lastLogin`, or insert a
 * `user_sessions` row — the user is already authenticated when they
 * reach `/api/webauthn/register/{begin,finish}`; the ceremony just
 * adds a credential, it doesn't start a new login session. Doing the
 * extra bookkeeping would make every passkey enrollment look like a
 * fresh login in the user's profile statistics.
 *
 * The `failureReason` column is overloaded as a structured "details"
 * field: on failure rows it carries the verifier's rejection reason
 * (matching the login-side semantics), on success rows it carries the
 * device name and — for admin-initiated enrollments — the acting
 * admin's user id, so the row records "what was enrolled, on whose
 * account, by whom". The `success` boolean is the unambiguous source
 * of truth for which interpretation applies.
 */
export async function recordWebAuthnEnrollmentAudit(
  req: any,
  enrollingUser: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
  args: {
    mode: "self" | "admin";
    success: boolean;
    failureReason?: string | null;
    deviceName?: string | null;
    actorId?: string | null;
  },
): Promise<void> {
  const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";
  const userAgent =
    req.get?.("User-Agent") || req.headers?.["user-agent"] || "unknown";
  const sessionId = req.sessionID || "unknown";
  const userName =
    `${enrollingUser.firstName || ""} ${enrollingUser.lastName || ""}`.trim() ||
    enrollingUser.email ||
    "unknown";

  let detail: string | null;
  if (args.success) {
    const parts: string[] = [];
    if (args.deviceName) parts.push(`device=${args.deviceName}`);
    if (args.mode === "admin" && args.actorId) {
      parts.push(`enrolledBy=${args.actorId}`);
    }
    detail = parts.length > 0 ? parts.join("; ") : null;
  } else {
    // On admin-flow failures we still want forensic traceability
    // back to the acting admin — a "challenge expired" or "verifier
    // rejected" row that doesn't say *which* admin tried to enroll
    // a passkey under the target's account leaves an investigator
    // having to cross-reference stderr to find out. We append the
    // marker after the reason so the row reads as
    // "<reason>; enrolledBy=<adminId>".
    const baseReason = args.failureReason ?? "unknown";
    detail =
      args.mode === "admin" && args.actorId
        ? `${baseReason}; enrolledBy=${args.actorId}`
        : baseReason;
  }

  try {
    await storage.createAuditLogin({
      userId: enrollingUser.id,
      userEmail: enrollingUser.email || "unknown",
      userName,
      ipAddress,
      userAgent,
      sessionId,
      loginMethod:
        args.mode === "admin"
          ? WEBAUTHN_ENROLL_ADMIN_AUDIT_METHOD
          : WEBAUTHN_ENROLL_SELF_AUDIT_METHOD,
      success: args.success,
      failureReason: detail,
    });
  } catch (auditError) {
    console.error(
      "Failed to record WebAuthn enrollment audit row:",
      auditError,
    );
  }
}

/**
 * Shared session-cookie name. Mirrored as a string literal in the
 * express-session config below — kept exported here so the
 * SESSION_SECRET rotation handler can clear the same cookie on the
 * admin's response without re-deriving the name (Task #724).
 */
export const SESSION_COOKIE_NAME = "connect.sid";

/**
 * Mutable secret array handed to express-session at boot. express-session
 * captures this array by reference and uses it on every request to
 * verify cookie signatures (see `unsigncookie` / `setcookie` in
 * node_modules/express-session/index.js). When SESSION_SECRET is rotated
 * at runtime via the admin "Regenerate" action, we mutate this array
 * in-place — `length = 0; push(newSecret)` — so the live middleware
 * starts signing/verifying with the new value WITHOUT having to
 * re-mount the middleware (which Express does not support — middleware
 * is fixed at app.use time). The original array reference must be
 * preserved or express-session will keep using the old, abandoned one.
 *
 * Captured at the module level so the regenerate handler can reach it
 * via `notifySessionSecretRotated()` (Task #724). `null` until
 * `getSession()` first runs — outside of tests this happens once at
 * boot via `setupSimpleAuth()`.
 */
let activeSessionSecrets: string[] | null = null;
let activeSessionStore: session.Store | null = null;

export function getSession() {
  // Absolute session TTL — read from the SESSION_TTL_HOURS env var at
  // module load with an 8-hour default. See the constant declaration
  // above for the full rationale (was 7 days, dropped to 8h to match
  // industry baseline + tighten the stolen-cookie blast radius).
  const sessionTtl = SESSION_TTL_HOURS * 60 * 60 * 1000;

  let secret = process.env.SESSION_SECRET;
  if (!secret || secret === "dev-session-secret-fallback") {
    if (process.env.NODE_ENV === "production") {
      console.error("🚨 CRITICAL: SESSION_SECRET is unset or using the dev fallback in production. Refusing to start.");
      console.error("   Set SESSION_SECRET to a strong random value (openssl rand -hex 48) or complete the /setup wizard.");
      process.exit(1);
    }
    secret = secret || "dev-session-secret-fallback";
  }

  const cfg = resolveSessionConfig();

  // Session store selection. In production with a configured DATABASE_URL
  // we use connect-pg-simple against the existing `sessions` table (see
  // shared/schema/auth.ts) so sessions survive container restarts and
  // multi-replica deployments. The MemoryStore fallback is reserved for
  // dev / setup-only mode where there is no DB yet — express-session
  // explicitly warns against MemoryStore in production for both reasons.
  // Delegated to `chooseSessionStore` so the unit tests in
  // `server/__tests__/session-config.test.ts` are the single source of
  // truth for this decision.
  const useStore = chooseSessionStore(process.env);

  let store: session.Store;
  if (useStore === "postgres") {
    const PgStore = connectPg(session);
    store = new PgStore({
      conString: process.env.DATABASE_URL,
      tableName: "sessions",
      // The wizard's drizzle-kit push creates the sessions table from
      // `shared/schema/auth.ts`, but we also auto-create on first boot
      // so a brand-new env-only deployment without a wizard run still
      // ends up with a working session store.
      createTableIfMissing: true,
      ttl: Math.floor(sessionTtl / 1000),
    });
  } else {
    const MemoryStoreSession = MemoryStore(session);
    store = new MemoryStoreSession({
      checkPeriod: sessionTtl, // cleanup interval
    });
  }

  console.log(
    `[simpleAuth] session store=${useStore}, cookie.secure=${cfg.cookieSecureMode}, trust proxy=${cfg.trustProxyHops}, ttl=${SESSION_TTL_HOURS}h, idle=${SESSION_IDLE_TIMEOUT_MINUTES}m`,
  );

  // Wrap the secret in a mutable array (express-session accepts an
  // array of secrets and verifies cookies against any entry, signing
  // new cookies with index 0). Capture the array + store references at
  // module scope so `notifySessionSecretRotated()` can swap the live
  // secret in-place without re-mounting middleware (Task #724).
  const secrets: string[] = [secret];
  activeSessionSecrets = secrets;
  activeSessionStore = store;

  return session({
    secret: secrets,
    store,
    resave: false,
    saveUninitialized: false,
    name: SESSION_COOKIE_NAME,
    cookie: {
      httpOnly: true,
      // Operator-controlled via SESSION_COOKIE_SECURE. `"auto"` (the
      // default) tells express-session to set Secure only when
      // `req.secure === true` — which depends on the trust-proxy hop
      // count below also being correct for the deployment topology.
      secure: cfg.cookieSecure,
      maxAge: sessionTtl,
      sameSite: "lax",
      path: "/",
    },
  });
}

/**
 * Result of a runtime SESSION_SECRET rotation (Task #724).
 *
 *  - `secretSwapped`: the in-process `secrets[]` array passed to
 *    express-session was mutated to the new value. False only when
 *    `getSession()` has not run yet (e.g. SESSION_SECRET was lazy-
 *    generated by /api/db-connections before any auth middleware
 *    mounted) — in which case there are no live cookies to invalidate
 *    anyway.
 *  - `storeCleared`: server-side session records were dropped
 *    (`store.clear()` for MemoryStore). Best-effort; errors are
 *    swallowed and logged.
 *  - `clearMethod`: which clear path ran ('memory' | 'unsupported' |
 *    'none'). PG-backed sessions are cleared by the regenerate route
 *    via direct DELETE because connect-pg-simple does not implement
 *    `Store.prototype.clear`; this helper reports 'unsupported' in
 *    that case so the caller knows to handle it out-of-band.
 */
export interface SessionSecretRotationResult {
  secretSwapped: boolean;
  storeCleared: boolean;
  clearMethod: "memory" | "unsupported" | "none";
}

/**
 * Force every existing session cookie to fail signature verification
 * by swapping the live SESSION_SECRET in the express-session middleware
 * — and best-effort drop server-side session records so a stale cookie
 * cannot be re-validated even if the array swap somehow misses (Task
 * #724).
 *
 * Why this exists: express-session captures its `secret` option ONCE
 * at app.use(session(...)) time. The original implementation passed a
 * bare string, so even after `setSessionSecret()` rewrote
 * `process.env.SESSION_SECRET` and `data/db-config.json`, the middleware
 * kept signing/verifying cookies with the boot-time value — meaning
 * "rotate the secret" was effectively a no-op until the next process
 * restart. The `getSession()` rewrite above passes a *mutable array*
 * that we mutate in-place here so the same closed-over reference now
 * points at the new value.
 *
 * `store.clear()` is invoked when the active store implements it
 * (MemoryStore does, connect-pg-simple does not). The PG case is
 * handled by the regenerate route via a `DELETE FROM sessions`
 * issued through the existing app-level pool — that is intentionally
 * NOT done here because this module does not own the pool reference
 * and importing `./db` would create a cycle.
 */
export async function notifySessionSecretRotated(
  newValue: string,
): Promise<SessionSecretRotationResult> {
  let secretSwapped = false;
  if (activeSessionSecrets) {
    // In-place mutation is critical — replacing the binding (e.g.
    // `activeSessionSecrets = [newValue]`) would only update our
    // local handle and leave express-session pointing at the old,
    // now-orphaned array.
    activeSessionSecrets.length = 0;
    activeSessionSecrets.push(newValue);
    secretSwapped = true;
  }

  let storeCleared = false;
  let clearMethod: SessionSecretRotationResult["clearMethod"] = "none";
  const store = activeSessionStore;
  if (store) {
    const clearFn = (store as unknown as {
      clear?: (cb: (err?: Error | null) => void) => void;
    }).clear;
    if (typeof clearFn === "function") {
      clearMethod = "memory";
      try {
        // Wrap the callback in a Promise and AWAIT it. The previous
        // synchronous return path set `storeCleared = true` BEFORE
        // the async `clear()` actually finished — the regenerate
        // route would respond "rotated" while stale sessions might
        // still be loadable from the store for a brief race window.
        // Architect security review finding #13.
        await new Promise<void>((resolve) => {
          clearFn.call(store, (err?: Error | null) => {
            if (err) {
              console.error(
                "[simpleAuth] notifySessionSecretRotated: store.clear callback error:",
                err,
              );
            }
            // Resolve either way — a buggy callback must not hang the
            // regenerate route; the error is logged above.
            resolve();
          });
        });
        storeCleared = true;
      } catch (err) {
        console.error(
          "[simpleAuth] notifySessionSecretRotated: store.clear threw:",
          err,
        );
      }
    } else {
      clearMethod = "unsupported";
    }
  }

  console.log(
    `[simpleAuth] SESSION_SECRET rotated in-process: secretSwapped=${secretSwapped} storeCleared=${storeCleared} clearMethod=${clearMethod}`,
  );

  return { secretSwapped, storeCleared, clearMethod };
}

/**
 * Test-only reset hook so vitest specs that exercise both the
 * pre-rotation and post-rotation states (or that spin up multiple
 * `getSession()` calls inside one process) can drop the captured
 * references between cases. Exported but intentionally undocumented
 * in the public surface — production code never needs to call this.
 */
export function __resetActiveSessionRefsForTests(): void {
  activeSessionSecrets = null;
  activeSessionStore = null;
}

/**
 * Shape of the trusted session record returned by
 * `verifyWebSocketSession()` after a successful cookie unsign + store
 * lookup. Mirrors the subset of `req.session.user` that the WS
 * broadcaster actually needs — id, role, email — so callers cannot
 * silently widen the surface to admin-only fields.
 */
export interface VerifiedSessionUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Verify a WebSocket upgrade/connection request the same way the
 * HTTP middleware would: parse the signed `connect.sid` cookie,
 * unsign it against the live SESSION_SECRET (which rotates), and
 * look up the session in the active store. Returns the real user the
 * server has on record for that session, or `null` if anything fails.
 *
 * Why this exists: the original WS auth path (server/routes.ts) only
 * checked that a `connect.sid` cookie was *present* in the upgrade
 * headers, then accepted whatever `userId` / `userRole` / `userEmail`
 * the client sent in the first `{type:'auth'}` message. That meant any
 * authenticated user could impersonate any other user — or claim the
 * Admin role — over WebSocket. This helper closes that gap by
 * resolving identity from the trusted server-side session record,
 * never from the client message.
 *
 * Returns `null` (never throws) so the WS layer can fail closed with
 * a single check.
 */
export async function verifyWebSocketSession(
  cookieHeader: string | undefined,
): Promise<VerifiedSessionUser | null> {
  if (!cookieHeader) return null;
  if (!activeSessionSecrets || activeSessionSecrets.length === 0) return null;
  if (!activeSessionStore) return null;

  // Parse out connect.sid from the raw Cookie header. We avoid
  // depending on a parser package here — the cookie format is simple
  // and express-session uses the same regex shape under the hood.
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  // Cookie values are URL-encoded by express-session before signing.
  let signedValue: string;
  try {
    signedValue = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  // express-session signed-cookie format: "s:<sid>.<hmac>". Anything
  // else (e.g. an unsigned dev cookie or a tampered value) is rejected.
  if (!signedValue.startsWith("s:")) return null;

  // Try each accepted secret (the array supports rotation with a brief
  // grace window). `cookie-signature` is a transitive dep of
  // express-session, so it is always present in node_modules.
  const cookieSignature = await import("cookie-signature");
  let sid: string | false = false;
  for (const secret of activeSessionSecrets) {
    sid = cookieSignature.unsign(signedValue.slice(2), secret);
    if (sid !== false) break;
  }
  if (sid === false) return null;

  const store = activeSessionStore;
  const sessionRecord = await new Promise<session.SessionData | null>((resolve) => {
    store.get(sid as string, (err, data) => {
      if (err) {
        console.error("[simpleAuth] verifyWebSocketSession: store.get error:", err);
        return resolve(null);
      }
      resolve((data as session.SessionData | null | undefined) ?? null);
    });
  });

  const user = (sessionRecord as any)?.user as Partial<VerifiedSessionUser> | undefined;
  if (!user || typeof user.id !== "string" || typeof user.email !== "string" || typeof user.role !== "string") {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: typeof user.firstName === "string" ? user.firstName : undefined,
    lastName: typeof user.lastName === "string" ? user.lastName : undefined,
  };
}

/**
 * Synchronously read the session id from a signed `connect.sid` cookie,
 * verifying its HMAC against the live SESSION_SECRET (same format and
 * rotation-aware secret list express-session uses). Returns `null` for a
 * missing, unsigned or forged cookie. Does NOT look the session up in the
 * store — callers get "this cookie was issued by us", not "this user is
 * signed in".
 *
 * Used by the global API rate limiter to bucket requests per browser
 * session instead of per IP: everyone behind one corporate proxy shares an
 * IP, so per-IP buckets let one busy colleague 429 everyone else. Checking
 * the signature means a caller cannot mint a fresh bucket per request by
 * sending random cookie values; those fall back to the per-IP bucket.
 */
export function signedSessionIdFromCookieHeader(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  if (!activeSessionSecrets || activeSessionSecrets.length === 0) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  let signedValue: string;
  try {
    signedValue = decodeURIComponent(match[1]);
  } catch {
    return null;
  }
  if (!signedValue.startsWith("s:")) return null;
  const body = signedValue.slice(2);
  const dot = body.lastIndexOf(".");
  if (dot <= 0) return null;
  const sid = body.slice(0, dot);
  const given = Buffer.from(body.slice(dot + 1));
  for (const secret of activeSessionSecrets) {
    // cookie-signature's format: base64 HMAC-SHA256 with the "=" padding removed.
    const expected = Buffer.from(createHmac("sha256", secret).update(sid).digest("base64").replace(/=+$/, ""));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return sid;
  }
  return null;
}

/**
 * Shared `/api/webauthn/register/begin` implementation behind both the
 * self-mode and admin-mode wrappers. The four register routes used to
 * be near-duplicates that diverged in subtle, regression-prone ways
 * (see the comment above the route wrappers); funneling them through
 * one helper keeps the cookie shape, expected-origin, public-key
 * encoding, and storage call all in one place.
 *
 * `userId` is whose row the freshly-issued challenge will be bound to
 * — the session user for self-mode, the URL `:userId` for admin-mode.
 * `cookieName` is the name of the HMAC-signed challenge cookie to
 * issue; the two flows use distinct names so an admin enrolling
 * themselves and then a target user back-to-back doesn't have the
 * second begin clobber the first cookie.
 */
async function handleWebAuthnRegisterBegin(
  req: any,
  res: any,
  userId: string,
  cookieName: string,
) {
  try {
    const {
      generateWebAuthnRegistrationOptions,
      signRegistrationWebAuthnChallenge,
    } = await import("./mfaUtils");

    // We always look the user up by id (rather than reading from
    // `req.session.user` in the self case) so the helper can serve
    // both the self and admin flows from a single code path — the
    // admin flow can't rely on the session user because the session
    // user *is* the admin, not the enrollment target.
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const userName = targetUser.email || "unknown@example.com";
    const displayName =
      `${targetUser.firstName || ""} ${targetUser.lastName || ""}`.trim() ||
      userName;

    const existingCredentials =
      await storage.getUserWebAuthnCredentials(userId);
    const excludeCredentials = existingCredentials.map(
      (cred) => cred.credentialId,
    );

    const options = await generateWebAuthnRegistrationOptions(
      userId,
      userName,
      displayName,
      excludeCredentials,
    );

    // Bind the issued challenge to this user inside a short-lived
    // HMAC-signed token (Task #623). The cookie is HttpOnly so a
    // compromised client script can't exfiltrate it, scoped to the
    // finish endpoint so it doesn't ride along on unrelated /api/*
    // requests, and its maxAge mirrors the token's own 5-minute TTL
    // so a stale cookie expires from the browser around the same
    // time the server-side verifier would reject it anyway.
    const challengeToken = signRegistrationWebAuthnChallenge(
      userId,
      options.challenge,
    );
    res.cookie(cookieName, challengeToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: REGISTER_WEBAUTHN_CHALLENGE_COOKIE_PATH,
      maxAge: REGISTER_WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE_MS,
    });

    res.json(options);
  } catch (error) {
    console.error("WebAuthn registration begin error:", error);
    res.status(500).json({ error: "Failed to begin WebAuthn registration" });
  }
}

/**
 * Shared `/api/webauthn/register/finish` implementation. Pulls the
 * named challenge cookie back out, verifies it was issued for the
 * same `userId` we're now enrolling, hands the WebAuthn response off
 * to the SimpleWebAuthn verifier, and on success persists the
 * credential against `userId` plus flips that user's MFA flag. When
 * the enrollment target is the *caller's* own session user (i.e. the
 * self-mode flow) the session user object is mirrored so the next
 * request immediately sees `mfaEnabled: true` instead of a stale
 * pre-enrollment view; in admin-mode the caller is not the target,
 * so the admin's session is left untouched.
 *
 * Task #653 — every code path through here also writes a row to
 * `audit_logins` (success or failure) so passkey enrollment events
 * are visible in the Activity Log instead of only in stderr. The
 * `auditMode` discriminator picks the `loginMethod` tag and decides
 * whether the admin actor's id gets stamped onto the row's detail
 * field; in admin-mode the row is filed against the *target* user
 * (whose account now owns the credential) but the admin actor is
 * still recorded so investigators can answer "which admin enrolled
 * this passkey" without cross-referencing stderr.
 */
async function handleWebAuthnRegisterFinish(
  req: any,
  res: any,
  userId: string,
  cookieName: string,
  auditMode: "self" | "admin",
  actorId: string | null = null,
) {
  // Best-effort user lookup so the audit row uses the *target's*
  // identity (whose passkey is being added) rather than the bare
  // userId. Done up front — before the cookie check — so that even
  // a missing/expired challenge cookie still produces an audit row
  // tagged to the right account. If the lookup itself blows up (DB
  // outage, deleted user between begin and finish) we fall back to
  // the bare userId so we still write *something* instead of
  // silently dropping the signal.
  let enrollingUser: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  try {
    const lookedUp = await storage.getUser(userId);
    enrollingUser = lookedUp
      ? {
          id: lookedUp.id,
          email: lookedUp.email,
          firstName: lookedUp.firstName,
          lastName: lookedUp.lastName,
        }
      : { id: userId };
  } catch (lookupError) {
    console.error(
      "Failed to load user for WebAuthn enrollment audit:",
      lookupError,
    );
    enrollingUser = { id: userId };
  }

  // Audit-row helper closure — captures `auditMode` + `actorId` so
  // call sites below stay short and uniform. `actorId` is forwarded
  // verbatim; `recordWebAuthnEnrollmentAudit` itself only stamps
  // `enrolledBy=` when the mode is admin AND the id is truthy, so
  // self-mode callers can leave actorId at its null default.
  const writeAudit = (
    args: {
      success: boolean;
      failureReason?: string | null;
      deviceName?: string | null;
    },
  ) =>
    recordWebAuthnEnrollmentAudit(req, enrollingUser, {
      mode: auditMode,
      success: args.success,
      failureReason: args.failureReason ?? null,
      deviceName: args.deviceName ?? null,
      actorId,
    });

  const { verifyRegistrationWebAuthnChallengeToken } = await import(
    "./mfaUtils"
  );
  const cookieToken = readRegisterChallengeCookieByName(req, cookieName);
  const expectedChallenge = verifyRegistrationWebAuthnChallengeToken(
    cookieToken ?? "",
    userId,
  );
  // Whatever the outcome below, clear the cookie so a leftover
  // challenge can't be silently reused on a future request — each
  // /begin call issues a fresh one anyway.
  res.clearCookie(cookieName, {
    path: REGISTER_WEBAUTHN_CHALLENGE_COOKIE_PATH,
  });
  if (!expectedChallenge) {
    // Task #653 — record the failed enrollment so admins can spot
    // a session whose stored challenge cookie was missing, expired,
    // or bound to a different user (the verifier collapses all
    // three into a null result). The audit row is the only signal
    // outside the server stderr stream that the attempt happened.
    await writeAudit({
      success: false,
      failureReason: "expired or invalid challenge cookie",
    });
    return res
      .status(400)
      .json({ error: "Passkey challenge expired — please try again" });
  }

  try {
    const { verifyWebAuthnRegistration, MFA_CONFIG } = await import(
      "./mfaUtils"
    );
    const { response, deviceName } = req.body;

    const expectedOrigin = MFA_CONFIG.WEBAUTHN_ORIGIN;

    const verification = await verifyWebAuthnRegistration(
      response,
      expectedChallenge,
      expectedOrigin,
    );

    if (!verification.verified) {
      await writeAudit({
        success: false,
        failureReason: `verifier rejected: ${
          verification.error || "unknown"
        }`,
      });
      return res
        .status(400)
        .json({ error: verification.error || "Verification failed" });
    }

    const resolvedDeviceName = deviceName || "Unknown Device";

    // Store the credential in the database with proper base64url
    // encoding. Pre-consolidation, the admin branch of this code
    // mistakenly JSON.stringify'd the raw Uint8Array here while the
    // self branch base64url'd it — a divergence that would have
    // poisoned subsequent assertion verifications for any passkey
    // an admin enrolled. Going through one shared helper makes that
    // class of drift impossible.
    const credentialData = {
      userId,
      credentialId: response.id,
      publicKey: Buffer.from(
        verification.registrationInfo.credentialPublicKey,
      ).toString("base64url"),
      counter: verification.registrationInfo.counter,
      transports: JSON.stringify(response.response?.transports || []),
      deviceName: resolvedDeviceName,
    };

    await storage.createWebAuthnCredential(credentialData);

    await storage.updateUser(userId, {
      mfaEnabled: true,
      mfaMethod: "webauthn",
      mfaEnrolledAt: new Date(),
    });

    // Mirror the user-row update onto the active session if (and only
    // if) the credential is being added to the caller's own account
    // — that's the self-mode case. In admin-mode the caller is the
    // admin, not the target, so we deliberately leave the admin's
    // session untouched (their MFA state didn't change).
    if (req.session?.user?.id === userId) {
      req.session.user = {
        ...req.session.user,
        mfaEnabled: true,
        mfaMethod: "webauthn",
        mfaEnrolledAt: new Date(),
      };
    }

    // Task #653 — success row mirrors the failure rows above so the
    // Activity Log shows a single coherent timeline of enrollment
    // attempts (good and bad) rather than only the failures.
    await writeAudit({ success: true, deviceName: resolvedDeviceName });

    res.json({ success: true, message: "Passkey registered successfully" });
  } catch (error) {
    console.error("WebAuthn registration finish error:", error);
    // Task #653 — capture mid-flight failures (DB outage during
    // credential persistence, an unexpected throw out of the
    // verifier wrapper, etc.) so a backend hiccup mid-enrollment
    // doesn't silently drop the only signal that anything was
    // attempted. The thrown error's message is preserved verbatim
    // so investigators don't have to cross-reference stderr.
    await writeAudit({
      success: false,
      failureReason: `internal error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    });
    res
      .status(500)
      .json({ error: "Failed to complete WebAuthn registration" });
  }
}

export async function setupSimpleAuth(app: Express) {
  // Trust-proxy hop count is operator-controlled via TRUST_PROXY_HOPS so
  // multi-hop topologies (Cloudflare → Traefik → app, ingress → app) can
  // be configured without a code change. Must be applied BEFORE the
  // session middleware mounts so `req.secure` is accurate when the
  // cookie is set.
  const cfg = resolveSessionConfig();
  app.set("trust proxy", cfg.trustProxyHops);

  // Add session middleware
  const sessionMiddleware = getSession();
  app.use(sessionMiddleware);

  // Session-lifecycle middleware MUST be installed here — between the
  // session middleware (`req.session` must already be populated) and
  // any route handler this same function registers below (`/api/login`,
  // `/api/auth/user`, etc.). Express runs the stack in registration
  // order and short-circuits at the first responding handler; if the
  // lifecycle middleware were mounted from `server/routes.ts` after
  // this function returns, every auth route would bypass it.
  //
  // The middleware itself exempts the pre-auth endpoints (`/api/login`,
  // `/api/logout`, `/api/register`, `/api/mfa/*`, `/api/setup/*`) so
  // we're safe to mount it ahead of those route registrations.
  const { sessionLifecycleMiddleware } = await import("./session-lifecycle");
  app.use(sessionLifecycleMiddleware);

  // View As (Dev Persona Switcher): read only, and only while the Admin
  // behind it still is one. Mounted before every route, including the auth
  // routes below, so no write slips past it. See ./view-as.ts.
  app.use(viewAsGuard);

  // Demo logins (Demo Mode): the two shared visitor accounts work with demo
  // data only. Mounted here, before the auth routes below, so password
  // change and profile edits are covered too. See ../lib/demo-login-guard.ts.
  const { demoLoginGuard } = await import("../lib/demo-login-guard");
  app.use(demoLoginGuard);

  // Login route for user authentication
  app.post("/api/login", async (req: any, res) => {
    try {
      const { email: rawEmail, password } = req.body;

      // Normalize the submitted email so a user who types
      // `Jane.Doe@example.com` (or with a stray space from autofill)
      // resolves to the same row as the one created with
      // `jane.doe@example.com`. The case-insensitive comparison
      // below has been here for a while, but the lookup itself was
      // operating on the un-normalized input — `getUserByEmail` now
      // does the same LOWER comparison server-side (Task #535) and the
      // landing page submits a trimmed/lowercased value too. This is
      // the matching defense for direct API callers.
      const email = typeof rawEmail === "string"
        ? rawEmail.trim().toLowerCase()
        : rawEmail;

      if (process.env.DEBUG_AUTH === 'true') {
        console.log(
          "Login attempt - email:",
          email,
          "password length:",
          password?.length,
        );
      }

      if (!email || !password) {
        return res
          .status(400)
          .json({ message: "Email and password are required" });
      }

      // Per-account / per-IP rate limit (Task #616). The MFA challenge
      // route already caps repeated bad TOTP / passkey codes at 5 per
      // 15 minutes; before this branch the password endpoint — the
      // *front door* — accepted unbounded attempts and only the
      // `audit_logins` rows piled up. An attacker could hammer
      // thousands of passwords against a known email and nothing
      // stopped them.
      //
      // We check BEFORE looking up the user so a rate-limited request
      // doesn't even pay the `getAllUsers()` cost (the whole point is
      // to stop doing work on behalf of an attacker). The 429 branch
      // also reuses the shared `recordFailedLogin` helper with the
      // standard `LOGIN_RATE_LIMIT_REASON` string so the lockout shows
      // up on the Recent Logins surface alongside the per-attempt
      // failures Task #604 added — admins reviewing a brute-force
      // streak can see the ceiling fired, not just silence after N
      // bad guesses (mirrors the `mfa_rate_limited` pattern from
      // Task #613).
      const ipAddressForRateLimit =
        req.ip || req.connection?.remoteAddress || "unknown";
      const { emailKey: loginEmailKey, ipKey: loginIpKey } =
        loginRateLimitKeys(email, ipAddressForRateLimit);
      // Both buckets are checked in parallel — they hit the same
      // `auth_rate_limits` table by different primary keys, so the
      // round-trips don't serialize. Task #630 moved this state out
      // of the process-local Map into Postgres so the budget
      // survives restarts and is shared across workers.
      const [emailWithinBudget, ipWithinBudget] = await Promise.all([
        checkRateLimit(
          loginEmailKey,
          LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL,
          LOGIN_RATE_LIMIT_WINDOW_MS,
        ),
        checkRateLimit(
          loginIpKey,
          LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
          LOGIN_RATE_LIMIT_WINDOW_MS,
        ),
      ]);
      if (!emailWithinBudget || !ipWithinBudget) {
        await recordFailedLogin(
          req,
          { email },
          "email",
          LOGIN_RATE_LIMIT_REASON,
        );
        // Tell the front-end *how long* the lockout lasts. Without this
        // the form had to fall back to a generic "invalid credentials"
        // message because /api/login looked exactly like a 401 — a
        // legitimate user with a typo-streak couldn't tell they were
        // locked out and would keep guessing (Task #629).
        //
        // We surface the longer of the two bucket reset times so the
        // hint is honest: if the per-IP bucket is the one that fired
        // (e.g. shared office NAT) the per-account bucket might already
        // be cool but the request will still 429 until the wider bucket
        // releases. Picking the max avoids the "I waited the full
        // cooldown and it still says try again later" complaint.
        //
        // Standard `Retry-After` is integer seconds (RFC 9110 §10.2.3).
        // We round *up* so a 0.4s remainder still tells the client to
        // wait one more second instead of immediately re-firing.
        const now = Date.now();
        // Both lookups hit the same `auth_rate_limits` table by
        // different primary keys, so the round-trips parallelize
        // (Task #630 made this helper async to read from Postgres
        // instead of an in-memory Map).
        const [emailResetRaw, ipResetRaw] = await Promise.all([
          getRateLimitResetTime(loginEmailKey),
          getRateLimitResetTime(loginIpKey),
        ]);
        const emailReset = emailResetRaw ?? 0;
        const ipReset = ipResetRaw ?? 0;
        const resetAt = Math.max(emailReset, ipReset);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((resetAt - now) / 1000),
        );
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          message: "Too many login attempts. Please try again later.",
          // Stable code so the front-end can branch on this exact case
          // without parsing the human-readable message string. Mirrors
          // the `DASHBOARD_LAYOUT_PROTECTED` pattern from queryClient.ts.
          code: LOGIN_RATE_LIMIT_CODE,
          retryAfterSeconds,
        });
      }

      // Look up user by email in database (case-insensitive). Previously
      // this pulled the entire users table over the wire on every login
      // attempt and scanned in JS, which scales poorly and amplifies a
      // valid-email DoS. `getUserByEmail` is index-backed by the
      // `users_email_lower_unique` functional unique index from
      // migration 035 and matches at most one row. Architect security
      // review finding #8.
      const existingUser = await storage.getUserByEmail(email);

      if (!existingUser) {
        // Audit-log the failed attempt so unknown-email probes show up
        // in the Recent Logins surface alongside MFA failures recorded
        // by /api/mfa/challenge (Task #604). We only have the
        // submitted email to attribute the row to — `recordFailedLogin`
        // fills in "unknown" for the rest so the row is still useful
        // to security review.
        await recordAttemptResult(loginEmailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordAttemptResult(loginIpKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordFailedLogin(
          req,
          { email },
          "email",
          "Unknown email",
        );
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Check if account is approved first
      if (!existingUser.isApproved) {
        await recordAttemptResult(loginEmailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordAttemptResult(loginIpKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordFailedLogin(
          req,
          {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
          },
          "email",
          "Account pending approval",
        );
        return res.status(403).json({
          message: "Login Not Approved",
          code: "ACCOUNT_PENDING_APPROVAL",
        });
      }

      // A deactivated account can't sign in (the per-request check in
      // isAuthenticated would sign it straight back out anyway).
      if (existingUser.isActive === false) {
        await recordAttemptResult(loginEmailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordAttemptResult(loginIpKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordFailedLogin(
          req,
          {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
          },
          "email",
          "Account deactivated",
        );
        return res.status(403).json({
          message: "This account has been deactivated",
          code: "ACCOUNT_DEACTIVATED",
        });
      }

      // Verify password using bcrypt
      let isPasswordValid = false;
      if (existingUser.password) {
        // Use bcrypt to verify hashed password
        isPasswordValid = await bcrypt.compare(password, existingUser.password);
      } else {
        // No password set - login not allowed
        await recordAttemptResult(loginEmailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordAttemptResult(loginIpKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordFailedLogin(
          req,
          {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
          },
          "email",
          "Account setup incomplete",
        );
        return res.status(401).json({ message: "Account setup incomplete" });
      }

      if (!isPasswordValid) {
        await recordAttemptResult(loginEmailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordAttemptResult(loginIpKey, false, LOGIN_RATE_LIMIT_WINDOW_MS);
        await recordFailedLogin(
          req,
          {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
          },
          "email",
          "Invalid password",
        );
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Per-user sign-in policy (migration 075). Checked only AFTER the
      // password verified so a wrong guess against an Okta-only account
      // gets the same generic 401 as any other account and the 403
      // shape can't be used to probe which accounts are Okta-only. The
      // rate-limit budget is left untouched: the password was right, so
      // this isn't a failed guess, but it isn't a sign-in either.
      if (existingUser.allowedLoginMethods === "okta_only") {
        await recordFailedLogin(
          req,
          {
            id: existingUser.id,
            email: existingUser.email,
            firstName: existingUser.firstName,
            lastName: existingUser.lastName,
          },
          "email",
          "Login method not allowed (Okta only)",
        );
        return res.status(403).json({
          message: "This account must sign in with Okta.",
          code: LOGIN_METHOD_NOT_ALLOWED_CODE,
        });
      }

      // MFA gate (Task #583): when the user has enrolled in MFA we must
      // NOT establish the session here — instead we hand the browser a
      // short-lived temporary token (mfa_required) that the existing
      // /api/mfa/challenge endpoint accepts in exchange for a proven
      // TOTP code. Without this gate, a password-only sign-in skipped
      // the second factor entirely and an MFA-enabled user went
      // straight into the app, defeating the protection they had
      // intentionally enabled. The audit/login-stats/session-tracking
      // bookkeeping below is intentionally skipped on this branch — it
      // runs after the challenge succeeds, recorded by the challenge
      // route once the session is actually created.
      // Demo logins (Demo Mode) are shared by outside visitors: each
      // password sign-in clears the last visitor's MFA so this one enrolls
      // their own authenticator. See server/lib/demo-logins.ts.
      if (existingUser.demoLogin) {
        const { resetDemoLoginMfa } = await import("../lib/demo-logins");
        if (await resetDemoLoginMfa(existingUser)) existingUser.mfaEnabled = false;
      }

      if (existingUser.mfaEnabled) {
        try {
          const { generateTempToken } = await import("./mfaUtils");
          const temporaryToken = generateTempToken(
            existingUser.id,
            "mfa_required",
          );
          // The password half of the login succeeded — clear the
          // login-endpoint rate-limit budget so a typo-streak before
          // the correct password doesn't leak into the next sign-in.
          // The MFA challenge route enforces its own separate budget
          // (`mfa_challenge:<userId>`, Task #596) so brute-forcing the
          // second factor is still bounded independently (Task #616).
          await recordAttemptResult(loginEmailKey, true, LOGIN_RATE_LIMIT_WINDOW_MS);
          await recordAttemptResult(loginIpKey, true, LOGIN_RATE_LIMIT_WINDOW_MS);
          return res.status(200).json({
            requiresMfa: true,
            temporaryToken,
            userEmail: existingUser.email,
            message: "MFA verification required",
          });
        } catch (mfaError) {
          console.error("Failed to issue MFA temporary token:", mfaError);
          return res.status(500).json({
            message: "Login failed",
          });
        }
      }

      // Successful password login clears the rate-limit budget — the
      // legitimate user has just proven possession (Task #616).
      await recordAttemptResult(loginEmailKey, true, LOGIN_RATE_LIMIT_WINDOW_MS);
      await recordAttemptResult(loginIpKey, true, LOGIN_RATE_LIMIT_WINDOW_MS);

      // Audit + login-stats + session-tracking bookkeeping. Shared with
      // /api/mfa/challenge via `recordSuccessfulLogin` so MFA-gated
      // logins land in the same audit trail and update the same
      // counters as password-only logins (Task #596).
      const { loginCount, lastLogin } = await recordSuccessfulLogin(
        req,
        existingUser,
        "email",
      );
      existingUser.loginCount = loginCount;
      existingUser.lastLogin = lastLogin;

      // Set session and clear bypass flag for successful login. Store a
      // credential-free copy: the bcrypt hash, password history and reset
      // token must never land in the session store or the response body.
      const safeUser = toSafeUser(existingUser);
      req.session.user = safeUser;
      req.session.bypassAutoLogin = false;
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      res.json({ user: safeUser, message: "Login successful" });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Registration route
  app.post("/api/register", async (req: any, res) => {
    try {
      // `role` is INTENTIONALLY OMITTED from this destructure. The
      // public sign-up endpoint must always create accounts as the
      // lowest-privilege internal role (`DEFAULT_REGISTRATION_ROLE`)
      // — see architect security review finding #5. The previous
      // implementation read `role` directly from `req.body` with no
      // whitelist; a signup against an auto-approved domain could POST
      // `{ role: "Admin" }` and create a fully-privileged Admin in
      // one step. Admins must be promoted explicitly by an existing
      // admin, never self-assigned at registration.
      const {
        email,
        password,
        firstName,
        lastName,
        accountId,
        accessCodeId,
        title,
        department,
        region,
        timezone,
        solutions = [],
      } = req.body;

      if (!email || !password || !firstName) {
        return res
          .status(400)
          .json({ message: "Email, password, and first name are required" });
      }

      // Validate email format (length cap prevents ReDoS on the regex)
      if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Validate password complexity using the shared admin password rules
      // so the public sign-up endpoint cannot drift from /api/setup/create-admin
      // or the client-side admin forms about what passes.
      const passwordError = validateAdminPasswordField(password);
      if (passwordError) {
        return res
          .status(400)
          .json({ message: adminErrorFallback(passwordError) });
      }

      // Check if user already exists. Use the index-backed
      // `getUserByEmail` lookup instead of fetching the whole users
      // table — same finding #8 reasoning as the login path above. The
      // case-insensitive functional unique index from migration 035
      // means at most one row matches.
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res
          .status(409)
          .json({ message: "User already exists with this email" });
      }

      // Defense-in-depth step 2: if the email's domain is on the allow list
      // with auto-approve enabled, activate the account immediately so the
      // user can log in without waiting for manual approval. Otherwise the
      // account stays pending for an admin to approve.
      const emailDomain = email.toLowerCase().split("@")[1] || "";
      let autoApproved = false;
      try {
        const allowedDomain = await storage.getAllowedDomainByDomain(emailDomain);
        autoApproved = !!(allowedDomain && allowedDomain.autoApprove);
      } catch (domainLookupError) {
        console.error("Allowed-domain lookup failed during registration:", domainLookupError);
      }

      // Code-based signup: the email's domain must be approved. The account
      // must have ≥1 approved domain (block otherwise). If the access code
      // targets specific domains, the email must match one of THOSE; otherwise
      // it must match any of the account's approved domains.
      if (accountId) {
        const accountDomains = await storage.getAllowedDomainsByAccountId(Number(accountId));
        if (accountDomains.length === 0) {
          return res.status(400).json({
            message: "This account has no approved email domains configured. Contact your administrator.",
          });
        }
        let allowedSet = accountDomains.map((d) => d.domain.toLowerCase());
        if (accessCodeId) {
          try {
            const code = await storage.getAccessCodeById(Number(accessCodeId));
            if (code?.domains && code.domains.length > 0) {
              allowedSet = code.domains.map((d) => d.toLowerCase());
            }
          } catch (codeLookupError) {
            console.error("Access-code lookup failed during registration:", codeLookupError);
          }
        }
        if (!allowedSet.includes(emailDomain)) {
          return res.status(400).json({
            message: `Your email domain (@${emailDomain}) is not approved for this access code.`,
          });
        }
      }

      // Hash the chosen password so the user can actually log in. Previously
      // the password was validated but never persisted, leaving the account
      // password-less until an admin manually set one (Task: registration
      // password bug). Mirrors the bcrypt(…, 10) cost used elsewhere.
      const hashedPassword = await bcrypt.hash(password, 10);

      // Resolve the effective role for this account. We INTENTIONALLY ignore
      // any `role` field in the request body (architect finding #5 — a
      // malicious POST could otherwise self-elevate to Admin) and instead
      // read the trusted `assignedRole` off the validated access code
      // server-side. Without this, every signup-with-code lands on
      // DEFAULT_REGISTRATION_ROLE regardless of the role the admin chose
      // when creating the code, which is the bug we hit when an "Admin"
      // code produced an Engineer account.
      let effectiveRole: string = DEFAULT_REGISTRATION_ROLE;
      if (accessCodeId) {
        try {
          const code = await storage.getAccessCodeById(Number(accessCodeId));
          if (code?.isActive && code.assignedRole) {
            // Whitelist: only honour roles that actually exist in the roles
            // table. A stale or hand-edited code targeting a deleted role
            // falls back to DEFAULT_REGISTRATION_ROLE rather than creating
            // an orphan-roled account.
            const role = await storage.getRoleByName(code.assignedRole);
            if (role) {
              effectiveRole = code.assignedRole;
            }
          }
        } catch (roleLookupError) {
          console.error("Access-code role lookup failed during registration:", roleLookupError);
        }
      }

      // Create new user with all fields. Approval is granted up-front only
      // when the domain auto-approve rule matches; otherwise it requires
      // admin approval.
      //
      // ID generation uses `crypto.randomUUID()` (122 bits of CSPRNG
      // entropy) rather than the prior `Date.now() + Math.random()`
      // pattern (~52 bits, non-cryptographic). The old pattern had a
      // realistic collision window under a registration burst, and
      // because the route persisted via `upsertUser`, a collision
      // would have UPSERTed into the existing row — silently
      // overwriting a stranger's account. We now persist via
      // `createUser` so even a defied-odds collision becomes a hard
      // INSERT failure rather than a stealth overwrite. (Architect
      // security review finding #10.)
      const user = {
        id: `user_${randomUUID()}`,
        email,
        password: hashedPassword,
        firstName,
        lastName: lastName || "",
        profileImageUrl: null,
        role: effectiveRole,
        accountId: accountId || null,
        title: title || "",
        department: department || "",
        region: region || "",
        timezone: timezone || "America/New_York",
        specialties: Array.isArray(solutions) ? solutions : [],
        isApproved: autoApproved,
        approvedAt: autoApproved ? new Date() : null,
      };

      // Save user to database. `createUser` issues a plain INSERT, so
      // a duplicate id throws (rather than upserting into a
      // stranger's row, which the previous `upsertUser` call would
      // have done on the vanishingly-unlikely-but-not-impossible
      // event of a UUID collision OR a re-used email row).
      await storage.createUser(user);

      // Record access-code usage so limited codes count down and the per-code
      // usage history is populated. Best-effort: the code was already validated
      // at the code-entry step, so a hiccup here must not fail registration.
      if (accessCodeId) {
        try {
          const code = await storage.getAccessCodeById(Number(accessCodeId));
          if (code) {
            await storage.validateAndUseAccessCode(code.code, user.id, email);
          }
        } catch (codeUsageError) {
          console.error("Failed to record access-code usage during registration:", codeUsageError);
        }
      }

      // Fire the user.registration_completed automation trigger.
      // Any custom rule wired to this trigger key in Workflow Automation
      // will run.
      //
      // Fire-and-forget — same rationale as the user.first_login trigger
      // in `recordSuccessfulLogin` (architect finding #14): a misconfigured
      // rule (slow SMTP, 30s webhook timeout) must not block the user's
      // registration response.
      void evaluateAndExecute({
        triggerKey: "user.registration_completed",
        userId: user.id,
        metadata: {
          email,
          userId: user.id,
          firstName: firstName || "User",
          lastName: lastName || "",
          autoApproved: autoApproved ?? false,
          accessCodeUsed: !!accessCodeId,
          accountStatus: autoApproved ? "approved" : "pending_approval",
        },
      }).catch((triggerError) => {
        console.error("Failed to fire user.registration_completed trigger:", triggerError);
      });

      // Welcome email to the registering user: the built-in "Welcome email"
      // job on Configuration › Scheduler (on/off switch, run history, error
      // emails). Fire-and-forget for the same reason as the trigger above.
      void sendRegistrationWelcomeEmail({
        userId: user.id,
        email,
        metadata: {
          email,
          userId: user.id,
          firstName: firstName || "User",
          lastName: lastName || "",
        },
      }).catch((welcomeError) => {
        console.error("Failed to send the registration Welcome email:", welcomeError);
      });

      // Send notification to admins about new user registration. We need
      // the admin role-filtered subset only — `getUsersByRole` queries
      // `WHERE role = 'Admin'` directly instead of fetching every user
      // and filtering in JS (architect finding #8). Falls back to the
      // table scan only if the helper isn't available (defensive: the
      // method is defined on the users mixin and should always exist).
      try {
        const admins = await (storage as any).getUsersByRoleName("Admin");

        for (const admin of admins) {
          if (admin.email) {
            await sendWelcomeEmail({
              email: admin.email,
              firstName: admin.firstName || "Admin",
              lastName: admin.lastName || "",
              role: admin.role || "Admin",
            });
          }
        }
      } catch (adminEmailError) {
        console.error(
          "Failed to send admin notification email:",
          adminEmailError,
        );
      }

      // Do not set session - user logs in explicitly afterward.
      res.status(201).json({
        message: autoApproved
          ? "Registration successful. Your account has been approved — you can now log in."
          : "Registration successful. Your account is pending approval. You will receive an email once approved.",
        accountStatus: autoApproved ? "approved" : "pending_approval",
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Logout route
  app.post("/api/logout", (req: any, res) => {
    // Capture the user id before we wipe the session so we can
    // terminate any open WebSocket connection that user still has.
    // Without this the WS keeps receiving project broadcasts until
    // the browser tab closes — the session cookie is gone but the
    // socket was authenticated at connect time and not re-validated
    // per message. Architect security review finding #16.
    const departingUserId = req.session?.user?.id as string | undefined;

    const terminateWebSockets = () => {
      if (!departingUserId) return;
      // Dynamic import to avoid a routes → simpleAuth cycle (the
      // broadcaster is initialised in routes.ts).
      import("../services/websocket-broadcaster")
        .then(({ getBroadcaster }) => {
          const broadcaster = getBroadcaster();
          if (broadcaster) broadcaster.disconnectUser(departingUserId, "Logged out");
        })
        .catch((err) => {
          console.error("[logout] WS disconnect lookup failed:", err);
        });
    };

    // Set bypass flag before destroying session
    if (req.session) {
      req.session.bypassAutoLogin = true;
      req.session.save(() => {
        req.session.destroy((err: any) => {
          if (err) {
            return res.status(500).json({ message: "Logout failed" });
          }
          res.clearCookie("connect.sid");
          terminateWebSockets();
          res.json({ message: "Logout successful" });
        });
      });
    } else {
      res.json({ message: "Logout successful" });
    }
  });

  // Auth check route for useAuth hook
  app.get("/api/auth/user", async (req: any, res) => {
    if (req.session?.user && req.session.viewAs) {
      // View As: the person viewed, plus who is really signed in. MFA and
      // password prompts belong to the Admin, who has already passed them.
      const state = req.session.viewAs;
      const viewed = req.session.user;
      const fresh = state.mode === "user" ? await storage.getUser(viewed.id).catch(() => undefined) : undefined;
      const realUser = state.realUser;
      res.json({
        ...viewed,
        firstName: fresh?.firstName ?? viewed.firstName,
        lastName: fresh?.lastName ?? viewed.lastName,
        mfaSetupRequired: false,
        forcePasswordChange: false,
        securityHealth: await getUserSecurityHealth(realUser.id).catch(() => undefined),
        viewAs: {
          mode: state.mode,
          role: state.role,
          targetUserId: state.targetUserId,
          realUser: {
            id: realUser.id,
            email: realUser.email,
            firstName: realUser.firstName,
            lastName: realUser.lastName,
            role: realUser.role,
          },
        },
      });
      return;
    }
    if (req.session && req.session.user) {
      try {
        const userId = req.session.user.id;

        // Check MFA status from database
        const userMfaData = await storage.getUserMfaData(userId);

        // Get last login time
        const lastLogin = await storage.getUserLastLogin(userId);

        // Calculate security health using mfaUtils. Threads the
        // user's SSO link state + the admin's "trust IdP MFA" toggle
        // through so an Okta-linked user whose admin trusts Okta MFA
        // shows green health even without CriteriaIQ TOTP — mirrors
        // the OIDC callback's MFA-skip path so the badge tells the
        // truth about how the user actually authenticates.
        // The same rule the API enforces in isAuthenticated
        // (./mfa-enforcement.ts): every role, outside users included,
        // must enroll unless a trusted SSO provider covers MFA.
        // Production only, so local dev logins aren't blocked.
        const freshUser = await storage.getUser(userId);
        const securityHealth = await getUserSecurityHealth(userId);
        const mfaSetupRequired = mfaSetupRequiredFor(securityHealth);

        const enhancedUser = {
          ...req.session.user,
          firstName: freshUser?.firstName ?? req.session.user.firstName,
          lastName: freshUser?.lastName ?? req.session.user.lastName,
          mfaEnabled: userMfaData?.enabled || false,
          mfaSetupRequired,
          securityHealth,
          lastLogin,
          forcePasswordChange: freshUser?.forcePasswordChange || false,
        };

        res.json(enhancedUser);
      } catch (error) {
        console.error("Error fetching MFA status for user:", error);
        res.json({
          ...req.session.user,
          mfaEnabled: false,
          mfaSetupRequired: mfaEnforcementActive(), // Fail closed for security (prod only)
          securityHealth: {
            enabled: false,
            method: null,
            enrolledAt: null,
            recoveryCount: 0,
            passkeyCount: 0,
            health: "red",
          },
        });
      }
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // WebAuthn Passkeys API Endpoints
  //
  // Task #623 — the registration challenge used to live on
  // `req.session.webauthnChallenges`, which silently broke whenever the
  // begin and finish calls landed on different workers (or the session
  // store evicted the row before the user finished the on-device WebAuthn
  // ceremony). We now mirror the login pattern from Task #611/#624: the
  // challenge rides back as an HMAC-signed HttpOnly cookie scoped to
  // `/api/webauthn/register/finish`, and the finish handler reconstructs
  // it statelessly. This survives process restarts and multi-worker
  // deployments without sticky sessions.
  //
  // Task #654 — self-enrollment (`/api/webauthn/register/{begin,finish}`)
  // and admin-mode enrollment (`.../{begin,finish}/:userId`) used to be
  // four near-identical copies of the same begin/finish dance, which
  // had already drifted in subtle ways (one branch base64url-encoded
  // the public key while the other JSON.stringified the raw Uint8Array,
  // and the two finish routes picked the expected origin from different
  // sources). They now share the `handleWebAuthnRegister{Begin,Finish}`
  // helpers defined above; the four routes here are thin wrappers that
  // only pick (1) which userId to bind the cookie to and (2) which
  // cookie name to use:
  //   - self routes  → `req.session.user.id` + REGISTER_WEBAUTHN_CHALLENGE_COOKIE
  //   - admin routes → `req.params.userId`   + ADMIN_REGISTER_WEBAUTHN_CHALLENGE_COOKIE
  // Distinct cookie names are mandatory (see the comment on the
  // constants near the top of the file) so an admin enrolling themselves
  // and then a target user back-to-back doesn't clobber the first
  // ceremony's cookie with the second's.

  app.post("/api/webauthn/register/begin", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    return handleWebAuthnRegisterBegin(
      req,
      res,
      req.session.user.id,
      REGISTER_WEBAUTHN_CHALLENGE_COOKIE,
    );
  });

  app.post("/api/webauthn/register/finish", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    return handleWebAuthnRegisterFinish(
      req,
      res,
      req.session.user.id,
      REGISTER_WEBAUTHN_CHALLENGE_COOKIE,
      "self",
    );
  });

  // WebAuthn Passkeys API Endpoints for Admin Mode (manage other users).
  // The wrappers gate on the session user being an Admin and then hand
  // off to the same helpers as the self-mode routes — the credential
  // will land on `req.params.userId`, not the admin's own row.
  app.post("/api/webauthn/register/begin/:userId", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    return handleWebAuthnRegisterBegin(
      req,
      res,
      req.params.userId,
      ADMIN_REGISTER_WEBAUTHN_CHALLENGE_COOKIE,
    );
  });

  app.post("/api/webauthn/register/finish/:userId", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    return handleWebAuthnRegisterFinish(
      req,
      res,
      req.params.userId,
      ADMIN_REGISTER_WEBAUTHN_CHALLENGE_COOKIE,
      "admin",
      req.session.user.id,
    );
  });

  // POST /api/webauthn/register/cancel (Task #652) — companion to
  // /api/webauthn/register/begin that drops the challenge cookie when
  // the user backs out of the enrollment flow before /finish runs
  // (closes the dialog, dismisses the authenticator prompt, navigates
  // away). Without it the cookie sits in the browser for its full
  // 5-minute TTL even though /finish will never see it. Mirrors the
  // login-side `/api/webauthn/authenticate/cancel` (Task #634).
  //
  // Intentionally unauthenticated and idempotent — its only effect is
  // a Set-Cookie clearing the cookie on the caller's own browser, so
  // a stray POST from a logged-out tab is harmless. The challenge
  // token itself is HMAC-bound to a user id and TTL'd, so a stale
  // cookie was never a security hole — this is the tidy-up side.
  app.post("/api/webauthn/register/cancel", (_req: any, res) => {
    clearRegisterWebAuthnChallengeCookie(res);
    return res.status(204).end();
  });

  // Admin-mode counterpart. Uses a `:userId` suffix to match the
  // shape of /begin/:userId & /finish/:userId so the dialog can pick
  // the right endpoint by checking `isAdminMode` exactly the same
  // way it does for begin/finish — keeps the client wiring uniform
  // even though the server-side cookie-clearing is otherwise
  // user-id-agnostic. Same unauthenticated/idempotent contract as
  // the self variant: clearing a cookie on the caller's own browser
  // never needs an admin gate, and we want this callable even from
  // a session whose admin token has just expired.
  app.post(
    "/api/webauthn/register/cancel/:userId",
    (_req: any, res) => {
      clearAdminRegisterWebAuthnChallengeCookie(res);
      return res.status(204).end();
    },
  );

  app.get("/api/webauthn/credentials/:userId", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Only allow users to access their own credentials or admins
    const requestedUserId = req.params.userId;
    if (
      req.session.user.id !== requestedUserId &&
      req.session.user.role !== "Admin"
    ) {
      return res.status(403).json({ error: "Access denied" });
    }

    try {
      const credentials =
        await storage.getUserWebAuthnCredentials(requestedUserId);
      res.json({ credentials });
    } catch (error) {
      console.error("Error fetching WebAuthn credentials:", error);
      res.status(500).json({ error: "Failed to fetch credentials" });
    }
  });

  app.delete(
    "/api/webauthn/credentials/:credentialId",
    async (req: any, res) => {
      if (!req.session?.user) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      try {
        const credentialId = req.params.credentialId;
        const credential = await storage.getWebAuthnCredential(credentialId);

        if (!credential) {
          return res.status(404).json({ error: "Credential not found" });
        }

        // Only allow users to delete their own credentials or admins
        if (
          credential.userId !== req.session.user.id &&
          req.session.user.role !== "Admin"
        ) {
          return res.status(403).json({ error: "Access denied" });
        }

        await storage.deleteWebAuthnCredential(credentialId);
        res.json({ success: true, message: "Passkey deleted successfully" });
      } catch (error) {
        console.error("Error deleting WebAuthn credential:", error);
        res.status(500).json({ error: "Failed to delete credential" });
      }
    },
  );

  // Admin MFA Management Endpoints

  // GET /api/admin/users/security - Get paginated list of users with security status
  app.get("/api/admin/users/security", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const {
        search = "",
        role = "",
        health = "",
        page = "1",
        limit = "25",
      } = req.query;
      const pageNum = parseInt(page as string) || 1;
      const limitNum = parseInt(limit as string) || 25;
      const offset = (pageNum - 1) * limitNum;

      const users = await storage.getAdminUserSecurityList({
        search: search as string,
        role: role as string,
        health: health as string,
        limit: limitNum,
        offset,
      });

      res.json(users);
    } catch (error) {
      console.error("Error fetching admin user security list:", error);
      res.status(500).json({ error: "Failed to fetch user security list" });
    }
  });

  // GET /api/admin/users/:id/security - Get detailed security info for single user
  app.get("/api/admin/users/:id/security", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const userId = req.params.id;
      const userSecurity = await storage.getAdminUserSecurityDetail(userId);

      if (!userSecurity) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(userSecurity);
    } catch (error) {
      console.error("Error fetching user security detail:", error);
      res.status(500).json({ error: "Failed to fetch user security detail" });
    }
  });

  // POST /api/admin/users/:id/mfa/require-setup - Force user to complete MFA setup
  app.post("/api/admin/users/:id/mfa/require-setup", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const userId = req.params.id;

      // Update user to require security setup
      await storage.updateUser(userId, {
        securitySetupRequired: true,
      });

      // Log MFA event
      await storage.createMFAEvent({
        userId,
        eventType: "REQUIRE_SETUP",
        meta: {
          requestedBy: req.session.user.id,
          requestedAt: new Date().toISOString(),
        },
      });

      res.json({
        success: true,
        message: "User will be required to complete MFA setup on next login",
      });
    } catch (error) {
      console.error("Error requiring MFA setup:", error);
      res.status(500).json({ error: "Failed to require MFA setup" });
    }
  });

  // POST /api/admin/users/:id/mfa/reset - Full MFA reset for user
  app.post("/api/admin/users/:id/mfa/reset", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (req.session.user.role !== "Admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    try {
      const userId = req.params.id;

      // Full MFA reset - disable MFA and clear all MFA data
      await storage.resetUserMFA(userId);

      // Log MFA event
      await storage.createMFAEvent({
        userId,
        eventType: "MFA_RESET",
        meta: {
          resetBy: req.session.user.id,
          resetAt: new Date().toISOString(),
          reason: "Admin initiated full reset",
        },
      });

      res.json({
        success: true,
        message: "User MFA has been completely reset",
      });
    } catch (error) {
      console.error("Error resetting user MFA:", error);
      res.status(500).json({ error: "Failed to reset user MFA" });
    }
  });

  // GET /api/users/me - Get current user profile
  app.get("/api/users/me", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const user = await storage.getUser(req.session.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accountId: user.accountId,
        title: user.title,
        region: user.region,
        department: user.department,
        role: user.role,
        timezone: user.timezone,
        preferredLocale: user.preferredLocale || "en-US",
        theme: user.theme || "light",
        sidebarCollapsed: user.sidebarCollapsed || false,
        showFlightDeck: user.showFlightDeck !== false,
        loginCount: user.loginCount || 0,
        lastLogin: user.lastLogin,
        profileImageUrl: user.profileImageUrl,
        // Read-only here; only admins change it (users-routes.ts).
        allowedLoginMethods: user.allowedLoginMethods,
      });
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  // PUT /api/users/me - Update current user profile
  app.put("/api/users/me", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      // `accountId` is deliberately NOT accepted here: it decides which
      // customer's data a user can see, so letting users set their own
      // would let a customer move onto another account. Admins and user
      // managers change it through PUT /api/users/:userId.
      const {
        firstName,
        lastName,
        title,
        region,
        department,
        timezone,
        preferredLocale,
        theme,
        sidebarCollapsed,
        showFlightDeck,
      } = req.body;

      const updates: any = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (title !== undefined) updates.title = title;
      if (region !== undefined) updates.region = region;
      if (department !== undefined) updates.department = department;
      if (timezone !== undefined) updates.timezone = timezone;
      if (preferredLocale !== undefined)
        updates.preferredLocale = preferredLocale;
      if (theme !== undefined) updates.theme = theme;
      if (sidebarCollapsed !== undefined)
        updates.sidebarCollapsed = sidebarCollapsed;
      if (showFlightDeck !== undefined) updates.showFlightDeck = showFlightDeck;

      await storage.updateUser(req.session.user.id, updates);

      const updatedUser = await storage.getUser(req.session.user.id);
      res.json({
        id: updatedUser!.id,
        email: updatedUser!.email,
        firstName: updatedUser!.firstName,
        lastName: updatedUser!.lastName,
        accountId: updatedUser!.accountId,
        title: updatedUser!.title,
        region: updatedUser!.region,
        department: updatedUser!.department,
        role: updatedUser!.role,
        timezone: updatedUser!.timezone,
        preferredLocale: updatedUser!.preferredLocale,
        theme: updatedUser!.theme,
        sidebarCollapsed: updatedUser!.sidebarCollapsed,
        showFlightDeck: updatedUser!.showFlightDeck,
        profileImageUrl: updatedUser!.profileImageUrl,
      });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update user profile" });
    }
  });

  // POST /api/users/me/password - Change password
  app.post("/api/users/me/password", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: "Current password and new password are required" });
      }

      // Defer to the shared admin password rules so this endpoint stays in
      // lock-step with /api/register and /api/setup/create-admin. The "New"
      // prefix on the too-short copy is preserved for backward compatibility
      // with existing client error displays.
      const newPasswordError = validateAdminPasswordField(newPassword);
      if (newPasswordError === "adminPasswordTooShort") {
        return res
          .status(400)
          .json({ error: "New password must be at least 10 characters long" });
      }
      if (newPasswordError) {
        return res.status(400).json({ error: adminErrorFallback(newPasswordError) });
      }

      if (newPassword === currentPassword) {
        return res
          .status(400)
          .json({ error: "New password must be different from current password" });
      }

      const user = await storage.getUser(req.session.user.id);
      if (!user || !user.password) {
        return res
          .status(400)
          .json({ error: "Password change not available for this account" });
      }

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Block cycling back to a recently used password. We compare against
      // the stored history of bcrypt hashes (independent of the current
      // password, which is already covered by the equality check above).
      // Each compare is O(bcrypt), so the history is intentionally short
      // and bounded by `getPasswordHistorySize()`.
      const historySize = getPasswordHistorySize();
      const reused = await isPasswordInHistory(
        newPassword,
        user.passwordHistory,
        historySize,
      );
      if (reused) {
        // Same envelope as the admin reset/edit endpoints so the
        // self-service form can render the localized inline message.
        return res.status(400).json({
          message: `New password must not match any of your last ${historySize} passwords`,
          errorCode: PASSWORD_RECENTLY_USED_ERROR_CODE,
          historySize,
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      // Push the password being replaced onto the front of the history,
      // then trim to the configured size so the column never grows
      // unbounded. When `historySize` is 0 we still drop the column to an
      // empty array so disabling the feature can't silently retain old
      // hashes from a previous configuration.
      const nextHistory = buildNextPasswordHistory(
        user.password,
        user.passwordHistory,
        historySize,
      );
      await storage.updateUser(req.session.user.id, {
        password: hashedPassword,
        passwordHistory: nextHistory,
        forcePasswordChange: false,
      });

      req.session.user.forcePasswordChange = false;
      await new Promise((resolve, reject) => {
        req.session.save((err: any) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      // Other devices signed in with the old password are signed out;
      // this one stays.
      await revokeUserAccess(req.session.user.id, {
        reason: "password_reset",
        actor: req.session.user,
        exceptSid: req.sessionID,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // GET /api/me/stats - Get user statistics
  app.get("/api/me/stats", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      let projectCount = 0;
      if (user?.role === "Admin" || user?.role === "SE") {
        const projects = await storage.getProjects(userId);
        projectCount = projects.length;
      }

      const recentLogins = await storage.getAuditLoginsByUserId(userId, 5);

      res.json({
        projectCount,
        loginCount: user?.loginCount || 0,
        lastLogin: user?.lastLogin,
        recentLogins: recentLogins.map((login: any) => ({
          timestamp: login.createdAt,
          ipAddress: login.ipAddress,
          userAgent: login.userAgent,
          success: login.success,
        })),
      });
    } catch (error) {
      console.error("Error fetching user stats:", error);
      res.status(500).json({ error: "Failed to fetch user stats" });
    }
  });

  // GET /api/users/me/sessions - Get active sessions
  app.get("/api/users/me/sessions", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const sessions = await storage.getUserSessions(req.session.user.id);
      res.json(
        sessions.map((s: any) => ({
          id: s.id,
          sessionId: s.sessionId,
          deviceName: s.deviceName,
          browser: s.browser,
          os: s.os,
          ipAddress: s.ipAddress,
          lastActive: s.lastActive,
          createdAt: s.createdAt,
          isCurrent: s.sessionId === req.sessionID,
        })),
      );
    } catch (error) {
      console.error("Error fetching user sessions:", error);
      res.status(500).json({ error: "Failed to fetch user sessions" });
    }
  });

  // POST /api/users/me/sessions/revoke - Revoke a session
  app.post("/api/users/me/sessions/revoke", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({ error: "Session ID is required" });
      }

      if (sessionId === req.sessionID) {
        return res.status(400).json({ error: "Cannot revoke current session" });
      }

      await storage.revokeUserSession(sessionId);
      res.json({ success: true, message: "Session revoked successfully" });
    } catch (error) {
      console.error("Error revoking session:", error);
      res.status(500).json({ error: "Failed to revoke session" });
    }
  });

  // GET /api/users/me/aligned-customers - Get customer accounts user is aligned to
  app.get("/api/users/me/aligned-customers", async (req: any, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      // Only show for Customer, Partner, or Guest roles
      const allowedRoles = ["Customer", "Partner", "Guest"];
      if (!user?.role || !allowedRoles.includes(user.role)) {
        return res.json([]);
      }

      const alignedCustomers = new Map();

      // Get customers where user is directly assigned via contactUsers
      const allCustomers = await storage.getCustomers();
      for (const customer of allCustomers) {
        if (customer.contactUsers && Array.isArray(customer.contactUsers)) {
          const isAssigned = customer.contactUsers.some(
            (contact: any) => contact.userId === userId,
          );

          if (isAssigned && !alignedCustomers.has(customer.accountName)) {
            // Get industry name if industryId exists
            let industryName = null;
            if (customer.industryId) {
              const industry = await storage.getIndustry(customer.industryId);
              industryName = industry?.name || null;
            }

            alignedCustomers.set(customer.accountName, {
              name: customer.accountName,
              region: customer.region || null,
              industry: industryName,
            });
          }
        }
      }

      // Get customers from projects where user is assigned via customerUsers
      const allProjects = await storage.getProjects(userId, {});
      for (const project of allProjects) {
        if (project.customerUsers && Array.isArray(project.customerUsers)) {
          const isAssigned = project.customerUsers.some(
            (cu: any) => cu.userId === userId || cu.userEmail === user.email,
          );

          if (isAssigned && !alignedCustomers.has(project.customerName)) {
            // Find matching customer to get region and industry
            const matchingCustomer = allCustomers.find(
              (c: any) => c.accountName === project.customerName,
            );
            let industryName = null;

            if (matchingCustomer?.industryId) {
              const industry = await storage.getIndustry(
                matchingCustomer.industryId,
              );
              industryName = industry?.name || null;
            } else if (project.industry) {
              // Use project's industry field as fallback if no customer record exists
              industryName = project.industry;
            }

            alignedCustomers.set(project.customerName, {
              name: project.customerName,
              region: matchingCustomer?.region || null,
              industry: industryName,
            });
          }
        }
      }

      // Convert map to array and sort by name
      const result = Array.from(alignedCustomers.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      res.json(result);
    } catch (error) {
      console.error("Error fetching aligned customers:", error);
      res.status(500).json({ error: "Failed to fetch aligned customers" });
    }
  });
}

export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  if (req.session?.user) {
    if (!(await checkSessionUser(req))) {
      return res.status(401).json({ message: "Unauthorized", code: "SESSION_REVOKED" });
    }
    if (!(await passesMfaGate(req))) {
      return res.status(403).json({ message: "MFA setup required", code: "MFA_SETUP_REQUIRED" });
    }
    // Set user on req for backward compatibility - include both id and claims.sub
    req.user = {
      ...req.session.user,
      id: req.session.user.id,
      claims: {
        sub: req.session.user.id,
        ...(req.user?.claims ?? {}),
      },
    };
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};
