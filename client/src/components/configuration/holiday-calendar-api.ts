// Query keys and helpers shared by the holiday calendar cards on
// Admin › System Settings › Calendar.
import { isApiError, queryClient } from "@/lib/queryClient";

export const HOLIDAY_CALENDARS_KEY = ["/api/admin/holiday-calendars"] as const;
export const HOLIDAY_COUNTRIES_KEY = ["/api/admin/holiday-calendars/countries"] as const;
export const HOLIDAY_ASSIGNMENTS_KEY = ["/api/admin/holiday-calendars/assignments"] as const;
export const HOLIDAY_ACCOUNT_ASSIGNMENTS_KEY = ["/api/admin/holiday-calendars/account-assignments"] as const;

export function holidayDatesKey(calendarId: number) {
  return [`/api/admin/holiday-calendars/${calendarId}/dates`] as const;
}

/** Refetch the calendar list (counts, next holiday) and, optionally, one calendar's dates. */
export function invalidateHolidayCalendars(calendarId?: number): void {
  void queryClient.invalidateQueries({ queryKey: HOLIDAY_CALENDARS_KEY });
  if (calendarId !== undefined) void queryClient.invalidateQueries({ queryKey: holidayDatesKey(calendarId) });
}

const KNOWN_CODES = new Set(["code_taken", "too_many_defaults", "feed_unavailable", "not_found", "invalid"]);

/** The translation key for a server error `code`, else the generic one. */
export function holidayErrorKey(error: unknown): string {
  const code =
    isApiError(error) && error.details && typeof error.details === "object"
      ? (error.details as { code?: unknown }).code
      : undefined;
  return typeof code === "string" && KNOWN_CODES.has(code)
    ? `configuration.holidays.errors.${code}`
    : "configuration.holidays.errors.generic";
}

/** "2026-12-25" in the viewer's language, without shifting a day across time zones. */
export function formatHolidayDate(date: string, language: string, withWeekday = false): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(language, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withWeekday ? { weekday: "short" } : {}),
  });
}
