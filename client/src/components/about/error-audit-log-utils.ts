// Shared helpers for the Client Error Audit Log surface.
//
// The table (ErrorAuditLogTab) and the analytics panel
// (ClientErrorsAnalytics) both consume the same `/api/error-logs?limit=500`
// query. They need to apply the EXACT same search-term + context-filter
// logic so the four charts stay in sync with the row count shown below
// — otherwise an admin filters down to 1 high-severity row and the
// analytics still claims "111 captured errors", which has confused
// support reviewers in the past.
//
// Keep this module thin and pure (no React, no React Query). Both
// components import it directly.

import { classifyErrorSeverity, type SeverityLevel } from "@/lib/error-severity";

/**
 * Combined filter shape applied by both the table and the analytics
 * panel. All fields are optional. String filters use the sentinel
 * `"all"` for "no filter". Dates are accepted as YYYY-MM-DD strings
 * (the value `<input type="date">` produces) or empty string for
 * unset.
 */
export interface ErrorLogFilters {
  searchTerm?: string;
  contextFilter?: string;
  versionFilter?: string;
  urlFilter?: string;
  severityFilter?: SeverityLevel | "all";
  userFilter?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Single error log row as returned by `GET /api/error-logs`. Mirrors the
 * `ClientErrorLog` interface in `ErrorAuditLogTab.tsx` — kept here as a
 * `Pick`-friendly shape so callers can pass either typed rows or `any`.
 */
export interface ErrorLogLike {
  id: number;
  errorId: string;
  timestamp: string;
  context: string | null;
  userId: string | null;
  message: string | null;
  stack: string | null;
  url: string | null;
  userAgent: string | null;
  details: unknown;
  user: {
    id: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  appVersion?: string | null;
  httpStatus?: number | null;
  errorHash?: string | null;
}

/**
 * Apply the audit log's filter set to a list of raw error rows. Pulled
 * out of `ErrorAuditLogTab.tsx` so the analytics panel can re-use it.
 * Every dimension is optional; pass only what's set. Case-insensitive
 * substring match for `searchTerm` (across the same eight fields the
 * table already searches), exact match for the dropdowns, inclusive
 * date range. URL match compares the parsed pathname so query strings
 * don't fragment the filter.
 */
export function filterErrorLogs<T extends ErrorLogLike>(
  logs: readonly T[],
  filters: ErrorLogFilters
): T[] {
  const {
    searchTerm = "",
    contextFilter = "all",
    versionFilter = "all",
    urlFilter = "all",
    severityFilter = "all",
    userFilter = "all",
    dateFrom = "",
    dateTo = "",
  } = filters;

  let filtered: T[] = logs as T[];

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(log =>
      (log.errorId || "").toLowerCase().includes(term) ||
      (log.message || "").toLowerCase().includes(term) ||
      (log.userId || "").toLowerCase().includes(term) ||
      (log.user?.email || "").toLowerCase().includes(term) ||
      (log.user?.firstName || "").toLowerCase().includes(term) ||
      (log.user?.lastName || "").toLowerCase().includes(term) ||
      (log.url || "").toLowerCase().includes(term) ||
      (log.context || "").toLowerCase().includes(term)
    );
  }

  if (contextFilter !== "all") {
    filtered = filtered.filter(log => log.context === contextFilter);
  }

  if (versionFilter !== "all") {
    filtered = filtered.filter(log => (log.appVersion ?? "") === versionFilter);
  }

  if (urlFilter !== "all") {
    filtered = filtered.filter(log => urlPathOf(log.url) === urlFilter);
  }

  if (severityFilter !== "all") {
    filtered = filtered.filter(log => {
      const cls = classifyErrorSeverity(log.message, log.context, log.details);
      return cls.severity === severityFilter;
    });
  }

  if (userFilter !== "all") {
    filtered = filtered.filter(log => userKeyOf(log) === userFilter);
  }

  if (dateFrom) {
    const fromTs = Date.parse(dateFrom);
    if (!isNaN(fromTs)) {
      filtered = filtered.filter(log => {
        if (!log.timestamp) return false;
        const ts = Date.parse(log.timestamp);
        return !isNaN(ts) && ts >= fromTs;
      });
    }
  }
  if (dateTo) {
    // Inclusive end-of-day so YYYY-MM-DD captures the whole day.
    const toTs = Date.parse(dateTo);
    if (!isNaN(toTs)) {
      const inclusiveEnd = toTs + 24 * 60 * 60 * 1000 - 1;
      filtered = filtered.filter(log => {
        if (!log.timestamp) return false;
        const ts = Date.parse(log.timestamp);
        return !isNaN(ts) && ts <= inclusiveEnd;
      });
    }
  }

