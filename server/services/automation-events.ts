// App event emission → subscribed webhooks (n8n option B, PR 2).
//
// Before this module the app registered ~109 trigger keys but emitted only
// two of them, so n8n (or any webhook receiver) never heard about project,
// MAP, criteria or risk changes. Route handlers now call the emit* helpers
// below after a successful write; each event is delivered to every active
// webhook whose `subscribed_events` contains the trigger key
// (webhookService.deliverToSubscribers).
//
// Scope, deliberately:
//   • Fire-and-forget. Emission never blocks or fails the HTTP response;
//     delivery (with its retry backoff) runs after the handler returns.
//   • Webhook subscribers and in-process listeners. Workflow Automation
//     rules are not evaluated here in general; only MAP events run them,
//     through the listener in services/map-email-rules.ts.

import { getSystemTrigger } from "../email/email-trigger-registry";
import { webhookService } from "../webhooks/webhook-service";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { isMapItemComplete } from "@shared/map-status";

export interface AutomationEvent {
  triggerKey: string;
  projectId?: number;
  userId?: string;
  metadata?: Record<string, unknown>;
}

type AutomationEventListener = (event: AutomationEvent) => void;

const listeners: AutomationEventListener[] = [];

/**
 * In-process listeners, run after the response like webhook delivery. The
 * personal notifications service (services/notifications.ts) registers here
 * at boot; a listener that throws is logged and never affects the others.
 */
export function onAutomationEvent(listener: AutomationEventListener): () => void {
  listeners.push(listener);
  return () => {
    const i = listeners.indexOf(listener);
    if (i >= 0) listeners.splice(i, 1);
  };
}

/** Emit one event to subscribed webhooks and in-process listeners. Never throws. */
export function emitAutomationEvent(event: AutomationEvent): void {
  // Demo Mode writes fake data; webhook receivers (n8n, ImpactIQ) and
  // in-process listeners (bell notifications, MAP email rules) act on real
  // people and systems, so nothing from a demo request is emitted.
  if (isCurrentRequestDemo()) return;
  if (!getSystemTrigger(event.triggerKey)) {
    console.warn(`[automation-events] Unknown trigger key "${event.triggerKey}" — not emitted`);
    return;
  }

  const timestamp = new Date();
  setImmediate(() => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error(`[automation-events] Listener for "${event.triggerKey}" failed:`, err);
      }
    }
    webhookService
      .deliverToSubscribers({
        triggerKey: event.triggerKey,
        projectId: event.projectId,
        timestamp,
        metadata: {
          ...event.metadata,
          // Nested copy so templates using {{json metadata}} get the payload.
          metadata: event.metadata ?? {},
          userId: event.userId ?? null,
          triggerKey: event.triggerKey,
          occurredAt: timestamp.toISOString(),
        },
      })
      .catch((err: unknown) => {
        console.error(`[automation-events] Delivery for "${event.triggerKey}" failed:`, err);
      });
  });
}

type ProjectLike = {
  id: number;
  solutionName?: string | null;
  customerName?: string | null;
  status?: string | null;
  risk?: string | null;
  ranking?: string | null;
  primaryEngineerId?: string | null;
};

function projectMetadata(project: ProjectLike): Record<string, unknown> {
  return {
    projectName: project.solutionName ?? null,
    customerName: project.customerName ?? null,
    projectStatus: project.status ?? null,
    riskLevel: project.risk ?? null,
    ranking: project.ranking ?? null,
    primaryEngineerId: project.primaryEngineerId ?? null,
  };
}

export function emitProjectCreated(project: ProjectLike, userId: string): void {
  emitAutomationEvent({
    triggerKey: "project.created",
    projectId: project.id,
    userId,
    metadata: projectMetadata(project),
  });
}

/**
 * Emits project.updated plus the narrower events the diff implies:
 * project.status_changed, risk.level_changed, project.assigned.
 */
