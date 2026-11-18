// Fields outside users (Customer, Guest, Partner) never receive, even on a
// project or account they can open: deal value and stage, CRM record links,
// internal notes and the AI risk analysis. Applied to the response, so a
// field hidden in the UI can't still be read straight from the API.
import { isExternalRole } from "./internal-access";

export const INTERNAL_PROJECT_FIELDS = [
  "opportunityAcvValue",
  "salesforceEvaluationLink",
  "crmProvider",
  "crmOpportunityId",
  "crmAccountId",
  "salesStage",
  "forecastCategory",
  "mgmtNotes",
  "engineerNotes",
  "riskScore",
  "riskPredictionData",
  "lastRiskAnalysis",
  "ranking",
  // Teams are internal (docs/features/teams.md).
  "teamId",
  "subteamId",
  // Competitors named on the deal, and which staff member set each status.
  "competitorNames",
  "statusChange",
  "customerStatusChange",
] as const;

// The CRM link and its exception (migration 121) are internal too.
export const INTERNAL_CUSTOMER_FIELDS = [
  "salesforceAccountUrl",
  "crmProvider",
  "crmAccountId",
  "crmSyncedAt",
  "crmManagedFields",
  "crmLinkedBy",
  "crmRecordMissingAt",
  "crmLinkExceptionReason",
  "crmLinkExceptionBy",
  "crmLinkExceptionAt",
] as const;

function omitFields<T extends object>(row: T, fields: readonly string[]): T {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const field of fields) delete copy[field];
  return copy as T;
}

export function projectForViewer<T extends object>(role: string | null | undefined, project: T): T {
  if (role && !isExternalRole(role)) return project;
  return omitFields(project, INTERNAL_PROJECT_FIELDS);
}

export function projectsForViewer<T extends object>(role: string | null | undefined, projects: T[]): T[] {
  if (role && !isExternalRole(role)) return projects;
  return projects.map((project) => omitFields(project, INTERNAL_PROJECT_FIELDS));
}

export function customerForViewer<T extends object>(role: string | null | undefined, customer: T): T {
  if (role && !isExternalRole(role)) return customer;
  return omitFields(customer, INTERNAL_CUSTOMER_FIELDS);
}
