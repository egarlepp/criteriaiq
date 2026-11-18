// Pure helpers for Analytics › Calendar (AnalyticsCalendar.tsx): filtering
// the scheduled-report events from GET /api/report-schedules and grouping
// them by the viewer's local day.
import { format, isSameMonth } from "date-fns";
import type {
  ReportCalendarEvent,
  ReportCalendarEventStatus,
  ReportCalendarSchedule,
  ReportScheduleFrequency,
} from "@shared/report-schedule-calendar";

export const ALL = "all";

export interface CalendarFilters {
  createdBy: string;
  frequency: ReportScheduleFrequency | typeof ALL;
  recipient: string;
  status: ReportCalendarEventStatus | typeof ALL;
}

export const EMPTY_FILTERS: CalendarFilters = { createdBy: ALL, frequency: ALL, recipient: ALL, status: ALL };

export interface CalendarEntry {
  event: ReportCalendarEvent;
  schedule: ReportCalendarSchedule;
  /** The viewer's local day, yyyy-MM-dd. */
  day: string;
}

export function localDayKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function countActiveFilters(filters: CalendarFilters, selectedDate: Date | null): number {
  return (
    (selectedDate ? 1 : 0) +
    (Object.keys(EMPTY_FILTERS) as Array<keyof CalendarFilters>).filter((k) => filters[k] !== ALL).length
  );
}

/** Events joined to their schedule and filtered; events of unknown schedules are dropped. */
export function buildEntries(
  schedules: readonly ReportCalendarSchedule[],
  events: readonly ReportCalendarEvent[],
  filters: CalendarFilters,
): CalendarEntry[] {
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const out: CalendarEntry[] = [];
  for (const event of events) {
    const schedule = byId.get(event.scheduleId);
    if (!schedule) continue;
    if (filters.createdBy !== ALL && schedule.createdBy !== filters.createdBy) continue;
    if (filters.frequency !== ALL && schedule.frequency !== filters.frequency) continue;
    if (filters.recipient !== ALL && !schedule.recipients.includes(filters.recipient)) continue;
    if (filters.status !== ALL && event.status !== filters.status) continue;
    out.push({ event, schedule, day: localDayKey(new Date(event.at)) });
  }
  return out.sort((a, b) => a.event.at.localeCompare(b.event.at));
}

export type DayStatusCounts = Record<ReportCalendarEventStatus, number>;

export function countsByDay(entries: readonly CalendarEntry[]): Map<string, DayStatusCounts> {
  const out = new Map<string, DayStatusCounts>();
  for (const { day, event } of entries) {
    const counts = out.get(day) ?? { upcoming: 0, sent: 0, success: 0, failure: 0 };
    counts[event.status]++;
    out.set(day, counts);
  }
  return out;
}

/** Entries on the selected day, or in the shown month when no day is selected. */
export function entriesInView(entries: readonly CalendarEntry[], month: Date, selectedDate: Date | null): CalendarEntry[] {
  if (selectedDate) {
    const key = localDayKey(selectedDate);
    return entries.filter((e) => e.day === key);
  }
  return entries.filter((e) => isSameMonth(new Date(e.event.at), month));
}

export function monthTotals(entries: readonly CalendarEntry[], month: Date): DayStatusCounts & { total: number } {
  const totals = { upcoming: 0, sent: 0, success: 0, failure: 0, total: 0 };
  for (const { event } of entries) {
    if (!isSameMonth(new Date(event.at), month)) continue;
    totals[event.status]++;
    totals.total++;
  }
  return totals;
}

/** Creators and recipients that appear on any schedule, for the filter pickers. */
export function filterOptions(schedules: readonly ReportCalendarSchedule[]): {
  creators: Array<{ id: string; name: string }>;
  recipients: string[];
} {
  const creators = new Map<string, string>();
  const recipients = new Set<string>();
  for (const s of schedules) {
    if (s.createdBy) creators.set(s.createdBy, s.creatorName ?? s.createdBy);
    s.recipients.forEach((r) => recipients.add(r));
  }
  return {
    creators: [...creators].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    recipients: [...recipients].sort((a, b) => a.localeCompare(b)),
  };
}
