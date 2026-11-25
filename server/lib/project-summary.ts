// Turns the batched rows from server/storage/project-summary.ts into
// ProjectSummaryV1 objects (shared/project-summary.ts). Pure, so the
// counting rules are tested without a database.
import {
  CRITERION_STATUS_BUCKETS,
  MAP_DONE_STATUSES,
  PROJECT_SUMMARY_VERSION,
  type ProjectSummaryCounts,
  type ProjectSummaryTeamMember,
  type ProjectSummaryTeamRole,
  type ProjectSummaryV1,
} from "@shared/project-summary";
import type { ProjectSummaryData, ProjectSummaryRow, StatusCount, SummaryUser } from "../storage/project-summary";
import { trimTrailingChar } from "@shared/trim-edge";

function iso(value: Date | null): string | null {
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : null;
}

function groupByProject(list: StatusCount[]): Map<number, StatusCount[]> {
  const out = new Map<number, StatusCount[]>();
  for (const entry of list) {
    const bucket = out.get(entry.projectId);
    if (bucket) bucket.push(entry);
    else out.set(entry.projectId, [entry]);
  }
  return out;
}

export function countCriteria(entries: StatusCount[]): ProjectSummaryV1["criteria"] {
  const out = { total: 0, met: 0, failed: 0, open: 0, excluded: 0 };
  for (const { status, count } of entries) {
    out.total += count;
    const bucket = CRITERION_STATUS_BUCKETS[(status ?? "").toLowerCase() as keyof typeof CRITERION_STATUS_BUCKETS];
    if (bucket) out[bucket] += count;
  }
  out.open = out.total - out.met - out.failed - out.excluded;
  return out;
}

export function countDone(entries: StatusCount[]): ProjectSummaryCounts {
  let total = 0;
  let completed = 0;
  for (const { status, count } of entries) {
    total += count;
    if (MAP_DONE_STATUSES.includes((status ?? "").toLowerCase())) completed += count;
  }
  return { total, completed };
}

function displayName(user: SummaryUser): string | null {
  const name = [user.firstName, user.lastName].filter((p) => p && p.trim()).join(" ").trim();
  return name || null;
}

export function teamFor(row: ProjectSummaryRow, usersById: Map<string, SummaryUser>): ProjectSummaryTeamMember[] {
  const slots: Array<[ProjectSummaryTeamRole, string | null | undefined]> = [
    ["primary_engineer", row.primaryEngineerId],
    ["specialist_engineer", row.specialistEngineerId],
    ...(row.supportingEngineers ?? []).map((id): [ProjectSummaryTeamRole, string] => ["supporting_engineer", id]),
    ...(row.additionalSupportingTeam ?? []).map((id): [ProjectSummaryTeamRole, string] => ["additional_supporting", id]),
    ["account_representative", row.accountRepresentativeId],
    ["opportunity_engineer", row.opportunityEngineerId],
  ];
  const seen = new Set<string>();
  const team: ProjectSummaryTeamMember[] = [];
  for (const [role, id] of slots) {
    // Archived users leave a placeholder string in these columns; only
    // ids that resolve to a real user are listed.
    const user = id ? usersById.get(id) : undefined;
    if (!user) continue;
    const key = `${role}:${user.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    team.push({ role, userId: user.id, name: displayName(user), email: user.email?.trim().toLowerCase() || null });
  }
  return team;
}

export function buildProjectSummaries(data: ProjectSummaryData, appUrl: string): ProjectSummaryV1[] {
  const criteria = groupByProject(data.criteria);
  const phases = groupByProject(data.phases);
  const tasks = groupByProject(data.tasks);
  const usersById = new Map(data.users.map((u) => [u.id, u]));
  const base = trimTrailingChar(appUrl, "/");

  return data.rows.map((row) => ({
    version: PROJECT_SUMMARY_VERSION,
    id: row.id,
    name: row.name,
    customerName: row.customerName,
    solutionName: row.solutionName,
    opportunityName: row.opportunityName,
    type: row.type,
    status: row.status,
    customerStatus: row.customerStatus,
    startDate: iso(row.startDate),
    endDate: iso(row.endDate),
    completedDate: iso(row.completedDate),
    updatedAt: iso(row.updatedAt),
    crm: {
      provider: row.crmProvider,
      opportunityId: row.crmOpportunityId,
      accountId: row.crmAccountId,
      evaluationLink: row.salesforceEvaluationLink || null,
    },
    criteria: countCriteria(criteria.get(row.id) ?? []),
    map: {
      phases: countDone(phases.get(row.id) ?? []),
      tasks: countDone(tasks.get(row.id) ?? []),
    },
    team: teamFor(row, usersById),
    owningTeam:
      row.teamId != null && row.teamName != null
        ? {
            id: row.teamId,
            name: row.teamName,
            slug: row.teamSlug ?? "",
            subteam: row.subteamId != null && row.subteamName != null ? { id: row.subteamId, name: row.subteamName } : null,
          }
        : null,
    url: `${base}/project/${row.id}`,
  }));
}
