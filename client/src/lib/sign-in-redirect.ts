/**
 * Sending a signed-out user back to the sign-in page.
 *
 * The sign-in form is the Landing page, which App renders for every path
 * while /api/auth/user is 401, so a full reload of `/` is all it takes.
 * `/api/login` is POST-only: navigating the browser to it returns the
 * JSON 404 "API endpoint not found" as a bare white page.
 *
 * The sessionStorage flags tell Landing which one-time notice to show on
 * arrival. Storage errors are swallowed: the notice is optional, the
 * redirect is what matters.
 */

export const SESSION_EXPIRED_FLAG = "auth.sessionExpired";
export const SESSION_IDLE_TIMEOUT_FLAG = "auth.sessionIdleTimeout";

export type SessionEndReason = "expired" | "idle";

/** Flag the reason the session ended so Landing can explain it once. */
export function flagSessionEnded(reason: SessionEndReason): void {
  try {
    window.sessionStorage.setItem(
      reason === "idle" ? SESSION_IDLE_TIMEOUT_FLAG : SESSION_EXPIRED_FLAG,
      "1",
    );
  } catch {
    /* private mode / blocked storage: the notice is nice-to-have. */
  }
}

/**
 * Read and clear the flag set by flagSessionEnded. Idle wins when both are
 * set because it is the more specific explanation.
 */
export function consumeSessionEndReason(): SessionEndReason | null {
  try {
    const idle = window.sessionStorage.getItem(SESSION_IDLE_TIMEOUT_FLAG) === "1";
    const expired = window.sessionStorage.getItem(SESSION_EXPIRED_FLAG) === "1";
    window.sessionStorage.removeItem(SESSION_IDLE_TIMEOUT_FLAG);
    window.sessionStorage.removeItem(SESSION_EXPIRED_FLAG);
    if (idle) return "idle";
    if (expired) return "expired";
    return null;
  } catch {
    return null;
  }
}

/** Reload the app at `/` so the sign-in page shows, with an "expired" notice. */
export function redirectToSignIn(): void {
  flagSessionEnded("expired");
  window.location.href = "/";
}
