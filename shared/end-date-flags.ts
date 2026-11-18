// Which end-date flag (Admin › Configuration › Field Settings › End Date
// Flags) a date gets. One rule for the project badge on the client and the
// Kanban border colour on the server.
//
// "Days before" flags with `workingDays` count working days: weekends and the
// organization's default holiday calendars don't count, so a project due
// Monday is 1 working day away on Friday. "Days after" (overdue) and "exact
// date" flags always count calendar days. See docs/features/working-calendar.md.
import { fromIsoDate, workingDaysBetween, type WorkingCalendar } from "./working-calendar";

export interface EndDateFlagRule {
  isActive?: boolean | null;
  targetField?: string | null;
  projectStatuses?: string[] | null;
  triggerType: string;
  triggerValue: number;
  priority?: number | null;
  workingDays?: boolean | null;
}

/** Statuses that never show a flag. */
const CLOSED_STATUSES = ["closed won", "closed lost", "cancelled", "completed"];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar days from `todayIso` to `dueIso` (negative when past). */
export function calendarDaysUntil(todayIso: string, dueIso: string): number {
  return Math.round((fromIsoDate(dueIso).getTime() - fromIsoDate(todayIso).getTime()) / DAY_MS);
}

export interface EndDateFlagContext {
  todayIso: string;
  dueIso: string;
  projectStatus?: string | null;
  targetField?: string;
  /** Days off for working-day flags; without it they count calendar days. */
  calendar?: WorkingCalendar;
}

/** Whether one flag applies. */
export function endDateFlagMatches(flag: EndDateFlagRule, ctx: EndDateFlagContext): boolean {
  if (flag.isActive === false) return false;
  if ((flag.targetField || "project.endDate") !== (ctx.targetField ?? "project.endDate")) return false;

  const status = ctx.projectStatus?.toLowerCase() ?? null;
  if (flag.projectStatuses && flag.projectStatuses.length > 0) {
    if (!status) return false;
    if (!flag.projectStatuses.map((s) => s.toLowerCase()).includes(status)) return false;
  }
  if (status && CLOSED_STATUSES.includes(status)) return false;

  const days = calendarDaysUntil(ctx.todayIso, ctx.dueIso);
  switch (flag.triggerType) {
    case "days_before": {
      if (days < 0) return false;
      const away = flag.workingDays && ctx.calendar ? workingDaysBetween(ctx.todayIso, ctx.dueIso, ctx.calendar) : days;
      return away <= flag.triggerValue;
    }
    case "days_after":
      return days < 0 && Math.abs(days) >= flag.triggerValue;
    case "exact_date":
      return days === flag.triggerValue;
    default:
      return false;
  }
}

/** The highest-priority flag that applies, or null. */
export function pickEndDateFlag<T extends EndDateFlagRule>(flags: readonly T[], ctx: EndDateFlagContext): T | null {
  let best: T | null = null;
  for (const flag of flags) {
    if (!endDateFlagMatches(flag, ctx)) continue;
    if (!best || (flag.priority ?? 0) > (best.priority ?? 0)) best = flag;
  }
  return best;
}
