// Holiday calendars (Admin › System Settings › Calendar), ported from
// ImpactIQ's Admin › Calendars. See docs/features/holiday-calendars.md.
//
// Every /api/admin route is Admin only.
//   GET    /api/holiday-calendars/me                         any signed-in user: the calendars that apply to them
//   GET    /api/admin/holiday-calendars                      calendars with date counts and next holiday
//   GET    /api/admin/holiday-calendars/countries            countries the public feed covers
//   POST   /api/admin/holiday-calendars                      { code, name }; a country code also downloads its holidays
//   PATCH  /api/admin/holiday-calendars/:id                  { name?, isDefault? }
//   DELETE /api/admin/holiday-calendars/:id                  removes its dates and user assignments too
//   POST   /api/admin/holiday-calendars/refresh              re-download every country calendar
//   POST   /api/admin/holiday-calendars/:id/refresh          { years? } re-download one
//   GET    /api/admin/holiday-calendars/:id/dates
//   POST   /api/admin/holiday-calendars/:id/dates            { date, name } add or rename a day
//   DELETE /api/admin/holiday-calendars/:id/dates/:dateId
//   GET    /api/admin/holiday-calendars/assignments          per-user calendars
//   PUT    /api/admin/holiday-calendars/assignments/:userId  { calendarIds } (max 3)
//   GET    /api/admin/holiday-calendars/account-assignments  per-account calendars
//   PUT    /api/admin/holiday-calendars/account-assignments/:accountId  { calendarIds } (max 3)
//
// Errors carry a `code` the client translates; `message` is English for logs.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireAdmin } from "../lib/section-permissions";
import { storage } from "../storage";
import {
  HolidayFeedError,
  fetchHolidayCountries,
  refreshAllHolidayCalendars,
  refreshHolidayCalendar,
} from "../services/holiday-calendars";
import {
  MAX_DEFAULT_CALENDARS,
  holidayAssignmentSchema,
  holidayCalendarCreateSchema,
  holidayCalendarUpdateSchema,
  holidayDateCreateSchema,
  holidayRefreshSchema,
  isCountryCalendarCode,
  MY_UPCOMING_HOLIDAYS,
} from "@shared/holiday-calendars";

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ code, message });
}

