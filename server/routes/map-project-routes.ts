// Project-specific MAP routes (Phase 8 extraction #9c).
//
// Third slice of the MAP surface — 10 handlers spanning the project's
// MAP itself plus the per-item PUT/DELETE on phases / steps / tasks:
//
//   GET    /api/projects/:projectId/map
//   GET    /api/projects/:projectId/map/analytics
//   GET    /api/projects/:projectId/customer-actions  (open customer-owned tasks)
//   GET    /api/customer-actions?projectIds=1,2       (the same, across projects; Account Portal)
//   POST   /api/projects/:projectId/map/from-template
//   POST   /api/projects/:projectId/map/quick        (Quick plan: one phase, no template)
//   POST   /api/projects/:projectId/map/items        (add a phase, step or task)
//   PUT    /api/projects/:projectId/map/name
//   PUT    /api/map/phases/:id
//   PUT    /api/map/steps/:id
//   PUT    /api/map/tasks/:id
//   DELETE /api/map/phases/:id
//   DELETE /api/map/steps/:id
//   DELETE /api/map/tasks/:id
//
// All write paths broadcast via the WebSocket singleton (`getBroadcaster`)
// and emit automation events (`emitMapItemUpdated`) for webhooks and the
// bell. Access
// checks now go through the shared `lib/project-access.ts` helpers
// extracted in this same commit.
import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { mapTemplateApplications } from "@shared/schema";
import {
  hasProjectAccess,
  hasProjectEditAccess,
} from "../lib/project-access";
import { getBroadcaster } from "../services/websocket-broadcaster";
import { emitMapItemUpdated } from "../services/automation-events";
import {
  mapItemOwners,
  queueOutlookMapDueDateSync,
  queueOutlookMapDueDateSyncForProject,
} from "../services/outlook-map-due-dates";
import { datesForNewOwner, isUpcoming, taskOwnerId, upcomingLimits } from "../services/map-scheduling";
import { isMapItemComplete, mapItemUpdateSchema, mapPhaseUpdateSchema, withCompletionDate } from "@shared/map-status";
import { MAP_ASSIGNMENT_ROLES, mapAssignmentRolesSchema } from "@shared/map-assignment-roles";
import { isExternalRole, requireInternalUser } from "../lib/internal-access";
import { CUSTOMER_ACTIONS_MAX_PROJECTS } from "@shared/customer-actions";
import { projectsWithVisibleCustomerActions, withCanComplete } from "../lib/customer-action-visibility";
import { newMapItemSchema, quickPlanSchema } from "@shared/map-plan-items";
import { MapParentNotFoundError } from "../storage/map-plan-items";

/**
 * "Our team" on a MAP item: only internal users may set it (teams are staff
 * data), and it must name a real team. Responsibility only; it never grants
 * access. Returns an error to send, or null when the update may go ahead.
 */
async function teamAssignmentError(
  role: string | null | undefined,
  teamId: number | null | undefined,
): Promise<{ status: number; message: string } | null> {
  if (teamId === undefined) return null;
  if (isExternalRole(role)) return { status: 403, message: "Only internal users can assign a team" };
  if (teamId !== null && !(await storage.getTeam(teamId))) return { status: 400, message: "Team not found" };
  return null;
}

// Local activity-log formatters — these helpers are only used by the
// MAP phase/step/task PUT handlers below.
function formatStatusValue(status: string): string {
  const statusMap: Record<string, string> = {
    'not_started': 'Not Started',
    'in_progress': 'In Progress',
    'completed': 'Complete',
    'blocked': 'Blocked',
    'cancelled': 'Cancelled',
    'deferred': 'Deferred',
    'stalled': 'Stalled',
    'at_risk': 'At Risk',
    'complete': 'Complete'
  };
  return statusMap[status] || status;
}

