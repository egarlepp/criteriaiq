// Daily Outlook calendar sync for work schedules (docs/features/
// working-calendar.md), and, when the admin turned it on, the MAP due dates
// written to each person's Outlook (services/outlook-map-due-dates.ts).
// For everyone who linked Outlook on Profile Settings › Integrations: their
// all-day "Out of office" events from a week back to SYNC_AHEAD_DAYS ahead
// become time off, and, when the admin turned on
// "Read working days from Outlook", their Outlook working days become their
// work week unless they set one by hand. Also runs for one person right
// after they link Outlook.
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { getActiveOutlookSigninConfig, type OutlookSigninConfig } from "../outlook/config";
import { getOutlookAccessToken } from "../outlook/user-connection";
import { listOutOfOfficeDays, readOutlookWorkDays } from "../outlook/calendar";
import { MicrosoftAuthError, type FetchFn } from "../outlook/oauth";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import { syncOutlookMapDueDatesForUser, type DueSyncResult } from "./outlook-map-due-dates";
import { toIsoDate } from "@shared/working-calendar";

export const OUTLOOK_SCHEDULE_SYNC_JOB_KEY = "outlook_schedule_sync";
/** Days back and ahead the sync reads. */
export const SYNC_BACK_DAYS = 7;
export const SYNC_AHEAD_DAYS = 180;

const DAY_MS = 86_400_000;

export interface SyncDeps {
  now?: () => Date;
  fetchFn?: FetchFn;
  config?: () => Promise<OutlookSigninConfig | null>;
}

export type UserSyncResult = "synced" | "skipped" | "reconnect" | "failed";

/** One person's sync. Never throws: a failure for one person doesn't stop the rest. */
export async function syncOutlookScheduleForUser(userId: string, deps: SyncDeps = {}): Promise<UserSyncResult> {
  try {
    const config = await (deps.config ?? getActiveOutlookSigninConfig)();
    if (!config) return "skipped";
    const user = await storage.getUser(userId);
    if (!user || user.isActive === false || isExternalRole(user.role)) return "skipped";

    const token = await getOutlookAccessToken(userId, { config: async () => config, fetchFn: deps.fetchFn });
    if (!token) return "skipped";

    const now = (deps.now ?? (() => new Date()))();
    const from = toIsoDate(new Date(now.getTime() - SYNC_BACK_DAYS * DAY_MS));
    const to = toIsoDate(new Date(now.getTime() + SYNC_AHEAD_DAYS * DAY_MS));
    const away = await listOutOfOfficeDays(token, from, to, deps.fetchFn);
    await storage.syncOutlookTimeOff(userId, away, from, to);

    if (config.readWorkingHours) {
      const workDays = await readOutlookWorkDays(token, deps.fetchFn);
      if (workDays) await storage.setOutlookWorkDays(userId, workDays);
    }
    return "synced";
  } catch (error) {
    if (error instanceof MicrosoftAuthError && error.revoked) return "reconnect";
    console.warn("[outlook-sync] sync failed for a user:", error instanceof Error ? error.message : error);
    return "failed";
  }
}

export async function runOutlookScheduleSync(deps: SyncDeps = {}): Promise<JobOutcome> {
  const config = await (deps.config ?? getActiveOutlookSigninConfig)();
  if (!config) return { status: "skipped" };
  const userIds = await storage.listOutlookConnectedUserIds();
  if (userIds.length === 0) return { status: "skipped" };

  const counts: Record<UserSyncResult, number> = { synced: 0, skipped: 0, reconnect: 0, failed: 0 };
  const due: Record<DueSyncResult, number> = { synced: 0, skipped: 0, reconnect: 0, no_write: 0, failed: 0 };
  for (const userId of userIds) {
    counts[await syncOutlookScheduleForUser(userId, { ...deps, config: async () => config })]++;
    if (config.writeMapDueDates) due[await syncOutlookMapDueDatesForUser(userId, { ...deps, config: async () => config })]++;
  }
  if (counts.synced === 0 && counts.failed === 0 && counts.reconnect === 0) return { status: "skipped" };
  const parts = [`${counts.synced} synced`];
  if (counts.reconnect) parts.push(`${counts.reconnect} need to reconnect`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  if (config.writeMapDueDates) {
    parts.push(`MAP due dates written for ${due.synced}`);
    if (due.no_write) parts.push(`${due.no_write} must reconnect to allow due dates`);
    if (due.failed) parts.push(`due dates failed for ${due.failed}`);
  }
  if (counts.synced === 0 && counts.failed > 0) throw new Error(`Outlook sync failed for every person (${parts.join(", ")})`);
  return { status: "success", itemsProcessed: counts.synced, message: parts.join(", ") };
}

export function registerOutlookScheduleSyncJob(): void {
  scheduleJob({
    key: OUTLOOK_SCHEDULE_SYNC_JOB_KEY,
    category: "system",
    label: "Outlook calendar sync",
    dailyAt: { hour: 5, minute: 30 },
    cadenceEditable: true,
    singleInstance: true,
    task: () => runOutlookScheduleSync(),
  });
}
