// Assessment + risk-engine routes (Phase 8 extraction #7).
//
// Extracted from server/routes.ts. Covers:
//   - Assessment data sources registry
//   - Assessment rulesets CRUD + clone + criteria
//   - Risk criteria initialize/CRUD/list
//   - Project risk analysis (single + bulk)
//   - R-Index scores
//   - Assessment jobs
//   - Recent runs + per-project prediction history
//
import type { Express } from "express";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { assessmentJobs } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { aiRiskEngine } from "../ai/aiRiskEngine";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess } from "../lib/project-access";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";

// Risk analysis is internal: outside users (Customer, Guest, Partner) never
// see R-Index scores, predictions or rulesets (server/lib/external-fields.ts
// strips the same data from project responses), so every route here is
// staff only. Per-project routes also require access to that project.
async function canOpenProject(req: any, projectId: number): Promise<boolean> {
  const user = req.session?.user;
  return hasProjectAccess(user?.id, user?.role, user?.email, projectId);
}

export function registerAssessmentsRoutes(app: Express) {
  // Assessment Data Sources Registry
  app.get('/api/assessment/data-sources', isAuthenticated, requireInternalUser, async (_req: any, res) => {
    try {
      const { DATA_SOURCE_GROUPS } = await import('../ai/assessment-data-sources');
      res.json(DATA_SOURCE_GROUPS);
    } catch (error: any) {
      console.error("Error fetching data sources:", error);
      res.status(500).json({ message: "Failed to fetch data sources" });
    }
  });

  // Assessment Rulesets CRUD

  app.get('/api/assessment/rulesets', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const rulesets = await storage.getAllAssessmentRulesets();
      res.json(rulesets);
    } catch (error: any) {
      console.error("Error fetching assessment rulesets:", error);
      res.status(500).json({ message: "Failed to fetch assessment rulesets" });
    }
  });

  app.get('/api/assessment/rulesets/active', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const rulesets = await storage.getActiveAssessmentRulesets();
      res.json(rulesets);
    } catch (error: any) {
      console.error("Error fetching active assessment rulesets:", error);
      res.status(500).json({ message: "Failed to fetch active assessment rulesets" });
    }
  });

  app.get('/api/assessment/rulesets/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const ruleset = await storage.getAssessmentRuleset(id);
      if (!ruleset) {
        return res.status(404).json({ message: "Assessment ruleset not found" });
      }
      res.json(ruleset);
    } catch (error: any) {
      console.error("Error fetching assessment ruleset:", error);
      res.status(500).json({ message: "Failed to fetch assessment ruleset" });
    }
  });

  app.post('/api/assessment/rulesets', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const schema = z.object({
        name: z.string().min(1, 'Name is required'),
        category: z.string().min(1, 'Category is required'),
        description: z.string().optional().nullable(),
        defaultAiProvider: z.string().optional().nullable(),
        defaultAiModel: z.string().optional().nullable(),
        additionalInstructions: z.string().optional().nullable(),
        outputFormatTemplate: z.string().optional().nullable(),
        totalWeight: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
        isDefault: z.boolean().optional(),
        createdBy: z.string().optional().nullable(),
      });

      const validatedData = schema.parse(req.body);
      const ruleset = await storage.createAssessmentRuleset({
        ...validatedData,
        createdBy: req.session.user.id,
      });
      res.status(201).json(ruleset);
    } catch (error: any) {
      console.error("Error creating assessment ruleset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create assessment ruleset" });
    }
  });

  app.put('/api/assessment/rulesets/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const id = parseInt(req.params.id as string);
      const schema = z.object({
        name: z.string().min(1).optional(),
        category: z.string().min(1).optional(),
        description: z.string().optional().nullable(),
        defaultAiProvider: z.string().optional().nullable(),
        defaultAiModel: z.string().optional().nullable(),
        additionalInstructions: z.string().optional().nullable(),
        outputFormatTemplate: z.string().optional().nullable(),
        totalWeight: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
        isDefault: z.boolean().optional(),
      });

      const validatedData = schema.parse(req.body);
      const ruleset = await storage.updateAssessmentRuleset(id, validatedData);
      if (!ruleset) {
        return res.status(404).json({ message: "Assessment ruleset not found" });
      }
      res.json(ruleset);
    } catch (error: any) {
      console.error("Error updating assessment ruleset:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update assessment ruleset" });
    }
  });

  app.delete('/api/assessment/rulesets/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const id = parseInt(req.params.id as string);
      const deleted = await storage.deleteAssessmentRuleset(id);
      if (!deleted) {
        return res.status(404).json({ message: "Assessment ruleset not found" });
      }
      res.json({ message: "Assessment ruleset deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting assessment ruleset:", error);
      res.status(500).json({ message: "Failed to delete assessment ruleset" });
    }
  });

  app.post('/api/assessment/rulesets/:id/clone', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const id = parseInt(req.params.id as string);
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Name is required for cloned ruleset" });
      }

      const cloned = await storage.cloneAssessmentRuleset(id, name, req.session.user.id);
      if (!cloned) {
        return res.status(404).json({ message: "Source assessment ruleset not found" });
      }
      res.status(201).json(cloned);
    } catch (error: any) {
      console.error("Error cloning assessment ruleset:", error);
      res.status(500).json({ message: "Failed to clone assessment ruleset" });
    }
  });

  app.get('/api/assessment/rulesets/:id/criteria', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const criteria = await storage.getRulesetCriteria(id);
      res.json(criteria);
    } catch (error: any) {
      console.error("Error fetching ruleset criteria:", error);
      res.status(500).json({ message: "Failed to fetch ruleset criteria" });
    }
  });

  // Initialize default risk criteria (admin only)
  app.post('/api/risk/initialize', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const userRole = req.session.user.role;



      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: `Admin access required. Current role: ${userRole}` });
      }

      await aiRiskEngine.initializeDefaultCriteria();
      res.json({ message: 'Default risk criteria initialized successfully' });
    } catch (error: any) {
      console.error("Error initializing risk criteria:", error);
      res.status(500).json({ message: "Failed to initialize risk criteria" });
    }
  });

  // Create new risk criteria (admin only)
  app.post('/api/risk/criteria', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const insertRiskCriteriaSchema = z.object({
        name: z.string().min(1, 'Name is required'),
        description: z.string().min(1, 'Description is required'),
        weight: z.number().min(0).max(1),
        category: z.enum(['timeline', 'technical', 'resource', 'customer', 'success_criteria', 'performance', 'custom']),
        isActive: z.boolean().optional().default(true),
        rulesetId: z.number().optional().nullable(),
        dataSources: z.array(z.string()).optional().nullable(),
        docSections: z.array(z.string()).optional().nullable(),
      });

      const validatedData = insertRiskCriteriaSchema.parse(req.body);
      const criteria = await storage.createRiskCriteria(validatedData);
      res.json(criteria);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      console.error("Error creating risk criteria:", error);
      res.status(500).json({ message: "Failed to create risk criteria" });
    }
  });

  // Update risk criteria (admin only)
  app.put('/api/risk/criteria/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const criteriaId = parseInt(req.params.id as string);

      const updateRiskCriteriaSchema = z.object({
        name: z.string().min(1, 'Name is required').optional(),
        description: z.string().min(1, 'Description is required').optional(),
        weight: z.number().min(0).max(1).optional(),
        category: z.enum(['timeline', 'technical', 'resource', 'customer', 'success_criteria', 'performance', 'custom']).optional(),
        isActive: z.boolean().optional(),
        rulesetId: z.number().optional().nullable(),
        dataSources: z.array(z.string()).optional().nullable(),
        docSections: z.array(z.string()).optional().nullable(),
      });

      const validatedData = updateRiskCriteriaSchema.parse(req.body);
      const criteria = await storage.updateRiskCriteria(criteriaId, validatedData);

      if (!criteria) {
        return res.status(404).json({ message: "Risk criteria not found" });
      }

      res.json(criteria);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      console.error("Error updating risk criteria:", error);
      res.status(500).json({ message: "Failed to update risk criteria" });
    }
  });

  // Delete risk criteria (admin only)
  app.delete('/api/risk/criteria/:id', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const criteriaId = parseInt(req.params.id as string);
      const deleted = await storage.deleteRiskCriteria(criteriaId);

      if (!deleted) {
        return res.status(404).json({ message: "Risk criteria not found" });
      }

      res.json({ message: "Risk criteria deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting risk criteria:", error);
      res.status(500).json({ message: "Failed to delete risk criteria" });
    }
  });

  // Analyze project risk
  app.post('/api/projects/:id/analyze-risk', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      if (!(await canOpenProject(req, projectId))) {
        return res.status(404).json({ message: "Project not found" });
      }

      const project = await storage.getProjectById(projectId);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }
      const analysis = await aiRiskEngine.analyzeProject(project);
      res.json(analysis);
    } catch (error: any) {
      console.error(`Error analyzing risk for project ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to analyze project risk", error: String(error) });
    }
  });

  // Get latest risk prediction for a project
  app.get('/api/projects/:id/risk-prediction', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      if (!(await canOpenProject(req, projectId))) {
        return res.status(404).json({ message: "Project not found" });
      }

      const prediction = await storage.getLatestRiskPrediction(projectId);
      res.json(prediction);
    } catch (error: any) {
      console.error(`Error fetching risk prediction for project ${req.params.id}:`, error);
      res.status(500).json({ message: "Failed to fetch risk prediction" });
    }
  });

  // Get R-Index scores (latest Risk Assessment category scores) for accessible projects
  app.get('/api/risk/r-index', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userId = req.session.user.id;

      const userProjects = await storage.getProjects(userId, {});
      const accessibleIds = userProjects.map((p: any) => p.id);

      if (accessibleIds.length === 0) {
        return res.json([]);
      }

      const results = await db.execute(sql`
        SELECT DISTINCT ON (prp.project_id)
          prp.project_id as "projectId",
          prp.overall_risk_score as "score",
          prp.risk_level as "level",
          prp.confidence as "confidence",
          prp.created_at AT TIME ZONE current_setting('TimeZone') as "runAt"
        FROM project_risk_predictions prp
        LEFT JOIN assessment_rulesets ar ON prp.ruleset_id = ar.id
        WHERE (ar.category = 'risk' OR prp.ruleset_id IS NULL)
          AND prp.project_id IN (${sql.join(accessibleIds.map((id: number) => sql`${id}`), sql`, `)})
        ORDER BY prp.project_id, prp.created_at DESC
      `);
      res.json(results.rows || []);
    } catch (error: any) {
      console.error('Error fetching R-Index scores:', error);
      res.status(500).json({ message: 'Failed to fetch R-Index scores' });
    }
  });

  // Bulk analyze all active projects (admin only)
  app.post('/api/risk/analyze-all', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      const userId = req.session.user.id;
      const userEmail = req.session.user.email;
      const { projectIds, rulesetId } = req.body || {};

      console.log(`AI Risk bulk analysis requested by user: ${userId} (${userRole})${projectIds ? ` for ${projectIds.length} specific projects` : ' for all active projects'}`);

      if (userRole.toLowerCase() !== 'admin') {
        console.log(`Access denied for user ${userId} - role: ${userRole}`);
        return res.status(403).json({
          message: 'Admin access required',
          details: {
            currentRole: userRole,
            requiredRole: 'Admin',
            userId: userId
          }
        });
      }

      console.log('Fetching projects for AI risk analysis...');
      const projects = await storage.getProjects(userId, {});

      if (!projects || projects.length === 0) {
        console.log('No projects found for analysis');
        return res.json({
          success: 0,
          failed: 0,
          results: [],
          message: 'No projects found to analyze'
        });
      }

      console.log(`Found ${projects.length} total projects`);

      let targetProjects = projects;

      // If specific project IDs were provided, filter to only those
      if (Array.isArray(projectIds) && projectIds.length > 0) {
        targetProjects = projects.filter(p => projectIds.includes(p.id));
        console.log(`Filtered to ${targetProjects.length} selected projects for analysis`);
      }

      console.log(`Found ${targetProjects.length} projects for analysis`);

      if (targetProjects.length === 0) {
        return res.json({
          success: 0,
          failed: 0,
          results: [],
          message: 'No projects found to analyze'
        });
      }

      // Check if AI provider is configured (uses the native AI provider configuration system)
      const { aiProviderService } = await import('../ai/ai-provider-service');
      const defaultConfig = await aiProviderService.getDefaultConfig();
      if (!defaultConfig) {
        console.error('No default AI provider configured - cannot perform AI analysis');
        return res.status(400).json({
          message: 'AI Risk Analysis is not available - no AI provider configured',
          details: {
            error: 'No default AI provider is configured and active',
            projectsFound: targetProjects.length,
            suggestion: 'Go to Configuration > AI Providers to set up an AI provider'
          }
        });
      }

      console.log('Starting AI risk analysis for projects...');
      if (rulesetId) {
        await storage.incrementRulesetRunCount(rulesetId);
      }

      let rulesetName: string | null = null;
      if (rulesetId) {
        const ruleset = await storage.getAssessmentRuleset(rulesetId);
        rulesetName = ruleset?.name || null;
      }

      // A job run in Demo Mode covers demo projects and is a demo job.
      const [jobRecord] = await db.insert(assessmentJobs).values(applyDemoFlag({
        type: "one_off",
        status: "running",
        rulesetId: rulesetId || null,
        rulesetName,
        projectIds: targetProjects.map((p: any) => p.id),
        totalProjects: targetProjects.length,
        triggeredBy: userId,
        startedAt: new Date(),
      })).returning();

      const results = await aiRiskEngine.analyzeMultipleProjects(targetProjects, rulesetId);

      if (jobRecord) {
        await db.update(assessmentJobs)
          .set({
            status: results.failed === targetProjects.length ? "failed" : "completed",
            successCount: results.success,
            failedCount: results.failed,
            results: results.results,
            completedAt: new Date(),
          })
          .where(eq(assessmentJobs.id, jobRecord.id));
      }

      console.log(`AI risk analysis completed: ${results.success} successful, ${results.failed} failed`);
      res.json({
        ...results,
        jobId: jobRecord?.id,
        projectsAnalyzed: targetProjects.length,
        totalProjectsFound: projects.length
      });

    } catch (error: any) {
      console.error("Error in bulk risk analysis:", error);

      // Provide detailed error information
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        userId: req.session?.user?.id,
        userRole: req.session?.user?.role
      };

      console.error('Detailed error information:', errorDetails);

      res.status(500).json({
        message: "Failed to analyze projects",
        error: errorDetails.message,
        details: {
          timestamp: errorDetails.timestamp,
          suggestion: 'Please check the server logs for more information or contact your administrator',
          userId: errorDetails.userId
        }
      });
    }
  });

  // Assessment Jobs API
  app.get("/api/assessment-jobs", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const jobs = await db.select().from(assessmentJobs)
        .where(applyDemoFilter(assessmentJobs))
        .orderBy(sql`${assessmentJobs.createdAt} DESC`).limit(50);
      res.json(jobs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/assessment-jobs/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const job = await db.select().from(assessmentJobs)
        .where(and(eq(assessmentJobs.id, parseInt(req.params.id as string)), applyDemoFilter(assessmentJobs)))
        .limit(1);
      if (job.length === 0) {
        return res.status(404).json({ error: "Job not found" });
      }
      res.json(job[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get risk criteria (for configuration)
  app.get('/api/risk/criteria', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const criteria = await storage.getAllRiskCriteria();
      res.json(criteria);
    } catch (error: any) {
      console.error("Error fetching risk criteria:", error);
      res.status(500).json({ message: "Failed to fetch risk criteria" });
    }
  });

  app.get('/api/risk/recent-runs', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const runs = await storage.getRecentRiskPredictions(limit);
      res.json(runs);
    } catch (error: any) {
      console.error("Error fetching recent risk runs:", error);
      res.status(500).json({ message: "Failed to fetch recent risk runs" });
    }
  });

  // Get risk prediction history for a project
  app.get('/api/risk/predictions/:projectId', isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) {
        return res.status(400).json({ message: "Invalid project ID" });
      }
      if (!(await canOpenProject(req, projectId))) {
        return res.status(404).json({ message: "Project not found" });
      }
      const limit = parseInt(req.query.limit as string) || 50;
      const predictions = await storage.getProjectRiskPredictions(projectId, limit);
      res.json(predictions);
    } catch (error: any) {
      console.error("Error fetching risk predictions:", error);
      res.status(500).json({ message: "Failed to fetch risk predictions" });
    }
  });
}
