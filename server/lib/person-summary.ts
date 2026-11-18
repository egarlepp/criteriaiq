// Turns server/storage/project-summary.ts getPersonSummaryData() into a
// PersonSummaryV1 (shared/person-summary.ts). Pure, so the counting rules
// are tested without a database.
import { OutcomeTypeEnum } from "@shared/schema";
import {
  PERSON_SUMMARY_VERSION,
  PROJECT_DONE_STATUSES,
  type PersonSummaryRoleCounts,
  type PersonSummaryV1,
} from "@shared/person-summary";
import type { ProjectSummaryTeamRole } from "@shared/project-summary";
import type { PersonProjectRow, PersonSummaryData } from "../storage/project-summary";
import { countCriteria } from "./project-summary";

function validDate(value: Date | null): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function isProjectCompleted(row: Pick<PersonProjectRow, "status" | "completedDate">): boolean {
  return validDate(row.completedDate) || PROJECT_DONE_STATUSES.includes((row.status ?? "").trim().toLowerCase());
}

/** The team slots `userId` holds on a validation, each listed once. */
export function rolesFor(row: PersonProjectRow, userId: string): ProjectSummaryTeamRole[] {
  const roles: ProjectSummaryTeamRole[] = [];
  if (row.primaryEngineerId === userId) roles.push("primary_engineer");
  if (row.specialistEngineerId === userId) roles.push("specialist_engineer");
  if ((row.supportingEngineers ?? []).includes(userId)) roles.push("supporting_engineer");
  if ((row.additionalSupportingTeam ?? []).includes(userId)) roles.push("additional_supporting");
  if (row.accountRepresentativeId === userId) roles.push("account_representative");
  if (row.opportunityEngineerId === userId) roles.push("opportunity_engineer");
  return roles;
}

type Outcome = "won" | "lost" | "cancelled";

function normalizeOutcome(raw: string): Outcome | null {
  const parsed = OutcomeTypeEnum.safeParse(raw.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

export function buildPersonSummary(data: PersonSummaryData, userId: string, email: string): PersonSummaryV1 {
  const outcomeByProject = new Map<number, Outcome>();
  for (const { projectId, outcomeType } of data.outcomes) {
    const outcome = normalizeOutcome(outcomeType);
    if (outcome) outcomeByProject.set(projectId, outcome);
  }

  const validations = { total: 0, active: 0, completed: 0, won: 0, lost: 0, cancelled: 0 };
  const roles: Partial<Record<ProjectSummaryTeamRole, PersonSummaryRoleCounts>> = {};
  const counted = new Set<number>();
  let firstStart: Date | null = null;
  let lastCompleted: Date | null = null;

  for (const row of data.projects) {
    // The storage query matches on the same slots; a row that no longer
    // names the person (or a duplicate) is skipped rather than miscounted.
    const held = rolesFor(row, userId);
    if (held.length === 0 || counted.has(row.id)) continue;
    counted.add(row.id);

    const outcome = outcomeByProject.get(row.id) ?? null;
    validations.total += 1;
    if (isProjectCompleted(row)) validations.completed += 1;
    else validations.active += 1;
    if (outcome) validations[outcome] += 1;

    for (const role of held) {
      const entry = (roles[role] ??= { total: 0, won: 0 });
      entry.total += 1;
      if (outcome === "won") entry.won += 1;
    }

    if (validDate(row.startDate) && (!firstStart || row.startDate < firstStart)) firstStart = row.startDate;
    if (validDate(row.completedDate) && (!lastCompleted || row.completedDate > lastCompleted)) {
      lastCompleted = row.completedDate;
    }
  }

  return {
    version: PERSON_SUMMARY_VERSION,
    email,
    validations,
    roles,
    criteria: countCriteria(data.criteria.filter((c) => counted.has(c.projectId))),
    firstStartAt: firstStart ? firstStart.toISOString() : null,
    lastCompletedAt: lastCompleted ? lastCompleted.toISOString() : null,
  };
}
