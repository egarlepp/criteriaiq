// Customer workspace routes: the writes behind the project page side panel.
//
//   POST   /api/projects/:projectId/customer-actions/:taskId/status
//          { done: true } marks a customer to-do complete;
//          { done: false, previousStatus? } undoes that.
//   GET    /api/projects/:projectId/messages        the project's conversation
//   POST   /api/projects/:projectId/messages        { body } adds a message
//   DELETE /api/projects/:projectId/messages/:id    author or Admin
//   POST   /api/projects/:projectId/messages/read   { messageId } marks read up to it
//   GET    /api/project-messages?projectIds=1,2     latest messages across projects
//   GET    /api/project-messages/unread?projectIds= unread count per project
//
// Who may do what:
//   • Messages: anyone who can open the project (hasProjectAccess). Customer,
//     Partner and Guest users included; the project's team and customer
//     users are notified. The cross-project reads (Account Portal) silently
//     leave out projects the user can't open.
//   • To-dos: the task must be a customer-side task of this project, the
//     project's MAP must be shared with outside users (for them), and
//     canCompleteCustomerAction must allow it: staff need project edit
//     access; outside users may tick tasks assigned to them or to the
//     customer team with no named person. Only the status changes.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { hasProjectAccess, hasProjectEditAccess } from "../lib/project-access";
import { isExternalRole } from "../lib/internal-access";
import { projectsWithVisibleCustomerActions } from "../lib/customer-action-visibility";
import { getBroadcaster } from "../services/websocket-broadcaster";
import { emitMapItemUpdated } from "../services/automation-events";
import { mapItemOwners, queueOutlookMapDueDateSync } from "../services/outlook-map-due-dates";
import { notifyProjectPeople } from "../services/notifications";
import { MAP_COMPLETE_STATUS, isMapItemComplete, withCompletionDate } from "@shared/map-status";
import { CUSTOMER_ACTION_REOPEN_STATUSES, canCompleteCustomerAction } from "@shared/customer-actions";
import {
  PROJECT_MESSAGES_LIMIT,
  PROJECT_MESSAGES_MAX_PROJECTS,
  PROJECT_MESSAGES_RECENT_LIMIT,
  projectMessageInputSchema,
  projectMessageReadSchema,
  type ProjectMessageUnread,
  type ProjectMessageView,
} from "@shared/project-messages";
import type { ProjectMessageRow } from "../storage/project-messages";

const idParam = z.coerce.number().int().positive();

const statusBodySchema = z.object({
  done: z.boolean(),
  previousStatus: z.enum(CUSTOMER_ACTION_REOPEN_STATUSES).optional(),
});

const projectIdsQuerySchema = z.object({
  projectIds: z
    .string()
    .trim()
    .min(1)
    .transform((value) => [...new Set(value.split(",").map((part) => Number(part.trim())))])
    .pipe(z.array(z.number().int().positive()).min(1).max(PROJECT_MESSAGES_MAX_PROJECTS)),
});

const EXCERPT_LENGTH = 140;

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

type SessionUser = { id: string; role: string; email: string };

