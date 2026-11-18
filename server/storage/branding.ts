// Branding Assets — admin-customizable login/sidebar/page imagery.
//
// Backs Configuration → System Settings → Media. Each row is a single
// (slot, mode) pair pointing at a cloud-storage object key plus the
// presigned URL we last cached. Background-type slots additionally
// carry an opacity (0–100); logo slots leave opacity NULL.
//
// The tagline override (login screen "Data Security that Starts with
// Identity™") is stored in system_settings under key
// `branding.login_tagline`, NOT in branding_assets — it's a text
// override, not a file. Helpers below read/write that single row so
// callers don't have to know the key path.
import fs from "node:fs";
import path from "node:path";
import { db } from "../db";
import { and, eq, inArray } from "drizzle-orm";
import { brandingAssets, systemSettings } from "@shared/schema";
import { withLogoVariantDefaults, type LogoVariants } from "@shared/theme-colors";
import type {
  BrandingAsset,
  BrandingAssetSlot,
  BrandingAssetMode,
} from "@shared/schema";

const TAGLINE_KEY = "branding.login_tagline";
const SIDEBAR_LOGO_URL_KEY = "branding.sidebar_logo_url";
const SUPPORT_EMAIL_KEY = "branding.support_email";
const LOGO_VARIANTS_KEY = "branding.logo_variants";

/**
 * Resolve a branding row to the on-disk path the /api/files route would
 * read. MUST mirror server/routes/misc-routes.ts's candidate list exactly,
 * otherwise the orphan scan flags rows the route can still serve (or
 * misses rows the route would 404 on). Order:
 *
 *   1. `<cwd>/uploads/<key>`            — current upload write path
 *   2. `<cwd>/attached_assets/<key>`    — bundled defaults + legacy
 *   3. `<main-repo>/uploads/<key>`      — dev worktree fallback
 *   4. `<main-repo>/attached_assets/<key>` — dev worktree fallback
 *
 * Cloud URLs (signed S3/GCS) return null — we can't cheaply verify
 * those here, so callers should treat them as present.
 */
function resolveBrandingFilePath(asset: BrandingAsset): string | null {
  if (!asset.url.startsWith("/api/files/")) return null;
  let objectKey: string;
  try {
    objectKey = decodeURIComponent(asset.url.replace("/api/files/", ""));
  } catch {
    return null;
  }
  if (objectKey.includes("..") || path.isAbsolute(objectKey)) return null;
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "uploads", objectKey),
    path.join(cwd, "attached_assets", objectKey),
  ];
  const wtMatch = cwd.match(/^(.+)[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/);
  if (wtMatch) {
    candidates.push(path.join(wtMatch[1], "uploads", objectKey));
    candidates.push(path.join(wtMatch[1], "attached_assets", objectKey));
  }
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch { /* try next */ }
  }
  return null;
}

export interface UpsertBrandingAssetInput {
  slot: BrandingAssetSlot;
  mode: BrandingAssetMode;
  storageKey: string;
  url: string;
  mime: string;
  sizeBytes: number;
  opacity?: number | null;
  uploadedBy?: string | null;
}

export class BrandingStorageMixin {
  async getBrandingAsset(
    slot: BrandingAssetSlot,
    mode: BrandingAssetMode,
  ): Promise<BrandingAsset | undefined> {
    const [row] = await db
      .select()
      .from(brandingAssets)
      .where(
        and(eq(brandingAssets.slot, slot), eq(brandingAssets.mode, mode)),
      );
    return row;
  }

  async getAllBrandingAssets(): Promise<BrandingAsset[]> {
    return await db.select().from(brandingAssets);
  }

  async upsertBrandingAsset(
    input: UpsertBrandingAssetInput,
  ): Promise<BrandingAsset> {
    const existing = await this.getBrandingAsset(input.slot, input.mode);
    if (existing) {
      const [updated] = await db
        .update(brandingAssets)
        .set({
          storageKey: input.storageKey,
          url: input.url,
          mime: input.mime,
          sizeBytes: input.sizeBytes,
          opacity: input.opacity ?? existing.opacity ?? null,
          uploadedBy: input.uploadedBy ?? existing.uploadedBy ?? null,
          uploadedAt: new Date(),
        })
        .where(eq(brandingAssets.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await db
      .insert(brandingAssets)
      .values({
        slot: input.slot,
        mode: input.mode,
        storageKey: input.storageKey,
        url: input.url,
        mime: input.mime,
        sizeBytes: input.sizeBytes,
        opacity: input.opacity ?? null,
        uploadedBy: input.uploadedBy ?? null,
      })
      .returning();
    return inserted;
  }

  async updateBrandingAssetOpacity(
    slot: BrandingAssetSlot,
    mode: BrandingAssetMode,
    opacity: number,
  ): Promise<BrandingAsset | undefined> {
    const [updated] = await db
      .update(brandingAssets)
      .set({ opacity })
      .where(
        and(eq(brandingAssets.slot, slot), eq(brandingAssets.mode, mode)),
      )
      .returning();
    return updated;
  }

  async deleteBrandingAsset(
    slot: BrandingAssetSlot,
    mode: BrandingAssetMode,
  ): Promise<BrandingAsset | undefined> {
    const [deleted] = await db
      .delete(brandingAssets)
      .where(
        and(eq(brandingAssets.slot, slot), eq(brandingAssets.mode, mode)),
      )
      .returning();
    return deleted;
  }

  /** Which CriteriaIQ logo version each mode shows (Media), defaults filled in. */
  async getBrandingLogoVariants(): Promise<LogoVariants> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, LOGO_VARIANTS_KEY));
    return withLogoVariantDefaults(row?.value as Record<string, unknown> | null);
  }

