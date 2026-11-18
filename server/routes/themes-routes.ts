// Theme routes — Admin › Appearance › Theming.
//
// Endpoints:
//   GET    /api/themes/active             — public; { id, name, colors, logoVariants } — id/name/colors null for CriteriaIQ Classic
//   GET    /api/admin/themes              — Admin; every saved theme
//   POST   /api/admin/themes              — Admin; { name, colors, logoVariantLight?, logoVariantDark? } → new (inactive) theme
//   PATCH  /api/admin/themes/:id          — Admin; { name?, colors?, logoVariantLight?, logoVariantDark? }
//   POST   /api/admin/themes/:id/clone    — Admin; copy named "<name> (copy)", inactive
//   POST   /api/admin/themes/activate     — Admin; { id: number | null } — null switches back to Classic
//   DELETE /api/admin/themes/:id          — Admin; refused (409) for the active theme
//
// The active-theme read is public on purpose: the colors are not secret and
// the sign-in screens render before a session exists. Like branding, there
// is no system audit table yet, so every change logs one `[themes]` line.

import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { insertAppThemeSchema, updateAppThemeSchema, type InsertAppTheme } from "@shared/schema";
import { resolveLogoVariants, withThemeDefaults } from "@shared/theme-colors";

type SessionUser = { id?: string; role?: string };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) {
    return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

/** Route ids are positive integers; anything else is a 400, never a DB query. */
function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const activateSchema = z.object({ id: z.number().int().positive().nullable() });

function logChange(req: Request, action: string, detail: string) {
  console.info(`[themes] ${action} ${detail} by ${sessionUser(req)?.id ?? "unknown"}`);
}

export function registerThemesRoutes(app: Express) {
  // ── PUBLIC ── active theme colors ─────────────────────────────────────────
  app.get("/api/themes/active", async (_req, res) => {
    try {
      // The CriteriaIQ logo version comes with the colors so the sidebar
      // logo and the sidebar background always change together.
      const [theme, mediaLogoVariants] = await Promise.all([
        storage.getActiveAppTheme(),
        storage.getBrandingLogoVariants(),
      ]);
      res.json({
        id: theme?.id ?? null,
        name: theme?.name ?? null,
        colors: theme ? withThemeDefaults(theme.colors as Record<string, unknown>) : null,
        logoVariants: resolveLogoVariants(theme, mediaLogoVariants),
      });
    } catch (err) {
      console.error("[themes] active GET failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to load the active theme" });
    }
  });

  // ── ADMIN ── list ──────────────────────────────────────────────────────────
  app.get("/api/admin/themes", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const themes = await storage.getAppThemes();
      res.json(themes.map((t) => ({ ...t, colors: withThemeDefaults(t.colors as Record<string, unknown>) })));
    } catch (err) {
      console.error("[themes] list failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to load themes" });
    }
  });

  // ── ADMIN ── create ────────────────────────────────────────────────────────
  app.post("/api/admin/themes", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = insertAppThemeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "A name and colors are required" });
    }
    try {
      const theme = await storage.createAppTheme(parsed.data, sessionUser(req)?.id ?? null);
      logChange(req, "created", `#${theme.id} "${theme.name}"`);
      res.status(201).json(theme);
    } catch (err) {
      console.error("[themes] create failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to save the theme" });
    }
  });

  // ── ADMIN ── activate (registered before /:id routes) ─────────────────────
  app.post("/api/admin/themes/activate", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "id must be a theme id or null" });
    }
    try {
      const ok = await storage.activateAppTheme(parsed.data.id);
      if (!ok) return res.status(404).json({ message: "Theme not found" });
      logChange(req, "activated", parsed.data.id === null ? "CriteriaIQ Classic" : `#${parsed.data.id}`);
      res.json({ activeId: parsed.data.id });
    } catch (err) {
      console.error("[themes] activate failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to activate the theme" });
    }
  });

  // ── ADMIN ── update ────────────────────────────────────────────────────────
  app.patch("/api/admin/themes/:id", isAuthenticated, requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ message: "Invalid theme id" });
    const parsed = updateAppThemeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid theme" });
    }
    try {
      const theme = await storage.updateAppTheme(id, parsed.data);
      if (!theme) return res.status(404).json({ message: "Theme not found" });
      logChange(req, "updated", `#${theme.id} "${theme.name}"`);
      res.json(theme);
    } catch (err) {
      console.error("[themes] update failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to save the theme" });
    }
  });

  // ── ADMIN ── clone ─────────────────────────────────────────────────────────
  app.post("/api/admin/themes/:id/clone", isAuthenticated, requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ message: "Invalid theme id" });
    try {
      const source = await storage.getAppTheme(id);
      if (!source) return res.status(404).json({ message: "Theme not found" });
      const copy = await storage.createAppTheme(
        {
          name: `${source.name} (copy)`.slice(0, 200),
          colors: withThemeDefaults(source.colors as Record<string, unknown>),
          logoVariantLight: source.logoVariantLight as InsertAppTheme["logoVariantLight"],
          logoVariantDark: source.logoVariantDark as InsertAppTheme["logoVariantDark"],
        },
        sessionUser(req)?.id ?? null,
      );
      logChange(req, "copied", `#${source.id} to #${copy.id}`);
      res.status(201).json(copy);
    } catch (err) {
      console.error("[themes] clone failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to copy the theme" });
    }
  });

  // ── ADMIN ── delete ────────────────────────────────────────────────────────
  app.delete("/api/admin/themes/:id", isAuthenticated, requireAdmin, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ message: "Invalid theme id" });
    try {
      const result = await storage.deleteAppTheme(id);
      if (result === "not_found") return res.status(404).json({ message: "Theme not found" });
      if (result === "active") {
        return res.status(409).json({ message: "The active theme can't be deleted. Activate another theme first." });
      }
      logChange(req, "deleted", `#${id}`);
      res.status(204).end();
    } catch (err) {
      console.error("[themes] delete failed:", (err as Error).message);
      res.status(500).json({ message: "Failed to delete the theme" });
    }
  });
}
