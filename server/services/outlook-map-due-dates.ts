// Outlook write-back of MAP due dates (docs/features/working-calendar.md).
// When the admin turns on "Add MAP due dates to Outlook", each person who
// linked Outlook gets an all-day event shown as Free on the due date of every
// open MAP phase, step and task they own. The event moves when the due date
// moves and is removed when the item is done, reassigned or deleted. Runs in
// the daily Outlook sync, and a few seconds after a MAP item changes in the
// MAP drawer. Only events CriteriaIQ created (outlook_map_events) are ever
// changed or removed.
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { getPublicAppUrl } from "../lib/app-config";
import { getActiveOutlookSigninConfig, type OutlookSigninConfig } from "../outlook/config";
import { getOutlookAccessToken } from "../outlook/user-connection";
import { MicrosoftAuthError, type FetchFn } from "../outlook/oauth";
import {
  createDueDateEvent,
  deleteDueDateEvent,
  OutlookWriteForbiddenError,
  updateDueDateEvent,
  type DueDateEvent,
} from "../outlook/calendar-write";
import { toIsoDate } from "@shared/working-calendar";

/** Due dates this far back (still open, so overdue) and ahead get an event. */
export const DUE_EVENT_BACK_DAYS = 30;
export const DUE_EVENT_AHEAD_DAYS = 365;
/** Wait after a MAP change before writing, so a burst of edits is one sync. */
export const DUE_SYNC_DELAY_MS = 10_000;

const DAY_MS = 86_400_000;

// The event subject's first word in the person's language (Profile ›
// Preferences); the rest is the item and project name.
const DUE_WORD: Record<string, string> = {
  "en-US": "Due",
  "de-DE": "Fällig",
  "es-ES": "Vence",
  "fr-FR": "Échéance",
  "it-IT": "Scadenza",
  "pt-BR": "Prazo",
};

export function dueEventSubject(itemName: string, projectName: string | null, locale: string | null | undefined): string {
  const word = DUE_WORD[locale ?? ""] ?? DUE_WORD["en-US"];
  return projectName ? `${word}: ${itemName} (${projectName})` : `${word}: ${itemName}`;
}

export interface DueSyncDeps {
  now?: () => Date;
  fetchFn?: FetchFn;
  config?: () => Promise<OutlookSigninConfig | null>;
}

/**
 * synced = events match the MAP. no_write = the person's Outlook link was
 * made before write-back was on, so it can't write: they must reconnect.
 */
export type DueSyncResult = "synced" | "skipped" | "reconnect" | "no_write" | "failed";

function itemKey(itemType: string, itemId: number): string {
  return `${itemType}:${itemId}`;
}

/** One person's due-date events brought in line with the MAP. Never throws. */
export async function syncOutlookMapDueDatesForUser(userId: string, deps: DueSyncDeps = {}): Promise<DueSyncResult> {
  try {
    const config = await (deps.config ?? getActiveOutlookSigninConfig)();
    if (!config?.writeMapDueDates) return "skipped";
    const user = await storage.getUser(userId);
    if (!user || user.isActive === false || isExternalRole(user.role)) return "skipped";
    const token = await getOutlookAccessToken(userId, { config: async () => config, fetchFn: deps.fetchFn });
    if (!token) return "skipped";

    const now = (deps.now ?? (() => new Date()))();
    const from = new Date(now.getTime() - DUE_EVENT_BACK_DAYS * DAY_MS);
    const to = new Date(now.getTime() + DUE_EVENT_AHEAD_DAYS * DAY_MS);
    const [items, existing] = await Promise.all([
      storage.listOpenMapItemsDueBetween(from, to, [userId]),
      storage.listOutlookMapEvents(userId),
    ]);
    const byKey = new Map(existing.map((row) => [itemKey(row.itemType, row.itemId), row]));
    const appUrl = getPublicAppUrl();
    const timeZone = user.timezone || "UTC";
    const wanted = new Set<string>();

    for (const item of items) {
      const key = itemKey(item.itemType, item.id);
      wanted.add(key);
      const event: DueDateEvent = {
        subject: dueEventSubject(item.name, item.projectName ?? item.customerName, user.preferredLocale),
        dueDate: toIsoDate(item.dueDate),
        link: `${appUrl}/project/${item.projectId}?tab=map`,
        timeZone,
      };
      const row = byKey.get(key);
      if (row && row.dueDate === event.dueDate && row.subject === event.subject) continue;
      let graphEventId = row?.graphEventId;
      if (!graphEventId || !(await updateDueDateEvent(token, graphEventId, event, deps.fetchFn))) {
        // New item, or the person deleted our event in Outlook: add it (again).
        graphEventId = await createDueDateEvent(token, event, deps.fetchFn);
      }
      await storage.saveOutlookMapEvent({
        userId,
        itemType: item.itemType,
        itemId: item.id,
        projectId: item.projectId,
        graphEventId,
        dueDate: event.dueDate,
        subject: event.subject,
      });
    }

    for (const row of existing) {
      if (wanted.has(itemKey(row.itemType, row.itemId))) continue;
      await deleteDueDateEvent(token, row.graphEventId, deps.fetchFn);
      await storage.deleteOutlookMapEvent(row.id);
    }
    return "synced";
  } catch (error) {
    if (error instanceof OutlookWriteForbiddenError) return "no_write";
    if (error instanceof MicrosoftAuthError && error.revoked) return "reconnect";
    console.warn("[outlook-due-dates] sync failed for a user:", error instanceof Error ? error.message : error);
    return "failed";
  }
}