  async setBrandingLogoVariants(value: LogoVariants, updatedBy?: string | null): Promise<void> {
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, LOGO_VARIANTS_KEY));
    if (existing) {
      await db
        .update(systemSettings)
        .set({ value, updatedBy: updatedBy ?? null, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        key: LOGO_VARIANTS_KEY,
        value,
        description: "Which CriteriaIQ logo version (dark_text or light_text) the sidebar shows in light and dark mode.",
        updatedBy: updatedBy ?? null,
      });
    }
  }

  async getBrandingTagline(): Promise<string | null> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, TAGLINE_KEY));
    if (!row) return null;
    const v = row.value as { text?: string | null } | null;
    return v?.text ?? null;
  }

  async setBrandingTagline(
    text: string | null,
    updatedBy?: string | null,
  ): Promise<void> {
    const value = text === null ? { text: null } : { text };
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, TAGLINE_KEY));
    if (existing) {
      await db
        .update(systemSettings)
        .set({
          value,
          updatedBy: updatedBy ?? null,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        key: TAGLINE_KEY,
        value,
        description: "Admin override for the login-screen tagline (replaces i18n key landing.tagline when set).",
        updatedBy: updatedBy ?? null,
      });
    }
  }

  async getBrandingSidebarLogoUrl(): Promise<string | null> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SIDEBAR_LOGO_URL_KEY));
    if (!row) return null;
    const v = row.value as { url?: string | null } | null;
    return v?.url ?? null;
  }

  async setBrandingSidebarLogoUrl(
    url: string | null,
    updatedBy?: string | null,
  ): Promise<void> {
    const value = url === null ? { url: null } : { url };
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SIDEBAR_LOGO_URL_KEY));
    if (existing) {
      await db
        .update(systemSettings)
        .set({
          value,
          updatedBy: updatedBy ?? null,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        key: SIDEBAR_LOGO_URL_KEY,
        value,
        description: "Admin override for the URL the sidebar logo links to (rendered as <a href> in sidebar.tsx). Null = render the logo without a link wrapper.",
        updatedBy: updatedBy ?? null,
      });
    }
  }

  async getBrandingSupportEmail(): Promise<string | null> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SUPPORT_EMAIL_KEY));
    if (!row) return null;
    const v = row.value as { email?: string | null } | null;
    return v?.email ?? null;
  }

  async setBrandingSupportEmail(
    email: string | null,
    updatedBy?: string | null,
  ): Promise<void> {
    const value = { email };
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, SUPPORT_EMAIL_KEY));
    if (existing) {
      await db
        .update(systemSettings)
        .set({
          value,
          updatedBy: updatedBy ?? null,
          updatedAt: new Date(),
        })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await db.insert(systemSettings).values({
        key: SUPPORT_EMAIL_KEY,
        value,
        description: "Support contact email shown on the error page and About page contact links, and used as the {{supportEmail}} sample in email previews. Null = contact links hidden.",
        updatedBy: updatedBy ?? null,
      });
    }
  }

  /**
   * Find branding rows whose underlying file is no longer reachable.
   * A `/api/files/` row is an orphan only when its key is absent from
   * BOTH the files-DB blob store (the `db` provider) AND every on-disk
   * candidate. Cloud-storage URLs are treated as present — we can't
   * reliably probe signed URLs from here.
   */
  async getOrphanedBrandingAssets(): Promise<BrandingAsset[]> {
    const all = await db.select().from(brandingAssets);
    const localRows = all.filter((a) => a.url.startsWith("/api/files/"));
    if (localRows.length === 0) return [];

    // Batch-check the files DB once for all candidate keys.
    let inFilesDb = new Set<string>();
    try {
      const { listExistingUploadedKeys } = await import("../lib/files-db");
      const keys = localRows
        .map((a) => {
          try { return decodeURIComponent(a.url.replace("/api/files/", "")); } catch { return null; }
        })
        .filter((k): k is string => k !== null);
      inFilesDb = await listExistingUploadedKeys(keys);
    } catch {
      // Files DB unavailable — treat as "no DB-backed files"; disk check
      // below still runs.
    }

    return localRows.filter((a) => {
      let key: string;
      try { key = decodeURIComponent(a.url.replace("/api/files/", "")); } catch { return false; }
      if (inFilesDb.has(key)) return false;        // present in files DB
      return resolveBrandingFilePath(a) === null;  // not on disk either → orphan
    });
  }

  /**
   * Delete the orphaned rows surfaced by getOrphanedBrandingAssets and
   * return the count actually removed. Safe to call repeatedly — a
   * follow-up call after a successful cleanup returns 0.
   */
  async deleteOrphanedBrandingAssets(): Promise<number> {
    const orphans = await this.getOrphanedBrandingAssets();
    if (orphans.length === 0) return 0;
    const ids = orphans.map((o) => o.id);
    await db.delete(brandingAssets).where(inArray(brandingAssets.id, ids));
    return orphans.length;
  }
}
