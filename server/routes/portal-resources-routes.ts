// Resource Content (Library › Knowledge › Resource Content): the links on
// the Account Portal's "Learning & Documentation" and "Support & Community"
// cards. See docs/features/resource-content.md.
//
//   GET    /api/portal-resources/cards     any signed-in user: what each portal card shows, in order
//   GET    /api/portal-resources           View on Resource Content: every resource (My / Other / System)
//   POST   /api/portal-resources           Edit: { card, title, description?, icon, iconColor, linkType, url }
//   PATCH  /api/portal-resources/:id       Edit + owner or Admin (System rows: Admin only)
//   DELETE /api/portal-resources/:id       Edit + owner or Admin; System rows are never deleted
//   PUT    /api/portal-resources/cards/:card  Edit: { ids } what the card shows, in order (at most 4)
//
// Errors carry a `code` the client translates; `message` is English for logs.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionEdit, requireSectionView } from "../lib/section-permissions";
import { requireInternalUser } from "../lib/internal-access";
import { storage } from "../storage";
import { PortalResourceError } from "../storage/portal-resources";
import {
  PORTAL_CARD_LIMIT,
  PORTAL_RESOURCE_CARDS,
  RESOURCE_CONTENT_SECTION,
  canChangeResource,
  portalCardSelectionSchema,
  portalResourceCreateSchema,
  portalResourceUpdateSchema,
  type PortalResourceCard,
} from "@shared/portal-resources";

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ code, message });
}

function idParam(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function sessionUser(req: Request): { id: string; isAdmin: boolean } | null {
  const user = (req as { session?: { user?: { id?: string; role?: string } } }).session?.user;
  return user?.id ? { id: user.id, isAdmin: user.role === "Admin" } : null;
}

function handleError(res: Response, what: string, err: unknown): void {
  if (err instanceof PortalResourceError) {
    fail(res, err.status, err.code, err.message);
    return;
  }
  console.error(`[portal-resources] ${what} failed:`, err);
  fail(res, 500, "server_error", `Could not ${what}`);
}

/** The first Zod issue as a code the client knows (invalid_link, link_pair, …), else invalid_input. */
function validationCode(issues: ReadonlyArray<{ message: string }>): string {
  const known = new Set(["invalid_link", "link_pair", "duplicate_ids"]);
  return issues.find((i) => known.has(i.message))?.message ?? "invalid_input";
}

export function registerPortalResourcesRoutes(app: Express) {
  const canView = [isAuthenticated, requireInternalUser, requireSectionView(RESOURCE_CONTENT_SECTION)];
  const canEdit = [isAuthenticated, requireInternalUser, requireSectionEdit(RESOURCE_CONTENT_SECTION)];

  // Read by the Account Portal's Resources tab, for every role.
  app.get("/api/portal-resources/cards", isAuthenticated, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.getPortalResourceCards());
    } catch (err) {
      handleError(res, "read the portal cards", err);
    }
  });

  app.get("/api/portal-resources", ...canView, async (_req: Request, res: Response) => {
    try {
      res.json(await storage.listPortalResources());
    } catch (err) {
      handleError(res, "read resources", err);
    }
  });

  app.post("/api/portal-resources", ...canEdit, async (req: Request, res: Response) => {
    const user = sessionUser(req);
    if (!user) return fail(res, 401, "unauthorized", "Not signed in");
    const parsed = portalResourceCreateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, validationCode(parsed.error.issues), "Invalid resource");
    try {
      res.status(201).json(await storage.createPortalResource(parsed.data, user.id));
    } catch (err) {
      handleError(res, "create the resource", err);
    }
  });

  app.patch("/api/portal-resources/:id", ...canEdit, async (req: Request, res: Response) => {
    const user = sessionUser(req);
    if (!user) return fail(res, 401, "unauthorized", "Not signed in");
    const id = idParam(req.params.id);
    if (!id) return fail(res, 400, "invalid_input", "Invalid id");
    const parsed = portalResourceUpdateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, validationCode(parsed.error.issues), "Invalid resource");
    try {
      const current = await storage.getPortalResource(id);
      if (!current) return fail(res, 404, "not_found", "Resource not found");
      if (!canChangeResource(current, user).edit) {
        return fail(res, 403, current.isSystem ? "system_admin_only" : "not_owner", "You can't change this resource");
      }
      res.json(await storage.updatePortalResource(id, parsed.data));
    } catch (err) {
      handleError(res, "save the resource", err);
    }
  });

  app.delete("/api/portal-resources/:id", ...canEdit, async (req: Request, res: Response) => {
    const user = sessionUser(req);
    if (!user) return fail(res, 401, "unauthorized", "Not signed in");
    const id = idParam(req.params.id);
    if (!id) return fail(res, 400, "invalid_input", "Invalid id");
    try {
      const current = await storage.getPortalResource(id);
      if (!current) return fail(res, 404, "not_found", "Resource not found");
      if (!canChangeResource(current, user).remove) {
        return fail(res, 403, current.isSystem ? "system_locked" : "not_owner", "You can't delete this resource");
      }
      await storage.deletePortalResource(id);
      res.json({ success: true });
    } catch (err) {
      handleError(res, "delete the resource", err);
    }
  });

  app.put("/api/portal-resources/cards/:card", ...canEdit, async (req: Request, res: Response) => {
    const card = String(req.params.card);
    if (!(PORTAL_RESOURCE_CARDS as readonly string[]).includes(card)) return fail(res, 400, "invalid_input", "Unknown card");
    const parsed = portalCardSelectionSchema.safeParse(req.body);
    if (!parsed.success) {
      const tooMany = Array.isArray(req.body?.ids) && req.body.ids.length > PORTAL_CARD_LIMIT;
      return fail(res, tooMany ? 409 : 400, tooMany ? "card_full" : validationCode(parsed.error.issues), "Invalid card selection");
    }
    try {
      res.json(await storage.setPortalResourceCard(card as PortalResourceCard, parsed.data.ids));
    } catch (err) {
      handleError(res, "save the card", err);
    }
  });
}
