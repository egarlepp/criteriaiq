// Assumptions & Dependencies routes (Phase 8 extraction #16).
//
// Largest remaining slice — ~30 handlers covering the full library +
// project-instance surface for both Assumptions and Dependencies plus
// their categories:
//
//   Assumption / Dependency categories:
//     CRUD + reset-defaults
//
//   Library assumptions / dependencies:
//     CRUD
//
//   Project-scoped instances:
//     list-all / list / link / patch / unlink + per-project compat
//     route + revenue-at-risk stats
//
// Mechanical sed extraction — no behavior changes, schema imports
// preserved.
import type { Express } from "express";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { storage } from "../storage";
import { userCanViewSection, userCanEditSection } from "../lib/section-permissions";
import { db } from "../db";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import {
  assumptionCategories,
  dependencyCategories,
  assumptions,
  dependencies,
  projectAssumptions,
  projectDependencies,
  projects,
  users,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";

// Role Management stores these under Project Workspace. The old bare
// "assumptions" / "dependencies" keys were renamed by a backfill, so checking
// them refused every non-Admin.
const ASSUMPTIONS_SECTION = "project.assumptions";
const DEPENDENCIES_SECTION = "project.dependencies";

export function registerAssumptionsDependenciesRoutes(app: Express) {
  // ── Assumption Categories ─────────────────────────────────────────────────

  // GET /api/assumption-categories - List all assumption categories
  app.get("/api/assumption-categories", isAuthenticated, async (req: any, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const rows = await db
        .select()
        .from(assumptionCategories)
        .where(includeInactive ? undefined : eq(assumptionCategories.isActive, true))
        .orderBy(assumptionCategories.name);
      res.json(rows);
    } catch (error: any) {
      console.error("Error fetching assumption categories:", error);
      res.status(500).json({ message: "Failed to fetch assumption categories" });
    }
  });

  // POST /api/assumption-categories - Create a new assumption category (admin only)
  app.post("/api/assumption-categories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can create assumption categories" });
      }
      const { name, description, icon } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const [created] = await db
        .insert(assumptionCategories)
        .values({ name, description, icon: icon || null, isSystem: false, isActive: true, createdBy: userId })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating assumption category:", error);
      res.status(500).json({ message: "Failed to create assumption category" });
    }
  });

  // PATCH /api/assumption-categories/:id - Update an assumption category (admin only)
  app.patch("/api/assumption-categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can update assumption categories" });
      }
      const id = parseInt(req.params.id as string);
      const userId = req.session.user?.id;
      const { name, description, isActive, icon, isSystem } = req.body;
      const [updated] = await db
        .update(assumptionCategories)
        .set({
          name,
          description,
          isActive,
          icon: icon !== undefined ? (icon || null) : undefined,
          isSystem: isSystem !== undefined ? Boolean(isSystem) : undefined,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(assumptionCategories.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Category not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating assumption category:", error);
      res.status(500).json({ message: "Failed to update assumption category" });
    }
  });

  // DELETE /api/assumption-categories/:id - Delete an assumption category (admin only)
  app.delete("/api/assumption-categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can delete assumption categories" });
      }
      const id = parseInt(req.params.id as string);
      const [existing] = await db.select().from(assumptionCategories).where(eq(assumptionCategories.id, id));
      if (!existing) return res.status(404).json({ message: "Category not found" });
      await db.delete(assumptionCategories).where(eq(assumptionCategories.id, id));
      res.json({ message: "Category deleted" });
    } catch (error: any) {
      console.error("Error deleting assumption category:", error);
      res.status(500).json({ message: "Failed to delete assumption category" });
    }
  });

  // POST /api/assumption-categories/reset-defaults - Restore canonical system categories (admin only)
  app.post("/api/assumption-categories/reset-defaults", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset assumption categories to defaults" });
      }
      const { resetAssumptionCategoryDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetAssumptionCategoryDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });
      res.json({ message: "Assumption category defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting assumption category defaults:", error);
      res.status(500).json({ message: "Failed to reset assumption category defaults" });
    }
  });

  // ── Dependency Categories ──────────────────────────────────────────────────

  // GET /api/dependency-categories - List all dependency categories
  app.get("/api/dependency-categories", isAuthenticated, async (req: any, res) => {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const rows = await db
        .select()
        .from(dependencyCategories)
        .where(includeInactive ? undefined : eq(dependencyCategories.isActive, true))
        .orderBy(dependencyCategories.name);
      res.json(rows);
    } catch (error: any) {
      console.error("Error fetching dependency categories:", error);
      res.status(500).json({ message: "Failed to fetch dependency categories" });
    }
  });

  // POST /api/dependency-categories - Create a new dependency category (admin only)
  app.post("/api/dependency-categories", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can create dependency categories" });
      }
      const { name, description, icon } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const [created] = await db
        .insert(dependencyCategories)
        .values({ name, description, icon: icon || null, isSystem: false, isActive: true, createdBy: userId })
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating dependency category:", error);
      res.status(500).json({ message: "Failed to create dependency category" });
    }
  });

  // PATCH /api/dependency-categories/:id - Update a dependency category (admin only)
  app.patch("/api/dependency-categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can update dependency categories" });
      }
      const id = parseInt(req.params.id as string);
      const userId = req.session.user?.id;
      const { name, description, isActive, icon, isSystem } = req.body;
      const [updated] = await db
        .update(dependencyCategories)
        .set({
          name,
          description,
          isActive,
          icon: icon !== undefined ? (icon || null) : undefined,
          isSystem: isSystem !== undefined ? Boolean(isSystem) : undefined,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(dependencyCategories.id, id))
        .returning();
      if (!updated) return res.status(404).json({ message: "Category not found" });
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating dependency category:", error);
      res.status(500).json({ message: "Failed to update dependency category" });
    }
  });

  // DELETE /api/dependency-categories/:id - Delete a dependency category (admin only)
  app.delete("/api/dependency-categories/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user?.role;
      if (userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can delete dependency categories" });
      }
      const id = parseInt(req.params.id as string);
      const [existing] = await db.select().from(dependencyCategories).where(eq(dependencyCategories.id, id));
      if (!existing) return res.status(404).json({ message: "Category not found" });
      await db.delete(dependencyCategories).where(eq(dependencyCategories.id, id));
      res.json({ message: "Category deleted" });
    } catch (error: any) {
      console.error("Error deleting dependency category:", error);
      res.status(500).json({ message: "Failed to delete dependency category" });
    }
  });

  // POST /api/dependency-categories/reset-defaults - Restore canonical system categories (admin only)
  app.post("/api/dependency-categories/reset-defaults", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset dependency categories to defaults" });
      }
      const { resetDependencyCategoryDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetDependencyCategoryDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });
      res.json({ message: "Dependency category defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting dependency category defaults:", error);
      res.status(500).json({ message: "Failed to reset dependency category defaults" });
    }
  });

  // Section-permission checks live in server/lib/section-permissions.ts
  // (shared with the user-management routes).

  // ── Assumptions Library ───────────────────────────────────────────────────

  // GET /api/assumptions - List library assumptions (all library items, no project scope)
  // Query params: categoryId (int), solutionId (int), isSystem (bool), includeInactive (bool)
  app.get("/api/assumptions", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, ASSUMPTIONS_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view assumptions" });

      const { categoryId, solutionId, isSystem, includeInactive } = req.query;
      const conditions: any[] = [];

      // Task #723 — demo isolation
      conditions.push(applyDemoFilter(assumptions));
      if (includeInactive !== "true") {
        conditions.push(eq(assumptions.isActive, true));
      }
      if (categoryId) conditions.push(eq(assumptions.categoryId, parseInt(categoryId as string)));
      if (solutionId) conditions.push(eq(assumptions.solutionId, parseInt(solutionId as string)));
      if (isSystem !== undefined) conditions.push(eq(assumptions.isSystem, isSystem === "true"));

      const createdByUserAlias = alias(users, 'createdByUser');
      const updatedByUserAlias = alias(users, 'updatedByUser');

      const rows = await db
        .select({
          assumption: assumptions,
          category: assumptionCategories,
          createdByUser: {
            firstName: createdByUserAlias.firstName,
            lastName: createdByUserAlias.lastName,
            email: createdByUserAlias.email,
          },
          updatedByUser: {
            firstName: updatedByUserAlias.firstName,
            lastName: updatedByUserAlias.lastName,
            email: updatedByUserAlias.email,
          },
        })
        .from(assumptions)
        .leftJoin(assumptionCategories, eq(assumptions.categoryId, assumptionCategories.id))
        .leftJoin(createdByUserAlias as any, eq(assumptions.createdBy, createdByUserAlias.id))
        .leftJoin(updatedByUserAlias as any, eq(assumptions.updatedBy, updatedByUserAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(assumptions.createdAt));

      res.json(rows.map((r) => ({ ...r.assumption, category: r.category, createdByUser: r.createdByUser?.email ? r.createdByUser : null, updatedByUser: r.updatedByUser?.email ? r.updatedByUser : null })));
    } catch (error: any) {
      console.error("Error fetching assumptions:", error);
      res.status(500).json({ message: "Failed to fetch assumptions" });
    }
  });

  // POST /api/assumptions - Create a library assumption
  app.post("/api/assumptions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const { title, description, notes, validationCheck, categoryId, solutionId, solutionIds, isSystem } = req.body;

      if (!title) return res.status(400).json({ message: "title is required" });

      if (isSystem && userRole !== "Admin") {
        return res.status(403).json({ message: "Only Admins can create system assumptions" });
      }

      const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
      if (!canEdit) {
        return res.status(403).json({ message: "You do not have permission to create assumptions" });
      }

      const [created] = await db
        .insert(assumptions)
        // Task #723 — auto-tag inserts from a demo session.
        .values(applyDemoFlag({
          title,
          description,
          notes,
          validationCheck,
          categoryId: categoryId ? parseInt(categoryId) : null,
          solutionId: solutionId ? parseInt(solutionId) : null,
          solutionIds: Array.isArray(solutionIds) ? solutionIds.map(Number) : null,
          isSystem: isSystem ?? false,
          isActive: true,
          createdBy: userId,
        }) as typeof assumptions.$inferInsert)
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating assumption:", error);
      res.status(500).json({ message: "Failed to create assumption" });
    }
  });

  // PATCH /api/assumptions/:id - Update a library assumption
  app.patch("/api/assumptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);

      const [existing] = await db.select().from(assumptions).where(eq(assumptions.id, id));
      if (!existing) return res.status(404).json({ message: "Assumption not found" });

      const isAdmin = userRole === "Admin";

      if (existing.isSystem && !isAdmin) {
        return res.status(403).json({ message: "Only Admins can edit system assumptions" });
      }

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to edit this assumption" });
        }
      }

      const { title, description, notes, validationCheck, categoryId, solutionId, solutionIds, isSystem, isActive } = req.body;
      const resolvedIsSystem = isAdmin && isSystem !== undefined ? isSystem : existing.isSystem;

      const [updated] = await db
        .update(assumptions)
        .set({
          title: title !== undefined ? title : existing.title,
          description: description !== undefined ? description : existing.description,
          notes: notes !== undefined ? notes : existing.notes,
          validationCheck: validationCheck !== undefined ? validationCheck : existing.validationCheck,
          categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : existing.categoryId,
          solutionId: solutionIds !== undefined ? null : (solutionId !== undefined ? (solutionId ? parseInt(solutionId) : null) : existing.solutionId),
          solutionIds: solutionIds !== undefined ? (Array.isArray(solutionIds) ? solutionIds.map(Number) : null) : existing.solutionIds,
          isSystem: resolvedIsSystem,
          isActive: isActive !== undefined ? isActive : existing.isActive,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(assumptions.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating assumption:", error);
      res.status(500).json({ message: "Failed to update assumption" });
    }
  });

  // DELETE /api/assumptions/:id - Delete a library assumption
  app.delete("/api/assumptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);

      const [existing] = await db.select().from(assumptions).where(eq(assumptions.id, id));
      if (!existing) return res.status(404).json({ message: "Assumption not found" });

      const isAdmin = userRole === "Admin";

      if (existing.isSystem && !isAdmin) {
        return res.status(403).json({ message: "Only Admins can delete system assumptions" });
      }

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to delete this assumption" });
        }
      }

      await db.delete(assumptions).where(eq(assumptions.id, id));
      res.json({ message: "Assumption deleted" });
    } catch (error: any) {
      console.error("Error deleting assumption:", error);
      res.status(500).json({ message: "Failed to delete assumption" });
    }
  });

  // ── Project Assumptions (Project Instances) ────────────────────────────────

  // GET /api/project-assumptions/all - All project assumption instances (for library usage overview)
  app.get("/api/project-assumptions/all", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, ASSUMPTIONS_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view assumptions" });

      const paCreatedByAlias = alias(users, 'paCreatedByUser');
      const paUpdatedByAlias = alias(users, 'paUpdatedByUser');

      const rows = await db
        .select({
          projectAssumption: projectAssumptions,
          assumption: assumptions,
          category: assumptionCategories,
          createdByUser: {
            firstName: paCreatedByAlias.firstName,
            lastName: paCreatedByAlias.lastName,
            email: paCreatedByAlias.email,
          },
          updatedByUser: {
            firstName: paUpdatedByAlias.firstName,
            lastName: paUpdatedByAlias.lastName,
            email: paUpdatedByAlias.email,
          },
        })
        .from(projectAssumptions)
        .innerJoin(assumptions, eq(projectAssumptions.assumptionId, assumptions.id))
        .leftJoin(assumptionCategories, eq(assumptions.categoryId, assumptionCategories.id))
        .leftJoin(paCreatedByAlias as any, eq(projectAssumptions.createdBy, paCreatedByAlias.id))
        .leftJoin(paUpdatedByAlias as any, eq(projectAssumptions.updatedBy, paUpdatedByAlias.id))
        .orderBy(desc(projectAssumptions.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectAssumption,
        libraryItem: { ...r.assumption, category: r.category },
        title: r.assumption.title,
        categoryId: r.assumption.categoryId,
        category: r.category,
        solutionIds: r.assumption.solutionIds,
        isSystem: r.assumption.isSystem,
        isActive: r.assumption.isActive,
        createdByUser: r.createdByUser?.email ? r.createdByUser : null,
        updatedByUser: r.updatedByUser?.email ? r.updatedByUser : null,
      })));
    } catch (error: any) {
      console.error("Error fetching all project assumptions:", error);
      res.status(500).json({ message: "Failed to fetch project assumptions" });
    }
  });

  // GET /api/project-assumptions - List project assumption instances
  // Query params: projectId (required int)
  app.get("/api/project-assumptions", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, ASSUMPTIONS_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view assumptions" });

      const { projectId } = req.query;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const rows = await db
        .select({
          projectAssumption: projectAssumptions,
          assumption: assumptions,
          category: assumptionCategories,
        })
        .from(projectAssumptions)
        .innerJoin(assumptions, eq(projectAssumptions.assumptionId, assumptions.id))
        .leftJoin(assumptionCategories, eq(assumptions.categoryId, assumptionCategories.id))
        .where(eq(projectAssumptions.projectId, parseInt(projectId as string)))
        .orderBy(desc(projectAssumptions.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectAssumption,
        projectSolutionIds: r.projectAssumption.solutionIds ?? [],
        libraryItem: { ...r.assumption, category: r.category },
        title: r.assumption.title,
        categoryId: r.assumption.categoryId,
        category: r.category,
        librarySolutionIds: r.assumption.solutionIds,
        isSystem: r.assumption.isSystem,
        isActive: r.assumption.isActive,
        createdBy: r.projectAssumption.createdBy,
      })));
    } catch (error: any) {
      console.error("Error fetching project assumptions:", error);
      res.status(500).json({ message: "Failed to fetch project assumptions" });
    }
  });

  // POST /api/project-assumptions - Link a library assumption to a project
  app.post("/api/project-assumptions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
      if (!canEdit) return res.status(403).json({ message: "You do not have permission to create assumptions" });

      const { assumptionId, projectId, description, notes, validationCheck, solutionId, solutionIds } = req.body;
      if (!assumptionId) return res.status(400).json({ message: "assumptionId is required" });
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const [lib] = await db.select().from(assumptions).where(eq(assumptions.id, parseInt(assumptionId)));
      if (!lib) return res.status(404).json({ message: "Library assumption not found" });

      const resolvedSolutionIds = Array.isArray(solutionIds)
        ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];

      const [created] = await db
        .insert(projectAssumptions)
        .values({
          assumptionId: parseInt(assumptionId),
          projectId: parseInt(projectId),
          description,
          notes,
          validationCheck,
          solutionId: solutionId ? parseInt(solutionId) : (resolvedSolutionIds[0] ?? null),
          solutionIds: resolvedSolutionIds,
          createdBy: userId,
        })
        .returning();
      res.status(201).json({ ...created, libraryItem: lib });
    } catch (error: any) {
      console.error("Error creating project assumption:", error);
      res.status(500).json({ message: "Failed to create project assumption" });
    }
  });

  // PATCH /api/project-assumptions/:id - Update a project assumption instance
  app.patch("/api/project-assumptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);
      const isAdmin = userRole === "Admin";

      const [existing] = await db.select().from(projectAssumptions).where(eq(projectAssumptions.id, id));
      if (!existing) return res.status(404).json({ message: "Project assumption not found" });

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to edit this assumption" });
        }
      }

      const { description, notes, validationCheck, solutionId, solutionIds } = req.body;

      const resolvedSolutionIds = solutionIds !== undefined
        ? (Array.isArray(solutionIds) ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)) : [])
        : existing.solutionIds ?? [];

      const [updated] = await db
        .update(projectAssumptions)
        .set({
          description: description !== undefined ? description : existing.description,
          notes: notes !== undefined ? notes : existing.notes,
          validationCheck: validationCheck !== undefined ? validationCheck : existing.validationCheck,
          solutionId: solutionId !== undefined ? (solutionId ? parseInt(solutionId) : null) : (resolvedSolutionIds[0] ?? existing.solutionId),
          solutionIds: resolvedSolutionIds,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(projectAssumptions.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating project assumption:", error);
      res.status(500).json({ message: "Failed to update project assumption" });
    }
  });

  // DELETE /api/project-assumptions/:id - Remove a project assumption instance
  app.delete("/api/project-assumptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);
      const isAdmin = userRole === "Admin";

      const [existing] = await db.select().from(projectAssumptions).where(eq(projectAssumptions.id, id));
      if (!existing) return res.status(404).json({ message: "Project assumption not found" });

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, ASSUMPTIONS_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to delete this assumption" });
        }
      }

      await db.delete(projectAssumptions).where(eq(projectAssumptions.id, id));
      res.json({ message: "Project assumption removed" });
    } catch (error: any) {
      console.error("Error deleting project assumption:", error);
      res.status(500).json({ message: "Failed to delete project assumption" });
    }
  });

  // GET /api/projects/:id/assumptions - Get assumption instances for a project (compat route)
  app.get("/api/projects/:id/assumptions", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, ASSUMPTIONS_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view assumptions" });

      const projectId = parseInt(req.params.id as string);

      const rows = await db
        .select({
          projectAssumption: projectAssumptions,
          assumption: assumptions,
          category: assumptionCategories,
        })
        .from(projectAssumptions)
        .innerJoin(assumptions, eq(projectAssumptions.assumptionId, assumptions.id))
        .leftJoin(assumptionCategories, eq(assumptions.categoryId, assumptionCategories.id))
        .where(eq(projectAssumptions.projectId, projectId))
        .orderBy(desc(projectAssumptions.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectAssumption,
        libraryItem: { ...r.assumption, category: r.category },
        title: r.assumption.title,
        categoryId: r.assumption.categoryId,
        category: r.category,
        solutionIds: r.assumption.solutionIds,
        isSystem: r.assumption.isSystem,
        isActive: r.assumption.isActive,
      })));
    } catch (error: any) {
      console.error("Error fetching project assumptions:", error);
      res.status(500).json({ message: "Failed to fetch project assumptions" });
    }
  });

  // ── Dependencies Library ──────────────────────────────────────────────────

  // GET /api/dependencies/stats - Revenue at risk from projects with blocking project dependencies
  app.get("/api/dependencies/stats", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, DEPENDENCIES_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view dependencies" });

      const result = await db.execute(sql`
        SELECT COALESCE(SUM(acv), 0) AS revenue_at_risk,
               COUNT(pid)            AS blocking_project_count
        FROM (
          SELECT DISTINCT p.id AS pid,
            COALESCE(
              NULLIF(REGEXP_REPLACE(p.opportunity_acv_value, '[^0-9.]', '', 'g'), '')::numeric,
              0
            ) AS acv
          FROM project_dependencies pd
          JOIN projects p ON pd.project_id = p.id
          JOIN dependencies d ON pd.dependency_id = d.id
          WHERE pd.status = 'blocking'
            AND d.is_active = true
        ) subq
      `);
      const connectedResult = await db.execute(sql`
        SELECT COUNT(DISTINCT pd.project_id) AS projects_connected
        FROM project_dependencies pd
        JOIN dependencies d ON pd.dependency_id = d.id
        WHERE d.is_active = true
      `);
      const row: any = (result as any).rows?.[0] ?? (result as any)?.[0] ?? {};
      const connRow: any = (connectedResult as any).rows?.[0] ?? (connectedResult as any)?.[0] ?? {};
      res.json({
        revenueAtRisk: parseFloat(String(row.revenue_at_risk || "0")),
        blockingProjectCount: parseInt(String(row.blocking_project_count || "0"), 10),
        projectsConnected: parseInt(String(connRow.projects_connected || "0"), 10),
      });
    } catch (error: any) {
      console.error("Error fetching dependency stats:", error);
      res.status(500).json({ message: "Failed to fetch dependency stats" });
    }
  });

  // GET /api/dependencies - List library dependencies
  // Query params: categoryId (int), solutionId (int), isSystem (bool), includeInactive (bool)
  app.get("/api/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, DEPENDENCIES_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view dependencies" });

      const { categoryId, solutionId, isSystem, includeInactive } = req.query;
      const conditions: any[] = [];
      // Task #723 — demo isolation
      conditions.push(applyDemoFilter(dependencies));
      if (includeInactive !== "true") conditions.push(eq(dependencies.isActive, true));
      if (categoryId) conditions.push(eq(dependencies.categoryId, parseInt(categoryId as string)));
      if (solutionId) conditions.push(eq(dependencies.solutionId, parseInt(solutionId as string)));
      if (isSystem !== undefined) conditions.push(eq(dependencies.isSystem, isSystem === "true"));

      const depCreatedByUserAlias = alias(users, 'depCreatedByUser');
      const depUpdatedByUserAlias = alias(users, 'depUpdatedByUser');

      const rows = await db
        .select({
          dependency: dependencies,
          category: dependencyCategories,
          createdByUser: {
            firstName: depCreatedByUserAlias.firstName,
            lastName: depCreatedByUserAlias.lastName,
            email: depCreatedByUserAlias.email,
          },
          updatedByUser: {
            firstName: depUpdatedByUserAlias.firstName,
            lastName: depUpdatedByUserAlias.lastName,
            email: depUpdatedByUserAlias.email,
          },
        })
        .from(dependencies)
        .leftJoin(dependencyCategories, eq(dependencies.categoryId, dependencyCategories.id))
        .leftJoin(depCreatedByUserAlias as any, eq(dependencies.createdBy, depCreatedByUserAlias.id))
        .leftJoin(depUpdatedByUserAlias as any, eq(dependencies.updatedBy, depUpdatedByUserAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(dependencies.createdAt));

      res.json(rows.map((r) => ({ ...r.dependency, category: r.category, createdByUser: r.createdByUser?.email ? r.createdByUser : null, updatedByUser: r.updatedByUser?.email ? r.updatedByUser : null })));
    } catch (error: any) {
      console.error("Error fetching dependencies:", error);
      res.status(500).json({ message: "Failed to fetch dependencies" });
    }
  });

  // POST /api/dependencies - Create a library dependency
  app.post("/api/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const isAdmin = userRole === "Admin";
      const { title, description, notes, validationCheck, categoryId, solutionId, solutionIds, isAllSolutions, isSystem } = req.body;

      if (!title) return res.status(400).json({ message: "title is required" });

      const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
      if (!canEdit) {
        return res.status(403).json({ message: "You do not have permission to create dependencies" });
      }

      if (isSystem && !isAdmin) {
        return res.status(403).json({ message: "Only Admins can create system dependencies" });
      }

      const [created] = await db
        .insert(dependencies)
        // Task #723 — auto-tag inserts from a demo session.
        .values(applyDemoFlag({
          title,
          description,
          notes,
          validationCheck,
          categoryId: categoryId ? parseInt(categoryId) : null,
          solutionId: solutionId ? parseInt(solutionId) : null,
          solutionIds: Array.isArray(solutionIds) ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)) : [],
          isAllSolutions: isAllSolutions !== false,
          isSystem: isAdmin ? (isSystem ?? false) : false,
          isActive: true,
          createdBy: userId,
        }) as typeof dependencies.$inferInsert)
        .returning();
      res.status(201).json(created);
    } catch (error: any) {
      console.error("Error creating dependency:", error);
      res.status(500).json({ message: "Failed to create dependency" });
    }
  });

  // PATCH /api/dependencies/:id - Update a library dependency
  app.patch("/api/dependencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);

      const [existing] = await db.select().from(dependencies).where(eq(dependencies.id, id));
      if (!existing) return res.status(404).json({ message: "Dependency not found" });

      const isAdmin = userRole === "Admin";

      if (existing.isSystem && !isAdmin) {
        return res.status(403).json({ message: "Only Admins can edit system dependencies" });
      }

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to edit this dependency" });
        }
      }

      const { title, description, notes, validationCheck, categoryId, solutionId, solutionIds, isAllSolutions, isActive, isSystem: isSystemUpdate } = req.body;

      const [updated] = await db
        .update(dependencies)
        .set({
          title: title !== undefined ? title : existing.title,
          description: description !== undefined ? description : existing.description,
          notes: notes !== undefined ? notes : existing.notes,
          validationCheck: validationCheck !== undefined ? validationCheck : existing.validationCheck,
          categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : existing.categoryId,
          solutionId: solutionId !== undefined ? (solutionId ? parseInt(solutionId) : null) : existing.solutionId,
          solutionIds: solutionIds !== undefined ? (Array.isArray(solutionIds) ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)) : []) : existing.solutionIds ?? [],
          isAllSolutions: isAllSolutions !== undefined ? isAllSolutions : existing.isAllSolutions ?? true,
          isActive: isActive !== undefined ? isActive : existing.isActive,
          isSystem: (isSystemUpdate !== undefined && isAdmin) ? isSystemUpdate : existing.isSystem,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(dependencies.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating dependency:", error);
      res.status(500).json({ message: "Failed to update dependency" });
    }
  });

  // DELETE /api/dependencies/:id - Delete a library dependency
  app.delete("/api/dependencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);

      const [existing] = await db.select().from(dependencies).where(eq(dependencies.id, id));
      if (!existing) return res.status(404).json({ message: "Dependency not found" });

      const isAdmin = userRole === "Admin";

      if (existing.isSystem && !isAdmin) {
        return res.status(403).json({ message: "Only Admins can delete system dependencies" });
      }

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to delete this dependency" });
        }
      }

      await db.delete(dependencies).where(eq(dependencies.id, id));
      res.json({ message: "Dependency deleted" });
    } catch (error: any) {
      console.error("Error deleting dependency:", error);
      res.status(500).json({ message: "Failed to delete dependency" });
    }
  });

  // ── Project Dependencies (Project Instances) ──────────────────────────────

  // GET /api/project-dependencies/all - All project dependency instances (for library usage overview)
  app.get("/api/project-dependencies/all", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, DEPENDENCIES_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view dependencies" });

      const pdCreatedByAlias = alias(users, 'pdCreatedByUser');
      const pdUpdatedByAlias = alias(users, 'pdUpdatedByUser');

      const rows = await db
        .select({
          projectDependency: projectDependencies,
          dependency: dependencies,
          category: dependencyCategories,
          createdByUser: {
            firstName: pdCreatedByAlias.firstName,
            lastName: pdCreatedByAlias.lastName,
            email: pdCreatedByAlias.email,
          },
          updatedByUser: {
            firstName: pdUpdatedByAlias.firstName,
            lastName: pdUpdatedByAlias.lastName,
            email: pdUpdatedByAlias.email,
          },
        })
        .from(projectDependencies)
        .innerJoin(dependencies, eq(projectDependencies.dependencyId, dependencies.id))
        .leftJoin(dependencyCategories, eq(dependencies.categoryId, dependencyCategories.id))
        .leftJoin(pdCreatedByAlias as any, eq(projectDependencies.createdBy, pdCreatedByAlias.id))
        .leftJoin(pdUpdatedByAlias as any, eq(projectDependencies.updatedBy, pdUpdatedByAlias.id))
        .orderBy(desc(projectDependencies.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectDependency,
        projectSolutionIds: r.projectDependency.solutionIds ?? [],
        libraryItem: { ...r.dependency, category: r.category },
        title: r.dependency.title,
        categoryId: r.dependency.categoryId,
        category: r.category,
        librarySolutionIds: r.dependency.solutionIds,
        libraryIsAllSolutions: r.dependency.isAllSolutions,
        isSystem: r.dependency.isSystem,
        isActive: r.dependency.isActive,
        createdByUser: r.createdByUser?.email ? r.createdByUser : null,
        updatedByUser: r.updatedByUser?.email ? r.updatedByUser : null,
      })));
    } catch (error: any) {
      console.error("Error fetching all project dependencies:", error);
      res.status(500).json({ message: "Failed to fetch project dependencies" });
    }
  });

  // GET /api/project-dependencies - List project dependency instances
  // Query params: projectId (required int), status (string)
  app.get("/api/project-dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, DEPENDENCIES_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view dependencies" });

      const { projectId, status } = req.query;
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const conditions: any[] = [eq(projectDependencies.projectId, parseInt(projectId as string))];
      if (status) conditions.push(eq(projectDependencies.status, status as string));

      const rows = await db
        .select({
          projectDependency: projectDependencies,
          dependency: dependencies,
          category: dependencyCategories,
        })
        .from(projectDependencies)
        .innerJoin(dependencies, eq(projectDependencies.dependencyId, dependencies.id))
        .leftJoin(dependencyCategories, eq(dependencies.categoryId, dependencyCategories.id))
        .where(and(...conditions))
        .orderBy(desc(projectDependencies.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectDependency,
        projectSolutionIds: r.projectDependency.solutionIds ?? [],
        libraryItem: { ...r.dependency, category: r.category },
        title: r.dependency.title,
        categoryId: r.dependency.categoryId,
        category: r.category,
        librarySolutionIds: r.dependency.solutionIds,
        isSystem: r.dependency.isSystem,
        isActive: r.dependency.isActive,
        createdBy: r.projectDependency.createdBy,
      })));
    } catch (error: any) {
      console.error("Error fetching project dependencies:", error);
      res.status(500).json({ message: "Failed to fetch project dependencies" });
    }
  });

  // POST /api/project-dependencies - Link a library dependency to a project
  app.post("/api/project-dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
      if (!canEdit) return res.status(403).json({ message: "You do not have permission to create dependencies" });

      const { dependencyId, projectId, status, owner, dueDate, description, notes, validationCheck, solutionId, solutionIds, successCriteriaId, successCriteriaIds, assignedUserIds, assignedCustomerEmails, assignedTeams } = req.body;
      if (!dependencyId) return res.status(400).json({ message: "dependencyId is required" });
      if (!projectId) return res.status(400).json({ message: "projectId is required" });

      const VALID_STATUSES = ["open", "in_review", "blocking", "resolved", "fail", "blocked", "inconclusive"] as const;
      const resolvedStatus = status || "open";
      if (!VALID_STATUSES.includes(resolvedStatus)) {
        return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(", ")}` });
      }

      const [lib] = await db.select().from(dependencies).where(eq(dependencies.id, parseInt(dependencyId)));
      if (!lib) return res.status(404).json({ message: "Library dependency not found" });

      const resolvedSolutionIds = Array.isArray(solutionIds)
        ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : [];

      const resolvedSuccessCriteriaIds = Array.isArray(successCriteriaIds)
        ? successCriteriaIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
        : successCriteriaId
        ? [parseInt(successCriteriaId)]
        : [];
      const resolvedSuccessCriteriaId = resolvedSuccessCriteriaIds[0] ?? null;

      const [created] = await db
        .insert(projectDependencies)
        .values({
          dependencyId: parseInt(dependencyId),
          projectId: parseInt(projectId),
          status: resolvedStatus,
          owner,
          dueDate: dueDate ? new Date(dueDate) : null,
          description,
          notes,
          validationCheck,
          solutionId: solutionId ? parseInt(solutionId) : (resolvedSolutionIds[0] ?? null),
          solutionIds: resolvedSolutionIds,
          successCriteriaId: resolvedSuccessCriteriaId,
          successCriteriaIds: resolvedSuccessCriteriaIds,
          assignedUserIds: Array.isArray(assignedUserIds) ? assignedUserIds : [],
          assignedCustomerEmails: Array.isArray(assignedCustomerEmails) ? assignedCustomerEmails : [],
          assignedTeams: Array.isArray(assignedTeams) ? assignedTeams : [],
          createdBy: userId,
        })
        .returning();
      res.status(201).json({ ...created, libraryItem: lib });
    } catch (error: any) {
      console.error("Error creating project dependency:", error);
      res.status(500).json({ message: "Failed to create project dependency" });
    }
  });

  // PATCH /api/project-dependencies/:id - Update a project dependency instance
  app.patch("/api/project-dependencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);
      const isAdmin = userRole === "Admin";

      const [existing] = await db.select().from(projectDependencies).where(eq(projectDependencies.id, id));
      if (!existing) return res.status(404).json({ message: "Project dependency not found" });

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
        if (!canEdit) {
          return res.status(403).json({ message: "You do not have permission to edit this dependency" });
        }
        const isPinToggleOnly = Object.keys(req.body).length === 1 && 'showOnSuccessCriteria' in req.body;
        if (!isPinToggleOnly) {
          const isOwner = existing.createdBy === userId;
          if (!isOwner) {
            return res.status(403).json({ message: "You do not have permission to edit this dependency" });
          }
        }
      }

      const { status, owner, dueDate, description, notes, validationCheck, solutionId, solutionIds, successCriteriaId, successCriteriaIds, showOnSuccessCriteria, assignedUserIds, assignedCustomerEmails, assignedTeams } = req.body;

      if (status !== undefined) {
        const VALID_STATUSES = ["open", "in_review", "blocking", "resolved", "fail", "blocked", "inconclusive"];
        if (!VALID_STATUSES.includes(status)) {
          return res.status(400).json({ message: `status must be one of: ${VALID_STATUSES.join(", ")}` });
        }
      }

      const resolvedSolutionIds = solutionIds !== undefined
        ? (Array.isArray(solutionIds) ? solutionIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id)) : [])
        : existing.solutionIds ?? [];

      const resolvedSuccessCriteriaIds = (() => {
        if (successCriteriaIds !== undefined) {
          const arr = Array.isArray(successCriteriaIds)
            ? successCriteriaIds.map((id: any) => parseInt(id)).filter((id: number) => !isNaN(id))
            : [];
          if (arr.length > 0) return arr;
          if (successCriteriaId) return [parseInt(successCriteriaId)];
          return arr;
        }
        if (successCriteriaId !== undefined) {
          return successCriteriaId ? [parseInt(successCriteriaId)] : (existing.successCriteriaIds ?? []);
        }
        return existing.successCriteriaIds ?? [];
      })();
      const resolvedSuccessCriteriaId = resolvedSuccessCriteriaIds[0] ?? null;

      const [updated] = await db
        .update(projectDependencies)
        .set({
          status: status !== undefined ? status : existing.status,
          owner: owner !== undefined ? owner : existing.owner,
          dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
          description: description !== undefined ? description : existing.description,
          notes: notes !== undefined ? notes : existing.notes,
          validationCheck: validationCheck !== undefined ? validationCheck : existing.validationCheck,
          solutionId: solutionId !== undefined ? (solutionId ? parseInt(solutionId) : null) : (resolvedSolutionIds[0] ?? existing.solutionId),
          solutionIds: resolvedSolutionIds,
          successCriteriaId: resolvedSuccessCriteriaId,
          successCriteriaIds: resolvedSuccessCriteriaIds,
          showOnSuccessCriteria: showOnSuccessCriteria !== undefined ? Boolean(showOnSuccessCriteria) : (existing.showOnSuccessCriteria ?? false),
          assignedUserIds: assignedUserIds !== undefined ? (Array.isArray(assignedUserIds) ? assignedUserIds : []) : (existing.assignedUserIds ?? []),
          assignedCustomerEmails: assignedCustomerEmails !== undefined ? (Array.isArray(assignedCustomerEmails) ? assignedCustomerEmails : []) : (existing.assignedCustomerEmails ?? []),
          assignedTeams: assignedTeams !== undefined ? (Array.isArray(assignedTeams) ? assignedTeams : []) : (existing.assignedTeams ?? []),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(projectDependencies.id, id))
        .returning();
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating project dependency:", error);
      res.status(500).json({ message: "Failed to update project dependency" });
    }
  });

  // DELETE /api/project-dependencies/:id - Remove a project dependency instance
  app.delete("/api/project-dependencies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const userRole = req.session.user?.role;
      const id = parseInt(req.params.id as string);
      const isAdmin = userRole === "Admin";

      const [existing] = await db.select().from(projectDependencies).where(eq(projectDependencies.id, id));
      if (!existing) return res.status(404).json({ message: "Project dependency not found" });

      if (!isAdmin) {
        const canEdit = await userCanEditSection(req, DEPENDENCIES_SECTION);
        const isOwner = existing.createdBy === userId;
        if (!(canEdit && isOwner)) {
          return res.status(403).json({ message: "You do not have permission to delete this dependency" });
        }
      }

      await db.delete(projectDependencies).where(eq(projectDependencies.id, id));
      res.json({ message: "Project dependency removed" });
    } catch (error: any) {
      console.error("Error deleting project dependency:", error);
      res.status(500).json({ message: "Failed to delete project dependency" });
    }
  });

  // GET /api/projects/:id/dependencies - Get dependency instances for a project (compat route)
  app.get("/api/projects/:id/dependencies", isAuthenticated, async (req: any, res) => {
    try {
      const canView = await userCanViewSection(req, DEPENDENCIES_SECTION);
      if (!canView) return res.status(403).json({ message: "You do not have permission to view dependencies" });

      const projectId = parseInt(req.params.id as string);
      const { status } = req.query;
      const conditions: any[] = [eq(projectDependencies.projectId, projectId)];
      if (status) conditions.push(eq(projectDependencies.status, status as string));

      const rows = await db
        .select({
          projectDependency: projectDependencies,
          dependency: dependencies,
          category: dependencyCategories,
        })
        .from(projectDependencies)
        .innerJoin(dependencies, eq(projectDependencies.dependencyId, dependencies.id))
        .leftJoin(dependencyCategories, eq(dependencies.categoryId, dependencyCategories.id))
        .where(and(...conditions))
        .orderBy(desc(projectDependencies.createdAt));

      res.json(rows.map((r) => ({
        ...r.projectDependency,
        projectSolutionIds: r.projectDependency.solutionIds ?? [],
        libraryItem: { ...r.dependency, category: r.category },
        title: r.dependency.title,
        categoryId: r.dependency.categoryId,
        category: r.category,
        librarySolutionIds: r.dependency.solutionIds,
        isSystem: r.dependency.isSystem,
        isActive: r.dependency.isActive,
      })));
    } catch (error: any) {
      console.error("Error fetching project dependencies:", error);
      res.status(500).json({ message: "Failed to fetch project dependencies" });
    }
  });
}
