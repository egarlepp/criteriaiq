// Behavior contract for `groupLockoutStreaks` /
// `selectLockoutStreakRows`: the Activity Log feed renders newest
// first, and Task #619 needs each `mfa_rate_limited` row to visually
// subsume up to 5 immediately-preceding failed MFA attempts from the
// *same* user, within the rate-limiter's 15-minute window. Pinning
// the helper here prevents a regression where the lockout silently
// disconnects from its streak.

import { describe, it, expect } from "vitest";

import {
  groupLockoutStreaks,
  selectLockoutStreakRows,
  type AuditLoginRow,
} from "../loginAuditGrouping";

type Row = AuditLoginRow & { id: number };

const MINUTE = 60_000;

function row(partial: Partial<Row> & { id: number; offsetMs: number }): Row {
  const base = new Date("2026-04-28T12:00:00Z").getTime();
  return {
    userId: "user-1",
    loginTime: new Date(base - partial.offsetMs).toISOString(),
    loginMethod: "mfa-totp",
    success: false,
    failureReason: null,
    ...partial,
  };
}

describe("groupLockoutStreaks", () => {
  it("attaches up to 5 preceding failed MFA attempts to a lockout row", () => {
    // Newest-first order, mirroring the API's DESC sort.
    const rows: Row[] = [
      row({ id: 100, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 5, offsetMs: 1 * MINUTE }),
      row({ id: 4, offsetMs: 2 * MINUTE }),
      row({ id: 3, offsetMs: 3 * MINUTE }),
      row({ id: 2, offsetMs: 4 * MINUTE }),
      row({ id: 1, offsetMs: 5 * MINUTE }),
      // Older failure outside the 15-minute window — must NOT join.
      row({ id: 0, offsetMs: 30 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);

    // The 5 preceding rows fold into the lockout group. The older
    // pre-window failure stays as its own single entry. So we expect
    // 2 entries total.
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("lockout-streak");
    if (groups[0].kind !== "lockout-streak") throw new Error("kind");
    expect(groups[0].lockout.id).toBe(100);
    expect(groups[0].preceding.map((p) => p.id)).toEqual([5, 4, 3, 2, 1]);

    expect(groups[1].kind).toBe("single");
    if (groups[1].kind !== "single") throw new Error("kind");
    expect(groups[1].login.id).toBe(0);
  });

  it("caps the streak at 5 even if there are more failures inside the window", () => {
    const rows: Row[] = [
      row({ id: 100, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 7, offsetMs: 1 * MINUTE }),
      row({ id: 6, offsetMs: 2 * MINUTE }),
      row({ id: 5, offsetMs: 3 * MINUTE }),
      row({ id: 4, offsetMs: 4 * MINUTE }),
      row({ id: 3, offsetMs: 5 * MINUTE }),
      row({ id: 2, offsetMs: 6 * MINUTE }),
      row({ id: 1, offsetMs: 7 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);

    if (groups[0].kind !== "lockout-streak") throw new Error("kind");
    expect(groups[0].preceding.map((p) => p.id)).toEqual([7, 6, 5, 4, 3]);
    // The two older failures that didn't make the cap stay in the
    // feed as standalone rows so an admin can still inspect them.
    const standaloneIds = groups
      .slice(1)
      .filter((g) => g.kind === "single")
      .map((g) => (g.kind === "single" ? g.login.id : -1));
    expect(standaloneIds).toEqual([2, 1]);
  });

  it("ignores failures from a different user when assembling the streak", () => {
    const rows: Row[] = [
      row({ id: 100, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 50, offsetMs: 1 * MINUTE, userId: "user-attacker-2" }),
      row({ id: 5, offsetMs: 2 * MINUTE }),
      row({ id: 4, offsetMs: 3 * MINUTE }),
      row({ id: 3, offsetMs: 4 * MINUTE }),
      row({ id: 2, offsetMs: 5 * MINUTE }),
      row({ id: 1, offsetMs: 6 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);
    if (groups[0].kind !== "lockout-streak") throw new Error("kind");
    expect(groups[0].preceding.map((p) => p.id)).toEqual([5, 4, 3, 2, 1]);

    // The other user's row stays standalone and is NOT consumed.
    const standalone = groups.find(
      (g) => g.kind === "single" && g.login.id === 50,
    );
    expect(standalone).toBeDefined();
  });

  it("does NOT fold non-MFA failures (e.g. failed password attempts) into the streak", () => {
    // The MFA rate-limit ceiling counts only MFA-stage attempts.
    // A failed password attempt (loginMethod === "email") that
    // happens to fall in the same 15-minute window did NOT
    // contribute to the lockout and must stay standalone — folding
    // it in would mis-attribute unrelated failures to the
    // brute-force streak and lie to the admin reading the timeline.
    const rows: Row[] = [
      row({
        id: 100,
        offsetMs: 0,
        failureReason: "mfa_rate_limited",
        loginMethod: "mfa-totp",
      }),
      // Failed *password* attempt right before the lockout — must
      // stay standalone, not fold into the lockout group.
      row({
        id: 9,
        offsetMs: 1 * MINUTE,
        loginMethod: "email",
        failureReason: "Invalid password",
      }),
      row({ id: 5, offsetMs: 2 * MINUTE, loginMethod: "mfa-totp" }),
      row({ id: 4, offsetMs: 3 * MINUTE, loginMethod: "mfa-recovery" }),
      row({ id: 3, offsetMs: 4 * MINUTE, loginMethod: "mfa-webauthn" }),
      row({ id: 2, offsetMs: 5 * MINUTE, loginMethod: "mfa-totp" }),
      row({ id: 1, offsetMs: 6 * MINUTE, loginMethod: "mfa-totp" }),
    ];

    const groups = groupLockoutStreaks(rows);
    if (groups[0].kind !== "lockout-streak") throw new Error("kind");
    expect(groups[0].preceding.map((p) => p.id)).toEqual([5, 4, 3, 2, 1]);

    // The failed password attempt remains as a standalone entry so
    // an admin can still see it — it just isn't claimed by the
    // lockout group.
    const standaloneIds = groups
      .filter((g) => g.kind === "single")
      .map((g) => (g.kind === "single" ? g.login.id : -1));
    expect(standaloneIds).toContain(9);
  });

  it("ignores successful rows even from the same user", () => {
    const rows: Row[] = [
      row({ id: 100, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 9, offsetMs: 1 * MINUTE, success: true, failureReason: null }),
      row({ id: 8, offsetMs: 2 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);
    if (groups[0].kind !== "lockout-streak") throw new Error("kind");
    // Only the failed row 8 joins; the successful row 9 stays alone.
    expect(groups[0].preceding.map((p) => p.id)).toEqual([8]);
    expect(groups.some((g) => g.kind === "single" && g.login.id === 9)).toBe(
      true,
    );
  });

  it("does NOT fold a back-to-back second lockout into the first lockout's group", () => {
    // Two lockouts in the same window — each must remain its own
    // group entry rather than collapsing into one. The failures in
    // between are claimed by the *most recent* lockout (the helper
    // walks newest-first), which prevents the older lockout from
    // visually "stealing" failures that arrived after it fired.
    const rows: Row[] = [
      row({ id: 200, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 6, offsetMs: 1 * MINUTE }),
      row({ id: 100, offsetMs: 2 * MINUTE, failureReason: "mfa_rate_limited" }),
      row({ id: 5, offsetMs: 3 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].kind).toBe("lockout-streak");
    expect(groups[1].kind).toBe("lockout-streak");
    if (groups[0].kind !== "lockout-streak" || groups[1].kind !== "lockout-streak")
      throw new Error("kind");
    expect(groups[0].lockout.id).toBe(200);
    // The newest lockout claims row 6 (the failure that arrived
    // between the two lockouts) but does NOT skip past lockout 100
    // to hoover up older failures — once it hits the prior lockout
    // it stops growing.
    expect(groups[0].preceding.map((p) => p.id)).toEqual([6]);
    expect(groups[1].lockout.id).toBe(100);
    expect(groups[1].preceding.map((p) => p.id)).toEqual([5]);
  });

  it("emits standalone rows when there is no lockout in the window", () => {
    const rows: Row[] = [
      row({ id: 3, offsetMs: 0, success: true, failureReason: null }),
      row({ id: 2, offsetMs: 1 * MINUTE }),
      row({ id: 1, offsetMs: 2 * MINUTE }),
    ];

    const groups = groupLockoutStreaks(rows);
    expect(groups).toHaveLength(3);
    expect(groups.every((g) => g.kind === "single")).toBe(true);
  });
});

describe("selectLockoutStreakRows", () => {
  it("returns lockout rows together with their preceding failures, in DESC order", () => {
    const rows: Row[] = [
      row({ id: 100, offsetMs: 0, failureReason: "mfa_rate_limited" }),
      row({ id: 3, offsetMs: 1 * MINUTE }),
      row({ id: 2, offsetMs: 2 * MINUTE }),
      row({ id: 1, offsetMs: 3 * MINUTE }),
      // Unrelated successful login from a different time — must be
      // omitted by the "Brute-force lockouts only" filter.
      row({ id: 50, offsetMs: 60 * MINUTE, success: true, failureReason: null }),
    ];

    const visible = selectLockoutStreakRows(rows);
    expect(visible.map((r) => r.id)).toEqual([100, 3, 2, 1]);
  });

  it("returns an empty list when no lockouts are present", () => {
    const rows: Row[] = [
      row({ id: 2, offsetMs: 0, success: true, failureReason: null }),
      row({ id: 1, offsetMs: 1 * MINUTE }),
    ];
    expect(selectLockoutStreakRows(rows)).toEqual([]);
  });
});
