// Send Email Window — Configuration › Scheduler.
//
// Two app-wide limits on automated email, edited on the Scheduler page:
//
//   Quiet hours        A daily clock window (whole hours, in one timezone)
//                      when automated email is held. Off by default. Scope
//                      'digests' holds scheduled digests only; 'all' also
//                      holds rule-triggered emails. A digest schedule can
//                      set its own hours instead (useGlobalQuietHours=false).
//   Max emails/hour    A shared hourly budget for automated email (digests
//                      and rule-triggered sends). 0 = no limit. Emails over
//                      the limit are skipped, not queued: digest items stay
//                      pending for the next run, rule sends are logged as
//                      skipped.
//
// Sign-in emails (template category "Authentication": welcome, password
// reset, account approved) are never held by either limit. Scheduled report
// delivery and the "Scheduled job failed" alert are not covered: they are
// addressed to admins on purpose and sent outside this path.
import { storage } from "../storage";
import { isValidTimezone, serverTimezone } from "../services/jobs/scheduler";

export type QuietHoursScope = "digests" | "all";

export interface SendWindowSettings {
  quietHoursEnabled: boolean;
  /** Hour of day, 0-23. Quiet from the start of this hour... */
  quietHoursStart: number;
  /** ...until the start of this hour. Equal to start = never quiet. */
  quietHoursEnd: number;
  quietHoursScope: QuietHoursScope;
  /** null = the server's timezone. */
  timezone: string | null;
  /** 0 = no limit. */
  maxEmailsPerHour: number;
}

export const SEND_WINDOW_DEFAULTS: SendWindowSettings = {
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  quietHoursScope: "digests",
  timezone: null,
  maxEmailsPerHour: 500,
};

/** Template categories never held by quiet hours or the hourly limit. */
const EXEMPT_CATEGORIES = new Set(["authentication"]);

export function isExemptEmailCategory(category: string | null | undefined): boolean {
  return !!category && EXEMPT_CATEGORIES.has(category.trim().toLowerCase());
}

/** Local hour (0-23) of `now` in `timezone`; falls back to the server zone. */
export function localHour(now: Date, timezone: string | null): number {
  const tz = timezone && isValidTimezone(timezone) ? timezone : serverTimezone();
  const hour = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour) % 24;
}

/** True when `now` falls inside [start, end) local hours; wraps past midnight. */
export function isWithinQuietHours(now: Date, start: number, end: number, timezone: string | null): boolean {
  if (start === end) return false;
  const hour = localHour(now, timezone);
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function toHour(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : fallback;
}

type ConfigRow = Awaited<ReturnType<typeof storage.getEmailAutomationConfig>>;

export function settingsFromRow(row: ConfigRow): SendWindowSettings {
  if (!row) return { ...SEND_WINDOW_DEFAULTS };
  const max = row.maxEmailsPerHour;
  return {
    quietHoursEnabled: row.quietHoursEnabled ?? false,
    quietHoursStart: toHour(row.defaultQuietHoursStart, SEND_WINDOW_DEFAULTS.quietHoursStart),
    quietHoursEnd: toHour(row.defaultQuietHoursEnd, SEND_WINDOW_DEFAULTS.quietHoursEnd),
    quietHoursScope: row.quietHoursScope === "all" ? "all" : "digests",
    timezone: row.sendWindowTimezone || null,
    maxEmailsPerHour: typeof max === "number" && max >= 0 ? max : SEND_WINDOW_DEFAULTS.maxEmailsPerHour,
  };
}

// A short cache: rule sends check the window on every email.
const CACHE_MS = 30_000;
let cached: { at: number; settings: SendWindowSettings } | null = null;

export async function getSendWindowSettings(): Promise<SendWindowSettings> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.settings;
  const settings = settingsFromRow(await storage.getEmailAutomationConfig());
  cached = { at: Date.now(), settings };
  return settings;
}

export function clearSendWindowCache(): void {
  cached = null;
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export interface QuietHoursDecision {
  held: boolean;
  reason?: string;
}

/**
 * Should a scheduled digest wait? Uses the schedule's own hours when the
 * schedule turned "Use global quiet hours" off and set both hours;
 * otherwise the global window when it is on.
 */
export function digestQuietHoursDecision(
  settings: SendWindowSettings,
  actionConfig: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): QuietHoursDecision {
  const config = actionConfig ?? {};
  const ownHours = config.useGlobalQuietHours === false;
  let start: number | null = null;
  let end: number | null = null;
  if (ownHours) {
    const s = toHour(config.quietHoursStart, -1);
    const e = toHour(config.quietHoursEnd, -1);
    if (s >= 0 && e >= 0) {
      start = s;
      end = e;
    }
  } else if (settings.quietHoursEnabled) {
    start = settings.quietHoursStart;
    end = settings.quietHoursEnd;
  }
  if (start === null || end === null || !isWithinQuietHours(now, start, end, settings.timezone)) {
    return { held: false };
  }
  const tz = settings.timezone || serverTimezone();
  const source = ownHours ? "this schedule's quiet hours" : "quiet hours";
  return { held: true, reason: `Skipped: ${source} (${formatHour(start)}-${formatHour(end)} ${tz})` };
}

/** Should a rule-triggered email wait? Only when quiet hours cover all automated email. */
export function ruleEmailQuietHoursDecision(
  settings: SendWindowSettings,
  category: string | null | undefined,
  now: Date = new Date(),
): QuietHoursDecision {
  if (!settings.quietHoursEnabled || settings.quietHoursScope !== "all") return { held: false };
  if (isExemptEmailCategory(category)) return { held: false };
  if (!isWithinQuietHours(now, settings.quietHoursStart, settings.quietHoursEnd, settings.timezone)) {
    return { held: false };
  }
  const tz = settings.timezone || serverTimezone();
  return {
    held: true,
    reason: `Skipped: quiet hours (${formatHour(settings.quietHoursStart)}-${formatHour(settings.quietHoursEnd)} ${tz})`,
  };
}

export const RATE_LIMIT_REASON = "Skipped: the hourly email limit was reached";

/**
 * Take one slot of this hour's automated-email budget. True = send. Sign-in
 * emails are always allowed and not counted. A database error lets the
 * email through: a broken counter must not stop email.
 */
export async function reserveEmailSendSlot(category: string | null | undefined): Promise<boolean> {
  if (isExemptEmailCategory(category)) return true;
  try {
    const settings = await getSendWindowSettings();
    return await storage.reserveHourlyEmailSlot(settings.maxEmailsPerHour);
  } catch (err) {
    console.warn("[send-window] Hourly email limit check failed; sending anyway:", err);
    return true;
  }
}
