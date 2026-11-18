// Project summary, version 1: the read-only shape other apps (ImpactIQ,
// VectorIQ, n8n) read from GET /api/v1/projects/... Contract in
// docs/features/project-summary-api.md.
//
// Rules for v1: fields are only ever added, never renamed, removed or given
// a new meaning. A breaking change ships as /api/v2 next to v1.

export const PROJECT_SUMMARY_VERSION = 1 as const;

/** Success criteria statuses (Success Criteria tab) and the bucket each counts in. */
export const CRITERION_STATUS_BUCKETS = {
  complete: "met",
  fail: "failed",
  cancelled: "excluded",
  deferred: "excluded",
} as const satisfies Record<string, "met" | "failed" | "excluded">;

/** MAP statuses that count as done. Older rows use "completed", newer ones "complete". */
export const MAP_DONE_STATUSES: readonly string[] = ["complete", "completed"];

export type ProjectSummaryTeamRole =
  | "primary_engineer"
  | "specialist_engineer"
  | "supporting_engineer"
  | "additional_supporting"
  | "account_representative"
  | "opportunity_engineer";

export interface ProjectSummaryTeamMember {
  role: ProjectSummaryTeamRole;
  userId: string;
  name: string | null;
  /** Lower-cased. Other apps match people by email. */
  email: string | null;
}

export interface ProjectSummaryCounts {
  total: number;
  completed: number;
}

export interface ProjectSummaryV1 {
  version: typeof PROJECT_SUMMARY_VERSION;
  id: number;
  name: string | null;
  customerName: string;
  solutionName: string;
  opportunityName: string | null;
  /** Validation type as entered on the project (e.g. "POC"), or null. Added in v1, 2026-10. */
  type: string | null;
  /** Internal project status as stored (e.g. "planning", "active", "completed"). */
  status: string | null;
  /** Account Status shown to the customer (e.g. "On Time"). */
  customerStatus: string | null;
  /** ISO 8601 timestamps, or null. */
  startDate: string | null;
  endDate: string | null;
  completedDate: string | null;
  updatedAt: string | null;
  crm: {
    provider: string | null;
    opportunityId: string | null;
    accountId: string | null;
    /** The validation record link (Evaluation, POC, ...) as saved. */
    evaluationLink: string | null;
  };
  /** Active success criteria. open = total - met - failed - excluded. */
  criteria: {
    total: number;
    met: number;
    failed: number;
    open: number;
    excluded: number;
  };
  map: {
    phases: ProjectSummaryCounts;
    tasks: ProjectSummaryCounts;
  };
  team: ProjectSummaryTeamMember[];
  /**
   * The team (Admin › Team & People › Teams) that owns the project, with
   * its optional subteam, or null. Added in v1, 2026-10.
   */
  owningTeam: {
    id: number;
    name: string;
    slug: string;
    subteam: { id: number; name: string } | null;
  } | null;
  /** Link to the project in CriteriaIQ. */
  url: string;
}
