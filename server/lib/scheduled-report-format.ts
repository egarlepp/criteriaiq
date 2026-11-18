// Pure helpers for scheduled report delivery (server/email/scheduled-report-email.ts):
// the date window a schedule asks for, who may receive it, and the CSV and
// HTML table that go into the email. No database access here, so all of it
// is unit-tested in server/lib/__tests__/scheduled-report-format.test.ts.
import { isExternalRole } from "./internal-access";

const DAY_MS = 86_400_000;

/** Rows in the email body; the attached CSV carries every row. */
export const REPORT_EMAIL_PREVIEW_ROWS = 25;

/** Most rows one delivery reads (and attaches). */
export const REPORT_DELIVERY_MAX_ROWS = 1000;

// ─── Date window ────────────────────────────────────────────────────────────

export interface ReportDateBounds {
  /** Inclusive lower bound. */
  from?: Date;
  /** Inclusive upper bound. */
  to?: Date;
}

/**
 * What the schedule's date settings mean for projects:
 * - calendar: projects active at any time in [start, end] (started on or
 *   before `end`, and not ended before `start`; no end date counts as open).
 * - project: bounds on the project's own start and end dates; a side with
 *   "Project Start/End Date" has no bound.
 */
export type ReportDateWindow =
  | { mode: "calendar"; start: Date; end: Date }
  | { mode: "project"; start: ReportDateBounds; end: ReportDateBounds };

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d: Date): Date {
  return new Date(startOfUtcDay(d).getTime() + DAY_MS - 1);
}

/** A YYYY-MM-DD (or ISO) date from the schedule; undefined when missing or invalid. */
function parseConfigDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function monthsAgo(now: Date, months: number): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

/** Start of a relative range ending now, or undefined for an unknown key. */
function relativeStart(key: string, now: Date): Date | undefined {
  switch (key) {
    case "last_7_days":
      return new Date(now.getTime() - 7 * DAY_MS);
    case "last_30_days":
      return new Date(now.getTime() - 30 * DAY_MS);
    case "last_quarter":
      return monthsAgo(now, 3);
    case "year_to_date":
      return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    default:
      return undefined;
  }
}

/**
 * The window from Schedule Report's settings (action_config). Throws with a
 * message fit for the run log when a custom date the mode needs is missing.
 */
export function resolveReportDateWindow(config: Record<string, unknown>, now: Date): ReportDateWindow {
  if (config.dateRangeMode === "project") {
    const startRef = typeof config.projectStartDateRef === "string" ? config.projectStartDateRef : "project_start";
    const endRef = typeof config.projectEndDateRef === "string" ? config.projectEndDateRef : "project_end";
    const start: ReportDateBounds = {};
    const end: ReportDateBounds = {};

    if (startRef === "custom_start") {
      const from = parseConfigDate(config.customStartDate);
      if (!from) throw new Error("The schedule has no custom start date");
      start.from = startOfUtcDay(from);
    } else if (startRef.startsWith("start_")) {
      const from = relativeStart(startRef.slice("start_".length), now);
      if (from) {
        start.from = from;
        start.to = now;
      }
    }

    if (endRef === "custom_end") {
      const to = parseConfigDate(config.customEndDate);
      if (!to) throw new Error("The schedule has no custom end date");
      end.to = endOfUtcDay(to);
    } else if (endRef.startsWith("end_")) {
      const from = relativeStart(endRef.slice("end_".length), now);
      if (from) {
        end.from = from;
        end.to = now;
      }
    }
    return { mode: "project", start, end };
  }

  const range = typeof config.dateRange === "string" ? config.dateRange : "last_30_days";
  if (range === "custom") {
    const from = parseConfigDate(config.customStartDate);
    const to = parseConfigDate(config.customEndDate);
    if (!from || !to) throw new Error("The schedule's custom date range is incomplete");
    if (from > to) throw new Error("The schedule's custom start date is after its end date");
    return { mode: "calendar", start: startOfUtcDay(from), end: endOfUtcDay(to) };
  }
  return { mode: "calendar", start: relativeStart(range, now) ?? relativeStart("last_30_days", now)!, end: now };
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function describeBounds(label: string, b: ReportDateBounds): string | null {
  if (b.from && b.to) return `${label} ${isoDay(b.from)} to ${isoDay(b.to)}`;
  if (b.from) return `${label} on or after ${isoDay(b.from)}`;
  if (b.to) return `${label} on or before ${isoDay(b.to)}`;
  return null;
}

/** One line for the email, e.g. "Projects active 2026-10-01 to 2026-10-31". */
export function describeReportDateWindow(window: ReportDateWindow): string {
  if (window.mode === "calendar") {
    return `Projects active ${isoDay(window.start)} to ${isoDay(window.end)}`;
  }
  const parts = [describeBounds("start date", window.start), describeBounds("end date", window.end)].filter(Boolean);
  return parts.length ? `Projects with ${parts.join(" and ")}` : "All projects";
}

// ─── Recipients ─────────────────────────────────────────────────────────────

export interface RecipientUser {
  email: string | null;
  role: string | null;
  isActive: boolean | null;
  isApproved: boolean | null;
}

export type SkippedReason = "not_a_user" | "inactive" | "outside_user";

export interface RecipientCheck {
  allowed: string[];
  skipped: Array<{ email: string; reason: SkippedReason }>;
}

/**
 * Reports read every project with no account scoping (the same reason
 * running one is staff only), so they only go to active, approved staff
 * accounts. Anyone else on the list is skipped and named in the run log.
 */
export function checkReportRecipients(emails: readonly string[], users: readonly RecipientUser[]): RecipientCheck {
  const byEmail = new Map<string, RecipientUser>();
  for (const u of users) if (u.email) byEmail.set(u.email.trim().toLowerCase(), u);
  const out: RecipientCheck = { allowed: [], skipped: [] };
  const seen = new Set<string>();
  for (const raw of emails) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    const user = byEmail.get(key);
    if (!user) out.skipped.push({ email, reason: "not_a_user" });
    else if (user.isActive === false || user.isApproved === false) out.skipped.push({ email, reason: "inactive" });
    else if (isExternalRole(user.role)) out.skipped.push({ email, reason: "outside_user" });
    else out.allowed.push(email);
  }
  return out;
}

