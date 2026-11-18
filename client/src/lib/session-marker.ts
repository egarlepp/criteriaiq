/**
 * "Just signed in" client marker.
 *
 * useAuth sends a 401 from /api/auth/user to the read-only Setup health
 * check (`/setup?reentry=1`) only in one narrow case: the operator signed
 * in moments ago and the server already does not recognise the session.
 * That is the "signed in and instantly bounced" symptom of a broken cookie
 * setup (Secure cookie dropped over plain HTTP, wrong trust-proxy hops,
 * a session store that lost the row). Every other 401 is an ordinary
 * expired or revoked session and goes to the sign-in page.
 *
 * The marker is the epoch-ms time of the last explicit sign-in. It is
 * written ONLY by the sign-in form and the MFA challenge (landing.tsx),
 * never by a successful /api/auth/user poll: refreshing it on every poll
 * kept it permanently fresh for an active user, so the 8-hour absolute
 * session TTL running out mid-session sent that user to Setup.
 *
 * The marker carries no auth state and never leaves the browser. A client
 * that forges it can at worst send itself to the health-check view, which
 * is read-only. All helpers swallow storage errors; a missing marker only
 * means the 401 goes to the sign-in page, which is the safe default.
 */

const SESSION_MARKER_KEY = "criteriaiq:hadSession";

/**
 * How long after an explicit sign-in a 401 still counts as "the cookie
 * never stuck". The broken-cookie case fails on the very first request
 * after the post-login reload, so a couple of minutes is plenty; anything
 * later is a normal expiry.
 */
export const SESSION_MARKER_FRESHNESS_MS = 2 * 60 * 1000;

/** Record an explicit sign-in (password form or MFA challenge). */
export function markSessionEstablished(): void {
  try {
    window.localStorage.setItem(SESSION_MARKER_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: a later 401 goes to sign-in, which is safe. */
  }
}

/** Clear the marker. Called from every sign-out path. */
export function clearSessionEstablished(): void {
  try {
    window.localStorage.removeItem(SESSION_MARKER_KEY);
  } catch {
    /* see markSessionEstablished */
  }
}

/**
 * Did this browser sign in within the freshness window? False when the
 * marker is missing, not a timestamp, older than the window, or storage
 * is unreadable.
 */
export function hasSessionEstablished(): boolean {
  try {
    const raw = window.localStorage.getItem(SESSION_MARKER_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return Date.now() - ts <= SESSION_MARKER_FRESHNESS_MS;
  } catch {
    return false;
  }
}
