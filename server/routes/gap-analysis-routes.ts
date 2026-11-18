// Gap Analysis routes (Phase 8 extraction #22).
//
// 9 handlers covering library + project-scoped gap CRUD + the
// link/unlink + per-project toggle + deliverables-visibility:
//
//   GET    /api/gaps
//   GET    /api/projects/:id/gaps
//   POST   /api/gaps
//   PATCH  /api/gaps/:id
//   DELETE /api/gaps/:id
//   PATCH  /api/projects/:id/toggle-gaps
//   PATCH  /api/projects/:id/deliverables-visibility
//   GET    /api/projects/:id/available-gaps
//   POST   /api/projects/:id/link-gaps
//   DELETE /api/projects/:projectId/unlink-gap/:linkId
//
// Mechanical sed extraction.
import type { Express } from "express";
import { eq, and, or, desc, inArray, notInArray } from "drizzle-orm";
import { storage } from "../storage";
import { db } from "../db";
import { projectGaps, projectGapLinks, projects, customers, users, insertGapSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { applyDemoFilterByCustomer, applyDemoFilterByProject } from "../lib/demo-storage";

// Gaps hang off a project, an account, or both. In Demo Mode show gaps on a
// demo project or demo account; otherwise gaps whose project and account are
// both real (or unset).
function gapsInDemoMode() {
  if (isCurrentRequestDemo()) {
    return or(applyDemoFilterByProject(projectGaps.projectId), applyDemoFilterByCustomer(projectGaps.customerId))!;
  }
  return and(applyDemoFilterByProject(projectGaps.projectId), applyDemoFilterByCustomer(projectGaps.customerId))!;
}

export function registerGapAnalysisRoutes(app: Express) {
  // GET /api/gaps - List all gaps with optional filters
  app.get("/api/gaps", isAuthenticated, async (req: any, res) => {
    try {
      const { customerId, solution, status, criticality } = req.query;

      let query = db
        .select({
          gap: projectGaps,
          projectCustomerName: projects.customerName,
          projectSolution: projects.solutionName,
          customerName: customers.accountName,
          reportedByName: users.firstName,
          reportedByLastName: users.lastName,
        })
        .from(projectGaps)
        .leftJoin(projects, eq(projectGaps.projectId, projects.id))
        .leftJoin(customers, eq(projectGaps.customerId, customers.id))
        .leftJoin(users, eq(projectGaps.reportedBy, users.id));

      const conditions: any[] = [gapsInDemoMode()];
      if (customerId) {
        conditions.push(eq(projectGaps.customerId, parseInt(customerId)));
      }
      if (solution) {
        conditions.push(eq(projectGaps.impactedSolution, solution));
      }
      if (status) {
        conditions.push(eq(projectGaps.status, status));
      }
      if (criticality) {
        conditions.push(eq(projectGaps.criticality, criticality));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query.orderBy(desc(projectGaps.createdAt));

      const gaps = results.map((r: any) => ({
        ...r.gap,
        projectName: r.projectCustomerName || null,
        customerName: r.customerName,
        reportedByName: r.reportedByName && r.reportedByLastName 
          ? `${r.reportedByName} ${r.reportedByLastName}` 
          : r.reportedByName || 'Unknown',
      }));

      res.json(gaps);
    } catch (error: any) {
      console.error("Error fetching gaps:", error);
      res.status(500).json({ message: "Failed to fetch gaps" });
    }
  });

  // GET /api/projects/:id/gaps - Get project gaps and related account gaps
  app.get("/api/projects/:id/gaps", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);

      // Get the project to find customerId and solutions
      const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      if (!project.length) {
        return res.status(404).json({ message: "Project not found" });
      }

      const customerId = project[0].customerUserId ? undefined : undefined;
      
      // Get the customer ID from the project - need to find the customer linked to this project
      // First get the customer associated with this project by customer name matching
      const customerResult = await db
        .select()
        .from(customers)
        .where(eq(customers.accountName, project[0].customerName))
        .limit(1);

      const projectCustomerId = customerResult.length > 0 ? customerResult[0].id : null;

      // Get project-specific gaps (native gaps)
      const nativeGapsResult = await db
        .select({
          gap: projectGaps,
          reportedByName: users.firstName,
          reportedByLastName: users.lastName,
        })
        .from(projectGaps)
        .leftJoin(users, eq(projectGaps.reportedBy, users.id))
        .where(eq(projectGaps.projectId, projectId))
        .orderBy(desc(projectGaps.createdAt));

      const nativeGapsData = nativeGapsResult.map((r: any) => ({
        ...r.gap,
        isLinked: false,
        reportedByName: r.reportedByName && r.reportedByLastName 
          ? `${r.reportedByName} ${r.reportedByLastName}` 
          : r.reportedByName || 'Unknown',
      }));

      // Get linked gaps from other projects
      const linkedGapsResult = await db
        .select({
          gap: projectGaps,
          linkId: projectGapLinks.id,
          linkedAt: projectGapLinks.linkedAt,
          reportedByName: users.firstName,
          reportedByLastName: users.lastName,
          sourceProjectName: projects.customerName,
        })
        .from(projectGapLinks)
        .innerJoin(projectGaps, eq(projectGapLinks.gapId, projectGaps.id))
        .leftJoin(users, eq(projectGaps.reportedBy, users.id))
        .leftJoin(projects, eq(projectGaps.projectId, projects.id))
        .where(eq(projectGapLinks.projectId, projectId))
        .orderBy(desc(projectGapLinks.linkedAt));

      const linkedGapsData = linkedGapsResult.map((r: any) => ({
        ...r.gap,
        isLinked: true,
        linkId: r.linkId,
        linkedAt: r.linkedAt,
        sourceProjectName: r.sourceProjectName || 'Unknown',
        reportedByName: r.reportedByName && r.reportedByLastName 
          ? `${r.reportedByName} ${r.reportedByLastName}` 
          : r.reportedByName || 'Unknown',
      }));

      // Combine native and linked gaps
      const projectGapsData = [...nativeGapsData, ...linkedGapsData];

      // Get solutions/products from this project for filtering related gaps
      const projectSolutions = project[0].solutionName ? [project[0].solutionName] : [];
      
      // Get related account gaps (same customer, same solutions, different project)
      let relatedAccountGaps: any[] = [];
      if (projectCustomerId && projectSolutions.length > 0) {
        const relatedResult = await db
          .select({
            gap: projectGaps,
            projectName: projects.customerName,
            reportedByName: users.firstName,
            reportedByLastName: users.lastName,
          })
          .from(projectGaps)
          .leftJoin(projects, eq(projectGaps.projectId, projects.id))
          .leftJoin(users, eq(projectGaps.reportedBy, users.id))
          .where(
            and(
              eq(projectGaps.customerId, projectCustomerId),
              inArray(projectGaps.impactedSolution, projectSolutions)
            )
          )
          .orderBy(desc(projectGaps.createdAt));

        relatedAccountGaps = relatedResult
          .filter((r: any) => r.gap.projectId !== projectId)
          .map((r: any) => ({
            ...r.gap,
            projectName: r.projectName,
            reportedByName: r.reportedByName && r.reportedByLastName 
              ? `${r.reportedByName} ${r.reportedByLastName}` 
              : r.reportedByName || 'Unknown',
          }));
      }

      res.json({
        projectGaps: projectGapsData,
        relatedAccountGaps,
        customerId: projectCustomerId,
      });
    } catch (error: any) {
      console.error("Error fetching project gaps:", error);
      res.status(500).json({ message: "Failed to fetch project gaps" });
    }
  });

  // POST /api/gaps - Create a new gap
  app.post("/api/gaps", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertGapSchema.parse(req.body);
      const userId = req.session.user?.id;

      const [newGap] = await db
        .insert(projectGaps)
        .values({
          ...validatedData,
          reportedBy: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(newGap);
    } catch (error: any) {
      console.error("Error creating gap:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.issues[0]?.message || "Validation error" });
      }
      res.status(500).json({ message: "Failed to create gap" });
    }
  });

  // PATCH /api/gaps/:id - Update a gap
  app.patch("/api/gaps/:id", isAuthenticated, async (req: any, res) => {
    try {
      const gapId = parseInt(req.params.id as string);
      const validatedData = insertGapSchema.partial().parse(req.body);

      // Check if status is changing to a final disposition (Won't Do or Implemented)
      const updateData: any = {
        ...validatedData,
        updatedAt: new Date(),
      };

      // Set finalDispositionDate when status changes to Won't Do or Implemented
      if (validatedData.status === "Won't Do" || validatedData.status === "Implemented") {
        // Get current gap to check if this is a new disposition
        const [currentGap] = await db
          .select({ status: projectGaps.status, finalDispositionDate: projectGaps.finalDispositionDate })
          .from(projectGaps)
          .where(eq(projectGaps.id, gapId));
        
        // Only set disposition date if it wasn't already in a final state
        if (currentGap && currentGap.status !== "Won't Do" && currentGap.status !== "Implemented") {
          updateData.finalDispositionDate = new Date();
        }
      } else if (validatedData.status && (validatedData.status as string) !== "Won't Do" && (validatedData.status as string) !== "Implemented") {
        // Clear the final disposition date if moving away from a final status
        updateData.finalDispositionDate = null;
      }

      const [updatedGap] = await db
        .update(projectGaps)
        .set(updateData)
        .where(eq(projectGaps.id, gapId))
        .returning();

      if (!updatedGap) {
        return res.status(404).json({ message: "Gap not found" });
      }

      res.json(updatedGap);
    } catch (error: any) {
      console.error("Error updating gap:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: error.issues[0]?.message || "Validation error" });
      }
      res.status(500).json({ message: "Failed to update gap" });
    }
  });

  // DELETE /api/gaps/:id - Delete a gap
  app.delete("/api/gaps/:id", isAuthenticated, async (req: any, res) => {
    try {
      const gapId = parseInt(req.params.id as string);

      const [deletedGap] = await db
        .delete(projectGaps)
        .where(eq(projectGaps.id, gapId))
        .returning();

      if (!deletedGap) {
        return res.status(404).json({ message: "Gap not found" });
      }

      res.json({ message: "Gap deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting gap:", error);
      res.status(500).json({ message: "Failed to delete gap" });
    }
  });

  // PATCH /api/projects/:id/toggle-gaps - Toggle enableGapAnalysis
  app.patch("/api/projects/:id/toggle-gaps", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const userRole = req.session.user?.role;

      // Only Engineer and Admin can toggle
      if (userRole !== 'Engineer' && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Engineers and Admins can toggle Gap Analysis" });
      }

      // Get current value
      const [project] = await db
        .select({ enableGapAnalysis: projects.enableGapAnalysis })
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Toggle the value
      const [updatedProject] = await db
        .update(projects)
        .set({
          enableGapAnalysis: !project.enableGapAnalysis,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      res.json(updatedProject);
    } catch (error: any) {
      console.error("Error toggling gap analysis:", error);
      res.status(500).json({ message: "Failed to toggle gap analysis" });
    }
  });

  // Canonical default tab keys for deliverables visibility.
  // Any project whose stored visibility is null or missing keys will be merged with these defaults on the frontend.
  // On the backend, we merge these defaults when persisting so that new keys are never silently absent.
  const DELIVERABLES_VISIBILITY_TAB_DEFAULTS: Record<string, boolean> = {
    "map": true,
    "success-criteria": true,
    "assumptions-dependencies": true,
    "artifacts": true,
    "gaps": false,
    "projectiq-coach": false,
  };

  // PATCH /api/projects/:id/deliverables-visibility - Set deliverables visibility per role
  app.patch("/api/projects/:id/deliverables-visibility", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const userRole = req.session.user?.role;

      if (userRole !== 'Engineer' && userRole !== 'Admin') {
        return res.status(403).json({ message: "Only Engineers and Admins can change deliverables visibility" });
      }

      const { cardVisible, tabs } = req.body;

      if (typeof cardVisible !== 'boolean' || typeof tabs !== 'object') {
        return res.status(400).json({ message: "Invalid payload: cardVisible (boolean) and tabs (object) required" });
      }

      const [project] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId));

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Merge with canonical defaults so all known tab keys are always present in the stored value.
      // This ensures that newly introduced tabs (like assumptions-dependencies) have a correct
      // stored default for existing projects the first time visibility is explicitly saved.
      const mergedTabs = { ...DELIVERABLES_VISIBILITY_TAB_DEFAULTS, ...tabs };

      const [updatedProject] = await db
        .update(projects)
        .set({
          deliverablesVisibility: { cardVisible, tabs: mergedTabs },
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .returning();

      res.json(updatedProject);
    } catch (error: any) {
      console.error("Error updating deliverables visibility:", error);
      res.status(500).json({ message: "Failed to update deliverables visibility" });
    }
  });

  // GET /api/projects/:id/available-gaps - Get gaps that can be linked to this project
  app.get("/api/projects/:id/available-gaps", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);

      // Get the project to find its solutions
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Parse the project's solutions (stored as comma-separated string in solutionName column)
      const solutionString = project.solutionName || '';
      const projectSolutions: string[] = solutionString
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      if (projectSolutions.length === 0) {
        return res.json([]);
      }

      // Get IDs of gaps already linked to this project (including native gaps)
      const linkedGapIds = await db
        .select({ gapId: projectGapLinks.gapId })
        .from(projectGapLinks)
        .where(eq(projectGapLinks.projectId, projectId));

      const nativeGapIds = await db
        .select({ id: projectGaps.id })
        .from(projectGaps)
        .where(eq(projectGaps.projectId, projectId));

      const excludeIds = [
        ...linkedGapIds.map(r => r.gapId),
        ...nativeGapIds.map(r => r.id),
      ];

      // Build conditions for gaps matching project solutions (exact match since both use same dropdown)
      const solutionConditions = projectSolutions.map((sol: string) => 
        eq(projectGaps.impactedSolution, sol)
      );

      // Query for available gaps
      let query = db
        .select({
          gap: projectGaps,
          projectName: projects.customerName,
          reportedByName: users.firstName,
          reportedByLastName: users.lastName,
        })
        .from(projectGaps)
        .leftJoin(projects, eq(projectGaps.projectId, projects.id))
        .leftJoin(users, eq(projectGaps.reportedBy, users.id))
        .where(
          excludeIds.length > 0
            ? and(gapsInDemoMode(), or(...solutionConditions), notInArray(projectGaps.id, excludeIds))
            : and(gapsInDemoMode(), or(...solutionConditions))
        )
        .orderBy(desc(projectGaps.createdAt));

      const results = await query;

      const availableGaps = results.map((r: any) => ({
        ...r.gap,
        projectName: r.projectName || 'Unlinked',
        reportedByName: r.reportedByName && r.reportedByLastName 
          ? `${r.reportedByName} ${r.reportedByLastName}` 
          : r.reportedByName || 'Unknown',
      }));

      res.json(availableGaps);
    } catch (error: any) {
      console.error("Error fetching available gaps:", error);
      res.status(500).json({ message: "Failed to fetch available gaps" });
    }
  });

  // POST /api/projects/:id/link-gaps - Link multiple gaps to a project
  app.post("/api/projects/:id/link-gaps", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.id as string);
      const { gapIds } = req.body;
      const userId = req.session.user?.id;

      if (!Array.isArray(gapIds) || gapIds.length === 0) {
        return res.status(400).json({ message: "gapIds must be a non-empty array" });
      }

      // Verify project exists
      const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Insert links for each gap (ignoring duplicates via unique constraint)
      const links = await Promise.all(
        gapIds.map(async (gapId: number) => {
          try {
            const [link] = await db
              .insert(projectGapLinks)
              .values({
                gapId,
                projectId,
                linkedBy: userId,
                linkedAt: new Date(),
              })
              .onConflictDoNothing()
              .returning();
            return link;
          } catch (err) {
            return null;
          }
        })
      );

      const successfulLinks = links.filter(Boolean);
      res.status(201).json({ 
        message: `Linked ${successfulLinks.length} gaps to project`,
        linkedCount: successfulLinks.length,
      });
    } catch (error: any) {
      console.error("Error linking gaps:", error);
      res.status(500).json({ message: "Failed to link gaps" });
    }
  });

  // DELETE /api/projects/:projectId/unlink-gap/:linkId - Unlink a gap from a project by link ID
  app.delete("/api/projects/:projectId/unlink-gap/:linkId", isAuthenticated, async (req: any, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const linkId = parseInt(req.params.linkId as string);

      // Verify the link belongs to this project before deleting
      const [deletedLink] = await db
        .delete(projectGapLinks)
        .where(and(
          eq(projectGapLinks.id, linkId),
          eq(projectGapLinks.projectId, projectId)
        ))
        .returning();

      if (!deletedLink) {
        return res.status(404).json({ message: "Gap link not found" });
      }

      res.json({ message: "Gap unlinked successfully" });
    } catch (error: any) {
      console.error("Error unlinking gap:", error);
      res.status(500).json({ message: "Failed to unlink gap" });
    }
  });
}
