// Value journey — mixin for DatabaseStorage.
//
// Reads and writes behind the project's value journey (shared/value-journey.ts):
//   - journey_stages: the admin's stage list (Template Management › Value Journey)
//   - the project journey: MAP phases grouped by stage, with task counts and
//     the success criteria tested in each phase
//   - criteria_agreements: the customer's sign-off on the success criteria
//   - project_handoff_contacts: the warm handoff team
//   - map_task_criteria: which MAP tasks test which criteria
//
// Routes (server/routes/value-journey-routes.ts) check project access and
// validate input before calling these; this layer keeps rows consistent
// (ids from another project are refused, only one stage is the agreement gate).
import { db } from "../db";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import {
  criteriaAgreements,
  journeyStages,
  mapPhases,
  mapTaskCriteria,
  mapTemplatePhases,
  mapTasks,
  projectHandoffContacts,
  successCriteria,
  users,
} from "@shared/schema";
import type { AgreedCriterion, CriteriaAgreement, JourneyStage } from "@shared/schema";
import {
  agreementSnapshot,
  agreementStatus,
  changesSinceAgreement,
  computeJourney,
  type AgreementChanges,
  type AgreementCriterionInput,
  type AgreementStatus,
  type ComputedJourneyStage,
  type JourneyStageInput,
} from "@shared/value-journey";
import { isMapItemComplete } from "@shared/map-status";

/** Why a value journey write was refused; routes map it to a 4xx. */
export class ValueJourneyError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
    this.name = "ValueJourneyError";
  }
}

export interface AgreementPerson {
  id: string;
  name: string | null;
  email: string | null;
}

export interface CriteriaAgreementView {
  id: number;
  requestedAt: string;
  requestedBy: AgreementPerson | null;
  recipients: AgreementPerson[];
  agreedAt: string | null;
  agreedByUserId: string | null;
  agreedByName: string | null;
  agreedByTitle: string | null;
  criteriaSnapshot: AgreedCriterion[] | null;
}

export interface CriteriaAgreementState {
  status: AgreementStatus;
  /** The newest request, agreed or not. */
  current: CriteriaAgreementView | null;
  /** The last agreement the customer signed (may be older than `current`). */
  lastAgreed: CriteriaAgreementView | null;
  /** Changes since `lastAgreed`; null when nothing was agreed yet. */
  changes: AgreementChanges | null;
  /** Every request, newest first. */
  history: CriteriaAgreementView[];
}

export interface ProjectJourney {
  stages: ComputedJourneyStage[];
  agreement: {
    status: AgreementStatus;
    agreedAt: string | null;
    agreedByName: string | null;
    requestedAt: string | null;
  };
}

export interface HandoffContactView {
  userId: string;
  responsibility: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  /** False when the user was archived since. */
  found: boolean;
}

export interface MapCriterionView {
  id: number;
  lineNumber: number | null;
  productName: string | null;
  criterion: string | null;
  status: string | null;
  priority: string;
  mapPhaseId: number | null;
  isActive: boolean | null;
}

