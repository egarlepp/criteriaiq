// Pure helpers for the Reports page (client/src/pages/reports.tsx): the one
// report library (built-in reports, Login Audit, saved custom reports) joined
// to the scheduled sends from GET /api/report-schedules, its filters, and the
// four delivery counts at the top of the page.
import { isSameMonth } from "date-fns";
import {
  reportKey,
  type ReportCalendarEvent,
  type ReportCalendarEventStatus,
  type ReportCalendarSchedule,
  type ReportScheduleFrequency,
} from "@shared/report-schedule-calendar";

export const LOGIN_AUDIT_REPORT_ID = "login-audit-report";
export const LOGIN_AUDIT_KEY = `security:${LOGIN_AUDIT_REPORT_ID}`;

/** Built-in = shared/system-reports.ts; security = Login Audit; saved = a custom report. */
export const REPORT_KINDS = ["builtIn", "security", "saved"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface LibraryReport {
  /** reportKey(category, id), or LOGIN_AUDIT_KEY. Matches ReportCalendarSchedule.reportKey. */
  key: string;
  kind: ReportKind;
  /** Built-in report id, custom report id as text, or LOGIN_AUDIT_REPORT_ID. */
  id: string;
  name: string;
  description: string;
  /** Login Audit has no scheduled delivery. */
  schedulable: boolean;
  starred: boolean;
  /** Earliest upcoming send of an active schedule, ISO. */
  nextSendAt: string | null;
  /** Latest finished send; status is null when only the schedule's lastRunAt is known. */
  lastRun: { at: string; status: ReportCalendarEventStatus | null } | null;
  /** Active schedules that send this report. */
  activeSchedules: number;
}

export interface ReportFavorite {
  reportType: string;
  reportId?: number | null;
  systemReportId?: string | null;
}

export interface SavedReportSummary {
  id: number;
  name: string;
  description?: string | null;
}

export interface BuiltInReportSummary {
  id: string;
  name: string;
  description: string;
}

export function isFavorite(favorites: readonly ReportFavorite[], kind: ReportKind, id: string): boolean {
  return favorites.some((f) =>
    kind === "saved"
      ? f.reportType === "custom" && String(f.reportId) === id
      : f.reportType === "system" && f.systemReportId === id,
  );
}

/** One row per report, with its schedule state. Order: starred, then next send, then name. */
export function buildLibrary(input: {
  builtIn: readonly BuiltInReportSummary[];
  loginAudit: BuiltInReportSummary | null;
  saved: readonly SavedReportSummary[];
  favorites: readonly ReportFavorite[];
  schedules: readonly ReportCalendarSchedule[];
  events: readonly ReportCalendarEvent[];
  now: Date;
}): LibraryReport[] {
  const { schedules, events, favorites, now } = input;
  const nowIso = now.toISOString();
  const scheduleKey = new Map(schedules.map((s) => [s.id, s.reportKey]));

  const nextByKey = new Map<string, string>();
  const lastByKey = new Map<string, { at: string; status: ReportCalendarEventStatus | null }>();
  const activeByKey = new Map<string, number>();
  const earlier = (map: Map<string, string>, key: string, at: string) => {
    const cur = map.get(key);
    if (!cur || at < cur) map.set(key, at);
  };

  for (const s of schedules) {
    if (!s.reportKey) continue;
    if (s.active) {
      activeByKey.set(s.reportKey, (activeByKey.get(s.reportKey) ?? 0) + 1);
      if (s.nextRunAt && s.nextRunAt >= nowIso) earlier(nextByKey, s.reportKey, s.nextRunAt);
    }
    if (s.lastRunAt) {
      const cur = lastByKey.get(s.reportKey);
      if (!cur || s.lastRunAt > cur.at) lastByKey.set(s.reportKey, { at: s.lastRunAt, status: null });
    }
  }
  for (const e of events) {
    const key = scheduleKey.get(e.scheduleId);
    if (!key) continue;
    if (e.status === "upcoming") {
      if (e.at >= nowIso) earlier(nextByKey, key, e.at);
      continue;
    }
    const cur = lastByKey.get(key);
    // A logged run outranks the schedule's bare lastRunAt for the same moment.
    if (!cur || e.at > cur.at || (e.at === cur.at && cur.status === null)) {
      lastByKey.set(key, { at: e.at, status: e.status });
    }
  }

  const row = (kind: ReportKind, id: string, key: string, name: string, description: string): LibraryReport => ({
    key,
    kind,
    id,
    name,
    description,
    schedulable: kind !== "security",
    starred: isFavorite(favorites, kind, id),
    nextSendAt: nextByKey.get(key) ?? null,
    lastRun: lastByKey.get(key) ?? null,
    activeSchedules: activeByKey.get(key) ?? 0,
  });

  const rows: LibraryReport[] = [
    ...input.builtIn.map((r) => row("builtIn", r.id, reportKey("system", r.id), r.name, r.description)),
    ...(input.loginAudit
      ? [row("security", input.loginAudit.id, LOGIN_AUDIT_KEY, input.loginAudit.name, input.loginAudit.description)]
      : []),
    ...input.saved.map((r) =>
      row("saved", String(r.id), reportKey("custom", r.id), r.name, r.description?.trim() ?? ""),
    ),
  ];

  return rows.sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    if (a.nextSendAt !== b.nextSendAt) {
      if (!a.nextSendAt) return 1;
      if (!b.nextSendAt) return -1;
      return a.nextSendAt.localeCompare(b.nextSendAt);
    }
    return a.name.localeCompare(b.name);
  });
}

