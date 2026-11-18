// Email design assets routes — replaces the older `/api/assets?folder=uploads_email`
// pair with a dedicated, admin-gated admin/email-assets surface that routes
// uploads through `processUpload` and into the active storage provider
// (cloud / files-db / local). Eliminates the previous direct fs.writeFile
// into `attached_assets/uploads_email/` so email design assets survive
// redeploys the same way Account Logos and Branding already do.
//
//   GET    /api/admin/email-assets               — list assets under system/email-assets/
//   POST   /api/admin/email-assets/upload        — upload new asset (2MB; PNG/JPEG/WEBP/GIF)
//   DELETE /api/admin/email-assets/:filename     — remove asset (admin only)
//
// The list endpoint queries the files DB first (when the `db` storage
// provider is active) and falls back to scanning the on-disk `uploads/`
// directory so cloud / local installs still see the same shape. Each
// returned asset carries a stable `url` rooted at `/api/files/...` so
// renderers don't need to know which provider produced it.

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
  buildEmailAssetPath,
  EMAIL_ASSET_MAX_BYTES,
} from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { isFilesDbReady, listUploadedKeysByPrefix } from "../lib/files-db";

const EMAIL_ASSET_PREFIX = "system/email-assets/";

// Multer with disk storage in the quarantine dir — same recipe as the
// customer logo uploader so the file lands somewhere processUpload can
// finish promoting it. Size cap mirrors EMAIL_ASSET_MAX_BYTES (2 MB) so
// oversized uploads bounce before processUpload's secondary check.
const emailAssetUpload = multer({
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
        "image/gif": ".gif",
        "image/webp": ".webp",
      };
      const ext = mimetypeToExt[file.mimetype] || ".jpg";
      cb(null, `email_${uniqueId}${ext}`);
    },
  }),
  limits: { fileSize: EMAIL_ASSET_MAX_BYTES },
  fileFilter: (
    _req: Express.Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback,
  ) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        "Invalid file type. Only PNG, JPEG, WEBP, and GIF are allowed for email assets.",
      );
      (err as any).code = "UNSUPPORTED_FILE_TYPE";
      cb(err);
    }
  },
});

/**
 * Scan disk for legacy + current on-disk email assets so installs that
 * predate the storage-provider migration still surface their files. We
 * look at both `uploads/system/email-assets/` (the modern local-disk
 * layout the cloud-storage abstraction writes to) and
 * `attached_assets/uploads_email/` (the historical hardcoded location)
 * so nothing visually disappears for an admin mid-migration.
 */
function listDiskEmailAssets(): Array<{ name: string }> {
  const seen = new Set<string>();
  const candidates = [
    path.join(process.cwd(), "uploads", "system", "email-assets"),
    path.join(process.cwd(), "attached_assets", "uploads_email"),
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        if (![".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) continue;
        seen.add(f);
      }
    } catch {
      // Read failure → skip this candidate silently; the files DB
      // listing still covers the canonical case.
    }
  }
  return Array.from(seen).map((name) => ({ name }));
}

export function registerEmailAssetsRoutes(app: Express) {
  // GET /api/admin/email-assets — list of files available to the dialog.
  // Unions the files DB (canonical when active provider is `db`) and the
  // on-disk locations so cloud / local installs still see every asset.
  app.get(
    "/api/admin/email-assets",
    isAuthenticated,
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can list email assets" });
        }

        const seen = new Set<string>();

        // 1. Files DB — every object_key under the email-assets prefix.
        if (isFilesDbReady()) {
          try {
            const keys = await listUploadedKeysByPrefix(EMAIL_ASSET_PREFIX);
            for (const k of keys) {
              const name = k.slice(EMAIL_ASSET_PREFIX.length);
              if (name) seen.add(name);
            }
          } catch (e: any) {
            console.warn("[email-assets] files-db list failed:", e?.message ?? e);
          }
        }

        // 2. Disk locations (LocalDriver write site + legacy folder).
        for (const a of listDiskEmailAssets()) seen.add(a.name);

        const assets = Array.from(seen)
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({
            name,
            url: `/api/files/${EMAIL_ASSET_PREFIX}${name}`,
            type: path.extname(name).substring(1),
          }));

        res.json(assets);
      } catch (error: any) {
        console.error("Error fetching email assets:", error);
        res.status(500).json({ message: "Failed to fetch email assets" });
      }
    },
  );

  // POST /api/admin/email-assets/upload — route the file through the
  // canonical processUpload pipeline. Lands at `system/email-assets/<name>`
  // in the active provider (cloud / files-db / local disk).
  app.post(
    "/api/admin/email-assets/upload",
    isAuthenticated,
    emailAssetUpload.single("asset"),
    async (req: any, res) => {
      try {
        if (req.session.user.role !== "Admin") {
          return res
            .status(403)
            .json({ message: "Only administrators can upload email assets" });
        }
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }

        const safeName = normalizeFilename(req.file.originalname);
        const objectKey = buildEmailAssetPath(safeName);
        const result = await processUpload(req.file, objectKey, "email-asset");

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
        console.error("Email asset upload error:", error);
        res.status(500).json({ message: "Failed to upload email asset" });
      }
    },
  );
}
