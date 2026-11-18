// ImpactIQ effort for Demo Mode. Demo projects aren't in any ImpactIQ, so
// the SE Effort card and the Activities column get believable figures made
// here instead: the same project always gets the same numbers, more work
// the further along it is, spread over the people on the project. Nothing
// is sent to ImpactIQ in Demo Mode.
import { inArray } from "drizzle-orm";
import { users } from "@shared/schema";
import type { ImpactiqEffort, ImpactiqEffortPerson, ImpactiqProjectActivity, ImpactiqProjectActivityCount } from "@shared/impactiq";
import { db } from "../db";
import { stageForStatus, type DemoStage } from "../lib/demo-story";

/** ImpactIQ's default activity types, with how much of the work each takes. */
export const DEMO_IMPACTIQ_ACTIVITY_TYPES: ReadonlyArray<{ name: string; share: number; hoursEach: number; icon: string; color: string }> = [
  // icon + color are ImpactIQ's defaults for these types (Admin → Activity Types there).
  { name: "POx Work", share: 0.34, hoursEach: 3, icon: "FlaskConical", color: "#7C3AED" },
  { name: "Discovery", share: 0.16, hoursEach: 1.5, icon: "Search", color: "#0EA5E9" },
  { name: "Demo", share: 0.14, hoursEach: 1.5, icon: "Presentation", color: "#4F46E5" },
  { name: "Enablement", share: 0.1, hoursEach: 2, icon: "GraduationCap", color: "#10B981" },
  { name: "Meeting", share: 0.1, hoursEach: 1, icon: "MessageSquare", color: "#4B5563" },
  { name: "Executive Briefing", share: 0.06, hoursEach: 1, icon: "Users", color: "#F59E0B" },
  { name: "Support", share: 0.06, hoursEach: 1, icon: "LifeBuoy", color: "#DC2626" },
  { name: "RFx Work", share: 0.04, hoursEach: 4, icon: "FileText", color: "#F97316" },
];

/** Total SE hours logged by the end of a project at each stage. */
const STAGE_HOURS: Record<DemoStage, readonly [number, number]> = {
  early: [6, 14],
  mid: [28, 60],
  late: [55, 95],
  won: [70, 120],
  lost: [30, 70],
  other: [18, 40],
};

const DEMO_HOURLY_RATE = 165;
const DAY_MS = 86_400_000;

export interface DemoEffortProject {
  id: number;
  status: string | null;
  crmOpportunityId?: string | null;
  startDate: Date | string | null;
  endDate: Date | string | null;
  completedDate?: Date | string | null;
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  supportingEngineers?: string[] | null;
  accountRepresentativeId?: string | null;
}

export interface DemoEffortPerson {
  name: string;
  email: string;
}