export function emitProjectUpdated(before: ProjectLike, after: ProjectLike, userId: string): void {
  const base = projectMetadata(after);

  emitAutomationEvent({ triggerKey: "project.updated", projectId: after.id, userId, metadata: base });

  if ((before.status ?? null) !== (after.status ?? null)) {
    emitAutomationEvent({
      triggerKey: "project.status_changed",
      projectId: after.id,
      userId,
      metadata: { ...base, oldStatus: before.status ?? null, newStatus: after.status ?? null },
    });
  }
  if ((before.risk ?? null) !== (after.risk ?? null)) {
    emitAutomationEvent({
      triggerKey: "risk.level_changed",
      projectId: after.id,
      userId,
      metadata: { ...base, oldRiskLevel: before.risk ?? null, newRiskLevel: after.risk ?? null },
    });
  }
  if (after.primaryEngineerId && before.primaryEngineerId !== after.primaryEngineerId) {
    emitAutomationEvent({
      triggerKey: "project.assigned",
      projectId: after.id,
      userId,
      metadata: { ...base, previousEngineerId: before.primaryEngineerId ?? null },
    });
  }
}

export type MapItemType = "phase" | "step" | "task";

type MapItemLike = {
  id: number;
  name?: string | null;
  status?: string | null;
  assignedToUserId?: string | null;
  assignedToCustomerUserId?: string | null;
  assignedToTeamId?: number | null;
  dueDate?: Date | string | null;
};

/**
 * Emits map.<type>.status_changed / .completed / .assigned for a MAP
 * phase, step or task update, based on what changed.
 */
export function emitMapItemUpdated(
  type: MapItemType,
  projectId: number,
  before: MapItemLike,
  after: MapItemLike,
  userId: string,
): void {
  const metadata = {
    [`${type}Id`]: after.id,
    [`${type}Name`]: after.name ?? null,
    [`${type}Status`]: after.status ?? null,
    assignedTo: after.assignedToUserId ?? after.assignedToCustomerUserId ?? null,
    dueDate: after.dueDate ? new Date(after.dueDate).toISOString() : null,
  };

  if ((before.status ?? null) !== (after.status ?? null)) {
    emitAutomationEvent({
      triggerKey: `map.${type}.status_changed`,
      projectId,
      userId,
      metadata: { ...metadata, oldStatus: before.status ?? null, newStatus: after.status ?? null },
    });
    if (isMapItemComplete(after.status) && !isMapItemComplete(before.status)) {
      emitAutomationEvent({ triggerKey: `map.${type}.completed`, projectId, userId, metadata });
    }
  }

  const beforeAssignee = before.assignedToUserId ?? before.assignedToCustomerUserId ?? null;
  const afterAssignee = after.assignedToUserId ?? after.assignedToCustomerUserId ?? null;
  if (afterAssignee && afterAssignee !== beforeAssignee) {
    emitAutomationEvent({
      triggerKey: `map.${type}.assigned`,
      projectId,
      userId,
      metadata: { ...metadata, previousAssignee: beforeAssignee },
    });
  }

  // "Our team" assignment. A separate key so Workflow Automation rules written
  // for a person (map.<type>.assigned) never fire with no person to email; the
  // notification listener tells the team's members instead.
  const beforeTeam = before.assignedToTeamId ?? null;
  const afterTeam = after.assignedToTeamId ?? null;
  if (afterTeam !== null && afterTeam !== beforeTeam) {
    emitAutomationEvent({
      triggerKey: `map.${type}.team_assigned`,
      projectId,
      userId,
      metadata: { ...metadata, assignedTeamId: afterTeam, previousTeamId: beforeTeam },
    });
  }
}

type CriterionLike = { id: number; projectId?: number | null; status?: string | null; criterion?: string | null };

/** Emits criteria.updated, plus criteria.completed on a transition to a completed state. */
export function emitCriterionUpdated(before: CriterionLike | undefined, after: CriterionLike, userId: string): void {
  const metadata = {
    criterionId: after.id,
    criterionName: after.criterion ?? null,
    criterionStatus: after.status ?? null,
    oldStatus: before?.status ?? null,
  };
  const projectId = after.projectId ?? undefined;

  emitAutomationEvent({ triggerKey: "criteria.updated", projectId, userId, metadata });

  // success-criteria-form.tsx uses "complete"; "completed" kept for imports.
  const completedStates = new Set(["complete", "completed"]);
  const nowCompleted = !!after.status && completedStates.has(after.status.toLowerCase());
  const wasCompleted = !!before?.status && completedStates.has(before.status.toLowerCase());
  if (nowCompleted && !wasCompleted) {
    emitAutomationEvent({ triggerKey: "criteria.completed", projectId, userId, metadata });
  }
}
