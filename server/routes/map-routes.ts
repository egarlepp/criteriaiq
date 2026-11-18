// MAP (Mutual Action Plan) routes — first slice (Phase 8 extraction #9a).
//
// The full MAP surface in routes.ts is ~2,400 lines spread across multiple
// scattered blocks (initialize, dashboard, automation-config, templates,
// project map, phases/steps/tasks, assignments, management, import-csv,
// analytics) and includes WebSocket broadcasts and a multer instance for
// CSV upload. To keep risk small, this first slice only takes the pieces
// that are pure storage + db reads:
//
//   - POST   /api/map/initialize                                       (admin)
//   - GET    /api/map/dashboard-metrics
//   - GET    /api/map/dashboard-projects
//   - GET    /api/map-automation-config
//   - PUT    /api/map-automation-config
//   - GET    /api/projects/:projectId/map-automation-config
//   - PUT    /api/projects/:projectId/map-automation-config
//   - DELETE /api/projects/:projectId/map-automation-config
//
// Subsequent slices will add the rest progressively.
import type { Express } from "express";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { isAuthenticated } from "../auth/simpleAuth";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { requireInternalUser } from "../lib/internal-access";
import { requireSectionEdit } from "../lib/section-permissions";
import { hasProjectAccess, hasProjectEditAccess } from "../lib/project-access";

/**
 * A project's automation config from a request body: the server sets the
 * row's id and project, never the caller.
 */
function automationConfigBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const { id: _id, projectId: _projectId, createdAt: _createdAt, updatedAt: _updatedAt, _metadata, ...rest } =
    body as Record<string, unknown>;
  return rest;
}

