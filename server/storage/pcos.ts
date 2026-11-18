// Project Closure Outcome & Intelligence System (PCOS) — mixin for
// DatabaseStorage (Phase 7 #14).
//
// 14 methods covering the post-project-closure outcome tracking surface:
//
//   ProjectOutcome CRUD + filterable list (by reasonCode / outcome /
//                                          submittedBy / dateRange)
//   OutcomeConfig CRUD                    (system-wide outcome reason codes
//                                          with hex color + active flag)
//   getProjectOutcomeStats                (aggregate dashboard widget that
//                                          rolls up totals + win rate +
//                                          top reason codes per outcome)
//
// Behavior preserved verbatim. PCOS data is operational (not reference)
// data, but no demo-isolation gating is applied here — same as the
// pre-extraction code.
import { db } from "../db";
import { applyDemoFilter, applyDemoFilterByProject } from "../lib/demo-storage";
import { eq, and, or, desc, count, sql, gte, lte, isNull, isNotNull, inArray } from "drizzle-orm";
import {
  projectOutcomes,
  projects,
  outcomeConfig,
  outcomeRequests,
  projectCrmCloseState,
} from "@shared/schema";
import type {
  ProjectOutcome,
  InsertProjectOutcome,
  OutcomeConfig,
  InsertOutcomeConfig,
  OutcomeRequest,
  InsertOutcomeRequest,
  ProjectCrmCloseState,
} from "@shared/schema";

export class PcosStorageMixin {

  async getProjectOutcome(projectId: number): Promise<ProjectOutcome | null> {
    const [outcome] = await db
      .select()
      .from(projectOutcomes)
      .where(eq(projectOutcomes.projectId, projectId))
      .limit(1);
    return outcome || null;
  }

  async getProjectOutcomeById(id: number): Promise<ProjectOutcome | null> {
    const [outcome] = await db
      .select()
      .from(projectOutcomes)
      .where(eq(projectOutcomes.id, id))
      .limit(1);
    return outcome || null;
  }

  async getAllProjectOutcomes(filters?: {
    outcomeType?: string;
    fromDate?: Date;
    toDate?: Date;
  }): Promise<ProjectOutcome[]> {
    let query = db.select().from(projectOutcomes);
    
    // Demo Mode: only outcomes on projects of the current mode.
    const conditions = [applyDemoFilterByProject(projectOutcomes.projectId)];
    if (filters?.outcomeType) {
      conditions.push(eq(projectOutcomes.outcomeType, filters.outcomeType));
    }
    if (filters?.fromDate) {
      conditions.push(gte(projectOutcomes.createdAt, filters.fromDate));
    }
    if (filters?.toDate) {
      conditions.push(lte(projectOutcomes.createdAt, filters.toDate));
    }
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    return query.orderBy(desc(projectOutcomes.createdAt));
  }

  async createProjectOutcome(data: InsertProjectOutcome): Promise<ProjectOutcome> {
    const [outcome] = await db
      .insert(projectOutcomes)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return outcome;
  }

