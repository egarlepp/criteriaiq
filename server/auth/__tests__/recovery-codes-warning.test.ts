// @vitest-environment node
//
// Regression coverage for the recovery-codes-low warning contract
// added in Task #602.
//
// `evaluateRecoveryCodesWarning` is the small helper extracted out of
// `/api/mfa/challenge` so we can prove the threshold-and-clamp logic
// without standing up the full Express stack. After a successful
// recovery-code login the route now passes the post-consumption
// `COUNT(*)` of unused recovery codes through this helper and
// surfaces the result to the dialog as `recoveryCodesRemaining` /
// `recoveryCodesLow`. The dialog uses the boolean to switch between
// the gentle "consider regenerating" notice and the louder "you're
// about to be locked out — regenerate now" prompt, so the threshold
// must stay pinned: bumping it silently from 3 to 0 would defeat the
// whole point of Task #602.
//
// What we lock in here:
//
//   * The numeric threshold itself (RECOVERY_CODES_LOW_THRESHOLD = 3)
//     so a one-character edit in mfaUtils.ts trips a deterministic
//     unit failure instead of waiting for an operator to discover
//     they ran out.
//   * The strict-`<` semantics: a fresh batch of exactly 3 codes is
//     NOT yet low — only burning into the 0-1-2 range fires the
//     prompt. A regression that flipped this to `<=` would nag
//     operators every time they accepted a brand-new batch.
//   * The clamp on bogus inputs (negative, NaN, Infinity, fractional)
//     so a future caller that hands us a stale or off-by-one count
//     can't poison the response with a NaN/Infinity that the React
//     i18n `count` interpolation would render as "NaN recovery codes
//     remaining".

import { describe, expect, it } from "vitest";
import {
  RECOVERY_CODES_LOW_THRESHOLD,
  evaluateRecoveryCodesWarning,
} from "../mfaUtils";

describe("evaluateRecoveryCodesWarning (Task #602)", () => {
  it("pins the low-water threshold at 3 so the dialog and the route share one source of truth", () => {
    // The dialog reads the boolean off the response, but the
    // *number* is what shows up in the UI ("X codes remaining"),
    // so a mismatch between threshold-here and threshold-as-read-by-
    // the-prompt would silently break the contract. Locking the
    // exported constant here means the next maintainer who tweaks
    // the threshold has to update this expectation in the same PR.
    expect(RECOVERY_CODES_LOW_THRESHOLD).toBe(3);
  });

  it("flags the count as low when the post-consumption remaining is strictly below the threshold", () => {
    // 2 < 3 → low. This is the canonical "after the recovery login
    // burns one of your 3 codes you're down to 2" scenario; the
    // dialog must render the loud regenerate-now prompt here.
    expect(evaluateRecoveryCodesWarning(2)).toEqual({
      recoveryCodesRemaining: 2,
      recoveryCodesLow: true,
    });
    // 1 and 0 are even worse — both must trip `low`. The 0 case
    // is the one that motivated this task: an operator who burns
    // their last code currently has zero feedback that they're
    // about to be locked out.
    expect(evaluateRecoveryCodesWarning(1).recoveryCodesLow).toBe(true);
    expect(evaluateRecoveryCodesWarning(0).recoveryCodesLow).toBe(true);
  });

  it("does NOT flag the count as low when the remaining sits exactly at the threshold (strict `<`)", () => {
    // A user who just regenerated a fresh batch of 10 codes and
    // immediately uses one is at 9 — clearly fine. But the
    // boundary case (exactly 3 left) is what really pins the
    // strict-`<` semantics: if a refactor flipped this to `<=`,
    // every fresh batch of 3 would fire the loud prompt the
    // moment it was issued, which is the opposite of what we
    // want. This assertion is the canary for that regression.
    expect(evaluateRecoveryCodesWarning(3)).toEqual({
      recoveryCodesRemaining: 3,
      recoveryCodesLow: false,
    });
    expect(evaluateRecoveryCodesWarning(9).recoveryCodesLow).toBe(false);
    expect(evaluateRecoveryCodesWarning(10).recoveryCodesLow).toBe(false);
  });

  it("clamps bogus inputs to 0 so a stale/off-by-one count never renders as NaN or a negative number in the UI", () => {
    // The route gets `remaining` from `select().from(...).length`
    // — a `Number.isNaN` or negative value should be impossible
    // there, but the helper is a public export and a future
    // caller could pass an off-by-one without realising it. The
    // clamp keeps the response shape valid (a non-negative
    // integer) and forces the `low` flag on, since "we don't
    // know how many you have" is functionally identical to "you
    // have zero" from the operator's safety perspective.
    expect(evaluateRecoveryCodesWarning(-1)).toEqual({
      recoveryCodesRemaining: 0,
      recoveryCodesLow: true,
    });
    expect(evaluateRecoveryCodesWarning(Number.NaN)).toEqual({
      recoveryCodesRemaining: 0,
      recoveryCodesLow: true,
    });
    expect(evaluateRecoveryCodesWarning(Number.POSITIVE_INFINITY)).toEqual({
      recoveryCodesRemaining: 0,
      recoveryCodesLow: true,
    });
    // Fractional remaining (theoretically impossible from a SQL
    // COUNT but cheap to defend against) floors to an integer so
    // the UI's `count`-aware pluralisation never sees a decimal.
    expect(evaluateRecoveryCodesWarning(2.7)).toEqual({
      recoveryCodesRemaining: 2,
      recoveryCodesLow: true,
    });
  });
});