function displayName(user: { firstName?: string | null; lastName?: string | null } | null | undefined): string | null {
  const name = [user?.firstName, user?.lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  return name || null;
}

/** The signed-in user's name for a notification (the session may not carry it). */
async function actorName(userId: string): Promise<string | null> {
  try {
    return displayName(await storage.getUser(userId));
  } catch {
    return null;
  }
}

function toMessageView(row: ProjectMessageRow, user: SessionUser): ProjectMessageView {
  return {
    id: row.id,
    projectId: row.projectId,
    body: row.deletedAt ? "" : row.body,
    authorId: row.authorUserId,
    authorName: displayName({ firstName: row.authorFirstName, lastName: row.authorLastName }),
    authorIsExternal: isExternalRole(row.authorRole),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
    canDelete: !row.deletedAt && (user.role === "Admin" || (!!row.authorUserId && row.authorUserId === user.id)),
  };
}

/** The listed projects the user can open, in the order given. */
async function accessibleProjectIds(user: SessionUser, projectIds: number[]): Promise<number[]> {
  const allowed: number[] = [];
  for (const projectId of projectIds) {
    if (await hasProjectAccess(user.id, user.role, user.email, projectId)) allowed.push(projectId);
  }
  return allowed;
}

export function registerCustomerWorkspaceRoutes(app: Express) {
  app.post("/api/projects/:projectId/customer-actions/:taskId/status", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = idParam.safeParse(req.params.projectId);
      const taskId = idParam.safeParse(req.params.taskId);
      if (!projectId.success || !taskId.success) {
        return res.status(400).json({ message: "Invalid project or task ID" });
      }
      const body = statusBodySchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Send { done: true } or { done: false }", errors: body.error.issues });
      }
      const user = req.session.user as SessionUser;
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const visible = await projectsWithVisibleCustomerActions([projectId.data], user.role);
      if (visible.length === 0) {
        return res.status(403).json({ message: "The plan is not shared with you" });
      }

      const task = await storage.getMapTask(taskId.data);
      // A task id from another project answers like a missing one.
      if (!task || task.projectId !== projectId.data) {
        return res.status(404).json({ message: "Task not found" });
      }
      const isExternal = isExternalRole(user.role);
      const hasEditAccess = isExternal ? false : await hasProjectEditAccess(user.id, user.role, user.email, projectId.data);
      if (!canCompleteCustomerAction({ task, userId: user.id, isExternal, hasEditAccess })) {
        return res.status(403).json({ message: "You can't change this to-do" });
      }

      const wasDone = isMapItemComplete(task.status);
      if (body.data.done === wasDone) {
        return res.json(task);
      }
      if (!body.data.done && task.status === "cancelled") {
        return res.status(409).json({ message: "This to-do was cancelled" });
      }
      const nextStatus = body.data.done ? MAP_COMPLETE_STATUS : (body.data.previousStatus ?? "in_progress");
      const updates: { status: string; startDate?: string | null; completedDate?: string | null } = withCompletionDate(task, {
        status: nextStatus as string,
      });
      const dated: Record<string, unknown> = { status: updates.status };
      for (const key of ["startDate", "completedDate"] as const) {
        const value = updates[key];
        if (value !== undefined) dated[key] = value === null ? null : new Date(value);
      }
      const updatedTask = await (storage.updateMapTask as any)(task.id, dated, user.id);

      await storage.createActivityLog({
        projectId: task.projectId,
        userId: user.id,
        action: "updated",
        details: body.data.done
          ? `Marked customer to-do "${task.name}" done`
          : `Reopened customer to-do "${task.name}"`,
        targetType: "map_task",
        targetId: task.id,
      });
      getBroadcaster()?.broadcastTaskUpdate("updated", updatedTask, user.id);
      emitMapItemUpdated("task", task.projectId, task, updatedTask, user.id);
      queueOutlookMapDueDateSync(mapItemOwners(task, updatedTask));

      if (body.data.done && isExternal) {
        void notifyProjectPeople({
          projectId: task.projectId,
          kind: "customer_action_completed",
          actorUserId: user.id,
          includeCustomers: false,
          params: { itemName: task.name, actorName: await actorName(user.id) },
          linkPath: `/project/${task.projectId}?tab=map`,
        });
      }
      res.json(updatedTask);
    } catch (error) {
      console.error("Error updating customer to-do:", error);
      res.status(500).json({ message: "Failed to update the to-do" });
    }
  });

  app.get("/api/projects/:projectId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = idParam.safeParse(req.params.projectId);
      if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
      const user = req.session.user as SessionUser;
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const rows = await storage.listProjectMessages(projectId.data, PROJECT_MESSAGES_LIMIT);
      res.json(rows.map((row) => toMessageView(row, user)));
    } catch (error) {
      console.error("Error fetching project messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/projects/:projectId/messages", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = idParam.safeParse(req.params.projectId);
      if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
      const parsed = projectMessageInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Write a message of up to 4000 characters", errors: parsed.error.issues });
      }
      const user = req.session.user as SessionUser;
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const message = await storage.createProjectMessage(projectId.data, user.id, parsed.data.body);
      void notifyProjectPeople({
        projectId: projectId.data,
        kind: "project_message_posted",
        actorUserId: user.id,
        includeCustomers: true,
        params: { authorName: await actorName(user.id), excerpt: excerpt(parsed.data.body) },
        linkPath: `/project/${projectId.data}`,
      });
      res.status(201).json(message);
    } catch (error) {
      console.error("Error posting project message:", error);
      res.status(500).json({ message: "Failed to post the message" });
    }
  });

  app.delete("/api/projects/:projectId/messages/:messageId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = idParam.safeParse(req.params.projectId);
      const messageId = idParam.safeParse(req.params.messageId);
      if (!projectId.success || !messageId.success) return res.status(400).json({ message: "Invalid ID" });
      const user = req.session.user as SessionUser;
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const message = await storage.getProjectMessage(messageId.data);
      if (!message || message.projectId !== projectId.data) {
        return res.status(404).json({ message: "Message not found" });
      }
      if (user.role !== "Admin" && message.authorUserId !== user.id) {
        return res.status(403).json({ message: "Only the author or an Admin can delete a message" });
      }
      await storage.deleteProjectMessage(message.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error deleting project message:", error);
      res.status(500).json({ message: "Failed to delete the message" });
    }
  });

  app.post("/api/projects/:projectId/messages/read", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = idParam.safeParse(req.params.projectId);
      if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
      const parsed = projectMessageReadSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Send { messageId }", errors: parsed.error.issues });
      const user = req.session.user as SessionUser;
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const message = await storage.getProjectMessage(parsed.data.messageId);
      if (!message || message.projectId !== projectId.data) {
        return res.status(404).json({ message: "Message not found" });
      }
      await storage.markProjectMessagesRead(user.id, projectId.data, message.id);
      res.status(204).end();
    } catch (error) {
      console.error("Error marking project messages read:", error);
      res.status(500).json({ message: "Failed to mark messages read" });
    }
  });

  app.get("/api/project-messages", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = projectIdsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Send projectIds as a comma-separated list of project IDs" });
      }
      const user = req.session.user as SessionUser;
      const allowed = await accessibleProjectIds(user, parsed.data.projectIds);
      const rows = await storage.listRecentProjectMessages(allowed, PROJECT_MESSAGES_RECENT_LIMIT);
      res.json(rows.map((row) => toMessageView(row, user)));
    } catch (error) {
      console.error("Error fetching account messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.get("/api/project-messages/unread", isAuthenticated, async (req: any, res) => {
    try {
      const parsed = projectIdsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Send projectIds as a comma-separated list of project IDs" });
      }
      const user = req.session.user as SessionUser;
      const allowed = await accessibleProjectIds(user, parsed.data.projectIds);
      const counts = await storage.getProjectMessageCounts(allowed, user.id);
      const body: ProjectMessageUnread[] = counts.map((row) => ({
        projectId: row.projectId,
        unread: row.unread,
        lastMessageAt: row.lastMessageAt ? row.lastMessageAt.toISOString() : null,
      }));
      res.json(body);
    } catch (error) {
      console.error("Error fetching unread message counts:", error);
      res.status(500).json({ message: "Failed to fetch unread counts" });
    }
  });
}