  return filtered;
}

/** Stable URL key used by both the URL filter dropdown and the matcher. */
export function urlPathOf(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "(unknown)";
  try {
    const u = new URL(rawUrl);
    return u.pathname || "/";
  } catch {
    return rawUrl;
  }
}

/**
 * Stable per-row key for the User filter dropdown. Prefer the resolved
 * user (firstName + lastName, then email, then id), fall back to the
 * raw userId string, finally the literal "Anonymous" sentinel so
 * unauthenticated errors still group together rather than vanishing.
 */
export function userKeyOf(log: ErrorLogLike): string {
  if (log.user) {
    const name = [log.user.firstName, log.user.lastName].filter(Boolean).join(" ").trim();
    if (name) return name;
    if (log.user.email) return log.user.email;
    return log.user.id;
  }
  return log.userId || "Anonymous";
}

/**
 * Extract every unique value that should appear in the Search and
 * Filters dropdowns. Computed centrally in `SupportFeaturesTab` so the
 * table and the analytics share the exact same sorted lists.
 */
export interface ErrorLogFacets {
  contexts: string[];
  versions: string[];
  urls: string[];
  users: string[];
}
export function extractErrorLogFacets(logs: readonly ErrorLogLike[]): ErrorLogFacets {
  const contexts = new Set<string>();
  const versions = new Set<string>();
  const urls = new Set<string>();
  const users = new Set<string>();
  for (const log of logs) {
    if (log.context) contexts.add(log.context);
    if (log.appVersion) versions.add(log.appVersion);
    const u = urlPathOf(log.url);
    if (u && u !== "(unknown)") urls.add(u);
    users.add(userKeyOf(log));
  }
  return {
    contexts: Array.from(contexts).sort(),
    versions: Array.from(versions).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    urls: Array.from(urls).sort(),
    users: Array.from(users).sort(),
  };
}

/**
 * Build the client-side analytics shape from an already-filtered list
 * of error rows. Same field set the server's `/api/error-logs/analytics`
 * endpoint produces — kept structurally identical so the chart-binding
 * code in `ClientErrorsAnalytics.tsx` doesn't change shape. Severity
 * uses the same `classifyErrorSeverity` heuristic the table already
 * uses for the per-row severity badge, so chart and table always agree.
 */
export interface ErrorLogAnalytics {
  totalErrors: number;
  errorsByDay: Array<{ date: string; count: number }>;
  topPages: Array<{ page: string; count: number }>;
  topMessages: Array<{ message: string; count: number }>;
  severityCounts: Record<SeverityLevel, number>;
}

export function computeErrorLogAnalytics(
  logs: readonly ErrorLogLike[],
  windowDays = 14
): ErrorLogAnalytics {
  const severityCounts: Record<SeverityLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  const pageCounts = new Map<string, number>();
  const messageCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();

  // Zero-fill the trailing `windowDays` so the bar chart always shows
  // a contiguous axis even when most days have zero errors. The
  // ISO YYYY-MM-DD key is what the chart-binding code expects.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dayCounts.set(toIsoDate(d), 0);
  }
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - (windowDays - 1));

  for (const log of logs) {
    // Severity — classify via the same heuristic the table uses,
    // including the `details` payload so self-recovered (nonJsonResponse)
    // errors get counted as Low instead of inflating the High slice.
    const cls = classifyErrorSeverity(log.message, log.context, log.details);
    severityCounts[cls.severity] = (severityCounts[cls.severity] ?? 0) + 1;

    // Top pages — group by URL pathname when parseable, else raw URL.
    let pageKey = log.url || "unknown";
    if (log.url) {
      try {
        pageKey = new URL(log.url).origin + new URL(log.url).pathname;
      } catch {
        /* keep raw */
      }
    }
    pageCounts.set(pageKey, (pageCounts.get(pageKey) ?? 0) + 1);

    // Top messages — group by full message text.
    const msgKey = (log.message ?? "").trim() || "(no message)";
    messageCounts.set(msgKey, (messageCounts.get(msgKey) ?? 0) + 1);

    // Errors by day — only count rows inside the trailing window.
    if (log.timestamp) {
      const ts = new Date(log.timestamp);
      if (!isNaN(ts.getTime()) && ts >= windowStart) {
        const key = toIsoDate(ts);
        if (dayCounts.has(key)) {
          dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const errorsByDay = Array.from(dayCounts.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topN = <K,>(m: Map<K, number>, n: number): Array<{ key: K; count: number }> =>
    Array.from(m.entries())
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

  return {
    totalErrors: logs.length,
    errorsByDay,
    topPages: topN(pageCounts, 5).map(e => ({ page: e.key, count: e.count })),
    topMessages: topN(messageCounts, 5).map(e => ({ message: e.key, count: e.count })),
    severityCounts,
  };
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build a JSON payload representing one error log, structured for
 * handing to an LLM. Includes every field the row exposes in the UI
 * (timestamp, severity classification with impact prose, context,
 * version, message, URL, user identity, full stack, HTTP status,
 * userAgent, and the raw `details` blob that may already be an object
 * or a JSON-encoded string). Fields without a value are emitted as
 * `null` rather than omitted — easier for downstream prompting.
 */
export function buildErrorLogJson(log: ErrorLogLike): Record<string, unknown> {
  const cls = classifyErrorSeverity(log.message, log.context, log.details);
  let parsedDetails: unknown = log.details;
  if (typeof log.details === "string") {
    try {
      parsedDetails = JSON.parse(log.details);
    } catch {
      // keep raw string if it's not valid JSON
    }
  }
  return {
    id: log.id,
    errorId: log.errorId,
    timestamp: log.timestamp,
    severity: cls.severity,
    severityLabel: cls.severity, // duplicate label for prompt scanners
    impact: cls.impact,
    selfRecovered: cls.selfRecovered === true,
    context: log.context,
    appVersion: log.appVersion ?? null,
    httpStatus: log.httpStatus ?? null,
    errorHash: log.errorHash ?? null,
    message: log.message,
    url: log.url,
    user: log.user
      ? {
          id: log.user.id,
          email: log.user.email,
          firstName: log.user.firstName,
          lastName: log.user.lastName,
        }
      : null,
    userId: log.userId,
    userAgent: log.userAgent,
    stack: log.stack,
    details: parsedDetails ?? null,
  };
}

/**
 * Trigger a browser download of a JSON payload as a file. Used by the
 * per-row "Download JSON" action in the audit log table; kept generic
 * so other download actions in this folder can reuse it later.
 */
export function downloadJsonFile(filename: string, payload: unknown): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
