// Value journey routes (shared/value-journey.ts, server/storage/value-journey.ts).
//
//   GET    /api/journey-stages[?include=usage]         every signed-in user (labels for the journey)
//   POST   /api/journey-stages                         Template Management › Value Journey edit
//   PUT    /api/journey-stages/order                   "
//   PUT    /api/journey-stages/:id                     "
//   DELETE /api/journey-stages/:id                     "
//   GET    /api/projects/:projectId/journey            anyone who can open the project
//   GET    /api/projects/:projectId/criteria-agreement anyone who can open the project
//   POST   /api/projects/:projectId/criteria-agreement/request
//          staff with project edit access; recipients must be the project's customer users
//   POST   /api/projects/:projectId/criteria-agreement/agree
//          an outside user (Customer, Partner, Guest) who can open the project
//   GET    /api/projects/:projectId/handoff-team       anyone who can open the project
//   PUT    /api/projects/:projectId/handoff-team       staff with project edit access
//   PUT    /api/map/tasks/:taskId/criteria             staff with edit access to the task's project
import type { Express, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser, isExternalRole } from "../lib/internal-access";
import { requireSectionEdit } from "../lib/section-permissions";
import { hasProjectAccess, hasProjectEditAccess } from "../lib/project-access";
import { customerUserIds, notifyProjectPeople, notifyProjectRecipients, type NotificationProject } from "../services/notifications";
import { ValueJourneyError } from "../storage/value-journey";
import {
  criteriaAgreementAgreeSchema,
  criteriaAgreementRequestSchema,
  handoffTeamSchema,
  journeyStageInputSchema,
  journeyStageOrderSchema,
  taskCriteriaSchema,
} from "@shared/value-journey";

export const VALUE_JOURNEY_SECTION = "template_management.value-journey";

const idParam = z.coerce.number().int().positive();

type SessionUser = { id: string; role: string; email: string; firstName?: string | null; lastName?: string | null };

function sessionUser(req: any): SessionUser {
  return req.session.user as SessionUser;
}

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof ValueJourneyError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(`${fallback}:`, error);
  return res.status(500).json({ message: fallback });
}

