import type { Express } from "express";
import { db } from "../db";
import {
  competitors,
  technologySpaces,
  competitorSpaces,
  competitorSolutions,
  competitorTags,
  projectCompetitors,
  competitorDocuments,
  competitorLinks,
  competitorActivity,
  insertCompetitorSchema,
  insertTechnologySpaceSchema,
  insertCompetitorSpaceSchema,
  insertCompetitorSolutionSchema,
  insertProjectCompetitorSchema,
  insertCompetitorDocumentSchema,
  insertCompetitorLinkSchema,
  insertCompetitorActivitySchema,
} from "../../shared/schema/competitors";
import { projects } from "../../shared/schema/projects";
import { customers, customerCompetitors } from "../../shared/schema/customers";
import { products, tags } from "../../shared/schema/products";
import { eq, ilike, and, or, inArray, sql, desc } from "drizzle-orm";
import { isAuthenticated } from "../auth/simpleAuth";
import { applyDemoFilter, applyDemoFilterByProject, applyDemoFlag } from "../lib/demo-storage";
import { trimEdgeChar } from "../lib/trim-edge";

function toSlug(name: string): string {
  return trimEdgeChar(name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), "-");
}

export function registerCompetitorRoutes(app: Express) {
  // ── Technology Spaces ────────────────────────────────────────
  app.get("/api/technology-spaces", isAuthenticated, async (req, res) => {
    try {
      const spaces = await db
        .select()
        .from(technologySpaces)
        .where(and(eq(technologySpaces.isActive, true), applyDemoFilter(technologySpaces)))
        .orderBy(technologySpaces.displayOrder, technologySpaces.code);
      res.json(spaces);
    } catch (err) {
      console.error("GET /api/technology-spaces error:", err);
      res.status(500).json({ message: "Failed to fetch technology spaces" });
    }
  });

  app.post("/api/technology-spaces", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertTechnologySpaceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      const [space] = await db.insert(technologySpaces).values(applyDemoFlag(parsed.data)).returning();
      res.status(201).json(space);
    } catch (err) {
      console.error("POST /api/technology-spaces error:", err);
      res.status(500).json({ message: "Failed to create technology space" });
    }
  });

  app.put("/api/technology-spaces/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [space] = await db
        .update(technologySpaces)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(technologySpaces.id, id))
        .returning();
      if (!space) return res.status(404).json({ message: "Space not found" });
      res.json(space);
    } catch (err) {
      console.error("PUT /api/technology-spaces/:id error:", err);
      res.status(500).json({ message: "Failed to update technology space" });
    }
  });

  app.delete("/api/technology-spaces/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(technologySpaces).where(eq(technologySpaces.id, id));
      res.json({ success: true });
    } catch (err) {
      console.error("DELETE /api/technology-spaces/:id error:", err);
      res.status(500).json({ message: "Failed to delete technology space" });
    }
  });

  // ── Analytics Summary ─────────────────────────────────────────
  app.get("/api/competitors/analytics/summary", isAuthenticated, async (req, res) => {
    try {
      const [totalCompetitors] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(competitors)
        .where(and(eq(competitors.isActive, true), applyDemoFilter(competitors)));

      const [projectsTagged] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(projects)
        .where(and(
          sql`(EXISTS (
          SELECT 1 FROM project_competitors pc WHERE pc.project_id = ${projects.id}
        ) OR EXISTS (
          SELECT 1 FROM customers c
          JOIN customer_competitors cc ON cc.customer_id = c.id
          WHERE c.account_name = ${projects.customerName}
        ))`,
          applyDemoFilter(projects),
        ));

      const [highRisk] = await db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(projects)
        .where(and(
          sql`(EXISTS (
          SELECT 1 FROM project_competitors pc WHERE pc.project_id = ${projects.id} AND pc.relationship_type = 'Evaluating'
        ) OR EXISTS (
          SELECT 1 FROM customers c
          JOIN customer_competitors cc ON cc.customer_id = c.id
          WHERE c.account_name = ${projects.customerName} AND cc.relationship = 'Evaluating'
        ))`,
          applyDemoFilter(projects),
        ));

      const mostActiveSpaceRow = await db
        .select({
          code: technologySpaces.code,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(competitorSpaces)
        .innerJoin(technologySpaces, eq(competitorSpaces.spaceId, technologySpaces.id))
        .where(applyDemoFilter(technologySpaces))
        .groupBy(technologySpaces.code)
        .orderBy(desc(sql`count(*)`))
        .limit(1);

      res.json({
        totalCompetitors: totalCompetitors.count,
        projectsTagged: projectsTagged.count,
        highRiskOpps: highRisk.count,
        mostActiveSpace: mostActiveSpaceRow[0]?.code ?? "—",
      });
    } catch (err) {
      console.error("GET /api/competitors/analytics/summary error:", err);
      res.status(500).json({ message: "Failed to fetch analytics summary" });
    }
  });

  // ── Competitors List ─────────────────────────────────────────
  app.get("/api/competitors", isAuthenticated, async (req, res) => {
    try {
      const { search, space, solution } = req.query as Record<string, string>;

      let query = db.select().from(competitors).$dynamic();

      const conditions: any[] = [eq(competitors.isActive, true), applyDemoFilter(competitors)];

      if (search) {
        conditions.push(
          or(
            ilike(competitors.name, `%${search}%`),
            ilike(competitors.summary, `%${search}%`),
            ilike(competitors.notes, `%${search}%`)
          )
        );
      }

      const rows = await db
        .select()
        .from(competitors)
        .where(and(...conditions))
        .orderBy(competitors.name);

      const competitorIds = rows.map((c) => c.id);
      if (competitorIds.length === 0) return res.json([]);

      const spaceMappings = await db
        .select({
          competitorId: competitorSpaces.competitorId,
          spaceId: technologySpaces.id,
          code: technologySpaces.code,
          name: technologySpaces.name,
          isPrimary: competitorSpaces.isPrimary,
        })
        .from(competitorSpaces)
        .innerJoin(technologySpaces, eq(competitorSpaces.spaceId, technologySpaces.id))
        .where(inArray(competitorSpaces.competitorId, competitorIds));

      const solutionMappings = await db
        .select({
          competitorId: competitorSolutions.competitorId,
          solutionId: products.id,
          solutionName: products.name,
          solutionIcon: products.solutionIcon,
          solutionIconName: products.solutionIconName,
          solutionAbbrev: products.abbreviation,
        })
        .from(competitorSolutions)
        .innerJoin(products, eq(competitorSolutions.solutionId, products.id))
        .where(inArray(competitorSolutions.competitorId, competitorIds));

      const projectCounts = await db
        .select({
          competitorId: projectCompetitors.competitorId,
          count: sql<number>`cast(count(*) as int)`,
        })
        .from(projectCompetitors)
        .where(and(
          inArray(projectCompetitors.competitorId, competitorIds),
          applyDemoFilterByProject(projectCompetitors.projectId),
        ))
        .groupBy(projectCompetitors.competitorId);

      const enriched = rows
        .map((c) => {
          const compSpaces = spaceMappings.filter((s) => s.competitorId === c.id);
          const compSolutions = solutionMappings.filter((s) => s.competitorId === c.id);
          const projectCount = projectCounts.find((p) => p.competitorId === c.id)?.count ?? 0;

          if (space && !compSpaces.some((s) => s.code === space)) return null;
          if (solution && !compSolutions.some((s) => String(s.solutionId) === solution)) return null;

          return { ...c, spaces: compSpaces, solutions: compSolutions, projectCount };
        })
        .filter(Boolean);

      res.json(enriched);
    } catch (err) {
      console.error("GET /api/competitors error:", err);
      res.status(500).json({ message: "Failed to fetch competitors" });
    }
  });

  app.post("/api/competitors", isAuthenticated, async (req, res) => {
    try {
      const body = { ...req.body, slug: toSlug(req.body.name || ""), createdByUserId: (req.user as any)?.id };
      const parsed = insertCompetitorSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      const [competitor] = await db.insert(competitors).values(applyDemoFlag(parsed.data)).returning();

      await db.insert(competitorActivity).values({
        competitorId: competitor.id,
        activityType: "Added",
        message: `Competitor "${competitor.name}" was added to the library.`,
        createdByUserId: (req.user as any)?.id,
      });

      res.status(201).json(competitor);
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ message: "A competitor with this name already exists" });
      console.error("POST /api/competitors error:", err);
      res.status(500).json({ message: "Failed to create competitor" });
    }
  });

  app.get("/api/competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [competitor] = await db.select().from(competitors).where(and(eq(competitors.id, id), applyDemoFilter(competitors)));
      if (!competitor) return res.status(404).json({ message: "Competitor not found" });

      const spaces = await db
        .select({
          id: competitorSpaces.id,
          spaceId: technologySpaces.id,
          code: technologySpaces.code,
          name: technologySpaces.name,
          isPrimary: competitorSpaces.isPrimary,
        })
        .from(competitorSpaces)
        .innerJoin(technologySpaces, eq(competitorSpaces.spaceId, technologySpaces.id))
        .where(eq(competitorSpaces.competitorId, id));

      const solutions = await db
        .select({
          id: competitorSolutions.id,
          solutionId: products.id,
          name: products.name,
          abbreviation: products.abbreviation,
          solutionIcon: products.solutionIcon,
          solutionIconName: products.solutionIconName,
        })
        .from(competitorSolutions)
        .innerJoin(products, eq(competitorSolutions.solutionId, products.id))
        .where(eq(competitorSolutions.competitorId, id));

      const tagsList = await db
        .select({ id: competitorTags.id, tagId: tags.id, name: tags.name, color: tags.color })
        .from(competitorTags)
        .innerJoin(tags, eq(competitorTags.tagId, tags.id))
        .where(eq(competitorTags.competitorId, id));

      const docs = await db
        .select()
        .from(competitorDocuments)
        .where(eq(competitorDocuments.competitorId, id))
        .orderBy(desc(competitorDocuments.createdAt));

      const links = await db
        .select()
        .from(competitorLinks)
        .where(eq(competitorLinks.competitorId, id));

      const activity = await db
        .select()
        .from(competitorActivity)
        .where(eq(competitorActivity.competitorId, id))
        .orderBy(desc(competitorActivity.createdAt))
        .limit(20);

      const relatedProjects = await db
        .select({
          id: projectCompetitors.id,
          projectId: projectCompetitors.projectId,
          projectName: projects.name,
          customerName: projects.customerName,
          relationshipType: projectCompetitors.relationshipType,
          competitiveStage: projectCompetitors.competitiveStage,
          threatLevel: projectCompetitors.threatLevel,
          notes: projectCompetitors.notes,
          outcomeNotes: projectCompetitors.outcomeNotes,
          isCustomerIncumbent: projectCompetitors.isCustomerIncumbent,
          isReplacementTarget: projectCompetitors.isReplacementTarget,
          ownerUserId: projectCompetitors.ownerUserId,
          createdAt: projectCompetitors.createdAt,
          spaceCode: technologySpaces.code,
          spaceName: technologySpaces.name,
        })
        .from(projectCompetitors)
        .innerJoin(projects, eq(projectCompetitors.projectId, projects.id))
        .leftJoin(technologySpaces, eq(projectCompetitors.spaceId, technologySpaces.id))
        .where(and(eq(projectCompetitors.competitorId, id), applyDemoFilter(projects)))
        .orderBy(desc(projectCompetitors.createdAt));

      res.json({ ...competitor, spaces, solutions, tags: tagsList, documents: docs, links, activity, relatedProjects });
    } catch (err) {
      console.error("GET /api/competitors/:id error:", err);
      res.status(500).json({ message: "Failed to fetch competitor" });
    }
  });

  app.put("/api/competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [competitor] = await db
        .update(competitors)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(competitors.id, id))
        .returning();
      if (!competitor) return res.status(404).json({ message: "Competitor not found" });

      await db.insert(competitorActivity).values({
        competitorId: id,
        activityType: "Updated",
        message: `Competitor profile was updated.`,
        createdByUserId: (req.user as any)?.id,
      });

      res.json(competitor);
    } catch (err) {
      console.error("PUT /api/competitors/:id error:", err);
      res.status(500).json({ message: "Failed to update competitor" });
    }
  });

  app.delete("/api/competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.update(competitors).set({ isActive: false, updatedAt: new Date() }).where(eq(competitors.id, id));
      res.json({ message: "Competitor deactivated" });
    } catch (err) {
      console.error("DELETE /api/competitors/:id error:", err);
      res.status(500).json({ message: "Failed to deactivate competitor" });
    }
  });

  // ── Competitor Space Links ────────────────────────────────────
  app.post("/api/competitors/:id/spaces", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const [link] = await db
        .insert(competitorSpaces)
        .values({ competitorId, ...req.body })
        .returning();
      res.status(201).json(link);
    } catch (err) {
      res.status(500).json({ message: "Failed to link space" });
    }
  });

  app.delete("/api/competitors/:id/spaces/:spaceId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const spaceId = parseInt(req.params.spaceId as string);
      await db
        .delete(competitorSpaces)
        .where(and(eq(competitorSpaces.competitorId, competitorId), eq(competitorSpaces.spaceId, spaceId)));
      res.json({ message: "Space unlinked" });
    } catch (err) {
      res.status(500).json({ message: "Failed to unlink space" });
    }
  });

  // ── Competitor Solution Links ─────────────────────────────────
  app.post("/api/competitors/:id/solutions", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const [link] = await db
        .insert(competitorSolutions)
        .values({ competitorId, ...req.body })
        .returning();
      res.status(201).json(link);
    } catch (err) {
      res.status(500).json({ message: "Failed to link solution" });
    }
  });

  app.delete("/api/competitors/:id/solutions/:solutionId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const solutionId = parseInt(req.params.solutionId as string);
      await db
        .delete(competitorSolutions)
        .where(and(eq(competitorSolutions.competitorId, competitorId), eq(competitorSolutions.solutionId, solutionId)));
      res.json({ message: "Solution unlinked" });
    } catch (err) {
      res.status(500).json({ message: "Failed to unlink solution" });
    }
  });

  // ── Competitor Tag Links ──────────────────────────────────────
  app.post("/api/competitors/:id/tags", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const [link] = await db
        .insert(competitorTags)
        .values({ competitorId, ...req.body })
        .returning();
      res.status(201).json(link);
    } catch (err) {
      res.status(500).json({ message: "Failed to link tag" });
    }
  });

  app.delete("/api/competitors/:id/tags/:tagId", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const tagId = parseInt(req.params.tagId as string);
      await db
        .delete(competitorTags)
        .where(and(eq(competitorTags.competitorId, competitorId), eq(competitorTags.tagId, tagId)));
      res.json({ message: "Tag unlinked" });
    } catch (err) {
      res.status(500).json({ message: "Failed to unlink tag" });
    }
  });

  // ── Competitor Documents + Links ─────────────────────────────
  app.post("/api/competitors/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const [doc] = await db
        .insert(competitorDocuments)
        .values({ competitorId, ...req.body, createdByUserId: (req.user as any)?.id })
        .returning();
      res.status(201).json(doc);
    } catch (err) {
      res.status(500).json({ message: "Failed to add document" });
    }
  });

  app.delete("/api/competitors/:id/documents/:docId", isAuthenticated, async (req, res) => {
    try {
      const docId = parseInt(req.params.docId as string);
      await db.delete(competitorDocuments).where(eq(competitorDocuments.id, docId));
      res.json({ message: "Document removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove document" });
    }
  });

  app.post("/api/competitors/:id/links", isAuthenticated, async (req, res) => {
    try {
      const competitorId = parseInt(req.params.id as string);
      const [link] = await db
        .insert(competitorLinks)
        .values({ competitorId, ...req.body })
        .returning();
      res.status(201).json(link);
    } catch (err) {
      res.status(500).json({ message: "Failed to add link" });
    }
  });

  app.delete("/api/competitors/:id/links/:linkId", isAuthenticated, async (req, res) => {
    try {
      const linkId = parseInt(req.params.linkId as string);
      await db.delete(competitorLinks).where(eq(competitorLinks.id, linkId));
      res.json({ message: "Link removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove link" });
    }
  });

  // ── Project Competitors ──────────────────────────────────────
  app.get("/api/project-competitors/:projectId", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      const rows = await db
        .select({
          id: projectCompetitors.id,
          competitorId: projectCompetitors.competitorId,
          competitorName: competitors.name,
          competitorSlug: competitors.slug,
          spaceId: projectCompetitors.spaceId,
          spaceCode: technologySpaces.code,
          spaceName: technologySpaces.name,
          spaceColor: technologySpaces.color,
          solutionId: projectCompetitors.solutionId,
          solutionName: products.name,
          relationshipType: projectCompetitors.relationshipType,
          competitiveStage: projectCompetitors.competitiveStage,
          threatLevel: projectCompetitors.threatLevel,
          isCustomerIncumbent: projectCompetitors.isCustomerIncumbent,
          isReplacementTarget: projectCompetitors.isReplacementTarget,
          pricingPressure: projectCompetitors.pricingPressure,
          notes: projectCompetitors.notes,
          outcomeNotes: projectCompetitors.outcomeNotes,
          ownerUserId: projectCompetitors.ownerUserId,
          createdAt: projectCompetitors.createdAt,
          updatedAt: projectCompetitors.updatedAt,
        })
        .from(projectCompetitors)
        .innerJoin(competitors, eq(projectCompetitors.competitorId, competitors.id))
        .leftJoin(technologySpaces, eq(projectCompetitors.spaceId, technologySpaces.id))
        .leftJoin(products, eq(projectCompetitors.solutionId, products.id))
        .where(eq(projectCompetitors.projectId, projectId))
        .orderBy(desc(projectCompetitors.createdAt));
      res.json(rows);
    } catch (err) {
      console.error("GET /api/project-competitors/:projectId error:", err);
      res.status(500).json({ message: "Failed to fetch project competitors" });
    }
  });

  app.post("/api/project-competitors", isAuthenticated, async (req, res) => {
    try {
      const parsed = insertProjectCompetitorSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data", errors: parsed.error.issues });
      const [row] = await db.insert(projectCompetitors).values(parsed.data).returning();

      const [comp] = await db.select().from(competitors).where(eq(competitors.id, parsed.data.competitorId));
      const [proj] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId));
      if (comp && proj) {
        await db.insert(competitorActivity).values({
          competitorId: comp.id,
          projectId: proj.id,
          activityType: "Added",
          message: `Linked to project "${proj.name || proj.customerName}".`,
          createdByUserId: (req.user as any)?.id,
        });
      }

      res.status(201).json(row);
    } catch (err) {
      console.error("POST /api/project-competitors error:", err);
      res.status(500).json({ message: "Failed to add competitor to project" });
    }
  });

  app.put("/api/project-competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const [row] = await db
        .update(projectCompetitors)
        .set({ ...req.body, updatedAt: new Date() })
        .where(eq(projectCompetitors.id, id))
        .returning();
      if (!row) return res.status(404).json({ message: "Record not found" });
      res.json(row);
    } catch (err) {
      res.status(500).json({ message: "Failed to update project competitor" });
    }
  });

  app.delete("/api/project-competitors/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      await db.delete(projectCompetitors).where(eq(projectCompetitors.id, id));
      res.json({ message: "Removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove project competitor" });
    }
  });

  app.put("/api/project-competitors/sync/:projectId", isAuthenticated, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId as string);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project ID" });
      const { projectCompetitors: items } = req.body;
      if (!Array.isArray(items)) return res.status(400).json({ message: "projectCompetitors must be an array" });
      await db.transaction(async (tx) => {
        await tx.delete(projectCompetitors).where(eq(projectCompetitors.projectId, projectId));
        if (items.length > 0) {
          await tx.insert(projectCompetitors).values(
            items.map((c: any) => ({
              projectId,
              competitorId: parseInt(c.competitorId),
              spaceId: c.spaceId ? parseInt(c.spaceId) : null,
              relationshipType: c.relationship || null,
            }))
          );
        }
      });
      res.json({ message: "Project competitors synced" });
    } catch (err) {
      console.error("PUT /api/project-competitors/sync/:projectId error:", err);
      res.status(500).json({ message: "Failed to sync project competitors" });
    }
  });
}
