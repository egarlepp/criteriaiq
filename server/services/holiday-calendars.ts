// Downloads public holidays into holiday calendars (Admin › System Settings ›
// Calendar), ported from ImpactIQ's services/holidays/refresh.ts.
//
// The feed is date.nager.at: no API key, 100+ countries, one JSON list per
// (country, year). The host is fixed and the only path values are a validated
// two-letter code and a year, so no admin input reaches the URL unchecked.
//
// A monthly Scheduler job (holiday_calendar_refresh) re-downloads the current
// and next year for every country calendar, so next year's dates are there
// before anyone plans into them. Custom calendars are never touched.
import { storage } from "../storage";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import {
  defaultRefreshYears,
  isCountryCalendarCode,
  type HolidayCountry,
  type HolidayRefreshResult,
} from "@shared/holiday-calendars";

export const HOLIDAY_REFRESH_JOB_KEY = "holiday_calendar_refresh";
const NAGER_BASE = "https://date.nager.at/api/v3";
const FETCH_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTRIES_TTL_MS = DAY_MS;

export type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface NagerHoliday {
  date?: unknown;
  name?: unknown;
  localName?: unknown;
  /** false = only some regions of the country observe it. */
  global?: unknown;
}

export class HolidayFeedError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "HolidayFeedError";
  }
}

function assertCountry(code: string): string {
  const upper = code.toUpperCase();
  if (!isCountryCalendarCode(upper)) throw new HolidayFeedError(`Invalid country code: ${code}`);
  return upper;
}

/**
 * Nationwide holidays for one country and year, one entry per date. Regional
 * holidays (global: false) are left out: a day only some states or provinces
 * take off isn't a day off for the whole country. Two holidays on one date
 * are joined into one name. A 404 or 204 (year or country not covered) gives
 * an empty list.
 */
export async function fetchCountryHolidays(
  countryCode: string,
  year: number,
  fetchFn: FetchLike = fetch as unknown as FetchLike,
): Promise<Array<{ date: string; name: string }>> {
  const country = assertCountry(countryCode);
  const safeYear = Math.trunc(Number(year));
  if (!Number.isFinite(safeYear) || safeYear < 2000 || safeYear > 2100) throw new HolidayFeedError(`Invalid year: ${year}`);
  const res = await fetchFn(`${NAGER_BASE}/PublicHolidays/${safeYear}/${country}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404 || res.status === 204) return [];
  if (!res.ok) throw new HolidayFeedError(`Holiday feed returned HTTP ${res.status}`, res.status);
  const body = await res.json();
  if (!Array.isArray(body)) throw new HolidayFeedError("Holiday feed returned an unexpected response");

  const byDate = new Map<string, string[]>();
  for (const raw of body as NagerHoliday[]) {
    if (raw.global === false) continue;
    const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
    const name =
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : typeof raw.localName === "string"
          ? raw.localName.trim()
          : "";
    if (!date || !name || !date.startsWith(`${safeYear}-`)) continue;
    const names = byDate.get(date) ?? [];
    if (!names.includes(name)) names.push(name);
    byDate.set(date, names);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, names]) => ({ date, name: names.join(" / ").slice(0, 200) }));
}

let countriesCache: { at: number; list: HolidayCountry[] } | null = null;

/** Countries the feed covers, for the Add calendar picker. Cached for a day. */
export async function fetchHolidayCountries(
  fetchFn: FetchLike = fetch as unknown as FetchLike,
  now: () => number = Date.now,
): Promise<HolidayCountry[]> {
  if (countriesCache && now() - countriesCache.at < COUNTRIES_TTL_MS) return countriesCache.list;
  const res = await fetchFn(`${NAGER_BASE}/AvailableCountries`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new HolidayFeedError(`Holiday feed returned HTTP ${res.status}`, res.status);
  const body = await res.json();
  if (!Array.isArray(body)) throw new HolidayFeedError("Holiday feed returned an unexpected response");
  const list = (body as Array<{ countryCode?: unknown; name?: unknown }>)
    .filter((c): c is { countryCode: string; name: string } => typeof c.countryCode === "string" && typeof c.name === "string")
    .filter((c) => isCountryCalendarCode(c.countryCode))
    .map((c) => ({ countryCode: c.countryCode, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  countriesCache = { at: now(), list };
  return list;
}

/** Test hook. */
export function clearHolidayCountriesCache(): void {
  countriesCache = null;
}

/** Downloads the given years into one country calendar, replacing those years. */
export async function refreshHolidayCalendar(
  calendarId: number,
  years: number[] = defaultRefreshYears(),
  fetchFn?: FetchLike,
): Promise<HolidayRefreshResult> {
  const cal = await storage.getHolidayCalendar(calendarId);
  if (!cal) throw new HolidayFeedError("Calendar not found", 404);
  if (!isCountryCalendarCode(cal.code)) {
    throw new HolidayFeedError("Only country calendars can be downloaded", 400);
  }
  const result: HolidayRefreshResult = { calendarId, code: cal.code, added: 0, removed: 0, skippedYears: [] };
  for (const year of years) {
    const dates = await fetchCountryHolidays(cal.code, year, fetchFn);
    // Nothing for that year: keep what's there rather than wiping it.
    if (dates.length === 0) {
      result.skippedYears.push(year);
      continue;
    }
    const r = await storage.replaceHolidayYear(calendarId, year, dates);
    result.added += r.added;
    result.removed += r.removed;
  }
  return result;
}

/** Every country calendar; one failing country doesn't stop the rest. */
export async function refreshAllHolidayCalendars(
  years: number[] = defaultRefreshYears(),
  fetchFn?: FetchLike,
): Promise<HolidayRefreshResult[]> {
  const cals = await storage.listHolidayCalendars(new Date().toISOString().slice(0, 10));
  const out: HolidayRefreshResult[] = [];
  for (const c of cals) {
    if (!c.isCountry) continue;
    try {
      out.push(await refreshHolidayCalendar(c.id, years, fetchFn));
    } catch (err) {
      out.push({
        calendarId: c.id,
        code: c.code,
        added: 0,
        removed: 0,
        skippedYears: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

async function runTick(): Promise<JobOutcome> {
  const { dbHealth } = await import("../lib/db-probe");
  if (!dbHealth.reachable) return { status: "skipped", message: "database_unreachable" };
  const results = await refreshAllHolidayCalendars();
  if (results.length === 0) return { status: "skipped", message: "no_country_calendars" };
  const failed = results.filter((r) => r.error);
  const added = results.reduce((n, r) => n + r.added, 0);
  if (failed.length === results.length) {
    throw new Error(`Holiday download failed for every calendar: ${failed[0].error}`);
  }
  return {
    status: "success",
    itemsProcessed: added,
    message: failed.length ? `${failed.length} of ${results.length} calendars failed: ${failed.map((f) => f.code).join(", ")}` : undefined,
  };
}

export function startHolidayCalendarRefresh(): void {
  scheduleJob({
    key: HOLIDAY_REFRESH_JOB_KEY,
    category: "system",
    label: "Holiday calendar refresh",
    defaultIntervalMs: 30 * DAY_MS,
    cadenceEditable: true,
    minIntervalMs: DAY_MS,
    firstRunDelayMs: 10 * 60 * 1000,
    task: runTick,
  });
}
