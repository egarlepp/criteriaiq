// Personal in-app notifications, written from the app's automation events.
//
// The header bell lists these (server/routes/notifications-routes.ts) and the
// daily digest emails the unread ones (notification-digest-job.ts). Rows hold
// a `kind` and plain params, never rendered text, so the bell translates them.
//
// Who is told what:
//   • project.assigned           → the new primary engineer
//   • map.<phase|step|task>.assigned → the new assignee (internal or customer)
//   • map.<phase|step|task>.team_assigned → every member of the new "Our team"
//     (still only those who can open the project: a team never grants access)
//   • a MAP item due within 2 working days → its owner (map-due-soon.ts job)
//   • project.status_changed     → the project's internal team (status is internal)
//   • criteria.completed         → the internal team and the project's customer users
//   • support request status change → its submitter; new assignee → the assignee
//   • evaluation request submitted → the account's representative and engineer;
//     closed or reopened → the person who asked for it
//   • project message posted → the project's internal team and customer users
//   • a customer marks their to-do done → the project's internal team
//   • success criteria sent for agreement → the customer contacts chosen
//   • a customer agrees to the success criteria → the project's internal team
// The person who made the change is never told about it, and every recipient
// must still pass hasProjectAccess (projects) or hasCustomerAccess (requests),
// so an outside user only ever hears about records they can open.
import { storage } from "../storage";
import { hasProjectAccess } from "../lib/project-access";
import { hasCustomerAccess } from "../lib/customer-access";
import { isExternalRole } from "../lib/internal-access";
import { onAutomationEvent, type AutomationEvent } from "./automation-events";
import type { InsertUserNotification } from "@shared/schema";

export type NotificationKind =
  | "project_assigned"
  | "map_item_assigned"
  | "map_item_team_assigned"
  | "map_item_due_soon"
  | "project_status_changed"
  | "criterion_completed"
  | "support_request_status_changed"
  | "support_request_assigned"
  | "evaluation_request_submitted"
  | "evaluation_request_status_changed"
  | "account_link_exception_requested"
  | "outcome_requested"
  | "outcome_reminder"
  | "outcome_overdue"
  | "project_message_posted"
  | "customer_action_completed"
  | "criteria_agreement_requested"
  | "criteria_agreed";

export interface NotificationProject {
  id: number;
  solutionName?: string | null;
  customerName?: string | null;
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  supportingEngineers?: string[] | null;
  additionalSupportingTeam?: string[] | null;
  accountRepresentativeId?: string | null;
  opportunityEngineerId?: string | null;
  tccUserId?: string | null;
  customerUsers?: unknown;
}

export interface NotificationPlan {
  kind: NotificationKind;
  /** Candidate user ids before the actor, active and access checks. */
  candidates: string[];
  /** Only internal-role users may receive it. */
  internalOnly: boolean;
  /** Members of this team are added to the candidates at send time. */
  candidateTeamId?: number;
  params: Record<string, string | null>;
  linkPath: string;
}

const MAP_ASSIGNED = /^map\.(phase|step|task)\.assigned$/;
const MAP_TEAM_ASSIGNED = /^map\.(phase|step|task)\.team_assigned$/;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function internalTeamIds(project: NotificationProject): string[] {
  return [
    project.primaryEngineerId,
    project.specialistEngineerId,
    ...(project.supportingEngineers ?? []),
    ...(project.additionalSupportingTeam ?? []),
    project.accountRepresentativeId,
    project.opportunityEngineerId,
    project.tccUserId,
  ].filter((id): id is string => typeof id === "string" && id !== "");
}

export function customerUserIds(project: NotificationProject): string[] {
  if (!Array.isArray(project.customerUsers)) return [];
  return (project.customerUsers as Array<Record<string, unknown> | null>)
    .map((entry) => (entry ? str(entry.userId) ?? str(entry.id) : null))
    .filter((id): id is string => !!id);
}

