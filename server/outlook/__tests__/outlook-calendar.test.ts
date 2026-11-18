// @vitest-environment node
//
// Outlook out-of-office days and working days for work schedules, and the
// daily sync that stores them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  listOutlookConnectedUserIds: vi.fn(),
  syncOutlookTimeOff: vi.fn(),
  setOutlookWorkDays: vi.fn(),
}));
const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../user-connection", () => ({ getOutlookAccessToken: tokenMock }));
vi.mock("../../services/jobs/scheduler", () => ({ scheduleJob: vi.fn() }));

import { listOutOfOfficeDays, outOfOfficeDays, readOutlookWorkDays, workDaysFromGraph } from "../calendar";
import { MicrosoftAuthError } from "../oauth";
import { runOutlookScheduleSync, syncOutlookScheduleForUser } from "../../services/outlook-schedule-sync";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const oof = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({
  id,
  isAllDay: true,
  isCancelled: false,
  showAs: "oof",
  start: { dateTime: `${start}T00:00:00.0000000` },
  end: { dateTime: `${end}T00:00:00.0000000` },
  ...extra,
});

const config = { enabled: true, tenantId: "contoso.com", clientId: "c", clientSecret: "s", readWorkingHours: false, writeMapDueDates: false };

describe("Outlook calendar reading", () => {
  it("turns an all-day out-of-office event into inclusive dates", () => {
    expect(outOfOfficeDays(oof("e1", "2026-11-02", "2026-11-07"))).toEqual({ eventId: "e1", startDate: "2026-11-02", endDate: "2026-11-06" });
    expect(outOfOfficeDays(oof("e2", "2026-11-02", "2026-11-03"))).toEqual({ eventId: "e2", startDate: "2026-11-02", endDate: "2026-11-02" });
  });

  it("ignores busy, cancelled, timed and malformed events", () => {
    expect(outOfOfficeDays(oof("e", "2026-11-02", "2026-11-03", { showAs: "busy" }))).toBeNull();
    expect(outOfOfficeDays(oof("e", "2026-11-02", "2026-11-03", { isCancelled: true }))).toBeNull();
    expect(outOfOfficeDays(oof("e", "2026-11-02", "2026-11-03", { isAllDay: false }))).toBeNull();
    expect(outOfOfficeDays(oof("e", "not-a-date", "2026-11-03"))).toBeNull();
    expect(outOfOfficeDays(oof("", "2026-11-02", "2026-11-03"))).toBeNull();
  });

  it("pages through calendarView but only follows links back to Graph", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        json(200, { value: [oof("e1", "2026-11-02", "2026-11-03")], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skip=1" }),
      )
      .mockResolvedValueOnce(json(200, { value: [oof("e2", "2026-11-09", "2026-11-10")], "@odata.nextLink": "https://evil.test/next" }));
    const days = await listOutOfOfficeDays("tok", "2026-10-25", "2027-04-27", fetchFn as unknown as typeof fetch);
    expect(days.map((d) => d.eventId)).toEqual(["e1", "e2"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const first = new URL(fetchFn.mock.calls[0][0] as string);
    expect(first.origin + first.pathname).toBe("https://graph.microsoft.com/v1.0/me/calendarView");
    expect(first.searchParams.get("startDateTime")).toBe("2026-10-25T00:00:00Z");
    expect(first.searchParams.get("endDateTime")).toBe("2027-04-28T00:00:00Z");
  });

  it("reads working days, and treats a missing permission as none", async () => {
    expect(workDaysFromGraph(["monday", "Tuesday", "friday", "nope"])).toEqual([1, 2, 5]);
    const ok = vi.fn().mockResolvedValue(json(200, { daysOfWeek: ["sunday", "monday", "tuesday", "wednesday", "thursday"] }));
    expect(await readOutlookWorkDays("tok", ok as unknown as typeof fetch)).toEqual([0, 1, 2, 3, 4]);
    const forbidden = vi.fn().mockResolvedValue(json(403, { error: { code: "ErrorAccessDenied" } }));
    expect(await readOutlookWorkDays("tok", forbidden as unknown as typeof fetch)).toBeNull();
    const revoked = vi.fn().mockResolvedValue(json(401, {}));
    await expect(readOutlookWorkDays("tok", revoked as unknown as typeof fetch)).rejects.toBeInstanceOf(MicrosoftAuthError);
  });
});

describe("Outlook schedule sync", () => {
  const now = () => new Date("2026-10-29T05:30:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getUser.mockResolvedValue({ id: "u1", role: "Engineer", isActive: true });
    storageMock.listOutlookConnectedUserIds.mockResolvedValue(["u1"]);
    tokenMock.mockResolvedValue("tok");
  });

  it("stores out-of-office days for the window and leaves the work week alone when the admin hasn't allowed it", async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, { value: [oof("e1", "2026-11-02", "2026-11-04")] }));
    const result = await syncOutlookScheduleForUser("u1", { now, fetchFn: fetchFn as unknown as typeof fetch, config: async () => config });
    expect(result).toBe("synced");
    expect(storageMock.syncOutlookTimeOff).toHaveBeenCalledWith(
      "u1",
      [{ eventId: "e1", startDate: "2026-11-02", endDate: "2026-11-03" }],
      "2026-10-22",
      "2027-04-27",
    );
    expect(storageMock.setOutlookWorkDays).not.toHaveBeenCalled();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("sets the work week from Outlook when allowed", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(200, { value: [] }))
      .mockResolvedValueOnce(json(200, { daysOfWeek: ["monday", "tuesday", "wednesday", "thursday"] }));
    await syncOutlookScheduleForUser("u1", {
      now,
      fetchFn: fetchFn as unknown as typeof fetch,
      config: async () => ({ ...config, readWorkingHours: true }),
    });
    expect(storageMock.setOutlookWorkDays).toHaveBeenCalledWith("u1", [1, 2, 3, 4]);
  });

  it("skips outside users, inactive users and people with no token", async () => {
    storageMock.getUser.mockResolvedValueOnce({ id: "u1", role: "Customer", isActive: true });
    expect(await syncOutlookScheduleForUser("u1", { now, config: async () => config })).toBe("skipped");
    storageMock.getUser.mockResolvedValueOnce({ id: "u1", role: "Engineer", isActive: false });
    expect(await syncOutlookScheduleForUser("u1", { now, config: async () => config })).toBe("skipped");
    tokenMock.mockResolvedValueOnce(null);
    expect(await syncOutlookScheduleForUser("u1", { now, config: async () => config })).toBe("skipped");
    expect(await syncOutlookScheduleForUser("u1", { now, config: async () => null })).toBe("skipped");
    expect(storageMock.syncOutlookTimeOff).not.toHaveBeenCalled();
  });

  it("keeps going when one person's token is revoked, and reports it", async () => {
    storageMock.listOutlookConnectedUserIds.mockResolvedValue(["u1", "u2"]);
    tokenMock.mockRejectedValueOnce(new MicrosoftAuthError("refused", "invalid_grant", true)).mockResolvedValueOnce("tok");
    const fetchFn = vi.fn().mockResolvedValue(json(200, { value: [] }));
    const outcome = await runOutlookScheduleSync({ now, fetchFn: fetchFn as unknown as typeof fetch, config: async () => config });
    expect(outcome).toEqual({ status: "success", itemsProcessed: 1, message: "1 synced, 1 need to reconnect" });
  });

  it("does nothing without Outlook sign-in or anyone connected", async () => {
    expect(await runOutlookScheduleSync({ config: async () => null })).toEqual({ status: "skipped" });
    storageMock.listOutlookConnectedUserIds.mockResolvedValue([]);
    expect(await runOutlookScheduleSync({ config: async () => config })).toEqual({ status: "skipped" });
  });
});
