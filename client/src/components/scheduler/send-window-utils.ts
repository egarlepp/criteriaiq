/**
 * Send Email Window (Configuration › Scheduler): quiet hours and the max
 * emails per hour for automated email. Shapes match
 * GET/PUT /api/scheduler/send-window.
 */

export type QuietHoursScope = "digests" | "all";

export interface SendWindowSettings {
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
  quietHoursScope: QuietHoursScope;
  /** null = the server's timezone. */
  timezone: string | null;
  /** 0 = no limit. */
  maxEmailsPerHour: number;
}

export interface SendWindowState extends SendWindowSettings {
  sentThisHour: number;
  serverTimezone: string;
}

export const SEND_WINDOW_KEY = ["/api/scheduler/send-window"] as const;

export const MAX_EMAILS_PER_HOUR_LIMIT = 100_000;

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Changed fields only, for the PUT body. Empty when nothing changed. */
export function sendWindowPatch(saved: SendWindowSettings, draft: SendWindowSettings): Partial<SendWindowSettings> {
  const patch: Partial<SendWindowSettings> = {};
  (Object.keys(draft) as (keyof SendWindowSettings)[]).forEach((key) => {
    if (draft[key] !== saved[key]) (patch as Record<string, unknown>)[key] = draft[key];
  });
  return patch;
}

/** A whole number from 0 to the limit, or null when the input isn't one. */
export function parseMaxEmailsPerHour(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n <= MAX_EMAILS_PER_HOUR_LIMIT ? n : null;
}
