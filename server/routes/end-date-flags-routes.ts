// End Date Flags CRUD + reset-defaults.
//
// Extracted from server/routes.ts (Phase 8 extraction #4 — see
// docs/archive/routes-split-plan.md). 6 handlers covering the End Date
// Flag library (color-coded markers used on project end-date pickers).
//
// Endpoints owned by this module:
//   GET    /api/end-date-flags                  (auth)
//   GET    /api/end-date-flags/active           (auth)
//   POST   /api/end-date-flags                  (auth, Admin only)
//   PUT    /api/end-date-flags/:id              (auth, Admin only, slow-save tracked)
//   POST   /api/end-date-flags/reset-defaults   (auth, Admin only)
//   DELETE /api/end-date-flags/:id              (auth, Admin only)
//
// The PUT handler is wrapped in `warnIfSlowSave` (Task #495) so a
// Dokploy / Traefik 504 on the save path can be triaged from the
// access log alone. Preserves the same wrapper here. See
// docs/guides/dokploy-traefik-timeouts.md.
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { warnIfSlowSave } from "../lib/slow-save-warn";

export function registerEndDateFlagsRoutes(app: Express) {
  // GET /api/end-date-flags — full list (auth)
  app.get('/api/end-date-flags', isAuthenticated, async (req, res) => {
    try {
      const flags = await storage.getEndDateFlags();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json(flags);
    } catch (error: any) {
      console.error("Error fetching end date flags:", error);
      res.status(500).json({ message: "Failed to fetch end date flags" });
    }
  });

  // GET /api/end-date-flags/active — active subset (auth)
  app.get('/api/end-date-flags/active', isAuthenticated, async (req, res) => {
    try {
      const flags = await storage.getActiveEndDateFlags();
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.json(flags);
    } catch (error: any) {
      console.error("Error fetching active end date flags:", error);
      res.status(500).json({ message: "Failed to fetch active end date flags" });
    }
  });

  // POST /api/end-date-flags — create (Admin only)
  app.post('/api/end-date-flags', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can create end date flags' });
      }

      const flag = await storage.createEndDateFlag({
        ...req.body,
        createdBy: userId
      });
      res.status(201).json(flag);
    } catch (error: any) {
      console.error("Error creating end date flag:", error);
      res.status(500).json({ message: "Failed to create end date flag" });
    }
  });

  // PUT /api/end-date-flags/:id — update (Admin only, slow-save tracked)
  app.put('/api/end-date-flags/:id', isAuthenticated, async (req: any, res) => {
    // Task #495: instrument the save path so a Dokploy / Traefik 504
    // can be triaged from the access log alone — see
    // docs/guides/dokploy-traefik-timeouts.md.
    const startMs = Date.now();
    const rawId = req.params.id as string;
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can update end date flags' });
      }

      const flag = await storage.updateEndDateFlag(parseInt(rawId), req.body);
      res.json(flag);
    } catch (error: any) {
      console.error("Error updating end date flag:", error);
      res.status(500).json({ message: "Failed to update end date flag" });
    } finally {
      warnIfSlowSave('PUT /api/end-date-flags/:id', startMs, { id: rawId });
    }
  });

  // POST /api/end-date-flags/reset-defaults — restore defaults (Admin only)
  app.post('/api/end-date-flags/reset-defaults', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset end date flags to defaults" });
      }
      const { resetEndDateFlagDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetEndDateFlagDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });
      res.json({ message: "End date flag defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting end date flag defaults:", error);
      res.status(500).json({ message: "Failed to reset end date flag defaults" });
    }
  });

  // DELETE /api/end-date-flags/:id — delete (Admin only)
  app.delete('/api/end-date-flags/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'Admin') {
        return res.status(403).json({ message: 'Only administrators can delete end date flags' });
      }

      await storage.deleteEndDateFlag(parseInt(req.params.id as string));
      res.json({ message: 'End date flag deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting end date flag:', error);
      res.status(500).json({ message: 'Failed to delete end date flag' });
    }
  });
}
