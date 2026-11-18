// Tags CRUD + system-tag management.
//
// Extracted from server/routes.ts (Phase 8 extraction #5 — see
// docs/archive/routes-split-plan.md). 8 handlers covering both the
// user-tag CRUD and the system-tag (project-template tag library)
// management surface.
//
// Endpoints owned by this module:
//   GET    /api/tags                              (auth)
//   GET    /api/tags/system                       (auth)
//   PUT    /api/tags/system/:tagName              (auth, Admin only)
//   POST   /api/tags/system/reset-defaults        (auth, Admin only)
//   DELETE /api/tags/system/:tagName              (auth, Admin only)
//   POST   /api/tags                              (auth)
//   PATCH  /api/tags/:id                          (auth)
//   DELETE /api/tags/:id                          (auth)
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerTagsRoutes(app: Express) {
  // GET /api/tags — full tag list (auth)
  app.get('/api/tags', isAuthenticated, async (req, res) => {
    try {
      const tags = await storage.getTags();
      res.json(tags);
    } catch (error: any) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ message: "Failed to fetch tags" });
    }
  });

  // GET /api/tags/system — system-managed tags only (auth)
  app.get('/api/tags/system', isAuthenticated, async (req, res) => {
    try {
      const tags = await storage.getAllSystemTags();
      res.json(tags);
    } catch (error: any) {
      console.error("Error fetching system tags:", error);
      res.status(500).json({ message: "Failed to fetch system tags" });
    }
  });

  // PUT /api/tags/system/:tagName — edit a system tag (Admin only)
  app.put('/api/tags/system/:tagName', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'Admin') {
        return res.status(403).json({ message: "Only admins can edit system tags" });
      }

      const { tagName } = req.params;
      const { name, description, color } = req.body;

      await storage.updateSystemTag(tagName, { name, description, color });
      res.json({ message: "System tag updated successfully" });
    } catch (error: any) {
      console.error("Error updating system tag:", error);
      res.status(500).json({ message: "Failed to update system tag" });
    }
  });

  // POST /api/tags/system/reset-defaults — restore system-tag defaults (Admin only)
  app.post('/api/tags/system/reset-defaults', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset system tags to defaults" });
      }
      const { resetSystemTagDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetSystemTagDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });
      res.json({ message: "System tag defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting system tag defaults:", error);
      res.status(500).json({ message: "Failed to reset system tag defaults" });
    }
  });

  // DELETE /api/tags/system/:tagName — delete a system tag (Admin only)
  app.delete('/api/tags/system/:tagName', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'Admin') {
        return res.status(403).json({ message: "Only admins can delete system tags" });
      }

      const { tagName } = req.params;

      await storage.deleteSystemTag(tagName);
      res.json({ message: "System tag deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting system tag:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete system tag: This tag is still being used in templates, projects, or success criteria. Please remove all references before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete system tag due to an unexpected error" });
    }
  });

  // POST /api/tags — create a user tag (auth)
  app.post('/api/tags', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const tagData = { ...req.body, createdBy: userId };
      const newTag = await storage.createTag(tagData);
      res.status(201).json(newTag);
    } catch (error: any) {
      console.error("Error creating tag:", error);
      res.status(500).json({ message: "Failed to create tag" });
    }
  });

  // PATCH /api/tags/:id — update a user tag (auth)
  app.patch('/api/tags/:id', isAuthenticated, async (req, res) => {
    try {
      const tagId = parseInt(req.params.id as string);
      const updatedTag = await storage.updateTag(tagId, req.body);
      res.json(updatedTag);
    } catch (error: any) {
      console.error("Error updating tag:", error);
      res.status(500).json({ message: "Failed to update tag" });
    }
  });

  // DELETE /api/tags/:id — delete a user tag (auth)
  app.delete('/api/tags/:id', isAuthenticated, async (req, res) => {
    try {
      const tagId = parseInt(req.params.id as string);
      await storage.deleteTag(tagId);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting tag:", error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete tag: This tag is still being used in templates, projects, or success criteria. Please remove all references before deleting."
        });
      }

      res.status(500).json({ message: "Failed to delete tag due to an unexpected error" });
    }
  });
}
