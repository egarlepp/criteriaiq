// Holiday calendars (Admin › System Settings › Calendar), ported from
// ImpactIQ's Admin › Calendars. See docs/features/holiday-calendars.md.
import { z } from "zod";

/** A user can follow at most this many calendars, as in ImpactIQ. */
export const MAX_USER_CALENDARS = 3;
/** Organization defaults, for users with no calendars of their own. */
export const MAX_DEFAULT_CALENDARS = 3;

const COUNTRY_CODE = /^[A-Z]{2}$/;

/** A two-letter upper-case code is a country whose holidays are downloaded; anything else is custom. */
export function isCountryCalendarCode(code: string): boolean {
  return COUNTRY_CODE.test(code);
}

/** Current and next year: what a download or refresh fetches by default. */
export function defaultRefreshYears(now: Date = new Date()): number[] {
  const year = now.getUTCFullYear();
  return [year, year + 1];
}

export const holidayCalendarCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
});

export const holidayCalendarUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isDefault !== undefined);

export const holidayDateCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(200),
});

export const holidayRefreshSchema = z.object({
  years: z.array(z.number().int().min(2000).max(2100)).min(1).max(5).optional(),
});

export const holidayAssignmentSchema = z.object({
  calendarIds: z.array(z.number().int().positive()).max(MAX_USER_CALENDARS),
});

export interface HolidayCalendarSummary {
  id: number;
  code: string;
  name: string;
  isCountry: boolean;
  isDefault: boolean;
  dateCount: number;
  /** Next holiday on or after today, if any. */
  nextHoliday: { date: string; name: string } | null;
  lastRefreshedAt: string | null;
}

/** GET /api/holiday-calendars/me: the calendars that apply to the signed-in user. */
export interface MyHolidayCalendars {
  /**
   * "user" = calendars assigned to them; "account" = their account's
   * calendars; "default" = the organization defaults; "none" = none of these.
   */
  source: "user" | "account" | "default" | "none";
  calendars: Array<{
    id: number;
    code: string;
    name: string;
    isCountry: boolean;
    /** The next few holidays on or after today, earliest first. */
    upcoming: Array<{ date: string; name: string }>;
  }>;
}

/** How many upcoming holidays GET /api/holiday-calendars/me lists per calendar. */
export const MY_UPCOMING_HOLIDAYS = 3;

export interface HolidayDate {
  id: number;
  calendarId: number;
  date: string;
  name: string;
}

export interface HolidayCountry {
  countryCode: string;
  name: string;
}

export interface HolidayRefreshResult {
  calendarId: number;
  code: string;
  added: number;
  removed: number;
  /** Years the feed had nothing for. */
  skippedYears: number[];
  error?: string;
}

export interface HolidayAssignment {
  userId: string;
  calendarIds: number[];
}

/** An account's holiday calendars (Admin › System Settings › Calendar › Accounts). */
export interface AccountHolidayAssignment {
  accountId: number;
  calendarIds: number[];
}
