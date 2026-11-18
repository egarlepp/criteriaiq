// Solution icons admin routes — admin-only upload/delete for the icons
// that populate the Solution Icon dropdown in Validation Criteria →
// Solutions and the icons rendered on project cards.
//
//   POST /api/admin/solution-icons/upload  — 1 MB; PNG/WEBP only
//   DELETE /api/admin/solution-icons/:filename
//
// Listing reuses the existing GET /api/solution-icons route (which now
// reads from system/solution-icons/ via the active storage provider plus
// the legacy disk fallback) so the dropdown surface and the admin
// management card stay consistent.

import type { Express } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { isAuthenticated } from "../auth/simpleAuth";
import {
  QUARANTINE_DIR,
  ensureQuarantineDir,
  normalizeFilename,
  buildSolutionIconPath,
  SOLUTION_ICON_MAX_BYTES,
} from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { deleteUploadedFile, isFilesDbReady } from "../lib/files-db";
import { db } from "../db";
import { eq, sql } from "drizzle-orm";
import { solutionIconMetadata } from "@shared/schema";

const solutionIconUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureQuarantineDir();
      cb(null, QUARANTINE_DIR);
    },
    filename: function (_req, file, cb) {
      const uniqueId = crypto.randomUUID();
      const mimetypeToExt: Record<string, string> = {
        "image/png": ".png",
        "image/webp": ".webp",
      };
      const ext = mimetypeToExt[file.mimetype] || ".png";
      cb(null, `sicon_${uniqueId}${ext}`);
    },
  }),
  limits: { fileSize: SOLUTION_ICON_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const allowed = ["image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        "Invalid file type. Solution icons must be PNG or WEBP.",
      );
      (err as any).code = "UNSUPPORTED_FILE_TYPE";
      cb(err);
    }
  },
});

export function registerSolutionIconsRoutes(app: Express) {
  app.post(
    "/api/admin/solution-icons/upload",
    isAuthenticated,
    solutionIconUpload.single("asset"),
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can upload solution icons" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const safeName = normalizeFilename(req.file.originalname);
        const objectKey = buildSolutionIconPath(safeName);
        const result = await processUpload(req.file, objectKey, "solution-icon");

        if (!result.ok) {
          return res.status(result.status).json({ message: result.reason });
        }

        res.json({
          filename: safeName,
          url: result.file.url,
          gcsPath: result.file.gcsPath,
          size: result.file.fileSize,
        });
      } catch (error: any) {
        console.error("Solution icon upload error:", error);
        res.status(500).json({ message: "Failed to upload solution icon" });
      }
    },
  );

  // PATCH — set/clear the admin-editable display name surfaced in the
  // Validation Criteria → Solutions dropdown. Body: { displayName: string|null }.
  // Empty / null clears the metadata row (the listing endpoint then falls
  // back to the filename-derived display name).
  app.patch(
    "/api/admin/solution-icons/:filename",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can edit solution icons" });
        }
        const filename = path.basename(req.params.filename);
        if (!filename || filename.includes("..")) {
          return res.status(400).json({ message: "Invalid filename" });
        }
        const raw = (req.body?.displayName ?? "") as string;
        const displayName = typeof raw === "string" ? raw.trim().slice(0, 255) : "";

        if (!displayName) {
          await db.delete(solutionIconMetadata).where(eq(solutionIconMetadata.filename, filename));
          return res.json({ ok: true, filename, displayName: null });
        }

        // Upsert on the unique `filename` column.
        await db
          .insert(solutionIconMetadata)
          .values({ filename, displayName })
          .onConflictDoUpdate({
            target: solutionIconMetadata.filename,
            set: { displayName, updatedAt: sql`NOW()` },
          });
        res.json({ ok: true, filename, displayName });
      } catch (error: any) {
        console.error("Solution icon metadata save error:", error);
        res.status(500).json({ message: "Failed to save solution icon name" });
      }
    },
  );

  // DELETE — clears the icon from the files DB (if present), every disk
  // candidate, AND its display-name metadata row. Returns 404 only when
  // nothing was found in either layer.
  app.delete(
    "/api/admin/solution-icons/:filename",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can delete solution icons" });
        }
        const filename = path.basename(req.params.filename);
        if (!filename || filename.includes("..")) {
          return res.status(400).json({ message: "Invalid filename" });
        }

        let removed = false;

        // 1. Files DB.
        if (isFilesDbReady()) {
          try {
            const deleted = await deleteUploadedFile(buildSolutionIconPath(filename));
            if (deleted) removed = true;
          } catch (e: any) {
            console.warn("[solution-icons] files-db delete failed:", e?.message ?? e);
          }
        }

        // 2. Disk candidates.
        const candidates = [
          path.join(process.cwd(), "uploads", "system", "solution-icons", filename),
          path.join(process.cwd(), "attached_assets", "solution_icons", filename),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c)) {
            try { fs.unlinkSync(c); removed = true; } catch { /* ignore per-file */ }
          }
        }

        // 3. Metadata row (best-effort — never blocks the file delete).
        try {
          await db.delete(solutionIconMetadata).where(eq(solutionIconMetadata.filename, filename));
        } catch (e: any) {
          console.warn("[solution-icons] metadata cleanup failed:", e?.message ?? e);
        }

        if (!removed) {
          return res.status(404).json({ message: "Icon not found" });
        }
        res.json({ ok: true, filename });
      } catch (error: any) {
        console.error("Solution icon delete error:", error);
        res.status(500).json({ message: "Failed to delete solution icon" });
      }
    },
  );
}
