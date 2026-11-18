// Project summary API (GET /api/v1/projects/...) — mixin for DatabaseStorage.
//
// Narrow, batched reads: one query for the projects, one grouped count each
// for success criteria, MAP phases and MAP tasks, and one for the team's
// users, however many projects match. Shaping happens in
// server/lib/project-summary.ts.
import { db } from "../db";
import { and, count, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { mapPhases, mapTasks, projectOutcomes, projects, subteams, successCriteria, teams, users } from "@shared/schema";
import { applyDemoFilter } from "../lib/demo-storage";
import type { ProjectCrmFilters } from "../lib/crm-record-fields";

export interface ProjectSummaryRow {
  id: number;
  name: string | null;
  customerName: string;
  solutionName: string;
  opportunityName: string | null;
  type: string | null;
  status: string | null;
  customerStatus: string | null;
  startDate: Date | null;
  endDate: Date | null;
  completedDate: Date | null;
  updatedAt: Date | null;
  crmProvider: string | null;
  crmOpportunityId: string | null;
  crmAccountId: string | null;
  salesforceEvaluationLink: string | null;
  primaryEngineerId: string | null;
  specialistEngineerId: string | null;
  supportingEngineers: string[] | null;
  additionalSupportingTeam: string[] | null;
  accountRepresentativeId: string | null;
  opportunityEngineerId: string | null;
  teamId: number | null;
  teamName: string | null;
  teamSlug: string | null;
  subteamId: number | null;
  subteamName: string | null;
}

export interface StatusCount {
  projectId: number;
  status: string | null;
  count: number;
}

export interface SummaryUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface ProjectSummaryData {
  rows: ProjectSummaryRow[];
  criteria: StatusCount[];
  phases: StatusCount[];
  tasks: StatusCount[];
  users: SummaryUser[];
}

const summaryColumns = {
  id: projects.id,
  name: projects.name,
  customerName: projects.customerName,
  solutionName: projects.solutionName,
  opportunityName: projects.opportunityName,
  type: projects.type,
  status: projects.status,
  customerStatus: projects.customerStatus,
  startDate: projects.startDate,
  endDate: projects.endDate,
  completedDate: projects.completedDate,
  updatedAt: projects.updatedAt,
  crmProvider: projects.crmProvider,
  crmOpportunityId: projects.crmOpportunityId,
  crmAccountId: projects.crmAccountId,
  salesforceEvaluationLink: projects.salesforceEvaluationLink,
  primaryEngineerId: projects.primaryEngineerId,
  specialistEngineerId: projects.specialistEngineerId,
  supportingEngineers: projects.supportingEngineers,
  additionalSupportingTeam: projects.additionalSupportingTeam,
  accountRepresentativeId: projects.accountRepresentativeId,
  opportunityEngineerId: projects.opportunityEngineerId,
  teamId: projects.teamId,
  teamName: teams.name,
  teamSlug: teams.slug,
  subteamId: projects.subteamId,
  subteamName: subteams.name,
};

/** One validation a person is on, for GET /api/v1/people/summary. */
export interface PersonProjectRow {
  id: number;
  status: string | null;
  startDate: Date | null;
  completedDate: Date | null;
  primaryEngineerId: string | null;
  specialistEngineerId: string | null;
  supportingEngineers: string[] | null;
  additionalSupportingTeam: string[] | null;
  accountRepresentativeId: string | null;
  opportunityEngineerId: string | null;
}

export interface PersonSummaryData {
  projects: PersonProjectRow[];
  outcomes: Array<{ projectId: number; outcomeType: string }>;
  criteria: StatusCount[];
}

export function summaryTeamUserIds(rows: ProjectSummaryRow[]): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    for (const id of [
      r.primaryEngineerId,
      r.specialistEngineerId,
      ...(r.supportingEngineers ?? []),
      ...(r.additionalSupportingTeam ?? []),
      r.accountRepresentativeId,
      r.opportunityEngineerId,
    ]) {
      if (typeof id === "string" && id !== "") ids.add(id);
    }
  }
  return Array.from(ids);
}

