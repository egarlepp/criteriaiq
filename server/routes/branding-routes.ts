// Branding routes — admin-managed Admin → Appearance → Media.
//
// Surfaces a small REST surface over the `branding_assets` table plus a
// tagline override in `system_settings`. Reuses the canonical PR #152
// upload pipeline verbatim (multer disk quarantine → magic bytes →
// SVG sanitize → virus scan → cloud-storage promote) so a self-hosted
// install on local disk, S3, GCS, or Azure all behave identically.
//
// Endpoints:
//   GET    /api/branding/public                       — unauthenticated; returns only login-screen slots (login_logo, login_bg) + tagline
//   GET    /api/branding/display                      — signed in; company_logo + page_bg (slot, mode, url, opacity) for every role
//   GET    /api/branding/assets                       — Admin; full list with re-signed URLs
//   POST   /api/branding/assets/:slot/:mode           — Admin; multipart upload (file=file)
//   PATCH  /api/branding/assets/:slot/:mode/opacity   — Admin; opacity slider (background slots only)
//   DELETE /api/branding/assets/:slot/:mode           — Admin; revert to bundled default
//   GET    /api/branding/logo-variants                — Admin; which CriteriaIQ logo version light/dark mode shows
//   PUT    /api/branding/logo-variants                — Admin; { light, dark } each "dark_text" | "light_text"
//   GET    /api/branding/tagline                      — Admin; current text override (or null)
//   PUT    /api/branding/tagline                      — Admin; { text: string | null }
//
// The public endpoint exists because the login screen renders before the
// session cookie is issued — it has to fetch the customizable login
// wordmark/background/tagline without auth. Sidebar + page-bg slots
// are auth-gated since only authenticated routes ever render them.

import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import crypto from "crypto";

import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import {
  QUARANTINE_DIR,
  ensureQuarantineDir,
  normalizeFilename,
  buildBrandingPath,
  BRANDING_ALLOWED_MIMES,
  BRANDING_LOGO_MAX_BYTES,
  BRANDING_BG_MAX_BYTES,
} from "../lib/upload-config";
import { processUpload } from "../lib/upload-processor";
import { generateSignedUrl, deleteFile } from "../lib/cloud-storage";
import {
  BRANDING_ASSET_SLOTS,
  BRANDING_BACKGROUND_SLOTS,
  BRANDING_ASSET_MODES,
  brandingTaglineSchema,
  brandingLogoVariantsSchema,
  brandingSidebarLogoUrlSchema,
  brandingSupportEmailSchema,
  updateBrandingAssetOpacitySchema,
  type BrandingAssetSlot,
  type BrandingAssetMode,
  type BrandingAsset,
} from "@shared/schema";

