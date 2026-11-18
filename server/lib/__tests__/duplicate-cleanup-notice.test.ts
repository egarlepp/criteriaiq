// @vitest-environment node
//
// Unit coverage for the two pure helpers behind the duplicate-cleanup
// notice surface. The route at /api/users/duplicate-cleanup-notice
// calls these directly.

import { describe, expect, it } from "vitest";
import {
  DUP_RENAME_REGEX,
  isNoticeDismissed,
  reconstructOriginalEmail,
} from "../duplicate-cleanup-notice";

describe("reconstructOriginalEmail", () => {
  it("strips the +dup<id>+<random> suffix", () => {
    expect(reconstructOriginalEmail("Foo+dup42+a3f1c8d2@example.com")).toBe(
      "Foo@example.com",
    );
  });

  it("preserves local-part casing outside the +dup segment", () => {
    expect(
      reconstructOriginalEmail("Mixed.CASE+dup7+abcdef01@Domain.COM"),
    ).toBe("Mixed.CASE@Domain.COM");
  });

  it("handles multi-digit ids", () => {
    expect(
      reconstructOriginalEmail("user+dup1234567+0123abcd@x.io"),
    ).toBe("user@x.io");
  });

  it("returns null for emails that never went through the rename", () => {
    expect(reconstructOriginalEmail("plain@example.com")).toBeNull();
    // Legitimate plus-addressed email that happens to start with +dup
    // — must not match.
    expect(reconstructOriginalEmail("foo+dup@example.com")).toBeNull();
    // Wrong number of hex chars.
    expect(
      reconstructOriginalEmail("foo+dup1+abc@example.com"),
    ).toBeNull();
    // Non-hex chars in the random segment.
    expect(
      reconstructOriginalEmail("foo+dup1+ZZZZZZZZ@example.com"),
    ).toBeNull();
  });

  it("returns null for null / undefined / empty input", () => {
    expect(reconstructOriginalEmail(null)).toBeNull();
    expect(reconstructOriginalEmail(undefined)).toBeNull();
    expect(reconstructOriginalEmail("")).toBeNull();
  });

  it("DUP_RENAME_REGEX is anchored on both halves of the suffix", () => {
    expect(DUP_RENAME_REGEX.test("legit+plus@example.com")).toBe(false);
    expect(DUP_RENAME_REGEX.test("foo+dup1+a3f1c8d2@x.com")).toBe(true);
  });
});

describe("isNoticeDismissed", () => {
  const T0 = new Date("2026-04-01T00:00:00Z");
  const T1 = new Date("2026-04-15T12:00:00Z");
  const T2 = new Date("2026-04-28T08:00:00Z");

  it("treats empty losers as trivially dismissed", () => {
    expect(isNoticeDismissed(null, [])).toBe(true);
    expect(isNoticeDismissed(T1, [])).toBe(true);
  });

  it("returns false when the admin has never dismissed the notice", () => {
    expect(isNoticeDismissed(null, [T0, T1])).toBe(false);
    expect(isNoticeDismissed(undefined, [T0])).toBe(false);
  });

  it("returns true when the admin dismissed after every known loser", () => {
    expect(isNoticeDismissed(T2, [T0, T1])).toBe(true);
  });

  it("returns true at the exact-equal boundary", () => {
    expect(isNoticeDismissed(T1, [T0, T1])).toBe(true);
  });

  it("returns false when a fresh loser appeared after the admin's dismissal", () => {
    expect(isNoticeDismissed(T0, [T2])).toBe(false);
  });

  it("ignores nullish entries in the loser-stamp list", () => {
    expect(isNoticeDismissed(T2, [null, undefined, T1])).toBe(true);
    expect(isNoticeDismissed(T0, [null, T2])).toBe(false);
    expect(isNoticeDismissed(T0, [null, undefined])).toBe(true);
  });

  it("accepts ISO-string timestamps as well as Date objects", () => {
    expect(isNoticeDismissed(T2.toISOString(), [T1.toISOString()])).toBe(true);
    expect(isNoticeDismissed(T0.toISOString(), [T2.toISOString()])).toBe(false);
  });

  it("treats an unparseable dismissed-at as not dismissed (fail open)", () => {
    expect(isNoticeDismissed("not-a-date", [T1])).toBe(false);
  });
});
