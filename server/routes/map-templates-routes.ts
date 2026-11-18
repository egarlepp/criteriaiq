// MAP template routes (Phase 8 extraction #9b).
//
// Second slice of the MAP surface — all 9 MAP-template handlers:
//   GET    /api/map/templates                  (with optional ?include=stats)
//   GET    /api/map/templates/:id              (with phases + steps + tasks)
//   POST   /api/map/templates                  (MAP Library edit)
//   PUT    /api/map/templates/:id              (owner or Admin)
//   GET    /api/map/templates/:id/content      (full tree)
//   PUT    /api/map/templates/:id/content      (owner or Admin; atomic replace)
//   POST   /api/map/templates/:id/duplicate    (MAP Library edit; the copy is yours)
//   GET    /api/map/templates/:id/stats
//   DELETE /api/map/templates/:id              (owner or Admin, with force flag)
//
// Who may write (same rules as Project Templates): anyone internal with Edit
// on Library › MAP Library creates templates, which are always their own and
// never system templates; they change or delete only their own non-system
// templates. Admins change any template and decide what is a system template.
//
// Pure storage usage. No broadcaster, no multer. The PUT content
// endpoint uses storage.db.transaction (the storage singleton's
// underlying drizzle instance) to atomically replace the phase/step/
// task tree.
import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { requireSectionEdit } from "../lib/section-permissions";
import {
  insertMapTemplateSchema,
  mapTemplatePhases,
  mapTemplateSteps,
  mapTemplateTasks,
} from "@shared/schema";

/**
 * A template offset in working days: a whole number, at least 0. A missing
 * or invalid value takes the default (0 for start, 7 for due); 0 is kept.
 */
