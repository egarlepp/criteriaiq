// Person summary, version 1: the read-only, per-person counts VectorIQ reads
// from GET /api/v1/people/summary?email= for its readiness view. Contract in
// docs/features/person-summary-api.md.
//
// Deliberately counts only: no project names, customer names, CRM ids or
// project ids, so a leaked people:read key reveals how much someone has
// done, never for whom. Same v1 rule as the project summary: fields are only
// ever added, never renamed, removed or given a new meaning.
import type { ProjectSummaryTeamRole } from "./project-summary";

export const PERSON_SUMMARY_VERSION = 1 as const;

/** Project statuses counted as completed, besides a set completedDate. */
export const PROJECT_DONE_STATUSES: readonly string[] = ["completed", "complete", "closed"];

export interface PersonSummaryValidations {
  /** Validations the person holds any team slot on. */
  total: number;
  /** Not completed yet. */
  active: number;
  /** Completed (completedDate set, or a completed status). */
  completed: number;
  /** Recorded outcomes (Outcome Intelligence). A validation with no outcome counts in none of these. */
  won: number;
  lost: number;
  cancelled: number;
}

export interface PersonSummaryRoleCounts {
  total: number;
  won: number;
}

export interface PersonSummaryV1 {
  version: typeof PERSON_SUMMARY_VERSION;
  /** Lower-cased, as asked for. */
  email: string;
  validations: PersonSummaryValidations;
  /** Per team slot. A person in two slots on one validation counts once in each. */
  roles: Partial<Record<ProjectSummaryTeamRole, PersonSummaryRoleCounts>>;
  /** Active success criteria across those validations. open = total - met - failed - excluded. */
  criteria: {
    total: number;
    met: number;
    failed: number;
    open: number;
    excluded: number;
  };
  /** ISO 8601, or null. Earliest start and latest completion across those validations. */
  firstStartAt: string | null;
  lastCompletedAt: string | null;
}
