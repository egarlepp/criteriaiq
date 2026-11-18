// @vitest-environment node
//
// Outlook write-back of MAP due dates: the Graph event CriteriaIQ writes,
// and the per-person sync that adds, moves and removes them.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  listOpenMapItemsDueBetween: vi.fn(),
  listOutlookMapEvents: vi.fn(),
  saveOutlookMapEvent: vi.fn(),
  deleteOutlookMapEvent: vi.fn(),
  deleteOutlookMapEventRows: vi.fn(),
}));
const tokenMock = vi.hoisted(() => vi.fn());
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../user-connection", () => ({ getOutlookAccessToken: tokenMock }));
vi.mock("../config", () => ({
  getActiveOutlookSigninConfig: vi.fn(),
  getOutlookSigninConfig: vi.fn(async () => config),
}));
vi.mock("../../lib/app-config", () => ({ getPublicAppUrl: () => "https://ciq.test" }));

import { dueDateEventBody } from "../calendar-write";
import {
  dueEventSubject,
  removeOutlookMapDueDatesForUser,
  syncOutlookMapDueDatesForUser,
} from "../../services/outlook-map-due-dates";

const config = {
  enabled: true,
  tenantId: "contoso.com",
  clientId: "c",
  clientSecret: "s",
  readWorkingHours: false,
  writeMapDueDates: true,
};
const deps = { config: async () => config, now: () => new Date("2026-11-02T12:00:00Z") };

