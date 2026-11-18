// PCOS (Project Closure Outcome & Intelligence) routes. Outcome records,
// the admin capture rules, the per-project outcome request, and the fiscal
// calendar setting (which shares this file for historical reasons):
//
//   GET    /api/project-outcomes/statistics          Outcome Intelligence view
//   GET    /api/project-outcomes/missing             Outcome Intelligence view
//   GET    /api/project-outcomes                     Outcome Intelligence view
//   GET    /api/project-outcomes/:projectId          project access
//   POST   /api/project-outcomes                     project edit access
//   PATCH  /api/project-outcomes/:id                 project edit access
//   DELETE /api/project-outcomes/:id                 project edit access
//   GET    /api/project-outcomes/check-required/:projectId   project access
//   GET    /api/projects/:id/outcome-request         project access
//   GET    /api/outcome-config                       signed in
//   PATCH  /api/outcome-config                       Admin
//   GET    /api/fiscal-config                        signed in
//   PUT    /api/fiscal-config                        Admin
//
// Outcomes hold deal intelligence (executive summary, competitors, loss
// reasons), so outside users (Customer, Guest, Partner) never read or write
// them, and the cross-project lists follow the Outcome Intelligence section
// permission the sidebar uses.
import type { Express, Request } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireInternalUser } from "../lib/internal-access";
import { requireAdmin, userCanViewSection } from "../lib/section-permissions";
import { hasProjectAccess, hasProjectEditAccess } from "../lib/project-access";
import {
  insertProjectOutcomeSchema,
  updateOutcomeConfigSchema,
  WonReasonCodeEnum,
  LostReasonCodeEnum,
  CancelledReasonCodeEnum,
} from "@shared/schema";
import {
  decideRequirement,
  enforcementOf,
  markOutcomeCaptured,
  parseAcv,
  reopenOutcomeRequest,
  syncOutcomeRequest,
  type OutcomeType,
} from "../services/outcome-requests";

const OUTCOME_SECTION = "project.outcome-intelligence";

const REASON_CODES: Record<OutcomeType, readonly string[]> = {
  won: WonReasonCodeEnum.options,
  lost: LostReasonCodeEnum.options,
  cancelled: CancelledReasonCodeEnum.options,
};

/** Body for PATCH: every field optional, and the project can't be moved. */
const updateProjectOutcomeSchema = insertProjectOutcomeSchema.omit({ projectId: true }).partial();

type SessionUser = { id: string; role?: string | null; email?: string | null };

function sessionUser(req: Request): SessionUser {
  return (req as unknown as { session: { user: SessionUser } }).session.user;
}