/** What an event should produce, or null when it notifies nobody. Pure. */
export function planNotification(
  event: AutomationEvent,
  project: NotificationProject,
): NotificationPlan | null {
  const meta = event.metadata ?? {};
  const base = {
    projectName: project.solutionName ?? str(meta.projectName),
    customerName: project.customerName ?? str(meta.customerName),
  };
  const projectLink = `/project/${project.id}`;

  if (event.triggerKey === "project.assigned") {
    const assignee = str(meta.primaryEngineerId) ?? project.primaryEngineerId ?? null;
    if (!assignee) return null;
    return { kind: "project_assigned", candidates: [assignee], internalOnly: false, params: base, linkPath: projectLink };
  }

  const mapMatch = MAP_ASSIGNED.exec(event.triggerKey);
  if (mapMatch) {
    const itemType = mapMatch[1];
    const assignee = str(meta.assignedTo);
    if (!assignee) return null;
    return {
      kind: "map_item_assigned",
      candidates: [assignee],
      internalOnly: false,
      params: { ...base, itemType, itemName: str(meta[`${itemType}Name`]) },
      linkPath: `${projectLink}?tab=map`,
    };
  }

  const teamMatch = MAP_TEAM_ASSIGNED.exec(event.triggerKey);
  if (teamMatch) {
    const itemType = teamMatch[1];
    const teamId = typeof meta.assignedTeamId === "number" ? meta.assignedTeamId : null;
    if (teamId === null) return null;
    return {
      kind: "map_item_team_assigned",
      candidates: [],
      candidateTeamId: teamId,
      internalOnly: true,
      params: { ...base, itemType, itemName: str(meta[`${itemType}Name`]) },
      linkPath: `${projectLink}?tab=map`,
    };
  }

  if (event.triggerKey === "project.status_changed") {
    return {
      kind: "project_status_changed",
      candidates: internalTeamIds(project),
      internalOnly: true,
      params: { ...base, oldStatus: str(meta.oldStatus), newStatus: str(meta.newStatus) },
      linkPath: projectLink,
    };
  }

  if (event.triggerKey === "criteria.completed") {
    return {
      kind: "criterion_completed",
      candidates: [...internalTeamIds(project), ...customerUserIds(project)],
      internalOnly: false,
      params: { ...base, criterionName: str(meta.criterionName) },
      linkPath: `${projectLink}?tab=success-criteria`,
    };
  }

  return null;
}

/** Writes the notifications one event implies. Never throws. */
export async function notifyForEvent(event: AutomationEvent): Promise<number> {
  try {
    if (!event.projectId) return 0;
    const project = (await storage.getProjectById(event.projectId)) as NotificationProject | undefined;
    if (!project) return 0;
    const plan = planNotification(event, project);
    if (!plan) return 0;

    let teamMembers: string[] = [];
    if (plan.candidateTeamId !== undefined) {
      const team = await storage.getTeam(plan.candidateTeamId);
      if (!team) return 0;
      plan.params = { ...plan.params, teamName: team.name };
      teamMembers = await storage.listTeamMemberIds(plan.candidateTeamId);
    }
    const candidates = Array.from(new Set([...plan.candidates, ...teamMembers])).filter((id) => id !== event.userId);
    const rows: InsertUserNotification[] = [];
    for (const userId of candidates) {
      const user = await storage.getUser(userId);
      if (!user || user.isActive === false || user.isApproved === false) continue;
      if (plan.internalOnly && isExternalRole(user.role)) continue;
      if (!(await hasProjectAccess(user.id, user.role, user.email, project.id))) continue;
      rows.push({
        userId: user.id,
        kind: plan.kind,
        projectId: project.id,
        params: plan.params,
        linkPath: plan.linkPath,
        actorUserId: event.userId ?? null,
      });
    }
    return await storage.createUserNotifications(rows);
  } catch (err) {
    console.error(`[notifications] Couldn't write notifications for "${event.triggerKey}":`, err);
    return 0;
  }
}

const NOTIFYING_KEYS = new Set([
  "project.assigned",
  "project.status_changed",
  "criteria.completed",
  "map.phase.assigned",
  "map.step.assigned",
  "map.task.assigned",
  "map.phase.team_assigned",
  "map.step.team_assigned",
  "map.task.team_assigned",
]);

