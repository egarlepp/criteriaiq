/**
 * "Setup-already-complete banner dismissed" client marker (Task #457).
 *
 * Background: when the operator lands on `/` directly out of the setup
 * wizard ("Go to Login" from the Done step or the standalone health-
 * check view), `landing.tsx` shows a one-shot "Setup already complete"
 * callout if `/api/setup/status.adminExists` is true. Without state,
 * dismissing the banner would only hide it for the current React
 * render — any subsequent re-render in the same tab (form interaction,
 * tab focus, etc.) would resurface it. We persist the dismissal in
 * sessionStorage so the operator's "I've seen it, go away" choice
 * survives until the tab closes or a successful login clears it.
 *
 * Task #457: the literal `"criteriaiq:setupCompleteBannerDismissed"`
 * was previously inlined in two call sites in `landing.tsx` (the
 * banner-render gate in the mount effect, and the post-login cleanup
 * in `handleAuth`) plus its test file. A typo or rename in either
 * write or read site would silently break the "don't re-show the
 * 'Setup already complete' banner after dismiss" contract — the
 * banner would re-appear on every re-render — and the unit tests
 * would still pass against the stale local key. Hoisting the key
 * into this single shared constant (mirroring how
 * `from-setup-marker.ts` already owns `criteriaiq:fromSetup` and
 * `session-marker.ts` already owns `criteriaiq:hadSession`) eliminates
 * this drift class entirely.
 *
 * All three helpers swallow storage errors (private browsing, quota,
 * disabled storage) so the navigation flow never breaks because of a
 * marker-write failure. The cost of a missing marker is one extra
 * (harmless) banner re-render, which is a safe degradation — local
 * React state still hides the banner for the current view.
 */

/**
 * The single source of truth for the underlying sessionStorage key.
 * Exported so test suites can import it instead of re-declaring the
 * literal — that keeps the entire codebase down to ONE textual
 * occurrence of the string, which is the whole point of Task #457.
 * Production code should NOT import this constant directly; use the
 * mark / clear / has helpers below so storage-error handling stays
 * consistent.
 */
export const SETUP_COMPLETE_BANNER_DISMISSED_KEY =
  "criteriaiq:setupCompleteBannerDismissed";

/**
 * Record that the operator dismissed the "Setup already complete"
 * callout on the landing page. Call this from the banner's dismiss
 * button handler so a subsequent re-render in the same tab does not
 * resurface the callout.
 */
export function markSetupCompleteBannerDismissed(): void {
  try {
    window.sessionStorage.setItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY, "1");
  } catch {
    /* sessionStorage unavailable (private browsing, quota, blocked) —
     * the local React state still hides the banner for the current
     * view; a future re-render may resurface it. Acceptable
     * degradation. */
  }
}

/**
 * Clear the marker. Call from Landing on a successful login so a
 * subsequent sign-out → re-show login flow in the same tab gets a
 * fresh "Setup already complete" banner if the operator re-enters
 * the wizard.
 */
export function clearSetupCompleteBannerDismissed(): void {
  try {
    window.sessionStorage.removeItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY);
  } catch {
    /* see markSetupCompleteBannerDismissed — silent on storage errors. */
  }
}

/**
 * Has the operator already dismissed the "Setup already complete"
 * banner in this tab? Used by Landing's mount effect to short-circuit
 * the banner-render gate before any /api/setup/status call.
 */
export function hasSetupCompleteBannerDismissed(): boolean {
  try {
    return (
      window.sessionStorage.getItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY) ===
      "1"
    );
  } catch {
    /* If sessionStorage is unreadable we err toward NOT suppressing
     * the banner — surfacing a (possibly redundant) callout is the
     * safe failure mode for an operator returning from the wizard. */
    return false;
  }
}