function personName(row: { firstName: string | null; lastName: string | null } | undefined): string | null {
  if (!row) return null;
  const name = [row.firstName, row.lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  return name || null;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const criterionColumns = {
  id: successCriteria.id,
  lineNumber: successCriteria.lineNumber,
  productName: successCriteria.productName,
  componentName: successCriteria.componentName,
  criterion: successCriteria.criterion,
  expectedOutcome: successCriteria.expectedOutcome,
  priority: successCriteria.priority,
  status: successCriteria.status,
  isActive: successCriteria.isActive,
  mapPhaseId: successCriteria.mapPhaseId,
};

export class ValueJourneyStorageMixin {
  // --- Stages ---------------------------------------------------------------

  async listJourneyStages(): Promise<JourneyStage[]> {
    return db.select().from(journeyStages).orderBy(asc(journeyStages.orderIndex), asc(journeyStages.id));
  }

  /** Every stage with how many MAP templates and template phases use it. */
  async listJourneyStagesWithUsage(): Promise<Array<JourneyStage & { templateCount: number; phaseCount: number }>> {
    const [stages, usage] = await Promise.all([
      this.listJourneyStages(),
      db
        .select({
          stageId: mapTemplatePhases.stageId,
          phaseCount: sql<number>`count(*)::int`,
          templateCount: sql<number>`count(distinct ${mapTemplatePhases.templateId})::int`,
        })
        .from(mapTemplatePhases)
        .groupBy(mapTemplatePhases.stageId),
    ]);
    const byStage = new Map(usage.map((row) => [row.stageId, row]));
    return stages.map((stage) => ({
      ...stage,
      templateCount: Number(byStage.get(stage.id)?.templateCount ?? 0),
      phaseCount: Number(byStage.get(stage.id)?.phaseCount ?? 0),
    }));
  }

  async createJourneyStage(input: JourneyStageInput): Promise<JourneyStage> {
    return db.transaction(async (tx) => {
      const [{ next }] = await tx
        .select({ next: sql<number>`coalesce(max(${journeyStages.orderIndex}) + 1, 0)` })
        .from(journeyStages);
      if (input.agreementGate) {
        await tx.update(journeyStages).set({ agreementGate: false });
      }
      const [row] = await tx
        .insert(journeyStages)
        .values({
          name: input.name,
          description: input.description ?? null,
          iconName: input.iconName,
          color: input.color,
          agreementGate: input.agreementGate ?? false,
          orderIndex: Number(next),
        })
        .returning();
      return row;
    });
  }

  async updateJourneyStage(id: number, input: JourneyStageInput): Promise<JourneyStage | undefined> {
    return db.transaction(async (tx) => {
      // One stage at most waits for the customer's agreement.
      if (input.agreementGate) {
        await tx.update(journeyStages).set({ agreementGate: false }).where(ne(journeyStages.id, id));
      }
      const [row] = await tx
        .update(journeyStages)
        .set({
          name: input.name,
          description: input.description ?? null,
          iconName: input.iconName,
          color: input.color,
          ...(input.agreementGate !== undefined ? { agreementGate: input.agreementGate } : {}),
          updatedAt: new Date(),
        })
        .where(eq(journeyStages.id, id))
        .returning();
      return row;
    });
  }

  /** Phases tagged with the stage keep their place and lose the tag (FK set null). */
  async deleteJourneyStage(id: number): Promise<boolean> {
    const deleted = await db.delete(journeyStages).where(eq(journeyStages.id, id)).returning({ id: journeyStages.id });
    return deleted.length > 0;
  }

  /** Sets the stage order; `ids` must name every stage once. */
  async reorderJourneyStages(ids: number[]): Promise<JourneyStage[]> {
    return db.transaction(async (tx) => {
      const existing = await tx.select({ id: journeyStages.id }).from(journeyStages);
      const known = new Set(existing.map((row) => row.id));
      if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((id) => !known.has(id))) {
        throw new ValueJourneyError("Send every stage id exactly once", 400);
      }
      for (const [index, id] of ids.entries()) {
        await tx.update(journeyStages).set({ orderIndex: index, updatedAt: new Date() }).where(eq(journeyStages.id, id));
      }
      return tx.select().from(journeyStages).orderBy(asc(journeyStages.orderIndex), asc(journeyStages.id));
    });
  }

  async journeyStageExists(id: number): Promise<boolean> {
    const [row] = await db.select({ id: journeyStages.id }).from(journeyStages).where(eq(journeyStages.id, id)).limit(1);
    return !!row;
  }

  // --- Criteria on the MAP --------------------------------------------------

  /** The project's criteria as the MAP drawer and journey use them. */
  async listProjectCriteriaForMap(projectId: number): Promise<MapCriterionView[]> {
    return db
      .select({
        id: successCriteria.id,
        lineNumber: successCriteria.lineNumber,
        productName: successCriteria.productName,
        criterion: successCriteria.criterion,
        status: successCriteria.status,
        priority: successCriteria.priority,
        mapPhaseId: successCriteria.mapPhaseId,
        isActive: successCriteria.isActive,
      })
      .from(successCriteria)
      .where(eq(successCriteria.projectId, projectId))
      .orderBy(asc(successCriteria.lineNumber), asc(successCriteria.id));
  }

  async listProjectTaskCriteria(projectId: number): Promise<Array<{ taskId: number; criterionId: number }>> {
    return db
      .select({ taskId: mapTaskCriteria.taskId, criterionId: mapTaskCriteria.criterionId })
      .from(mapTaskCriteria)
      .where(eq(mapTaskCriteria.projectId, projectId))
      .orderBy(asc(mapTaskCriteria.taskId), asc(mapTaskCriteria.criterionId));
  }

  /** Whether a MAP phase belongs to the project. */
  async mapPhaseInProject(phaseId: number, projectId: number): Promise<boolean> {
    const [row] = await db
      .select({ id: mapPhases.id })
      .from(mapPhases)
      .where(and(eq(mapPhases.id, phaseId), eq(mapPhases.projectId, projectId)))
      .limit(1);
    return !!row;
  }

  /**
   * Replaces the criteria a task tests. Every criterion must belong to the
   * task's project. A linked criterion with no phase yet takes the task's
   * phase, so it shows under the right stage. Returns the task's criterion ids.
   */
  async setTaskCriteria(taskId: number, criterionIds: number[]): Promise<{ projectId: number; criterionIds: number[] }> {
    return db.transaction(async (tx) => {
      const [task] = await tx
        .select({ id: mapTasks.id, projectId: mapTasks.projectId, phaseId: mapTasks.phaseId })
        .from(mapTasks)
        .where(eq(mapTasks.id, taskId))
        .limit(1);
      if (!task) throw new ValueJourneyError("Task not found", 404);

      const ids = Array.from(new Set(criterionIds));
      if (ids.length > 0) {
        const found = await tx
          .select({ id: successCriteria.id })
          .from(successCriteria)
          .where(and(eq(successCriteria.projectId, task.projectId), inArray(successCriteria.id, ids)));
        if (found.length !== ids.length) {
          throw new ValueJourneyError("Every criterion must belong to this project", 400);
        }
      }

      await tx.delete(mapTaskCriteria).where(eq(mapTaskCriteria.taskId, taskId));
      if (ids.length > 0) {
        await tx
          .insert(mapTaskCriteria)
          .values(ids.map((criterionId) => ({ projectId: task.projectId, taskId, criterionId })));
        await tx
          .update(successCriteria)
          .set({ mapPhaseId: task.phaseId, updatedAt: new Date() })
          .where(and(inArray(successCriteria.id, ids), isNull(successCriteria.mapPhaseId)));
      }
      return { projectId: task.projectId, criterionIds: ids };
    });
  }

  // --- Journey --------------------------------------------------------------

  async getProjectJourney(projectId: number): Promise<ProjectJourney> {
    const [stages, phases, criteria, taskRows, agreement] = await Promise.all([
      this.listJourneyStages(),
      db
        .select({
          id: mapPhases.id,
          name: mapPhases.name,
          description: mapPhases.description,
          orderIndex: mapPhases.orderIndex,
          status: mapPhases.status,
          stageId: mapPhases.stageId,
          dueDate: mapPhases.dueDate,
          completedDate: mapPhases.completedDate,
        })
        .from(mapPhases)
        .where(eq(mapPhases.projectId, projectId)),
      db.select(criterionColumns).from(successCriteria).where(eq(successCriteria.projectId, projectId)),
      db
        .select({ phaseId: mapTasks.phaseId, status: mapTasks.status })
        .from(mapTasks)
        .where(eq(mapTasks.projectId, projectId)),
      this.getCriteriaAgreementState(projectId),
    ]);

    const counts = new Map<number, { phaseId: number; total: number; done: number }>();
    for (const task of taskRows) {
      if (task.status === "cancelled") continue;
      const entry = counts.get(task.phaseId) ?? { phaseId: task.phaseId, total: 0, done: 0 };
      entry.total += 1;
      if (isMapItemComplete(task.status)) entry.done += 1;
      counts.set(task.phaseId, entry);
    }

    return {
      stages: computeJourney({ stages, phases, criteria, taskCounts: [...counts.values()] }),
      agreement: {
        status: agreement.status,
        agreedAt: agreement.lastAgreed?.agreedAt ?? null,
        agreedByName: agreement.lastAgreed?.agreedByName ?? null,
        requestedAt: agreement.current?.requestedAt ?? null,
      },
    };
  }

  // --- Criteria agreement ---------------------------------------------------

  private async criteriaForAgreement(projectId: number): Promise<AgreementCriterionInput[]> {
    return db.select(criterionColumns).from(successCriteria).where(eq(successCriteria.projectId, projectId));
  }

  async getCriteriaAgreementState(projectId: number): Promise<CriteriaAgreementState> {
    const rows = await db
      .select()
      .from(criteriaAgreements)
      .where(eq(criteriaAgreements.projectId, projectId))
      .orderBy(desc(criteriaAgreements.requestedAt), desc(criteriaAgreements.id));

    const userIds = new Set<string>();
    for (const row of rows) {
      if (row.requestedByUserId) userIds.add(row.requestedByUserId);
      for (const id of row.recipientUserIds ?? []) userIds.add(id);
    }
    const people = userIds.size
      ? await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(inArray(users.id, [...userIds]))
      : [];
    const byId = new Map(people.map((person) => [person.id, person]));
    const person = (id: string | null): AgreementPerson | null => {
      if (!id) return null;
      const row = byId.get(id);
      return { id, name: personName(row), email: row?.email ?? null };
    };

    const history: CriteriaAgreementView[] = rows.map((row: CriteriaAgreement) => ({
      id: row.id,
      requestedAt: isoOrNull(row.requestedAt) ?? new Date(0).toISOString(),
      requestedBy: person(row.requestedByUserId),
      recipients: (row.recipientUserIds ?? []).map((id) => person(id)).filter((p): p is AgreementPerson => !!p),
      agreedAt: isoOrNull(row.agreedAt),
      agreedByUserId: row.agreedByUserId,
      agreedByName: row.agreedByName,
      agreedByTitle: row.agreedByTitle,
      criteriaSnapshot: row.criteriaSnapshot ?? null,
    }));

    const current = history[0] ?? null;
    const lastAgreed = history.find((row) => row.agreedAt !== null) ?? null;
    const changes = lastAgreed?.criteriaSnapshot
      ? changesSinceAgreement(lastAgreed.criteriaSnapshot, await this.criteriaForAgreement(projectId))
      : null;
    // A new request after an agreement reads as "sent" until it is agreed.
    const status = current && !current.agreedAt ? "sent" : agreementStatus(current, changes);
    return { status, current, lastAgreed, changes, history };
  }

  /** Sends the criteria for agreement: a new request row, replacing an open one. */
  async requestCriteriaAgreement(projectId: number, requestedByUserId: string, recipientUserIds: string[]): Promise<void> {
    await db.transaction(async (tx) => {
      // An open request that nobody agreed to yet is replaced, not kept.
      await tx
        .delete(criteriaAgreements)
        .where(and(eq(criteriaAgreements.projectId, projectId), isNull(criteriaAgreements.agreedAt)));
      await tx.insert(criteriaAgreements).values({
        projectId,
        requestedByUserId,
        recipientUserIds: Array.from(new Set(recipientUserIds)),
      });
    });
  }

  /**
   * Records the customer's agreement on the open request and freezes the
   * criteria as they are now. Refused when nothing is waiting for agreement
   * or the project has no criteria to agree to.
   */
  async agreeToCriteria(
    projectId: number,
    agreedByUserId: string,
    name: string,
    title: string | null,
  ): Promise<CriteriaAgreement> {
    return db.transaction(async (tx) => {
      const [open] = await tx
        .select()
        .from(criteriaAgreements)
        .where(and(eq(criteriaAgreements.projectId, projectId), isNull(criteriaAgreements.agreedAt)))
        .orderBy(desc(criteriaAgreements.requestedAt))
        .limit(1);
      if (!open) throw new ValueJourneyError("There is no request waiting for your agreement", 409);

      const snapshot = agreementSnapshot(
        await tx.select(criterionColumns).from(successCriteria).where(eq(successCriteria.projectId, projectId)),
      );
      if (snapshot.length === 0) throw new ValueJourneyError("This project has no success criteria to agree to", 409);

      const [row] = await tx
        .update(criteriaAgreements)
        .set({
          agreedByUserId,
          agreedByName: name,
          agreedByTitle: title || null,
          agreedAt: new Date(),
          criteriaSnapshot: snapshot,
        })
        .where(eq(criteriaAgreements.id, open.id))
        .returning();
      return row;
    });
  }

  // --- Handoff team ---------------------------------------------------------

  async getHandoffTeam(projectId: number): Promise<HandoffContactView[]> {
    const rows = await db
      .select({
        userId: projectHandoffContacts.userId,
        responsibility: projectHandoffContacts.responsibility,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        role: users.role,
        found: users.id,
      })
      .from(projectHandoffContacts)
      .leftJoin(users, eq(users.id, projectHandoffContacts.userId))
      .where(eq(projectHandoffContacts.projectId, projectId))
      .orderBy(asc(projectHandoffContacts.orderIndex), asc(projectHandoffContacts.id));
    return rows.map((row) => ({
      userId: row.userId,
      responsibility: row.responsibility,
      name: personName(row),
      email: row.email,
      role: row.role,
      found: row.found !== null,
    }));
  }

  /** Replaces the handoff team. Every member must be an existing user. */
  async setHandoffTeam(
    projectId: number,
    members: Array<{ userId: string; responsibility?: string | null }>,
  ): Promise<HandoffContactView[]> {
    const unique = members.filter((member, index) => members.findIndex((m) => m.userId === member.userId) === index);
    if (unique.length > 0) {
      const found = await db
        .select({ id: users.id })
        .from(users)
        .where(inArray(users.id, unique.map((member) => member.userId)));
      if (found.length !== unique.length) throw new ValueJourneyError("Every handoff member must be a user", 400);
    }
    await db.transaction(async (tx) => {
      await tx.delete(projectHandoffContacts).where(eq(projectHandoffContacts.projectId, projectId));
      if (unique.length > 0) {
        await tx.insert(projectHandoffContacts).values(
          unique.map((member, index) => ({
            projectId,
            userId: member.userId,
            responsibility: member.responsibility?.trim() || null,
            orderIndex: index,
          })),
        );
      }
    });
    return this.getHandoffTeam(projectId);
  }
}
