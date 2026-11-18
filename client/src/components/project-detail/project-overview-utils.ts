// Numbers for the project Overview tab (header ring and KPI cards).
import { parseProjectDate } from "@/lib/date-utils";

export interface CriteriaProgress {
  met: number;
  total: number;
  percent: number;
}

/**
 * Validation criteria met. Same rule as the project cards: "complete" is
 * met; inactive and "cancelled" criteria leave the total.
 */
export function criteriaProgress(
  criteria: ReadonlyArray<{ isActive?: boolean | null; status?: string | null }> | null | undefined,
): CriteriaProgress {
  const active = (criteria ?? []).filter(
    (c) => c.isActive !== false && (c.status ?? "").toLowerCase() !== "cancelled",
  );
  const met = active.filter((c) => (c.status ?? "").toLowerCase() === "complete").length;
  const total = active.length;
  return { met, total, percent: total > 0 ? Math.round((met / total) * 100) : 0 };
}

export interface ScheduleProgress {
  /** Days until the end date (negative once it has passed); null without an end date. */
  daysRemaining: number | null;
  /** Days from start to end; null without both dates. */
  totalDays: number | null;
  /** Days from start to today (0 before the start); null without a start date. */
  elapsedDays: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? parseProjectDate(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function scheduleProgress(
  startDate: string | Date | null | undefined,
  endDate: string | Date | null | undefined,
  today: Date = new Date(),
): ScheduleProgress {
  const start = toDate(startDate);
  const end = toDate(endDate);
  const now = startOfDay(today);
  return {
    daysRemaining: end ? Math.round((startOfDay(end) - now) / DAY_MS) : null,
    totalDays: start && end ? Math.max(0, Math.round((startOfDay(end) - startOfDay(start)) / DAY_MS)) : null,
    elapsedDays: start ? Math.max(0, Math.round((now - startOfDay(start)) / DAY_MS)) : null,
  };
}
