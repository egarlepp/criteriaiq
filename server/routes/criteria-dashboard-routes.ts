// Success Criteria + Documents + Dashboard + Activities + Metric
// Snapshots routes (Phase 8 extraction #27).
//
// Bundled remaining-business-logic slice. ~30 handlers covering:
//
//   /api/success-criteria/link + CRUD
//   /api/documents/:id/usage (list and delete live in documents-routes.ts)
//   /api/dashboard/stats + map-stats + layouts CRUD + /api/dashboard-config
//   /api/projects/:id/activity + activities + notification-settings
//   /api/metrics/* (history, snapshot, definitions, current)
//
// Mechanical sed extraction.
import type { Express } from "express";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { eq, or, inArray, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertSuccessCriteriaSchema,
  projects,
  users,
  customers,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess, hasProjectEditAccess } from "../lib/project-access";
import { userCanEditSection } from "../lib/section-permissions";
import { getUserAccessibleCustomers } from "../lib/customer-access";
import { emitCriterionUpdated } from "../services/automation-events";
import { criterionPlacementSchema } from "@shared/value-journey";

const uploadsDir = path.join(process.cwd(), 'attached_assets');

// Fields a success-criteria update may never change. projectId is fixed so
// a criterion can't be moved onto a project the caller can't edit.
const IMMUTABLE_CRITERIA_FIELDS = ["id", "projectId", "createdAt", "updatedAt", "lineNumber"] as const;

function stripImmutableCriteriaFields(body: unknown): Record<string, unknown> {
  const updates = { ...((body ?? {}) as Record<string, unknown>) };
  for (const field of IMMUTABLE_CRITERIA_FIELDS) delete updates[field];
  return updates;
}

/**
 * Checks a criterion's priority and MAP phase in a create or update body:
 * the priority must be must_have or nice_to_have and the phase must belong
 * to the criterion's project. Returns an error message, or null when fine.
 */
async function placementError(body: Record<string, unknown>, projectId: number): Promise<string | null> {
  const parsed = criterionPlacementSchema.safeParse({ priority: body.priority, mapPhaseId: body.mapPhaseId });
  if (!parsed.success) return "Priority must be must_have or nice_to_have, and the phase a MAP phase id";
  if (parsed.data.mapPhaseId != null && !(await storage.mapPhaseInProject(parsed.data.mapPhaseId, projectId))) {
    return "That MAP phase is not part of this project";
  }
  return null;
}

const LIBRARY_LINK_SECTIONS: Record<string, string[]> = {
  criteria: ["success-criteria.solutions", "success-criteria.criteria", "template_management.criteria-builder"],
  outcomes: ["success-criteria.criteria", "success-criteria.outcomes", "template_management.criteria-builder"],
  actions: ["success-criteria.outcomes", "success-criteria.actions", "template_management.criteria-builder"],
};

/** True when the session user may edit the project that owns the criterion. */
async function canEditProject(req: any, projectId: number): Promise<boolean> {
  const { id, role, email } = req.session.user;
  return hasProjectEditAccess(id, role, email, projectId);
}