function response(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const item = (id: number, due: string, extra: Record<string, unknown> = {}) => ({
  itemType: "task",
  id,
  name: `Task ${id}`,
  projectId: 5,
  projectName: "Acme POC",
  customerName: "Acme",
  dueDate: new Date(`${due}T12:00:00Z`),
  ownerId: "u1",
  ...extra,
});

describe("MAP due-date events", () => {
  it("are all day, Free, without a reminder, in the person's time zone", () => {
    expect(dueDateEventBody({ subject: "Due: X", dueDate: "2026-12-31", link: "https://ciq.test/p", timeZone: "Europe/Berlin" })).toEqual({
      subject: "Due: X",
      isAllDay: true,
      showAs: "free",
      isReminderOn: false,
      start: { dateTime: "2026-12-31T00:00:00", timeZone: "Europe/Berlin" },
      end: { dateTime: "2027-01-01T00:00:00", timeZone: "Europe/Berlin" },
      body: { contentType: "text", content: "https://ciq.test/p" },
    });
  });

  it("names the due date in the person's language", () => {
    expect(dueEventSubject("Kickoff", "Acme POC", "de-DE")).toBe("Fällig: Kickoff (Acme POC)");
    expect(dueEventSubject("Kickoff", null, "xx-XX")).toBe("Due: Kickoff");
  });
});

describe("syncOutlookMapDueDatesForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of [storageMock.saveOutlookMapEvent, storageMock.deleteOutlookMapEvent, storageMock.deleteOutlookMapEventRows]) {
      fn.mockResolvedValue(undefined);
    }
    storageMock.getUser.mockResolvedValue({ id: "u1", role: "Engineer", isActive: true, timezone: "America/New_York", preferredLocale: "en-US" });
    tokenMock.mockResolvedValue("tok");
  });

  it("adds new due dates, moves changed ones and removes finished ones", async () => {
    storageMock.listOpenMapItemsDueBetween.mockResolvedValue([item(1, "2026-11-10"), item(2, "2026-11-12"), item(3, "2026-11-20")]);
    storageMock.listOutlookMapEvents.mockResolvedValue([
      { id: 11, itemType: "task", itemId: 2, graphEventId: "ev2", dueDate: "2026-11-11", subject: "Due: Task 2 (Acme POC)" },
      { id: 13, itemType: "task", itemId: 3, graphEventId: "ev3", dueDate: "2026-11-20", subject: "Due: Task 3 (Acme POC)" },
      { id: 19, itemType: "task", itemId: 9, graphEventId: "ev9", dueDate: "2026-11-05", subject: "Due: Task 9 (Acme POC)" },
    ]);
    const fetchFn = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === "POST") return response(201, { id: "ev1" });
      return init.method === "DELETE" ? response(204) : response(200, {});
    });

    expect(await syncOutlookMapDueDatesForUser("u1", { ...deps, fetchFn: fetchFn as unknown as typeof fetch })).toBe("synced");

    const calls = fetchFn.mock.calls.map(([url, init]) => `${init.method} ${url}`);
    expect(calls).toEqual([
      "POST https://graph.microsoft.com/v1.0/me/events",
      "PATCH https://graph.microsoft.com/v1.0/me/events/ev2",
      "DELETE https://graph.microsoft.com/v1.0/me/events/ev9",
    ]);
    expect(storageMock.listOpenMapItemsDueBetween).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), ["u1"]);
    expect(storageMock.saveOutlookMapEvent).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 1, graphEventId: "ev1", dueDate: "2026-11-10", subject: "Due: Task 1 (Acme POC)" }),
    );
    expect(storageMock.saveOutlookMapEvent).toHaveBeenCalledWith(expect.objectContaining({ itemId: 2, graphEventId: "ev2", dueDate: "2026-11-12" }));
    expect(storageMock.deleteOutlookMapEvent).toHaveBeenCalledWith(19);
    const created = JSON.parse(String(fetchFn.mock.calls[0][1].body));
    expect(created.start).toEqual({ dateTime: "2026-11-10T00:00:00", timeZone: "America/New_York" });
    expect(created.body.content).toBe("https://ciq.test/project/5?tab=map");
  });

  it("adds the event again when the person deleted it in Outlook", async () => {
    storageMock.listOpenMapItemsDueBetween.mockResolvedValue([item(2, "2026-11-12")]);
    storageMock.listOutlookMapEvents.mockResolvedValue([
      { id: 11, itemType: "task", itemId: 2, graphEventId: "gone", dueDate: "2026-11-11", subject: "x" },
    ]);
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) =>
      init.method === "PATCH" ? response(404, {}) : response(201, { id: "new" }),
    );
    expect(await syncOutlookMapDueDatesForUser("u1", { ...deps, fetchFn: fetchFn as unknown as typeof fetch })).toBe("synced");
    expect(storageMock.saveOutlookMapEvent).toHaveBeenCalledWith(expect.objectContaining({ graphEventId: "new" }));
  });

  it("reports a link made before write-back was on", async () => {
    storageMock.listOpenMapItemsDueBetween.mockResolvedValue([item(1, "2026-11-10")]);
    storageMock.listOutlookMapEvents.mockResolvedValue([]);
    const fetchFn = vi.fn(async () => response(403, {}));
    expect(await syncOutlookMapDueDatesForUser("u1", { ...deps, fetchFn: fetchFn as unknown as typeof fetch })).toBe("no_write");
    expect(storageMock.saveOutlookMapEvent).not.toHaveBeenCalled();
  });

  it("does nothing while the switch is off, or for outside users", async () => {
    expect(await syncOutlookMapDueDatesForUser("u1", { ...deps, config: async () => ({ ...config, writeMapDueDates: false }) })).toBe("skipped");
    storageMock.getUser.mockResolvedValue({ id: "u1", role: "Customer", isActive: true });
    expect(await syncOutlookMapDueDatesForUser("u1", deps)).toBe("skipped");
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it("removes every event it added when someone unlinks Outlook", async () => {
    storageMock.listOutlookMapEvents.mockResolvedValue([
      { id: 1, graphEventId: "a" },
      { id: 2, graphEventId: "b" },
    ]);
    const fetchFn = vi.fn(async () => response(204));
    expect(await removeOutlookMapDueDatesForUser("u1", { fetchFn: fetchFn as unknown as typeof fetch })).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(storageMock.deleteOutlookMapEventRows).toHaveBeenCalledWith("u1");
  });
});
