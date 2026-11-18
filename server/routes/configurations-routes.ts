// Configuration routes (Phase 8 extraction #24).
//
// Bulk slice covering kanban-card configs, board preferences/audit,
// roles + role-permissions, and email-design CRUD. ~32 handlers:
//
//   Customer Status / Status / Risk Level / Ranking configs
//   Board Preferences + Board Audit
//   Roles CRUD + Role Permissions + Role Users
//   Email Designs CRUD + set-default
//
// Mechanical sed extraction. All public-flagged endpoints (the GET
// ones without isAuthenticated) preserved as-is.
import type { Express } from "express";
import { validatePermissionPayload } from "@shared/permissions";
import { or } from "drizzle-orm";
import { z } from "zod";
import { storage, seedDefaultRoles } from "../storage";
import { warnIfSlowSave } from "../lib/slow-save-warn";
import {
  insertCustomerStatusConfigSchema,
  insertStatusConfigSchema,
  insertRiskLevelConfigSchema,
  insertRankingConfigSchema,
  insertRoleSchema,
  insertRolePermissionSchema,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireAdmin, requireSectionEdit, requireSectionView } from "../lib/section-permissions";
import { getBroadcaster } from "../services/websocket-broadcaster";

// Writes to the Field Settings lists (Account and Project statuses, risk
// levels, rankings) need edit permission on Configuration › Field Settings;
// Admin always passes. They used to accept any signed-in user, Customers and
// Guests included.
const FIELD_SETTINGS_EDIT = requireSectionEdit("config.configuration");

