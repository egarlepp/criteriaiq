// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  listOpenMapItemsDueBetween: vi.fn(),
  getWorkingCalendarsForUsers: vi.fn(),
  listNotificationsOfKindSince: vi.fn(),
  getUser: vi.fn(),
  createUserNotifications: vi.fn(),
}));
const accessMock = vi.hoisted(() => ({ hasProjectAccess: vi.fn() }));
const emitMock = vi.hoisted(() => vi.fn());
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../lib/project-access", () => accessMock);
vi.mock("../automation-events", () => ({ emitAutomationEvent: emitMock }));
vi.mock("../jobs/scheduler", () => ({ scheduleJob: vi.fn() }));

import { dueSoonDaysRemaining, runMapDueSoon } from "../map-due-soon";

// 2026-12-23 Wednesday; 12-24 Thursday; 12-25 Friday; 12-28 Monday.
const noHolidays = { holidays: new Set<string>() };
const christmas = { holidays: new Set(["2026-12-25"]) };

function item(overrides: Record<string, unknown> = {}) {
  return {
    itemType: "task",
    id: 30,
    name: "Kick-off",
    projectId: 9001,
    projectName: "Widget",
    customerName: "Acme",
    dueDate: new Date("2026-12-28T12:00:00Z"),
    ownerId: "u2",
    ...overrides,
  };
}

describe("dueSoonDaysRemaining", () => {
  it("opens the window two working days before the due date", () => {
    expect(dueSoonDaysRemaining("2026-12-23", "2026-12-28", noHolidays)).toBeNull();
    expect(dueSoonDaysRemaining("2026-12-24", "2026-12-28", noHolidays)).toBe(2);
    expect(dueSoonDaysRemaining("2026-12-28", "2026-12-28", noHolidays)).toBe(0);
    expect(dueSoonDaysRemaining("2026-12-29", "2026-12-28", noHolidays)).toBeNull();
  });

  it("skips the owner's holidays when counting back", () => {
    // With the 25th off, two working days before the 28th is the 23rd.
    expect(dueSoonDaysRemaining("2026-12-23", "2026-12-28", christmas)).toBe(2);
    expect(dueSoonDaysRemaining("2026-12-22", "2026-12-28", christmas)).toBeNull();
  });
});

describe("runMapDueSoon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.listOpenMapItemsDueBetween.mockResolvedValue([item()]);
    storageMock.getWorkingCalendarsForUsers.mockResolvedValue(new Map([["u2", { holidays: new Set(["2026-12-25"]) }]]));
    storageMock.listNotificationsOfKindSince.mockResolvedValue([]);
    storageMock.getUser.mockResolvedValue({ id: "u2", role: "Engineer", email: "e@x.test", isActive: true, isApproved: true });
    storageMock.createUserNotifications.mockResolvedValue(1);
    accessMock.hasProjectAccess.mockResolvedValue(true);
  });

  it("notifies the owner once and emits the webhook event", async () => {
    const out = await runMapDueSoon(new Date("2026-12-23T07:00:00Z"));
    expect(out.status).toBe("success");
    expect(storageMock.createUserNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "u2",
        kind: "map_item_due_soon",
        projectId: 9001,
        params: expect.objectContaining({ itemType: "task", itemId: "30", dueDate: "2026-12-28", daysRemaining: "2" }),
        linkPath: "/project/9001?tab=map",
      }),
    ]);
    expect(emitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerKey: "map.task.due_soon",
        projectId: 9001,
        metadata: expect.objectContaining({ taskId: "30", taskName: "Kick-off", dueDate: "2026-12-28", daysRemaining: 2 }),
      }),
    );
  });

  it("doesn't remind again for the same due date", async () => {
    storageMock.listNotificationsOfKindSince.mockResolvedValue([
      { userId: "u2", params: { itemType: "task", itemId: "30", dueDate: "2026-12-28" } },
    ]);
    const out = await runMapDueSoon(new Date("2026-12-24T07:00:00Z"));
    expect(out.status).toBe("skipped");
    expect(storageMock.createUserNotifications).not.toHaveBeenCalled();
    expect(emitMock).not.toHaveBeenCalled();
  });

  it("waits until the window opens", async () => {
    const out = await runMapDueSoon(new Date("2026-12-22T07:00:00Z"));
    expect(out.status).toBe("skipped");
  });

  it("skips owners who can't open the project or are inactive", async () => {
    accessMock.hasProjectAccess.mockResolvedValueOnce(false);
    expect((await runMapDueSoon(new Date("2026-12-23T07:00:00Z"))).status).toBe("skipped");
    storageMock.getUser.mockResolvedValueOnce({ id: "u2", isActive: false });
    expect((await runMapDueSoon(new Date("2026-12-23T07:00:00Z"))).status).toBe("skipped");
  });
});