// ─── helpers ─────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as Request & { session?: { user?: { role?: string } } })
    .session;
  const user = session?.user;
  if (!user) {
    return res
      .status(401)
      .json({ error: "Authentication required", errorCode: "unauthenticated" });
  }
  if (user.role !== "Admin") {
    return res
      .status(403)
      .json({ error: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

function isBackgroundSlot(slot: string): slot is (typeof BRANDING_BACKGROUND_SLOTS)[number] {
  return (BRANDING_BACKGROUND_SLOTS as readonly string[]).includes(slot);
}

function defaultOpacityFor(slot: BrandingAssetSlot, mode: BrandingAssetMode): number | null {
  // Defaults match today's CSS so the first upload feels like the
  // existing baseline; admins can change with the slider afterward.
  if (slot === "page_bg") return 10;
  if (slot === "login_bg") return 100;
  return null; // logo slots ignore opacity
}

// Express 5 types path params as `string | string[]` (the second case only
// arises when a route declares the same param twice). We treat anything
// non-string as a 400 and never let it reach the storage layer.
function validateSlotMode(
  slot: string | string[] | undefined,
  mode: string | string[] | undefined,
): { ok: true; slot: BrandingAssetSlot; mode: BrandingAssetMode } | { ok: false; reason: string } {
  if (typeof slot !== "string") return { ok: false, reason: "Invalid slot" };
  if (typeof mode !== "string") return { ok: false, reason: "Invalid mode" };
  if (!(BRANDING_ASSET_SLOTS as readonly string[]).includes(slot)) {
    return { ok: false, reason: `Unknown slot "${slot}"` };
  }
  if (!(BRANDING_ASSET_MODES as readonly string[]).includes(mode)) {
    return { ok: false, reason: `Unknown mode "${mode}"` };
  }
  return {
    ok: true,
    slot: slot as BrandingAssetSlot,
    mode: mode as BrandingAssetMode,
  };
}

/** Re-sign cloud URLs that may have expired. Local-disk URLs pass through. */
async function refreshAssetUrl(asset: BrandingAsset): Promise<BrandingAsset> {
  // Local /api/files/ URLs never expire — leave them be.
  if (asset.url.startsWith("/api/files/")) return asset;
  try {
    const fresh = await generateSignedUrl(asset.storageKey, 60);
    return { ...asset, url: fresh };
  } catch {
    return asset;
  }
}

// ─── multer (configured at MAX background size; per-slot size enforced in handler) ──

const brandingUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureQuarantineDir();
      cb(null, QUARANTINE_DIR);
    },
    filename: (_req, file, cb) => {
      const uniqueId = crypto.randomUUID();
      const extByMime: Record<string, string> = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
      };
      const ext = extByMime[file.mimetype] ?? ".bin";
      cb(null, `branding_${uniqueId}${ext}`);
    },
  }),
  limits: { fileSize: BRANDING_BG_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (BRANDING_ALLOWED_MIMES.has(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(
        "Branding assets must be PNG, JPEG, WebP, or SVG.",
      );
      (err as any).code = "UNSUPPORTED_FILE_TYPE";
      cb(err);
    }
  },
});

// ─── registration ────────────────────────────────────────────────────────────

