// Work week and time off — mixin for DatabaseStorage.
//
// user_work_schedules and user_time_off (migration 107). Combined with the
// person's holidays into the WorkingCalendar MAP scheduling counts with.
// See docs/features/working-calendar.md.
import { db } from "../db";
import { and, asc, eq, gte, inArray, lte, notInArray } from "drizzle-orm";
import { userTimeOff, userWorkSchedules } from "@shared/schema";
import { DEFAULT_WORK_DAYS, type WorkingCalendar } from "@shared/working-calendar";
import {
  normalizeWorkDays,
  timeOffDates,
  type ScheduleSource,
  type TimeOffCreate,
  type TimeOffEntry,
  type WorkScheduleView,
} from "@shared/work-schedule";

// Lives on HolidayCalendarsStorageMixin; reached through the prototype chain.
interface HolidayDatesShape {
  getHolidayDatesForUsers(userIds: Array<string | null>, from: string, to: string): Promise<Map<string | null, Set<string>>>;
}
export interface WorkScheduleStorageMixin extends HolidayDatesShape {}

function toEntry(row: typeof userTimeOff.$inferSelect): TimeOffEntry {
  return {
    id: row.id,
    startDate: row.startDate,
    endDate: row.endDate,
    note: row.note,
    source: row.source === "outlook" ? "outlook" : "manual",
  };
}

export class WorkScheduleStorageMixin {
  /** The person's work week and their time off ending on or after `since`. */
  async getWorkScheduleView(userId: string, since: string): Promise<WorkScheduleView> {
    const [schedule] = await db.select().from(userWorkSchedules).where(eq(userWorkSchedules.userId, userId)).limit(1);
    const timeOff = await db
      .select()
      .from(userTimeOff)
      .where(and(eq(userTimeOff.userId, userId), gte(userTimeOff.endDate, since)))
      .orderBy(asc(userTimeOff.startDate), asc(userTimeOff.id));
    return {
      workDays: schedule ? normalizeWorkDays(schedule.workDays) : [...DEFAULT_WORK_DAYS],
      isDefault: !schedule,
      source: schedule ? (schedule.source === "outlook" ? "outlook" : "manual") : null,
      timeOff: timeOff.map(toEntry),
    };
  }

