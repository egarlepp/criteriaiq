// Page views — mixin for DatabaseStorage.
//
// page_view_daily (migration 095) holds one row per UTC day, page and user.
// Recording a view is one upsert; reading returns totals per page only, so
// nothing here can list what one person opened.
import { db } from "../db";
import { countDistinct, gte, lt, max, min, sql } from "drizzle-orm";
import { pageViewDaily } from "@shared/schema";
import { PAGE_VIEW_MAX_KEYS_PER_USER_DAY, type PageUsageRow } from "@shared/page-views";

export interface PageUsageTotals {
  rows: PageUsageRow[];
  activeUsers: number;
  trackingSince: string | null;
}

export class PageViewsStorageMixin {
  /**
   * Adds one view of `pageKey` by `userId` today (UTC). A new page for the
   * day is skipped once the person already has the daily maximum of pages,
   * so made-up keys can't grow the table without bound. Returns whether the
   * view was recorded.
   */
  async recordPageView(userId: string, pageKey: string): Promise<boolean> {
    const result = await db.execute(sql`
      INSERT INTO page_view_daily (day, page_key, user_id)
      SELECT (now() AT TIME ZONE 'UTC')::date, ${pageKey}, ${userId}
      WHERE EXISTS (
          SELECT 1 FROM page_view_daily
          WHERE day = (now() AT TIME ZONE 'UTC')::date AND page_key = ${pageKey} AND user_id = ${userId}
        )
        OR (
          SELECT count(*) FROM page_view_daily
          WHERE day = (now() AT TIME ZONE 'UTC')::date AND user_id = ${userId}
        ) < ${PAGE_VIEW_MAX_KEYS_PER_USER_DAY}
      ON CONFLICT (day, page_key, user_id)
      DO UPDATE SET views = page_view_daily.views + 1, last_viewed_at = now()
    `);
    return Number((result as { rowCount?: number | null }).rowCount ?? 0) > 0;
  }

  /** Totals per page for every day from `sinceDay` (YYYY-MM-DD, inclusive). */
  async getPageUsageTotals(sinceDay: string): Promise<PageUsageTotals> {
    const rows = await db
      .select({
        pageKey: pageViewDaily.pageKey,
        views: sql<number>`sum(${pageViewDaily.views})`.mapWith(Number),
        users: countDistinct(pageViewDaily.userId),
        lastViewedAt: max(pageViewDaily.lastViewedAt),
      })
      .from(pageViewDaily)
      .where(gte(pageViewDaily.day, sinceDay))
      .groupBy(pageViewDaily.pageKey);
    const [active] = await db
      .select({ value: countDistinct(pageViewDaily.userId) })
      .from(pageViewDaily)
      .where(gte(pageViewDaily.day, sinceDay));
    const [first] = await db.select({ day: min(pageViewDaily.day) }).from(pageViewDaily);
    return {
      rows: rows.map((r) => ({
        pageKey: r.pageKey,
        views: Number(r.views),
        users: Number(r.users),
        lastViewedAt: r.lastViewedAt ? new Date(r.lastViewedAt).toISOString() : new Date(0).toISOString(),
      })),
      activeUsers: Number(active?.value ?? 0),
      trackingSince: first?.day ?? null,
    };
  }

  /** Deletes days before `beforeDay` (YYYY-MM-DD); returns how many rows went. */
  async prunePageViews(beforeDay: string): Promise<number> {
    const removed = await db.delete(pageViewDaily).where(lt(pageViewDaily.day, beforeDay)).returning({ day: pageViewDaily.day });
    return removed.length;
  }
}
