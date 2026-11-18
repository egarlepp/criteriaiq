// Working days for project scheduling: weekends and the holidays on a
// person's holiday calendars (Admin › System Settings › Calendar) are days
// off. Dates are plain "YYYY-MM-DD" strings handled in UTC, so a date never
// shifts a day across time zones. See docs/features/working-calendar.md.

/** Day-of-week numbers (0 = Sunday) that are working days. Monday to Friday. */
export const DEFAULT_WORK_DAYS: readonly number[] = [1, 2, 3, 4, 5];

/** A safety cap: never walk more than this many days looking for a working day. */
const MAX_WALK_DAYS = 3660;

export interface WorkingCalendar {
  /** Holiday dates, "YYYY-MM-DD". */
  holidays: ReadonlySet<string>;
  /** Day-of-week numbers that are working days (0 = Sunday). */
  workDays?: readonly number[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" of a Date in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A UTC-midnight Date for "YYYY-MM-DD". Throws on anything else. */
export function fromIsoDate(iso: string): Date {
  if (!ISO_DATE.test(iso)) throw new Error(`Not a date: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || toIsoDate(d) !== iso) throw new Error(`Not a date: ${iso}`);
  return d;
}

function shiftDays(iso: string, days: number): string {
  const d = fromIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

function workDaySet(cal: WorkingCalendar): ReadonlySet<number> {
  const days = cal.workDays && cal.workDays.length > 0 ? cal.workDays : DEFAULT_WORK_DAYS;
  return new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
}

export function isWorkingDay(iso: string, cal: WorkingCalendar): boolean {
  const work = workDaySet(cal);
  return work.has(fromIsoDate(iso).getUTCDay()) && !cal.holidays.has(iso);
}

/** The date itself when it's a working day, else the next working day after it. */
export function nextWorkingDay(iso: string, cal: WorkingCalendar): string {
  const work = workDaySet(cal);
  if (work.size === 0) return iso;
  let day = iso;
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    if (work.has(fromIsoDate(day).getUTCDay()) && !cal.holidays.has(day)) return day;
    day = shiftDays(day, 1);
  }
  return iso;
}

/** The date itself when it's a working day, else the last working day before it. */
export function previousWorkingDay(iso: string, cal: WorkingCalendar): string {
  const work = workDaySet(cal);
  if (work.size === 0) return iso;
  let day = iso;
  for (let i = 0; i < MAX_WALK_DAYS; i++) {
    if (work.has(fromIsoDate(day).getUTCDay()) && !cal.holidays.has(day)) return day;
    day = shiftDays(day, -1);
  }
  return iso;
}

/**
 * The date `days` working days before `end`. The end is first moved back to a
 * working day, so 0 gives that day. Negative counts are treated as 0.
 */
export function subtractWorkingDays(end: string, days: number, cal: WorkingCalendar): string {
  let day = previousWorkingDay(end, cal);
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  for (let i = 0; i < count; i++) day = previousWorkingDay(shiftDays(day, -1), cal);
  return day;
}

/** Working days after `from` up to and including `to`; 0 when `to` isn't after `from`. */
export function workingDaysBetween(from: string, to: string, cal: WorkingCalendar): number {
  if (to <= from) return 0;
  let count = 0;
  let day = from;
  for (let i = 0; i < MAX_WALK_DAYS && day < to; i++) {
    day = shiftDays(day, 1);
    if (isWorkingDay(day, cal)) count++;
  }
  return count;
}

/**
 * The date `days` working days after `start`. The start is first moved to a
 * working day, so 0 gives that day; 1 gives the next working day after it.
 * Negative counts are treated as 0.
 */
export function addWorkingDays(start: string, days: number, cal: WorkingCalendar): string {
  let day = nextWorkingDay(start, cal);
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  for (let i = 0; i < count; i++) day = nextWorkingDay(shiftDays(day, 1), cal);
  return day;
}

/**
 * A stored timestamp for a scheduled date: noon UTC, so the date reads the
 * same in every time zone from UTC−11 to UTC+11.
 */
export function scheduledDate(iso: string): Date {
  return new Date(`${fromIsoDate(iso).toISOString().slice(0, 10)}T12:00:00Z`);
}

/** Start and due dates for a MAP item `startOffset`/`dueOffset` working days after `anchor`. Due is never before start. */
export function planOffsetDates(
  anchor: string,
  startOffset: number | null | undefined,
  dueOffset: number | null | undefined,
  cal: WorkingCalendar,
): { start: string; due: string } {
  const start = addWorkingDays(anchor, startOffset ?? 0, cal);
  const due = addWorkingDays(anchor, dueOffset ?? 0, cal);
  return { start, due: due < start ? start : due };
}