function parseId(value: unknown): number | null {
  const id = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Cross-project outcome lists. API keys were already limited to the
 * projects area by their scopes before reaching a route
 * (server/auth/apiKeyScopes.ts); people need the section permission.
 */
async function canReadAllOutcomes(req: Request): Promise<boolean> {
  if (sessionUser(req).role === "ApiKey") return true;
  return userCanViewSection(req, OUTCOME_SECTION);
}

function canProjectRead(req: Request, projectId: number): Promise<boolean> {
  const user = sessionUser(req);
  return hasProjectAccess(user.id, user.role, user.email, projectId);
}

function canProjectEdit(req: Request, projectId: number): Promise<boolean> {
  const user = sessionUser(req);
  return hasProjectEditAccess(user.id, user.role, user.email, projectId);
}

function reasonCodeError(outcomeType: OutcomeType, code: string | undefined): string | null {
  if (code === undefined) return null;
  return REASON_CODES[outcomeType].includes(code) ? null : `"${code}" is not a ${outcomeType} reason`;
}

export function registerPcosRoutes(app: Express) {
  app.get("/api/project-outcomes/statistics", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      if (!(await canReadAllOutcomes(req))) {
        return res.status(403).json({ message: "You do not have permission to view Outcome Intelligence" });
      }
      res.json(await storage.getOutcomeStatistics());
    } catch (error) {
      console.error("Error fetching outcome statistics:", error);
      res.status(500).json({ message: "Failed to fetch outcome statistics" });
    }
  });

  app.get("/api/project-outcomes/missing", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      if (!(await canReadAllOutcomes(req))) {
        return res.status(403).json({ message: "You do not have permission to view Outcome Intelligence" });
      }
      res.json(await storage.getOutcomesWithMissingData());
    } catch (error) {
      console.error("Error fetching missing outcomes:", error);
      res.status(500).json({ message: "Failed to fetch missing outcomes" });
    }
  });

  app.get("/api/project-outcomes", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      if (!(await canReadAllOutcomes(req))) {
        return res.status(403).json({ message: "You do not have permission to view Outcome Intelligence" });
      }
      const query = z
        .object({
          outcomeType: z.enum(["won", "lost", "cancelled"]).optional(),
          fromDate: z.coerce.date().optional(),
          toDate: z.coerce.date().optional(),
        })
        .safeParse(req.query);
      if (!query.success) {
        return res.status(400).json({ message: "Invalid filters", errors: query.error.issues });
      }
      res.json(await storage.getAllProjectOutcomes(query.data));
    } catch (error) {
      console.error("Error fetching project outcomes:", error);
      res.status(500).json({ message: "Failed to fetch project outcomes" });
    }
  });

  // Must come after the fixed /statistics and /missing paths.
  app.get("/api/project-outcomes/:projectId", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const projectId = parseId(req.params.projectId);
      if (!projectId) return res.status(400).json({ message: "Invalid project ID" });
      if (!(await canProjectRead(req, projectId))) {
        return res.status(403).json({ message: "You do not have access to this project" });
      }
      res.json(await storage.getProjectOutcome(projectId));
    } catch (error) {
      console.error("Error fetching project outcome:", error);
      res.status(500).json({ message: "Failed to fetch project outcome" });
    }
  });

  app.post("/api/project-outcomes", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const parsed = insertProjectOutcomeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid outcome", errors: parsed.error.issues });
      }
      const data = parsed.data;
      const reasonError = reasonCodeError(data.outcomeType, data.primaryReasonCode);
      if (reasonError) return res.status(400).json({ message: reasonError });

      if (!(await canProjectEdit(req, data.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }
      if (await storage.getProjectOutcome(data.projectId)) {
        return res.status(409).json({ message: "This project already has an outcome" });
      }

      const outcome = await storage.createProjectOutcome({ ...data, createdBy: sessionUser(req).id });
      await markOutcomeCaptured(data.projectId, data.outcomeType);
      res.status(201).json(outcome);
    } catch (error) {
      console.error("Error creating project outcome:", error);
      res.status(500).json({ message: "Failed to create project outcome" });
    }
  });

  app.patch("/api/project-outcomes/:id", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid outcome ID" });
      const existing = await storage.getProjectOutcomeById(id);
      if (!existing) return res.status(404).json({ message: "Outcome not found" });
      if (!(await canProjectEdit(req, existing.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }

      // The dialog sends the whole record back, projectId included; ignore it.
      const { projectId: _ignored, ...body } = (req.body ?? {}) as Record<string, unknown>;
      const parsed = updateProjectOutcomeSchema.safeParse(body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid outcome", errors: parsed.error.issues });
      }
      const outcomeType = (parsed.data.outcomeType ?? existing.outcomeType) as OutcomeType;
      const reasonCode = parsed.data.primaryReasonCode ?? (parsed.data.outcomeType ? existing.primaryReasonCode : undefined);
      const reasonError = reasonCodeError(outcomeType, reasonCode);
      if (reasonError) return res.status(400).json({ message: reasonError });

      res.json(await storage.updateProjectOutcome(id, parsed.data));
    } catch (error) {
      console.error("Error updating project outcome:", error);
      res.status(500).json({ message: "Failed to update project outcome" });
    }
  });

  app.delete("/api/project-outcomes/:id", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid outcome ID" });
      const existing = await storage.getProjectOutcomeById(id);
      if (!existing) return res.status(404).json({ message: "Outcome not found" });
      if (!(await canProjectEdit(req, existing.projectId))) {
        return res.status(403).json({ message: "You do not have permission to edit this project" });
      }
      await storage.deleteProjectOutcome(id);
      await reopenOutcomeRequest(existing.projectId);
      res.json({ message: "Outcome deleted successfully" });
    } catch (error) {
      console.error("Error deleting project outcome:", error);
      res.status(500).json({ message: "Failed to delete project outcome" });
    }
  });

  // What the project page needs for its "record the outcome" prompt: the
  // closure decision, the outcome if one exists, and whether this viewer
  // may record it.
  app.get("/api/projects/:id/outcome-request", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const projectId = parseId(req.params.id);
      if (!projectId) return res.status(400).json({ message: "Invalid project ID" });
      if (!(await canProjectRead(req, projectId))) {
        return res.status(403).json({ message: "You do not have access to this project" });
      }
      // Re-checking here (cheap, idempotent) means the prompt appears on the
      // first load after a close, without waiting for the save's listener.
      const request = await syncOutcomeRequest(projectId);
      const outcome = await storage.getProjectOutcome(projectId);
      const enforcement = enforcementOf(await storage.getOutcomeConfig());
      res.json({ request, hasOutcome: !!outcome, canRecord: await canProjectEdit(req, projectId), enforcement });
    } catch (error) {
      console.error("Error fetching outcome request:", error);
      res.status(500).json({ message: "Failed to fetch outcome request" });
    }
  });

  app.get("/api/outcome-config", isAuthenticated, async (_req, res) => {
    try {
      let config = await storage.getOutcomeConfig();
      if (!config) {
        config = await storage.createOutcomeConfig({ enabled: true, logicMode: "always", closureCounter: 0 });
      }
      res.json(config);
    } catch (error) {
      console.error("Error fetching outcome config:", error);
      res.status(500).json({ message: "Failed to fetch outcome configuration" });
    }
  });

  app.patch("/api/outcome-config", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = updateOutcomeConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid configuration", errors: parsed.error.issues });
      }
      if (parsed.data.acvThreshold != null && !(parseFloat(parsed.data.acvThreshold) >= 0)) {
        return res.status(400).json({ message: "ACV threshold must be a number of 0 or more" });
      }
      const config = await storage.upsertOutcomeConfig({ ...parsed.data, updatedBy: sessionUser(req).id });
      res.json(config);
    } catch (error) {
      console.error("Error updating outcome config:", error);
      res.status(500).json({ message: "Failed to update outcome configuration" });
    }
  });

  // =============================================================================
  // FISCAL CONFIGURATION ENDPOINTS
  // =============================================================================

  // Get fiscal configuration
  app.get("/api/fiscal-config", isAuthenticated, async (req: any, res) => {
    try {
      const setting = await storage.getSystemSetting("fiscal_config");
      
      if (!setting) {
        // Return default config if none exists
        const defaultConfig = {
          displayMode: "calendar",
          fiscalYearStartMonth: 1,
          yearNamingOffset: 0,
        };
        return res.json(defaultConfig);
      }
      
      res.json(setting.value);
    } catch (error: any) {
      console.error("Error fetching fiscal config:", error);
      res.status(500).json({ message: "Failed to fetch fiscal configuration" });
    }
  });

  // Update fiscal configuration (Admin only)
  app.put("/api/fiscal-config", isAuthenticated, async (req: any, res) => {
    try {
      // Admin only check
      if (req.session?.user?.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const userId = req.user?.id || req.session?.user?.id;
      const { displayMode, fiscalYearStartMonth, yearNamingOffset } = req.body;

      // Validate the config
      if (displayMode && !["fiscal", "calendar"].includes(displayMode)) {
        return res.status(400).json({ message: "Invalid display mode. Must be 'fiscal' or 'calendar'" });
      }

      if (fiscalYearStartMonth !== undefined && (fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12)) {
        return res.status(400).json({ message: "Invalid fiscal year start month. Must be 1-12" });
      }

      if (yearNamingOffset !== undefined && (yearNamingOffset < -1 || yearNamingOffset > 1)) {
        return res.status(400).json({ message: "Invalid year naming offset. Must be -1, 0, or 1" });
      }

      const configValue = {
        displayMode: displayMode || "calendar",
        fiscalYearStartMonth: fiscalYearStartMonth ?? 1,
        yearNamingOffset: yearNamingOffset ?? 0,
      };

      const setting = await storage.upsertSystemSetting(
        "fiscal_config",
        configValue,
        userId,
        "Fiscal year and calendar configuration for the system"
      );
      
      res.json(setting.value);
    } catch (error: any) {
      console.error("Error updating fiscal config:", error);
      res.status(500).json({ message: "Failed to update fiscal configuration" });
    }
  });

  // Whether the project's outcome is required. Reads the decision recorded
  // when the project closed; for a closed project with no decision yet
  // (closed before this server noticed), records it now.
  app.get("/api/project-outcomes/check-required/:projectId", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const projectId = parseId(req.params.projectId);
      if (!projectId) return res.status(400).json({ message: "Invalid project ID" });
      if (!(await canProjectRead(req, projectId))) {
        return res.status(403).json({ message: "You do not have access to this project" });
      }
      const project = await storage.getProjectById(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const config = await storage.getOutcomeConfig();
      const acvValue = parseAcv(project.opportunityAcvValue);
      const acvThreshold = config?.acvThreshold ? parseFloat(config.acvThreshold) : 0;
      const base = { acvValue, acvThreshold, logicMode: config?.logicMode ?? null };

      if (await storage.getProjectOutcome(projectId)) {
        return res.json({ ...base, required: false, reason: "Outcome already captured" });
      }
      const request = (await storage.getOutcomeRequest(projectId)) ?? (await syncOutcomeRequest(projectId));
      if (!request) {
        const preview = decideRequirement(config, acvValue, 0);
        return res.json({ ...base, required: false, closed: false, reason: `Project is not closed (${preview.reason})` });
      }
      res.json({ ...base, closed: true, required: request.status === "open" && request.required, reason: request.reason ?? "" });
    } catch (error) {
      console.error("Error checking outcome requirement:", error);
      res.status(500).json({ message: "Failed to check outcome requirement" });
    }
  });
}
