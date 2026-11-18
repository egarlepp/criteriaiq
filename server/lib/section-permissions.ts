// Server-side resolution of a user's permission on a page (the values
// admins set in Admin › Team & People › Role Management and on each user).
// Mirrors the client's usePermissions(): the Admin role always passes, and
// otherwise each page has its own value; a page with no row is None. There
// is no inheritance from a group key (shared/permissions.ts).
import type { RequestHandler } from "express";
import { levelAllows, resolveLevel, type PermissionLevel } from "@shared/permissions";
import { storage } from "../storage";
import { roleForViewAsUserId } from "../auth/view-as";

/**
 * A user's page permission rows. A View As role stand-in (server/auth/
 * view-as.ts) has no rows of its own and gets its role's Role Management
 * grants, as a brand-new user of that role would.
 */
export async function permissionRowsForUser(userId: string): Promise<Array<{ section: string; permission: string }>> {
  const standInRole = roleForViewAsUserId(userId);
  if (!standInRole) return storage.getUserPermissions(userId);
  const role = await storage.getRoleByName(standInRole);
  return role ? storage.getRolePermissions(role.id) : [];
}

export async function resolveEffectiveSectionPermission(userId: string, section: string): Promise<PermissionLevel> {
  const perms = await permissionRowsForUser(userId);
  return resolveLevel(perms, section);
}

export async function userCanViewSection(req: any, section: string): Promise<boolean> {
  const userRole = req.session.user?.role;
  if (userRole === "Admin") return true;
  const userId = req.session.user?.id;
  if (!userId) return false;
  return levelAllows(section, await resolveEffectiveSectionPermission(userId, section), "view");
}

export async function userCanEditSection(req: any, section: string): Promise<boolean> {
  const userRole = req.session.user?.role;
  if (userRole === "Admin") return true;
  const userId = req.session.user?.id;
  if (!userId) return false;
  return levelAllows(section, await resolveEffectiveSectionPermission(userId, section), "edit");
}

/**
 * Route guard: passes when the session user can edit at least one of the
 * given sections (Admin always passes). Used by the global Validation
 * Criteria library writes, which previously accepted any signed-in user.
 * Non-admin API keys carry no section permissions, so they are refused.
 */
export function requireSectionEdit(...sections: string[]): RequestHandler {
  return async (req, res, next) => {
    try {
      for (const section of sections) {
        if (await userCanEditSection(req, section)) return next();
      }
      res.status(403).json({ message: "You do not have permission to make this change" });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Route guard: passes when the session user can view at least one of the
 * given sections (Admin always passes). Non-admin API keys carry no section
 * permissions, so they are refused.
 */
export function requireSectionView(...sections: string[]): RequestHandler {
  return async (req, res, next) => {
    try {
      for (const section of sections) {
        if (await userCanViewSection(req, section)) return next();
      }
      res.status(403).json({ message: "You do not have permission to view this" });
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Route guard: Admin role only. Used where a change can grant access to
 * others (role definitions and role permission templates), matching the
 * admin-only rule on user permission writes in users-routes.ts.
 */
export const requireAdmin: RequestHandler = (req, res, next) => {
  const role = (req as { session?: { user?: { role?: string } } }).session?.user?.role;
  if (role !== "Admin") {
    res.status(403).json({ message: "Only administrators can make this change" });
    return;
  }
  next();
};
