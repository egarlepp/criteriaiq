// MAP due-soon reminders, counted in working days. See
// docs/features/working-calendar.md.
//
// A daily Scheduler job (map_due_soon) looks at every open MAP phase, step
// and task that has an owner and a due date. Once the item is within
// DUE_SOON_WORKING_DAYS working days of its due date on the owner's own
// calendar (weekends and their holidays don't count), the owner gets one
// bell notification (which the daily digest includes for people who turned
// it on), and map.<type>.due_soon goes out to subscribed webhooks. Each owner
// is told once per item and due date; moving the due date reminds again.
// Workflow Automation email rules aren't run for MAP events.
import { storage } from "../storage";
import { hasProjectAccess } from "../lib/project-access";
import { emitAutomationEvent } from "./automation-events";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import {
  fromIsoDate,
  subtractWorkingDays,
  toIsoDate,
  workingDaysBetween,
  type WorkingCalendar,
} from "@shared/working-calendar";
import type { InsertUserNotification } from "@shared/schema";
import type { MapDueItem } from "../storage/map";

export const MAP_DUE_SOON_JOB_KEY = "map_due_soon";
export const MAP_DUE_SOON_KIND = "map_item_due_soon";
/** Remind this many working days before the due date. */
export const DUE_SOON_WORKING_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Due dates further out than this can't be within the reminder window. */
const LOOKAHEAD_DAYS = 21;
/** How far back to look for reminders already sent. */
const SENT_LOOKBACK_DAYS = 60;

/**
 * Working days left before `dueIso`, when today is inside the reminder
 * window (from DUE_SOON_WORKING_DAYS working days before the due date up to
 * the due date itself); null otherwise. Pure.
 */
export function dueSoonDaysRemaining(todayIso: string, dueIso: string, cal: WorkingCalendar): number | null {
  if (dueIso < todayIso) return null;
  const remindFrom = subtractWorkingDays(dueIso, DUE_SOON_WORKING_DAYS, cal);
  if (todayIso < remindFrom) return null;
  return workingDaysBetween(todayIso, dueIso, cal);
}

/** One reminder per owner, item and due date. */
export function dueSoonKey(ownerId: string, itemType: string, itemId: number | string, dueIso: string): string {
  return `${ownerId}|${itemType}|${itemId}|${dueIso}`;
}

export async function runMapDueSoon(now = new Date()): Promise<JobOutcome> {
  const todayIso = toIsoDate(now);
  const from = fromIsoDate(todayIso);
  const to = new Date(from.getTime() + LOOKAHEAD_DAYS * DAY_MS);
  const items = await storage.listOpenMapItemsDueBetween(from, to);
  if (items.length === 0) return { status: "skipped" };

  const ownerIds = Array.from(new Set(items.map((item) => item.ownerId)));
  const calendars = await storage.getWorkingCalendarsForUsers(ownerIds, todayIso, toIsoDate(to));
  const sent = new Set(
    (await storage.listNotificationsOfKindSince(MAP_DUE_SOON_KIND, new Date(now.getTime() - SENT_LOOKBACK_DAYS * DAY_MS))).map(
      (row) => dueSoonKey(row.userId, row.params.itemType ?? "", row.params.itemId ?? "", row.params.dueDate ?? ""),
    ),
  );

  const rows: InsertUserNotification[] = [];
  const events: Array<{ item: MapDueItem; dueIso: string; daysRemaining: number }> = [];
  const users = new Map<string, Awaited<ReturnType<typeof storage.getUser>>>();
  for (const item of items) {
    const dueIso = toIsoDate(item.dueDate);
    const cal: WorkingCalendar = calendars.get(item.ownerId) ?? { holidays: new Set<string>() };
    const daysRemaining = dueSoonDaysRemaining(todayIso, dueIso, cal);
    if (daysRemaining === null) continue;
    const key = dueSoonKey(item.ownerId, item.itemType, item.id, dueIso);
    if (sent.has(key)) continue;
    sent.add(key);

    if (!users.has(item.ownerId)) users.set(item.ownerId, await storage.getUser(item.ownerId));
    const user = users.get(item.ownerId);
    if (!user || user.isActive === false || user.isApproved === false) continue;
    if (!(await hasProjectAccess(user.id, user.role, user.email, item.projectId))) continue;

    rows.push({
      userId: user.id,
      kind: MAP_DUE_SOON_KIND,
      projectId: item.projectId,
      params: {
        projectName: item.projectName,
        customerName: item.customerName,
        itemType: item.itemType,
        itemId: String(item.id),
        itemName: item.name,
        dueDate: dueIso,
        daysRemaining: String(daysRemaining),
      },
      linkPath: `/project/${item.projectId}?tab=map`,
      actorUserId: null,
    });
    events.push({ item, dueIso, daysRemaining });
  }

  if (rows.length === 0) return { status: "skipped" };
  await storage.createUserNotifications(rows);
  for (const { item, dueIso, daysRemaining } of events) {
    emitAutomationEvent({
      triggerKey: `map.${item.itemType}.due_soon`,
      projectId: item.projectId,
      metadata: {
        [`${item.itemType}Id`]: String(item.id),
        [`${item.itemType}Name`]: item.name,
        projectId: String(item.projectId),
        dueDate: dueIso,
        daysRemaining,
        assignedTo: item.ownerId,
      },
    });
  }
  return { status: "success", itemsProcessed: rows.length, message: `${rows.length} reminders sent` };
}

export function registerMapDueSoonJob(): void {
  scheduleJob({
    key: MAP_DUE_SOON_JOB_KEY,
    category: "system",
    label: "MAP due-soon reminders",
    dailyAt: { hour: 7, minute: 0 },
    cadenceEditable: true,
    singleInstance: true,
    task: () => runMapDueSoon(),
  });
}
