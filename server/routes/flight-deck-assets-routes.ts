// Flight Deck banner upload routes — admin-only POST that routes the
// uploaded header/footer banner through the canonical processUpload
// pipeline. Lands at `system/flight-deck/<filename>` in the active
// storage provider (cloud / files-db / local disk) and returns the
// resolved `/api/files/...` URL that the rule form writes back into its
// `headerImageUrl` / `footerImageUrl` text field.
//
//   POST /api/admin/flight-deck/upload   — 2 MB; PNG/JPEG/WEBP/SVG
//
// SVG passes through the SVG sanitizer inside processUpload — scripts,
// event handlers, javascript: URIs, foreignObject, and external <use>
// refs are stripped before storage. Same threat model as customer logos.

import type { Express } from "express";
import multer from "multer";
import crypto from "crypto";
import { isAuthenticated } from "../auth/simpleAuth";
import {
  QUARANTINE_DIR,
  ensureQuarantineDir,
  normalizeFilename,
  buildFlightDeckPath,
  FLIGHT_DECK_MAX_BYTES,
} from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";

const flightDeckUpload = multer({
  storage: multer.diskStorage({
    destination: function (_req, _file, cb) {
      ensureQuarantineDir();
      cb(null, QUARANTINE_DIR);
    },
    filename: function (_req, file, cb) {
      const uniqueId = crypto.randomUUID();
      const mimetypeToExt: Record<string, string> = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
      };
      const ext = mimetypeToExt[file.mimetype] || ".png";
      cb(null, `fd_${uniqueId}${ext}`);
    },
  }),
  limits: { fileSize: FLIGHT_DECK_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        "Invalid file type. Flight Deck banners must be PNG, JPEG, WEBP, or SVG.",
      );
      (err as any).code = "UNSUPPORTED_FILE_TYPE";
      cb(err);
    }
  },
});

export function registerFlightDeckAssetsRoutes(app: Express) {
  app.post(
    "/api/admin/flight-deck/upload",
    isAuthenticated,
    flightDeckUpload.single("asset"),
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can upload Flight Deck banners" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const safeName = normalizeFilename(req.file.originalname);
        const objectKey = buildFlightDeckPath(safeName);
        const result = await processUpload(req.file, objectKey, "flight-deck");

        if (!result.ok) {
          return res.status(result.status).json({ message: result.reason });
        }

        res.json({
          name: safeName,
          url: result.file.url,
          gcsPath: result.file.gcsPath,
          size: result.file.fileSize,
          type: result.file.mimeType,
          uploadedAt: new Date().toISOString(),
        });
      } catch (error: any) {
        console.error("Flight Deck banner upload error:", error);
        res.status(500).json({ message: "Failed to upload Flight Deck banner" });
      }
    },
  );
}
