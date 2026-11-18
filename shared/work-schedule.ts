// A person's work week and time off (Profile Settings › Calendar). MAP
// scheduling treats days outside the work week and days off as non-working,
// alongside holidays. See docs/features/working-calendar.md.
import { z } from "zod";
import { DEFAULT_WORK_DAYS, fromIsoDate, toIsoDate } from "./working-calendar";

/** The longest single time-off entry, in days. */
export const MAX_TIME_OFF_DAYS = 366;
/** Time-off entries further back than this are hidden on Profile. */
export const TIME_OFF_HISTORY_DAYS = 30;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  try {
    fromIsoDate(value);
    return true;
  } catch {
    return false;
  }
}

const isoDate = z.string().regex(ISO_DATE).refine(isRealDate, { message: "invalid_date" });

/** Inclusive number of days from `start` to `end`. */
export function daysInRange(start: string, end: string): number {
  return Math.round((fromIsoDate(end).getTime() - fromIsoDate(start).getTime()) / 86_400_000) + 1;
}

export const workScheduleSaveSchema = z.object({
  workDays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .refine((days) => new Set(days).size === days.length, { message: "duplicate_day" }),
});
export type WorkScheduleSave = z.infer<typeof workScheduleSaveSchema>;

export const timeOffCreateSchema = z
  .object({
    startDate: isoDate,
    endDate: isoDate,
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "end_before_start", path: ["endDate"] })
  .refine((v) => !isRealDate(v.startDate) || !isRealDate(v.endDate) || v.endDate < v.startDate || daysInRange(v.startDate, v.endDate) <= MAX_TIME_OFF_DAYS, {
    message: "too_long",
    path: ["endDate"],
  });
export type TimeOffCreate = z.infer<typeof timeOffCreateSchema>;

export type ScheduleSource = "manual" | "outlook";

export interface TimeOffEntry {
  id: number;
  startDate: string;
  endDate: string;
  note: string | null;
  source: ScheduleSource;
}

/** GET /api/work-schedule/me and /api/users/:id/work-schedule. */
export interface WorkScheduleView {
  /** Day-of-week numbers, 0 = Sunday, sorted. */
  workDays: number[];
  /** Monday to Friday because nobody has set it. */
  isDefault: boolean;
  source: ScheduleSource | null;
  /** Entries that end on or after TIME_OFF_HISTORY_DAYS ago, earliest first. */
  timeOff: TimeOffEntry[];
}

/** Sorted, de-duplicated work days; Monday to Friday when the list is empty. */
export function normalizeWorkDays(days: readonly number[] | null | undefined): number[] {
  const valid = Array.from(new Set((days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))).sort((a, b) => a - b);
  return valid.length > 0 ? valid : [...DEFAULT_WORK_DAYS];
}

/** Every date of the time-off entries that falls between `from` and `to`, inclusive. */
export function timeOffDates(entries: ReadonlyArray<{ startDate: string; endDate: string }>, from: string, to: string): string[] {
  const out = new Set<string>();
  for (const entry of entries) {
    const start = entry.startDate > from ? entry.startDate : from;
    const end = entry.endDate < to ? entry.endDate : to;
    if (end < start) continue;
    const day = fromIsoDate(start);
    for (let i = 0; i <= MAX_TIME_OFF_DAYS && toIsoDate(day) <= end; i++) {
      out.add(toIsoDate(day));
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  return Array.from(out).sort();
}