function capitalizeFieldName(fieldName: string): string {
  const fieldNameMap: Record<string, string> = {
    'status': 'Status',
    'name': 'Name',
    'description': 'Description',
    'startDate': 'Start Date',
    'dueDate': 'Due Date',
    'completedDate': 'Completed Date',
    'orderIndex': 'Order',
    'teamOwned': 'Team Owned',
    'estimatedHours': 'Estimated Hours',
    'assignedToCustomerUserId': 'Assigned To Customer',
    'assignedToUserId': 'Assigned To',
    'additionalInternalUserId': 'Additional Internal',
    'assignedToTeamId': 'Internal Team'
  };
  return fieldNameMap[fieldName] || fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
}

/**
 * The update routes validate dates as ISO strings; the timestamp columns
 * need Date objects (a string made drizzle throw, so every date edit
 * through these routes failed).
 */
function withDateObjects<T extends { startDate?: string | null; dueDate?: string | null; completedDate?: string | null }>(updates: T) {
  const out: Record<string, unknown> = { ...updates };
  for (const key of ["startDate", "dueDate", "completedDate"] as const) {
    const value = updates[key];
    if (typeof value === "string") out[key] = new Date(value);
  }
  return out;
}

const customerActionsQuerySchema = z.object({
  projectIds: z
    .string()
    .trim()
    .min(1)
    .transform((value) => [...new Set(value.split(",").map((part) => Number(part.trim())))])
    .pipe(z.array(z.number().int().positive()).min(1).max(CUSTOMER_ACTIONS_MAX_PROJECTS)),
});

