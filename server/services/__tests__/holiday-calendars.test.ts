// @vitest-environment node
//
// Holiday calendars: the public-holiday download (date.nager.at) and the
// Admin routes on Admin › System Settings › Calendar.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const storageMock = vi.hoisted(() => ({
  getHolidayCalendar: vi.fn(),
  getHolidayCalendarByCode: vi.fn(),
  createHolidayCalendar: vi.fn(),
  updateHolidayCalendar: vi.fn(),
  countDefaultHolidayCalendars: vi.fn(),
  deleteHolidayCalendar: vi.fn(),
  listHolidayCalendars: vi.fn(),
  listHolidayDates: vi.fn(),
  upsertHolidayDate: vi.fn(),
  deleteHolidayDate: vi.fn(),
  replaceHolidayYear: vi.fn(),
  listHolidayAssignments: vi.fn(),
  setUserHolidayCalendars: vi.fn(),
  getUser: vi.fn(),
  getCustomer: vi.fn(),
  listAccountHolidayAssignments: vi.fn(),
  setAccountHolidayCalendars: vi.fn(),
  getUserHolidayCalendarView: vi.fn(),
}));
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import {
  clearHolidayCountriesCache,
  fetchCountryHolidays,
  fetchHolidayCountries,
  refreshHolidayCalendar,
  type FetchLike,
} from "../holiday-calendars";
import { registerHolidayCalendarRoutes } from "../../routes/holiday-calendar-routes";
import { defaultRefreshYears, isCountryCalendarCode } from "@shared/holiday-calendars";

function feed(status: number, body: unknown): FetchLike & { mock: { calls: unknown[][] } } {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as never;
}

describe("shared helpers", () => {
  it("treats only two upper-case letters as a country", () => {
    expect(isCountryCalendarCode("US")).toBe(true);
    expect(isCountryCalendarCode("us")).toBe(false);
    expect(isCountryCalendarCode("company-closures")).toBe(false);
  });
  it("downloads this year and next by default", () => {
    expect(defaultRefreshYears(new Date("2026-10-27T12:00:00Z"))).toEqual([2026, 2027]);
  });
});

describe("fetchCountryHolidays", () => {
  it("keeps nationwide holidays, joins two on one date, and sorts", async () => {
    const fetchFn = feed(200, [
      { date: "2026-12-25", name: "Christmas Day", global: true },
      { date: "2026-01-01", name: "New Year's Day", global: true },
      { date: "2026-03-02", name: "Texas Independence Day", global: false },
      { date: "2026-12-25", name: "Second holiday", global: true },
      { date: "2026-12-25", name: "Christmas Day", global: true },
      { date: "bad", name: "Broken" },
    ]);
    const dates = await fetchCountryHolidays("us", 2026, fetchFn);
    expect(dates).toEqual([
      { date: "2026-01-01", name: "New Year's Day" },
      { date: "2026-12-25", name: "Christmas Day / Second holiday" },
    ]);
    expect(fetchFn.mock.calls[0][0]).toBe("https://date.nager.at/api/v3/PublicHolidays/2026/US");
  });

  it("gives an empty list for a year or country the feed doesn't cover", async () => {
    expect(await fetchCountryHolidays("US", 2026, feed(404, null))).toEqual([]);
  });

  it("refuses anything but a two-letter code, so nothing else reaches the URL", async () => {
    const fetchFn = feed(200, []);
    await expect(fetchCountryHolidays("../x", 2026, fetchFn)).rejects.toThrow(/Invalid country/);
    await expect(fetchCountryHolidays("US", 1800, fetchFn)).rejects.toThrow(/Invalid year/);
    expect(fetchFn.mock.calls).toHaveLength(0);
  });

  it("reports a feed outage", async () => {
    await expect(fetchCountryHolidays("US", 2026, feed(503, null))).rejects.toThrow(/HTTP 503/);
  });
});

describe("fetchHolidayCountries", () => {
  beforeEach(() => clearHolidayCountriesCache());
  it("sorts by name and caches for a day", async () => {
    const fetchFn = feed(200, [
      { countryCode: "US", name: "United States" },
      { countryCode: "DE", name: "Germany" },
      { countryCode: "xx", name: "Bad" },
    ]);
    let now = 0;
    const first = await fetchHolidayCountries(fetchFn, () => now);
    expect(first.map((c) => c.countryCode)).toEqual(["DE", "US"]);
    now = 60 * 60 * 1000;
    await fetchHolidayCountries(fetchFn, () => now);
    expect(fetchFn.mock.calls).toHaveLength(1);
  });
});

