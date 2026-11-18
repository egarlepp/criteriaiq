// Working-day MAP scheduling: keeps a task's dates off its owner's days off.
// See docs/features/working-calendar.md.
//
// A MAP created from a template gets its dates in working days on the
// project owner's calendar (server/storage/map.ts). When a task is then
// given an owner, and the project schedules by task owner (the default),
// any start or due date that falls on the new owner's weekend or holiday
// moves to their next working day.
import { storage } from "../storage";
import { addWorkingDays, fromIsoDate, nextWorkingDay, scheduledDate, toIsoDate, type WorkingCalendar } from "@shared/working-calendar";

/** How far past a date to read holidays when looking for the next working day. */
const LOOKAHEAD_DAYS = 366;

export interface TaskDates {
  startDate: Date | string | null;
  dueDate: Date | string | null;
}

/** Who a task belongs to: its internal assignee, else its customer assignee. */
export function taskOwnerId(task: {
  assignedToUserId?: string | null;
  assignedToCustomerUserId?: string | null;
}): string | null {
  return task.assignedToUserId || task.assignedToCustomerUserId || null;
}

function isoOf(value: Date | string | null): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : toIsoDate(d);
}

/**
 * The start and due dates (as ISO datetimes, like the task update route
 * takes) that change when the task's dates move onto `ownerId`'s calendar.
 * Empty when nothing moves, the task has no dates, or the project plans
 * every date on the project owner's calendar instead.
 */
export async function datesForNewOwner(
  projectId: number,
  task: TaskDates,
  ownerId: string | null,
): Promise<{ startDate?: string; dueDate?: string }> {
  if (!ownerId) return {};
  const start = isoOf(task.startDate);
  const due = isoOf(task.dueDate);
  if (!start && !due) return {};

  const project = await storage.getProjectScheduling(projectId);
  if (!project || !project.scheduleByTaskOwner) return {};

  const dates = [start, due].filter((d): d is string => !!d).sort();
  const from = dates[0];
  const until = new Date(fromIsoDate(dates[dates.length - 1]).getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const cal: WorkingCalendar = (await storage.getWorkingCalendarsForUsers([ownerId], from, toIsoDate(until))).get(ownerId) ?? {
    holidays: new Set<string>(),
  };

  const out: { startDate?: string; dueDate?: string } = {};
  const newStart = start ? nextWorkingDay(start, cal) : null;
  let newDue = due ? nextWorkingDay(due, cal) : null;
  if (newStart && newDue && newDue < newStart) newDue = newStart;
  if (newStart && newStart !== start) out.startDate = scheduledDate(newStart).toISOString();
  if (newDue && newDue !== due) out.dueDate = scheduledDate(newDue).toISOString();
  return out;
}

/** "Upcoming" on the MAP analytics and workload views: due within this many working days. */
export const UPCOMING_WORKING_DAYS = 5;

/**
 * The last "YYYY-MM-DD" that still counts as upcoming for each person, on
 * their own calendar (the null key: the organization's default calendars).
 */
export async function upcomingLimits(
  userIds: Array<string | null>,
  now = new Date(),
): Promise<Map<string | null, string>> {
  const today = toIsoDate(now);
  const until = toIsoDate(new Date(fromIsoDate(today).getTime() + 31 * 86_400_000));
  const keys = Array.from(new Set<string | null>([null, ...userIds]));
  const calendars = await storage.getWorkingCalendarsForUsers(keys, today, until);
  const out = new Map<string | null, string>();
  for (const key of keys) {
    out.set(key, addWorkingDays(today, UPCOMING_WORKING_DAYS, calendars.get(key) ?? { holidays: new Set<string>() }));
  }
  return out;
}

/** Due after `now` and on or before `limitIso`. */
export function isUpcoming(dueDate: Date | string | null | undefined, now: Date, limitIso: string | undefined): boolean {
  if (!dueDate || !limitIso) return false;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime()) || due <= now) return false;
  return toIsoDate(due) <= limitIso;
}