export function registerConfigurationsRoutes(app: Express) {
  app.get("/api/customer-status-configs", async (req, res) => {
    try {
      const configs = await storage.getCustomerStatusConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching customer status configs:", error);
      res.status(500).json({ message: "Failed to fetch customer status configurations" });
    }
  });

  app.post("/api/customer-status-configs", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const validatedData = insertCustomerStatusConfigSchema.parse(req.body);
      const config = await storage.createCustomerStatusConfig(validatedData);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'created',
          configType: 'customer_status',
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error creating customer status config:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create customer status configuration" });
    }
  });

  app.put("/api/customer-status-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const config = await storage.updateCustomerStatusConfig(parseInt(req.params.id as string), req.body);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'updated',
          configType: 'customer_status',
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error updating customer status config:", error);
      res.status(500).json({ message: "Failed to update customer status configuration" });
    }
  });

  app.delete("/api/customer-status-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const configId = parseInt(req.params.id as string);
      await storage.deleteCustomerStatusConfig(configId);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'deleted',
          configType: 'customer_status',
          configId: configId,
          userId: String(req.user.id),
          data: {}
        });
      }
      
      res.json({ message: "Customer status configuration deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting customer status config:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete customer status configuration: This status is still being used in projects. Please change all projects using this status before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete customer status configuration due to an unexpected error" });
    }
  });

  app.post("/api/status-configs", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const validatedData = insertStatusConfigSchema.parse(req.body);
      const config = await storage.createStatusConfig(validatedData);
      res.json(config);
    } catch (error: any) {
      console.error("Error creating status config:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create status configuration" });
    }
  });

  app.put("/api/status-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const config = await storage.updateStatusConfig(parseInt(req.params.id as string), req.body);
      res.json(config);
    } catch (error: any) {
      console.error("Error updating status config:", error);
      res.status(500).json({ message: "Failed to update status configuration" });
    }
  });

  app.delete("/api/status-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      await storage.deleteStatusConfig(parseInt(req.params.id as string));
      res.json({ message: "Status configuration deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting status config:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete status configuration: This status is still being used in projects. Please change all projects using this status before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete status configuration due to an unexpected error" });
    }
  });

  // Risk Level Configuration routes
  app.get("/api/risk-level-configs", async (req, res) => {
    try {
      const configs = await storage.getRiskLevelConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching risk level configs:", error);
      res.status(500).json({ message: "Failed to fetch risk level configurations" });
    }
  });

  app.post("/api/risk-level-configs", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const validatedData = insertRiskLevelConfigSchema.parse(req.body);
      const config = await storage.createRiskLevelConfig(validatedData);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'created',
          configType: 'risk_level' as any,
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error creating risk level config:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create risk level configuration" });
    }
  });

  app.put("/api/risk-level-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const config = await storage.updateRiskLevelConfig(parseInt(req.params.id as string), req.body);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'updated',
          configType: 'risk_level' as any,
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error updating risk level config:", error);
      res.status(500).json({ message: "Failed to update risk level configuration" });
    }
  });

  app.delete("/api/risk-level-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const configId = parseInt(req.params.id as string);
      await storage.deleteRiskLevelConfig(configId);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'deleted',
          configType: 'risk_level' as any,
          configId: configId,
          userId: String(req.user.id),
          data: {}
        });
      }
      
      res.json({ message: "Risk level configuration deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting risk level config:", error);
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete risk level configuration: This level is still being used in projects. Please change all projects using this level before deleting."
        });
      }
      res.status(500).json({ message: "Failed to delete risk level configuration due to an unexpected error" });
    }
  });

  // Ranking Configuration routes
  app.get("/api/ranking-configs", async (req, res) => {
    try {
      const configs = await storage.getRankingConfigs();
      res.json(configs);
    } catch (error: any) {
      console.error("Error fetching ranking configs:", error);
      res.status(500).json({ message: "Failed to fetch ranking configurations" });
    }
  });

  app.post("/api/ranking-configs", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const validatedData = insertRankingConfigSchema.parse(req.body);
      const config = await storage.createRankingConfig(validatedData);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'created',
          configType: 'ranking' as any,
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }
      
      res.json(config);
    } catch (error: any) {
      console.error("Error creating ranking config:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create ranking configuration" });
    }
  });

  app.put("/api/ranking-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    // Task #495: instrument the save path so a Dokploy / Traefik 504
    // can be triaged from the access log alone — see
    // docs/guides/dokploy-traefik-timeouts.md.
    const startMs = Date.now();
    const rawId = req.params.id as string;
    try {
      const config = await storage.updateRankingConfig(parseInt(rawId), req.body);

      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'updated',
          configType: 'ranking' as any,
          configId: config.id,
          userId: String(req.user.id),
          data: { config }
        });
      }

      res.json(config);
    } catch (error: any) {
      console.error("Error updating ranking config:", error);
      res.status(500).json({ message: "Failed to update ranking configuration" });
    } finally {
      warnIfSlowSave('PUT /api/ranking-configs/:id', startMs, { id: rawId });
    }
  });

  app.delete("/api/ranking-configs/:id", isAuthenticated, FIELD_SETTINGS_EDIT, async (req, res) => {
    try {
      const configId = parseInt(req.params.id as string);
      await storage.deleteRankingConfig(configId);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'deleted',
          configType: 'ranking' as any,
          configId: configId,
          userId: String(req.user.id),
          data: {}
        });
      }
      
      res.json({ message: "Ranking configuration deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting ranking config:", error);
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete ranking configuration: This ranking is still being used in projects. Please change all projects using this ranking before deleting."
        });
      }
      res.status(500).json({ message: "Failed to delete ranking configuration due to an unexpected error" });
    }
  });

  app.post("/api/ranking-configs/reset-defaults", isAuthenticated, FIELD_SETTINGS_EDIT, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset rankings to defaults" });
      }
      const { resetRankingDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetRankingDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });

      const wsManager = getBroadcaster();
      if (wsManager) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'updated',
          configType: 'ranking' as any,
          configId: 0,
          userId: String(user.id),
          data: { reset: true, summary },
        });
      }

      res.json({ message: "Ranking defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting ranking defaults:", error);
      res.status(500).json({ message: "Failed to reset ranking defaults" });
    }
  });

  // Board Preferences routes (user column ordering)
  app.get("/api/board-preferences/:userId/:dimension", isAuthenticated, async (req: any, res) => {
    try {
      const { userId, dimension } = req.params;
      
      // Verify user is requesting their own preferences (security check)
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Cannot access another user's preferences" });
      }
      
      const preferences = await storage.getUserBoardPreferences(userId, dimension);
      res.json(preferences);
    } catch (error: any) {
      console.error("Error fetching board preferences:", error);
      res.status(500).json({ message: "Failed to fetch board preferences" });
    }
  });

  app.post("/api/board-preferences/:userId/:dimension", isAuthenticated, async (req: any, res) => {
    try {
      const { userId, dimension } = req.params;
      const { columnOrder } = req.body;
      
      // Verify user is saving their own preferences (security check)
      if (userId !== req.user.id) {
        return res.status(403).json({ message: "Cannot save another user's preferences" });
      }
      
      const preferences = await storage.saveUserBoardPreferences({ userId, dimension, columnOrder });
      res.json(preferences);
    } catch (error: any) {
      console.error("Error saving board preferences:", error);
      res.status(500).json({ message: "Failed to save board preferences" });
    }
  });

  // Board Audit routes (project move history)
  app.get("/api/board-audit", isAuthenticated, async (req, res) => {
    try {
      const { dimension, projectId, limit = '50' } = req.query;
      const auditEvents = await storage.getKanbanAuditEvents({
        dimension: dimension as string,
        projectId: projectId ? parseInt(projectId as string) : undefined,
        limit: parseInt(limit as string)
      });
      res.json(auditEvents);
    } catch (error: any) {
      console.error("Error fetching board audit events:", error);
      res.status(500).json({ message: "Failed to fetch board audit events" });
    }
  });

  app.post("/api/board-audit", isAuthenticated, async (req: any, res) => {
    try {
      const events = req.body.events || [req.body];
      const createdEvents = await storage.createKanbanAuditEvents(events);
      res.json(createdEvents);
    } catch (error: any) {
      console.error("Error creating board audit events:", error);
      res.status(500).json({ message: "Failed to create board audit events" });
    }
  });

  // Role management routes. Reading the role list stays open (the Guide,
  // badges and pickers need names, colors and icons). Changing roles or their
  // permission templates is Admin-only, like user permission writes; these
  // used to accept any signed-in user, Customers and Guests included.
  app.get("/api/roles", async (req, res) => {
    try {
      let roles = await storage.getRoles();

      // Lazy fallback if the boot-time seedDefaultRoles() left the table empty.
      // Re-runs the canonical seeder which uses ON CONFLICT (name) DO UPDATE,
      // so simultaneous first requests can't trip a unique-violation race.
      if (roles.length === 0) {
        await seedDefaultRoles();
        roles = await storage.getRoles();
      }

      res.json(roles);
    } catch (error: any) {
      console.error("Error fetching roles:", error);
      res.status(500).json({ message: "Failed to fetch roles" });
    }
  });

  app.post("/api/roles", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const validatedData = insertRoleSchema.parse(req.body);
      const role = await storage.createRole(validatedData);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'created',
          configType: 'role' as any,
          configId: role.id,
          userId: String(req.user.id),
          data: { role }
        });
      }
      
      res.json(role);
    } catch (error: any) {
      console.error("Error creating role:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create role" });
    }
  });

  app.put("/api/roles/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      // Filter out auto-generated fields that shouldn't be updated
      const { id, createdAt, updatedAt, isSystem, ...updateData } = req.body;
      console.log("Role update data:", updateData);

      // Task #685: any admin save flips is_system → false. The boot-time
      // seedDefaultRoles() gates its ON CONFLICT update on
      // `WHERE is_system = true`, so flipping the flag here is what
      // tells the seeder "this row has been admin-tuned, leave it
      // alone on the next reboot". We never let clients set is_system
      // directly (it's destructured out above) — the policy is owned
      // by the server.
      const role = await storage.updateRole(parseInt(req.params.id as string), {
        ...updateData,
        isSystem: false,
      });
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'updated',
          configType: 'role' as any,
          configId: role.id,
          userId: String(req.user.id),
          data: { role }
        });
      }
      
      res.json(role);
    } catch (error: any) {
      console.error("Error updating role:", error);
      res.status(500).json({ message: "Failed to update role" });
    }
  });

  app.delete("/api/roles/:id", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const roleId = parseInt(req.params.id as string);
      await storage.deleteRole(roleId);
      
      // Broadcast configuration update to all clients
      const wsManager = getBroadcaster();
      if (wsManager && req.user) {
        wsManager.broadcastConfigUpdate({
          type: 'config_update',
          action: 'deleted',
          configType: 'role' as any,
          configId: roleId,
          userId: String(req.user.id),
          data: {}
        });
      }
      
      res.json({ message: "Role deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting role:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete role: This role is still being used by users. Please change all users with this role before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete role due to an unexpected error" });
    }
  });

  // Role permissions routes
  app.get("/api/roles/:id/permissions", isAuthenticated, async (req, res) => {
    try {
      const permissions = await storage.getRolePermissions(parseInt(req.params.id as string));
      res.json(permissions);
    } catch (error: any) {
      console.error("Error fetching role permissions:", error);
      res.status(500).json({ message: "Failed to fetch role permissions" });
    }
  });

  app.post("/api/roles/:id/permissions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = validatePermissionPayload(req.body?.permissions);
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });
      await storage.setRolePermissions(parseInt(req.params.id as string), parsed.permissions);
      res.json({ message: "Role permissions updated successfully" });
    } catch (error: any) {
      console.error("Error updating role permissions:", error);
      res.status(500).json({ message: "Failed to update role permissions" });
    }
  });

  // Saves the role's defaults. With applyToUsers: true (the confirm step in
  // Role Management), every user who has the role gets the same permissions
  // in the same transaction.
  app.put("/api/roles/:id/permissions", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = validatePermissionPayload(req.body?.permissions);
      if (!parsed.ok) return res.status(400).json({ message: parsed.error });
      const roleId = parseInt(req.params.id as string);
      if (req.body?.applyToUsers === true) {
        const role = await storage.getRole(roleId);
        if (!role) return res.status(404).json({ message: "Role not found" });
        const updatedUsers = await storage.setRolePermissionsAndApplyToUsers(roleId, parsed.permissions);
        return res.json({ message: "Role permissions updated successfully", updatedUsers });
      }
      await storage.setRolePermissions(roleId, parsed.permissions);
      res.json({ message: "Role permissions updated successfully", updatedUsers: 0 });
    } catch (error: any) {
      console.error("Error updating role permissions:", error);
      res.status(500).json({ message: "Failed to update role permissions" });
    }
  });

  // Get users by role. Needs sign-in and view access to User Management;
  // it used to answer anyone, signed in or not.
  app.get("/api/roles/:id/users", isAuthenticated, requireSectionView("config.user-management"), async (req, res) => {
    try {
      const users = await storage.getUsersByRole(parseInt(req.params.id as string));
      res.json(users);
    } catch (error: any) {
      console.error("Error fetching users by role:", error);
      res.status(500).json({ message: "Failed to fetch users by role" });
    }
  });

  // Email designs API routes
  app.get('/api/email-designs', isAuthenticated, async (req: any, res) => {
    try {
      const { active } = req.query;
      const designs = await storage.getEmailDesigns(active === 'true');
      res.json(designs);
    } catch (error: any) {
      console.error("Error fetching email designs:", error);
      res.status(500).json({ message: "Failed to fetch email designs" });
    }
  });

  app.get('/api/email-designs/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const design = await storage.getEmailDesign(id);
      if (!design) {
        return res.status(404).json({ message: "Email design not found" });
      }
      res.json(design);
    } catch (error: any) {
      console.error("Error fetching email design:", error);
      res.status(500).json({ message: "Failed to fetch email design" });
    }
  });

  app.post('/api/email-designs', isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can create email designs" });
      }

      // Sanitize HTML content - strip script tags but allow email-safe HTML
      const sanitizedHtml = req.body.htmlRaw?.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      const designData = {
        ...req.body,
        htmlRaw: sanitizedHtml,
        createdBy: req.session.user.id,
        updatedBy: req.session.user.id,
      };

      const design = await storage.createEmailDesign(designData);
      res.status(201).json(design);
    } catch (error: any) {
      console.error("Error creating email design:", error);
      res.status(500).json({ message: "Failed to create email design" });
    }
  });

  app.put('/api/email-designs/:id', isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can update email designs" });
      }

      // Sanitize HTML content - strip script tags but allow email-safe HTML
      const sanitizedHtml = req.body.htmlRaw?.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      const updates = {
        ...req.body,
        htmlRaw: sanitizedHtml,
        updatedBy: req.session.user.id,
      };

      const design = await storage.updateEmailDesign(parseInt(req.params.id as string), updates);
      res.json(design);
    } catch (error: any) {
      console.error("Error updating email design:", error);
      res.status(500).json({ message: "Failed to update email design" });
    }
  });

  app.delete('/api/email-designs/:id', isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permissions
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can delete email designs" });
      }

      const design = await storage.getEmailDesign(parseInt(req.params.id as string));

      // The current default design cannot be deleted — an admin must
      // promote another design to default first via
      // PATCH /api/email-designs/:id/set-default. Without this guard
      // the templates that fall back to the default wrapper would
      // suddenly send unwrapped (Task #589). This check runs before
      // the system-protection check so the precise "set another as
      // default" message wins for the (rare) row that is both system
      // and default.
      if (design && design.isDefault) {
        return res.status(400).json({
          message: "Set another design as default before deleting this one.",
        });
      }

      // Check if design is a system design
      if (design && design.isSystem) {
        return res.status(400).json({
          message: "Cannot delete system email design. System designs are protected and cannot be removed."
        });
      }

      // Check if design is referenced by templates
      const templates = await storage.getEmailTemplates();
      const referencedTemplates = templates.filter(t => t.designId === parseInt(req.params.id as string));

      if (referencedTemplates.length > 0) {
        return res.status(400).json({
          message: `Cannot delete email design: It is used by ${referencedTemplates.length} email template(s). Please update those templates first or set the design to be inactive.`
        });
      }

      await storage.deleteEmailDesign(parseInt(req.params.id as string));
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting email design:", error);
      res.status(500).json({ message: "Failed to delete email design" });
    }
  });

  // Promote a design to be the default wrapper (Task #589). Admin-only.
  // The storage method runs the demote-old / promote-new updates in a
  // single transaction so concurrent calls cannot leave the table with
  // zero or two defaults.
  app.patch('/api/email-designs/:id/set-default', isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can change the default email design" });
      }

      const id = parseInt(req.params.id as string);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Invalid design id" });
      }

      const promoted = await storage.setDefaultEmailDesign(id);
      res.json(promoted);
    } catch (error: any) {
      if (error?.code === 'NOT_FOUND') {
        return res.status(404).json({ message: "Email design not found" });
      }
      if (error?.code === 'INACTIVE_DESIGN') {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error setting default email design:", error);
      res.status(500).json({ message: "Failed to set default email design" });
    }
  });


  // Industry routes extracted to server/routes/industries-routes.ts
  // (Phase 8 extraction #1 — registerIndustriesRoutes).
  // Compliance routes (including the public GET /api/compliance-regulations
  // that previously lived right here) extracted to
  // server/routes/compliance-routes.ts (Phase 8 extraction #2 —
  // registerComplianceRoutes).


}