export function templateOffset(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

const MAP_LIBRARY_SECTION = "template_management.map-library";

/**
 * Why this user may not change this MAP template, or null when they may.
 * Admins change anything; everyone else only their own non-system templates.
 */
export function mapTemplateWriteRefusal(
  user: { id: string; role: string | null | undefined },
  template: { createdByUserId: string | null; isSystem: boolean | null },
): string | null {
  if (user.role === "Admin") return null;
  if (template.isSystem !== false) return "Only administrators can change system templates";
  if (!template.createdByUserId || template.createdByUserId !== user.id) {
    return "You can only change MAP templates you created";
  }
  return null;
}

export function registerMapTemplatesRoutes(app: Express) {
  const canWriteLibrary = [isAuthenticated, requireInternalUser, requireSectionEdit(MAP_LIBRARY_SECTION)];
  // Get all MAP templates with optional stats
  app.get('/api/map/templates', isAuthenticated, async (req, res) => {
    try {
      const includeStats = req.query.include === 'stats';

      if (includeStats) {
        const templates = await storage.getMapTemplatesWithStats();
        res.json(templates);
      } else {
        const templates = await storage.getMapTemplates();
        res.json(templates);
      }
    } catch (error: any) {
      console.error("Error fetching MAP templates:", error);
      res.status(500).json({ message: "Failed to fetch MAP templates" });
    }
  });

  // Get specific MAP template with phases and steps
  app.get('/api/map/templates/:id', isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const template = await storage.getMapTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const phases = await storage.getMapTemplatePhases(templateId);
      const phasesWithSteps = await Promise.all(
        phases.map(async (phase) => {
          const steps = await storage.getMapTemplateSteps(templateId, phase.localKey);
          const stepsWithTasks = await Promise.all(
            steps.map(async (step) => {
              const tasks = await storage.getMapTemplateTasks(templateId, phase.localKey, step.localKey);
              return { ...step, tasks };
            })
          );
          return { ...phase, steps: stepsWithTasks };
        })
      );

      res.json({ ...template, phases: phasesWithSteps });
    } catch (error: any) {
      console.error("Error fetching MAP template:", error);
      res.status(500).json({ message: "Failed to fetch MAP template" });
    }
  });

  // Create new MAP template
  app.post('/api/map/templates', ...canWriteLibrary, async (req, res) => {
    try {
      const userId = req.session.user.id;
      const isAdmin = req.session.user.role === 'Admin';

      // The creator is always the session user; only an Admin makes a
      // system template, everyone else's lands in their My Templates.
      const templateData = insertMapTemplateSchema.parse({
        ...req.body,
        createdByUserId: userId,
        isSystem: isAdmin ? req.body?.isSystem === true : false,
      });

      const template = await storage.createMapTemplate(templateData);

      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating MAP template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create MAP template" });
    }
  });

  // Update MAP template
  app.put('/api/map/templates/:id', ...canWriteLibrary, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const existing = await storage.getMapTemplate(templateId);
      if (!existing) {
        return res.status(404).json({ message: "Template not found" });
      }
      const refusal = mapTemplateWriteRefusal({ id: userId, role: userRole }, existing);
      if (refusal) {
        return res.status(403).json({ message: refusal });
      }

      // Validate update data with partial schema. The creator never changes;
      // only an Admin sets Active or System.
      const body = { ...req.body };
      delete body.createdByUserId;
      if (userRole !== 'Admin') {
        delete body.isActive;
        delete body.isSystem;
      }
      const validUpdates = insertMapTemplateSchema.partial().parse({ ...body, updatedByUserId: userId });
      const updatedTemplate = await storage.updateMapTemplate(templateId, validUpdates);

      res.json(updatedTemplate);
    } catch (error: any) {
      console.error("Error updating MAP template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update MAP template" });
    }
  });

  // Get MAP template full content (phases, steps, tasks)
  app.get('/api/map/templates/:id/content', isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const template = await storage.getMapTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const phases = await storage.getMapTemplatePhases(templateId);
      const phasesWithContent = await Promise.all(
        phases.map(async (phase) => {
          // Use the actual localKey from the database (e.g., 'phase_11', 'phase_12')
          const phaseLocalKey = phase.localKey;
          const steps = await storage.getMapTemplateSteps(templateId, phaseLocalKey);

          // For each step, fetch its tasks
          const stepsWithTasks = await Promise.all(
            steps.map(async (step) => {
              // Use the actual step localKey from the database (e.g., 'step_71', 'step_72')
              const stepLocalKey = step.localKey;
              const tasks = await storage.getMapTemplateTasks(templateId, phaseLocalKey, stepLocalKey);
              return { ...step, tasks };
            })
          );

          return { ...phase, steps: stepsWithTasks };
        })
      );

      res.json({ phases: phasesWithContent });
    } catch (error: any) {
      console.error("Error fetching MAP template content:", error);
      res.status(500).json({ message: "Failed to fetch MAP template content" });
    }
  });

  // Update MAP template content (replace entire tree)
  app.put('/api/map/templates/:id/content', ...canWriteLibrary, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const { phases } = req.body;

      // Verify template exists
      const template = await storage.getMapTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      const refusal = mapTemplateWriteRefusal({ id: userId, role: userRole }, template);
      if (refusal) {
        return res.status(403).json({ message: refusal });
      }

      // A phase's journey stage is kept only when the stage exists.
      const stageIds = new Set((await storage.listJourneyStages()).map((stage) => stage.id));

      // Use transaction for atomic delete and insert. The rows share the
      // template's demo flag, like the rest of a demo template.
      await storage.db.transaction(async (tx) => {
        // Delete existing content for this template (in reverse FK order: tasks → steps → phases)
        await tx.delete(mapTemplateTasks).where(eq(mapTemplateTasks.templateId, templateId));
        await tx.delete(mapTemplateSteps).where(eq(mapTemplateSteps.templateId, templateId));
        await tx.delete(mapTemplatePhases).where(eq(mapTemplatePhases.templateId, templateId));

        // Insert new content
        if (phases && phases.length > 0) {
          for (const phase of phases) {
            // Insert phase
            const [insertedPhase] = await tx
              .insert(mapTemplatePhases)
              .values({
                templateId,
                isDemo: template.isDemo,
                name: phase.name,
                description: phase.description || null,
                orderIndex: phase.orderIndex,
                stageId: typeof phase.stageId === "number" && stageIds.has(phase.stageId) ? phase.stageId : null,
                expectedDays: phase.expectedDays || 0,
                defaultStartOffsetDays: templateOffset(phase.defaultStartOffsetDays, 0),
                defaultDueOffsetDays: templateOffset(phase.defaultDueOffsetDays, 7),
                sendExternalEmails: phase.sendExternalEmails !== false
              })
              .returning();

            // Insert steps for this phase
            if (phase.steps && phase.steps.length > 0) {
              for (const step of phase.steps) {
                const [insertedStep] = await tx
                  .insert(mapTemplateSteps)
                  .values({
                    templateId,
                    isDemo: template.isDemo,
                    phaseLocalKey: insertedPhase.localKey,
                    name: step.name,
                    description: step.description || null,
                    orderIndex: step.orderIndex,
                    expectedDays: step.expectedDays || 0,
                    defaultStatus: step.defaultStatus || 'not_started',
                    teamOwned: step.teamOwned || 'N/A',
                    defaultStartOffsetDays: templateOffset(step.defaultStartOffsetDays, 0),
                    defaultDueOffsetDays: templateOffset(step.defaultDueOffsetDays, 7),
                    sendExternalEmails: step.sendExternalEmails !== false
                  })
                  .returning();

                // Insert tasks for this step
                if (step.tasks && step.tasks.length > 0) {
                  for (const task of step.tasks) {
                    await tx
                      .insert(mapTemplateTasks)
                      .values({
                        templateId,
                        isDemo: template.isDemo,
                        phaseLocalKey: insertedPhase.localKey,
                        stepLocalKey: insertedStep.localKey,
                        name: task.name,
                        description: task.description || null,
                        orderIndex: task.orderIndex,
                        expectedHours: task.expectedHours || 0,
                        defaultStatus: task.defaultStatus || 'not_started',
                        teamOwned: task.teamOwned || 'N/A',
                        defaultStartOffsetDays: templateOffset(task.defaultStartOffsetDays, 0),
                        defaultDueOffsetDays: templateOffset(task.defaultDueOffsetDays, 7),
                        sendExternalEmails: task.sendExternalEmails !== false
                      });
                  }
                }
              }
            }
          }
        }
      });

      // Note: Activity logs require a project_id, so we don't log template updates
      // Template updates are tracked through the map_templates updated_at timestamp

      res.json({ message: "Template content updated successfully" });
    } catch (error: any) {
      console.error("Error updating MAP template content:", error);
      res.status(500).json({ message: "Failed to update MAP template content" });
    }
  });

  // Duplicate MAP template
  app.post('/api/map/templates/:id/duplicate', ...canWriteLibrary, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      // Anyone who may write the library may copy any template; the copy is
      // theirs and never a system template (duplicateMapTemplate).
      const newName = req.body.name; // Optional custom name
      const duplicatedTemplate = await storage.duplicateMapTemplate(templateId, userId, newName);

      // Log activity
      await storage.createActivityLog({
        projectId: null as any,
        userId,
        action: "duplicated",
        details: `Duplicated MAP template: ${duplicatedTemplate.name}`,
        targetType: "map_template",
        targetId: duplicatedTemplate.id,
      });

      res.status(201).json(duplicatedTemplate);
    } catch (error: any) {
      console.error("Error duplicating MAP template:", error);
      res.status(500).json({ message: "Failed to duplicate MAP template" });
    }
  });

  // Get MAP template usage statistics
  app.get('/api/map/templates/:id/stats', isAuthenticated, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const stats = await storage.getMapTemplateUsageStats(templateId);
      res.json(stats);
    } catch (error: any) {
      console.error("Error fetching MAP template stats:", error);
      res.status(500).json({ message: "Failed to fetch MAP template stats" });
    }
  });

  // Delete MAP template
  app.delete('/api/map/templates/:id', ...canWriteLibrary, async (req, res) => {
    try {
      const templateId = parseInt(req.params.id as string);
      const userId = req.session.user.id;
      const userRole = req.session.user.role;

      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }

      const existing = await storage.getMapTemplate(templateId);
      if (!existing) {
        return res.status(404).json({ message: "Template not found" });
      }
      const refusal = mapTemplateWriteRefusal({ id: userId, role: userRole }, existing);
      if (refusal) {
        return res.status(403).json({ message: refusal });
      }

      // Check usage count before deletion
      const stats = await storage.getMapTemplateUsageStats(templateId);
      const forceDelete = req.query.force === 'true';

      if (stats.usageCount > 0 && !forceDelete) {
        return res.status(400).json({
          message: "Template is in use and cannot be deleted. Use force=true to delete anyway.",
          usageCount: stats.usageCount,
          requiresForce: true
        });
      }

      // Admin can force delete even if in use
      if (stats.usageCount > 0 && forceDelete && userRole !== 'Admin') {
        return res.status(403).json({
          message: "Only Admin users can force delete templates that are in use"
        });
      }

      await storage.deleteMapTemplate(templateId);

      // Log activity
      await storage.createActivityLog({
        projectId: null as any,
        userId,
        action: "deleted",
        details: `Deleted MAP template with ID: ${templateId}`,
        targetType: "map_template",
        targetId: templateId,
      });

      res.json({ message: "Template deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting MAP template:", error);
      res.status(500).json({ message: "Failed to delete MAP template" });
    }
  });
}