/**
 * Removes every due-date event CriteriaIQ added to one person's Outlook,
 * then forgets them. Events it can't reach (no token, refused) stay in
 * Outlook. Never throws.
 */
export async function removeOutlookMapDueDatesForUser(userId: string, deps: Pick<DueSyncDeps, "fetchFn"> = {}): Promise<number> {
  let removed = 0;
  try {
    const rows = await storage.listOutlookMapEvents(userId);
    if (rows.length === 0) return 0;
    // The config may already be switched off, so ask for the saved one.
    const { getOutlookSigninConfig } = await import("../outlook/config");
    const config = await getOutlookSigninConfig();
    const token = config ? await getOutlookAccessToken(userId, { config: async () => config, fetchFn: deps.fetchFn }) : null;
    if (token) {
      for (const row of rows) {
        await deleteDueDateEvent(token, row.graphEventId, deps.fetchFn);
        removed++;
      }
    }
  } catch (error) {
    console.warn("[outlook-due-dates] removal stopped for a user:", error instanceof Error ? error.message : error);
  }
  await storage.deleteOutlookMapEventRows(userId).catch((error: unknown) => {
    console.warn("[outlook-due-dates] could not forget events:", error instanceof Error ? error.message : error);
  });
  return removed;
}

/** Removes CriteriaIQ's due-date events from everyone's Outlook (switch turned off). */
export async function removeAllOutlookMapDueDates(deps: Pick<DueSyncDeps, "fetchFn"> = {}): Promise<void> {
  for (const userId of await storage.listOutlookMapEventUserIds()) {
    await removeOutlookMapDueDatesForUser(userId, deps);
  }
}

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Syncs these people's due-date events shortly (after a MAP item's due date,
 * owner or status changed). Does nothing while write-back is off.
 */
export function queueOutlookMapDueDateSync(userIds: ReadonlyArray<string | null | undefined>): void {
  for (const id of userIds) if (id) pending.add(id);
  if (pending.size === 0 || timer) return;
  timer = setTimeout(() => {
    timer = null;
    const ids = [...pending];
    pending.clear();
    void (async () => {
      const config = await getActiveOutlookSigninConfig().catch(() => null);
      if (!config?.writeMapDueDates) return;
      for (const id of ids) await syncOutlookMapDueDatesForUser(id, { config: async () => config });
    })();
  }, DUE_SYNC_DELAY_MS);
  timer.unref?.();
}

/** After MAP items were deleted: syncs everyone who had a due-date event in the project. */
export function queueOutlookMapDueDateSyncForProject(projectId: number): void {
  void storage
    .listOutlookMapEventUserIdsForProject(projectId)
    .then((ids) => queueOutlookMapDueDateSync(ids))
    .catch((error: unknown) => console.warn("[outlook-due-dates] could not queue a project sync:", error));
}

type MapItemOwners = { assignedToUserId?: string | null; assignedToCustomerUserId?: string | null };

/** The owners before and after a MAP item update, for queueOutlookMapDueDateSync. */
export function mapItemOwners(before: MapItemOwners, after: MapItemOwners): Array<string | null | undefined> {
  return [before.assignedToUserId, before.assignedToCustomerUserId, after.assignedToUserId, after.assignedToCustomerUserId];
}
