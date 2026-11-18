// MAP item statuses. The MAP screens (client/src/types/map.ts MapStatus) and
// the insert schemas store a finished phase, step or task as "complete";
// rows written by older code (CSV import, earlier demo seeds) can still say
// "completed", so both count as done and "completed" is saved as "complete".
import { z } from "zod";

export const MAP_COMPLETE_STATUS = "complete";

/** Every status the MAP screens offer for a phase, step or task. */
export const MAP_ITEM_STATUSES = [
  "not_started",
  "in_progress",
  "blocked",
  "complete",
  "deferred",
  "stalled",
  "at_risk",
  "cancelled",
] as const;

export type MapItemStatus = (typeof MAP_ITEM_STATUSES)[number];

/** Whether a MAP phase, step or task is finished. */
export function isMapItemComplete(status: string | null | undefined): boolean {
  return status === MAP_COMPLETE_STATUS || status === "completed";
}

/** A status from a request or a CSV row, with the old "completed" spelling saved as "complete". */
export const mapItemStatusSchema = z.preprocess(
  (value) => (value === "completed" ? MAP_COMPLETE_STATUS : value),
  z.enum(MAP_ITEM_STATUSES),
);

/**
 * Fields a phase, step or task update may change (PUT /api/map/phases|steps|tasks/:id).
 * Shared by the three routes so they accept the same fields; the drawer's
 * "Additional internal" assignment was dropped by all three before this.
 */
export const mapItemUpdateSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(10_000).nullable().optional(),
  status: mapItemStatusSchema.optional(),
  orderIndex: z.number().int().min(0).optional(),
  teamOwned: z.string().max(100).nullable().optional(),
  assignedToCustomerUserId: z.string().min(1).nullable().optional(),
  assignedToUserId: z.string().min(1).nullable().optional(),
  additionalInternalUserId: z.string().min(1).nullable().optional(),
  assignedToTeamId: z.number().int().positive().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  completedDate: z.string().datetime().nullable().optional(),
});

export type MapItemUpdate = z.infer<typeof mapItemUpdateSchema>;

/** A phase also carries its value journey stage (journey_stages.id, or null). */
export const mapPhaseUpdateSchema = mapItemUpdateSchema.extend({
  stageId: z.number().int().positive().nullable().optional(),
});

/** A status that ends an item: finished or cancelled. Both get an end date. */
export function isMapItemEnded(status: string | null | undefined): boolean {
  return isMapItemComplete(status) || status === "cancelled";
}

/**
 * Keeps the start and end dates in step with the status when the request only
 * changes the status. A request that sends the date itself is left alone.
 *
 * - End (completedDate): becoming Complete or Cancelled stamps today;
 *   reopening clears it.
 * - Start: leaving Not Started stamps today when the item has no start date
 *   yet, or only a planned one later than today, so the start shows when work
 *   actually began. An earlier start date is kept.
 */
export function withCompletionDate<T extends { status?: string; startDate?: string | null; completedDate?: string | null }>(
  current: { status: string | null | undefined; startDate?: Date | string | null },
  updates: T,
  now: Date = new Date(),
): T {
  if (updates.status === undefined) return updates;
  let out: T = updates;
  if (updates.completedDate === undefined) {
    const wasEnded = isMapItemEnded(current.status);
    const willEnd = isMapItemEnded(updates.status);
    if (willEnd && !wasEnded) out = { ...out, completedDate: now.toISOString() };
    else if (!willEnd && wasEnded) out = { ...out, completedDate: null };
  }
  const leavingNotStarted = (current.status ?? "not_started") === "not_started" && updates.status !== "not_started";
  if (leavingNotStarted && updates.startDate === undefined) {
    const start = current.startDate ? new Date(current.startDate) : null;
    if (!start || Number.isNaN(start.getTime()) || start.getTime() > now.getTime()) out = { ...out, startDate: now.toISOString() };
  }
  return out;
}
