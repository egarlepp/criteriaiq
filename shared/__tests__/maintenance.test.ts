import { describe, it, expect } from "vitest";
import { countdownParts, maintenanceEndsAt, maintenancePhase, maintenanceWindowSchema } from "../maintenance";

const window = { startsAt: "2026-11-01T10:00:00.000Z", durationMinutes: 30, message: null };

describe("maintenance window", () => {
  it("moves from upcoming to active to ended", () => {
    expect(maintenancePhase(window, new Date("2026-11-01T09:59:59Z"))).toBe("upcoming");
    expect(maintenancePhase(window, new Date("2026-11-01T10:00:00Z"))).toBe("active");
    expect(maintenancePhase(window, new Date("2026-11-01T10:30:00Z"))).toBe("ended");
    expect(maintenanceEndsAt(window).toISOString()).toBe("2026-11-01T10:30:00.000Z");
  });

  it("validates the window", () => {
    expect(maintenanceWindowSchema.safeParse(window).success).toBe(true);
    expect(maintenanceWindowSchema.safeParse({ ...window, durationMinutes: 2 }).success).toBe(false);
    expect(maintenanceWindowSchema.safeParse({ ...window, startsAt: "tomorrow" }).success).toBe(false);
    expect(maintenanceWindowSchema.safeParse({ ...window, message: "x".repeat(301) }).success).toBe(false);
  });

  it("splits a countdown", () => {
    expect(countdownParts((26 * 3600 + 5 * 60 + 7) * 1000)).toEqual({ days: 1, hours: 2, minutes: 5, seconds: 7 });
    expect(countdownParts(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
