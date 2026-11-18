// Documents / Links / Code Scripts routes (Phase 8 extraction #23).
//
// 15 handlers covering the three project-attachment surfaces:
//
//   Documents (upload via multer):
//     GET    /api/documents
//     GET    /api/documents/:id
//     POST   /api/documents/legacy
//     PUT    /api/documents/:id
//     DELETE /api/documents/:id
//
//   Links:
//     GET    /api/links
//     GET    /api/links/:id
//     POST   /api/links
//     PUT    /api/links/:id
//     DELETE /api/links/:id
//
//   Code scripts:
//     GET    /api/code-scripts
//     GET    /api/code-scripts/:id
//     POST   /api/code-scripts
//     PUT    /api/code-scripts/:id
//     DELETE /api/code-scripts/:id
//
// Documents share the main `upload` multer instance via DI (same shape
// as compliance / support-requests / customers).
import type { Express } from "express";
import type { Multer } from "multer";
import { z } from "zod";
import { storage } from "../storage";
import { insertLinkSchema, insertCodeScriptSchema } from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { normalizeFilename, buildDocumentPath } from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { requireInternalUser } from "../lib/internal-access";
import {
  getLibraryViewer,
  canViewLibraryItem,
  filterLibraryItems,
  canDeleteDocument,
} from "../lib/library-access";

