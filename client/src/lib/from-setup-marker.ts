/**
 * "Came-from-setup" client marker (Task #455 / Task #456).
 *
 * Background: when the operator clicks "Go to Login" from either the
 * setup wizard's Done step or the standalone health-check view, we
 * write a one-shot sessionStorage flag so downstream pages can tell
 * "this navigation is an explicit, intentional exit out of /setup"
 * apart from "the user just refreshed /". The flag has two consumers:
 *
 *   - `useAuth.ts` (Task #455) — when present, suppresses the
 *     Task #378 / #420 401 → /setup?reentry=1 bounce so the operator
 *     can actually reach the login form instead of being trapped on
 *     the diagnostic screen by the sticky `criteriaiq:hadSession`
 *     marker (dev auto-login, prior admin session, etc.).
 *   - `landing.tsx` — surfaces the "Setup already complete" callout
 *     when the flag is set AND `/api/setup/status.adminExists` is
 *     true. Cleared on successful login or banner dismiss.
 *
 * Task #456: the literal `"criteriaiq:fromSetup"` was previously
 * inlined in four call sites (setup.tsx, setup-health-check-view.tsx,
 * useAuth.ts, landing.tsx). A typo or rename in any one of them
 * silently breaks the bounce-suppression contract introduced by Task
 * #455 — the operator would once again be trapped on the diagnostic
 * screen, and unit tests would still pass against the stale key.
 * Hoisting the key into this single shared constant (mirroring how
 * `session-marker.ts` already owns `criteriaiq:hadSession`) eliminates
 * this drift class entirely.
 *
 * All three helpers swallow storage errors (private browsing, quota,
 * disabled storage) so the navigation flow never breaks because of a
 * marker-write failure. The cost of a missing marker is one extra
 * (harmless) bounce or a missing banner — both are safe degradations.
 */

/**
 * The single source of truth for the underlying sessionStorage key.
 * Exported so test suites can import it instead of re-declaring the
 * literal — that keeps the entire codebase down to ONE textual
 * occurrence of the string, which is the whole point of Task #456.
 * Production code should NOT import this constant directly; use the
 * mark / clear / has helpers below so storage-error handling stays
 * consistent.
 */
export const FROM_SETUP_KEY = "criteriaiq:fromSetup";

/**
 * Record that the operator is navigating to `/` directly out of the
 * setup wizard (Done step) or the health-check view. Call this
 * immediately before `window.location.href = "/"` from those exit
 * buttons.
 */
export function markCameFromSetup(): void {
  try {
    window.sessionStorage.setItem(FROM_SETUP_KEY, "1");
  } catch {
    /* sessionStorage unavailable (private browsing, quota, blocked) —
     * navigation still proceeds; useAuth's bounce may fire and the
     * landing-page banner just won't show. Acceptable degradation. */
  }
}

/**
 * Clear the marker. Call from Landing on a successful login or when
 * the operator dismisses the "Setup already complete" banner so a
 * subsequent sign-out → re-show login flow in the same tab does not
 * resurface the callout.
 */
export function clearCameFromSetup(): void {
  try {
    window.sessionStorage.removeItem(FROM_SETUP_KEY);
  } catch {
    /* see markCameFromSetup — silent on storage errors. */
  }
}

/**
 * Did the current navigation originate from a wizard "Go to Login"
 * click? Used by useAuth to suppress the 401 → /setup?reentry=1
 * bounce, and by Landing to gate the "Setup already complete" banner.
 */
export function hasCameFromSetup(): boolean {
  try {
    return window.sessionStorage.getItem(FROM_SETUP_KEY) === "1";
  } catch {
    /* If sessionStorage is unreadable we err toward NOT suppressing
     * the bounce / NOT showing the banner — those are the safe
     * fallbacks for callers that can't tell intent. */
    return false;
  }
}