async function actorName(userId: string): Promise<string | null> {
  try {
    const user = await storage.getUser(userId);
    const name = [user?.firstName, user?.lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
    return name || null;
  } catch {
    return null;
  }
}

export function registerValueJourneyRoutes(app: Express) {
  const canEditStages = [isAuthenticated, requireInternalUser, requireSectionEdit(VALUE_JOURNEY_SECTION)];

  // --- Stages ---------------------------------------------------------------

  // ?include=usage adds how many MAP templates and phases use each stage
  // (the admin list); everyone else gets the plain list.
  app.get("/api/journey-stages", isAuthenticated, async (req, res) => {
    try {
      if (req.query.include === "usage") {
        return res.json(await storage.listJourneyStagesWithUsage());
      }
      res.json(await storage.listJourneyStages());
    } catch (error) {
      fail(res, error, "Failed to load journey stages");
    }
  });

  app.post("/api/journey-stages", ...canEditStages, async (req, res) => {
    const body = journeyStageInputSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid stage", errors: body.error.issues });
    try {
      res.status(201).json(await storage.createJourneyStage(body.data));
    } catch (error) {
      fail(res, error, "Failed to create journey stage");
    }
  });

  // Registered before /:id so "order" is never read as an id.
  app.put("/api/journey-stages/order", ...canEditStages, async (req, res) => {
    const body = journeyStageOrderSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid order", errors: body.error.issues });
    try {
      res.json(await storage.reorderJourneyStages(body.data.ids));
    } catch (error) {
      fail(res, error, "Failed to reorder journey stages");
    }
  });

  app.put("/api/journey-stages/:id", ...canEditStages, async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    const body = journeyStageInputSchema.safeParse(req.body);
    if (!id.success) return res.status(400).json({ message: "Invalid stage ID" });
    if (!body.success) return res.status(400).json({ message: "Invalid stage", errors: body.error.issues });
    try {
      const row = await storage.updateJourneyStage(id.data, body.data);
      if (!row) return res.status(404).json({ message: "Stage not found" });
      res.json(row);
    } catch (error) {
      fail(res, error, "Failed to update journey stage");
    }
  });

  app.delete("/api/journey-stages/:id", ...canEditStages, async (req, res) => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) return res.status(400).json({ message: "Invalid stage ID" });
    try {
      if (!(await storage.deleteJourneyStage(id.data))) return res.status(404).json({ message: "Stage not found" });
      res.status(204).end();
    } catch (error) {
      fail(res, error, "Failed to delete journey stage");
    }
  });

  // --- Project journey ------------------------------------------------------

  app.get("/api/projects/:projectId/journey", isAuthenticated, async (req, res) => {
    const projectId = idParam.safeParse(req.params.projectId);
    if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
    const user = sessionUser(req);
    try {
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      res.json(await storage.getProjectJourney(projectId.data));
    } catch (error) {
      fail(res, error, "Failed to load the value journey");
    }
  });

  // --- Criteria agreement ---------------------------------------------------

  app.get("/api/projects/:projectId/criteria-agreement", isAuthenticated, async (req, res) => {
    const projectId = idParam.safeParse(req.params.projectId);
    if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
    const user = sessionUser(req);
    try {
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      res.json(await storage.getCriteriaAgreementState(projectId.data));
    } catch (error) {
      fail(res, error, "Failed to load the criteria agreement");
    }
  });

  app.post(
    "/api/projects/:projectId/criteria-agreement/request",
    isAuthenticated,
    requireInternalUser,
    async (req, res) => {
      const projectId = idParam.safeParse(req.params.projectId);
      if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
      const body = criteriaAgreementRequestSchema.safeParse(req.body);
      if (!body.success) return res.status(400).json({ message: "Choose at least one customer contact", errors: body.error.issues });
      const user = sessionUser(req);
      try {
        if (!(await hasProjectEditAccess(user.id, user.role, user.email, projectId.data))) {
          return res.status(403).json({ message: "Access denied - insufficient project permissions" });
        }
        const project = (await storage.getProjectById(projectId.data)) as NotificationProject | undefined;
        if (!project) return res.status(404).json({ message: "Project not found" });
        const contacts = new Set(customerUserIds(project));
        if (body.data.recipientUserIds.some((id) => !contacts.has(id))) {
          return res.status(400).json({ message: "Send the criteria only to this project's customer contacts" });
        }
        const criteria = await storage.listProjectCriteriaForMap(projectId.data);
        if (!criteria.some((criterion) => criterion.isActive !== false && criterion.status !== "cancelled")) {
          return res.status(409).json({ message: "Add success criteria before asking the customer to agree" });
        }

        await storage.requestCriteriaAgreement(projectId.data, user.id, body.data.recipientUserIds);
        await storage.createActivityLog({
          projectId: projectId.data,
          userId: user.id,
          action: "updated",
          details: "Sent the success criteria to the customer for agreement",
          targetType: "criteria_agreement",
          targetId: projectId.data,
        });
        void notifyProjectRecipients({
          projectId: projectId.data,
          recipients: body.data.recipientUserIds,
          kind: "criteria_agreement_requested",
          actorUserId: user.id,
          params: { actorName: await actorName(user.id) },
          linkPath: `/project/${projectId.data}?tab=success-criteria&agree=1`,
        });
        res.json(await storage.getCriteriaAgreementState(projectId.data));
      } catch (error) {
        fail(res, error, "Failed to send the criteria for agreement");
      }
    },
  );

  app.post("/api/projects/:projectId/criteria-agreement/agree", isAuthenticated, async (req, res) => {
    const projectId = idParam.safeParse(req.params.projectId);
    if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
    const body = criteriaAgreementAgreeSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Type your name and tick the box to agree", errors: body.error.issues });
    const user = sessionUser(req);
    try {
      // The agreement is the customer's: staff can send the criteria but never sign for them.
      if (!isExternalRole(user.role)) {
        return res.status(403).json({ message: "Only the customer can agree to the success criteria" });
      }
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      await storage.agreeToCriteria(projectId.data, user.id, body.data.name, body.data.title || null);
      await storage.createActivityLog({
        projectId: projectId.data,
        userId: user.id,
        action: "updated",
        details: `${body.data.name} agreed to the success criteria`,
        targetType: "criteria_agreement",
        targetId: projectId.data,
      });
      void notifyProjectPeople({
        projectId: projectId.data,
        kind: "criteria_agreed",
        actorUserId: user.id,
        includeCustomers: false,
        params: { actorName: body.data.name },
        linkPath: `/project/${projectId.data}?tab=success-criteria`,
      });
      res.json(await storage.getCriteriaAgreementState(projectId.data));
    } catch (error) {
      fail(res, error, "Failed to record the agreement");
    }
  });

  // --- Handoff team ---------------------------------------------------------

  app.get("/api/projects/:projectId/handoff-team", isAuthenticated, async (req, res) => {
    const projectId = idParam.safeParse(req.params.projectId);
    if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
    const user = sessionUser(req);
    try {
      if (!(await hasProjectAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      res.json(await storage.getHandoffTeam(projectId.data));
    } catch (error) {
      fail(res, error, "Failed to load the handoff team");
    }
  });

  app.put("/api/projects/:projectId/handoff-team", isAuthenticated, requireInternalUser, async (req, res) => {
    const projectId = idParam.safeParse(req.params.projectId);
    if (!projectId.success) return res.status(400).json({ message: "Invalid project ID" });
    const body = handoffTeamSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid handoff team", errors: body.error.issues });
    const user = sessionUser(req);
    try {
      if (!(await hasProjectEditAccess(user.id, user.role, user.email, projectId.data))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const team = await storage.setHandoffTeam(projectId.data, body.data.members);
      await storage.createActivityLog({
        projectId: projectId.data,
        userId: user.id,
        action: "updated",
        details: `Updated the handoff team (${team.length} ${team.length === 1 ? "person" : "people"})`,
        targetType: "handoff_team",
        targetId: projectId.data,
      });
      res.json(team);
    } catch (error) {
      fail(res, error, "Failed to save the handoff team");
    }
  });

  // --- MAP task ↔ criteria --------------------------------------------------

  app.put("/api/map/tasks/:taskId/criteria", isAuthenticated, requireInternalUser, async (req, res) => {
    const taskId = idParam.safeParse(req.params.taskId);
    if (!taskId.success) return res.status(400).json({ message: "Invalid task ID" });
    const body = taskCriteriaSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Invalid criteria", errors: body.error.issues });
    const user = sessionUser(req);
    try {
      const task = await storage.getMapTask(taskId.data);
      if (!task) return res.status(404).json({ message: "Task not found" });
      if (!(await hasProjectEditAccess(user.id, user.role, user.email, task.projectId))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      res.json(await storage.setTaskCriteria(taskId.data, body.data.criterionIds));
    } catch (error) {
      fail(res, error, "Failed to link the task to criteria");
    }
  });
}
