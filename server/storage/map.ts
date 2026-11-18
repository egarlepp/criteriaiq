// MAP (Mutual Action Plan) operations — mixin for DatabaseStorage
// (Phase 7 #9). Largest single domain extracted: ~30 methods covering:
//
//   MAP Templates           (CRUD on the reusable templates)
//   MAP Template Phases / Steps / Tasks
//   MAP Template Applications (which projects use which template)
//   MAP Automation Configuration (auto-status / auto-assignment rules)
//   Project-specific MAP    (the materialized phases/steps/tasks per project)
//
// Includes the cascading config lookup (project-specific -> global
// fallback), cascading status update helpers, manual-assignment-override
// tracking, cascading assignment update helpers, auto-completion
// helpers, and the project-MAP-from-template materialization flow.
//
// Behavior preserved verbatim. Uses namespace import for @shared/schema
// to avoid an enormous named-import list.
import { db, type Database } from "../db";
import { eq, and, or, desc, count, sql, getTableColumns, isNull, lt, gte, exists, notInArray, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { applyDemoFilterByProject, applyDemoFilterPreserveSystem, applyDemoFlag } from "../lib/demo-storage";
import { getBroadcaster } from "../services/websocket-broadcaster";
import * as schema from "@shared/schema";
import { planOffsetDates, scheduledDate, toIsoDate, type WorkingCalendar } from "@shared/working-calendar";
import { compareCustomerActions, customerActionsFromMap, type CustomerAction } from "@shared/customer-actions";
import type {
  MapTemplate,
  InsertMapTemplate,
  MapTemplatePhase,
  InsertMapTemplatePhase,
  MapTemplateStep,
  InsertMapTemplateStep,
  MapTemplateTask,
  InsertMapTemplateTask,
  MapTemplateApplication,
  InsertMapTemplateApplication,
  MapPhase,
  InsertMapPhase,
  MapStep,
  InsertMapStep,
  MapTask,
  InsertMapTask,
  ProjectMap,
  InsertMapAutomationConfig,
  MapAutomationConfig,
} from "@shared/schema";

// Re-bind schema tables under their original local names so the
// extracted method bodies (which use `users`, `projects`, etc. as
// barewords) keep working without a search-and-replace pass.
const {
  users,
  projects,
  mapTemplates,
  mapTemplatePhases,
  mapTemplateSteps,
  mapTemplateTasks,
  mapTemplateApplications,
  mapPhases,
  mapSteps,
  mapTasks,
  mapAssignmentOverrides,
  mapAutomationConfig,
  projectMaps,
} = schema;

// Lives on WorkScheduleStorageMixin; reached through the prototype chain.
interface WorkingCalendarsShape {
  getWorkingCalendarsForUsers(userIds: Array<string | null>, from: string, to: string): Promise<Map<string | null, WorkingCalendar>>;
}
export interface MapStorageMixin extends WorkingCalendarsShape {}

/** A MAP phase, step or task with a due date and an owner, for due-soon reminders. */
export interface MapDueItem {
  itemType: "phase" | "step" | "task";
  id: number;
  name: string;
  projectId: number;
  projectName: string | null;
  customerName: string | null;
  dueDate: Date;
  ownerId: string;
}

/** Statuses that mean an item needs no more work. */
const MAP_DONE_STATUSES = ["complete", "completed", "cancelled", "deferred"];

/** How far ahead to read holidays when planning a MAP from a template. */
const PLAN_HORIZON_YEARS = 3;

export class MapStorageMixin {
  // Phantom field declarations so TypeScript knows these are available
  // when applyMixins composes this into DatabaseStorage at runtime.
  declare db: Database;
  declare schema: typeof schema;

  // MAP Templates
  async getMapTemplates(): Promise<any[]> {
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;

    const results = await this.db
      .select({
        ...getTableColumns(mapTemplates),
        createdByUser: {
          id: createdByUser.id,
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          email: createdByUser.email,
        },
        updatedByUser: {
          id: updatedByUser.id,
          firstName: updatedByUser.firstName,
          lastName: updatedByUser.lastName,
          email: updatedByUser.email,
        },
      })
      .from(mapTemplates)
      .leftJoin(createdByUser, eq(mapTemplates.createdByUserId, createdByUser.id))
      .leftJoin(updatedByUser, eq(mapTemplates.updatedByUserId, updatedByUser.id))
      .where(applyDemoFilterPreserveSystem(mapTemplates))
      .orderBy(mapTemplates.name);

    return results.map((result) => ({
      ...result,
      createdByUser: result.createdByUser?.id ? result.createdByUser : null,
      updatedByUser: result.updatedByUser?.id ? result.updatedByUser : null,
    }));
  }

  async getMapTemplate(id: number): Promise<any | undefined> {
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;

    const [result] = await this.db
      .select({
        ...getTableColumns(mapTemplates),
        createdByUser: {
          id: createdByUser.id,
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          email: createdByUser.email,
        },
        updatedByUser: {
          id: updatedByUser.id,
          firstName: updatedByUser.firstName,
          lastName: updatedByUser.lastName,
          email: updatedByUser.email,
        },
      })
      .from(mapTemplates)
      .leftJoin(createdByUser, eq(mapTemplates.createdByUserId, createdByUser.id))
      .leftJoin(updatedByUser, eq(mapTemplates.updatedByUserId, updatedByUser.id))
      .where(and(eq(mapTemplates.id, id), applyDemoFilterPreserveSystem(mapTemplates)));
    
    if (!result) return undefined;
    
    return {
      ...result,
      createdByUser: result.createdByUser?.id ? result.createdByUser : null,
      updatedByUser: result.updatedByUser?.id ? result.updatedByUser : null,
    };
  }

  async createMapTemplate(template: InsertMapTemplate): Promise<MapTemplate> {
    // Task #723 — auto-tag inserts from a demo session.
    const [newTemplate] = await this.db
      .insert(mapTemplates)
      .values(applyDemoFlag(template))
      .returning();
    return newTemplate;
  }

  async updateMapTemplate(id: number, updates: Partial<InsertMapTemplate>): Promise<MapTemplate> {
    const [updatedTemplate] = await this.db
      .update(mapTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mapTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteMapTemplate(id: number): Promise<void> {
    await this.db.delete(mapTemplates).where(eq(mapTemplates.id, id));
  }

  // MAP Template Phases
  async getMapTemplatePhases(templateId: number): Promise<MapTemplatePhase[]> {
    return await this.db
      .select()
      .from(mapTemplatePhases)
      .where(eq(mapTemplatePhases.templateId, templateId))
      .orderBy(mapTemplatePhases.orderIndex);
  }

  async createMapTemplatePhase(phase: InsertMapTemplatePhase): Promise<MapTemplatePhase> {
    const [newPhase] = await this.db
      .insert(mapTemplatePhases)
      .values(phase)
      .returning();
    return newPhase;
  }

  async updateMapTemplatePhase(id: number, updates: Partial<InsertMapTemplatePhase>): Promise<MapTemplatePhase> {
    const [updatedPhase] = await this.db
      .update(mapTemplatePhases)
      .set(updates)
      .where(eq(mapTemplatePhases.id, id))
      .returning();
    return updatedPhase;
  }

  async deleteMapTemplatePhase(id: number): Promise<void> {
    await this.db.delete(mapTemplatePhases).where(eq(mapTemplatePhases.id, id));
  }

  async deleteMapTemplatePhases(templateId: number): Promise<void> {
    await this.db.delete(mapTemplatePhases).where(eq(mapTemplatePhases.templateId, templateId));
  }

  // MAP Template Steps
  async getMapTemplateSteps(templateId: number, phaseLocalKey: string): Promise<MapTemplateStep[]> {
    return await this.db
      .select()
      .from(mapTemplateSteps)
      .where(and(
        eq(mapTemplateSteps.templateId, templateId),
        eq(mapTemplateSteps.phaseLocalKey, phaseLocalKey)
      ))
      .orderBy(mapTemplateSteps.orderIndex);
  }

  async createMapTemplateStep(step: InsertMapTemplateStep): Promise<MapTemplateStep> {
    const [newStep] = await this.db
      .insert(mapTemplateSteps)
      .values(step)
      .returning();
    return newStep;
  }

  async updateMapTemplateStep(id: number, updates: Partial<InsertMapTemplateStep>): Promise<MapTemplateStep> {
    const [updatedStep] = await this.db
      .update(mapTemplateSteps)
      .set(updates)
      .where(eq(mapTemplateSteps.id, id))
      .returning();
    return updatedStep;
  }

  async deleteMapTemplateStep(id: number): Promise<void> {
    await this.db.delete(mapTemplateSteps).where(eq(mapTemplateSteps.id, id));
  }

  async deleteMapTemplateSteps(templateId: number): Promise<void> {
    await this.db.delete(mapTemplateSteps).where(eq(mapTemplateSteps.templateId, templateId));
  }

  // MAP Template Tasks
  async getMapTemplateTasks(templateId: number, phaseLocalKey: string, stepLocalKey: string): Promise<MapTemplateTask[]> {
    return await this.db
      .select()
      .from(mapTemplateTasks)
      .where(and(
        eq(mapTemplateTasks.templateId, templateId),
        eq(mapTemplateTasks.phaseLocalKey, phaseLocalKey),
        eq(mapTemplateTasks.stepLocalKey, stepLocalKey)
      ))
      .orderBy(mapTemplateTasks.orderIndex);
  }

  async createMapTemplateTask(task: InsertMapTemplateTask): Promise<MapTemplateTask> {
    const [newTask] = await this.db
      .insert(mapTemplateTasks)
      .values(task)
      .returning();
    return newTask;
  }

  async deleteMapTemplateTask(id: number): Promise<void> {
    await this.db.delete(mapTemplateTasks).where(eq(mapTemplateTasks.id, id));
  }

  async deleteMapTemplateTasks(templateId: number): Promise<void> {
    await this.db.delete(mapTemplateTasks).where(eq(mapTemplateTasks.templateId, templateId));
  }

  // MAP Template Applications (usage tracking)
  async getMapTemplateApplications(templateId: number): Promise<MapTemplateApplication[]> {
    return await this.db
      .select()
      .from(mapTemplateApplications)
      // Only projects of the current mode: a system template shows in both
      // modes, and demo account names must not show in its "used by" list.
      .where(and(
        eq(mapTemplateApplications.templateId, templateId),
        applyDemoFilterByProject(mapTemplateApplications.projectId),
      ))
      .orderBy(desc(mapTemplateApplications.appliedAt));
  }

  async createMapTemplateApplication(application: InsertMapTemplateApplication): Promise<MapTemplateApplication> {
    const [newApplication] = await this.db
      .insert(mapTemplateApplications)
      .values(application)
      .returning();
    return newApplication;
  }

  async getMapTemplateUsageStats(templateId: number): Promise<{usageCount: number, lastAppliedAt: Date | null, usedBy: Array<{projectId: number, projectName: string, appliedAt: Date, mode: string}>}> {
    const applications = await this.db
      .select({
        projectId: mapTemplateApplications.projectId,
        projectName: projects.customerName,
        appliedAt: mapTemplateApplications.appliedAt,
        mode: mapTemplateApplications.mode
      })
      .from(mapTemplateApplications)
      .leftJoin(projects, eq(mapTemplateApplications.projectId, projects.id))
      // Only projects of the current mode: a system template shows in both
      // modes, and demo account names must not show in its "used by" list.
      .where(and(
        eq(mapTemplateApplications.templateId, templateId),
        applyDemoFilterByProject(mapTemplateApplications.projectId),
      ))
      .orderBy(desc(mapTemplateApplications.appliedAt));

    const usageCount = applications.length;
    const lastAppliedAt = applications.length > 0 ? applications[0].appliedAt : null;
    const usedBy = applications.slice(0, 5).map((app) => ({
      projectId: app.projectId,
      projectName: app.projectName || 'Unknown Project',
      appliedAt: app.appliedAt!,
      mode: app.mode
    }));

    return { usageCount, lastAppliedAt, usedBy };
  }

  async getMapTemplatesWithStats(): Promise<Array<MapTemplate & {usageCount: number, lastAppliedAt: Date | null}>> {
    // First get templates with user information (same as getMapTemplates but with stats)
    const createdByUser = alias(users, 'createdByUser') as unknown as typeof users;
    const updatedByUser = alias(users, 'updatedByUser') as unknown as typeof users;
    const templates = await this.db
      .select({
        ...getTableColumns(mapTemplates),
        createdByUser: {
          id: createdByUser.id,
          firstName: createdByUser.firstName,
          lastName: createdByUser.lastName,
          email: createdByUser.email,
        },
        updatedByUser: {
          id: updatedByUser.id,
          firstName: updatedByUser.firstName,
          lastName: updatedByUser.lastName,
          email: updatedByUser.email,
        },
      })
      .from(mapTemplates)
      .leftJoin(createdByUser, eq(mapTemplates.createdByUserId, createdByUser.id))
      .leftJoin(updatedByUser, eq(mapTemplates.updatedByUserId, updatedByUser.id))
      .where(applyDemoFilterPreserveSystem(mapTemplates))
      .orderBy(mapTemplates.name);
    
    const templatesWithStats = await Promise.all(
      templates.map(async (result) => {
        const stats = await this.getMapTemplateUsageStats(result.id);
        return {
          ...result,
          createdByUser: result.createdByUser?.id ? result.createdByUser : null,
          updatedByUser: result.updatedByUser?.id ? result.updatedByUser : null,
          usageCount: stats.usageCount,
          lastAppliedAt: stats.lastAppliedAt
        };
      })
    );

    return templatesWithStats;
  }

  async duplicateMapTemplate(templateId: number, userId: string, newName?: string): Promise<MapTemplate> {
    return await this.db.transaction(async (tx) => {
      // Get original template
      const [originalTemplate] = await tx
        .select()
        .from(mapTemplates)
        .where(eq(mapTemplates.id, templateId));

      if (!originalTemplate) {
        throw new Error('Template not found');
      }

      // Create new template. A copy made in a demo session is demo data, so
      // it stays out of the real MAP Library and Wipe Demo Data removes it.
      const [newTemplate] = await tx
        .insert(mapTemplates)
        .values(applyDemoFlag({
          name: newName || `Copy of ${originalTemplate.name}`,
          description: originalTemplate.description,
          scope: originalTemplate.scope,
          visibility: originalTemplate.visibility,
          createdByUserId: userId
        }))
        .returning();
      const isDemo = newTemplate.isDemo;

      // Copy the tree once, keeping each row's local key: steps find their
      // phase and tasks their step by these keys, which only need to be
      // unique within a template. (New keys would leave every step and task
      // pointing at the original template's phases and steps.)
      const originalPhases = await tx
        .select()
        .from(mapTemplatePhases)
        .where(eq(mapTemplatePhases.templateId, templateId))
        .orderBy(mapTemplatePhases.orderIndex);

      for (const originalPhase of originalPhases) {
        await tx
          .insert(mapTemplatePhases)
          .values({
            templateId: newTemplate.id,
            localKey: originalPhase.localKey,
            name: originalPhase.name,
            description: originalPhase.description,
            orderIndex: originalPhase.orderIndex,
            stageId: originalPhase.stageId,
            expectedDays: originalPhase.expectedDays,
            sendExternalEmails: originalPhase.sendExternalEmails,
            defaultStartOffsetDays: originalPhase.defaultStartOffsetDays,
            defaultDueOffsetDays: originalPhase.defaultDueOffsetDays,
            isDemo,
          });
      }

      const originalSteps = await tx
        .select()
        .from(mapTemplateSteps)
        .where(eq(mapTemplateSteps.templateId, templateId))
        .orderBy(mapTemplateSteps.orderIndex);

      for (const originalStep of originalSteps) {
        await tx
          .insert(mapTemplateSteps)
          .values({
            templateId: newTemplate.id,
            phaseLocalKey: originalStep.phaseLocalKey,
            localKey: originalStep.localKey,
            name: originalStep.name,
            description: originalStep.description,
            orderIndex: originalStep.orderIndex,
            expectedDays: originalStep.expectedDays,
            defaultStatus: originalStep.defaultStatus,
            teamOwned: originalStep.teamOwned,
            sendExternalEmails: originalStep.sendExternalEmails,
            defaultStartOffsetDays: originalStep.defaultStartOffsetDays,
            defaultDueOffsetDays: originalStep.defaultDueOffsetDays,
            isDemo,
          });
      }

      const originalTasks = await tx
        .select()
        .from(mapTemplateTasks)
        .where(eq(mapTemplateTasks.templateId, templateId))
        .orderBy(mapTemplateTasks.orderIndex);

      for (const originalTask of originalTasks) {
        await tx
          .insert(mapTemplateTasks)
          .values({
            templateId: newTemplate.id,
            phaseLocalKey: originalTask.phaseLocalKey,
            stepLocalKey: originalTask.stepLocalKey,
            name: originalTask.name,
            description: originalTask.description,
            orderIndex: originalTask.orderIndex,
            expectedHours: originalTask.expectedHours,
            defaultStatus: originalTask.defaultStatus,
            teamOwned: originalTask.teamOwned,
            sendExternalEmails: originalTask.sendExternalEmails,
            defaultStartOffsetDays: originalTask.defaultStartOffsetDays,
            defaultDueOffsetDays: originalTask.defaultDueOffsetDays,
            isDemo,
          });
      }

      return newTemplate;
    });
  }

  // MAP Automation Configuration operations
  async getMapAutomationConfig(projectId?: number): Promise<MapAutomationConfig | undefined> {
    const [config] = await this.db
      .select()
      .from(mapAutomationConfig)
      .where(projectId ? eq(mapAutomationConfig.projectId, projectId) : isNull(mapAutomationConfig.projectId))
      .limit(1);
    return config;
  }

  async updateMapAutomationConfig(config: Partial<InsertMapAutomationConfig> & { projectId?: number }): Promise<MapAutomationConfig> {
    const projectId = config.projectId || null;
    
    // Check if config exists
    const existing = await this.getMapAutomationConfig(projectId || undefined);
    
    if (existing) {
      // Update existing config
      const [updated] = await this.db
        .update(mapAutomationConfig)
        .set({ ...config, updatedAt: new Date() })
        .where(projectId ? eq(mapAutomationConfig.projectId, projectId) : isNull(mapAutomationConfig.projectId))
        .returning();
      return updated;
    } else {
      // Create new config
      const [created] = await this.db
        .insert(mapAutomationConfig)
        .values({ ...config, projectId })
        .returning();
      return created;
    }
  }

  async deleteMapAutomationConfig(projectId: number): Promise<void> {
    await this.db
      .delete(mapAutomationConfig)
      .where(eq(mapAutomationConfig.projectId, projectId));
  }

  async getOrCreateDefaultMapAutomationConfig(): Promise<MapAutomationConfig> {
    const existing = await this.getMapAutomationConfig();
    
    if (existing) {
      return existing;
    }
    
    // Create default global config with all automation disabled
    const [created] = await this.db
      .insert(mapAutomationConfig)
      .values({
        projectId: null, // Global config
        autoCompleteStepsEnabled: false,
        autoCompleteStepsThreshold: 100,
        autoCompletePhasesEnabled: false,
        autoCompletePhasesThreshold: 100,
        cascadeBlockedEnabled: false,
        cascadeAtRiskEnabled: false,
        cascadeDeferredEnabled: false,
        cascadeStalledEnabled: false,
        cascadeCompleteEnabled: true, // Enabled by default
        cascadeNotStartedEnabled: true, // Enabled by default
        cascadeCancelledEnabled: false,
        autoInProgressEnabled: false,
        autoAtRiskEnabled: false,
        autoAtRiskThreshold: 50,
      })
      .returning();
    
    return created;
  }

  // Cascading config lookup: project-specific -> global fallback
  async getProjectAutomationConfigWithFallback(projectId: number): Promise<MapAutomationConfig> {
    // Try to get project-specific config first
    const projectConfig = await this.getMapAutomationConfig(projectId);
    
    if (projectConfig) {
      return projectConfig;
    }
    
    // Fall back to global config
    const globalConfig = await this.getMapAutomationConfig();
    
    if (globalConfig) {
      return globalConfig;
    }
    
    // If no config exists at all, create and return default global config
    return await this.getOrCreateDefaultMapAutomationConfig();
  }

  // Cascading status update helpers
  async cascadeStatusToSteps(phaseId: number, status: string, config: MapAutomationConfig, userId: string = 'system'): Promise<MapStep[]> {
    // Check if cascading is enabled for this status
    const shouldCascade = (
      (status === 'blocked' && config.cascadeBlockedEnabled) ||
      (status === 'at_risk' && config.cascadeAtRiskEnabled) ||
      (status === 'deferred' && config.cascadeDeferredEnabled) ||
      (status === 'stalled' && config.cascadeStalledEnabled) ||
      (status === 'complete' && config.cascadeCompleteEnabled) ||
      (status === 'not_started' && config.cascadeNotStartedEnabled) ||
      (status === 'cancelled' && config.cascadeCancelledEnabled)
    );
    
    if (!shouldCascade) return [];
    
    // Get phase to find projectId
    const phase = await this.getMapPhase(phaseId);
    if (!phase) return [];
    
    // Update all steps in this phase and return updated steps
    const updatedSteps = await this.db
      .update(mapSteps)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(mapSteps.projectId, phase.projectId),
          eq(mapSteps.phaseId, phaseId)
        )
      )
      .returning();
    
    // Broadcast WebSocket updates for each cascaded step
    const broadcaster = getBroadcaster();
    if (broadcaster) {
      for (const step of updatedSteps) {
        broadcaster.broadcastStepUpdate('updated', step, userId);
      }
    }
    
    return updatedSteps;
  }

  async cascadeStatusToTasks(stepId: number, status: string, config: MapAutomationConfig, userId: string = 'system'): Promise<MapTask[]> {
    // Check if cascading is enabled for this status
    const shouldCascade = (
      (status === 'blocked' && config.cascadeBlockedEnabled) ||
      (status === 'at_risk' && config.cascadeAtRiskEnabled) ||
      (status === 'deferred' && config.cascadeDeferredEnabled) ||
      (status === 'stalled' && config.cascadeStalledEnabled) ||
      (status === 'complete' && config.cascadeCompleteEnabled) ||
      (status === 'not_started' && config.cascadeNotStartedEnabled) ||
      (status === 'cancelled' && config.cascadeCancelledEnabled)
    );
    
    if (!shouldCascade) return [];
    
    // Get step to find projectId and keys
    const step = await this.getMapStep(stepId);
    if (!step) return [];
    
    // Update all tasks in this step and return updated tasks
    const updatedTasks = await this.db
      .update(mapTasks)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(mapTasks.projectId, step.projectId),
          eq(mapTasks.phaseId, step.phaseId),
          eq(mapTasks.stepId, stepId)
        )
      )
      .returning() as MapTask[];

    // Broadcast WebSocket updates for each cascaded task
    const broadcaster = getBroadcaster();
    if (broadcaster) {
      for (const task of updatedTasks) {
        broadcaster.broadcastTaskUpdate('updated', task, userId);
      }
    }
    
    return updatedTasks;
  }

  // Helper method to track manual assignment overrides
  async trackAssignmentOverride(
    entityType: 'map_phase' | 'map_step' | 'map_task',
    entityId: number,
    fieldName: string,
    userId: string,
    projectId: number
  ): Promise<void> {
    await this.db
      .insert(mapAssignmentOverrides)
      .values({
        projectId,
        entityType,
        entityId,
        fieldName,
        overriddenByUserId: userId,
        overriddenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          mapAssignmentOverrides.entityType,
          mapAssignmentOverrides.entityId,
          mapAssignmentOverrides.fieldName,
        ],
        set: {
          overriddenByUserId: userId,
          overriddenAt: new Date(),
        },
      });
  }

  // Helper method to check for manual assignment overrides
  async hasManualAssignmentOverride(entityType: string, entityId: number, fieldName: string): Promise<boolean> {
    const [override] = await this.db
      .select()
      .from(mapAssignmentOverrides)
      .where(
        and(
          eq(mapAssignmentOverrides.entityType, entityType),
          eq(mapAssignmentOverrides.entityId, entityId),
          eq(mapAssignmentOverrides.fieldName, fieldName)
        )
      )
      .limit(1);
    
    return !!override;
  }

  // Cascading assignment update helpers
  async cascadeAssignmentsToSteps(phaseId: number, config: MapAutomationConfig, userId: string = 'system'): Promise<MapStep[]> {
    // Get phase to access its assignment values and find projectId
    const phase = await this.getMapPhase(phaseId);
    if (!phase) return [];
    
    // Get all steps for this phase
    const steps = await this.db
      .select()
      .from(mapSteps)
      .where(
        and(
          eq(mapSteps.projectId, phase.projectId),
          eq(mapSteps.phaseId, phaseId)
        )
      );
    
    if (steps.length === 0) return [];
    
    // Process each step and determine which assignments to cascade
    const updatedSteps: MapStep[] = [];
    
    for (const step of steps) {
      const updates: Partial<MapStep> = {};
      
      // Process teamOwned field
      if (config.cascadeTeamOwnedEnabled && config.cascadeTeamOwnedPhasesToSteps) {
        const hasOverride = await this.hasManualAssignmentOverride('step', step.id, 'teamOwned');
        const behavior = config.cascadeTeamOwnedBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.teamOwned = phase.teamOwned;
        } else if (behavior === 'only_empty') {
          if (!step.teamOwned || step.teamOwned === '' || step.teamOwned === 'N/A') {
            updates.teamOwned = phase.teamOwned;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!step.teamOwned || step.teamOwned === '' || step.teamOwned === 'N/A')) {
            updates.teamOwned = phase.teamOwned;
          }
        }
      }
      
      // Process assignedToCustomerUserId field
      if (config.cascadeCustomerUserEnabled && config.cascadeCustomerUserPhasesToSteps) {
        const hasOverride = await this.hasManualAssignmentOverride('step', step.id, 'assignedToCustomerUserId');
        const behavior = config.cascadeCustomerUserBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.assignedToCustomerUserId = phase.assignedToCustomerUserId;
        } else if (behavior === 'only_empty') {
          if (!step.assignedToCustomerUserId || step.assignedToCustomerUserId === '') {
            updates.assignedToCustomerUserId = phase.assignedToCustomerUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!step.assignedToCustomerUserId || step.assignedToCustomerUserId === '')) {
            updates.assignedToCustomerUserId = phase.assignedToCustomerUserId;
          }
        }
      }
      
      // Process assignedToUserId field
      if (config.cascadeInternalUserEnabled && config.cascadeInternalUserPhasesToSteps) {
        const hasOverride = await this.hasManualAssignmentOverride('step', step.id, 'assignedToUserId');
        const behavior = config.cascadeInternalUserBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.assignedToUserId = phase.assignedToUserId;
        } else if (behavior === 'only_empty') {
          if (!step.assignedToUserId || step.assignedToUserId === '') {
            updates.assignedToUserId = phase.assignedToUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!step.assignedToUserId || step.assignedToUserId === '')) {
            updates.assignedToUserId = phase.assignedToUserId;
          }
        }
      }
      
      // Process additionalInternalUserId field
      if (config.cascadeAdditionalInternalEnabled && config.cascadeAdditionalInternalPhasesToSteps) {
        const hasOverride = await this.hasManualAssignmentOverride('step', step.id, 'additionalInternalUserId');
        const behavior = config.cascadeAdditionalInternalBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.additionalInternalUserId = phase.additionalInternalUserId;
        } else if (behavior === 'only_empty') {
          if (!step.additionalInternalUserId || step.additionalInternalUserId === '') {
            updates.additionalInternalUserId = phase.additionalInternalUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!step.additionalInternalUserId || step.additionalInternalUserId === '')) {
            updates.additionalInternalUserId = phase.additionalInternalUserId;
          }
        }
      }
      
      // Only update if there are changes to apply
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        
        const [updatedStep] = await this.db
          .update(mapSteps)
          .set(updates)
          .where(eq(mapSteps.id, step.id))
          .returning();
        
        updatedSteps.push(updatedStep);
      }
    }
    
    // Send single batch notification for cascade completion instead of individual broadcasts
    const broadcaster = getBroadcaster();
    if (broadcaster && updatedSteps.length > 0) {
      broadcaster.broadcastMapUpdate({
        type: 'map_update',
        action: 'cascade_complete',
        targetType: 'map_phase',
        targetId: phaseId,
        projectId: phase.projectId,
        userId: userId,
        data: {
          entity: 'steps',
          count: updatedSteps.length,
          phaseId: phaseId,
        },
      });
    }
    
    // Chain cascade to tasks - for each updated step, cascade assignments to its tasks
    // This ensures Phase → Steps → Tasks cascade chain works properly
    for (const step of updatedSteps) {
      await this.cascadeAssignmentsToTasks(step.id, config, userId);
    }
    
    return updatedSteps;
  }

  async cascadeAssignmentsToTasks(stepId: number, config: MapAutomationConfig, userId: string = 'system'): Promise<MapTask[]> {
    // Get step to access its assignment values and find projectId
    const step = await this.getMapStep(stepId);
    if (!step) return [];
    
    // Get all tasks for this step
    const tasks = await this.db
      .select()
      .from(mapTasks)
      .where(
        and(
          eq(mapTasks.projectId, step.projectId),
          eq(mapTasks.stepId, stepId)
        )
      );
    
    if (tasks.length === 0) return [];
    
    // Process each task and determine which assignments to cascade
    const updatedTasks: MapTask[] = [];
    
    for (const task of tasks) {
      const updates: Partial<MapTask> = {};
      
      // Process teamOwned field
      if (config.cascadeTeamOwnedEnabled && config.cascadeTeamOwnedStepsToTasks) {
        const hasOverride = await this.hasManualAssignmentOverride('task', task.id, 'teamOwned');
        const behavior = config.cascadeTeamOwnedBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.teamOwned = step.teamOwned;
        } else if (behavior === 'only_empty') {
          if (!task.teamOwned || task.teamOwned === '' || task.teamOwned === 'N/A') {
            updates.teamOwned = step.teamOwned;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!task.teamOwned || task.teamOwned === '' || task.teamOwned === 'N/A')) {
            updates.teamOwned = step.teamOwned;
          }
        }
      }
      
      // Process assignedToCustomerUserId field
      if (config.cascadeCustomerUserEnabled && config.cascadeCustomerUserStepsToTasks) {
        const hasOverride = await this.hasManualAssignmentOverride('task', task.id, 'assignedToCustomerUserId');
        const behavior = config.cascadeCustomerUserBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.assignedToCustomerUserId = step.assignedToCustomerUserId;
        } else if (behavior === 'only_empty') {
          if (!task.assignedToCustomerUserId || task.assignedToCustomerUserId === '') {
            updates.assignedToCustomerUserId = step.assignedToCustomerUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!task.assignedToCustomerUserId || task.assignedToCustomerUserId === '')) {
            updates.assignedToCustomerUserId = step.assignedToCustomerUserId;
          }
        }
      }
      
      // Process assignedToUserId field
      if (config.cascadeInternalUserEnabled && config.cascadeInternalUserStepsToTasks) {
        const hasOverride = await this.hasManualAssignmentOverride('task', task.id, 'assignedToUserId');
        const behavior = config.cascadeInternalUserBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.assignedToUserId = step.assignedToUserId;
        } else if (behavior === 'only_empty') {
          if (!task.assignedToUserId || task.assignedToUserId === '') {
            updates.assignedToUserId = step.assignedToUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!task.assignedToUserId || task.assignedToUserId === '')) {
            updates.assignedToUserId = step.assignedToUserId;
          }
        }
      }
      
      // Process additionalInternalUserId field
      if (config.cascadeAdditionalInternalEnabled && config.cascadeAdditionalInternalStepsToTasks) {
        const hasOverride = await this.hasManualAssignmentOverride('task', task.id, 'additionalInternalUserId');
        const behavior = config.cascadeAdditionalInternalBehavior;
        
        if (behavior === 'overwrite_all') {
          updates.additionalInternalUserId = step.additionalInternalUserId;
        } else if (behavior === 'only_empty') {
          if (!task.additionalInternalUserId || task.additionalInternalUserId === '') {
            updates.additionalInternalUserId = step.additionalInternalUserId;
          }
        } else if (behavior === 'skip_assigned') {
          if (!hasOverride && (!task.additionalInternalUserId || task.additionalInternalUserId === '')) {
            updates.additionalInternalUserId = step.additionalInternalUserId;
          }
        }
      }
      
      // Only update if there are changes to apply
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        
        const [updatedTask] = await this.db
          .update(mapTasks)
          .set(updates)
          .where(eq(mapTasks.id, task.id))
          .returning() as MapTask[];

        updatedTasks.push(updatedTask);
      }
    }
    
    // Send single batch notification for cascade completion instead of individual broadcasts
    const broadcaster = getBroadcaster();
    if (broadcaster && updatedTasks.length > 0) {
      broadcaster.broadcastMapUpdate({
        type: 'map_update',
        action: 'cascade_complete',
        targetType: 'map_step',
        targetId: stepId,
        projectId: step.projectId,
        userId: userId,
        data: {
          entity: 'tasks',
          count: updatedTasks.length,
          stepId: stepId,
        },
      });
    }
    
    return updatedTasks;
  }

  // Auto-completion helpers
  async checkStepAutoCompletion(stepId: number, config: MapAutomationConfig): Promise<boolean> {
    if (!config.autoCompleteStepsEnabled) {
      return false;
    }
    
    // Get all tasks for this step
    const step = await this.getMapStep(stepId);
    if (!step) return false;
    
    const tasks = await this.db
      .select()
      .from(mapTasks)
      .where(
        and(
          eq(mapTasks.projectId, step.projectId),
          eq(mapTasks.phaseId, step.phaseId),
          eq(mapTasks.stepId, stepId)
        )
      );
    
    if (tasks.length === 0) return false;
    
    const completedTasks = tasks.filter((t) => t.status === 'complete').length;
    const completionPercentage = (completedTasks / tasks.length) * 100;
    
    return completionPercentage >= config.autoCompleteStepsThreshold;
  }

  async checkPhaseAutoCompletion(phaseId: number, config: MapAutomationConfig): Promise<boolean> {
    if (!config.autoCompletePhasesEnabled) {
      return false;
    }
    
    // Get all steps for this phase
    const phase = await this.getMapPhase(phaseId);
    if (!phase) return false;
    
    const steps = await this.db
      .select()
      .from(mapSteps)
      .where(
        and(
          eq(mapSteps.projectId, phase.projectId),
          eq(mapSteps.phaseId, phaseId)
        )
      );
    
    if (steps.length === 0) return false;
    
    const completedSteps = steps.filter((s) => s.status === 'complete').length;
    const completionPercentage = (completedSteps / steps.length) * 100;
    
    return completionPercentage >= config.autoCompletePhasesThreshold;
  }

  // Project-specific MAP operations
  async getProjectMap(projectId: number): Promise<{phases: MapPhase[], steps: MapStep[], tasks: MapTask[]}> {
    const phases = await this.db
      .select()
      .from(mapPhases)
      .where(eq(mapPhases.projectId, projectId))
      .orderBy(mapPhases.orderIndex);

    const steps = await this.db
      .select()
      .from(mapSteps)
      .where(eq(mapSteps.projectId, projectId))
      .orderBy(mapSteps.orderIndex);

    const tasks = await this.db
      .select()
      .from(mapTasks)
      .where(eq(mapTasks.projectId, projectId))
      .orderBy(mapTasks.orderIndex) as MapTask[];

    return { phases, steps, tasks };
  }

  /**
   * Open MAP tasks the customer side owns, for one or more projects
   * (shared/customer-actions.ts decides what counts). Each row carries its
   * project id and the customer owner's display name. Callers check project
   * access first.
   */
  async getCustomerActions(
    projectIds: number[],
    today: Date = new Date(),
  ): Promise<Array<CustomerAction & { projectId: number; ownerName: string | null }>> {
    if (projectIds.length === 0) return [];
    const [steps, tasks] = await Promise.all([
      this.db
        .select({ id: mapSteps.id, name: mapSteps.name, projectId: mapSteps.projectId })
        .from(mapSteps)
        .where(inArray(mapSteps.projectId, projectIds)),
      this.db
        .select({
          id: mapTasks.id,
          name: mapTasks.name,
          status: mapTasks.status,
          stepId: mapTasks.stepId,
          projectId: mapTasks.projectId,
          teamOwned: mapTasks.teamOwned,
          assignedToCustomerUserId: mapTasks.assignedToCustomerUserId,
          dueDate: mapTasks.dueDate,
        })
        .from(mapTasks)
        .where(inArray(mapTasks.projectId, projectIds)),
    ]);

    const actions = projectIds.flatMap((projectId) =>
      customerActionsFromMap(
        {
          steps: steps.filter((s) => s.projectId === projectId),
          tasks: tasks.filter((t) => t.projectId === projectId),
        },
        today,
      ).map((action) => ({ ...action, projectId })),
    );

    const ownerIds = [...new Set(actions.map((a) => a.ownerUserId).filter((id): id is string => !!id))];
    const owners = ownerIds.length
      ? await this.db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(inArray(users.id, ownerIds))
      : [];
    const ownerNames = new Map(
      owners.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null]),
    );

    return actions
      .map((a) => ({ ...a, ownerName: a.ownerUserId ? ownerNames.get(a.ownerUserId) ?? null : null }))
      .sort(compareCustomerActions);
  }

  /** Display names for projects (name, else the account name), for lists that span projects. */
  async getProjectNames(projectIds: number[]): Promise<Map<number, string>> {
    if (projectIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: projects.id, name: projects.name, customerName: projects.customerName })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    return new Map(rows.map((row) => [row.id, row.name || row.customerName || `#${row.id}`]));
  }

  async getProjectMapMetadata(projectId: number): Promise<ProjectMap | undefined> {
    const [metadata] = await this.db
      .select()
      .from(projectMaps)
      .where(eq(projectMaps.projectId, projectId))
      .limit(1);
    return metadata;
  }

  async updateProjectMapName(projectId: number, mapName: string): Promise<ProjectMap> {
    // Check if a projectMaps entry exists
    const existing = await this.getProjectMapMetadata(projectId);
    
    if (existing) {
      // Update existing entry
      const [updated] = await this.db
        .update(projectMaps)
        .set({ mapName, updatedAt: new Date() })
        .where(eq(projectMaps.projectId, projectId))
        .returning();
      return updated;
    } else {
      // Create new entry if it doesn't exist
      // Check if this MAP was created from a template
      const [templateApp] = await this.db
        .select()
        .from(mapTemplateApplications)
        .where(eq(mapTemplateApplications.projectId, projectId))
        .limit(1);
      
      let templateName = null;
      let createdAt = new Date(); // Default to now
      
      if (templateApp) {
        const [template] = await this.db
          .select({ name: mapTemplates.name })
          .from(mapTemplates)
          .where(eq(mapTemplates.id, templateApp.templateId))
          .limit(1);
        templateName = template?.name || null;
        // Use the template application date as the creation date
        if (templateApp.appliedAt) {
          createdAt = templateApp.appliedAt;
        }
      } else {
        // Fallback: use the earliest phase creation date
        const [earliestPhase] = await this.db
          .select({ createdAt: mapPhases.createdAt })
          .from(mapPhases)
          .where(eq(mapPhases.projectId, projectId))
          .orderBy(mapPhases.createdAt)
          .limit(1);
        if (earliestPhase?.createdAt) {
          createdAt = earliestPhase.createdAt;
        }
      }
      
      const [created] = await this.db
        .insert(projectMaps)
        .values({
          projectId,
          mapName,
          templateName,
          createdAt,
        })
        .returning();
      return created;
    }
  }

  /**
   * Saves which assignment roles a plan shows (null = every role). Creates the
   * project_maps row with the usual name when an older MAP has none yet.
   */
  async updateProjectMapAssignmentRoles(projectId: number, roles: string[] | null): Promise<ProjectMap> {
    const existing = await this.getProjectMapMetadata(projectId);
    if (!existing) {
      await this.updateProjectMapName(projectId, `MAP#${projectId}`);
    }
    const [updated] = await this.db
      .update(projectMaps)
      .set({ assignmentRoles: roles, updatedAt: new Date() })
      .where(eq(projectMaps.projectId, projectId))
      .returning();
    return updated;
  }

  /** What MAP scheduling needs about a project: its owner and the task-owner switch. */
  async getProjectScheduling(projectId: number): Promise<{ primaryEngineerId: string | null; scheduleByTaskOwner: boolean } | null> {
    const [row] = await this.db
      .select({ primaryEngineerId: projects.primaryEngineerId, scheduleByTaskOwner: projects.scheduleByTaskOwner })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row ?? null;
  }

  /** The project's "plan MAP dates on each task owner's calendar" switch. */
  async setProjectScheduleByTaskOwner(projectId: number, value: boolean): Promise<boolean> {
    const rows = await this.db
      .update(projects)
      .set({ scheduleByTaskOwner: value, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    return rows.length > 0;
  }

  /**
   * Open MAP phases, steps and tasks with an owner whose due date falls in
   * [from, to). Demo projects are left out. With `ownerIds`, only items those
   * people own.
   */
  async listOpenMapItemsDueBetween(from: Date, to: Date, ownerIds?: string[]): Promise<MapDueItem[]> {
    if (ownerIds && ownerIds.length === 0) return [];
    const out: MapDueItem[] = [];
    const tables = [
      ["phase", mapPhases],
      ["step", mapSteps],
      ["task", mapTasks],
    ] as const;
    for (const [itemType, table] of tables) {
      const rows = await this.db
        .select({
          id: table.id,
          name: table.name,
          projectId: table.projectId,
          projectName: projects.solutionName,
          customerName: projects.customerName,
          dueDate: table.dueDate,
          assignedToUserId: table.assignedToUserId,
          assignedToCustomerUserId: table.assignedToCustomerUserId,
        })
        .from(table)
        .innerJoin(projects, eq(table.projectId, projects.id))
        .where(
          and(
            gte(table.dueDate, from),
            lt(table.dueDate, to),
            notInArray(table.status, MAP_DONE_STATUSES),
            eq(table.isDemo, false),
            eq(projects.isDemo, false),
            ownerIds
              ? or(inArray(table.assignedToUserId, ownerIds), inArray(table.assignedToCustomerUserId, ownerIds))
              : undefined,
          ),
        );
      for (const row of rows) {
        const ownerId = row.assignedToUserId || row.assignedToCustomerUserId;
        if (!ownerId || !row.dueDate) continue;
        if (ownerIds && !ownerIds.includes(ownerId)) continue;
        out.push({
          itemType,
          id: row.id,
          name: row.name,
          projectId: row.projectId,
          projectName: row.projectName ?? null,
          customerName: row.customerName ?? null,
          dueDate: row.dueDate,
          ownerId,
        });
      }
    }
    return out;
  }

  async createProjectMapFromTemplate(projectId: number, templateId: number, userId: string): Promise<boolean> {
    try {
      console.log(`Creating project MAP from template ${templateId} for project ${projectId}`);

      // NOTE: This function uses raw SQL queries instead of Drizzle's query builder for template steps and tasks.
      // Drizzle was generating malformed SQL with syntax errors (position 233) when querying by phase_local_key.
      // Raw SQL ensures reliable execution while maintaining parameterization for security.
      
      // Dates are planned in working days from the project's start date, or
      // today when that's earlier or unset (so a MAP added late never starts
      // out overdue): phases from the project start, steps from their phase's
      // start, tasks from their step's start, skipping weekends and the
      // project owner's holidays. New tasks have no owner yet; a task's
      // dates move onto its owner's calendar when it is assigned
      // (server/services/map-scheduling.ts).
      const [planProject] = await this.db
        .select({ startDate: projects.startDate, primaryEngineerId: projects.primaryEngineerId, isDemo: projects.isDemo })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const today = toIsoDate(new Date());
      const projectStart = planProject?.startDate ? toIsoDate(new Date(planProject.startDate)) : today;
      const anchor = projectStart > today ? projectStart : today;
      const horizon = `${Number(anchor.slice(0, 4)) + PLAN_HORIZON_YEARS}${anchor.slice(4)}`;
      const ownerId = planProject?.primaryEngineerId ?? null;
      // Plan rows are demo data when the project is (Wipe Demo Data counts
      // and removes them), whichever session applies the template.
      const isDemo = planProject?.isDemo ?? false;
      const cal: WorkingCalendar = (await this.getWorkingCalendarsForUsers([ownerId], anchor, horizon)).get(ownerId) ?? {
        holidays: new Set<string>(),
      };

      return await this.db.transaction(async (tx) => {
        // Idempotency check: prevent creating multiple MAPs for the same project
        const existingPhases = await tx
          .select()
          .from(mapPhases)
          .where(eq(mapPhases.projectId, projectId))
          .limit(1);

        if (existingPhases.length > 0) {
          console.log(`Project ${projectId} already has a MAP, skipping creation`);
          return true; // Return success since MAP already exists
        }

        // Get template phases
        const templatePhases = await tx
          .select()
          .from(mapTemplatePhases)
          .where(eq(mapTemplatePhases.templateId, templateId))
          .orderBy(mapTemplatePhases.orderIndex);
        
        for (const templatePhase of templatePhases) {
          const phaseDates = planOffsetDates(anchor, templatePhase.defaultStartOffsetDays, templatePhase.defaultDueOffsetDays, cal);
          // Create project phase
          const [projectPhase] = await tx
            .insert(mapPhases)
            .values({
              projectId,
              isDemo,
              name: templatePhase.name,
              description: templatePhase.description,
              orderIndex: templatePhase.orderIndex,
              stageId: templatePhase.stageId,
              startDate: scheduledDate(phaseDates.start),
              dueDate: scheduledDate(phaseDates.due),
            })
            .returning();

          // Get template steps for this phase using raw SQL to avoid Drizzle bug
          const templateStepsResult = await tx.execute(sql`
            SELECT * FROM map_template_steps
            WHERE template_id = ${templateId}
              AND phase_local_key = ${templatePhase.localKey}
            ORDER BY order_index
          `);
          const templateSteps = templateStepsResult.rows as any[];
          
          for (const templateStep of templateSteps) {
            // Create project step using raw SQL to avoid Drizzle query builder bug
            const stepDates = planOffsetDates(phaseDates.start, templateStep.default_start_offset_days, templateStep.default_due_offset_days, cal);
            const stepResult = await tx.execute(sql`
              INSERT INTO map_steps (project_id, phase_id, name, description, order_index, status, team_owned, start_date, due_date, is_demo)
              VALUES (${projectId}, ${projectPhase.id}, ${templateStep.name}, ${templateStep.description}, ${templateStep.order_index}, ${templateStep.default_status || "not_started"}, ${templateStep.team_owned || "N/A"}, ${`${stepDates.start} 12:00:00`}::timestamp, ${`${stepDates.due} 12:00:00`}::timestamp, ${isDemo})
              RETURNING id
            `);
            // Raw SQL: noon, written as the UTC wall time drizzle stores for
            // these timestamp-without-time-zone columns (see scheduledDate).
            const projectStep = { id: (stepResult.rows[0] as any).id };

            // Get template tasks for this step using raw SQL to avoid Drizzle bug
            const templateTasksResult = await tx.execute(sql`
              SELECT * FROM map_template_tasks
              WHERE template_id = ${templateId}
                AND phase_local_key = ${templatePhase.localKey}
                AND step_local_key = ${templateStep.local_key}
              ORDER BY order_index
            `);
            const templateTasks = templateTasksResult.rows as any[];

            for (const templateTask of templateTasks) {
              // Create project task using raw SQL to avoid Drizzle query builder bug
              const taskDates = planOffsetDates(stepDates.start, templateTask.default_start_offset_days, templateTask.default_due_offset_days, cal);
              const taskResult = await tx.execute(sql`
                INSERT INTO map_tasks (project_id, phase_id, step_id, name, description, order_index, status, send_external_emails, team_owned, start_date, due_date, is_demo)
                VALUES (${projectId}, ${projectPhase.id}, ${projectStep.id}, ${templateTask.name}, ${templateTask.description}, ${templateTask.order_index}, ${templateTask.default_status || "not_started"}, ${templateTask.send_external_emails ?? true}, ${templateTask.team_owned || "N/A"}, ${`${taskDates.start} 12:00:00`}::timestamp, ${`${taskDates.due} 12:00:00`}::timestamp, ${isDemo})
                RETURNING id
              `);
              const projectTask = { id: (taskResult.rows[0] as any).id };
            }
          }
        }

        // Track template application for usage statistics
        await tx
          .insert(mapTemplateApplications)
          .values({
            templateId,
            projectId,
            mode: "replace",
            isDemo,
          });

        // Create project MAP metadata with auto-generated name
        
        // Get project data for customer name. projects has no customer_id
        // column; joining on one built invalid SQL and rolled back every MAP
        // created from a template.
        const [project] = await tx
          .select({
            id: projects.id,
            customerName: projects.customerName,
          })
          .from(projects)
          .where(eq(projects.id, projectId))
          .limit(1);
        
        // Get template name
        const [template] = await tx
          .select({ name: mapTemplates.name })
          .from(mapTemplates)
          .where(eq(mapTemplates.id, templateId))
          .limit(1);
        
        // Generate MAP name using convention: MAP#<ProjectID> - <CustomerName> - <DateCreated>
        const createdDate = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        });
        const customerName = project?.customerName || 'Unknown Customer';
        const mapName = `MAP#${projectId} - ${customerName} - ${createdDate}`;
        
        // Insert project MAP metadata
        await tx
          .insert(projectMaps)
          .values({
            projectId,
            mapName,
            templateName: template?.name || null,
          });

        console.log(`Successfully created project MAP for project ${projectId} and tracked template usage`);
        return true;
      });
    } catch (error) {
      console.error(`Error creating project MAP from template:`, error);
      return false;
    }
  }

  async getMapPhase(id: number): Promise<MapPhase | undefined> {
    const [phase] = await this.db
      .select()
      .from(mapPhases)
      .where(eq(mapPhases.id, id))
      .limit(1);
    return phase;
  }

  async getMapStep(id: number): Promise<MapStep | undefined> {
    const [step] = await this.db
      .select()
      .from(mapSteps)
      .where(eq(mapSteps.id, id))
      .limit(1);
    return step;
  }

  async getMapTask(id: number): Promise<MapTask | undefined> {
    const [task] = await this.db
      .select()
      .from(mapTasks)
      .where(eq(mapTasks.id, id))
      .limit(1);
    return task as MapTask | undefined;
  }

  async updateMapPhase(id: number, updates: Partial<InsertMapPhase>, userId: string = 'system'): Promise<MapPhase> {
    // Fetch the old phase to compare assignment values
    const oldPhase = await this.getMapPhase(id);
    if (!oldPhase) {
      throw new Error(`Phase not found: ${id}`);
    }
    
    // Update the phase
    const [updatedPhase] = await this.db
      .update(mapPhases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mapPhases.id, id))
      .returning();
    
    // Track assignment overrides and trigger cascades
    const assignmentFields = ['teamOwned', 'assignedToCustomerUserId', 'assignedToTeamId', 'assignedToUserId', 'additionalInternalUserId'] as const;
    let assignmentChanged = false;
    
    for (const field of assignmentFields) {
      if (updates[field] !== undefined && updates[field] !== oldPhase[field]) {
        // Track that this assignment field was manually changed
        await this.trackAssignmentOverride('map_phase', id, field, userId, updatedPhase.projectId);
        assignmentChanged = true;
      }
    }
    
    // If any assignment changed, cascade to steps
    if (assignmentChanged) {
      const config = await this.getProjectAutomationConfigWithFallback(updatedPhase.projectId);
      await this.cascadeAssignmentsToSteps(id, config, userId);
    }
    
    // Check for cascading status updates to steps
    if (updates.status && ['blocked', 'at_risk', 'deferred', 'stalled'].includes(updates.status)) {
      const config = await this.getProjectAutomationConfigWithFallback(updatedPhase.projectId);
      await this.cascadeStatusToSteps(id, updates.status, config, userId);
    }
    
    return updatedPhase;
  }

  async updateMapStep(id: number, updates: Partial<InsertMapStep>, userId: string = 'system'): Promise<MapStep> {
    // Fetch the old step to compare assignment values
    const oldStep = await this.getMapStep(id);
    if (!oldStep) {
      throw new Error(`Step not found: ${id}`);
    }
    
    // Update the step
    const [updatedStep] = await this.db
      .update(mapSteps)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mapSteps.id, id))
      .returning();
    
    // Track assignment overrides and trigger cascades
    const assignmentFields = ['teamOwned', 'assignedToCustomerUserId', 'assignedToTeamId', 'assignedToUserId', 'additionalInternalUserId'] as const;
    let assignmentChanged = false;
    
    for (const field of assignmentFields) {
      if (updates[field] !== undefined && updates[field] !== oldStep[field]) {
        // Track that this assignment field was manually changed
        await this.trackAssignmentOverride('map_step', id, field, userId, updatedStep.projectId);
        assignmentChanged = true;
      }
    }
    
    // If any assignment changed, cascade to tasks
    if (assignmentChanged) {
      const config = await this.getProjectAutomationConfigWithFallback(updatedStep.projectId);
      await this.cascadeAssignmentsToTasks(id, config, userId);
    }
    
    // Get config once for both automation checks
    const config = await this.getProjectAutomationConfigWithFallback(updatedStep.projectId);
    
    // Check for cascading status updates to tasks
    if (updates.status && ['blocked', 'at_risk', 'deferred', 'stalled'].includes(updates.status)) {
      await this.cascadeStatusToTasks(id, updates.status, config, userId);
    }
    
    // Check for phase auto-completion if step was just completed
    if (updates.status === 'complete' && updatedStep.phaseId) {
      const shouldAutoComplete = await this.checkPhaseAutoCompletion(updatedStep.phaseId, config);
      
      if (shouldAutoComplete) {
        // Stamp the date so the plan can show how early or late the phase finished.
        await this.updateMapPhase(updatedStep.phaseId, { status: 'complete', completedDate: new Date() }, userId);
      }
    }
    
    return updatedStep;
  }

  async updateMapTask(id: number, updates: Partial<InsertMapTask>, userId: string = 'system'): Promise<MapTask> {
    // Fetch the old task to compare assignment values
    const oldTask = await this.getMapTask(id);
    if (!oldTask) {
      throw new Error(`Task not found: ${id}`);
    }
    
    // Update the task
    const [updatedTask] = await this.db
      .update(mapTasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(mapTasks.id, id))
      .returning() as MapTask[];
    
    // Track assignment overrides (tasks have no children to cascade to)
    const assignmentFields = ['teamOwned', 'assignedToCustomerUserId', 'assignedToTeamId', 'assignedToUserId', 'additionalInternalUserId'] as const;
    
    for (const field of assignmentFields) {
      if (updates[field] !== undefined && updates[field] !== oldTask[field]) {
        // Track that this assignment field was manually changed
        await this.trackAssignmentOverride('map_task', id, field, userId, updatedTask.projectId);
      }
    }
    
    // Check for step auto-completion if task was just completed
    if (updates.status === 'complete' && updatedTask.stepId) {
      const config = await this.getProjectAutomationConfigWithFallback(updatedTask.projectId);
      const shouldAutoComplete = await this.checkStepAutoCompletion(updatedTask.stepId, config);
      
      if (shouldAutoComplete) {
        // Stamp the date so the plan can show how early or late the step finished.
        await this.updateMapStep(updatedTask.stepId, { status: 'complete', completedDate: new Date() }, userId);
      }
    }
    
    return updatedTask;
  }

  async deleteMapPhase(id: number): Promise<{ projectId: number; phaseName: string }> {
    // Get the phase first to return info and find associated project
    const phase = await this.getMapPhase(id);
    if (!phase) {
      throw new Error('Phase not found');
    }

    // Get all steps in this phase
    const stepsInPhase = await this.db
      .select()
      .from(mapSteps)
      .where(eq(mapSteps.phaseId, id));

    // Delete all tasks in all steps of this phase (cascade)
    for (const step of stepsInPhase) {
      await this.db
        .delete(mapTasks)
        .where(eq(mapTasks.stepId, step.id));
    }

    // Delete all steps in this phase
    await this.db
      .delete(mapSteps)
      .where(eq(mapSteps.phaseId, id));

    // Delete the phase (assignments are stored in columns, no cleanup needed)
    await this.db
      .delete(mapPhases)
      .where(eq(mapPhases.id, id));

    // Renumber remaining phases in the same project
    const remainingPhases = await this.db
      .select()
      .from(mapPhases)
      .where(eq(mapPhases.projectId, phase.projectId))
      .orderBy(mapPhases.orderIndex);

    for (let i = 0; i < remainingPhases.length; i++) {
      if (remainingPhases[i].orderIndex !== i + 1) {
        await this.db
          .update(mapPhases)
          .set({ orderIndex: i + 1 })
          .where(eq(mapPhases.id, remainingPhases[i].id));
      }
    }

    // Renumber global step numbers for the entire project
    await this.renumberProjectSteps(phase.projectId);

    return { projectId: phase.projectId, phaseName: phase.name };
  }

  async deleteMapStep(id: number): Promise<{ projectId: number; stepName: string }> {
    // Get the step first to return info
    const step = await this.getMapStep(id);
    if (!step) {
      throw new Error('Step not found');
    }

    // Delete all tasks in this step (cascade)
    await this.db
      .delete(mapTasks)
      .where(eq(mapTasks.stepId, id));

    // Delete the step (assignments are stored in columns, no cleanup needed)
    await this.db
      .delete(mapSteps)
      .where(eq(mapSteps.id, id));

    // Renumber remaining steps in the same phase
    const remainingSteps = await this.db
      .select()
      .from(mapSteps)
      .where(eq(mapSteps.phaseId, step.phaseId))
      .orderBy(mapSteps.orderIndex);

    for (let i = 0; i < remainingSteps.length; i++) {
      if (remainingSteps[i].orderIndex !== i) {
        await this.db
          .update(mapSteps)
          .set({ orderIndex: i })
          .where(eq(mapSteps.id, remainingSteps[i].id));
      }
    }

    // Renumber global step numbers for the entire project
    await this.renumberProjectSteps(step.projectId);

    return { projectId: step.projectId, stepName: step.name };
  }

  async deleteMapTask(id: number): Promise<{ projectId: number; taskName: string }> {
    // Get the task first to return info
    const task = await this.getMapTask(id);
    if (!task) {
      throw new Error('Task not found');
    }

    // Get the step to find project ID
    const step = await this.getMapStep(task.stepId);
    if (!step) {
      throw new Error('Associated step not found');
    }

    // Delete the task (assignments are stored in columns, no cleanup needed)
    await this.db
      .delete(mapTasks)
      .where(eq(mapTasks.id, id));

    // Renumber remaining tasks in the same step
    const remainingTasks = await this.db
      .select()
      .from(mapTasks)
      .where(eq(mapTasks.stepId, task.stepId))
      .orderBy(mapTasks.orderIndex);

    for (let i = 0; i < remainingTasks.length; i++) {
      if (remainingTasks[i].orderIndex !== i) {
        await this.db
          .update(mapTasks)
          .set({ orderIndex: i })
          .where(eq(mapTasks.id, remainingTasks[i].id));
      }
    }

    return { projectId: step.projectId, taskName: task.name };
  }

  async renumberProjectSteps(_projectId: number): Promise<void> {
    // The previous implementation wrote a `globalStepNumber` column on
    // `mapSteps` that no longer exists in the current schema. Step ordering
    // is handled exclusively via per-phase `orderIndex` today, so global
    // renumbering is intentionally a no-op. Callers (deletePhase / deleteStep)
    // are kept for API stability.
  }
}