export function registerBrandingRoutes(app: Express) {
  // ── PUBLIC ── login-screen pre-auth read ───────────────────────────────────
  app.get("/api/branding/public", async (_req, res) => {
    try {
      const allRaw = await storage.getAllBrandingAssets();
      const PUBLIC_SLOTS: BrandingAssetSlot[] = ["login_logo", "login_bg"];
      const filtered = allRaw.filter((a) =>
        PUBLIC_SLOTS.includes(a.slot as BrandingAssetSlot),
      );
      const refreshed = await Promise.all(filtered.map(refreshAssetUrl));
      const tagline = await storage.getBrandingTagline();
      // Support email is public on purpose: the error page shows it to
      // signed-out users too.
      const supportEmail = await storage.getBrandingSupportEmail();
      res.json({ assets: refreshed, tagline, supportEmail });
    } catch (err: any) {
      console.error("[branding] public GET failed:", err?.message);
      res.status(500).json({ error: "Failed to load public branding" });
    }
  });

  // ── SIGNED IN ── in-app imagery for every role ────────────────────────────
  // The header's Company Logo and the page background render for every
  // signed-in user, but /api/branding/assets is Admin-only, so non-admins
  // used to get the bundled defaults. This read returns only what those
  // images need — no storage keys or uploader ids.
  app.get("/api/branding/display", isAuthenticated, async (_req, res) => {
    try {
      const DISPLAY_SLOTS: BrandingAssetSlot[] = ["company_logo", "page_bg"];
      const rows = (await storage.getAllBrandingAssets()).filter((a) =>
        DISPLAY_SLOTS.includes(a.slot as BrandingAssetSlot),
      );
      const refreshed = await Promise.all(rows.map(refreshAssetUrl));
      res.json(refreshed.map((a) => ({ slot: a.slot, mode: a.mode, url: a.url, opacity: a.opacity })));
    } catch (err: any) {
      console.error("[branding] display GET failed:", err?.message);
      res.status(500).json({ error: "Failed to load branding" });
    }
  });

  // ── ADMIN ── full list ─────────────────────────────────────────────────────
  app.get("/api/branding/assets", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const raw = await storage.getAllBrandingAssets();
      const refreshed = await Promise.all(raw.map(refreshAssetUrl));
      res.json(refreshed);
    } catch (err: any) {
      console.error("[branding] admin GET failed:", err?.message);
      res.status(500).json({ error: "Failed to load branding assets" });
    }
  });

  // ── ADMIN ── upload ────────────────────────────────────────────────────────
  app.post(
    "/api/branding/assets/:slot/:mode",
    isAuthenticated,
    requireAdmin,
    brandingUpload.single("file"),
    async (req: Request, res: Response) => {
      const v = validateSlotMode(req.params.slot, req.params.mode);
      if (!v.ok) return res.status(400).json({ error: v.reason });
      const { slot, mode } = v;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) return res.status(400).json({ error: "No file provided" });

      // Per-slot size enforcement (multer caps at the larger budget).
      const limit = isBackgroundSlot(slot)
        ? BRANDING_BG_MAX_BYTES
        : BRANDING_LOGO_MAX_BYTES;
      if (file.size > limit) {
        return res.status(400).json({
          error: `File exceeds the ${(limit / 1024 / 1024).toFixed(0)} MB limit for this slot`,
        });
      }

      // Quarantine pipeline: magic bytes → SVG sanitize → virus scan → upload.
      const safeName = normalizeFilename(file.originalname);
      const objectKey = buildBrandingPath(slot, mode, safeName);
      const result = await processUpload(file, objectKey, "image");
      if (!result.ok) {
        return res.status(result.status).json({ error: result.reason });
      }

      // Delete the previous object (if any) AFTER the new one is in place
      // so a failed mid-flight upload never leaves the slot empty.
      const existing = await storage.getBrandingAsset(slot, mode);
      if (existing && existing.storageKey !== result.file.gcsPath) {
        try {
          await deleteFile(existing.storageKey);
        } catch (delErr) {
          console.warn(
            `[branding] failed to clean up prior asset ${existing.storageKey}:`,
            (delErr as Error).message,
          );
        }
      }

      const userId = (req as any).session?.user?.id ?? null;
      const upserted = await storage.upsertBrandingAsset({
        slot,
        mode,
        storageKey: result.file.gcsPath,
        url: result.file.url,
        mime: result.file.mimeType,
        sizeBytes: result.file.fileSize,
        opacity: existing?.opacity ?? defaultOpacityFor(slot, mode),
        uploadedBy: userId,
      });

      // System-level admin actions don't fit the project-scoped
      // `activity_logs` table (project_id is NOT NULL). A dedicated
      // system audit log table is a separate concern — for now, the
      // /api/branding access log line in stdout is the audit trail.
      console.info(
        `[branding] ${slot}/${mode} updated by ${userId ?? "anonymous"} ` +
          `(${upserted.sizeBytes} bytes, ${upserted.mime})`,
      );

      res.status(200).json(upserted);
    },
  );

  // ── ADMIN ── opacity slider ────────────────────────────────────────────────
  app.patch(
    "/api/branding/assets/:slot/:mode/opacity",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const v = validateSlotMode(req.params.slot, req.params.mode);
      if (!v.ok) return res.status(400).json({ error: v.reason });
      const { slot, mode } = v;
      if (!isBackgroundSlot(slot)) {
        return res
          .status(400)
          .json({ error: "Opacity only applies to background slots" });
      }
      const parsed = updateBrandingAssetOpacitySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Opacity must be an integer between 0 and 100" });
      }
      const updated = await storage.updateBrandingAssetOpacity(
        slot,
        mode,
        parsed.data.opacity,
      );
      if (!updated) {
        return res
          .status(404)
          .json({ error: "No asset configured for this slot+mode yet" });
      }
      res.json(updated);
    },
  );

  // ── ADMIN ── delete (revert to bundled default) ────────────────────────────
  app.delete(
    "/api/branding/assets/:slot/:mode",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const v = validateSlotMode(req.params.slot, req.params.mode);
      if (!v.ok) return res.status(400).json({ error: v.reason });
      const { slot, mode } = v;
      const existing = await storage.getBrandingAsset(slot, mode);
      if (!existing) return res.status(204).end();
      const removed = await storage.deleteBrandingAsset(slot, mode);
      if (removed) {
        try {
          await deleteFile(removed.storageKey);
        } catch (delErr) {
          console.warn(
            `[branding] failed to delete object ${removed.storageKey}:`,
            (delErr as Error).message,
          );
        }
      }
      res.status(204).end();
    },
  );

  // ── ADMIN ── CriteriaIQ logo version per mode ──────────────────────────────
  // Everyone reads the resolved value through GET /api/themes/active (a
  // theme can override it); this pair backs the Media tab's setting.
  app.get(
    "/api/branding/logo-variants",
    isAuthenticated,
    requireAdmin,
    async (_req, res) => {
      res.json(await storage.getBrandingLogoVariants());
    },
  );

  app.put(
    "/api/branding/logo-variants",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const parsed = brandingLogoVariantsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "light and dark must each be \"dark_text\" or \"light_text\"" });
      }
      const userId = (req as any).session?.user?.id ?? null;
      await storage.setBrandingLogoVariants(parsed.data, userId);
      console.info(`[branding] logo variants set to ${parsed.data.light}/${parsed.data.dark} by ${userId ?? "unknown"}`);
      res.json(parsed.data);
    },
  );

  // ── ADMIN ── tagline read/write ────────────────────────────────────────────
  app.get(
    "/api/branding/tagline",
    isAuthenticated,
    requireAdmin,
    async (_req, res) => {
      const text = await storage.getBrandingTagline();
      res.json({ text });
    },
  );

  app.put(
    "/api/branding/tagline",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const parsed = brandingTaglineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Tagline must be a string (or null to clear)" });
      }
      const userId = (req as any).session?.user?.id ?? null;
      await storage.setBrandingTagline(parsed.data.text, userId);
      res.json({ text: parsed.data.text });
    },
  );

  // ── Company Logo link URL (stored as the former sidebar logo link) ────────
  // GET is open to any authenticated user — the header renders for every
  // logged-in role and needs to know whether to wrap the logo in an <a>.
  // PUT remains admin-only since it changes a setting that affects every
  // user.
  app.get(
    "/api/branding/sidebar-logo-url",
    isAuthenticated,
    async (_req, res) => {
      const url = await storage.getBrandingSidebarLogoUrl();
      res.json({ url });
    },
  );

  app.put(
    "/api/branding/sidebar-logo-url",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const parsed = brandingSidebarLogoUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "URL must be a valid http(s) URL (or null to clear).",
        });
      }
      const userId = (req as any).session?.user?.id ?? null;
      await storage.setBrandingSidebarLogoUrl(parsed.data.url, userId);
      res.json({ url: parsed.data.url });
    },
  );

  // ── support contact email ──────────────────────────────────────────────────
  // Read via /api/branding/public (no auth). Write is admin-only.
  app.put(
    "/api/branding/support-email",
    isAuthenticated,
    requireAdmin,
    async (req, res) => {
      const parsed = brandingSupportEmailSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: parsed.error.issues[0]?.message ?? "Enter a valid email address (or null to clear).",
        });
      }
      const email = parsed.data.email ? parsed.data.email : null;
      const userId = (req as any).session?.user?.id ?? null;
      await storage.setBrandingSupportEmail(email, userId);
      res.json({ email });
    },
  );

  // ── orphan rows admin action ───────────────────────────────────────────────
  // GET surfaces the rows whose underlying file no longer exists on disk so
  // the Media page can render a "Clean up N orphans" prompt. POST removes
  // them in one shot. Both are admin-only — the rows show on every admin's
  // Media page and shouldn't be mutable by lower roles.
  app.get(
    "/api/branding/orphans",
    isAuthenticated,
    requireAdmin,
    async (_req, res) => {
      try {
        const orphans = await storage.getOrphanedBrandingAssets();
        res.json({
          count: orphans.length,
          orphans: orphans.map((o) => ({
            id: o.id,
            slot: o.slot,
            mode: o.mode,
            url: o.url,
          })),
        });
      } catch (err: any) {
        console.error("[branding] orphans GET failed:", err?.message);
        res.status(500).json({ error: "Failed to scan for orphaned assets" });
      }
    },
  );

  app.post(
    "/api/branding/orphans/cleanup",
    isAuthenticated,
    requireAdmin,
    async (_req, res) => {
      try {
        const deleted = await storage.deleteOrphanedBrandingAssets();
        res.json({ deleted });
      } catch (err: any) {
        console.error("[branding] orphans cleanup failed:", err?.message);
        res.status(500).json({ error: "Failed to delete orphaned assets" });
      }
    },
  );
}