export class ProjectSummaryStorageMixin {
  /**
   * Projects for the summary API, in the current request's demo mode. Pass
   * ids, or CRM filters (evaluationId narrows candidates only; the route
   * re-checks it exactly). Newest update first.
   */
  async getProjectSummaryRows(
    filter: { ids: number[] } | ProjectCrmFilters,
    limit: number,
  ): Promise<ProjectSummaryRow[]> {
    const conditions: SQL[] = [applyDemoFilter(projects)];
    if ("ids" in filter) {
      if (filter.ids.length === 0) return [];
      conditions.push(inArray(projects.id, filter.ids));
    } else {
      if (filter.crmOpportunityIds) conditions.push(inArray(projects.crmOpportunityId, filter.crmOpportunityIds));
      if (filter.crmAccountIds) conditions.push(inArray(projects.crmAccountId, filter.crmAccountIds));
      if (filter.evaluationId) {
        const id15 = filter.evaluationId.slice(0, 15);
        conditions.push(sql`strpos(${projects.salesforceEvaluationLink}, ${id15}) > 0`);
      }
    }
    return db
      .select(summaryColumns)
      .from(projects)
      .leftJoin(teams, eq(teams.id, projects.teamId))
      .leftJoin(subteams, eq(subteams.id, projects.subteamId))
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt), desc(projects.id))
      .limit(limit);
  }

  /** Grouped counts and team users for already-selected projects. */
  async getProjectSummaryData(rows: ProjectSummaryRow[]): Promise<ProjectSummaryData> {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { rows, criteria: [], phases: [], tasks: [], users: [] };

    const [criteria, phases, tasks] = await Promise.all([
      db
        .select({ projectId: successCriteria.projectId, status: successCriteria.status, count: count() })
        .from(successCriteria)
        .where(and(inArray(successCriteria.projectId, ids), eq(successCriteria.isActive, true)))
        .groupBy(successCriteria.projectId, successCriteria.status),
      db
        .select({ projectId: mapPhases.projectId, status: mapPhases.status, count: count() })
        .from(mapPhases)
        .where(inArray(mapPhases.projectId, ids))
        .groupBy(mapPhases.projectId, mapPhases.status),
      db
        .select({ projectId: mapTasks.projectId, status: mapTasks.status, count: count() })
        .from(mapTasks)
        .where(inArray(mapTasks.projectId, ids))
        .groupBy(mapTasks.projectId, mapTasks.status),
    ]);

    const userIds = summaryTeamUserIds(rows);
    const teamUsers =
      userIds.length === 0
        ? []
        : await db
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
            .from(users)
            .where(inArray(users.id, userIds));

    const toCounts = (list: Array<{ projectId: number | null; status: string | null; count: number | string }>) =>
      list
        .filter((r): r is { projectId: number; status: string | null; count: number | string } => r.projectId != null)
        .map((r) => ({ projectId: r.projectId, status: r.status, count: Number(r.count) }));

    return {
      rows,
      criteria: toCounts(criteria),
      phases: toCounts(phases),
      tasks: toCounts(tasks),
      users: teamUsers,
    };
  }

  /**
   * Every validation (in the current request's demo mode) where the user
   * holds any team slot, plus their outcomes and grouped active criteria.
   * Selects no names: the person summary is counts only.
   */
  async getPersonSummaryData(userId: string): Promise<PersonSummaryData> {
    const rows = await db
      .select({
        id: projects.id,
        status: projects.status,
        startDate: projects.startDate,
        completedDate: projects.completedDate,
        primaryEngineerId: projects.primaryEngineerId,
        specialistEngineerId: projects.specialistEngineerId,
        supportingEngineers: projects.supportingEngineers,
        additionalSupportingTeam: projects.additionalSupportingTeam,
        accountRepresentativeId: projects.accountRepresentativeId,
        opportunityEngineerId: projects.opportunityEngineerId,
      })
      .from(projects)
      .where(
        and(
          applyDemoFilter(projects),
          or(
            eq(projects.primaryEngineerId, userId),
            eq(projects.specialistEngineerId, userId),
            eq(projects.accountRepresentativeId, userId),
            eq(projects.opportunityEngineerId, userId),
            sql`${userId} = ANY(${projects.supportingEngineers})`,
            sql`${userId} = ANY(${projects.additionalSupportingTeam})`,
          ),
        ),
      );

    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return { projects: [], outcomes: [], criteria: [] };

    const [outcomes, criteria] = await Promise.all([
      db
        .select({ projectId: projectOutcomes.projectId, outcomeType: projectOutcomes.outcomeType })
        .from(projectOutcomes)
        .where(inArray(projectOutcomes.projectId, ids)),
      db
        .select({ projectId: successCriteria.projectId, status: successCriteria.status, count: count() })
        .from(successCriteria)
        .where(and(inArray(successCriteria.projectId, ids), eq(successCriteria.isActive, true)))
        .groupBy(successCriteria.projectId, successCriteria.status),
    ]);

    return {
      projects: rows,
      outcomes,
      criteria: criteria
        .filter((r): r is typeof r & { projectId: number } => r.projectId != null)
        .map((r) => ({ projectId: r.projectId, status: r.status, count: Number(r.count) })),
    };
  }
}
