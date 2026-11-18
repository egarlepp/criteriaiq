import type { Express } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { storage } from "../storage";
import { mfaRecoveryCodes, trustedDevices, webauthnCredentials } from "@shared/schema";
import {
  verifyTempToken,
  decryptText,
  verifyTotpCode,
  findMatchingUnusedRecoveryCode,
  generateTrustedDeviceToken,
  hashTrustedDeviceToken,
  checkRateLimit,
  recordAttemptResult,
  getRateLimitResetTime,
  generateWebAuthnAuthenticationOptions,
  verifyWebAuthnAuthentication,
  signLoginWebAuthnChallenge,
  verifyLoginWebAuthnChallengeToken,
  MFA_CONFIG,
  evaluateRecoveryCodesWarning,
  type RecoveryCodesWarning,
} from "./mfaUtils";
import { recordSuccessfulLogin, recordFailedLogin } from "./simpleAuth";
import { takeSsoMfaBinding } from "./ssoMfaHandoff";

/**
 * Name of the HttpOnly cookie that carries the HMAC-signed WebAuthn
 * login challenge token between `/api/webauthn/authenticate/begin` and
 * `/api/mfa/challenge` (Task #624). Path-scoped to the verify endpoint
 * so it doesn't ride along on unrelated `/api/*` requests, narrowing
 * the surface area for accidental capture by request loggers.
 */
const LOGIN_WEBAUTHN_CHALLENGE_COOKIE = "mfa_login_challenge";
const LOGIN_WEBAUTHN_CHALLENGE_COOKIE_PATH = "/api/mfa/challenge";
const LOGIN_WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Brute-force ceiling for `/api/mfa/challenge`: 5 failed second-factor
 * attempts inside a 15-minute rolling window will trip the limiter
 * and short-circuit subsequent requests with a 429 until the window
 * closes. Hoisted out of the handler so the 429 branch and any
 * future caller (regression test, alerting wire-up) can read the
 * exact thresholds the route enforces from one place.
 */