  async updateProjectOutcome(id: number, data: Partial<InsertProjectOutcome>): Promise<ProjectOutcome> {
    const [outcome] = await db
      .update(projectOutcomes)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projectOutcomes.id, id))
      .returning();
    return outcome;
  }

  async deleteProjectOutcome(id: number): Promise<void> {
    await db
      .delete(projectOutcomes)
      .where(eq(projectOutcomes.id, id));
  }

  /**
   * Closed projects still owed an outcome: requests the rules marked
   * required and still open, plus projects that were already closed when
   * outcome requests were introduced (status "preexisting"). A project
   * that has an outcome never appears, whatever its request says.
   */
  async getOutcomesWithMissingData(): Promise<Array<{
    projectId: number;
    projectName: string | null;
    solutionName: string | null;
    customerName: string | null;
    status: string | null;
    salesStage: string | null;
    acv: string | null;
    endDate: Date | null;
    completedDate: Date | null;
    outcomeType: string;
    requestStatus: string;
    reason: string | null;
    closedAt: Date;
  }>> {
    return db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        solutionName: projects.solutionName,
        customerName: projects.customerName,
        status: projects.status,
        salesStage: projects.salesStage,
        acv: projects.opportunityAcvValue,
        endDate: projects.endDate,
        completedDate: projects.completedDate,
        outcomeType: outcomeRequests.outcomeType,
        requestStatus: outcomeRequests.status,
        reason: outcomeRequests.reason,
        closedAt: outcomeRequests.closedAt,
      })
      .from(outcomeRequests)
      .innerJoin(projects, eq(projects.id, outcomeRequests.projectId))
      .leftJoin(projectOutcomes, eq(projects.id, projectOutcomes.projectId))
      .where(
        and(
          applyDemoFilter(projects),
          isNull(projectOutcomes.id),
          or(
            and(eq(outcomeRequests.status, "open"), eq(outcomeRequests.required, true)),
            eq(outcomeRequests.status, "preexisting"),
          ),
        ),
      )
      .orderBy(desc(outcomeRequests.closedAt));
  }

  async getOutcomeRequest(projectId: number): Promise<OutcomeRequest | null> {
    const [row] = await db
      .select()
      .from(outcomeRequests)
      .where(eq(outcomeRequests.projectId, projectId))
      .limit(1);
    return row || null;
  }

  /** Inserts the request unless the project already has one; null when it did. */
  async createOutcomeRequest(data: InsertOutcomeRequest): Promise<OutcomeRequest | null> {
    const [row] = await db
      .insert(outcomeRequests)
      .values(data)
      .onConflictDoNothing({ target: outcomeRequests.projectId })
      .returning();
    return row || null;
  }

  async updateOutcomeRequest(
    projectId: number,
    data: Partial<Omit<InsertOutcomeRequest, "id" | "projectId">>,
  ): Promise<OutcomeRequest | null> {
    const [row] = await db
      .update(outcomeRequests)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(outcomeRequests.projectId, projectId))
      .returning();
    return row || null;
  }

  async deleteOutcomeRequest(projectId: number): Promise<void> {
    await db.delete(outcomeRequests).where(eq(outcomeRequests.projectId, projectId));
  }

  async getOutcomeConfig(): Promise<OutcomeConfig | null> {
    const [config] = await db
      .select()
      .from(outcomeConfig)
      .limit(1);
    return config || null;
  }

  async createOutcomeConfig(data: InsertOutcomeConfig): Promise<OutcomeConfig> {
    const [config] = await db
      .insert(outcomeConfig)
      .values(data)
      .returning();
    return config;
  }

  async updateOutcomeConfig(id: number, data: Partial<InsertOutcomeConfig>): Promise<OutcomeConfig> {
    const [config] = await db
      .update(outcomeConfig)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(outcomeConfig.id, id))
      .returning();
    return config;
  }

  async upsertOutcomeConfig(data: Partial<InsertOutcomeConfig>): Promise<OutcomeConfig> {
    const existing = await this.getOutcomeConfig();
    
    if (existing) {
      return this.updateOutcomeConfig(existing.id, data);
    } else {
      return this.createOutcomeConfig(data as InsertOutcomeConfig);
    }
  }

  async getProjectCrmCloseState(projectId: number): Promise<ProjectCrmCloseState | null> {
    const [row] = await db
      .select()
      .from(projectCrmCloseState)
      .where(eq(projectCrmCloseState.projectId, projectId))
      .limit(1);
    return row || null;
  }

  async upsertProjectCrmCloseState(row: {
    projectId: number;
    crmProvider: string;
    isClosed: boolean;
    isWon: boolean;
  }): Promise<void> {
    const values = { ...row, checkedAt: new Date() };
    await db
      .insert(projectCrmCloseState)
      .values(values)
      .onConflictDoUpdate({ target: projectCrmCloseState.projectId, set: values });
  }

  /**
   * Projects linked to an Opportunity (Deal) in `provider` whose outcome is
   * still undecided or unanswered: no request yet, or one that is open or
   * not required. Captured and pre-existing ones are settled.
   */
  async getProjectsForCrmCloseCheck(provider: string): Promise<Array<{
    projectId: number;
    crmOpportunityId: string;
    primaryEngineerId: string | null;
    checkedAt: Date | null;
    isClosed: boolean | null;
    isWon: boolean | null;
  }>> {
    const rows = await db
      .select({
        projectId: projects.id,
        crmOpportunityId: projects.crmOpportunityId,
        primaryEngineerId: projects.primaryEngineerId,
        checkedAt: projectCrmCloseState.checkedAt,
        isClosed: projectCrmCloseState.isClosed,
        isWon: projectCrmCloseState.isWon,
      })
      .from(projects)
      .leftJoin(outcomeRequests, eq(outcomeRequests.projectId, projects.id))
      .leftJoin(projectCrmCloseState, eq(projectCrmCloseState.projectId, projects.id))
      .where(
        and(
          // Never ask the CRM about Demo Mode projects.
          eq(projects.isDemo, false),
          eq(projects.crmProvider, provider),
          isNotNull(projects.crmOpportunityId),
          or(isNull(outcomeRequests.id), inArray(outcomeRequests.status, ["open", "not_required"])),
        ),
      );
    return rows.filter((r): r is typeof r & { crmOpportunityId: string } => !!r.crmOpportunityId);
  }

  /** Open required requests with no outcome yet, with the project's team. */
  async getOpenRequiredOutcomeRequests(): Promise<Array<{
    request: OutcomeRequest;
    projectName: string | null;
    primaryEngineerId: string | null;
    specialistEngineerId: string | null;
    teamId: number | null;
    subteamId: number | null;
  }>> {
    return db
      .select({
        request: outcomeRequests,
        projectName: sql<string | null>`COALESCE(${projects.customerName}, ${projects.solutionName})`,
        primaryEngineerId: projects.primaryEngineerId,
        specialistEngineerId: projects.specialistEngineerId,
        teamId: projects.teamId,
        subteamId: projects.subteamId,
      })
      .from(outcomeRequests)
      .innerJoin(projects, eq(projects.id, outcomeRequests.projectId))
      .leftJoin(projectOutcomes, eq(projectOutcomes.projectId, outcomeRequests.projectId))
      .where(
        and(
          // Reminders and escalations go to real people, so never for demo projects.
          eq(projects.isDemo, false),
          eq(outcomeRequests.status, "open"),
          eq(outcomeRequests.required, true),
          isNull(projectOutcomes.id),
        ),
      );
  }

  /**
   * Counts one more closure and returns the new count, in one UPDATE so two
   * projects closing at the same moment never get the same number. Creates
   * the config row (with the defaults the GET route uses) when missing.
   */
  async incrementOutcomeClosureCounter(): Promise<number> {
    const [row] = await db
      .update(outcomeConfig)
      .set({ closureCounter: sql`${outcomeConfig.closureCounter} + 1` })
      .returning({ closureCounter: outcomeConfig.closureCounter });
    if (row) return row.closureCounter;
    const created = await this.createOutcomeConfig({
      enabled: true,
      logicMode: "always",
      closureCounter: 1,
    });
    return created.closureCounter;
  }

  async getOutcomeStatistics(): Promise<{
    totalOutcomes: number;
    wonCount: number;
    lostCount: number;
    cancelledCount: number;
    avgTechnicalFitWon: number | null;
    avgPoliticalAlignmentWon: number | null;
    avgPainRating: number | null;
    topReasonCodes: Array<{ code: string; count: number }>;
  }> {
    const outcomes = await this.getAllProjectOutcomes();
    
    const totalOutcomes = outcomes.length;
    const wonOutcomes = outcomes.filter(o => o.outcomeType === 'won');
    const lostOutcomes = outcomes.filter(o => o.outcomeType === 'lost');
    const cancelledOutcomes = outcomes.filter(o => o.outcomeType === 'cancelled');
    
    const avgTechnicalFitWon = wonOutcomes.length > 0
      ? wonOutcomes.reduce((sum, o) => sum + (o.technicalFitScore || 0), 0) / wonOutcomes.filter(o => o.technicalFitScore).length
      : null;
    
    const avgPoliticalAlignmentWon = wonOutcomes.length > 0
      ? wonOutcomes.reduce((sum, o) => sum + (o.politicalAlignmentScore || 0), 0) / wonOutcomes.filter(o => o.politicalAlignmentScore).length
      : null;
    
    const avgPainRating = outcomes.length > 0
      ? outcomes.reduce((sum, o) => sum + (o.painRating || 0), 0) / outcomes.filter(o => o.painRating).length
      : null;
    
    const reasonCounts: Record<string, number> = {};
    outcomes.forEach(o => {
      if (o.primaryReasonCode) {
        reasonCounts[o.primaryReasonCode] = (reasonCounts[o.primaryReasonCode] || 0) + 1;
      }
    });
    
    const topReasonCodes = Object.entries(reasonCounts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      totalOutcomes,
      wonCount: wonOutcomes.length,
      lostCount: lostOutcomes.length,
      cancelledCount: cancelledOutcomes.length,
      avgTechnicalFitWon: avgTechnicalFitWon ? Number(avgTechnicalFitWon.toFixed(1)) : null,
      avgPoliticalAlignmentWon: avgPoliticalAlignmentWon ? Number(avgPoliticalAlignmentWon.toFixed(1)) : null,
      avgPainRating: avgPainRating ? Number(avgPainRating.toFixed(1)) : null,
      topReasonCodes,
    };
  }
}