  async setWorkDays(userId: string, workDays: number[], source: ScheduleSource, updatedBy: string | null): Promise<void> {
    const set = { workDays: normalizeWorkDays(workDays), source, updatedBy, updatedAt: new Date() };
    await db
      .insert(userWorkSchedules)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userWorkSchedules.userId, set });
  }

  /** Back to Monday to Friday. */
  async clearWorkDays(userId: string): Promise<void> {
    await db.delete(userWorkSchedules).where(eq(userWorkSchedules.userId, userId));
  }

  async addTimeOff(userId: string, entry: TimeOffCreate, createdBy: string | null): Promise<TimeOffEntry> {
    const [row] = await db
      .insert(userTimeOff)
      .values({
        userId,
        startDate: entry.startDate,
        endDate: entry.endDate,
        note: entry.note ? entry.note : null,
        source: "manual",
        createdBy,
      })
      .returning();
    return toEntry(row);
  }

  /**
   * Removes one of the person's own time-off entries. Entries read from
   * Outlook can't be removed here (the next sync would bring them back), so
   * the answer is "outlook" for those and nothing changes.
   */
  async deleteTimeOff(userId: string, id: number): Promise<"deleted" | "not_found" | "outlook"> {
    const [row] = await db
      .select({ source: userTimeOff.source })
      .from(userTimeOff)
      .where(and(eq(userTimeOff.id, id), eq(userTimeOff.userId, userId)))
      .limit(1);
    if (!row) return "not_found";
    if (row.source === "outlook") return "outlook";
    await db.delete(userTimeOff).where(and(eq(userTimeOff.id, id), eq(userTimeOff.userId, userId)));
    return "deleted";
  }

  /**
   * Replaces the person's Outlook time off overlapping `from`..`to` with
   * `entries` (all-day "Out of office" events): new events are added, moved
   * ones updated, and ones gone from Outlook removed. Entries they added
   * themselves are never touched.
   */
  async syncOutlookTimeOff(
    userId: string,
    entries: ReadonlyArray<{ eventId: string; startDate: string; endDate: string }>,
    from: string,
    to: string,
  ): Promise<{ synced: number; removed: number }> {
    return db.transaction(async (tx) => {
      const ids = entries.map((e) => e.eventId);
      const stale = and(
        eq(userTimeOff.userId, userId),
        eq(userTimeOff.source, "outlook"),
        gte(userTimeOff.endDate, from),
        lte(userTimeOff.startDate, to),
        ...(ids.length ? [notInArray(userTimeOff.externalId, ids)] : []),
      );
      const removed = await tx.delete(userTimeOff).where(stale).returning({ id: userTimeOff.id });
      for (const entry of entries) {
        await tx
          .insert(userTimeOff)
          .values({ userId, startDate: entry.startDate, endDate: entry.endDate, source: "outlook", externalId: entry.eventId })
          .onConflictDoUpdate({
            target: [userTimeOff.userId, userTimeOff.externalId],
            set: { startDate: entry.startDate, endDate: entry.endDate },
          });
      }
      return { synced: entries.length, removed: removed.length };
    });
  }

  /**
   * The work week from Outlook. Only fills in or updates a work week that
   * came from Outlook: one the person (or an admin) set by hand wins.
   */
  async setOutlookWorkDays(userId: string, workDays: number[]): Promise<void> {
    const set = { workDays: normalizeWorkDays(workDays), source: "outlook" as const, updatedBy: null, updatedAt: new Date() };
    await db
      .insert(userWorkSchedules)
      .values({ userId, ...set })
      .onConflictDoUpdate({ target: userWorkSchedules.userId, set, setWhere: eq(userWorkSchedules.source, "outlook") });
  }

  /** The admin stopped reading working days from Outlook: everyone's falls back to Monday to Friday until they set one. */
  async clearOutlookWorkDays(): Promise<void> {
    await db.delete(userWorkSchedules).where(eq(userWorkSchedules.source, "outlook"));
  }

  /** After the person unlinks Outlook (or the admin removes the app): drop what came from it. */
  async clearOutlookSchedules(userId?: string): Promise<void> {
    await db
      .delete(userTimeOff)
      .where(userId ? and(eq(userTimeOff.userId, userId), eq(userTimeOff.source, "outlook")) : eq(userTimeOff.source, "outlook"));
    await db
      .delete(userWorkSchedules)
      .where(
        userId
          ? and(eq(userWorkSchedules.userId, userId), eq(userWorkSchedules.source, "outlook"))
          : eq(userWorkSchedules.source, "outlook"),
      );
  }

  /**
   * Each person's working calendar between `from` and `to`: their holidays
   * (own calendars, else the organization defaults) plus their time off, and
   * their work week. The null key is the organization default: default
   * holidays, Monday to Friday, no time off.
   */
  async getWorkingCalendarsForUsers(
    userIds: Array<string | null>,
    from: string,
    to: string,
  ): Promise<Map<string | null, WorkingCalendar>> {
    const holidays = await this.getHolidayDatesForUsers(userIds, from, to);
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    const schedules = ids.length
      ? await db.select().from(userWorkSchedules).where(inArray(userWorkSchedules.userId, ids))
      : [];
    const away = ids.length
      ? await db
          .select({ userId: userTimeOff.userId, startDate: userTimeOff.startDate, endDate: userTimeOff.endDate })
          .from(userTimeOff)
          .where(and(inArray(userTimeOff.userId, ids), gte(userTimeOff.endDate, from), lte(userTimeOff.startDate, to)))
      : [];

    const workDaysBy = new Map(schedules.map((s) => [s.userId, normalizeWorkDays(s.workDays)]));
    const awayBy = new Map<string, Array<{ startDate: string; endDate: string }>>();
    for (const row of away) awayBy.set(row.userId, [...(awayBy.get(row.userId) ?? []), row]);

    const result = new Map<string | null, WorkingCalendar>([[null, { holidays: holidays.get(null) ?? new Set<string>() }]]);
    for (const id of ids) {
      const daysOff = new Set(holidays.get(id) ?? []);
      for (const day of timeOffDates(awayBy.get(id) ?? [], from, to)) daysOff.add(day);
      result.set(id, { holidays: daysOff, workDays: workDaysBy.get(id) });
    }
    return result;
  }
}