export function registerCriteriaDashboardRoutes(app: Express) {
  app.put("/api/success-criteria/link", isAuthenticated, async (req, res) => {
    try {
      const { type, parentId, childIds } = req.body;

      // Validate input
      if (!type || !parentId || !Array.isArray(childIds)) {
        return res.status(400).json({ message: "Invalid request data" });
      }

      const numericParentId = parseInt(parentId.toString());
      const numericChildIds = childIds.map(id => parseInt(id.toString()));

      if (isNaN(numericParentId) || numericChildIds.some(id => isNaN(id))) {
        return res.status(400).json({ message: "Invalid ID format" });
      }

      // Linking edits the global library, so it needs edit permission on
      // either side of the link (or the Criteria Builder that links them).
      const linkSections = LIBRARY_LINK_SECTIONS[type as string];
      if (linkSections) {
        let allowed = false;
        for (const section of linkSections) {
          if (await userCanEditSection(req, section)) { allowed = true; break; }
        }
        if (!allowed) {
          return res.status(403).json({ message: "You do not have permission to make this change" });
        }
      }

      if (type === 'criteria') {
        // Link criteria to a solution (product)
        await storage.linkCriteriaToProduct(numericParentId, numericChildIds);
      } else if (type === 'outcomes') {
        // Link outcomes to a criteria
        await storage.linkOutcomesToCriteria(numericParentId, numericChildIds);
      } else if (type === 'actions') {
        // Link actions to an outcome
        await storage.linkActionsToOutcome(numericParentId, numericChildIds);
      } else {
        return res.status(400).json({ message: "Invalid relationship type" });
      }

      res.json({ success: true, message: "Relationships updated successfully" });
    } catch (error: any) {
      console.error("Error updating relationships:", error);
      res.status(500).json({ message: "Failed to update relationships" });
    }
  });

  // Check document usage in projects
  app.get("/api/documents/:id/usage", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id as string);
      const projects = await storage.getProjectsUsingDocument(documentId);

      res.json({
        isUsed: projects.length > 0,
        projects: projects,
        count: projects.length
      });
    } catch (error: any) {
      console.error("Error checking document usage:", error);
      res.status(500).json({ message: "Failed to check document usage" });
    }
  });


  // Success Criteria routes
  app.post('/api/success-criteria', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const criteriaData = insertSuccessCriteriaSchema.parse(req.body);

      if (!(await canEditProject(req, criteriaData.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }
      const createPlacementError = await placementError(criteriaData, criteriaData.projectId);
      if (createPlacementError) return res.status(400).json({ message: createPlacementError });

      const criteria = await storage.createSuccessCriteria(criteriaData);

      // Log activity
      await storage.createActivityLog({
        projectId: criteria.projectId,
        userId,
        action: "created",
        details: `Added success criteria: ${criteria.criterion}`,
        targetType: "criteria",
        targetId: criteria.id,
      });

      res.status(201).json(criteria);
    } catch (error: any) {
      console.error("Error creating success criteria:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create success criteria" });
    }
  });

  app.put('/api/success-criteria/:id', isAuthenticated, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      if (isNaN(criteriaId)) {
        return res.status(400).json({ message: "Invalid success criteria ID" });
      }
      const updates = stripImmutableCriteriaFields(req.body);

      const previousCriteria = await storage.getSuccessCriterionById(criteriaId);
      if (!previousCriteria) {
        return res.status(404).json({ message: "Success criteria not found" });
      }
      if (!(await canEditProject(req, previousCriteria.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }
      const updatePlacementError = await placementError(updates, previousCriteria.projectId);
      if (updatePlacementError) return res.status(400).json({ message: updatePlacementError });
      const updatedCriteria = await storage.updateSuccessCriteria(criteriaId, updates);

      // Log activity
      await storage.createActivityLog({
        projectId: updatedCriteria.projectId,
        userId,
        action: "updated",
        details: `Updated success criteria: ${updatedCriteria.criterion}`,
        targetType: "criteria",
        targetId: criteriaId,
      });

      emitCriterionUpdated(previousCriteria, updatedCriteria, userId);

      res.json(updatedCriteria);
    } catch (error: any) {
      console.error("Error updating success criteria:", error);
      res.status(500).json({ message: "Failed to update success criteria" });
    }
  });



  app.patch('/api/success-criteria/:id', isAuthenticated, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      if (isNaN(criteriaId)) {
        return res.status(400).json({ message: "Invalid success criteria ID" });
      }
      const updates = stripImmutableCriteriaFields(req.body);

      // Validate that we have at least one field to update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No fields to update" });
      }

      const previousCriteria = await storage.getSuccessCriterionById(criteriaId);
      if (!previousCriteria) {
        return res.status(404).json({ message: "Success criteria not found" });
      }
      if (!(await canEditProject(req, previousCriteria.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }
      const updatePlacementError = await placementError(updates, previousCriteria.projectId);
      if (updatePlacementError) return res.status(400).json({ message: updatePlacementError });
      const updatedCriteria = await storage.updateSuccessCriteria(criteriaId, updates);
      emitCriterionUpdated(previousCriteria, updatedCriteria, userId);

      // Log activity for status updates
      if (updates.status) {
        await storage.createActivityLog({
          projectId: updatedCriteria.projectId,
          userId,
          action: "updated",
          details: `Updated success criteria status to: ${updates.status}`,
          targetType: "criteria",
          targetId: criteriaId,
        });
      }

      res.json(updatedCriteria);
    } catch (error: any) {
      console.error("Error updating success criteria:", error);
      res.status(500).json({ message: "Failed to update success criteria" });
    }
  });

  app.delete('/api/success-criteria/:id', isAuthenticated, async (req: any, res) => {
    try {
      const criteriaId = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      if (isNaN(criteriaId)) {
        return res.status(400).json({ message: "Invalid success criteria ID" });
      }

      const criteria = await storage.getSuccessCriterionById(criteriaId);
      if (!criteria) {
        return res.status(404).json({ message: "Success criteria not found" });
      }
      if (!(await canEditProject(req, criteria.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }

      await storage.deleteSuccessCriteria(criteriaId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting success criteria:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete success criteria: This criteria has related data that must be removed first. Please contact an administrator for assistance."
        });
      }

      res.status(500).json({ message: "Failed to delete success criteria due to an unexpected error" });
    }
  });

  // Dashboard stats
  app.get('/api/dashboard/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const stats = await storage.getDashboardStats(userId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch dashboard stats" });
    }
  });

  // MAP dashboard stats
  app.get('/api/dashboard/map-stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const mapStats = await storage.getMapDashboardStats(userId);
      res.json(mapStats);
    } catch (error: any) {
      console.error("Error fetching MAP dashboard stats:", error);
      res.status(500).json({ message: "Failed to fetch MAP dashboard stats" });
    }
  });

  // Dashboard Layout API endpoints
  app.get('/api/dashboard/layouts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const layouts = await storage.getDashboardLayouts(userId);
      res.json(layouts);
    } catch (error: any) {
      console.error("Error fetching dashboard layouts:", error);
      res.status(500).json({ message: "Failed to fetch dashboard layouts" });
    }
  });

  app.get('/api/dashboard/layouts/global', isAuthenticated, async (req: any, res) => {
    try {
      const layouts = await storage.getGlobalDashboardLayouts();
      res.json(layouts);
    } catch (error: any) {
      console.error("Error fetching global dashboard layouts:", error);
      res.status(500).json({ message: "Failed to fetch global layouts" });
    }
  });

  app.get('/api/dashboard/layouts/default', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const layout = await storage.getUserDefaultLayout(userId);
      res.json(layout || null);
    } catch (error: any) {
      console.error("Error fetching default dashboard layout:", error);
      res.status(500).json({ message: "Failed to fetch default layout" });
    }
  });

  app.get('/api/dashboard/layouts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const layout = await storage.getDashboardLayout(id);
      if (!layout) {
        return res.status(404).json({ message: "Layout not found" });
      }
      res.json(layout);
    } catch (error: any) {
      console.error("Error fetching dashboard layout:", error);
      res.status(500).json({ message: "Failed to fetch layout" });
    }
  });

  app.post('/api/dashboard/layouts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { name, description, layoutConfig, isGlobal } = req.body;

      // Only Admin role can create global layouts
      if (isGlobal && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only admins can create global layouts" });
      }

      const layout = await storage.createDashboardLayout({
        name,
        description,
        layoutConfig,
        isGlobal: isGlobal || false,
        userId: isGlobal ? null : userId,
        createdBy: userId,
      });

      res.status(201).json(layout);
    } catch (error: any) {
      console.error("Error creating dashboard layout:", error);
      res.status(500).json({ message: "Failed to create layout" });
    }
  });

  app.put('/api/dashboard/layouts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const id = parseInt(req.params.id as string);
      const updates = req.body;

      const existing = await storage.getDashboardLayout(id);
      if (!existing) {
        return res.status(404).json({ message: "Layout not found" });
      }

      // Check permissions
      if (existing.isGlobal && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only admins can edit global layouts" });
      }
      if (!existing.isGlobal && existing.userId !== userId && userRole !== 'Admin') {
        return res.status(403).json({ message: "You can only edit your own layouts" });
      }

      const layout = await storage.updateDashboardLayout(id, updates);
      res.json(layout);
    } catch (error: any) {
      console.error("Error updating dashboard layout:", error);
      res.status(500).json({ message: "Failed to update layout" });
    }
  });

  app.delete('/api/dashboard/layouts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const id = parseInt(req.params.id as string);

      const existing = await storage.getDashboardLayout(id);
      if (!existing) {
        return res.status(404).json({ message: "Layout not found" });
      }

      // Check permissions
      if (existing.isGlobal && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only admins can delete global layouts" });
      }
      if (!existing.isGlobal && existing.userId !== userId && userRole !== 'Admin') {
        return res.status(403).json({ message: "You can only delete your own layouts" });
      }

      await storage.deleteDashboardLayout(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting dashboard layout:", error);
      res.status(500).json({ message: "Failed to delete layout" });
    }
  });

  app.post('/api/dashboard/layouts/:id/set-default', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const id = parseInt(req.params.id as string);

      await storage.setUserDefaultLayout(userId, id);
      res.json({ message: "Default layout set successfully" });
    } catch (error: any) {
      console.error("Error setting default layout:", error);
      res.status(500).json({ message: "Failed to set default layout" });
    }
  });

  // Dashboard Config endpoints (Phase 3: Admin Builder)
  app.get('/api/dashboard-config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const config = await storage.getDashboardConfig({ userId, role: userRole });
      
      if (!config) {
        return res.status(404).json({ message: "No dashboard configuration found" });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error fetching dashboard config:", error);
      res.status(500).json({ message: "Failed to fetch dashboard configuration" });
    }
  });

  app.post('/api/dashboard-config', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const { config, role, saveAsSystemDefault } = req.body;

      if (!config) {
        return res.status(400).json({ message: "Config is required" });
      }

      // Determine if saving as system default (admin only) or user-specific
      const isSystemDefault = saveAsSystemDefault === true;
      
      if (isSystemDefault && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only admins can save system default configurations" });
      }

      const savedConfig = await storage.upsertDashboardConfig({
        userId: isSystemDefault ? null : userId,
        role: role || "All",
        config,
        isActive: true,
      });

      res.status(201).json(savedConfig);
    } catch (error: any) {
      console.error("Error saving dashboard config:", error);
      res.status(500).json({ message: "Failed to save dashboard configuration" });
    }
  });

  // Support-request analytics + trends extracted to
  // server/routes/support-requests-routes.ts (Phase 8 extraction #6 —
  // registerSupportRequestsRoutes).

  // Activity logs
  app.get('/api/projects/:id/activity', isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const activities = await storage.getActivityLogsByPoc(projectId);
      res.json(activities);
    } catch (error: any) {
      console.error("Error fetching activity logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });

  // Tag endpoints extracted to server/routes/tags-routes.ts
  // (Phase 8 extraction #5 — registerTagsRoutes).

  // Status Configuration routes
  app.get("/api/status-configs", async (req, res) => {
    try {
      const configs = await storage.getStatusConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching status configs:", error);
      res.status(500).json({ message: "Failed to fetch status configurations" });
    }
  });





  // ============ END CLIENT ERROR LOGS API ENDPOINTS ============




  // Get project activities with user information
  app.get('/api/projects/:projectId/activities', isAuthenticated, async (req, res) => {
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

      // Parse query parameters for filtering and pagination
      const targetTypes = req.query.targetTypes 
        ? (Array.isArray(req.query.targetTypes) ? req.query.targetTypes : [req.query.targetTypes])
        : undefined;
      
      // Validate and sanitize pagination parameters
      const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const parsedOffset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const limit = isNaN(parsedLimit) || parsedLimit < 1 ? 100 : Math.min(parsedLimit, 500); // Max 500
      const offset = isNaN(parsedOffset) || parsedOffset < 0 ? 0 : parsedOffset;

      // Get activity logs with user information
      const activities = await storage.getProjectActivities(projectId, {
        targetTypes: targetTypes as string[] | undefined,
        limit,
        offset
      });
      res.json(activities);
    } catch (error: any) {
      console.error("Error fetching project activities:", error);
      res.status(500).json({ message: "Failed to fetch project activities" });
    }
  });


  // GET /api/projects/:id/notification-settings is served by
  // email-preferences-routes.ts (registered first); a second copy here was
  // never reached and has been removed.

  // Update project-specific notification settings for a user
  app.put("/api/projects/:projectId/users/:targetUserId/notification-settings", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      // User ids are strings ("user_<uuid>"); parseInt turned every one into
      // NaN, so no one could save their MAP notification settings.
      const targetUserId = String(req.params.targetUserId ?? "").trim();
      const userId = req.session.user.id;
      const userRole = req.session.user.role;
      const userEmail = req.session.user.email;

      if (isNaN(projectId) || !targetUserId || targetUserId.length > 255) {
        return res.status(400).json({ message: "Invalid project ID or user ID" });
      }

      // Check if user has access to this project
      const hasAccess = await hasProjectAccess(userId, userRole, userEmail, projectId);
      if (!hasAccess) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }

      // Check if current user can edit settings for target user
      // Users can edit their own, Admin/Engineer can edit all
      const canEdit = (userId === targetUserId) || (userRole === 'Admin') || (userRole === 'Engineer');
      
      if (!canEdit) {
        return res.status(403).json({ message: "Access denied - you can only edit your own notification settings" });
      }

      // Validate request body
      const { phasesSettings, stepsSettings, tasksSettings } = req.body;

      // Validate that settings are arrays of valid event types
      const validEvents = ['assigned', 'completed', 'due_soon', 'status_changed'];
      const validateSettings = (settings: any, fieldName: string): string[] => {
        if (!Array.isArray(settings)) {
          throw new Error(`${fieldName} must be an array`);
        }
        const invalidEvents = settings.filter(e => !validEvents.includes(e));
        if (invalidEvents.length > 0) {
          throw new Error(`${fieldName} contains invalid events: ${invalidEvents.join(', ')}`);
        }
        return settings;
      };

      try {
        validateSettings(phasesSettings, 'phasesSettings');
        validateSettings(stepsSettings, 'stepsSettings');
        validateSettings(tasksSettings, 'tasksSettings');
      } catch (validationError: any) {
        return res.status(400).json({ message: validationError.message });
      }

      // Arrays bound into a raw sql template expand to a value list, so the
      // old INSERT ... VALUES never matched the column count; go through storage.
      await storage.upsertProjectMapNotificationSettings(projectId, targetUserId, {
        phasesSettings,
        stepsSettings,
        tasksSettings,
      });

      res.json({ 
        message: "Notification settings updated successfully",
        settings: {
          projectId,
          userId: targetUserId,
          phasesSettings,
          stepsSettings,
          tasksSettings,
        }
      });
    } catch (error: any) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ message: "Failed to update notification settings" });
    }
  });

  // ============ END MAP API ENDPOINTS ============


  // ============ END GAP ANALYSIS API ENDPOINTS ============



  // ============ END PCOS API ENDPOINTS ============

  // ============ METRIC SNAPSHOTS API ENDPOINTS ============
  
  // Get history for a single metric
  app.get('/api/metrics/history/:key', isAuthenticated, async (req: any, res) => {
    try {
      const { key } = req.params;
      const limit = parseInt(req.query.limit as string) || 6;
      
      const { metricSnapshotService } = await import('../services/metric-snapshot-service');
      const history = await metricSnapshotService.getHistory(key, limit);
      
      res.json(history);
    } catch (error: any) {
      console.error('Error fetching metric history:', error);
      res.status(500).json({ message: 'Failed to fetch metric history' });
    }
  });

  // Get history for multiple metrics
  app.post('/api/metrics/history/batch', isAuthenticated, async (req: any, res) => {
    try {
      const { keys, limit = 6 } = req.body;
      
      if (!keys || !Array.isArray(keys)) {
        return res.status(400).json({ message: 'keys array is required' });
      }
      
      const { metricSnapshotService } = await import('../services/metric-snapshot-service');
      const history = await metricSnapshotService.getMultipleHistory(keys, limit);
      
      res.json(history);
    } catch (error: any) {
      console.error('Error fetching batch metric history:', error);
      res.status(500).json({ message: 'Failed to fetch metric history' });
    }
  });

  // Capture snapshot for all metrics (admin only - can be called by scheduler)
  app.post('/api/metrics/snapshot', isAuthenticated, async (req: any, res) => {
    try {
      const { metricSnapshotService } = await import('../services/metric-snapshot-service');
      const results = await metricSnapshotService.captureAllMetrics();
      
      res.json({ 
        message: 'Snapshot captured successfully', 
        count: results.length,
        metrics: results 
      });
    } catch (error: any) {
      console.error('Error capturing metric snapshot:', error);
      res.status(500).json({ message: 'Failed to capture snapshot' });
    }
  });

  // Get all metric definitions
  app.get('/api/metrics/definitions', isAuthenticated, async (req: any, res) => {
    try {
      const { metricSnapshotService } = await import('../services/metric-snapshot-service');
      const definitions = metricSnapshotService.getAllMetricDefinitions().map(d => ({
        key: d.key,
        name: d.name,
        description: d.description,
        category: d.category,
        unit: d.unit,
      }));
      
      res.json(definitions);
    } catch (error: any) {
      console.error('Error fetching metric definitions:', error);
      res.status(500).json({ message: 'Failed to fetch metric definitions' });
    }
  });

  // Calculate current value for a single metric (without saving)
  app.get('/api/metrics/current/:key', isAuthenticated, async (req: any, res) => {
    try {
      const { key } = req.params;
      
      const { metricSnapshotService } = await import('../services/metric-snapshot-service');
      const value = await metricSnapshotService.calculateMetric(key);
      
      if (value === null) {
        return res.status(404).json({ message: 'Metric not found' });
      }
      
      const definition = metricSnapshotService.getMetricDefinition(key);
      
      res.json({ 
        key, 
        value, 
        name: definition?.name,
        unit: definition?.unit 
      });
    } catch (error: any) {
      console.error('Error calculating metric:', error);
      res.status(500).json({ message: 'Failed to calculate metric' });
    }
  });
}