const SKIPPED_LABEL: Record<SkippedReason, string> = {
  not_a_user: "no CriteriaIQ account",
  inactive: "account inactive or not approved",
  outside_user: "outside user (Customer, Guest or Partner)",
};

export function describeSkipped(skipped: RecipientCheck["skipped"]): string {
  return skipped.map((s) => `${s.email} (${SKIPPED_LABEL[s.reason]})`).join(", ");
}

// ─── Table output ───────────────────────────────────────────────────────────

export interface ReportColumn {
  key: string;
  label: string;
  type?: string;
}

/** A cell as plain text: dates as YYYY-MM-DD, arrays joined, empty for null. */
export function formatReportValue(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : isoDay(value);
  if (type === "date" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : isoDay(d);
  }
  if (Array.isArray(value)) return value.map((v) => formatReportValue(v)).filter(Boolean).join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * RFC 4180 CSV with a header row and CRLF line ends. Text cells that a
 * spreadsheet would run as a formula (=, +, -, @, tab, CR) get a leading
 * apostrophe; number cells are left alone so negatives stay numbers.
 */
export function buildReportCsv(columns: readonly ReportColumn[], rows: ReadonlyArray<Record<string, unknown>>): string {
  const cell = (raw: unknown, type?: string): string => {
    let text = formatReportValue(raw, type);
    if (typeof raw !== "number" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.label)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key], c.type)).join(","));
  return `${lines.join("\r\n")}\r\n`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** An inline-styled HTML table (email clients ignore stylesheets). */
export function buildReportHtmlTable(columns: readonly ReportColumn[], rows: ReadonlyArray<Record<string, unknown>>): string {
  const th = 'style="text-align:left;padding:6px 8px;border-bottom:2px solid #dee2e6;background:#f8f9fa;font-size:12px;white-space:nowrap;"';
  const td = 'style="padding:6px 8px;border-bottom:1px solid #dee2e6;font-size:12px;vertical-align:top;"';
  const head = columns.map((c) => `<th ${th}>${escapeHtml(c.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((c) => `<td ${td}>${escapeHtml(formatReportValue(row[c.key], c.type))}</td>`).join("")}</tr>`)
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 16px 0;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** A safe attachment file name, e.g. "project-status-report-2026-10-31.csv". */
export function reportCsvFilename(reportName: string, now: Date): string {
  const slug = reportName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "report"}-${isoDay(now)}.csv`;
}