/** Small seeded generator, so a project's numbers never change between views. */
function seeded(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Splits `total` into parts by weight, to one decimal, adding up exactly. */
function splitByWeight(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const parts = weights.map((w) => round1((total * w) / sum));
  const drift = round1(total - parts.reduce((a, b) => a + b, 0));
  if (parts.length > 0) parts[0] = round1(parts[0] + drift);
  return parts;
}

/**
 * The effort ImpactIQ would report for a demo project. People are the
 * project's engineers and account rep, primary engineer first; with no
 * people the project shows no activity.
 */
export function demoImpactiqEffort(project: DemoEffortProject, people: readonly DemoEffortPerson[], now: Date = new Date()): ImpactiqEffort {
  const rand = seeded(project.id);
  const stage = stageForStatus(project.status ?? "");
  const start = toDate(project.startDate) ?? new Date(now.getTime() - 30 * DAY_MS);
  const end = toDate(project.completedDate) ?? toDate(project.endDate) ?? new Date(now.getTime() + 30 * DAY_MS);
  const last = new Date(Math.min(now.getTime() - DAY_MS, end.getTime()));
  const empty: ImpactiqEffort = {
    version: 1,
    crmOpportunityId: project.crmOpportunityId ?? "",
    totalHours: 0,
    activityCount: 0,
    firstActivityAt: null,
    lastActivityAt: null,
    byPerson: [],
    byType: [],
  };
  if (people.length === 0 || last.getTime() <= start.getTime()) return empty;

  // Open projects have logged the share of their window that has passed
  // (at least the discovery and kickoff work).
  const [low, high] = STAGE_HOURS[stage];
  const span = Math.max(end.getTime() - start.getTime(), DAY_MS);
  const elapsed = stage === "won" || stage === "lost" ? 1 : Math.min(1, Math.max(0.4, (last.getTime() - start.getTime()) / span));
  const totalHours = round1((low + rand() * (high - low)) * elapsed);

  const typeHours = splitByWeight(totalHours, DEMO_IMPACTIQ_ACTIVITY_TYPES.map((t) => t.share * (0.7 + rand() * 0.6)));
  const byType = DEMO_IMPACTIQ_ACTIVITY_TYPES.map((t, i) => ({
    name: t.name,
    hours: typeHours[i],
    activityCount: Math.max(1, Math.round(typeHours[i] / t.hoursEach)),
  })).filter((t) => t.hours >= 0.5);
  const activityCount = byType.reduce((sum, t) => sum + t.activityCount, 0);

  // The primary engineer does most of the work; the account rep the least.
  const personWeights = people.map((_, i) => (i === 0 ? 5 : i === people.length - 1 && people.length > 2 ? 1 : 2) * (0.8 + rand() * 0.4));
  const personHours = splitByWeight(totalHours, personWeights);
  const personCounts = splitByWeight(activityCount, personWeights).map((n) => Math.max(1, Math.round(n)));
  const byPerson: ImpactiqEffortPerson[] = people
    .map((p, i) => ({ name: p.name, email: p.email, hours: personHours[i], activityCount: personCounts[i] }))
    .filter((p) => p.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  const firstActivityAt = new Date(start.getTime() + Math.round(rand() * 3) * DAY_MS);
  const laborCost = Math.round(totalHours * DEMO_HOURLY_RATE);
  const directCost = stage === "early" ? 0 : Math.round((250 + rand() * 1500) / 50) * 50;
  return {
    version: 1,
    crmOpportunityId: project.crmOpportunityId ?? "",
    totalHours,
    activityCount,
    firstActivityAt: firstActivityAt.toISOString(),
    lastActivityAt: last.toISOString(),
    byPerson,
    byType,
    cost: { currency: "USD", totalCost: laborCost + directCost, laborCost, directCost, activitiesWithoutRate: 0 },
  };
}

/**
 * The Activities column's figure for a demo project: activities of the
 * chosen types (every demo type when none are chosen), none of them
 * counted through the Opportunity.
 */
export function demoImpactiqActivityCount(effort: ImpactiqEffort, activityTypes: readonly string[]): ImpactiqProjectActivityCount {
  const chosen = new Set(activityTypes.map((t) => t.toLowerCase()));
  const types = chosen.size === 0 ? effort.byType : effort.byType.filter((t) => chosen.has(t.name.toLowerCase()));
  return {
    activityCount: types.reduce((sum, t) => sum + t.activityCount, 0),
    totalHours: round1(types.reduce((sum, t) => sum + t.hours, 0)),
    lastActivityAt: types.length > 0 ? effort.lastActivityAt : null,
    viaOpportunity: 0,
    activitiesUrl: null,
  };
}

/**
 * The activities behind a demo project's count, for the Activities drawer:
 * exactly demoImpactiqActivityCount()'s number and hours, each one given to a
 * person on the project (weighted by their share of the hours) and dated
 * between the first and last activity, newest first.
 */
export function demoImpactiqActivities(projectId: number, effort: ImpactiqEffort, activityTypes: readonly string[]): ImpactiqProjectActivity[] {
  const chosen = new Set(activityTypes.map((t) => t.toLowerCase()));
  const types = chosen.size === 0 ? effort.byType : effort.byType.filter((t) => chosen.has(t.name.toLowerCase()));
  const first = toDate(effort.firstActivityAt);
  const last = toDate(effort.lastActivityAt);
  if (!first || !last || effort.byPerson.length === 0) return [];
  const rand = seeded(projectId * 31 + 7);
  const people = effort.byPerson;
  const totalPersonHours = people.reduce((sum, p) => sum + p.hours, 0) || 1;
  const pickPerson = () => {
    let r = rand() * totalPersonHours;
    for (const p of people) {
      r -= p.hours;
      if (r <= 0) return p.name;
    }
    return people[people.length - 1].name;
  };
  const firstDay = Math.floor(first.getTime() / DAY_MS);
  const days = Math.max(0, Math.floor(last.getTime() / DAY_MS) - firstDay);

  const out: ImpactiqProjectActivity[] = [];
  for (const type of types) {
    const style = DEMO_IMPACTIQ_ACTIVITY_TYPES.find((t) => t.name === type.name);
    const hours = splitByWeight(type.hours, Array.from({ length: type.activityCount }, () => 0.6 + rand() * 0.8));
    hours.forEach((h, i) => {
      // Working hours, on the quarter hour, UTC.
      const startMs = (firstDay + Math.round(rand() * days)) * DAY_MS + (13 + Math.floor(rand() * 7)) * 3_600_000 + Math.floor(rand() * 4) * 900_000;
      const hoursEach = Math.max(0.1, h);
      out.push({
        id: `demo-${projectId}-${type.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i + 1}`,
        type: type.name,
        typeIcon: style?.icon ?? null,
        typeColor: style?.color ?? null,
        ownerName: pickPerson(),
        hours: hoursEach,
        startAt: new Date(startMs).toISOString(),
        endAt: new Date(startMs + Math.round(hoursEach * 3_600_000)).toISOString(),
        viaOpportunity: false,
      });
    });
  }
  return out.sort((a, b) => b.startAt.localeCompare(a.startAt) || a.id.localeCompare(b.id));
}

/** The ids of a project's people, primary engineer first and account rep last. */
export function demoEffortPeopleIds(project: DemoEffortProject): string[] {
  const ids = [
    project.primaryEngineerId,
    project.specialistEngineerId,
    ...(project.supportingEngineers ?? []),
    project.accountRepresentativeId,
  ].filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

/** Names and emails for the given user ids, by id. */
export async function loadDemoEffortPeople(ids: readonly string[]): Promise<Map<string, DemoEffortPerson>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]));
  return new Map(
    rows.map((r) => [r.id, { name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email || r.id, email: r.email ?? "" }]),
  );
}

export function peopleFor(project: DemoEffortProject, directory: Map<string, DemoEffortPerson>): DemoEffortPerson[] {
  return demoEffortPeopleIds(project)
    .map((id) => directory.get(id))
    .filter((p): p is DemoEffortPerson => Boolean(p));
}
