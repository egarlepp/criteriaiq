// Template routes (Phase 8 extraction #8).
//
// Extracted from server/routes.ts. Two sub-groups:
//   - Validation Criteria Templates CRUD + star (/api/validation-criteria-templates)
//   - Project Templates CRUD (/api/templates)
//
// Writes are limited to internal users (requireInternalUser); before that
// any signed-in user, Customers included, could change shared templates.
// Project templates are also owner-scoped: a new template is its creator's
// (My Templates), only its creator or an Admin may change or delete it, and
// only an Admin may make, change or demote a system template.
// Otherwise handlers preserve their original behavior verbatim. Pure storage
// usage; no broadcaster, no scheduler, no shared multer.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { insertValidationCriteriaTemplateSchema } from "@shared/schema";

export function registerTemplatesRoutes(app: Express) {
  // Validation Criteria Templates routes
  app.get("/api/validation-criteria-templates", isAuthenticated, async (req, res) => {
    try {
      const templates = await storage.getValidationCriteriaTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error("Error fetching validation criteria templates:", error);
      res.status(500).json({ error: "Failed to fetch validation criteria templates" });
    }
  });

  app.get("/api/validation-criteria-templates/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });

      const template = await storage.getValidationCriteriaTemplate(id);
      res.json(template);
    } catch (error: any) {
      console.error("Error fetching validation criteria template:", error);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(500).json({ error: "Failed to fetch validation criteria template" });
    }
  });

  app.post("/api/validation-criteria-templates", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session?.user?.role;
      const rawBody = { ...req.body };
      if (userRole !== 'Admin') {
        delete rawBody.isActive;
        delete rawBody.isSystem;
      }
      const { links, ...templateData } = rawBody;

      // Validate links if provided
      let validatedLinks: any[] = [];
      if (links !== undefined) {
        const linkSchema = z.array(z.object({
          fromId: z.string(),
          toId: z.string(),
          type: z.string()
        }));
        validatedLinks = linkSchema.parse(links);
      }

      // Create or update instanceEntities with validated links
      if (!templateData.instanceEntities) {
        templateData.instanceEntities = { solution: [], criteria: [], outcome: [], action: [], links: [] };
      }
      if (links !== undefined) {
        templateData.instanceEntities.links = validatedLinks;
      }

      // Validate template data (includes instanceEntities with links)
      const validatedTemplate = insertValidationCriteriaTemplateSchema.parse({
        ...templateData,
        createdBy: req.user.id
      });

      // Create template (links are now embedded in instanceEntities JSONB)
      const template = await storage.createValidationCriteriaTemplate(validatedTemplate, []);
      res.status(201).json(template);
    } catch (error: any) {
      console.error("Error creating validation criteria template:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid template data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to create validation criteria template" });
    }
  });

  app.patch("/api/validation-criteria-templates/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });

      // Strip isActive/isSystem for non-admins to avoid blocking valid edits
      const userRole = req.session?.user?.role;
      const sanitizedBody = { ...req.body };
      if (userRole !== 'Admin') {
        delete sanitizedBody.isActive;
        delete sanitizedBody.isSystem;
      }

      const { links, ...updates } = sanitizedBody;

      // Validate links if provided
      if (links !== undefined) {
        const linkSchema = z.array(z.object({
          fromId: z.string(),
          toId: z.string(),
          type: z.string()
        }));
        const validatedLinks = linkSchema.parse(links);

        // Only update instanceEntities.links if links were provided
        if (updates.instanceEntities) {
          updates.instanceEntities.links = validatedLinks;
        } else {
          // Fetch existing template to preserve other instanceEntities data
          const existingTemplate = await storage.getValidationCriteriaTemplate(id);
          updates.instanceEntities = {
            ...existingTemplate.instanceEntities,
            links: validatedLinks
          };
        }
      }

      // Validate updates (includes instanceEntities with links)
      const validatedUpdates = insertValidationCriteriaTemplateSchema.partial().parse({
        ...updates,
        updatedBy: req.user?.id || req.session?.user?.id
      });

      // Update template (links are now embedded in instanceEntities JSONB)
      const template = await storage.updateValidationCriteriaTemplate(id, validatedUpdates, []);
      res.json(template);
    } catch (error: any) {
      console.error("Error updating validation criteria template:", error);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ error: "Template not found" });
      }
      if (error.name === 'ZodError') {
        return res.status(400).json({ error: "Invalid template data", details: error.issues });
      }
      res.status(500).json({ error: "Failed to update validation criteria template" });
    }
  });

  app.delete("/api/validation-criteria-templates/:id", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });

      await storage.deleteValidationCriteriaTemplate(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting validation criteria template:", error);
      res.status(500).json({ error: "Failed to delete validation criteria template" });
    }
  });

  app.patch("/api/validation-criteria-templates/:id/star", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      if (isNaN(id)) return res.status(400).json({ error: "Invalid template ID" });

      const { isStarred } = req.body;

      if (typeof isStarred !== 'boolean') {
        return res.status(400).json({ error: "isStarred must be a boolean" });
      }

      const template = await storage.toggleValidationCriteriaTemplateStar(id, isStarred);
      res.json(template);
    } catch (error: any) {
      console.error("Error toggling validation criteria template star:", error);
      if (error.message?.includes('not found')) {
        return res.status(404).json({ error: "Template not found" });
      }
      res.status(500).json({ error: "Failed to toggle template star status" });
    }
  });

  // Templates routes
  app.get('/api/templates', isAuthenticated, async (req, res) => {
    try {
      // Fetch templates from database
      const databaseTemplates = await storage.getProjectTemplates();

      // Convert database format to frontend format (camelCase)
      const formattedTemplates = databaseTemplates.map(template => ({
        id: template.id,
        name: template.name,
        description: template.description,
        industry: template.industry,
        solutionType: template.solutionType,
        type: template.type, // Use actual type field (POC, POV, Trial, Partner, RTU)
        solutionName: template.solutionName || [],
        estimatedDuration: template.estimatedDuration,
        durationWorkingDays: template.durationWorkingDays ?? null,
        businessProblem: template.businessProblem,
        solutionDescription: template.solutionDescription,
        customerObjective: template.customerObjective,
        policyConsiderations: template.policyConsiderations,
        tags: template.tags || [],
        successCriteriaTemplates: template.successCriteriaTemplates,
        successCriteria: template.successCriteriaTemplates,
        typicalCompetitors: template.typicalCompetitors || null,
        projectLinks: Array.isArray(template.projectLinks) ? template.projectLinks : [],
        projectDocuments: Array.isArray(template.projectDocuments) ? template.projectDocuments : [],
        isActive: template.isActive !== false,
        isSystem: template.isSystem !== false,
        mapTemplateId: template.mapTemplateId || null,
        mapTemplateName: template.mapTemplateName || null,
        validationCriteriaTemplateId: template.validationCriteriaTemplateId || null,
        validationCriteriaTemplateName: template.validationCriteriaTemplateName || null,
        artifactsNotApplicable: template.artifactsNotApplicable !== false,
        usageCount: template.usageCount || 0,
        isStarred: template.isStarred || false,
        createdBy: template.createdBy,
        updatedBy: template.updatedBy,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
        createdByUser: (template as any).createdByUser || null,
        updatedByUser: (template as any).updatedByUser || null,
        // Add default values for compatibility
        successCriteriaCount: template.successCriteriaTemplates?.length || 0,
        lastUsed: template.updatedAt ? new Date(template.updatedAt).toISOString().split('T')[0] : null
      }));

      res.json(formattedTemplates);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Project template writes. Any internal user can save a template; it is
  // theirs (My Templates) and only they or an Admin can change or delete it.
  // System templates are admin-managed: only an Admin can promote a template
  // to System, demote it, or change a System template.
  const isAdminRole = (req: any) => req.session?.user?.role === 'Admin';

  /** null when the session user may change the template, else the refusal. */
  const templateWriteRefusal = (req: any, template: { createdBy: string | null; isSystem: boolean | null }) => {
    if (isAdminRole(req)) return null;
    if (template.isSystem !== false) return "Only administrators can change system templates";
    if (!template.createdBy || template.createdBy !== req.session?.user?.id) {
      return "You can only change templates you created";
    }
    return null;
  };

  // Template deletion endpoint
  app.delete('/api/templates/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const templateId = String(req.params.id);
      const existing = await storage.getProjectTemplateById(templateId);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const refusal = templateWriteRefusal(req, existing);
      if (refusal) return res.status(403).json({ message: refusal });

      await storage.deleteProjectTemplate(templateId);

      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting template:", error);
      res.status(500).json({ message: "Failed to delete template" });
    }
  });

  // Template creation endpoint
  app.post('/api/templates', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ message: "Invalid template data" });
      }
      const userId = req.session?.user?.id;
      const templateData = {
        ...body,
        // The creator is always the session user, never the request body.
        createdBy: userId,
        updatedBy: userId,
        // Only an Admin can create a system template; everyone else's
        // template lands in their My Templates.
        isSystem: isAdminRole(req) ? body.isSystem === true : false,
      };

      const newTemplate = await storage.createProjectTemplate(templateData);

      res.status(201).json({
        message: "Template created successfully",
        template: newTemplate
      });
    } catch (error: any) {
      console.error("Error creating template:", error);
      res.status(500).json({ message: "Failed to create template" });
    }
  });

  // Template update endpoint (also how an Admin promotes a template to
  // System or moves it back: PUT { isSystem }).
  app.put('/api/templates/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const templateId = String(req.params.id);
      const userId = req.session?.user?.id;
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ message: "Invalid template data" });
      }
      const existing = await storage.getProjectTemplateById(templateId);
      if (!existing) return res.status(404).json({ message: "Template not found" });
      const refusal = templateWriteRefusal(req, existing);
      if (refusal) return res.status(403).json({ message: refusal });

      const updateData = { ...req.body, updatedBy: userId };
      delete updateData.createdBy;

      // Strip isActive/isSystem for non-admins to avoid blocking valid edits
      if (!isAdminRole(req)) {
        delete updateData.isActive;
        delete updateData.isSystem;
      }

      const updatedTemplate = await storage.updateProjectTemplate(templateId, updateData);

      if (updatedTemplate) {
        res.json({
          message: "Template updated successfully",
          template: updatedTemplate
        });
      } else {
        res.status(404).json({ message: "Template not found" });
      }
    } catch (error: any) {
      console.error("Error updating template:", error);
      res.status(500).json({ message: "Failed to update template" });
    }
  });
}