describe("refreshHolidayCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.replaceHolidayYear.mockResolvedValue({ added: 2, removed: 1 });
  });

  it("replaces each year that has dates and keeps a year the feed has nothing for", async () => {
    storageMock.getHolidayCalendar.mockResolvedValue({ id: 7, code: "US" });
    const fetchFn: FetchLike = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes("/2026/") ? [{ date: "2026-07-04", name: "Independence Day", global: true }] : []),
    }));
    const result = await refreshHolidayCalendar(7, [2026, 2027], fetchFn);
    expect(storageMock.replaceHolidayYear).toHaveBeenCalledTimes(1);
    expect(storageMock.replaceHolidayYear).toHaveBeenCalledWith(7, 2026, [{ date: "2026-07-04", name: "Independence Day" }]);
    expect(result).toEqual({ calendarId: 7, code: "US", added: 2, removed: 1, skippedYears: [2027] });
  });

  it("never downloads into a custom calendar", async () => {
    storageMock.getHolidayCalendar.mockResolvedValue({ id: 8, code: "company-closures" });
    await expect(refreshHolidayCalendar(8, [2026], feed(200, []))).rejects.toThrow(/Only country calendars/);
    expect(storageMock.replaceHolidayYear).not.toHaveBeenCalled();
  });
});

describe("holiday calendar routes", () => {
  let server: Server;
  let base = "";
  let role = "Admin";

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as unknown as { session: unknown }).session = { user: { id: "u1", role } };
      next();
    });
    registerHolidayCalendarRoutes(app);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  beforeEach(() => {
    vi.clearAllMocks();
    role = "Admin";
  });

  const call = (method: string, path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("is Admin only", async () => {
    role = "Engineer";
    const res = await call("GET", "/api/admin/holiday-calendars");
    expect(res.status).toBe(403);
    expect(storageMock.listHolidayCalendars).not.toHaveBeenCalled();
  });

  it("refuses a code that is already used", async () => {
    storageMock.getHolidayCalendarByCode.mockResolvedValue({ id: 1, code: "US" });
    const res = await call("POST", "/api/admin/holiday-calendars", { code: "us", name: "United States" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("code_taken");
    expect(storageMock.createHolidayCalendar).not.toHaveBeenCalled();
  });

  it("creates a custom calendar without downloading anything", async () => {
    storageMock.getHolidayCalendarByCode.mockResolvedValue(null);
    storageMock.createHolidayCalendar.mockResolvedValue({ id: 3, code: "company-closures", name: "Closures" });
    const res = await call("POST", "/api/admin/holiday-calendars", { code: "company-closures", name: "Closures" });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ download: null, downloadFailed: false });
    expect(storageMock.getHolidayCalendar).not.toHaveBeenCalled();
  });

  it("allows at most three default calendars", async () => {
    storageMock.getHolidayCalendar.mockResolvedValue({ id: 4, code: "GB", isDefault: false });
    storageMock.countDefaultHolidayCalendars.mockResolvedValue(3);
    const res = await call("PATCH", "/api/admin/holiday-calendars/4", { isDefault: true });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("too_many_defaults");
    expect(storageMock.updateHolidayCalendar).not.toHaveBeenCalled();
  });

  it("rejects an impossible date", async () => {
    const res = await call("POST", "/api/admin/holiday-calendars/4/dates", { date: "2026-02-30", name: "Nope" });
    expect(res.status).toBe(400);
    expect(storageMock.upsertHolidayDate).not.toHaveBeenCalled();
  });

  it("limits a person to three calendars", async () => {
    const res = await call("PUT", "/api/admin/holiday-calendars/assignments/u2", { calendarIds: [1, 2, 3, 4] });
    expect(res.status).toBe(400);
    expect(storageMock.setUserHolidayCalendars).not.toHaveBeenCalled();
  });

  it("saves a person's calendars", async () => {
    storageMock.getUser.mockResolvedValue({ id: "u2" });
    storageMock.setUserHolidayCalendars.mockResolvedValue([1, 2]);
    const res = await call("PUT", "/api/admin/holiday-calendars/assignments/u2", { calendarIds: [1, 2] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u2", calendarIds: [1, 2] });
  });

  it("saves an account's calendars", async () => {
    storageMock.getCustomer.mockResolvedValue({ id: 9 });
    storageMock.setAccountHolidayCalendars.mockResolvedValue([2]);
    const res = await call("PUT", "/api/admin/holiday-calendars/account-assignments/9", { calendarIds: [2] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accountId: 9, calendarIds: [2] });
    expect(storageMock.setAccountHolidayCalendars).toHaveBeenCalledWith(9, [2]);
  });

  it("refuses an unknown account and more than three calendars", async () => {
    storageMock.getCustomer.mockResolvedValue(undefined);
    expect((await call("PUT", "/api/admin/holiday-calendars/account-assignments/9", { calendarIds: [1] })).status).toBe(404);
    expect((await call("PUT", "/api/admin/holiday-calendars/account-assignments/9", { calendarIds: [1, 2, 3, 4] })).status).toBe(400);
    expect(storageMock.setAccountHolidayCalendars).not.toHaveBeenCalled();
  });

  it("keeps account calendars Admin only", async () => {
    role = "Engineer";
    expect((await call("GET", "/api/admin/holiday-calendars/account-assignments")).status).toBe(403);
  });

  it("shows any signed-in person only their own calendars", async () => {
    role = "Customer";
    const view = { source: "default", calendars: [{ id: 1, code: "US", name: "United States", isCountry: true, upcoming: [] }] };
    storageMock.getUserHolidayCalendarView.mockResolvedValue(view);
    const res = await call("GET", "/api/holiday-calendars/me");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(view);
    expect(storageMock.getUserHolidayCalendarView).toHaveBeenCalledWith("u1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), 3);
  });
});