export function registerMapProjectRoutes(app: Express) {
  // Get project-specific MAP
  app.get('/api/projects/:projectId/map', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Check if user has access to this project
      const hasAccess = await hasProjectAccess(userId, userRole, userEmail, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }

      const mapData = await storage.getProjectMap(projectId);

      // Fetch MAP metadata (name and template)
      const mapMetadata = await storage.getProjectMapMetadata(projectId);

      // Fetch template information if this MAP was created from a template
      const templateApplication = await storage.db
        .select()
        .from(mapTemplateApplications)
        .where(eq(mapTemplateApplications.projectId, projectId))
        .limit(1);

      let templateInfo = null;
      if (templateApplication.length > 0) {
        const template = await storage.getMapTemplate(templateApplication[0].templateId);
        if (template) {
          // Calculate counts from mapData
          const phaseCount = mapData.phases.length;
          const stepCount = mapData.steps.length;
          const taskCount = mapData.tasks.length;

          templateInfo = {
            id: template.id,
            name: template.name,
            description: template.description,
            phaseCount,
            stepCount,
            taskCount
          };
        }
      }

      // The success criteria tested on the plan and which tasks test them
      // (the drawer's criteria chips and "Proves these criteria").
      const [criteria, taskCriteria] = await Promise.all([
        storage.listProjectCriteriaForMap(projectId),
        storage.listProjectTaskCriteria(projectId),
      ]);

      res.json({
        ...mapData,
        templateInfo,
        metadata: mapMetadata || null,
        criteria,
        taskCriteria,
      });
    } catch (error: any) {
      console.error("Error fetching project MAP:", error);
      res.status(500).json({ message: "Failed to fetch project MAP" });
    }
  });

  // Open MAP tasks owned by the customer side (shared/customer-actions.ts).
  // Shown on the project page Overview as "Waiting on you" / "Open on customer side".
  app.get('/api/projects/:projectId/customer-actions', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const { id: userId, role: userRole, email: userEmail } = req.session.user;
      const hasAccess = await hasProjectAccess(userId, userRole, userEmail, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }
      const visible = await projectsWithVisibleCustomerActions([projectId], userRole);
      res.json(await withCanComplete(await storage.getCustomerActions(visible), req.session.user));
    } catch (error: any) {
      console.error("Error fetching customer actions:", error);
      res.status(500).json({ message: "Failed to fetch customer actions" });
    }
  });

  // The same list across several projects, for the Account Portal
  // (?projectIds=1,2,3). Projects the user can't open are skipped, so the
  // answer never says more than the per-project route would.
  app.get('/api/customer-actions', isAuthenticated, async (req: any, res) => {
    try {
      const parsed = customerActionsQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({ message: "Send projectIds as a comma-separated list of project IDs" });
      }
      const { id: userId, role: userRole, email: userEmail } = req.session.user;
      const allowed: number[] = [];
      for (const projectId of parsed.data.projectIds) {
        if (await hasProjectAccess(userId, userRole, userEmail, projectId)) allowed.push(projectId);
      }
      const visible = await projectsWithVisibleCustomerActions(allowed, userRole);
      const actions = await storage.getCustomerActions(visible);
      const names = await storage.getProjectNames(visible);
      const rows = actions.map((action) => ({ ...action, projectName: names.get(action.projectId) ?? null }));
      res.json(await withCanComplete(rows, req.session.user));
    } catch (error: any) {
      console.error("Error fetching account customer actions:", error);
      res.status(500).json({ message: "Failed to fetch customer actions" });
    }
  });

  // Get project MAP analytics with enhanced progress tracking
  app.get('/api/projects/:projectId/map/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      // Check if user has access to this project
      const hasAccess = await hasProjectAccess(userId, userRole, userEmail, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }

      // Get MAP data
      const { phases, steps, tasks } = await storage.getProjectMap(projectId);

      // Calculate enhanced analytics with weighted completion
      const phaseWeight = 0.4; // 40% weight
      const stepWeight = 0.35; // 35% weight
      const taskWeight = 0.25; // 25% weight

      const phaseProgress = phases.length > 0 ?
        phases.filter(p => isMapItemComplete(p.status)).length / phases.length : 0;
      const stepProgress = steps.length > 0 ?
        steps.filter(s => isMapItemComplete(s.status)).length / steps.length : 0;
      const taskProgress = tasks.length > 0 ?
        tasks.filter(t => isMapItemComplete(t.status)).length / tasks.length : 0;

      const weightedProgress = Math.round(
        (phaseProgress * phaseWeight + stepProgress * stepWeight + taskProgress * taskWeight) * 100
      );

      // Calculate timeline analytics
      const now = new Date();
      const overdueTasks = tasks.filter(task =>
        task.dueDate && new Date(task.dueDate) < now && !isMapItemComplete(task.status)
      );
      // Upcoming: due within UPCOMING_WORKING_DAYS working days on the
      // task owner's calendar (the organization's defaults when unassigned).
      const limits = await upcomingLimits(tasks.map(taskOwnerId), now);
      const upcomingTasks = tasks.filter(task =>
        isUpcoming(task.dueDate, now, limits.get(taskOwnerId(task)))
      );

      // Helper function for status distribution
      const calculateStatusDistribution = (items: Array<{ status: string }>): Record<string, number> => {
        const distribution: Record<string, number> = {};
        items.forEach(item => {
          distribution[item.status] = (distribution[item.status] || 0) + 1;
        });
        return distribution;
      };

      // Calculate status distributions
      const phaseStatusDist = calculateStatusDistribution(phases);
      const stepStatusDist = calculateStatusDistribution(steps);
      const taskStatusDist = calculateStatusDistribution(tasks);

      // Calculate assignment analytics
      const assignedTasks = tasks.filter(t => t.assignedToUserId);
      const unassignedTasks = tasks.filter(t => !t.assignedToUserId);

      // Calculate performance metrics
      const completedItems = [...phases, ...steps, ...tasks].filter(item => isMapItemComplete(item.status));
      const blockedItems = [...phases, ...steps, ...tasks].filter(item => item.status === "blocked");

      // Calculate velocity (items completed recently)
      const recentCompletion = completedItems.filter(item => {
        if (!item.completedDate) return false;
        const completedDate = new Date(item.completedDate);
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return completedDate >= weekAgo;
      });

      const analytics = {
        projectId,
        overallProgress: weightedProgress,
        basicProgress: Math.round((phases.filter(p => isMapItemComplete(p.status)).length / Math.max(phases.length, 1)) * 100),

        // Completion statistics
        completion: {
          phases: { completed: phases.filter(p => isMapItemComplete(p.status)).length, total: phases.length },
          steps: { completed: steps.filter(s => isMapItemComplete(s.status)).length, total: steps.length },
          tasks: { completed: tasks.filter(t => isMapItemComplete(t.status)).length, total: tasks.length }
        },

        // Status distributions
        statusDistribution: {
          phases: phaseStatusDist,
          steps: stepStatusDist,
          tasks: taskStatusDist
        },

        // Timeline analytics
        timeline: {
          overdueTasks: overdueTasks.length,
          upcomingDeadlines: upcomingTasks.length,
          tasksWithDueDates: tasks.filter(task => task.dueDate).length,
          atRiskItems: [...phases, ...steps, ...tasks].filter(item =>
            item.status === "blocked" ||
            (item.dueDate && new Date(item.dueDate) < new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) && !isMapItemComplete(item.status))
          ).length
        },

        // Assignment analytics
        assignments: {
          assignedTasks: assignedTasks.length,
          unassignedTasks: unassignedTasks.length,
          assignmentRate: Math.round((assignedTasks.length / Math.max(tasks.length, 1)) * 100)
        },

        // Performance metrics
        performance: {
          totalItems: phases.length + steps.length + tasks.length,
          completedItems: completedItems.length,
          blockedItems: blockedItems.length,
          recentCompletions: recentCompletion.length,
          completionRate: Math.round((completedItems.length / Math.max(phases.length + steps.length + tasks.length, 1)) * 100),
          blockedRate: Math.round((blockedItems.length / Math.max(phases.length + steps.length + tasks.length, 1)) * 100)
        },

        // Risk indicators
        riskIndicators: {
          hasOverdueTasks: overdueTasks.length > 0,
          hasBlockedItems: blockedItems.length > 0,
          lowAssignmentRate: (assignedTasks.length / Math.max(tasks.length, 1)) < 0.5,
          manyUpcomingDeadlines: upcomingTasks.length > 5
        },

        lastUpdated: new Date().toISOString()
      };

      res.json(analytics);
    } catch (error: any) {
      console.error("Error fetching MAP analytics:", error);
      res.status(500).json({ message: "Failed to fetch MAP analytics" });
    }
  });

  // MAP dates: plan on each task owner's calendar (true), or on the project
  // owner's for every date (false). Only the project owner (primary
  // engineer) or an Admin may switch it.
  app.patch('/api/projects/:projectId/map-scheduling', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
      const parsed = z.object({ scheduleByTaskOwner: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "scheduleByTaskOwner must be true or false" });

      const userId = req.session.user.id;
      const project = await storage.getProjectScheduling(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (req.session.user.role !== "Admin" && project.primaryEngineerId !== userId) {
        return res.status(403).json({ message: "Only the project owner can change how MAP dates are planned" });
      }

      await storage.setProjectScheduleByTaskOwner(projectId, parsed.data.scheduleByTaskOwner);
      await storage.createActivityLog({
        projectId,
        userId,
        action: "updated",
        details: parsed.data.scheduleByTaskOwner
          ? "MAP dates now follow each task owner's holiday calendar"
          : "MAP dates now follow the project owner's holiday calendar",
        targetType: "project",
        targetId: projectId,
      });
      res.json({ projectId, scheduleByTaskOwner: parsed.data.scheduleByTaskOwner });
    } catch (error) {
      console.error("Error updating MAP scheduling:", error);
      res.status(500).json({ message: "Failed to update MAP scheduling" });
    }
  });

  // Create project MAP from template
  app.post('/api/projects/:projectId/map/from-template', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const { templateId } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      if (!templateId || isNaN(parseInt(templateId))) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Check if user has EDIT access to this project (required for creating MAP)
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to create MAP" });
      }

      const success = await storage.createProjectMapFromTemplate(
        projectId,
        parseInt(templateId),
        userId
      );

      if (success) {
        // Get template name for better logging
        const template = await storage.getMapTemplate(parseInt(templateId));
        const templateName = template?.name || `Template ${templateId}`;

        // Log activity with enhanced details
        await storage.createActivityLog({
          projectId,
          userId,
          action: "created",
          details: `Created MAP from template "${templateName}" - initialized project with structured phases and steps`,
          targetType: "map_project",
          targetId: projectId,
        });

        res.json({ message: "Project MAP created successfully from template" });
      } else {
        res.status(500).json({ message: "Failed to create project MAP from template" });
      }
    } catch (error: any) {
      console.error("Error creating project MAP from template:", error);
      res.status(500).json({ message: "Failed to create project MAP from template" });
    }
  });

  // Start a Quick plan: one phase and a list of steps, no template.
  app.post('/api/projects/:projectId/map/quick', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const userId = req.session.user.id;
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const hasEditAccess = await hasProjectEditAccess(userId, req.session.user.role, req.session.user.email, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to create a plan" });
      }
      const parsed = quickPlanSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid Quick plan", errors: parsed.error.issues });
      }

      const created = await storage.createQuickPlan(projectId, parsed.data);
      if (!created) {
        return res.status(409).json({ message: "This project already has a plan" });
      }

      await storage.createActivityLog({
        projectId,
        userId,
        action: "created",
        details: `Started a Quick plan with ${created.steps.length} step${created.steps.length === 1 ? "" : "s"}`,
        targetType: "map_project",
        targetId: projectId,
      });
      getBroadcaster()?.broadcastPhaseUpdate('created', created.phase, userId);

      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating Quick plan:", error);
      res.status(500).json({ message: "Failed to create Quick plan" });
    }
  });

  // Add a phase, step or task to a project's plan.
  app.post('/api/projects/:projectId/map/items', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const userId = req.session.user.id;
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const hasEditAccess = await hasProjectEditAccess(userId, req.session.user.role, req.session.user.email, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to change the plan" });
      }
      const parsed = newMapItemSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid MAP item", errors: parsed.error.issues });
      }

      const { kind, parentId, name, description, dueDate } = parsed.data;
      let created;
      try {
        created = await storage.addProjectMapItem(projectId, {
          kind,
          parentId: parentId ?? null,
          name,
          description: description || null,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00.000Z`) : null,
        });
      } catch (error) {
        if (error instanceof MapParentNotFoundError) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }

      await storage.createActivityLog({
        projectId,
        userId,
        action: "created",
        details: `Added MAP ${created.kind} "${created.item.name}"`,
        targetType: `map_${created.kind}`,
        targetId: created.item.id,
      });
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        if (created.kind === "phase") broadcaster.broadcastPhaseUpdate('created', created.item, userId);
        else if (created.kind === "step") broadcaster.broadcastStepUpdate('created', created.item, userId);
        else broadcaster.broadcastTaskUpdate('created', created.item, userId);
      }

      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error adding MAP item:", error);
      res.status(500).json({ message: "Failed to add MAP item" });
    }
  });

  // Update project MAP name
  app.put('/api/projects/:projectId/map/name', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const { mapName } = req.body;
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }

      if (!mapName || typeof mapName !== 'string' || mapName.trim().length === 0) {
        return res.status(400).json({ message: "MAP name is required" });
      }

      // Check if user has EDIT access to this project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to update MAP name" });
      }

      const updatedMetadata = await storage.updateProjectMapName(projectId, mapName.trim());

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "updated",
        details: `Updated MAP name to "${mapName.trim()}"`,
        targetType: "map_project",
        targetId: projectId,
      });

      res.json({ metadata: updatedMetadata });
    } catch (error: any) {
      console.error("Error updating MAP name:", error);
      res.status(500).json({ message: "Failed to update MAP name" });
    }
  });

  // Which assignment roles this plan shows (null = all). Hiding a role keeps saved values.
  app.put('/api/projects/:projectId/map/assignment-roles', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const { id: userId, role: userRole, email: userEmail } = req.session.user;
      if (!(await hasProjectEditAccess(userId, userRole, userEmail, projectId))) {
        return res.status(403).json({ message: "Access denied - edit permissions required to change MAP roles" });
      }
      const parsed = mapAssignmentRolesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid assignment roles", errors: parsed.error.issues });
      }
      const roles = parsed.data.roles && parsed.data.roles.length < MAP_ASSIGNMENT_ROLES.length ? parsed.data.roles : null;
      const metadata = await storage.updateProjectMapAssignmentRoles(projectId, roles);

      await storage.createActivityLog({
        projectId,
        userId,
        action: "updated",
        details: roles ? `Set MAP assignment roles to ${roles.join(", ")}` : "Set MAP assignment roles to all roles",
        targetType: "map_project",
        targetId: projectId,
      });

      res.json({ metadata });
    } catch (error: any) {
      console.error("Error updating MAP assignment roles:", error);
      res.status(500).json({ message: "Failed to update MAP assignment roles" });
    }
  });

  // Update MAP phase
  app.put('/api/map/phases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const phaseId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(phaseId)) {
        return res.status(400).json({ message: "Invalid phase ID" });
      }

      // Get the phase to find the associated project
      const phase = await storage.getMapPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ message: "Phase not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, phase.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to modify MAP phase" });
      }

      const parsed = mapPhaseUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid MAP phase update", errors: parsed.error.issues });
      }
      if (parsed.data.stageId != null && !(await storage.journeyStageExists(parsed.data.stageId))) {
        return res.status(400).json({ message: "Journey stage not found" });
      }
      const teamError = await teamAssignmentError(userRole, parsed.data.assignedToTeamId);
      if (teamError) {
        return res.status(teamError.status).json({ message: teamError.message });
      }
      const updates = withCompletionDate(phase, parsed.data);
      const updatedPhase = await storage.updateMapPhase(phaseId, withDateObjects(updates) as any, userId);

      // Create detailed activity log based on what changed
      const changedFields = Object.keys(updates).filter(key => (updates as any)[key] !== undefined);
      let details = `Updated MAP phase "${updatedPhase.name}"`;

      if (updates.status && updates.status !== phase.status) {
        details += ` - Status changed from "${formatStatusValue(phase.status)}" to "${formatStatusValue(updates.status)}"`;
      }
      if (updates.startDate || updates.dueDate || updates.completedDate) {
        details += " - Timeline updated";
      }
      if (changedFields.length > 0) {
        details += ` (Modified: ${changedFields.map(capitalizeFieldName).join(', ')})`;
      }

      await storage.createActivityLog({
        projectId: updatedPhase.projectId,
        userId,
        action: "updated",
        details,
        targetType: "map_phase",
        targetId: phaseId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastPhaseUpdate('updated', updatedPhase, userId);
      }

      emitMapItemUpdated("phase", updatedPhase.projectId, phase, updatedPhase, userId);
      queueOutlookMapDueDateSync(mapItemOwners(phase, updatedPhase));

      res.json(updatedPhase);
    } catch (error: any) {
      console.error("Error updating MAP phase:", error);
      res.status(500).json({ message: "Failed to update MAP phase" });
    }
  });

  // Update MAP step
  app.put('/api/map/steps/:id', isAuthenticated, async (req: any, res) => {
    try {
      const stepId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(stepId)) {
        return res.status(400).json({ message: "Invalid step ID" });
      }

      // Get the step to find the associated project
      const step = await storage.getMapStep(stepId);
      if (!step) {
        return res.status(404).json({ message: "Step not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, step.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to modify MAP step" });
      }

      const parsed = mapItemUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid MAP step update", errors: parsed.error.issues });
      }
      const teamError = await teamAssignmentError(userRole, parsed.data.assignedToTeamId);
      if (teamError) {
        return res.status(teamError.status).json({ message: teamError.message });
      }
      const updates = withCompletionDate(step, parsed.data);
      const updatedStep = await storage.updateMapStep(stepId, withDateObjects(updates) as any, userId);

      // Create detailed activity log based on what changed
      const changedFields = Object.keys(updates).filter(key => (updates as any)[key] !== undefined);
      let details = `Updated MAP step "${updatedStep.name}"`;

      if (updates.status && updates.status !== step.status) {
        details += ` - Status changed from "${formatStatusValue(step.status)}" to "${formatStatusValue(updates.status)}"`;
      }
      if (updates.assignedToUserId !== undefined && updates.assignedToUserId !== step.assignedToUserId) {
        if (updates.assignedToUserId) {
          details += ` - Assigned to user ${updates.assignedToUserId}`;
        } else {
          details += " - Assignment removed";
        }
      }
      if (updates.startDate || updates.dueDate || updates.completedDate) {
        details += " - Timeline updated";
      }
      if (changedFields.length > 0) {
        details += ` (Modified: ${changedFields.map(capitalizeFieldName).join(', ')})`;
      }

      await storage.createActivityLog({
        projectId: updatedStep.projectId,
        userId,
        action: "updated",
        details,
        targetType: "map_step",
        targetId: stepId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastStepUpdate('updated', updatedStep, userId);
      }

      emitMapItemUpdated("step", updatedStep.projectId, step, updatedStep, userId);
      queueOutlookMapDueDateSync(mapItemOwners(step, updatedStep));

      res.json(updatedStep);
    } catch (error: any) {
      console.error("Error updating MAP step:", error);
      res.status(500).json({ message: "Failed to update MAP step" });
    }
  });

  // Update MAP task
  app.put('/api/map/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      // Get the task to find the associated project
      const task = await storage.getMapTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, task.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to modify MAP task" });
      }

      const parsed = mapItemUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid MAP task update", errors: parsed.error.issues });
      }
      const teamError = await teamAssignmentError(userRole, parsed.data.assignedToTeamId);
      if (teamError) {
        return res.status(teamError.status).json({ message: teamError.message });
      }
      const updates = withCompletionDate(task, parsed.data);

      // A new owner: move dates that land on their days off, unless this
      // request sets the dates itself (server/services/map-scheduling.ts).
      const newOwner = taskOwnerId({
        assignedToUserId: updates.assignedToUserId !== undefined ? updates.assignedToUserId : task.assignedToUserId,
        assignedToCustomerUserId:
          updates.assignedToCustomerUserId !== undefined ? updates.assignedToCustomerUserId : task.assignedToCustomerUserId,
      });
      if (newOwner && newOwner !== taskOwnerId(task) && updates.startDate === undefined && updates.dueDate === undefined) {
        try {
          Object.assign(updates, await datesForNewOwner(task.projectId, task, newOwner));
        } catch (err) {
          // Only the dates' fit to the owner's calendar; the assignment still saves.
          console.warn("[map-scheduling] could not check the owner's calendar:", err instanceof Error ? err.message : err);
        }
      }

      const updatedTask = await (storage.updateMapTask as any)(taskId, withDateObjects(updates) as any, userId);

      // Create detailed activity log based on what changed
      const changedFields = Object.keys(updates).filter(key => (updates as any)[key] !== undefined);
      let details = `Updated MAP task "${updatedTask.name}"`;

      if (updates.status && updates.status !== task.status) {
        details += ` - Status changed from "${formatStatusValue(task.status)}" to "${formatStatusValue(updates.status)}"`;
      }
      if (updates.assignedToUserId !== undefined && updates.assignedToUserId !== task.assignedToUserId) {
        if (updates.assignedToUserId) {
          details += ` - Assigned to user ${updates.assignedToUserId}`;
        } else {
          details += " - Assignment removed";
        }
      }
      if (updates.startDate || updates.dueDate || updates.completedDate) {
        details += " - Timeline updated";
      }
      if (changedFields.length > 0) {
        details += ` (Modified: ${changedFields.map(capitalizeFieldName).join(', ')})`;
      }

      await storage.createActivityLog({
        projectId: updatedTask.projectId,
        userId,
        action: "updated",
        details,
        targetType: "map_task",
        targetId: taskId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastTaskUpdate('updated', updatedTask, userId);
      }

      emitMapItemUpdated("task", updatedTask.projectId, task, updatedTask, userId);
      queueOutlookMapDueDateSync(mapItemOwners(task, updatedTask));

      res.json(updatedTask);
    } catch (error: any) {
      console.error("Error updating MAP task:", error);
      res.status(500).json({ message: "Failed to update MAP task" });
    }
  });

  // Delete MAP phase
  app.delete('/api/map/phases/:id', isAuthenticated, async (req: any, res) => {
    try {
      const phaseId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(phaseId)) {
        return res.status(400).json({ message: "Invalid phase ID" });
      }

      // Get the phase to find the associated project
      const phase = await storage.getMapPhase(phaseId);
      if (!phase) {
        return res.status(404).json({ message: "Phase not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, phase.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to delete MAP phase" });
      }

      // Delete the phase with cascade deletion and renumbering
      const { projectId, phaseName } = await storage.deleteMapPhase(phaseId);

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "deleted",
        details: `Deleted MAP phase "${phaseName}" and all associated steps and tasks`,
        targetType: "map_phase",
        targetId: phaseId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastPhaseUpdate('deleted', { id: phaseId, projectId } as any, userId);
      }

      // Invalidate MAP queries

      // Take deleted items' due dates out of their owners' Outlook.
      queueOutlookMapDueDateSyncForProject(projectId);

      res.json({ message: "Phase deleted successfully", projectId });
    } catch (error: any) {
      console.error("Error deleting MAP phase:", error);
      res.status(500).json({ message: "Failed to delete MAP phase" });
    }
  });

  // Delete MAP step
  app.delete('/api/map/steps/:id', isAuthenticated, async (req: any, res) => {
    try {
      const stepId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(stepId)) {
        return res.status(400).json({ message: "Invalid step ID" });
      }

      // Get the step to find the associated project
      const step = await storage.getMapStep(stepId);
      if (!step) {
        return res.status(404).json({ message: "Step not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, step.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to delete MAP step" });
      }

      // Delete the step with cascade deletion and renumbering
      const { projectId, stepName } = await storage.deleteMapStep(stepId);

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "deleted",
        details: `Deleted MAP step "${stepName}" and all associated tasks`,
        targetType: "map_step",
        targetId: stepId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastStepUpdate('deleted', { id: stepId, projectId } as any, userId);
      }

      // Invalidate MAP queries

      // Take deleted items' due dates out of their owners' Outlook.
      queueOutlookMapDueDateSyncForProject(projectId);

      res.json({ message: "Step deleted successfully", projectId });
    } catch (error: any) {
      console.error("Error deleting MAP step:", error);
      res.status(500).json({ message: "Failed to delete MAP step" });
    }
  });

  // Delete MAP task
  app.delete('/api/map/tasks/:id', isAuthenticated, async (req: any, res) => {
    try {
      const taskId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(taskId)) {
        return res.status(400).json({ message: "Invalid task ID" });
      }

      // Get the task to find the associated project
      const task = await storage.getMapTask(taskId);
      if (!task) {
        return res.status(404).json({ message: "Task not found" });
      }

      // Get the step to find project ID
      const step = await storage.getMapStep(task.stepId);
      if (!step) {
        return res.status(404).json({ message: "Associated step not found" });
      }

      // Check if user has EDIT access to the associated project
      const hasEditAccess = await hasProjectEditAccess(userId, userRole, userEmail, step.projectId);
      if (!hasEditAccess) {
        return res.status(403).json({ message: "Access denied - edit permissions required to delete MAP task" });
      }

      // Delete the task with renumbering
      const { projectId, taskName } = await storage.deleteMapTask(taskId);

      // Log activity
      await storage.createActivityLog({
        projectId,
        userId,
        action: "deleted",
        details: `Deleted MAP task "${taskName}"`,
        targetType: "map_task",
        targetId: taskId,
      });

      // Broadcast real-time update
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastTaskUpdate('deleted', { id: taskId, projectId } as any, userId);
      }

      // Invalidate MAP queries

      // Take deleted items' due dates out of their owners' Outlook.
      queueOutlookMapDueDateSyncForProject(projectId);

      res.json({ message: "Task deleted successfully", projectId });
    } catch (error: any) {
      console.error("Error deleting MAP task:", error);
      res.status(500).json({ message: "Failed to delete MAP task" });
    }
  });
}