function idParam(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function feedFailure(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error("[holiday-calendars] feed error:", message);
  if (err instanceof HolidayFeedError && err.status === 404) return fail(res, 404, "not_found", message);
  if (err instanceof HolidayFeedError && err.status === 400) return fail(res, 400, "not_country", message);
  fail(res, 502, "feed_unavailable", message);
}

export function registerHolidayCalendarRoutes(app: Express) {
  const guard = [isAuthenticated, requireAdmin];

  // Profile Settings › Profile: read-only, and only the caller's own calendars.
  app.get("/api/holiday-calendars/me", isAuthenticated, async (req: Request, res: Response) => {
    const userId = (req as Request & { session?: { user?: { id?: string } } }).session?.user?.id;
    if (!userId) return fail(res, 401, "unauthorized", "Not signed in");
    try {
      res.json(await storage.getUserHolidayCalendarView(userId, today(), MY_UPCOMING_HOLIDAYS));
    } catch (err) {
      console.error("[holiday-calendars] my calendars failed:", err);
      fail(res, 500, "server_error", "Could not read your calendars");
    }
  });

  // The organization's default holidays from a month ago to a year ahead, for
  // working-day counts in the browser (end-date flags). Any signed-in user.
  app.get("/api/holiday-calendars/default-dates", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      const now = Date.now();
      const from = new Date(now - 31 * 86_400_000).toISOString().slice(0, 10);
      const to = new Date(now + 400 * 86_400_000).toISOString().slice(0, 10);
      const dates = (await storage.getHolidayDatesForUsers([null], from, to)).get(null) ?? new Set<string>();
      res.json({ from, to, holidays: Array.from(dates).sort() });
    } catch (err) {
      console.error("[holiday-calendars] default dates failed:", err);
      fail(res, 500, "server_error", "Could not read holiday dates");
    }
  });

  app.get("/api/admin/holiday-calendars", ...guard, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.listHolidayCalendars(today()));
    } catch (err) {
      console.error("[holiday-calendars] list failed:", err);
      fail(res, 500, "server_error", "Could not read holiday calendars");
    }
  });

  app.get("/api/admin/holiday-calendars/countries", ...guard, async (_req: Request, res: Response) => {
    try {
      res.json(await fetchHolidayCountries());
    } catch (err) {
      feedFailure(res, err);
    }
  });

  app.get("/api/admin/holiday-calendars/assignments", ...guard, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.listHolidayAssignments());
    } catch (err) {
      console.error("[holiday-calendars] assignments failed:", err);
      fail(res, 500, "server_error", "Could not read calendar assignments");
    }
  });

  app.put("/api/admin/holiday-calendars/assignments/:userId", ...guard, async (req: Request, res: Response) => {
    const userId = typeof req.params.userId === "string" ? req.params.userId : "";
    const parsed = holidayAssignmentSchema.safeParse(req.body);
    if (!userId || !parsed.success) return fail(res, 400, "invalid", "Pick up to 3 calendars");
    try {
      const user = await storage.getUser(userId);
      if (!user) return fail(res, 404, "not_found", "User not found");
      const calendarIds = await storage.setUserHolidayCalendars(userId, parsed.data.calendarIds);
      res.json({ userId, calendarIds });
    } catch (err) {
      console.error("[holiday-calendars] assignment save failed:", err);
      fail(res, 500, "server_error", "Could not save calendar assignments");
    }
  });

  app.get("/api/admin/holiday-calendars/account-assignments", ...guard, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.listAccountHolidayAssignments());
    } catch (err) {
      console.error("[holiday-calendars] account assignments failed:", err);
      fail(res, 500, "server_error", "Could not read account calendars");
    }
  });

  app.put("/api/admin/holiday-calendars/account-assignments/:accountId", ...guard, async (req: Request, res: Response) => {
    const accountId = idParam(req.params.accountId);
    const parsed = holidayAssignmentSchema.safeParse(req.body);
    if (!accountId || !parsed.success) return fail(res, 400, "invalid", "Pick up to 3 calendars");
    try {
      if (!(await storage.getCustomer(accountId))) return fail(res, 404, "not_found", "Account not found");
      const calendarIds = await storage.setAccountHolidayCalendars(accountId, parsed.data.calendarIds);
      res.json({ accountId, calendarIds });
    } catch (err) {
      console.error("[holiday-calendars] account calendars save failed:", err);
      fail(res, 500, "server_error", "Could not save account calendars");
    }
  });

  app.post("/api/admin/holiday-calendars/refresh", ...guard, async (req: Request, res: Response) => {
    const parsed = holidayRefreshSchema.safeParse(req.body ?? {});
    if (!parsed.success) return fail(res, 400, "invalid", "Invalid years");
    try {
      res.json(await refreshAllHolidayCalendars(parsed.data.years));
    } catch (err) {
      feedFailure(res, err);
    }
  });

  app.post("/api/admin/holiday-calendars", ...guard, async (req: Request, res: Response) => {
    const parsed = holidayCalendarCreateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "invalid", "Code and name are required");
    // Country codes are stored upper case so they're recognized as countries.
    const code = /^[A-Za-z]{2}$/.test(parsed.data.code) ? parsed.data.code.toUpperCase() : parsed.data.code;
    try {
      if (await storage.getHolidayCalendarByCode(code)) {
        return fail(res, 409, "code_taken", `A calendar with code "${code}" already exists`);
      }
      const created = await storage.createHolidayCalendar({ code, name: parsed.data.name });
      // A country calendar downloads its holidays straight away. A failed
      // download keeps the calendar; the admin can retry with Refresh.
      let download: Awaited<ReturnType<typeof refreshHolidayCalendar>> | null = null;
      let downloadError: string | null = null;
      if (isCountryCalendarCode(code)) {
        try {
          download = await refreshHolidayCalendar(created.id);
        } catch (err) {
          downloadError = err instanceof Error ? err.message : String(err);
          console.error("[holiday-calendars] first download failed:", downloadError);
        }
      }
      res.status(201).json({ calendar: created, download, downloadFailed: downloadError !== null });
    } catch (err) {
      console.error("[holiday-calendars] create failed:", err);
      fail(res, 500, "server_error", "Could not create the calendar");
    }
  });

  app.patch("/api/admin/holiday-calendars/:id", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = holidayCalendarUpdateSchema.safeParse(req.body);
    if (!id || !parsed.success) return fail(res, 400, "invalid", "Nothing to change");
    try {
      const existing = await storage.getHolidayCalendar(id);
      if (!existing) return fail(res, 404, "not_found", "Calendar not found");
      if (parsed.data.isDefault && !existing.isDefault && (await storage.countDefaultHolidayCalendars()) >= MAX_DEFAULT_CALENDARS) {
        return fail(res, 409, "too_many_defaults", `At most ${MAX_DEFAULT_CALENDARS} default calendars`);
      }
      res.json(await storage.updateHolidayCalendar(id, parsed.data));
    } catch (err) {
      console.error("[holiday-calendars] update failed:", err);
      fail(res, 500, "server_error", "Could not update the calendar");
    }
  });

  app.delete("/api/admin/holiday-calendars/:id", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    if (!id) return fail(res, 400, "invalid", "Invalid calendar");
    try {
      if (!(await storage.deleteHolidayCalendar(id))) return fail(res, 404, "not_found", "Calendar not found");
      res.status(204).end();
    } catch (err) {
      console.error("[holiday-calendars] delete failed:", err);
      fail(res, 500, "server_error", "Could not delete the calendar");
    }
  });

  app.post("/api/admin/holiday-calendars/:id/refresh", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = holidayRefreshSchema.safeParse(req.body ?? {});
    if (!id || !parsed.success) return fail(res, 400, "invalid", "Invalid request");
    try {
      res.json(await refreshHolidayCalendar(id, parsed.data.years));
    } catch (err) {
      feedFailure(res, err);
    }
  });

  app.get("/api/admin/holiday-calendars/:id/dates", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    if (!id) return fail(res, 400, "invalid", "Invalid calendar");
    try {
      res.json(await storage.listHolidayDates(id));
    } catch (err) {
      console.error("[holiday-calendars] dates failed:", err);
      fail(res, 500, "server_error", "Could not read the dates");
    }
  });

  app.post("/api/admin/holiday-calendars/:id/dates", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const parsed = holidayDateCreateSchema.safeParse(req.body);
    if (!id || !parsed.success) return fail(res, 400, "invalid", "A date and a name are required");
    // Reject impossible dates such as 2026-02-30 that the pattern lets through.
    const asDate = new Date(`${parsed.data.date}T00:00:00Z`);
    if (Number.isNaN(asDate.getTime()) || asDate.toISOString().slice(0, 10) !== parsed.data.date) {
      return fail(res, 400, "invalid", "Invalid date");
    }
    try {
      if (!(await storage.getHolidayCalendar(id))) return fail(res, 404, "not_found", "Calendar not found");
      res.status(201).json(await storage.upsertHolidayDate(id, parsed.data.date, parsed.data.name));
    } catch (err) {
      console.error("[holiday-calendars] add date failed:", err);
      fail(res, 500, "server_error", "Could not add the date");
    }
  });

  app.delete("/api/admin/holiday-calendars/:id/dates/:dateId", ...guard, async (req: Request, res: Response) => {
    const id = idParam(req.params.id);
    const dateId = idParam(req.params.dateId);
    if (!id || !dateId) return fail(res, 400, "invalid", "Invalid date");
    try {
      if (!(await storage.deleteHolidayDate(id, dateId))) return fail(res, 404, "not_found", "Date not found");
      res.status(204).end();
    } catch (err) {
      console.error("[holiday-calendars] delete date failed:", err);
      fail(res, 500, "server_error", "Could not delete the date");
    }
  });
}