export function registerMapRoutes(app: Express) {
  // Initialize default MAP template (admin only)
  app.post('/api/map/initialize', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: `Admin access required. Current role: ${userRole}` });
      }

      const result = await storage.initializeDefaultMapTemplate();
      if (result) {
        res.json({
          message: 'Default MAP template initialized successfully',
          template: result
        });
      } else {
        res.json({ message: 'MAP template already exists' });
      }
    } catch (error: any) {
      console.error("Error initializing MAP template:", error);
      res.status(500).json({ message: "Failed to initialize MAP template" });
    }
  });

  app.get('/api/map/dashboard-metrics', isAuthenticated, async (req: any, res) => {
    try {
      const demo = isCurrentRequestDemo();
      const demoFlag = demo ? "TRUE" : "FALSE";
      const result = await db.execute(sql`
        WITH active_project_ids AS (
          SELECT id FROM projects
          WHERE LOWER(status) NOT IN ('closed', 'completed', 'cancelled', 'archived', 'closed won', 'closed lost')
            AND is_demo = ${sql.raw(demoFlag)}
        )
        SELECT
          (SELECT count(*) FROM map_phases WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) != 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS active_phases,
          (SELECT count(*) FROM map_phases WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_phases,
          (SELECT count(*) FROM map_phases WHERE project_id IN (SELECT id FROM active_project_ids) AND is_demo = ${sql.raw(demoFlag)}) AS total_phases,
          (SELECT count(*) FROM map_steps WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) != 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS active_steps,
          (SELECT count(*) FROM map_steps WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_steps,
          (SELECT count(*) FROM map_steps WHERE project_id IN (SELECT id FROM active_project_ids) AND is_demo = ${sql.raw(demoFlag)}) AS total_steps,
          (SELECT count(*) FROM map_tasks WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) != 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS active_tasks,
          (SELECT count(*) FROM map_tasks WHERE project_id IN (SELECT id FROM active_project_ids) AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_tasks,
          (SELECT count(*) FROM map_tasks WHERE project_id IN (SELECT id FROM active_project_ids) AND is_demo = ${sql.raw(demoFlag)}) AS total_tasks
      `);
      const row = result.rows[0] || {};
      res.json({
        phases: {
          active: Number(row.active_phases) || 0,
          completed: Number(row.completed_phases) || 0,
          total: Number(row.total_phases) || 0,
        },
        steps: {
          active: Number(row.active_steps) || 0,
          completed: Number(row.completed_steps) || 0,
          total: Number(row.total_steps) || 0,
        },
        tasks: {
          active: Number(row.active_tasks) || 0,
          completed: Number(row.completed_tasks) || 0,
          total: Number(row.total_tasks) || 0,
        },
      });
    } catch (error: any) {
      console.error("Error fetching MAP dashboard metrics:", error);
      res.status(500).json({ message: "Failed to fetch MAP dashboard metrics" });
    }
  });

  app.get('/api/map/dashboard-projects', isAuthenticated, async (req: any, res) => {
    try {
      const demo = isCurrentRequestDemo();
      const demoFlag = demo ? "TRUE" : "FALSE";
      const result = await db.execute(sql`
        WITH projects_with_maps AS (
          SELECT DISTINCT p.id, p.name, p.status, p.risk,
                 p.start_date, p.end_date, p.customer_name,
                 (SELECT count(*) FROM map_phases WHERE project_id = p.id AND is_demo = ${sql.raw(demoFlag)}) AS phase_count,
                 (SELECT count(*) FROM map_phases WHERE project_id = p.id AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_phases,
                 (SELECT count(*) FROM map_steps WHERE project_id = p.id AND is_demo = ${sql.raw(demoFlag)}) AS step_count,
                 (SELECT count(*) FROM map_steps WHERE project_id = p.id AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_steps,
                 (SELECT count(*) FROM map_tasks WHERE project_id = p.id AND is_demo = ${sql.raw(demoFlag)}) AS task_count,
                 (SELECT count(*) FROM map_tasks WHERE project_id = p.id AND LOWER(status) = 'completed' AND is_demo = ${sql.raw(demoFlag)}) AS completed_tasks
          FROM projects p
          WHERE LOWER(p.status) NOT IN ('closed', 'completed', 'cancelled', 'archived', 'closed won', 'closed lost')
            AND p.is_demo = ${sql.raw(demoFlag)}
            AND EXISTS (SELECT 1 FROM map_phases WHERE project_id = p.id AND is_demo = ${sql.raw(demoFlag)})
        )
        SELECT id, name, status, risk,
               start_date, end_date, customer_name,
               phase_count, completed_phases,
               step_count, completed_steps,
               task_count, completed_tasks,
          CASE WHEN task_count > 0 THEN ROUND((completed_tasks::numeric / task_count::numeric) * 100) ELSE 0 END AS computed_progress
        FROM projects_with_maps
        ORDER BY name ASC
      `);
      res.json(result.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        risk: row.risk,
        progress: Number(row.computed_progress) || 0,
        startDate: row.start_date,
        endDate: row.end_date,
        customerName: row.customer_name,
        mapStats: {
          phases: { total: Number(row.phase_count) || 0, completed: Number(row.completed_phases) || 0 },
          steps: { total: Number(row.step_count) || 0, completed: Number(row.completed_steps) || 0 },
          tasks: { total: Number(row.task_count) || 0, completed: Number(row.completed_tasks) || 0 },
        }
      })));
    } catch (error: any) {
      console.error("Error fetching MAP dashboard projects:", error);
      res.status(500).json({ message: "Failed to fetch MAP dashboard projects" });
    }
  });

  // MAP Automation Configuration routes. Automation is how the internal team
  // runs a plan, so external users (Customer, Guest, Partner) can't read or
  // change it (shared/map-drawer-tabs.ts hides the drawer tab from them too).
  // The org-wide defaults need Workflow Automation edit; a project's own
  // config needs edit access to that project.
  app.get('/api/map-automation-config', isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;

      // Get config or create default if doesn't exist
      let config = await storage.getMapAutomationConfig(projectId);

      if (!config) {
        config = await storage.getOrCreateDefaultMapAutomationConfig();
      }

      res.json(config);
    } catch (error: any) {
      console.error("Error fetching MAP automation config:", error);
      res.status(500).json({ message: "Failed to fetch MAP automation config" });
    }
  });

  app.put('/api/map-automation-config', isAuthenticated, requireSectionEdit("config.workflow-automation"), async (req, res) => {
    try {
      const config = automationConfigBody(req.body);

      const updated = await storage.updateMapAutomationConfig(config);

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating MAP automation config:", error);
      res.status(500).json({ message: "Failed to update MAP automation config" });
    }
  });

  // Project-specific MAP Automation Configuration routes
  app.get('/api/projects/:projectId/map-automation-config', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const { id: userId, role, email } = req.session.user;
      if (!(await hasProjectAccess(userId, role, email, projectId))) {
        return res.status(403).json({ message: "Access denied - insufficient project permissions" });
      }

      // Get config with cascading fallback (project -> global -> create default)
      const config = await storage.getProjectAutomationConfigWithFallback(projectId);

      // Include metadata about whether this is project-specific or inherited
      const isProjectSpecific = config.projectId === projectId;

      res.json({
        ...config,
        _metadata: {
          isProjectSpecific,
          source: isProjectSpecific ? 'project' : 'global'
        }
      });
    } catch (error: any) {
      console.error("Error fetching project MAP automation config:", error);
      res.status(500).json({ message: "Failed to fetch project MAP automation config" });
    }
  });

  app.put('/api/projects/:projectId/map-automation-config', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const { id: userId, role, email } = req.session.user;
      if (!(await hasProjectEditAccess(userId, role, email, projectId))) {
        return res.status(403).json({ message: "Access denied - edit permissions required to change MAP automation" });
      }

      const config = automationConfigBody(req.body);

      // Create/update project-specific config
      const updated = await storage.updateMapAutomationConfig({
        ...config,
        projectId
      });

      res.json(updated);
    } catch (error: any) {
      console.error("Error updating project MAP automation config:", error);
      res.status(500).json({ message: "Failed to update project MAP automation config" });
    }
  });

  app.delete('/api/projects/:projectId/map-automation-config', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      const { id: userId, role, email } = req.session.user;
      if (!(await hasProjectEditAccess(userId, role, email, projectId))) {
        return res.status(403).json({ message: "Access denied - edit permissions required to change MAP automation" });
      }

      // Delete project-specific config (reverts to global defaults)
      await storage.deleteMapAutomationConfig(projectId);

      // Return the global config after deletion
      const globalConfig = await storage.getProjectAutomationConfigWithFallback(projectId);

      res.json(globalConfig);
    } catch (error: any) {
      console.error("Error deleting project MAP automation config:", error);
      res.status(500).json({ message: "Failed to delete project MAP automation config" });
    }
  });
}
