// View As (the header's Dev Persona Switcher). An Admin looks at the app the
// way another person, or a new user of a role, sees it: same pages, same
// data, same permission checks. Approved by Eric 2026-10-29.
//
// How it works: while View As is on, the session's `user` IS the person
// being viewed, so every one of the server's `req.session.user` checks
// answers for them without any route knowing about View As. The Admin who
// started it is kept in `session.viewAs.realUser`; ending View As puts them
// back. Three rules keep that safe:
//
//   1. Read only. viewAsGuard (mounted right after the session middleware,
//      before every route) refuses any request that could change data,
//      except ending View As and signing out. Nobody can act as someone
//      else, even by calling the API directly.
//   2. Only an Admin can start it, never on another Admin, and the guard
//      re-checks on every request that the person behind the session is
//      still an active Admin (cached 30 seconds, like checkSessionUser).
//   3. Login History records who started and ended it, and the hourly
//      session audit row names the Admin, not the person viewed.
//
// "Role" mode views as a stand-in user with no record of its own: its id is
// `view-as-role:<Role>`, its permissions are the role's Role Management
// grants (section-permissions.ts), and it is assigned no projects or
// accounts, like a brand-new user with that role.
import type { NextFunction, Request, Response } from "express";
import { loadUserAuthState } from "./session-revocation";

export const VIEW_AS_ROLE_ID_PREFIX = "view-as-role:";

/** Roles View As never takes on: viewing as an Admin shows nothing new. */
export const VIEW_AS_BLOCKED_ROLES: readonly string[] = ["Admin"];

export interface ViewAsSessionUser {
  id: string;
  email: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  [key: string]: unknown;
}

export interface ViewAsState {
  /** The Admin who started View As; restored when it ends. */
  realUser: ViewAsSessionUser;
  mode: "user" | "role";
  role: string;
  /** The viewed user's id in "user" mode, null in "role" mode. */
  targetUserId: string | null;
  startedAt: number;
}

declare module "express-session" {
  interface SessionData {
    viewAs?: ViewAsState;
  }
}

type SessionLike = {
  user?: ViewAsSessionUser;
  viewAs?: ViewAsState;
};

export function viewAsRoleUserId(role: string): string {
  return `${VIEW_AS_ROLE_ID_PREFIX}${role}`;
}

/** The role a `view-as-role:` stand-in id stands for, or null for a real id. */
export function roleForViewAsUserId(userId: string | null | undefined): string | null {
  if (!userId || !userId.startsWith(VIEW_AS_ROLE_ID_PREFIX)) return null;
  const role = userId.slice(VIEW_AS_ROLE_ID_PREFIX.length);
  return role.length > 0 ? role : null;
}

/** The person actually signed in: the Admin during View As, else the session user. */
export function realSessionUser(session: SessionLike | undefined | null): ViewAsSessionUser | undefined {
  return session?.viewAs?.realUser ?? session?.user;
}

/** Stand-in session user for "role" mode. */
export function buildRoleStandIn(role: string, displayName: string): ViewAsSessionUser {
  return {
    id: viewAsRoleUserId(role),
    email: null,
    firstName: displayName,
    lastName: null,
    role,
    isActive: true,
    isApproved: true,
    mfaEnabled: false,
    accountId: null,
    allAccountsAccess: false,
  };
}

export function beginViewAs(
  session: SessionLike,
  target: ViewAsSessionUser,
  details: { mode: "user" | "role"; role: string; targetUserId: string | null },
): void {
  const realUser = realSessionUser(session);
  if (!realUser) throw new Error("View As needs a signed-in user");
  session.viewAs = { realUser, ...details, startedAt: Date.now() };
  session.user = target;
}

/** Puts the Admin back. Returns the state that was ended, or null. */
export function endViewAs(session: SessionLike): ViewAsState | null {
  const state = session.viewAs ?? null;
  if (!state) return null;
  session.user = state.realUser;
  delete session.viewAs;
  return state;
}

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Writes allowed during View As: ending or switching it, and signing out. */
const WRITES_ALLOWED = new Set(["/api/view-as", "/api/logout"]);

/**
 * Mounted once, right after the session middleware. Does nothing unless
 * View As is on; then it refuses writes and ends the session if the Admin
 * behind it has been deactivated or is no longer an Admin.
 */
export async function viewAsGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = (req as Request & { session?: SessionLike & { destroy?: (cb: (err?: unknown) => void) => void } }).session;
  const state = session?.viewAs;
  if (!state) return next();

  const path = (req.originalUrl ?? req.path ?? "").split("?")[0] ?? "";
  if (!READ_METHODS.has(req.method) && !WRITES_ALLOWED.has(path)) {
    res.status(403).json({
      message: "View As is read only. End View As to make changes.",
      code: "VIEW_AS_READ_ONLY",
    });
    return;
  }

  try {
    const admin = await loadUserAuthState(state.realUser.id);
    if (!admin.allowed || admin.role !== "Admin") {
      await new Promise<void>((resolve) => {
        if (typeof session?.destroy === "function") session.destroy(() => resolve());
        else resolve();
      });
      res.status(401).json({ message: "Unauthorized", code: "SESSION_REVOKED" });
      return;
    }
  } catch (error) {
    // Same as checkSessionUser: a database blip shouldn't sign anyone out.
    // Writes are already refused above, so continuing stays read only.
    console.error("[view-as] could not re-read the signed-in Admin:", error);
  }
  next();
}