let registered = false;

/** Called once at boot. */
export function registerNotificationListener(): void {
  if (registered) return;
  registered = true;
  onAutomationEvent((event) => {
    if (!NOTIFYING_KEYS.has(event.triggerKey)) return;
    void notifyForEvent(event);
  });
}

/**
 * A notification to a project's people, sent straight from a route rather
 * than from an automation event (project messages, customer to-dos). Same
 * rules as the event-driven ones: never the actor, only active approved
 * users, only people who can open the project, and staff only when
 * `includeCustomers` is false. Never throws.
 */
export async function notifyProjectPeople(input: {
  projectId: number;
  kind: NotificationKind;
  actorUserId: string;
  includeCustomers: boolean;
  params: Record<string, string | null>;
  linkPath: string;
}): Promise<number> {
  try {
    const project = (await storage.getProjectById(input.projectId)) as NotificationProject | undefined;
    if (!project) return 0;
    const candidates = Array.from(
      new Set([...internalTeamIds(project), ...(input.includeCustomers ? customerUserIds(project) : [])]),
    ).filter((id) => id !== input.actorUserId);
    const rows: InsertUserNotification[] = [];
    for (const userId of candidates) {
      const user = await storage.getUser(userId);
      if (!user || user.isActive === false || user.isApproved === false) continue;
      if (!input.includeCustomers && isExternalRole(user.role)) continue;
      if (!(await hasProjectAccess(user.id, user.role, user.email, project.id))) continue;
      rows.push({
        userId: user.id,
        kind: input.kind,
        projectId: project.id,
        params: {
          projectName: project.solutionName ?? null,
          customerName: project.customerName ?? null,
          ...input.params,
        },
        linkPath: input.linkPath,
        actorUserId: input.actorUserId,
      });
    }
    return await storage.createUserNotifications(rows);
  } catch (err) {
    console.error(`[notifications] Couldn't write "${input.kind}" notifications:`, err);
    return 0;
  }
}

/**
 * Notifications about a project for named people (e.g. the customer contacts
 * asked to agree to the criteria). Skips the actor, inactive or unapproved
 * users and anyone who can't open the project. Never throws.
 */
export async function notifyProjectRecipients(input: {
  projectId: number;
  recipients: string[];
  kind: NotificationKind;
  actorUserId: string;
  params: Record<string, string | null>;
  linkPath: string;
}): Promise<number> {
  try {
    const project = (await storage.getProjectById(input.projectId)) as NotificationProject | undefined;
    if (!project) return 0;
    const rows: InsertUserNotification[] = [];
    for (const userId of Array.from(new Set(input.recipients)).filter((id) => id !== input.actorUserId)) {
      const user = await storage.getUser(userId);
      if (!user || user.isActive === false || user.isApproved === false) continue;
      if (!(await hasProjectAccess(user.id, user.role, user.email, project.id))) continue;
      rows.push({
        userId: user.id,
        kind: input.kind,
        projectId: project.id,
        params: {
          projectName: project.solutionName ?? null,
          customerName: project.customerName ?? null,
          ...input.params,
        },
        linkPath: input.linkPath,
        actorUserId: input.actorUserId,
      });
    }
    return await storage.createUserNotifications(rows);
  } catch (err) {
    console.error(`[notifications] Couldn't write "${input.kind}" notifications:`, err);
    return 0;
  }
}

export const SUPPORT_REQUESTS_LINK = "/admin?tab=support-requests";
export const ACCOUNT_DIRECTORY_LINK = "/project?tab=customers&subtab=accounts";

export interface DirectNotification {
  kind: NotificationKind;
  recipients: Array<string | null | undefined>;
  actorUserId: string | null | undefined;
  /** Every recipient must be able to open this account (null = no account). */
  customerId: number | null | undefined;
  params: Record<string, string | null>;
  linkPath: string;
}

/**
 * Notifications that aren't about a project (support and evaluation
 * requests). Same rules as the event-driven ones: skips the actor, inactive
 * or unapproved users, and anyone who can't open the account. Never throws.
 */
