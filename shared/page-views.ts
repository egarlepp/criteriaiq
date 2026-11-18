// Page-view counting (Admin › Monitoring & Audit › Page Usage). Shared by the
// client, which names the page, and the server, which checks the name and
// sums the counts. See docs/features/page-usage.md.

/** A page key is a sidebar entry id, or one of the few pages outside the menu. */
export const PAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/;

/** Rows older than this are pruned daily. */
export const PAGE_VIEW_RETENTION_DAYS = 400;

/**
 * Most distinct pages one person can add in a day. Real use is a few dozen;
 * the cap stops a script filling the table with made-up keys.
 */
export const PAGE_VIEW_MAX_KEYS_PER_USER_DAY = 300;

/** Windows the Page Usage screen offers, in days. */
export const PAGE_USAGE_WINDOWS = [30, 90, 180, 365] as const;
export type PageUsageWindow = (typeof PAGE_USAGE_WINDOWS)[number];

export interface PageUsageRow {
  pageKey: string;
  views: number;
  /** Distinct people who opened the page in the window. */
  users: number;
  /** ISO time of the most recent view. */
  lastViewedAt: string;
}

export interface PageUsageReport {
  days: PageUsageWindow;
  /** First day with any recorded view (YYYY-MM-DD), or null before the first. */
  trackingSince: string | null;
  /** Distinct people who opened any page in the window. */
  activeUsers: number;
  rows: PageUsageRow[];
}

export function isPageKey(value: unknown): value is string {
  return typeof value === "string" && PAGE_KEY_PATTERN.test(value);
}
