// Admin-only Flight Deck Tips CRUD (Phase 8 extraction #11a).
//
// 5 handlers — list / create / update / delete / seed-defaults — all
// gated on `userRole === 'Admin'`. The shared seed-defaults list and
// the random-tip helper now live in lib/flight-deck-tips.ts so the
// non-admin Flight Deck engine endpoints in routes.ts can keep using
// them too.
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { storage } from "../storage";
import { flightDeckTips } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { defaultTipsOfTheDay } from "../lib/flight-deck-tips";

export function registerAdminFlightDeckTipsRoutes(app: Express) {
  // GET /api/admin/flight-deck-tips - List all tips
  app.get("/api/admin/flight-deck-tips", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tips = await storage.db
        .select({
          id: flightDeckTips.id,
          tipText: flightDeckTips.tipText,
          isActive: flightDeckTips.isActive,
          displayOrder: flightDeckTips.displayOrder,
          createdBy: flightDeckTips.createdBy,
          createdAt: flightDeckTips.createdAt,
          updatedAt: flightDeckTips.updatedAt,
        })
        .from(flightDeckTips)
        .orderBy(flightDeckTips.displayOrder);

      res.json(tips);
    } catch (error: any) {
      console.error("Error fetching Flight Deck tips:", error);
      res.status(500).json({ message: "Failed to fetch tips" });
    }
  });

  // POST /api/admin/flight-deck-tips - Create a new tip
  app.post("/api/admin/flight-deck-tips", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { tipText, isActive, displayOrder } = req.body;

      if (!tipText || tipText.trim() === '') {
        return res.status(400).json({ message: "Tip text is required" });
      }

      const [newTip] = await storage.db
        .insert(flightDeckTips)
        .values({
          tipText: tipText.trim(),
          isActive: isActive ?? true,
          displayOrder: displayOrder ?? 0,
          createdBy: req.session.user.id,
        })
        .returning();

      res.status(201).json(newTip);
    } catch (error: any) {
      console.error("Error creating Flight Deck tip:", error);
      res.status(500).json({ message: "Failed to create tip" });
    }
  });

  // PUT /api/admin/flight-deck-tips/:id - Update a tip
  app.put("/api/admin/flight-deck-tips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tipId = parseInt(req.params.id as string);
      const { tipText, isActive, displayOrder } = req.body;

      const [updatedTip] = await storage.db
        .update(flightDeckTips)
        .set({
          tipText: tipText?.trim(),
          isActive,
          displayOrder,
          updatedAt: new Date(),
        })
        .where(eq(flightDeckTips.id, tipId))
        .returning();

      if (!updatedTip) {
        return res.status(404).json({ message: "Tip not found" });
      }

      res.json(updatedTip);
    } catch (error: any) {
      console.error("Error updating Flight Deck tip:", error);
      res.status(500).json({ message: "Failed to update tip" });
    }
  });

  // DELETE /api/admin/flight-deck-tips/:id - Delete a tip
  app.delete("/api/admin/flight-deck-tips/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const tipId = parseInt(req.params.id as string);

      const [deletedTip] = await storage.db
        .delete(flightDeckTips)
        .where(eq(flightDeckTips.id, tipId))
        .returning();

      if (!deletedTip) {
        return res.status(404).json({ message: "Tip not found" });
      }

      res.json({ message: "Tip deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting Flight Deck tip:", error);
      res.status(500).json({ message: "Failed to delete tip" });
    }
  });

  // POST /api/admin/flight-deck-tips/seed - Seed default tips
  app.post("/api/admin/flight-deck-tips/seed", isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;
      if (userRole !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      // Check if tips already exist
      const existingTips = await storage.db
        .select({ id: flightDeckTips.id })
        .from(flightDeckTips)
        .limit(1);

      if (existingTips.length > 0) {
        return res.status(400).json({ message: "Tips already exist. Delete existing tips first to reseed." });
      }

      // Seed default tips
      const seededTips = await storage.db
        .insert(flightDeckTips)
        .values(
          defaultTipsOfTheDay.map((tipText, index) => ({
            tipText,
            isActive: true,
            displayOrder: index,
            createdBy: req.session.user.id,
          }))
        )
        .returning();

      res.status(201).json({ message: `Seeded ${seededTips.length} default tips`, tips: seededTips });
    } catch (error: any) {
      console.error("Error seeding Flight Deck tips:", error);
      res.status(500).json({ message: "Failed to seed tips" });
    }
  });
}
