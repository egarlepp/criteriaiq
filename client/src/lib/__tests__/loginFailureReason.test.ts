// Behavior contract for `describeLoginFailureReason`: turn raw
// `audit_logins.failureReason` strings into a small UI descriptor so
// the Activity Log can swap in the brute-force-lockout treatment for
// the `mfa_rate_limited` sentinel written by Task #613.
//
// Pinning these in a unit test prevents a future renaming from
// silently demoting a brute-force lockout to a generic "Failed login"
// row again — the regression Task #619 is meant to prevent.

import { describe, it, expect } from "vitest";

import { describeLoginFailureReason } from "../loginFailureReason";

describe("describeLoginFailureReason", () => {
  it("flags the mfa_rate_limited sentinel as a brute-force lockout", () => {
    const info = describeLoginFailureReason("mfa_rate_limited");

    expect(info.isBruteForceLockout).toBe(true);
    expect(info.label).toBe("Brute-force lockout");
    // The tooltip is the security-relevant explanation an admin sees
    // on hover; pin the wording so renames don't silently water it
    // down to "Failed login".
    expect(info.tooltip).toContain("5 failed MFA attempts");
    expect(info.tooltip).toContain("15 minutes");
    expect(info.tooltip).toContain("locked out");
  });

  it("does NOT mark generic failure reasons as brute-force lockouts", () => {
    expect(
      describeLoginFailureReason("Invalid password").isBruteForceLockout,
    ).toBe(false);
    expect(
      describeLoginFailureReason("MFA not enabled for user").isBruteForceLockout,
    ).toBe(false);
    expect(
      describeLoginFailureReason("Invalid or expired MFA temporary token")
        .isBruteForceLockout,
    ).toBe(false);
  });

  it("treats null / undefined / empty values as a non-lockout failure", () => {
    expect(describeLoginFailureReason(null).isBruteForceLockout).toBe(false);
    expect(describeLoginFailureReason(undefined).isBruteForceLockout).toBe(
      false,
    );
    expect(describeLoginFailureReason("").isBruteForceLockout).toBe(false);
    expect(describeLoginFailureReason("   ").isBruteForceLockout).toBe(false);
  });

  it("trims surrounding whitespace before matching the sentinel", () => {
    // Defensive — if the audit row ever ships with stray whitespace
    // (e.g. accidental trailing newline in a future caller) the
    // lockout treatment must still fire.
    expect(
      describeLoginFailureReason("  mfa_rate_limited  ").isBruteForceLockout,
    ).toBe(true);
  });
});