export const ALL = "all";

export interface LibraryFilters {
  search: string;
  /** Empty = every kind. */
  kinds: ReportKind[];
  schedule: typeof ALL | "scheduled" | "notScheduled";
  starred: typeof ALL | "starred";
}

export const EMPTY_LIBRARY_FILTERS: LibraryFilters = { search: "", kinds: [], schedule: ALL, starred: ALL };

export function countLibraryFilters(f: LibraryFilters): number {
  return (
    (f.search.trim() ? 1 : 0) + (f.kinds.length > 0 ? 1 : 0) + (f.schedule !== ALL ? 1 : 0) + (f.starred !== ALL ? 1 : 0)
  );
}

export function filterLibrary(rows: readonly LibraryReport[], f: LibraryFilters): LibraryReport[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !r.name.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q)) return false;
    if (f.kinds.length > 0 && !f.kinds.includes(r.kind)) return false;
    if (f.schedule === "scheduled" && r.activeSchedules === 0) return false;
    if (f.schedule === "notScheduled" && r.activeSchedules > 0) return false;
    if (f.starred === "starred" && !r.starred) return false;
    return true;
  });
}

export interface ReportKpis {
  activeSchedules: number;
  pausedSchedules: number;
  byFrequency: Partial<Record<ReportScheduleFrequency, number>>;
  sentThisMonth: number;
  /** Distinct recipients of the schedules that sent this month. */
  sentToPeople: number;
  failedThisMonth: number;
  lastFailure: { reportName: string; at: string } | null;
  nextSend: { reportName: string; at: string } | null;
}

/** The counts above the library, for the month containing `now`. */
export function computeKpis(
  schedules: readonly ReportCalendarSchedule[],
  events: readonly ReportCalendarEvent[],
  now: Date,
): ReportKpis {
  const byId = new Map(schedules.map((s) => [s.id, s]));
  const byFrequency: Partial<Record<ReportScheduleFrequency, number>> = {};
  let activeSchedules = 0;
  for (const s of schedules) {
    if (!s.active) continue;
    activeSchedules++;
    byFrequency[s.frequency] = (byFrequency[s.frequency] ?? 0) + 1;
  }

  const nowIso = now.toISOString();
  const people = new Set<string>();
  let sentThisMonth = 0;
  let failedThisMonth = 0;
  let lastFailure: ReportKpis["lastFailure"] = null;
  let nextSend: ReportKpis["nextSend"] = null;

  for (const e of events) {
    const schedule = byId.get(e.scheduleId);
    if (!schedule) continue;
    const name = schedule.reportName;
    if (e.status === "upcoming") {
      if (e.at >= nowIso && (!nextSend || e.at < nextSend.at)) nextSend = { reportName: name, at: e.at };
      continue;
    }
    if (!isSameMonth(new Date(e.at), now)) continue;
    if (e.status === "failure") {
      failedThisMonth++;
      if (!lastFailure || e.at > lastFailure.at) lastFailure = { reportName: name, at: e.at };
    } else {
      sentThisMonth++;
      schedule.recipients.forEach((r) => people.add(r.toLowerCase()));
    }
  }

  // Events only cover the fetched window; fall back to the stored next run.
  if (!nextSend) {
    for (const s of schedules) {
      if (s.active && s.nextRunAt && s.nextRunAt >= nowIso && (!nextSend || s.nextRunAt < nextSend.at)) {
        nextSend = { reportName: s.reportName, at: s.nextRunAt };
      }
    }
  }

  return {
    activeSchedules,
    pausedSchedules: schedules.length - activeSchedules,
    byFrequency,
    sentThisMonth,
    sentToPeople: people.size,
    failedThisMonth,
    lastFailure,
    nextSend,
  };
}

/** Builds the CSV for Download CSV: a header row of labels, then one line per row. */
export function toCsv(columns: ReadonlyArray<{ key: string; label: string }>, rows: ReadonlyArray<Record<string, unknown>>): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const text = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Quote when needed; neutralise spreadsheet formulas.
    const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.map((c) => cell(c.label)).join(","), ...rows.map((r) => columns.map((c) => cell(r[c.key])).join(","))].join("\r\n");
}

/** "Created At" from "createdAt", for saved reports, whose rows carry no column labels. */
export function labelFromFieldKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
