// Audit / Assessment Ruleset / Risk Management — mixin for
// DatabaseStorage (Phase 7 #19).
//
// Bundles four related "audit-and-scoring" concerns:
//
//   Project Audit methods       (per-project field-level audit trail with
//                                pagination, filterable list, paged feed)
//   Assessment Ruleset methods  (CRUD on the configurable scoring rulesets
//                                that drive auto-status / auto-risk on projects)
//   Risk Management methods     (Risk Alerts triage and Risk Criteria CRUD —
//                                the threshold rules that trigger alerts)
//   Audit helper methods        (raw `getAuditEntriesByPattern` for the
//                                migration / backfill tools)
//
// Behavior preserved verbatim. Demo isolation is mostly not applied here —
// the upstream callers gate on the project_id which already carries the
// demo flag through `applyDemoFilter` on the projects table. The one
// cross-project list, getRecentRiskPredictions, filters on its join.
import { db } from "../db";
import { applyDemoFilter } from "../lib/demo-storage";
import { eq, and, or, desc, count, sql, inArray, lt, like } from "drizzle-orm";
import {
  projects,
  users,
  projectAudits,
  assessmentRulesets,
  riskAlerts,
  riskCriteria,
  projectRiskPredictions,
} from "@shared/schema";
import type {
  ProjectAudit,
  InsertProjectAudit,
  AssessmentRuleset,
  InsertAssessmentRuleset,
  RiskAlert,
  InsertRiskAlert,
  RiskCriteria,
  InsertRiskCriteria,
  ProjectRiskPrediction,
  InsertProjectRiskPrediction,
} from "@shared/schema";

export class AuditRiskStorageMixin {
  // Project Audit methods
  async createProjectAudit(auditData: InsertProjectAudit): Promise<ProjectAudit> {
    const _auditInserted = await db
        .insert(projectAudits)
        .values(auditData as typeof projectAudits.$inferInsert)
        .returning();
      const [audit] = _auditInserted as Array<typeof projectAudits.$inferSelect>;

    // Keep only the last 500 audit records per project
    const oldAudits = await db.select({ id: projectAudits.id })
      .from(projectAudits)
      .where(eq(projectAudits.projectId, auditData.projectId))
      .orderBy(desc(projectAudits.createdAt))
      .offset(500);

    if (oldAudits.length > 0) {
      const oldAuditIds = oldAudits.map((audit) => audit.id);
      await db.delete(projectAudits).where(inArray(projectAudits.id, oldAuditIds));
    }

    return audit;
  }

  async getProjectAudits(projectId: number): Promise<ProjectAudit[]> {
    return await db.select()
      .from(projectAudits)
      .where(eq(projectAudits.projectId, projectId))
      .orderBy(desc(projectAudits.createdAt))
      .limit(500);
  }

  async deleteProjectAudits(projectId: number): Promise<void> {
    await db.delete(projectAudits).where(eq(projectAudits.projectId, projectId));
  }

  async getProjectAuditHistory(projectId: number, limit: number, offset: number): Promise<any[]> {
    const audits = await db.select({
      id: projectAudits.id,
      projectId: projectAudits.projectId,
      userId: projectAudits.userId,
      userEmail: projectAudits.userEmail,
      userName: projectAudits.userName,
      fieldName: projectAudits.fieldName,
      oldValue: projectAudits.oldValue,
      newValue: projectAudits.newValue,
      changeType: projectAudits.changeType,
      changedAt: projectAudits.createdAt
    })
    .from(projectAudits)
    .where(eq(projectAudits.projectId, projectId))
    .orderBy(desc(projectAudits.createdAt))
    .limit(limit)
    .offset(offset);

    return audits;
  }

  async getProjectAuditCount(projectId: number): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(projectAudits)
      .where(eq(projectAudits.projectId, projectId));

