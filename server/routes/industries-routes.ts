// Industries CRUD + per-industry compliance lookup.
//
// Extracted from server/routes.ts (Phase 8 extraction #1 — see
// docs/archive/routes-split-plan.md). Keeps the established
// register-routes pattern: a single `registerIndustriesRoutes(app)`
// export that the main routes.ts wires up alongside dashboard-routes,
// docs-routes, system-routes, etc.
//
// Endpoints owned by this module:
//   GET    /api/industries
//   POST   /api/industries                                (Industries edit)
//   PUT    /api/industries/:id                            (Industries edit)
//   DELETE /api/industries/:id                            (Industries edit)
//   POST   /api/industries/reset-defaults                 (auth, Admin only)
//   GET    /api/industries/:id/compliance-regulations
//
// Note: the standalone GET /api/compliance-regulations endpoint stays
// in routes.ts for now — it belongs in a future compliance-routes.ts
// extraction (see plan).
import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionEdit } from "../lib/section-permissions";

// Industry writes need edit permission on Admin › Projects & Rules ›
// Industries (Admin always passes). They used to accept any signed-in user,
// Customers and Guests included.
const INDUSTRIES_EDIT = requireSectionEdit("config.industries");

export function registerIndustriesRoutes(app: Express) {
  // GET /api/industries — public list endpoint
  app.get('/api/industries', async (req, res) => {
    try {
      const industries = await storage.getIndustries();
      res.json(industries);
    } catch (error: any) {
      console.error('Error fetching industries:', error);
      res.status(500).json({ message: 'Failed to fetch industries' });
    }
  });

  // POST /api/industries — create new industry (auth required)
  app.post('/api/industries', isAuthenticated, INDUSTRIES_EDIT, async (req, res) => {
    try {
      // Extract and validate the industry data
      const { name, description, icon, complianceRegulations, allRegulationsApply } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Industry name is required' });
      }

      // Strict boolean validation
      let parsedAllRegulationsApply = false;
      if (typeof allRegulationsApply === 'boolean') {
        parsedAllRegulationsApply = allRegulationsApply;
      } else if (typeof allRegulationsApply === 'string') {
        if (allRegulationsApply === 'true') parsedAllRegulationsApply = true;
        else if (allRegulationsApply === 'false') parsedAllRegulationsApply = false;
        else return res.status(400).json({ message: 'allRegulationsApply must be a boolean or "true"/"false" string' });
      } else if (allRegulationsApply != null) {
        return res.status(400).json({ message: 'allRegulationsApply must be a boolean' });
      }

      // Validate and coerce compliance regulations
      let parsedComplianceRegulations: number[] = [];
      if (Array.isArray(complianceRegulations)) {
        const uniqueIds = new Set<number>();
        for (const id of complianceRegulations) {
          const numberId = Number(id);
          if (!Number.isFinite(numberId)) {
            return res.status(400).json({ message: 'All compliance regulation IDs must be valid numbers' });
          }
          uniqueIds.add(numberId);
        }
        parsedComplianceRegulations = Array.from(uniqueIds);
      } else if (complianceRegulations != null) {
        return res.status(400).json({ message: 'complianceRegulations must be an array' });
      }

      const industryData = {
        name: name.trim(),
        description: description || null,
        icon: icon || 'Building2',
        complianceRegulations: parsedComplianceRegulations,
        allRegulationsApply: parsedAllRegulationsApply
      };

      const industry = await storage.createIndustry(industryData);
      res.json(industry);
    } catch (error: any) {
      console.error('Error creating industry:', error);
      res.status(500).json({ message: 'Failed to create industry' });
    }
  });

  // PUT /api/industries/:id — update industry (auth required)
  app.put('/api/industries/:id', isAuthenticated, INDUSTRIES_EDIT, async (req, res) => {
    try {
      const industryId = parseInt(req.params.id as string);
      if (isNaN(industryId)) {
        return res.status(400).json({ message: 'Invalid industry ID' });
      }

      const { name, description, icon, complianceRegulations, allRegulationsApply } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ message: 'Industry name is required' });
      }

      // Strict boolean validation
      let parsedAllRegulationsApply = false;
      if (typeof allRegulationsApply === 'boolean') {
        parsedAllRegulationsApply = allRegulationsApply;
      } else if (typeof allRegulationsApply === 'string') {
        if (allRegulationsApply === 'true') parsedAllRegulationsApply = true;
        else if (allRegulationsApply === 'false') parsedAllRegulationsApply = false;
        else return res.status(400).json({ message: 'allRegulationsApply must be a boolean or "true"/"false" string' });
      } else if (allRegulationsApply != null) {
        return res.status(400).json({ message: 'allRegulationsApply must be a boolean' });
      }

      // Validate and coerce compliance regulations
      let parsedComplianceRegulations: number[] = [];
      if (Array.isArray(complianceRegulations)) {
        const uniqueIds = new Set<number>();
        for (const id of complianceRegulations) {
          const numberId = Number(id);
          if (!Number.isFinite(numberId)) {
            return res.status(400).json({ message: 'All compliance regulation IDs must be valid numbers' });
          }
          uniqueIds.add(numberId);
        }
        parsedComplianceRegulations = Array.from(uniqueIds);
      } else if (complianceRegulations != null) {
        return res.status(400).json({ message: 'complianceRegulations must be an array' });
      }

      const updates = {
        name: name.trim(),
        description: description || null,
        icon: icon || 'Building2',
        complianceRegulations: parsedComplianceRegulations,
        allRegulationsApply: parsedAllRegulationsApply
      };

      const industry = await storage.updateIndustry(industryId, updates);
      res.json(industry);
    } catch (error: any) {
      console.error('Error updating industry:', error);
      res.status(500).json({ message: 'Failed to update industry' });
    }
  });

  // DELETE /api/industries/:id — delete industry (auth required)
  app.delete('/api/industries/:id', isAuthenticated, INDUSTRIES_EDIT, async (req, res) => {
    try {
      await storage.deleteIndustry(parseInt(req.params.id as string));
      res.json({ message: 'Industry deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting industry:', error);

      // Check if this is a foreign key constraint error
      if (error.code === '23503') {
        return res.status(400).json({
          message: "Cannot delete industry: This industry is still being used in templates or projects. Please remove all references before deleting."
        });
      }

      res.status(500).json({ message: 'Failed to delete industry due to an unexpected error' });
    }
  });

  // POST /api/industries/reset-defaults — restore industry defaults (Admin only)
  app.post('/api/industries/reset-defaults', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user?.id;
      const user = userId ? await storage.getUser(userId) : null;
      if (!user || user.role !== "Admin") {
        return res.status(403).json({ message: "Only administrators can reset industries to defaults" });
      }
      const { resetIndustryDefaults } = await import("../lib/field-settings-defaults");
      const summary = await resetIndustryDefaults({
        userId: user.id,
        userEmail: user.email ?? null,
        userName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
      });
      res.json({ message: "Industry defaults restored", summary });
    } catch (error: any) {
      console.error("Error resetting industry defaults:", error);
      res.status(500).json({ message: "Failed to reset industry defaults" });
    }
  });

  // GET /api/industries/:id/compliance-regulations — per-industry compliance lookup (public)
  app.get('/api/industries/:id/compliance-regulations', async (req, res) => {
    try {
      const industryId = parseInt(req.params.id as string);
      if (isNaN(industryId)) {
        return res.status(400).json({ message: 'Invalid industry ID' });
      }

      const regulations = await storage.getIndustryComplianceRegulations(industryId);

      // Return the regulation IDs and allRegulationsApply flag
      res.json({
        regulationIds: regulations.regulationIds || [],
        allRegulationsApply: regulations.allRegulationsApply || false
      });
    } catch (error: any) {
      console.error('Error fetching industry compliance regulations:', error);
      res.status(500).json({ message: 'Failed to fetch industry compliance regulations' });
    }
  });
}
