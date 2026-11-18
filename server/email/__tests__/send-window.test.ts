// Send Email Window rules (Configuration › Scheduler): quiet hours with a
// timezone and scope, the per-schedule override, sign-in email exemption,
// and the hourly-limit reservation's fail-open behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getEmailAutomationConfig: vi.fn(),
  reserveHourlyEmailSlot: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));

import {
  SEND_WINDOW_DEFAULTS,
  clearSendWindowCache,
  digestQuietHoursDecision,
  isExemptEmailCategory,
  isWithinQuietHours,
  localHour,
  reserveEmailSendSlot,
  ruleEmailQuietHoursDecision,
  settingsFromRow,
  type SendWindowSettings,
} from "../send-window";

// 2026-10-21 03:30 UTC = 23:30 the day before in New York (EDT, UTC-4).
const NIGHT_UTC = new Date("2026-10-21T03:30:00Z");
// 2026-10-21 15:30 UTC = 11:30 in New York.
const DAY_UTC = new Date("2026-10-21T15:30:00Z");

function settings(patch: Partial<SendWindowSettings> = {}): SendWindowSettings {
  return { ...SEND_WINDOW_DEFAULTS, timezone: "America/New_York", ...patch };
}

describe("quiet hours clock", () => {
  it("reads the hour in the configured timezone", () => {
    expect(localHour(NIGHT_UTC, "America/New_York")).toBe(23);
    expect(localHour(NIGHT_UTC, "UTC")).toBe(3);
  });

  it("wraps a window past midnight", () => {
    expect(isWithinQuietHours(NIGHT_UTC, 22, 7, "America/New_York")).toBe(true);
    expect(isWithinQuietHours(DAY_UTC, 22, 7, "America/New_York")).toBe(false);
  });

  it("handles a same-day window and treats start = end as never quiet", () => {
    expect(isWithinQuietHours(DAY_UTC, 9, 17, "America/New_York")).toBe(true);
    expect(isWithinQuietHours(DAY_UTC, 12, 17, "America/New_York")).toBe(false);
    expect(isWithinQuietHours(DAY_UTC, 11, 11, "America/New_York")).toBe(false);
  });

  it("falls back to the server timezone for an unknown zone", () => {
    expect(() => localHour(DAY_UTC, "Not/AZone")).not.toThrow();
  });
});

describe("digest quiet hours", () => {
  it("does nothing while quiet hours are off", () => {
    expect(digestQuietHoursDecision(settings(), {}, NIGHT_UTC).held).toBe(false);
  });

  it("holds a digest inside the global window", () => {
    const decision = digestQuietHoursDecision(settings({ quietHoursEnabled: true }), {}, NIGHT_UTC);
    expect(decision.held).toBe(true);
    expect(decision.reason).toContain("22:00-07:00 America/New_York");
    expect(digestQuietHoursDecision(settings({ quietHoursEnabled: true }), {}, DAY_UTC).held).toBe(false);
  });

  it("holds digests under either scope", () => {
    const all = settings({ quietHoursEnabled: true, quietHoursScope: "all" });
    expect(digestQuietHoursDecision(all, null, NIGHT_UTC).held).toBe(true);
  });

  it("uses the schedule's own hours when it opted out of the global window", () => {
    const own = { useGlobalQuietHours: false, quietHoursStart: 10, quietHoursEnd: 12 };
    // Global off, schedule's own 10-12 covers 11:30.
    const decision = digestQuietHoursDecision(settings(), own, DAY_UTC);
    expect(decision.held).toBe(true);
    expect(decision.reason).toContain("this schedule's quiet hours");
    // Global on (22-7 covers 23:30) but the schedule's own hours don't.
    expect(digestQuietHoursDecision(settings({ quietHoursEnabled: true }), own, NIGHT_UTC).held).toBe(false);
  });

  it("ignores an opt-out without both hours", () => {
    const decision = digestQuietHoursDecision(
      settings({ quietHoursEnabled: true }),
      { useGlobalQuietHours: false, quietHoursStart: 22 },
      NIGHT_UTC,
    );
    expect(decision.held).toBe(false);
  });
});

describe("rule email quiet hours", () => {
  it("only holds rule emails when the scope is all automated email", () => {
    const digestsOnly = settings({ quietHoursEnabled: true });
    expect(ruleEmailQuietHoursDecision(digestsOnly, "Project Notifications", NIGHT_UTC).held).toBe(false);
    const all = settings({ quietHoursEnabled: true, quietHoursScope: "all" });
    expect(ruleEmailQuietHoursDecision(all, "Project Notifications", NIGHT_UTC).held).toBe(true);
    expect(ruleEmailQuietHoursDecision(all, "Project Notifications", DAY_UTC).held).toBe(false);
  });

  it("never holds sign-in emails", () => {
    const all = settings({ quietHoursEnabled: true, quietHoursScope: "all" });
    expect(ruleEmailQuietHoursDecision(all, "Authentication", NIGHT_UTC).held).toBe(false);
    expect(isExemptEmailCategory(" authentication ")).toBe(true);
    expect(isExemptEmailCategory("MAP")).toBe(false);
    expect(isExemptEmailCategory(null)).toBe(false);
  });
});

describe("settings from the stored row", () => {
  it("uses defaults before anything is saved", () => {
    expect(settingsFromRow(null)).toEqual(SEND_WINDOW_DEFAULTS);
  });

  it("reads the saved values and sanitizes bad ones", () => {
    const row = {
      quietHoursEnabled: true,
      defaultQuietHoursStart: 40,
      defaultQuietHoursEnd: 6,
      quietHoursScope: "something",
      sendWindowTimezone: "Europe/Paris",
      maxEmailsPerHour: 0,
    } as unknown as Parameters<typeof settingsFromRow>[0];
    expect(settingsFromRow(row)).toEqual({
      quietHoursEnabled: true,
      quietHoursStart: 22,
      quietHoursEnd: 6,
      quietHoursScope: "digests",
      timezone: "Europe/Paris",
      maxEmailsPerHour: 0,
    });
  });
});

describe("hourly limit reservation", () => {
  beforeEach(() => {
    clearSendWindowCache();
    storageMock.getEmailAutomationConfig.mockReset().mockResolvedValue({ maxEmailsPerHour: 25 });
    storageMock.reserveHourlyEmailSlot.mockReset();
  });

  it("asks storage for a slot under the configured limit", async () => {
    storageMock.reserveHourlyEmailSlot.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await reserveEmailSendSlot("MAP")).toBe(true);
    expect(await reserveEmailSendSlot("MAP")).toBe(false);
    expect(storageMock.reserveHourlyEmailSlot).toHaveBeenCalledWith(25);
  });

  it("never counts or blocks sign-in emails", async () => {
    expect(await reserveEmailSendSlot("Authentication")).toBe(true);
    expect(storageMock.reserveHourlyEmailSlot).not.toHaveBeenCalled();
  });

  it("lets the email through when the counter can't be reached", async () => {
    storageMock.reserveHourlyEmailSlot.mockRejectedValueOnce(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await reserveEmailSendSlot("digest")).toBe(true);
    warn.mockRestore();
  });
});
