/**
 * Helpers for rendering `audit_logins.failureReason` strings.
 *
 * The `failureReason` column stores raw machine values written by the
 * authentication code paths (`server/auth/simpleAuth.ts` and
 * `server/auth/mfaChallengeRoute.ts`). Most reasons are free-form
 * English ("Invalid password", "MFA not enabled for user"), but Task
 * #613 introduced a dedicated `mfa_rate_limited` sentinel for the
 * brute-force lockout row that follows the 5-failure MFA ceiling.
 *
 * `describeLoginFailureReason` turns the raw value into a small
 * descriptor the Activity Log row can use to swap in a distinct icon,
 * label, and tooltip when the failure represents the lockout itself
 * — making the streak-then-lockout pattern impossible to miss.
 */
export type LoginFailureReasonDescriptor = {
  /** Original machine value, preserved for tooltips / accessibility. */
  raw: string;
  /**
   * True only for `mfa_rate_limited` — i.e. the audit row was written
   * because the account hit the 5-failure MFA ceiling and was
   * temporarily locked out. Drives the prominent visual marker (icon,
   * color, group container).
   */
  isBruteForceLockout: boolean;
  /** Short, scannable label for the row, e.g. "Brute-force lockout". */
  label: string;
  /** Long-form explanation suitable for a tooltip / aria-description. */
  tooltip: string;
};

/**
 * Convert a stored failureReason value into a UI descriptor. Anything
 * that isn't the well-known `mfa_rate_limited` sentinel falls back to
 * a generic descriptor — the existing per-row "Failed" treatment
 * stays unchanged for those.
 */
export function describeLoginFailureReason(
  rawInput: string | null | undefined,
): LoginFailureReasonDescriptor {
  const raw = (rawInput ?? "").trim();

  if (raw === "mfa_rate_limited") {
    return {
      raw,
      isBruteForceLockout: true,
      label: "Brute-force lockout",
      tooltip:
        "5 failed MFA attempts in 15 minutes — account temporarily locked out",
    };
  }

  return {
    raw: raw || "",
    isBruteForceLockout: false,
    label: raw || "Failed login",
    tooltip: raw || "Failed login",
  };
}