    return result?.count || 0;
  }

  // Assessment Ruleset methods

  async getAllAssessmentRulesets(): Promise<AssessmentRuleset[]> {
    return await db.select().from(assessmentRulesets).orderBy(assessmentRulesets.name);
  }

  async getAssessmentRuleset(id: number): Promise<AssessmentRuleset | undefined> {
    const [ruleset] = await db.select().from(assessmentRulesets).where(eq(assessmentRulesets.id, id));
    return ruleset;
  }

  async getActiveAssessmentRulesets(): Promise<AssessmentRuleset[]> {
    return await db.select()
      .from(assessmentRulesets)
      .where(eq(assessmentRulesets.isActive, true))
      .orderBy(assessmentRulesets.name);
  }

  async getDefaultRulesetForCategory(category: string): Promise<AssessmentRuleset | undefined> {
    const [ruleset] = await db.select()
      .from(assessmentRulesets)
      .where(and(eq(assessmentRulesets.category, category), eq(assessmentRulesets.isDefault, true)));
    return ruleset;
  }

  async createAssessmentRuleset(data: InsertAssessmentRuleset): Promise<AssessmentRuleset> {
    if (data.isDefault) {
      await db.update(assessmentRulesets)
        .set({ isDefault: false })
        .where(eq(assessmentRulesets.category, data.category));
    }
    const _createdInserted = await db
        .insert(assessmentRulesets)
        .values(data as typeof assessmentRulesets.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof assessmentRulesets.$inferSelect>;
    return created;
  }

  async updateAssessmentRuleset(id: number, data: Partial<InsertAssessmentRuleset>): Promise<AssessmentRuleset | undefined> {
    if (data.isDefault && data.category) {
      await db.update(assessmentRulesets)
        .set({ isDefault: false })
        .where(and(eq(assessmentRulesets.category, data.category), sql`id != ${id}`));
    }
    const [updated] = await db.update(assessmentRulesets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(assessmentRulesets.id, id))
      .returning();
    return updated;
  }

  async deleteAssessmentRuleset(id: number): Promise<boolean> {
    await db.delete(riskCriteria).where(eq(riskCriteria.rulesetId, id));
    const result = await db.delete(assessmentRulesets).where(eq(assessmentRulesets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async cloneAssessmentRuleset(id: number, newName: string, createdBy?: string): Promise<AssessmentRuleset | undefined> {
    const source = await this.getAssessmentRuleset(id);
    if (!source) return undefined;

    const [cloned] = await db.insert(assessmentRulesets).values({
      name: newName,
      category: source.category,
      description: source.description,
      defaultAiProvider: source.defaultAiProvider,
      defaultAiModel: source.defaultAiModel,
      totalWeight: source.totalWeight,
      isActive: true,
      isDefault: false,
      createdBy: createdBy || source.createdBy,
    }).returning();

    const sourceCriteria = await db.select().from(riskCriteria).where(eq(riskCriteria.rulesetId, id));
    for (const c of sourceCriteria) {
      await db.insert(riskCriteria).values({
        rulesetId: cloned.id,
        name: c.name,
        description: c.description,
        category: c.category,
        weightFactor: c.weightFactor,
        triggerConditions: c.triggerConditions,
        severity: c.severity,
        isActive: c.isActive,
        createdBy: createdBy || c.createdBy,
      });
    }

    return cloned;
  }

  async incrementRulesetRunCount(id: number): Promise<void> {
    await db.update(assessmentRulesets)
      .set({
        runCount: sql`COALESCE(run_count, 0) + 1`,
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assessmentRulesets.id, id));
  }

  async getRulesetCriteria(rulesetId: number): Promise<RiskCriteria[]> {
    return await db.select()
      .from(riskCriteria)
      .where(eq(riskCriteria.rulesetId, rulesetId))
      .orderBy(riskCriteria.name);
  }

  // Risk Management methods

  async getAllRiskCriteria(): Promise<RiskCriteria[]> {
    return await db.select().from(riskCriteria).orderBy(riskCriteria.name);
  }

  async getActiveRiskCriteria(): Promise<RiskCriteria[]> {
    return await db.select()
      .from(riskCriteria)
      .where(eq(riskCriteria.isActive, true))
      .orderBy(riskCriteria.name);
  }

  async createRiskCriteria(data: InsertRiskCriteria): Promise<RiskCriteria> {
    const _createdInserted = await db
        .insert(riskCriteria)
        .values(data as typeof riskCriteria.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof riskCriteria.$inferSelect>;
    return created;
  }

  async updateRiskCriteria(id: number, data: Partial<InsertRiskCriteria>): Promise<RiskCriteria | undefined> {
    const [updated] = await db.update(riskCriteria)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(riskCriteria.id, id))
      .returning();
    return updated;
  }

  async deleteRiskCriteria(id: number): Promise<boolean> {
    const result = await db.delete(riskCriteria).where(eq(riskCriteria.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getProjectRiskPredictions(projectId: number, limit: number = 10): Promise<ProjectRiskPrediction[]> {
    return await db.select()
      .from(projectRiskPredictions)
      .where(eq(projectRiskPredictions.projectId, projectId))
      .orderBy(desc(projectRiskPredictions.createdAt))
      .limit(limit);
  }

  async getLatestRiskPrediction(projectId: number): Promise<ProjectRiskPrediction | undefined> {
    const [latest] = await db.select()
      .from(projectRiskPredictions)
      .where(eq(projectRiskPredictions.projectId, projectId))
      .orderBy(desc(projectRiskPredictions.createdAt))
      .limit(1);
    return latest;
  }

  async getRecentRiskPredictions(limit: number = 5): Promise<any[]> {
    const results = await db.select({
      id: projectRiskPredictions.id,
      projectId: projectRiskPredictions.projectId,
      overallRiskScore: projectRiskPredictions.overallRiskScore,
      riskLevel: projectRiskPredictions.riskLevel,
      confidence: projectRiskPredictions.confidence,
      aiProvider: projectRiskPredictions.aiProvider,
      aiModel: projectRiskPredictions.aiModel,
      createdAt: projectRiskPredictions.createdAt,
      projectName: projects.name,
      customerName: projects.customerName,
    })
      .from(projectRiskPredictions)
      .innerJoin(projects, eq(projectRiskPredictions.projectId, projects.id))
      .where(applyDemoFilter(projects))
      .orderBy(desc(projectRiskPredictions.createdAt))
      .limit(limit);
    return results;
  }

  async createRiskPrediction(data: InsertProjectRiskPrediction): Promise<ProjectRiskPrediction> {
    const _createdInserted = await db
        .insert(projectRiskPredictions)
        .values(data as typeof projectRiskPredictions.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof projectRiskPredictions.$inferSelect>;
    return created;
  }

  async createRiskAlert(data: InsertRiskAlert): Promise<RiskAlert> {
    const _createdInserted = await db
        .insert(riskAlerts)
        .values(data as typeof riskAlerts.$inferInsert)
        .returning();
      const [created] = _createdInserted as Array<typeof riskAlerts.$inferSelect>;
    return created;
  }

  async getProjectRiskAlerts(projectId: number, limit: number = 20): Promise<RiskAlert[]> {
    return await db.select()
      .from(riskAlerts)
      .where(eq(riskAlerts.projectId, projectId))
      .orderBy(desc(riskAlerts.sentAt))
      .limit(limit);
  }

  // Audit helper methods
  async getAuditEntriesByPattern(oldValuePatterns: string[], fieldNames: string[]): Promise<any[]> {
    return await db.select()
      .from(projectAudits)
      .where(
        and(
          or(...fieldNames.map(name => eq(projectAudits.fieldName, name))),
          or(...oldValuePatterns.map(pattern => eq(projectAudits.oldValue, pattern)))
        )
      );
  }

  async deleteProjectAuditEntry(auditId: number): Promise<void> {
    await db.delete(projectAudits).where(eq(projectAudits.id, auditId));
  }

  async deleteSpuriousCustomerAccessEntries(): Promise<number> {
    const result = await db.delete(projectAudits).where(
      and(
        eq(projectAudits.fieldName, 'customerAccess'),
        or(
          and(like(projectAudits.oldValue, '%[{%'), eq(projectAudits.newValue, '')),
          and(eq(projectAudits.oldValue, '[]'), eq(projectAudits.newValue, '')),
          like(projectAudits.oldValue, '%object Object%')
        )
      )
    );
    return result.rowCount || 0;
  }

}
