// Compliance Regulations CRUD + CSV import/export.
//
// Extracted from server/routes.ts (Phase 8 extraction #2 — see
// docs/archive/routes-split-plan.md). Pulls 8 handlers covering both
// the public compliance lookup and the admin-only management surface.
//
// Endpoints owned by this module:
//   GET    /api/compliance-regulations            (public, isActive=true filter)
//   GET    /api/compliance                        (auth, full filter set)
//   GET    /api/compliance/download-template      (auth, Admin only)
//   POST   /api/compliance/import                 (auth, Admin only, CSV upload)
//   GET    /api/compliance/:id                    (auth)
//   POST   /api/compliance                        (auth, Admin only)
//   PUT    /api/compliance/:id                    (auth, Admin only)
//   DELETE /api/compliance/:id                    (auth, Admin only)
//
// Multer `upload` is injected from the parent routes.ts because it's
// a project-wide configured instance shared by other handlers (file
// uploads, document uploads, etc.). When a future refactor lifts
// `upload` into its own module (e.g. server/lib/multer-upload.ts),
// this signature can simplify to a plain `app: Express` parameter.
import type { Express } from "express";
import type { Multer } from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/simpleAuth";
import { insertComplianceRegulationSchema } from "@shared/schema";

interface ComplianceRouteOptions {
  upload: Multer;
}

export function registerComplianceRoutes(
  app: Express,
  { upload }: ComplianceRouteOptions,
) {
  // GET /api/compliance-regulations — public list of active regulations
  app.get('/api/compliance-regulations', async (req, res) => {
    try {
      const regulations = await storage.getComplianceRegulations({ isActive: true });
      res.json(regulations);
    } catch (error: any) {
      console.error('Error fetching compliance regulations:', error);
      res.status(500).json({ message: 'Failed to fetch compliance regulations' });
    }
  });

  // GET /api/compliance — full filter set (auth required)
  app.get('/api/compliance', isAuthenticated, async (req, res) => {
    try {
      const { category, region, priority, search, isActive } = req.query;

      const filters = {
        category: category as string,
        region: region as string,
        priority: priority as string,
        search: search as string,
        isActive: isActive === 'false' ? false : true
      };

      const regulations = await storage.getComplianceRegulations(filters);
      res.json(regulations);
    } catch (error: any) {
      console.error("Error fetching compliance regulations:", error);
      res.status(500).json({ message: "Failed to fetch compliance regulations" });
    }
  });

  // GET /api/compliance/download-template — CSV template (Admin only)
  // NOTE: must come before /api/compliance/:id route to avoid collision.
  app.get('/api/compliance/download-template', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const fs = await import('fs');
      const path = await import('path');

      const templatePath = path.join(process.cwd(), 'scripts', 'compliance_regulations_seed.csv');

      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ message: 'Template file not found' });
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="compliance_regulations_template.csv"');

      const fileStream = fs.createReadStream(templatePath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error('Error downloading template:', error);
      res.status(500).json({ message: 'Failed to download template' });
    }
  });

  // POST /api/compliance/import — CSV upsert (Admin only)
  app.post('/api/compliance/import', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fs = await import('fs');
      const csv = await import('csv-parser');

      const results: any[] = [];
      let imported = 0;
      let updated = 0;

      // Read and parse CSV file
      await new Promise((resolve, reject) => {
        fs.createReadStream(req.file.path)
          .pipe(csv.default())
          .on('data', (data) => results.push(data))
          .on('end', resolve)
          .on('error', reject);
      });

      // Process each row
      for (const row of results) {
        if (!row.name || !row.category) {
          continue; // Skip rows without required fields
        }

        const regulationData = {
          name: row.name?.trim(),
          longName: row.longName?.trim() || null,
          category: row.category?.trim(),
          description: row.description?.trim() || null,
          industry: row.industry?.trim() || null,
          objective: row.objective?.trim() || null,
          priority: row.priority?.trim() || 'medium',
          status: row.status?.trim() || 'active',
          applicableRegions: row.applicableRegions?.trim() || null,
          keyRequirements: row.keyRequirements?.trim() || null
        };

        try {
          // Check if regulation with this name already exists
          const existingRegulations = await storage.getComplianceRegulations({});
          const existingRegulation = existingRegulations.find((reg: any) => reg.name === regulationData.name);

          if (existingRegulation) {
            // Update existing regulation
            await storage.updateComplianceRegulation(existingRegulation.id, regulationData);
            updated++;
          } else {
            // Create new regulation
            await storage.createComplianceRegulation(regulationData as any);
            imported++;
          }
        } catch (error: any) {
          console.error(`Error processing regulation ${regulationData.name}:`, error);
        }
      }

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({
        message: 'Import completed successfully',
        imported,
        updated,
        total: imported + updated
      });
    } catch (error: any) {
      // Clean up uploaded file in case of error
      if (req.file?.path) {
        try {
          const fs = await import('fs');
          fs.unlinkSync(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      console.error('Error importing compliance regulations:', error);
      res.status(500).json({ message: 'Failed to import regulations' });
    }
  });

  // GET /api/compliance/:id — single regulation (auth)
  app.get('/api/compliance/:id', isAuthenticated, async (req, res) => {
    try {
      const regulationId = parseInt(req.params.id as string);
      if (isNaN(regulationId)) {
        return res.status(400).json({ message: "Invalid compliance regulation ID" });
      }

      const regulation = await storage.getComplianceRegulationById(regulationId);
      if (!regulation) {
        return res.status(404).json({ message: "Compliance regulation not found" });
      }

      res.json(regulation);
    } catch (error: any) {
      console.error("Error fetching compliance regulation:", error);
      res.status(500).json({ message: "Failed to fetch compliance regulation" });
    }
  });

  // POST /api/compliance — create (Admin only)
  app.post('/api/compliance', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const validatedData = insertComplianceRegulationSchema.parse(req.body);
      const regulation = await storage.createComplianceRegulation(validatedData);
      res.json(regulation);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      console.error("Error creating compliance regulation:", error);
      res.status(500).json({ message: "Failed to create compliance regulation" });
    }
  });

  // PUT /api/compliance/:id — update (Admin only)
  app.put('/api/compliance/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const regulationId = parseInt(req.params.id as string);
      if (isNaN(regulationId)) {
        return res.status(400).json({ message: "Invalid compliance regulation ID" });
      }

      const updateSchema = insertComplianceRegulationSchema.partial();
      const validatedData = updateSchema.parse(req.body);

      const regulation = await storage.updateComplianceRegulation(regulationId, validatedData);
      if (!regulation) {
        return res.status(404).json({ message: "Compliance regulation not found" });
      }

      res.json(regulation);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.issues });
      }
      console.error("Error updating compliance regulation:", error);
      res.status(500).json({ message: "Failed to update compliance regulation" });
    }
  });

  // DELETE /api/compliance/:id — delete (Admin only)
  app.delete('/api/compliance/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userRole = req.session.user.role;

      if (userRole.toLowerCase() !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
      }

      const regulationId = parseInt(req.params.id as string);
      if (isNaN(regulationId)) {
        return res.status(400).json({ message: "Invalid compliance regulation ID" });
      }

      await storage.deleteComplianceRegulation(regulationId);
      res.json({ message: "Compliance regulation deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting compliance regulation:", error);
      res.status(500).json({ message: "Failed to delete compliance regulation" });
    }
  });
}
