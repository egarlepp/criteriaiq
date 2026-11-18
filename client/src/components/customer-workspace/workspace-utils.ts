// Small helpers shared by the customer workspace pieces (sidebar menu,
// project page Overview, Account Portal home).
import { formatFullName } from "@/lib/nameUtils";
import type { ComputedJourneyStage } from "@shared/value-journey";

/** Element id of the to-do list; the sidebar's "My to-dos" links to it. */
export const WORKSPACE_TODOS_ANCHOR = "workspace-todos";

/**
 * A project that is finished, won, lost or cancelled. Same words as the
 * Account Portal's "Active projects" filter, since project statuses are
 * admin-defined text.
 */
export function isClosedProjectStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return ["closed", "won", "lost", "complete", "done", "cancel"].some((word) => s.includes(word));
}

export interface WorkspacePerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export interface WorkspaceContact {
  key: string;
  name: string;
  role: string;
  email: string | null;
  initials: string;
  /** Whose side the person is on; customer people get a warm avatar. */
  side?: "team" | "customer";
  /** Short tag after the name (a customer's Edit or View access). */
  badge?: string;
}

/**
 * Team contacts for the side panel: drops empty and repeated people (the same
 * person is often both rep and engineer), keeps the first role given.
 */
export function teamContacts(
  people: Array<{ role: string; person: WorkspacePerson | null | undefined; badge?: string }>,
  side: "team" | "customer" = "team",
): WorkspaceContact[] {
  const seen = new Set<string>();
  const contacts: WorkspaceContact[] = [];
  for (const { role, person, badge } of people) {
    if (!person) continue;
    const name = formatFullName(person.firstName ?? "", person.lastName ?? "").trim() || person.email?.trim() || "";
    if (!name) continue;
    const key = (person.email ?? name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const initials = [person.firstName, person.lastName]
      .map((part) => (part ?? "").trim().charAt(0).toUpperCase())
      .join("");
    contacts.push({
      key,
      name,
      role,
      email: person.email?.trim() || null,
      initials: initials || name.charAt(0).toUpperCase(),
      side,
      ...(badge ? { badge } : {}),
    });
  }
  return contacts;
}

/** Rounds to a whole percent in 0–100. */
export function wholePercent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

/** What a project's roadmap bar shows: plan progress and the current journey stage. */
export interface JourneyPillInfo {
  /** Plan tasks done, 0–100; null when the plan has no tasks. */
  percent: number | null;
  /** The current stage, or null when every stage is done. */
  stage: Pick<ComputedJourneyStage, "name" | "iconName" | "color"> | null;
  allDone: boolean;
}

/** Null for a project without a plan (no stages). */
export function journeyPillInfo(stages: ComputedJourneyStage[] | null | undefined): JourneyPillInfo | null {
  if (!stages || stages.length === 0) return null;
  const tasks = stages.reduce((sum, stage) => ({ total: sum.total + stage.tasks.total, done: sum.done + stage.tasks.done }), { total: 0, done: 0 });
  const current = stages.find((stage) => stage.state === "current") ?? null;
  return {
    percent: tasks.total > 0 ? wholePercent(tasks.done, tasks.total) : null,
    stage: current ? { name: current.name, iconName: current.iconName, color: current.color } : null,
    allDone: !current,
  };
}