export function registerDocumentsRoutes(
  app: Express,
  { upload }: { upload: Multer },
) {
  app.get("/api/documents", isAuthenticated, async (req, res) => {
    try {
      const competitorId = typeof req.query.competitorId === "string" ? parseInt(req.query.competitorId) : undefined;
      const documentType = typeof req.query.documentType === "string" ? req.query.documentType : undefined;
      const filter: { competitorId?: number; documentType?: string } = {};
      if (competitorId !== undefined && !Number.isNaN(competitorId)) filter.competitorId = competitorId;
      if (documentType) filter.documentType = documentType;
      const documents = Object.keys(filter).length > 0
        ? await storage.getDocumentsByFilter(filter)
        : await storage.getDocuments();
      const viewer = await getLibraryViewer(req);
      res.json(filterLibraryItems(viewer, documents));
    } catch (error: any) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const document = await storage.getDocument(parseInt(req.params.id as string));
      if (!document || !canViewLibraryItem(await getLibraryViewer(req), document)) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(document);
    } catch (error: any) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Duplicate route kept for compatibility — handled by the primary route above (Express matches first)
  // Updated to use quarantine pipeline for consistency
  app.post("/api/documents/legacy", isAuthenticated, requireInternalUser, upload.single('file'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const safeFilename = normalizeFilename(req.file.originalname);
      const gcsObjectKey = buildDocumentPath(null, safeFilename, req.session.user.id);
      const result = await processUpload(req.file, gcsObjectKey, 'document');
      if (!result.ok) {
        return res.status(result.status).json({ message: result.reason });
      }
      const { file: pf } = result;

      const documentData = {
        givenName: req.body.givenName,
        fileName: pf.safeFilename,
        originalFileName: pf.originalName,
        storedPath: pf.url,
        gcsPath: pf.gcsPath,
        fileHash: pf.fileHash,
        fileSize: pf.fileSize,
        fileType: pf.mimeType,
        description: req.body.description || '',
        documentType: req.body.documentType,
        solutionIds: req.body.solutionIds ? JSON.parse(req.body.solutionIds) : [],
        owner: req.body.owner,
        ownerId: req.body.ownerId,
        scanStatus: pf.scanStatus,
        sensitivityLabel: req.body.sensitivityLabel || 'internal',
        createdBy: req.session.user.id,
      };

      const document = await storage.createDocument(documentData as any);
      res.status(201).json(document);
    } catch (error: any) {
      console.error("Error creating document (legacy route):", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.put("/api/documents/:id", isAuthenticated, requireInternalUser, upload.single('file'), async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);

      const updates: Record<string, any> = {};
      if (req.body.givenName !== undefined) updates.givenName = req.body.givenName;
      if (req.body.description !== undefined) updates.description = req.body.description;
      if (req.body.documentType !== undefined) updates.documentType = req.body.documentType;
      if (req.body.solutionIds !== undefined) {
        try { updates.solutionIds = JSON.parse(req.body.solutionIds); } catch {}
      }
      if (req.body.accountIds !== undefined) {
        try { updates.accountIds = JSON.parse(req.body.accountIds); } catch {}
      }
      if (req.body.isActive !== undefined) {
        updates.isActive = req.body.isActive === 'true' || req.body.isActive === true;
      }
      if (req.body.competitorId !== undefined) {
        const competitorId = req.body.competitorId === null || req.body.competitorId === '' || req.body.competitorId === 'null'
          ? null
          : Number(req.body.competitorId);
        if (competitorId !== null && !Number.isInteger(competitorId)) {
          return res.status(400).json({ message: "Invalid competitorId" });
        }
        updates.competitorId = competitorId;
      }

      if (req.file) {
        const safeFilename = normalizeFilename(req.file.originalname);
        const currentDoc = await storage.getDocument(id);
        const primaryAccountId = currentDoc?.accountIds?.[0] ?? null;
        const gcsObjectKey = buildDocumentPath(primaryAccountId, safeFilename, req.session.user.id);
        const result = await processUpload(req.file, gcsObjectKey, 'document');
        if (!result.ok) {
          return res.status(result.status).json({ message: result.reason });
        }
        const { file: pf } = result;
        updates.fileName = pf.safeFilename;
        updates.originalName = pf.originalName;
        updates.fileSize = pf.fileSize;
        updates.mimeType = pf.mimeType;
        updates.gcsPath = pf.gcsPath;
        updates.storedPath = pf.gcsPath;
        updates.fileHash = pf.fileHash;
        updates.scanStatus = pf.scanStatus;
        updates.scannedAt = new Date();
      }

      const document = await storage.updateDocument(id, updates);
      res.json(document);
    } catch (error: any) {
      console.error("Error updating document:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const document = await storage.getDocument(id);
      const viewer = await getLibraryViewer(req);
      if (!document || !canViewLibraryItem(viewer, document)) {
        return res.status(404).json({ message: "Document not found" });
      }
      if (!canDeleteDocument(viewer, document)) {
        return res.status(403).json({ message: "You can only delete documents you uploaded" });
      }
      await storage.deleteDocument(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Links API routes
  app.get("/api/links", isAuthenticated, async (req, res) => {
    try {
      const competitorId = req.query.competitorId ? parseInt(req.query.competitorId as string) : undefined;
      const linkType = req.query.linkType as string | undefined;
      const filter: { competitorId?: number; linkType?: string } = {};
      if (competitorId !== undefined) filter.competitorId = competitorId;
      if (linkType) filter.linkType = linkType;
      const links = await storage.getLinks(Object.keys(filter).length > 0 ? filter : undefined);
      res.json(filterLibraryItems(await getLibraryViewer(req), links));
    } catch (error: any) {
      console.error("Error fetching links:", error);
      res.status(500).json({ message: "Failed to fetch links" });
    }
  });

  app.get("/api/links/:id", isAuthenticated, async (req, res) => {
    try {
      const link = await storage.getLink(parseInt(req.params.id as string));
      if (!link || !canViewLibraryItem(await getLibraryViewer(req), link)) {
        return res.status(404).json({ message: "Link not found" });
      }
      res.json(link);
    } catch (error: any) {
      console.error("Error fetching link:", error);
      res.status(500).json({ message: "Failed to fetch link" });
    }
  });

  app.post("/api/links", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      // Validate URL format before processing
      if (req.body.url) {
        try {
          new URL(req.body.url);
        } catch (urlError) {
          return res.status(400).json({
            message: "Invalid URL format",
            errors: [{ path: ["url"], message: "Please provide a valid URL" }]
          });
        }
      }

      const validatedData = insertLinkSchema.parse(req.body);
      const link = await storage.createLink(validatedData);
      res.status(201).json(link);
    } catch (error: any) {
      console.error("Error creating link:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create link" });
    }
  });

  app.put("/api/links/:id", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      // Validate URL format if provided
      if (req.body.url) {
        try {
          new URL(req.body.url);
        } catch (urlError) {
          return res.status(400).json({
            message: "Invalid URL format",
            errors: [{ path: ["url"], message: "Please provide a valid URL" }]
          });
        }
      }

      const id = parseInt(req.params.id as string);
      const validatedData = insertLinkSchema.partial().parse(req.body);
      const link = await storage.updateLink(id, validatedData);
      res.json(link);
    } catch (error: any) {
      console.error("Error updating link:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update link" });
    }
  });

  app.delete("/api/links/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const userId = req.session.user.id;

      // Get the link details before deletion
      const link = await storage.getLink(id);
      if (!link) {
        return res.status(404).json({ message: "Link not found" });
      }

      // Find all projects that might be using this link
      const projects = await storage.getProjects(userId, {});
      const projectsToUpdate = [];

      for (const project of projects) {
        let needsUpdate = false;
        let updatedProjectLinks = project.projectLinks || [];

        // Remove direct link references
        if (project.projectLinks && Array.isArray(project.projectLinks)) {
          const originalLength = (updatedProjectLinks as any[]).length;
          updatedProjectLinks = (updatedProjectLinks as any[]).filter((pLink: any) => pLink.linkId !== id);
          if ((updatedProjectLinks as any[]).length !== originalLength) {
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          projectsToUpdate.push({
            id: project.id,
            projectLinks: updatedProjectLinks
          });
        }
      }

      // Update projects to remove the deleted link
      for (const projectUpdate of projectsToUpdate) {
        await storage.updatePoc(projectUpdate.id, {
          projectLinks: projectUpdate.projectLinks
        });

        // Log activity
        await storage.createActivityLog({
          projectId: projectUpdate.id,
          userId,
          action: "updated",
          details: `Removed deleted link: ${link.name}`,
          targetType: "project",
          targetId: projectUpdate.id,
        });
      }

      // Delete the link
      await storage.deleteLink(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting link:", error);
      res.status(500).json({ message: "Failed to delete link" });
    }
  });

  // Code Scripts API routes
  app.get("/api/code-scripts", isAuthenticated, async (req, res) => {
    try {
      const codeScripts = await storage.getCodeScripts();
      res.json(filterLibraryItems(await getLibraryViewer(req), codeScripts));
    } catch (error: any) {
      console.error("Error fetching code scripts:", error);
      res.status(500).json({ message: "Failed to fetch code scripts" });
    }
  });

  app.get("/api/code-scripts/:id", isAuthenticated, async (req, res) => {
    try {
      const codeScript = await storage.getCodeScript(parseInt(req.params.id as string));
      if (!codeScript || !canViewLibraryItem(await getLibraryViewer(req), codeScript)) {
        return res.status(404).json({ message: "Code script not found" });
      }
      res.json(codeScript);
    } catch (error: any) {
      console.error("Error fetching code script:", error);
      res.status(500).json({ message: "Failed to fetch code script" });
    }
  });

  app.post("/api/code-scripts", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const validatedData = insertCodeScriptSchema.parse(req.body);
      const codeScript = await storage.createCodeScript(validatedData);
      res.status(201).json(codeScript);
    } catch (error: any) {
      console.error("Error creating code script:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to create code script" });
    }
  });

  app.put("/api/code-scripts/:id", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const validatedData = insertCodeScriptSchema.partial().parse(req.body);
      const codeScript = await storage.updateCodeScript(id, validatedData);
      res.json(codeScript);
    } catch (error: any) {
      console.error("Error updating code script:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.issues });
      }
      res.status(500).json({ message: "Failed to update code script" });
    }
  });

  app.delete("/api/code-scripts/:id", isAuthenticated, requireInternalUser, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id as string);
      
      // Get the code script details before deletion
      const codeScript = await storage.getCodeScript(id);
      if (!codeScript) {
        return res.status(404).json({ message: "Code script not found" });
      }

      // Delete the code script
      await storage.deleteCodeScript(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting code script:", error);
      res.status(500).json({ message: "Failed to delete code script" });
    }
  });
}
