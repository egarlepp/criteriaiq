// Adding to a project's plan without a template — mixin for DatabaseStorage.
//
// Two writes the template flow (createProjectMapFromTemplate in map.ts)
// doesn't cover:
//   - addProjectMapItem: a phase, step or task added to a live MAP.
//   - createQuickPlan:   a blank plan with one phase and an optional list of
//                        steps, for small projects that need no template.
//
// New items start Not Started with no dates (a date the user didn't pick
// would only show up as overdue later). They take their customer-email
// switch from the item they sit under; a Quick plan starts with customer
// emails off, so a simple checklist never emails the customer by surprise.
//
// Demo Mode: every row takes is_demo from its project, so a plan built on a
// demo project is demo data (counted and removed by Wipe Demo Data) even when
// the write comes from outside a demo session.
import { and, eq, max } from "drizzle-orm";
import type { Database } from "../db";
import * as schema from "@shared/schema";
import type { MapPhase, MapStep, MapTask, ProjectMap } from "@shared/schema";
import type { MapItemKind } from "@shared/map-plan-items";

const { projects, mapPhases, mapSteps, mapTasks, projectMaps } = schema;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface NewProjectMapItem {
  kind: MapItemKind;
  /** The phase (for a step) or step (for a task) the item goes under; unused for a phase. */
  parentId: number | null;
  name: string;
  description: string | null;
  dueDate: Date | null;
}

export type CreatedMapItem =
  | { kind: "phase"; item: MapPhase }
  | { kind: "step"; item: MapStep }
  | { kind: "task"; item: MapTask };

/** Why an item could not be added: the parent is missing or belongs to another project. */
export class MapParentNotFoundError extends Error {
  constructor(kind: MapItemKind) {
    super(kind === "step" ? "Phase not found in this project" : "Step not found in this project");
    this.name = "MapParentNotFoundError";
  }
}

/** The usual plan name: MAP#<project id> - <customer> - <date created>. */
function defaultMapName(projectId: number, customerName: string | null | undefined): string {
  const created = new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
  return `MAP#${projectId} - ${customerName || "Unknown Customer"} - ${created}`;
}

export class MapPlanItemsStorageMixin {
  declare db: Database;

  /** The project's is_demo flag; false when the project doesn't exist. */
  async projectIsDemo(tx: Tx, projectId: number): Promise<boolean> {
    const [row] = await tx
      .select({ isDemo: projects.isDemo })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row?.isDemo ?? false;
  }

  /** Creates the project_maps row (the plan's name) when the project has none yet. */
  async ensureProjectMapRow(tx: Tx, projectId: number, mapName?: string): Promise<void> {
    const [existing] = await tx
      .select({ id: projectMaps.id })
      .from(projectMaps)
      .where(eq(projectMaps.projectId, projectId))
      .limit(1);
    if (existing) return;
    const [project] = await tx
      .select({ customerName: projects.customerName })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    await tx
      .insert(projectMaps)
      .values({ projectId, mapName: mapName?.trim() || defaultMapName(projectId, project?.customerName), templateName: null })
      .onConflictDoNothing({ target: projectMaps.projectId });
  }

  /**
   * Adds one phase, step or task to a project's plan, last in its parent.
   * Throws MapParentNotFoundError when the parent isn't in this project.
   */
  async addProjectMapItem(projectId: number, input: NewProjectMapItem): Promise<CreatedMapItem> {
    return await this.db.transaction(async (tx) => {
      await this.ensureProjectMapRow(tx, projectId);
      const base = {
        projectId,
        isDemo: await this.projectIsDemo(tx, projectId),
        name: input.name,
        description: input.description,
        status: "not_started",
        dueDate: input.dueDate,
      };

      if (input.kind === "phase") {
        const [last] = await tx
          .select({ orderIndex: max(mapPhases.orderIndex) })
          .from(mapPhases)
          .where(eq(mapPhases.projectId, projectId));
        const [first] = await tx
          .select({ sendExternalEmails: mapPhases.sendExternalEmails })
          .from(mapPhases)
          .where(eq(mapPhases.projectId, projectId))
          .orderBy(mapPhases.orderIndex)
          .limit(1);
        const [item] = await tx
          .insert(mapPhases)
          .values({
            ...base,
            orderIndex: (last?.orderIndex ?? -1) + 1,
            // Same customer-email setting as the rest of the plan; off on an empty plan.
            sendExternalEmails: first?.sendExternalEmails ?? false,
          })
          .returning();
        return { kind: "phase", item };
      }

      if (input.kind === "step") {
        const [phase] = await tx
          .select({ id: mapPhases.id, sendExternalEmails: mapPhases.sendExternalEmails })
          .from(mapPhases)
          .where(and(eq(mapPhases.id, input.parentId ?? -1), eq(mapPhases.projectId, projectId)))
          .limit(1);
        if (!phase) throw new MapParentNotFoundError("step");
        const [last] = await tx
          .select({ orderIndex: max(mapSteps.orderIndex) })
          .from(mapSteps)
          .where(eq(mapSteps.phaseId, phase.id));
        const [item] = await tx
          .insert(mapSteps)
          .values({
            ...base,
            phaseId: phase.id,
            orderIndex: (last?.orderIndex ?? -1) + 1,
            sendExternalEmails: phase.sendExternalEmails,
          })
          .returning();
        return { kind: "step", item };
      }

      const [step] = await tx
        .select({ id: mapSteps.id, phaseId: mapSteps.phaseId, sendExternalEmails: mapSteps.sendExternalEmails })
        .from(mapSteps)
        .where(and(eq(mapSteps.id, input.parentId ?? -1), eq(mapSteps.projectId, projectId)))
        .limit(1);
      if (!step) throw new MapParentNotFoundError("task");
      const [last] = await tx
        .select({ orderIndex: max(mapTasks.orderIndex) })
        .from(mapTasks)
        .where(eq(mapTasks.stepId, step.id));
      const [item] = await tx
        .insert(mapTasks)
        .values({
          ...base,
          phaseId: step.phaseId,
          stepId: step.id,
          orderIndex: (last?.orderIndex ?? -1) + 1,
          sendExternalEmails: step.sendExternalEmails,
        })
        .returning();
      return { kind: "task", item };
    });
  }

  /**
   * Starts a Quick plan: one phase and its steps, customer emails off, no
   * dates. Returns null when the project already has a plan.
   */
  async createQuickPlan(
    projectId: number,
    input: { phaseName: string; steps: readonly string[]; description?: string | null },
  ): Promise<{ phase: MapPhase; steps: MapStep[]; map: ProjectMap } | null> {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: mapPhases.id })
        .from(mapPhases)
        .where(eq(mapPhases.projectId, projectId))
        .limit(1);
      if (existing) return null;

      await this.ensureProjectMapRow(tx, projectId);
      const isDemo = await this.projectIsDemo(tx, projectId);
      const [phase] = await tx
        .insert(mapPhases)
        .values({
          projectId,
          isDemo,
          name: input.phaseName,
          description: input.description ?? null,
          orderIndex: 0,
          status: "not_started",
          sendExternalEmails: false,
        })
        .returning();
      const steps =
        input.steps.length === 0
          ? []
          : await tx
              .insert(mapSteps)
              .values(
                input.steps.map((name, index) => ({
                  projectId,
                  isDemo,
                  phaseId: phase.id,
                  name,
                  orderIndex: index,
                  status: "not_started",
                  sendExternalEmails: false,
                })),
              )
              .returning();
      const [map] = await tx.select().from(projectMaps).where(eq(projectMaps.projectId, projectId)).limit(1);
      return { phase, steps, map };
    });
  }
}
