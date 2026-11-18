// Demo Mode event log (demo_mode_events, migration 134). Each switch,
// seed, reseed and wipe stores one row whose `details` column holds the
// event's facts as JSON (DemoEventData). GET /api/demo/audit returns them
// as DemoEventView: who did it and whom it was about by name, plus the
// counts, so the Recent Activity table on the Demo Mode page can show
// them in the reader's language. See docs/admin/demo-mode.md.

import { desc, inArray } from "drizzle-orm";
import { db } from "../db";
import { demoModeEvents, users } from "@shared/schema";

export const DEMO_EVENT_ACTIONS = [
  "demo_session_enter",
  "demo_session_exit",
  "demo_user_enter",
  "demo_user_exit",
  "demo_app_wide_enable",
  "demo_app_wide_disable",
  "demo_seed",
  "demo_reseed",
  "demo_wipe",
  "demo_login_create",
  "demo_login_regenerate",
  "demo_login_enable",
  "demo_login_disable",
] as const;
export type DemoEventAction = (typeof DEMO_EVENT_ACTIONS)[number];

export type DemoEventCounts = Record<string, number>;

/** The facts stored with an event. Only the fields that apply are set. */
export interface DemoEventData {
  targetUserId?: string;
  counts?: DemoEventCounts;
  wiped?: DemoEventCounts;
}

export interface DemoEventPerson {
  id: string;
  name: string;
  email: string | null;
}

export interface DemoEventView {
  id: number;
  action: string;
  createdAt: string | null;
  actor: DemoEventPerson | null;
  target: DemoEventPerson | null;
  counts: DemoEventCounts | null;
  wiped: DemoEventCounts | null;
}

function countsFrom(value: unknown): DemoEventCounts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: DemoEventCounts = {};
  for (const [key, n] of Object.entries(value as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n)) out[key] = n;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Pure: reads a stored `details` value. Anything that isn't DemoEventData JSON gives {}. */
export function parseDemoEventData(details: string | null | undefined): DemoEventData {
  if (!details) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(details);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const data: DemoEventData = {};
  if (typeof obj.targetUserId === "string" && obj.targetUserId) data.targetUserId = obj.targetUserId;
  const counts = countsFrom(obj.counts);
  if (counts) data.counts = counts;
  const wiped = countsFrom(obj.wiped);
  if (wiped) data.wiped = wiped;
  return data;
}

type PersonRow = { id: string; firstName: string | null; lastName: string | null; email: string | null };

/** Pure: "First Last", else the email, else the id. */
export function demoEventPerson(row: PersonRow): DemoEventPerson {
  const name = [row.firstName, row.lastName].filter((p) => p && p.trim()).join(" ").trim();
  return { id: row.id, name: name || row.email || row.id, email: row.email };
}

/** Pure: joins stored rows with the people they name. */
export function buildDemoEventViews(
  rows: ReadonlyArray<{ id: number; userId: string | null; action: string; details: string | null; createdAt: Date | null }>,
  people: ReadonlyMap<string, DemoEventPerson>,
): DemoEventView[] {
  return rows.map((row) => {
    const data = parseDemoEventData(row.details);
    const person = (id: string | null | undefined): DemoEventPerson | null =>
      id ? people.get(id) ?? { id, name: id, email: null } : null;
    return {
      id: row.id,
      action: row.action,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      actor: person(row.userId),
      target: person(data.targetUserId),
      counts: data.counts ?? null,
      wiped: data.wiped ?? null,
    };
  });
}

/** Writes one event. Never throws: a failed log write must not fail the action. */
export async function recordDemoEvent(actorId: string, action: DemoEventAction, data: DemoEventData = {}): Promise<void> {
  try {
    const details = Object.keys(data).length > 0 ? JSON.stringify(data) : null;
    await db.insert(demoModeEvents).values({ userId: actorId, action, details });
  } catch (err) {
    console.error("[demo-mode] event insert failed:", err);
  }
}

/** The latest events, newest first, with the names of the people they name. */
export async function listDemoEvents(limit = 50): Promise<DemoEventView[]> {
  const rows = await db
    .select({
      id: demoModeEvents.id,
      userId: demoModeEvents.userId,
      action: demoModeEvents.action,
      details: demoModeEvents.details,
      createdAt: demoModeEvents.createdAt,
    })
    .from(demoModeEvents)
    .orderBy(desc(demoModeEvents.createdAt), desc(demoModeEvents.id))
    .limit(limit);
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.userId) ids.add(row.userId);
    const target = parseDemoEventData(row.details).targetUserId;
    if (target) ids.add(target);
  }
  const people = new Map<string, DemoEventPerson>();
  if (ids.size > 0) {
    const found = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(inArray(users.id, [...ids]));
    for (const row of found) people.set(row.id, demoEventPerson(row));
  }
  return buildDemoEventViews(rows, people);
}
