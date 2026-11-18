// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getProjectScheduling: vi.fn(),
  getWorkingCalendarsForUsers: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));

import { datesForNewOwner, isUpcoming, taskOwnerId, upcomingLimits } from "../map-scheduling";

describe("map scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getProjectScheduling.mockResolvedValue({ primaryEngineerId: "u1", scheduleByTaskOwner: true });
    storageMock.getWorkingCalendarsForUsers.mockResolvedValue(new Map([["u2", { holidays: new Set(["2026-12-28"]) }]]));
  });

  it("picks the internal owner before the customer owner", () => {
    expect(taskOwnerId({ assignedToUserId: "u1", assignedToCustomerUserId: "c1" })).toBe("u1");
    expect(taskOwnerId({ assignedToUserId: null, assignedToCustomerUserId: "c1" })).toBe("c1");
    expect(taskOwnerId({})).toBeNull();
  });

  it("moves dates off the new owner's weekend and holiday", async () => {
    const out = await datesForNewOwner(
      1,
      { startDate: new Date("2026-12-26T12:00:00Z"), dueDate: "2026-12-28T12:00:00.000Z" },
      "u2",
    );
    expect(out).toEqual({ startDate: "2026-12-29T12:00:00.000Z", dueDate: "2026-12-29T12:00:00.000Z" });
    expect(storageMock.getWorkingCalendarsForUsers).toHaveBeenCalledWith(["u2"], "2026-12-26", expect.any(String));
  });

  it("leaves dates on working days alone", async () => {
    const out = await datesForNewOwner(1, { startDate: "2026-12-22T12:00:00.000Z", dueDate: "2026-12-23T12:00:00.000Z" }, "u2");
    expect(out).toEqual({});
  });

  it("does nothing when the project plans on the project owner's calendar", async () => {
    storageMock.getProjectScheduling.mockResolvedValue({ primaryEngineerId: "u1", scheduleByTaskOwner: false });
    const out = await datesForNewOwner(1, { startDate: "2026-12-26T12:00:00.000Z", dueDate: null }, "u2");
    expect(out).toEqual({});
    expect(storageMock.getWorkingCalendarsForUsers).not.toHaveBeenCalled();
  });

  it("does nothing for a task without dates or owner", async () => {
    expect(await datesForNewOwner(1, { startDate: null, dueDate: null }, "u2")).toEqual({});
    expect(await datesForNewOwner(1, { startDate: "2026-12-26T12:00:00.000Z", dueDate: null }, null)).toEqual({});
    expect(storageMock.getProjectScheduling).not.toHaveBeenCalled();
  });

  it("counts upcoming in working days on each person's calendar", async () => {
    storageMock.getWorkingCalendarsForUsers.mockResolvedValue(
      new Map<string | null, { holidays: Set<string> }>([[null, { holidays: new Set() }], ["u2", { holidays: new Set(["2026-12-25"]) }]]),
    );
    // Monday 2026-12-21: five working days later is 12-28; with the 25th off it's 12-29.
    const now = new Date("2026-12-21T09:00:00Z");
    const limits = await upcomingLimits(["u2"], now);
    expect(limits.get(null)).toBe("2026-12-28");
    expect(limits.get("u2")).toBe("2026-12-29");
    expect(isUpcoming("2026-12-29T12:00:00.000Z", now, limits.get("u2"))).toBe(true);
    expect(isUpcoming("2026-12-29T12:00:00.000Z", now, limits.get(null))).toBe(false);
    expect(isUpcoming("2026-12-20T12:00:00.000Z", now, limits.get(null))).toBe(false);
    expect(isUpcoming(null, now, limits.get(null))).toBe(false);
  });
});
