// Holiday calendars — mixin for DatabaseStorage.
//
// holiday_calendars, holiday_dates and user_holiday_calendars (migration 101).
// Downloading from the public feed lives in server/services/holiday-calendars.ts;
// this layer only reads and writes rows.
import { db } from "../db";
import { and, asc, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  accountHolidayCalendars,
  holidayCalendars,
  holidayDates,
  userHolidayCalendars,
  users,
  type HolidayCalendarRow,
} from "@shared/schema";
import {
  isCountryCalendarCode,
  type AccountHolidayAssignment,
  type HolidayAssignment,
  type HolidayCalendarSummary,
  type HolidayDate,
  type MyHolidayCalendars,
} from "@shared/holiday-calendars";

export class HolidayCalendarsStorageMixin {
  async listHolidayCalendars(today: string): Promise<HolidayCalendarSummary[]> {
    const cals = await db.select().from(holidayCalendars).orderBy(asc(holidayCalendars.name));
    if (cals.length === 0) return [];

    const counts = await db
      .select({ calendarId: holidayDates.calendarId, n: count() })
      .from(holidayDates)
      .groupBy(holidayDates.calendarId);
    const countMap = new Map(counts.map((r) => [r.calendarId, Number(r.n)]));

    // Next holiday per calendar: the earliest date on or after today. A
    // calendar holds about two years of dates, so reading the upcoming ones
    // is cheap.
    const upcoming = await db
      .select({ calendarId: holidayDates.calendarId, date: holidayDates.date, name: holidayDates.name })
      .from(holidayDates)
      .where(gte(holidayDates.date, today))
      .orderBy(asc(holidayDates.calendarId), asc(holidayDates.date));
    const nextMap = new Map<number, { date: string; name: string }>();
    for (const r of upcoming) {
      if (!nextMap.has(r.calendarId)) nextMap.set(r.calendarId, { date: r.date, name: r.name });
    }

    return cals.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isCountry: isCountryCalendarCode(c.code),
      isDefault: c.isDefault,
      dateCount: countMap.get(c.id) ?? 0,
      nextHoliday: nextMap.get(c.id) ?? null,
      lastRefreshedAt: c.lastRefreshedAt ? c.lastRefreshedAt.toISOString() : null,
    }));
  }

  async getHolidayCalendar(id: number): Promise<HolidayCalendarRow | null> {
    const [row] = await db.select().from(holidayCalendars).where(eq(holidayCalendars.id, id)).limit(1);
    return row ?? null;
  }

  async getHolidayCalendarByCode(code: string): Promise<HolidayCalendarRow | null> {
    const [row] = await db
      .select()
      .from(holidayCalendars)
      .where(sql`lower(${holidayCalendars.code}) = lower(${code})`)
      .limit(1);
    return row ?? null;
  }

  async createHolidayCalendar(value: { code: string; name: string }): Promise<HolidayCalendarRow> {
    const [row] = await db.insert(holidayCalendars).values(value).returning();
    return row;
  }

  async updateHolidayCalendar(id: number, value: { name?: string; isDefault?: boolean }): Promise<HolidayCalendarRow | null> {
    const [row] = await db.update(holidayCalendars).set(value).where(eq(holidayCalendars.id, id)).returning();
    return row ?? null;
  }

  async countDefaultHolidayCalendars(): Promise<number> {
    const [row] = await db.select({ n: count() }).from(holidayCalendars).where(eq(holidayCalendars.isDefault, true));
    return Number(row?.n ?? 0);
  }

  /** Dates and user assignments go with it (ON DELETE CASCADE). */
  async deleteHolidayCalendar(id: number): Promise<boolean> {
    const rows = await db.delete(holidayCalendars).where(eq(holidayCalendars.id, id)).returning({ id: holidayCalendars.id });
    return rows.length > 0;
  }

  async listHolidayDates(calendarId: number): Promise<HolidayDate[]> {
    return db
      .select({ id: holidayDates.id, calendarId: holidayDates.calendarId, date: holidayDates.date, name: holidayDates.name })
      .from(holidayDates)
      .where(eq(holidayDates.calendarId, calendarId))
      .orderBy(asc(holidayDates.date));
  }

  /** Adds a date, or renames it when the calendar already has that day. */
  async upsertHolidayDate(calendarId: number, date: string, name: string): Promise<HolidayDate> {
    const [row] = await db
      .insert(holidayDates)
      .values({ calendarId, date, name })
      .onConflictDoUpdate({ target: [holidayDates.calendarId, holidayDates.date], set: { name } })
      .returning();
    return { id: row.id, calendarId: row.calendarId, date: row.date, name: row.name };
  }

  async deleteHolidayDate(calendarId: number, dateId: number): Promise<boolean> {
    const rows = await db
      .delete(holidayDates)
      .where(and(eq(holidayDates.id, dateId), eq(holidayDates.calendarId, calendarId)))
      .returning({ id: holidayDates.id });
    return rows.length > 0;
  }

  /**
   * Replaces one year of a calendar with a fresh download, in one transaction,
   * so a holiday that moved (an observed day, a lunar date) never shows twice.
   */
  async replaceHolidayYear(
    calendarId: number,
    year: number,
    dates: Array<{ date: string; name: string }>,
  ): Promise<{ added: number; removed: number }> {
    return db.transaction(async (tx) => {
      const removed = await tx
        .delete(holidayDates)
        .where(
          and(
            eq(holidayDates.calendarId, calendarId),
            gte(holidayDates.date, `${year}-01-01`),
            lte(holidayDates.date, `${year}-12-31`),
          ),
        )
        .returning({ id: holidayDates.id });
      let added = 0;
      if (dates.length > 0) {
        const inserted = await tx
          .insert(holidayDates)
          .values(dates.map((d) => ({ calendarId, date: d.date, name: d.name })))
          .onConflictDoNothing()
          .returning({ id: holidayDates.id });
        added = inserted.length;
      }
      await tx.update(holidayCalendars).set({ lastRefreshedAt: new Date() }).where(eq(holidayCalendars.id, calendarId));
      return { added, removed: removed.length };
    });
  }

  async listHolidayAssignments(): Promise<HolidayAssignment[]> {
    const rows = await db
      .select({ userId: userHolidayCalendars.userId, calendarId: userHolidayCalendars.calendarId })
      .from(userHolidayCalendars)
      .orderBy(asc(userHolidayCalendars.userId), asc(userHolidayCalendars.calendarId));
    const byUser = new Map<string, number[]>();
    for (const r of rows) {
      const list = byUser.get(r.userId) ?? [];
      list.push(r.calendarId);
      byUser.set(r.userId, list);
    }
    return [...byUser.entries()].map(([userId, calendarIds]) => ({ userId, calendarIds }));
  }

  /** Replaces a user's calendars. Unknown calendar ids are dropped. */
  async setUserHolidayCalendars(userId: string, calendarIds: number[]): Promise<number[]> {
    return db.transaction(async (tx) => {
      const known = calendarIds.length
        ? (
            await tx
              .select({ id: holidayCalendars.id })
              .from(holidayCalendars)
              .where(inArray(holidayCalendars.id, calendarIds))
          ).map((r) => r.id)
        : [];
      const keep = [...new Set(calendarIds)].filter((id) => known.includes(id));
      await tx.delete(userHolidayCalendars).where(eq(userHolidayCalendars.userId, userId));
      if (keep.length > 0) {
        await tx.insert(userHolidayCalendars).values(keep.map((calendarId) => ({ userId, calendarId })));
      }
      return keep;
    });
  }

  async listAccountHolidayAssignments(): Promise<AccountHolidayAssignment[]> {
    const rows = await db
      .select({ accountId: accountHolidayCalendars.accountId, calendarId: accountHolidayCalendars.calendarId })
      .from(accountHolidayCalendars)
      .orderBy(asc(accountHolidayCalendars.accountId), asc(accountHolidayCalendars.calendarId));
    const byAccount = new Map<number, number[]>();
    for (const r of rows) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r.calendarId]);
    return [...byAccount.entries()].map(([accountId, calendarIds]) => ({ accountId, calendarIds }));
  }

  /** Replaces an account's calendars. Unknown calendar ids are dropped. */
  async setAccountHolidayCalendars(accountId: number, calendarIds: number[]): Promise<number[]> {
    return db.transaction(async (tx) => {
      const known = calendarIds.length
        ? (await tx.select({ id: holidayCalendars.id }).from(holidayCalendars).where(inArray(holidayCalendars.id, calendarIds))).map(
            (r) => r.id,
          )
        : [];
      const keep = [...new Set(calendarIds)].filter((id) => known.includes(id));
      await tx.delete(accountHolidayCalendars).where(eq(accountHolidayCalendars.accountId, accountId));
      if (keep.length > 0) {
        await tx.insert(accountHolidayCalendars).values(keep.map((calendarId) => ({ accountId, calendarId })));
      }
      return keep;
    });
  }

  /** Each user's account calendars (users with an account that has some). */
  private async accountCalendarsForUsers(userIds: string[]): Promise<Map<string, number[]>> {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ userId: users.id, calendarId: accountHolidayCalendars.calendarId })
      .from(users)
      .innerJoin(accountHolidayCalendars, eq(accountHolidayCalendars.accountId, users.accountId))
      .where(inArray(users.id, userIds));
    const out = new Map<string, number[]>();
    for (const r of rows) out.set(r.userId, [...(out.get(r.userId) ?? []), r.calendarId]);
    return out;
  }

  /**
   * The calendars that apply to one user: their own, else their account's,
   * else the organization defaults. Each comes with its next
   * `upcomingLimit` holidays from `today`.
   */
  async getUserHolidayCalendarView(userId: string, today: string, upcomingLimit: number): Promise<MyHolidayCalendars> {
    const own = await db
      .select({ id: holidayCalendars.id, code: holidayCalendars.code, name: holidayCalendars.name })
      .from(userHolidayCalendars)
      .innerJoin(holidayCalendars, eq(holidayCalendars.id, userHolidayCalendars.calendarId))
      .where(eq(userHolidayCalendars.userId, userId))
      .orderBy(asc(holidayCalendars.name));
    const accountIds = own.length ? [] : ((await this.accountCalendarsForUsers([userId])).get(userId) ?? []);
    const account = accountIds.length
      ? await db
          .select({ id: holidayCalendars.id, code: holidayCalendars.code, name: holidayCalendars.name })
          .from(holidayCalendars)
          .where(inArray(holidayCalendars.id, accountIds))
          .orderBy(asc(holidayCalendars.name))
      : [];
    const cals = own.length
      ? own
      : account.length
        ? account
        : await db
            .select({ id: holidayCalendars.id, code: holidayCalendars.code, name: holidayCalendars.name })
            .from(holidayCalendars)
            .where(eq(holidayCalendars.isDefault, true))
            .orderBy(asc(holidayCalendars.name));
    const source: MyHolidayCalendars["source"] = own.length
      ? "user"
      : account.length
        ? "account"
        : cals.length
          ? "default"
          : "none";
    if (cals.length === 0) return { source, calendars: [] };

    // At most three calendars of about two years each, so reading every
    // upcoming date and keeping the first few per calendar is cheap.
    const upcoming = await db
      .select({ calendarId: holidayDates.calendarId, date: holidayDates.date, name: holidayDates.name })
      .from(holidayDates)
      .where(and(inArray(holidayDates.calendarId, cals.map((c) => c.id)), gte(holidayDates.date, today)))
      .orderBy(asc(holidayDates.date));
    const byCalendar = new Map<number, Array<{ date: string; name: string }>>();
    for (const r of upcoming) {
      const list = byCalendar.get(r.calendarId) ?? [];
      if (list.length < upcomingLimit) list.push({ date: r.date, name: r.name });
      byCalendar.set(r.calendarId, list);
    }

    return {
      source,
      calendars: cals.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isCountry: isCountryCalendarCode(c.code),
        upcoming: byCalendar.get(c.id) ?? [],
      })),
    };
  }

  /**
   * Holiday dates between `from` and `to` ("YYYY-MM-DD", inclusive) for each
   * person: from their own calendars, else their account's, else the
   * organization defaults. The
   * `null` key, and anyone without calendars, gets the defaults. One query
   * per table, however many people are asked about.
   */
  async getHolidayDatesForUsers(
    userIds: Array<string | null>,
    from: string,
    to: string,
  ): Promise<Map<string | null, Set<string>>> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    const own = ids.length
      ? await db
          .select({ userId: userHolidayCalendars.userId, calendarId: userHolidayCalendars.calendarId })
          .from(userHolidayCalendars)
          .where(inArray(userHolidayCalendars.userId, ids))
      : [];
    const defaults = (
      await db.select({ id: holidayCalendars.id }).from(holidayCalendars).where(eq(holidayCalendars.isDefault, true))
    ).map((r) => r.id);

    const calendarsByUser = new Map<string, number[]>();
    for (const r of own) calendarsByUser.set(r.userId, [...(calendarsByUser.get(r.userId) ?? []), r.calendarId]);
    const byAccount = await this.accountCalendarsForUsers(ids.filter((id) => !calendarsByUser.has(id)));
    for (const [userId, calendarIds] of byAccount) calendarsByUser.set(userId, calendarIds);

    const allCalendarIds = [...new Set([...defaults, ...[...calendarsByUser.values()].flat()])];
    const datesByCalendar = new Map<number, string[]>();
    if (allCalendarIds.length > 0) {
      const rows = await db
        .select({ calendarId: holidayDates.calendarId, date: holidayDates.date })
        .from(holidayDates)
        .where(and(inArray(holidayDates.calendarId, allCalendarIds), gte(holidayDates.date, from), lte(holidayDates.date, to)));
      for (const r of rows) datesByCalendar.set(r.calendarId, [...(datesByCalendar.get(r.calendarId) ?? []), r.date]);
    }

    const datesFor = (calendarIds: number[]) => new Set(calendarIds.flatMap((id) => datesByCalendar.get(id) ?? []));
    const result = new Map<string | null, Set<string>>([[null, datesFor(defaults)]]);
    for (const id of ids) result.set(id, datesFor(calendarsByUser.get(id) ?? defaults));
    return result;
  }
}