export async function notifyUsers(n: DirectNotification): Promise<number> {
  try {
    const ids = Array.from(new Set(n.recipients.filter((id): id is string => !!id))).filter(
      (id) => id !== n.actorUserId,
    );
    const rows: InsertUserNotification[] = [];
    for (const id of ids) {
      const user = await storage.getUser(id);
      if (!user || user.isActive === false || user.isApproved === false) continue;
      if (n.customerId && !(await hasCustomerAccess(user.id, user.role, n.customerId))) continue;
      rows.push({
        userId: user.id,
        kind: n.kind,
        projectId: null,
        params: n.params,
        linkPath: n.linkPath,
        actorUserId: n.actorUserId ?? null,
      });
    }
    return await storage.createUserNotifications(rows);
  } catch (err) {
    console.error(`[notifications] Couldn't write "${n.kind}" notifications:`, err);
    return 0;
  }
}

type SupportRequestLike = {
  id: number;
  title: string;
  status: string;
  customerId: number | null;
  submittedByUserId: string;
  assignedToUserId: string | null;
};

/** What a support request update should notify. Pure. */
export function planSupportRequestNotifications(
  before: SupportRequestLike,
  after: SupportRequestLike,
  actorUserId: string,
): DirectNotification[] {
  const params = { requestTitle: after.title, oldStatus: before.status, newStatus: after.status };
  const out: DirectNotification[] = [];
  if (before.status !== after.status) {
    out.push({
      kind: "support_request_status_changed",
      recipients: [after.submittedByUserId],
      actorUserId,
      customerId: after.customerId,
      params,
      linkPath: SUPPORT_REQUESTS_LINK,
    });
  }
  if (after.assignedToUserId && after.assignedToUserId !== before.assignedToUserId) {
    out.push({
      kind: "support_request_assigned",
      recipients: [after.assignedToUserId],
      actorUserId,
      customerId: after.customerId,
      params,
      linkPath: SUPPORT_REQUESTS_LINK,
    });
  }
  return out;
}

export function notifySupportRequestUpdated(
  before: SupportRequestLike,
  after: SupportRequestLike,
  actorUserId: string,
): void {
  for (const n of planSupportRequestNotifications(before, after, actorUserId)) void notifyUsers(n);
}

export function notifyEvaluationRequestSubmitted(input: {
  customerId: number;
  accountName: string | null;
  requesterName: string | null;
  accountRepresentativeId: string | null | undefined;
  accountEngineerId: string | null | undefined;
  actorUserId: string;
}): void {
  void notifyUsers({
    kind: "evaluation_request_submitted",
    recipients: [input.accountRepresentativeId, input.accountEngineerId],
    actorUserId: input.actorUserId,
    customerId: input.customerId,
    params: { accountName: input.accountName, requesterName: input.requesterName },
    linkPath: ACCOUNT_DIRECTORY_LINK,
  });
}

/**
 * Someone asked the Admins to approve an account with no CRM link. Awaited,
 * so the route can say how many Admins it reached.
 */
export function notifyAccountLinkExceptionRequested(input: {
  adminIds: string[];
  actorUserId: string;
  accountName: string;
  reason: string;
  requesterName: string | null;
}): Promise<number> {
  return notifyUsers({
    kind: "account_link_exception_requested",
    recipients: input.adminIds,
    actorUserId: input.actorUserId,
    customerId: null,
    params: { accountName: input.accountName, reason: input.reason, requesterName: input.requesterName },
    linkPath: ACCOUNT_DIRECTORY_LINK,
  });
}

export function notifyEvaluationRequestStatusChanged(input: {
  requesterId: string;
  customerId: number;
  accountName: string | null;
  newStatus: string;
  actorUserId: string;
}): void {
  void notifyUsers({
    kind: "evaluation_request_status_changed",
    recipients: [input.requesterId],
    actorUserId: input.actorUserId,
    customerId: input.customerId,
    params: { accountName: input.accountName, newStatus: input.newStatus },
    linkPath: ACCOUNT_DIRECTORY_LINK,
  });
}