export const MFA_CHALLENGE_RATE_LIMIT_MAX_ATTEMPTS = 5;
export const MFA_CHALLENGE_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Stable, machine-readable code returned in the 429 JSON body when
 * `/api/mfa/challenge` refuses a request because the per-user
 * brute-force ceiling has fired (Task #637). The MFA dialog keys
 * off this exact string to render a distinct "you're locked out —
 * try again in N minutes" notice with a live countdown, instead of
 * the generic "invalid code" message it shows for per-attempt 401s.
 * Mirrors the `LOGIN_RATE_LIMITED` pattern from `simpleAuth.ts`
 * (Task #629). Treat it like a public API contract: renaming it
 * without a coordinated front-end change will regress the lockout
 * messaging.
 */
export const MFA_CHALLENGE_RATE_LIMIT_CODE = "MFA_CHALLENGE_RATE_LIMITED";

/**
 * Frozen 429 message string — also asserted verbatim by the
 * rate-limit regression tests in `login-mfa-flow.integration.test.ts`
 * and `mfa-failed-attempt-audit.integration.test.ts`. Kept as a
 * named export so any future test or caller can pin against the
 * same string instead of duplicating it inline.
 */
export const MFA_CHALLENGE_RATE_LIMIT_MESSAGE =
  "Too many verification attempts. Please try again later.";

/**
 * Reads the WebAuthn login challenge cookie off the inbound request
 * without depending on cookie-parser middleware (the rest of the app
 * doesn't mount it — see the inline cookie parsing in the WebSocket
 * upgrade handler in `server/routes.ts` for the same pattern). The
 * stored value was URI-encoded by `res.cookie(...)`, so we decode it
 * back to the raw `base64.hex` token shape that
 * `verifyLoginWebAuthnChallengeToken` expects.
 */
function readLoginWebAuthnChallengeCookie(req: any): string | undefined {
  const header = req?.headers?.cookie;
  if (typeof header !== "string" || header.length === 0) return undefined;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const name = pair.slice(0, eq).trim();
    if (name !== LOGIN_WEBAUTHN_CHALLENGE_COOKIE) continue;
    const raw = pair.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return undefined;
}

/**
 * Drops the `mfa_login_challenge` cookie from the browser by emitting
 * a Set-Cookie with an empty value and a path that matches the one
 * the cookie was originally issued under (Task #634). MUST be called
 * with the same `path` /begin used or the browser will keep the
 * stale cookie around because clearCookie does a (name, path, domain)
 * lookup. Centralised in one helper so every site that needs to
 * drop the cookie — the verify path, the cancel path, and every
 * other branch of /api/mfa/challenge — uses the same options.
 */
function clearLoginWebAuthnChallengeCookie(res: any): void {
  res.clearCookie(LOGIN_WEBAUTHN_CHALLENGE_COOKIE, {
    path: LOGIN_WEBAUTHN_CHALLENGE_COOKIE_PATH,
  });
}

/**
 * Mounts the `POST /api/mfa/challenge` route used by the password→MFA
 * login flow (Task #583). Extracted from `server/routes.ts` into its
 * own module so the integration tests in
 * `server/auth/__tests__/login-mfa-flow.integration.test.ts`
 * (Task #597) can mount the *real* handler against an in-memory user
 * store without dragging in the rest of the route surface.
 *
 * Behavioural contract (must not regress):
 *   - Requires a `temporaryToken` issued by the `/api/login` MFA gate
 *     (accepted in the body or as `Authorization: Bearer …`).
 *   - Verifies a TOTP `code` against the user's encrypted secret, OR
 *     a recovery `recoveryCode` against `mfa_recovery_codes`, OR a
 *     WebAuthn `assertion` against `webauthn_credentials` (Task #599 —
 *     before this branch existed, users who had only enrolled a
 *     passkey were locked into the TOTP/recovery fallback even though
 *     the dialog header advertised WebAuthn support).
 *   - On success: writes `req.session.user` so the caller's
 *     `connect.sid` cookie now represents an authenticated session,
 *     then replays the same audit-trail / loginCount / lastLogin /
 *     user_sessions bookkeeping the no-MFA branch in /api/login does
 *     so MFA-gated logins still show up everywhere admins look
 *     (Task #596).
 *   - On failure: returns 400 with a generic message and records a
 *     rate-limit failure so brute-forcing is bounded; also writes a
 *     failed audit_logins row tagged with the attempted method so
 *     admins can see post-password failures, not just pre-password
 *     ones (Task #596).
 *
 * Also mounts `POST /api/webauthn/authenticate/begin` — the companion
 * endpoint the login dialog hits FIRST to fetch the assertion options
 * (allowed credentials + challenge) before the browser invokes the
 * authenticator. Issuing the challenge here instead of from a generic
 * /api/webauthn/* route keeps the entire login passkey contract in
 * one file so the integration test can mount both legs from a single
 * `registerMfaChallengeRoute(app)` call (Task #599).
 */
export function registerMfaChallengeRoute(app: Express): void {
  // Issue a WebAuthn assertion challenge for the password→MFA login
  // flow. Requires the same temp token the /api/mfa/challenge route
  // accepts so an unauthenticated caller cannot probe credential ids
  // for arbitrary users — the begin endpoint is gated by the same
  // proof-of-password the TOTP/recovery branches are.
  app.post("/api/webauthn/authenticate/begin", async (req: any, res) => {
    try {
      const { temporaryToken: bodyTemporaryToken } = req.body || {};
      const headerToken = req.headers.authorization?.replace("Bearer ", "");
      const tempToken = headerToken || bodyTemporaryToken;

      if (!tempToken) {
        return res.status(401).json({ message: "Temporary token required" });
      }

      const tokenData = verifyTempToken(tempToken);
      if (!tokenData || tokenData.type !== "mfa_required") {
        return res.status(401).json({ message: "Invalid or expired token" });
      }

      const user = await storage.getUser(tokenData.userId);
      if (!user || !user.mfaEnabled) {
        return res.status(400).json({ message: "MFA not enabled for user" });
      }

      const credentials = await storage.getUserWebAuthnCredentials(
        tokenData.userId,
      );
      if (!credentials || credentials.length === 0) {
        return res
          .status(400)
          .json({ message: "No passkeys registered for this account" });
      }

      const options = await generateWebAuthnAuthenticationOptions(
        credentials.map((c: any) => c.credentialId),
      );

      // Bind the issued challenge to this user inside a short-lived
      // HMAC-signed token (Task #611). Originally the token rode back
      // in the JSON body and was echoed back in the body of
      // /api/mfa/challenge, but that left it visible in the browser's
      // DevTools network tab and in any error-tracking tool that
      // snapshots request/response bodies (Sentry breadcrumbs,
      // session-replay tools, etc.). Task #624 moves the token into
      // a short-lived HttpOnly cookie scoped to /api/mfa/challenge:
      //   - HttpOnly = no JS access, so a compromised client script
      //     cannot exfiltrate it.
      //   - Path = /api/mfa/challenge so it does not ride along on
      //     unrelated /api/* requests that telemetry might log.
      //   - maxAge mirrors the token's own 5-minute TTL so a stale
      //     cookie expires from the browser around the same time the
      //     server-side verifier would reject it anyway.
      // The flow remains stateless on the server (the cookie value
      // IS the signed token, not a session id) so passkey login
      // still survives multi-worker deployments and rolling restarts.
      const challengeToken = signLoginWebAuthnChallenge(
        tokenData.userId,
        options.challenge,
      );
      res.cookie(LOGIN_WEBAUTHN_CHALLENGE_COOKIE, challengeToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: LOGIN_WEBAUTHN_CHALLENGE_COOKIE_PATH,
        maxAge: LOGIN_WEBAUTHN_CHALLENGE_COOKIE_MAX_AGE_MS,
      });

      return res.json(options);
    } catch (error: any) {
      console.error("WebAuthn login begin error:", error);
      return res
        .status(500)
        .json({ message: "Failed to begin passkey authentication" });
    }
  });

  // POST /api/webauthn/authenticate/cancel (Task #634) — small
  // companion endpoint the dialog hits when the user backs out of
  // the passkey flow (cancels the authenticator prompt, switches to
  // TOTP, closes the dialog) AFTER `/api/webauthn/authenticate/begin`
  // has set the `mfa_login_challenge` cookie. Without it the cookie
  // sits in the browser until its 5-minute TTL elapses; not a
  // security hole because the token is HMAC-bound to the user and
  // TTL'd, but it's untidy and could mask bugs where a stale
  // challenge silently survives a navigation. The endpoint is
  // intentionally unauthenticated and idempotent — its only effect
  // is emitting a Set-Cookie that clears the cookie on the caller's
  // own browser, so no temp-token check is needed.
  app.post("/api/webauthn/authenticate/cancel", (_req: any, res) => {
    clearLoginWebAuthnChallengeCookie(res);
    return res.status(204).end();
  });

  // MFA Challenge - handles TOTP code, recovery code, or WebAuthn verification
  app.post('/api/mfa/challenge', async (req: any, res) => {
    try {
      // Task #634: drop the `mfa_login_challenge` cookie on EVERY
      // response from this endpoint regardless of which verifier
      // branch we end up taking. Originally only the webauthn branch
      // cleared it, which meant a leftover passkey cookie could
      // outlive a successful TOTP/recovery login (or an early-return
      // failure path like rate-limit / bad temp token). The cookie
      // is single-use anyway — every call to /begin issues a fresh
      // one — so unconditionally clearing it here is safe even
      // when the request never carried one. Set the header up front
      // so it travels on every res.json/res.status branch below; the
      // webauthn branch reads its value from the request before this
      // point so the clearing has no effect on the verification
      // logic.
      clearLoginWebAuthnChallengeCookie(res);

      // Login-flow callers (MFAChallengeDialog) submit `type` + `code`
      // and pass the temp token in the request body, while internal
      // callers historically used `recoveryCode` + Authorization header.
      // Accept both shapes so the login challenge actually goes through
      // — without the body fallbacks the dialog's POST always fails
      // with 401 "Temporary token required" (Task #583).
      const {
        code: bodyCode,
        recoveryCode: bodyRecoveryCode,
        rememberDevice: bodyRememberDevice,
        trustDevice: bodyTrustDevice,
        type,
        temporaryToken: bodyTemporaryToken,
        assertion: bodyAssertion,
      } = req.body || {};
      // Task #624: the WebAuthn challenge token now arrives via the
      // HttpOnly cookie set by /api/webauthn/authenticate/begin
      // instead of being echoed back in the request body — keeps the
      // token out of DevTools and any telemetry that snapshots
      // request bodies. See `LOGIN_WEBAUTHN_CHALLENGE_COOKIE` above.
      const cookieChallengeToken = readLoginWebAuthnChallengeCookie(req);
      const isRecoveryRequest = type === 'recovery';
      const isWebAuthnRequest = type === 'webauthn';
      const code = isRecoveryRequest || isWebAuthnRequest ? undefined : bodyCode;
      const recoveryCode = isRecoveryRequest
        ? (bodyRecoveryCode || bodyCode)
        : bodyRecoveryCode;
      const rememberDevice = bodyRememberDevice ?? bodyTrustDevice;
      const headerToken = req.headers.authorization?.replace('Bearer ', '');
      const tempToken = headerToken || bodyTemporaryToken;

      // The login method we record on the audit row depends on which
      // verifier the caller used. Bad recovery codes still count as
      // "mfa-recovery" attempts so admins can tell apart the two paths
      // when reviewing failures (Task #596). Passkey attempts get the
      // 'mfa-webauthn' tag so admins can also distinguish failed
      // passkey logins from failed TOTP/recovery ones (Task #599).
      const attemptedMethod: 'mfa-totp' | 'mfa-recovery' | 'mfa-webauthn' =
        isWebAuthnRequest
          ? 'mfa-webauthn'
          : isRecoveryRequest || (!code && !!recoveryCode)
            ? 'mfa-recovery'
            : 'mfa-totp';

      if (!tempToken) {
        await recordFailedLogin(
          req,
          {},
          attemptedMethod,
          'Missing MFA temporary token',
        );
        return res.status(401).json({ message: 'Temporary token required' });
      }

      const tokenData = verifyTempToken(tempToken);
      if (!tokenData || tokenData.type !== 'mfa_required') {
        // The signed token failed verification (tampered, signed with a
        // rotated key, or past its 15-minute expiry). We can't trust the
        // payload, but for the audit trail we try a best-effort decode
        // of the unsigned base64 half so the row at least carries the
        // userId the caller claimed — admins reviewing failed logins
        // should see *who* the request was for, not just "unknown".
        let claimedUser:
          | { id?: string; email?: string | null; firstName?: string | null; lastName?: string | null }
          = {};
        try {
          const [encoded] = String(tempToken).split('.');
          const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
          if (payload?.userId) {
            const claimed = await storage.getUser(payload.userId);
            claimedUser = claimed
              ? {
                  id: claimed.id,
                  email: claimed.email,
                  firstName: claimed.firstName,
                  lastName: claimed.lastName,
                }
              : { id: payload.userId };
          }
        } catch {
          // Token wasn't even decodable — fall through with an empty
          // identity so the audit row still records the attempt.
        }
        await recordFailedLogin(
          req,
          claimedUser,
          attemptedMethod,
          'Invalid or expired MFA temporary token',
        );
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      // Rate limiting
      const rateLimitKey = `mfa_challenge:${tokenData.userId}`;
      if (
        !(await checkRateLimit(
          rateLimitKey,
          MFA_CHALLENGE_RATE_LIMIT_MAX_ATTEMPTS,
          MFA_CHALLENGE_RATE_LIMIT_WINDOW_MS,
        ))
      ) {
        // Task #613: write a discrete `mfa_rate_limited` audit row so
        // admins reviewing the Activity Log see the brute-force
        // *lockout* itself, not just the streak of failed guesses
        // that preceded it. Without this row the 429 branch was
        // invisible — five failed attempts followed by silence
        // can't be distinguished from "the attacker gave up". The
        // distinct snake_case reason makes the lockout trivially
        // alertable from the Activity Log filter without having to
        // pattern-match against the streak.
        //
        // Best-effort: the surrounding `recordFailedLogin` already
        // try/catches the audit insert, and we additionally guard
        // the user lookup with `.catch(() => null)` so a transient
        // DB hiccup can't change the 429 response shape (the
        // canonical "Too many verification attempts. Please try
        // again later." `message` is asserted verbatim by the
        // rate-limit regression tests in the sibling describe block,
        // and the new `code` + `retryAfterSeconds` fields below are
        // additive so those assertions still hold).
        const rateLimitedUser = await storage.getUser(tokenData.userId).catch(() => null);
        await recordFailedLogin(
          req,
          rateLimitedUser
            ? {
                id: rateLimitedUser.id,
                email: rateLimitedUser.email,
                firstName: rateLimitedUser.firstName,
                lastName: rateLimitedUser.lastName,
              }
            : { id: tokenData.userId },
          attemptedMethod,
          'mfa_rate_limited',
        );
        // Tell the dialog *how long* the lockout lasts. Without this
        // the MFAChallengeDialog had to fall back to a generic
        // "invalid code" toast because /api/mfa/challenge looked
        // exactly like a per-attempt 401 — a user who fat-fingered
        // their TOTP six times couldn't tell the server had locked
        // them out for 15 minutes and would keep guessing
        // (Task #637 — mirrors the `LOGIN_RATE_LIMITED` pattern
        // /api/login adopted in Task #629).
        //
        // We reuse `getRateLimitResetTime` from `mfaUtils.ts` so
        // there's exactly one source of truth for the in-memory
        // bucket's reset time; if the limiter ever moves to Redis
        // (Task #630 is doing the same for /api/login) the helper
        // changes underneath and this branch keeps working without
        // a parallel re-implementation.
        //
        // Standard `Retry-After` is integer seconds (RFC 9110
        // §10.2.3). We round *up* so a 0.4s remainder still tells
        // the client to wait one more second instead of immediately
        // re-firing. The `getRateLimitResetTime` call returns null
        // if the bucket evaporated between the `checkRateLimit`
        // above and this read (e.g. window just elapsed) — in that
        // unlikely race we fall back to the full window length so
        // the client never sees a zero/negative `retryAfterSeconds`
        // and re-tries instantly.
        const resetAt = await getRateLimitResetTime(rateLimitKey);
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            ((resetAt ?? Date.now() + MFA_CHALLENGE_RATE_LIMIT_WINDOW_MS) -
              Date.now()) /
              1000,
          ),
        );
        res.setHeader('Retry-After', String(retryAfterSeconds));
        return res.status(429).json({
          message: MFA_CHALLENGE_RATE_LIMIT_MESSAGE,
          code: MFA_CHALLENGE_RATE_LIMIT_CODE,
          retryAfterSeconds,
        });
      }

      const user = await storage.getUser(tokenData.userId);
      if (!user || !user.mfaEnabled) {
        await recordFailedLogin(
          req,
          user
            ? {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
              }
            : { id: tokenData.userId },
          attemptedMethod,
          'MFA not enabled for user',
        );
        return res.status(400).json({ message: 'MFA not enabled for user' });
      }

      let isValid = false;
      // Track which factor proved possession so the post-success
      // bookkeeping below (audit-log row, future stats) can record an
      // accurate `loginMethod`. Task #595 introduced this for the
      // recovery-code branch; Task #596 now also routes the row
      // through the shared `recordSuccessfulLogin` helper for both
      // TOTP and recovery paths; Task #599 extended it to the
      // passkey branch.
      let usedFactor: 'totp' | 'recovery' | 'webauthn' | null = null;
      // Re-derive the audit `loginMethod` from what the user actually
      // submitted now that we know which verifier path we'll take, so
      // the row is accurate even if the dialog sent both fields. Used
      // by both the failed-attempt branches and the success branch
      // (Task #596). Includes 'mfa-webauthn' for the passkey branch
      // (Task #599) so successful passkey logins audit-log the right
      // method instead of falling back to the default 'mfa-totp'.
      let resolvedMethod: 'mfa-totp' | 'mfa-recovery' | 'mfa-webauthn' =
        attemptedMethod;
      // Populated only when `usedFactor === 'recovery'` so the
      // dialog can warn the operator how many backup codes they
      // have left and prompt regeneration once the count crosses
      // the low-water threshold (Task #602).
      let recoveryWarning: RecoveryCodesWarning | null = null;

      if (isWebAuthnRequest) {
        // Passkey branch (Task #599). The browser hands us the raw
        // assertion produced by `navigator.credentials.get()` — we
        // look the credential up by its base64url id (the same shape
        // we stored at registration time), pull the previously-issued
        // challenge out of the single-use login map, then delegate the
        // crypto verification to SimpleWebAuthn via the shared
        // `verifyWebAuthnAuthentication` helper. On success we bump
        // the credential counter (replay defence) before falling
        // through to the shared session-creation block below. Audit
        // rows are tagged 'mfa-webauthn' so the Task #596 audit trail
        // distinguishes passkey logins from TOTP/recovery ones.
        resolvedMethod = 'mfa-webauthn';
        const userIdentity = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
        };
        const assertion = bodyAssertion;
        if (!assertion || typeof assertion !== "object" || !assertion.id) {
          await recordAttemptResult(rateLimitKey, false);
          await recordFailedLogin(
            req,
            userIdentity,
            resolvedMethod,
            'Invalid passkey assertion',
          );
          return res
            .status(400)
            .json({ message: "Invalid passkey assertion" });
        }

        // Reconstruct the challenge from the HMAC-signed token the
        // /api/webauthn/authenticate/begin endpoint set in the
        // mfa_login_challenge HttpOnly cookie (Task #611, moved out
        // of the JSON body in Task #624). Since the token is bound
        // to the userId it was issued for, a token issued for someone
        // else cannot be paired with this temp token. The verifier
        // also enforces the 5-minute TTL so a stale token can't be
        // replayed weeks later. Stateless = survives restarts and
        // multi-worker. The cookie has already been queued for
        // clearing at the top of this handler (Task #634) so a
        // leftover challenge can't be silently reused on a future
        // request — each /begin issues a fresh one anyway.
        const expectedChallenge = verifyLoginWebAuthnChallengeToken(
          typeof cookieChallengeToken === 'string' ? cookieChallengeToken : '',
          tokenData.userId,
        );
        if (!expectedChallenge) {
          await recordAttemptResult(rateLimitKey, false);
          await recordFailedLogin(
            req,
            userIdentity,
            resolvedMethod,
            'Passkey challenge expired or missing',
          );
          return res
            .status(400)
            .json({ message: "Passkey challenge expired — please try again" });
        }

        // Look up the credential the user is asserting with. The
        // credential MUST belong to the user the temp token was issued
        // for — otherwise an attacker who phished a temp token could
        // pair it with someone else's passkey.
        const [storedCredential] = await storage.db
          .select()
          .from(webauthnCredentials)
          .where(
            and(
              eq(webauthnCredentials.credentialId, assertion.id),
              eq(webauthnCredentials.userId, tokenData.userId),
            ),
          )
          .limit(1);

        if (!storedCredential) {
          await recordAttemptResult(rateLimitKey, false);
          await recordFailedLogin(
            req,
            userIdentity,
            resolvedMethod,
            'Unknown passkey for this account',
          );
          return res
            .status(400)
            .json({ message: "Unknown passkey for this account" });
        }

        const credentialIdBytes = new Uint8Array(
          Buffer.from(storedCredential.credentialId, "base64url"),
        );
        const publicKeyBytes = new Uint8Array(
          Buffer.from(storedCredential.publicKey, "base64url"),
        );

        const verification = await verifyWebAuthnAuthentication(
          assertion,
          expectedChallenge,
          MFA_CONFIG.WEBAUTHN_ORIGIN,
          credentialIdBytes,
          publicKeyBytes,
          storedCredential.counter,
        );

        if (verification.verified) {
          // Bump the stored counter so a replay of this assertion is
          // rejected by the SimpleWebAuthn counter check next time.
          const newCounter =
            verification.authenticationInfo?.newCounter ??
            storedCredential.counter + 1;
          try {
            await storage.db
              .update(webauthnCredentials)
              .set({ counter: newCounter })
              .where(eq(webauthnCredentials.id, storedCredential.id));
          } catch (counterError) {
            // Don't fail the login if the counter update fails — the
            // session was still proven cryptographically. Just log it
            // so operators can see drift.
            console.error(
              "Failed to update WebAuthn credential counter:",
              counterError,
            );
          }
          isValid = true;
          usedFactor = 'webauthn';

          // Task #632: surface the stored recovery-code count on
          // the passkey success response too so an operator who
          // logs in exclusively with their passkey still gets
          // nudged when the stored count has drifted below the
          // threshold. Brings parity with the TOTP (#615) and
          // recovery (#602) success branches — without this query
          // a passkey-only operator could drift down to zero
          // recovery codes and never see the regenerate prompt.
          // Best-effort: a count failure must not block the
          // login.
          try {
            const remainingRows = await storage.db
              .select()
              .from(mfaRecoveryCodes)
              .where(and(
                eq(mfaRecoveryCodes.userId, tokenData.userId),
                isNull(mfaRecoveryCodes.usedAt),
              ));
            recoveryWarning = evaluateRecoveryCodesWarning(remainingRows.length);
          } catch (countError) {
            console.error('Failed to count remaining recovery codes:', countError);
          }
        }
      } else if (code && user.totpSecretEnc) {
        // Verify TOTP code
        resolvedMethod = 'mfa-totp';
        const secret = decryptText(user.totpSecretEnc);
        isValid = verifyTotpCode(code, secret);
        if (isValid) {
          usedFactor = 'totp';

          // Task #615: surface the stored recovery-code count on
          // the TOTP success response too so an operator who logs
          // in with their authenticator still gets nudged when
          // they've drifted below the threshold. Best-effort —
          // a count failure must not block the login.
          try {
            const remainingRows = await storage.db
              .select()
              .from(mfaRecoveryCodes)
              .where(and(
                eq(mfaRecoveryCodes.userId, tokenData.userId),
                isNull(mfaRecoveryCodes.usedAt),
              ));
            recoveryWarning = evaluateRecoveryCodesWarning(remainingRows.length);
          } catch (countError) {
            console.error('Failed to count remaining recovery codes:', countError);
          }
        }
      } else if (recoveryCode) {
        // Verify recovery code — load the user's UNUSED hashes and
        // delegate the constant-time bcrypt match + replay-protection
        // contract to `findMatchingUnusedRecoveryCode` so the same
        // logic is unit-tested without the full route harness
        // (Task #595).
        resolvedMethod = 'mfa-recovery';
        const recoveryCodes = await storage.db
          .select()
          .from(mfaRecoveryCodes)
          .where(and(
            eq(mfaRecoveryCodes.userId, tokenData.userId),
            isNull(mfaRecoveryCodes.usedAt)
          ));

        const matched = await findMatchingUnusedRecoveryCode(
          recoveryCodes.map((c: any) => ({ id: c.id, codeHash: c.codeHash })),
          recoveryCode,
        );

        if (matched) {
          // Mark the matched recovery code as used so the same code
          // can never satisfy a future challenge — the next attempt
          // will find the row filtered out by the `IS NULL` guard
          // above and `findMatchingUnusedRecoveryCode` will return
          // null. This is the replay-protection half of the
          // contract.
          await storage.db
            .update(mfaRecoveryCodes)
            .set({ usedAt: new Date() })
            .where(eq(mfaRecoveryCodes.id, matched.id));
          isValid = true;
          usedFactor = 'recovery';

          // Count how many unused recovery codes the operator has
          // left AFTER consuming the matched one so the dialog can
          // surface a "X recovery codes remaining" notice and
          // prompt regeneration when the count drops below the
          // low-water threshold (Task #602). Best-effort: a count
          // failure must not block the operator from finishing the
          // login they already proved possession on — we just
          // skip the warning payload in that case.
          try {
            const remainingRows = await storage.db
              .select()
              .from(mfaRecoveryCodes)
              .where(and(
                eq(mfaRecoveryCodes.userId, tokenData.userId),
                isNull(mfaRecoveryCodes.usedAt),
              ));
            recoveryWarning = evaluateRecoveryCodesWarning(remainingRows.length);
          } catch (countError) {
            console.error('Failed to count remaining recovery codes:', countError);
          }
        }
      }

      if (!isValid) {
        await recordAttemptResult(rateLimitKey, false);
        // Failed MFA attempts go through the shared helper so they
        // land in `audit_logins` with success=false alongside the
        // earlier failure branches above (missing token, expired
        // token, rate-limited, MFA-not-enabled). This is the goal of
        // Task #601 (brute-force tries leave a trail) — implemented
        // here via Task #596's `recordFailedLogin` so all MFA
        // failure paths share one code path instead of inlining
        // their own `storage.createAuditLogin` call.
        await recordFailedLogin(
          req,
          {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          resolvedMethod,
          resolvedMethod === 'mfa-recovery'
            ? 'Invalid MFA recovery code'
            : resolvedMethod === 'mfa-webauthn'
              ? 'Invalid passkey assertion'
              : 'Invalid MFA verification code',
        );
        return res.status(400).json({ message: 'Invalid verification code' });
      }

      // Record successful attempt
      await recordAttemptResult(rateLimitKey, true);

      // Create authenticated session
      req.session.user = { id: tokenData.userId, email: user.email, role: user.role };

      // An SSO sign-in that needed CriteriaIQ MFA (ssoMfaHandoff.ts)
      // finishes here: keep the provider for RP-initiated logout and
      // record the login as `<provider>-mfa-totp` etc.
      const ssoProvider = takeSsoMfaBinding(req.session, tempToken, user.id);
      if (ssoProvider) {
        req.session.ssoProvider = ssoProvider;
        await storage.updateSsoUserLastLogin(user.id);
      }

      // Replay the same audit + login-stats + session-tracking
      // bookkeeping that the no-MFA branch in /api/login does so
      // MFA-gated logins show up in the audit trail, increment
      // loginCount, set lastLogin, and create a user_sessions row
      // (Task #596). Done after req.session.user is assigned so the
      // user_sessions row is keyed off the same sessionID the browser
      // will hold for the rest of the session. The `resolvedMethod`
      // here ('mfa-totp' / 'mfa-recovery' / 'mfa-webauthn') is what
      // gets written to audit_logins.loginMethod — this subsumes the
      // recovery-only
      // createAuditLogin call introduced by Task #595, so we don't
      // double-record recovery logins. `usedFactor` is retained above
      // for any future per-factor stats that need finer granularity
      // than the audit row's loginMethod string.
      await recordSuccessfulLogin(
        req,
        user,
        ssoProvider ? `${ssoProvider}-${resolvedMethod}` : resolvedMethod,
      );

      // Handle trusted device if requested
      if (rememberDevice) {
        const deviceToken = generateTrustedDeviceToken();
        const hashedToken = await hashTrustedDeviceToken(deviceToken);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

        await storage.db.insert(trustedDevices).values({
          userId: tokenData.userId,
          tokenHash: hashedToken,
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          expiresAt
        });

        res.cookie('trusted_device', deviceToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
        });
      }

      // Surface the recovery-code remaining count alongside the
      // success message so the dialog can render a "X recovery
      // codes remaining" notice and a regenerate prompt when the
      // count is low (Task #602). Originally attached only on the
      // recovery branch; Task #615 also attaches it on the TOTP
      // branch so a user who logs in with their authenticator
      // still gets nudged to regenerate when their stored count
      // has drifted below the threshold. Task #632 closes the
      // last gap by attaching it on the WebAuthn branch too, so
      // an operator who logs in exclusively with their passkey
      // gets the same nudge. All three MFA paths now reach
      // parity here.
      const responseBody: {
        message: string;
        recoveryCodesRemaining?: number;
        recoveryCodesLow?: boolean;
      } = { message: 'Authentication successful' };
      if (recoveryWarning) {
        responseBody.recoveryCodesRemaining = recoveryWarning.recoveryCodesRemaining;
        responseBody.recoveryCodesLow = recoveryWarning.recoveryCodesLow;
      }
      res.json(responseBody);
    } catch (error: any) {
      console.error('MFA challenge error:', error);
      res.status(500).json({ message: 'Failed to verify MFA challenge' });
    }
  });
}
