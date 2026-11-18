// View As (the header's Dev Persona Switcher). How it works and why it is
// safe: server/auth/view-as.ts.
//
//   GET    /api/view-as/options  — Admin; roles and users that can be viewed as
//   POST   /api/view-as          — Admin; { userId } or { role }, starts or switches View As
//   DELETE /api/view-as          — signed in; ends View As (no-op when it is off)
//
// "Admin" here is the person actually signed in, so an Admin who is already
// viewing as someone can switch to someone else without ending first.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import {
  VIEW_AS_BLOCKED_ROLES,
  beginViewAs,
  buildRoleStandIn,
  endViewAs,
  realSessionUser,
  type ViewAsSessionUser,
  type ViewAsState,
} from "../auth/view-as";
import { forgetUserAuthState } from "../auth/session-revocation";
import { EXTERNAL_ROLES } from "../lib/internal-access";
import { toSafeUser } from "../lib/safe-user";
import { storage } from "../storage";

const startSchema = z.union([
  z.object({ userId: z.string().trim().min(1).max(200) }).strict(),
  z.object({ role: z.string().trim().min(1).max(100) }).strict(),
]);

type ViewAsSession = {
  user?: ViewAsSessionUser;
  viewAs?: ViewAsState;
  save: (cb: (err?: unknown) => void) => void;
};

function viewAsSession(req: Request): ViewAsSession | undefined {
  return (req as Request & { session?: ViewAsSession }).session;
}

function requireRealAdmin(req: Request, res: Response): ViewAsSessionUser | null {
  const admin = realSessionUser(viewAsSession(req));
  if (!admin) {
    res.status(401).json({ message: "Authentication required" });
    return null;
  }
  if (admin.role !== "Admin") {
    res.status(403).json({ message: "Only administrators can use View As" });
    return null;
  }
  return admin;
}

function saveSession(session: ViewAsSession): Promise<void> {
  return new Promise((resolve, reject) => session.save((err) => (err ? reject(err) : resolve())));
}

function displayName(user: { firstName?: string | null; lastName?: string | null; email?: string | null }): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";
}

/** Login History row naming the Admin and who they viewed as. Never throws. */
async function recordViewAsEvent(
  req: Request,
  admin: ViewAsSessionUser,
  eventType: "view_as_started" | "view_as_ended",
  subject: string,
): Promise<void> {
  try {
    await storage.createAuditLogin({
      userId: admin.id,
      userEmail: admin.email ?? "",
      userName: displayName(admin),
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      loginMethod: "admin",
      success: true,
      failureReason: null,
      eventType,
      eventSubject: subject,
    } as Parameters<typeof storage.createAuditLogin>[0]);
  } catch (error) {
    console.error("[view-as] could not write audit row:", error);
  }
}

function subjectFor(state: Pick<ViewAsState, "mode" | "role">, target: ViewAsSessionUser): string {
  return state.mode === "role" ? `Role: ${state.role}` : `${displayName(target)} (${state.role})`;
}

export function registerViewAsRoutes(app: Express) {
  app.get("/api/view-as/options", isAuthenticated, async (req: Request, res: Response) => {
    const admin = requireRealAdmin(req, res);
    if (!admin) return;
    try {
      const [roles, users] = await Promise.all([storage.getRoles(), storage.getAllUsersSafe()]);
      res.json({
        roles: roles
          .filter((r) => r.isActive !== false && !VIEW_AS_BLOCKED_ROLES.includes(r.name))
          .map((r) => ({
            name: r.name,
            displayName: r.displayName,
            icon: r.icon,
            color: r.color,
            external: EXTERNAL_ROLES.has(r.name),
          })),
        users: users
          .filter(
            (u) =>
              u.id !== admin.id &&
              u.isActive !== false &&
              u.isApproved !== false &&
              !VIEW_AS_BLOCKED_ROLES.includes(u.role ?? ""),
          )
          .map((u) => ({ id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role })),
      });
    } catch (error) {
      console.error("[view-as] could not list options:", error);
      res.status(500).json({ message: "Failed to load View As options" });
    }
  });

  app.post("/api/view-as", isAuthenticated, async (req: Request, res: Response) => {
    const admin = requireRealAdmin(req, res);
    if (!admin) return;
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Send either a userId or a role" });
    }
    const session = viewAsSession(req);
    if (!session) return res.status(401).json({ message: "Authentication required" });

    try {
      let target: ViewAsSessionUser;
      let details: { mode: "user" | "role"; role: string; targetUserId: string | null };
      if ("userId" in parsed.data) {
        if (parsed.data.userId === admin.id) {
          return res.status(400).json({ message: "You cannot view as yourself" });
        }
        const user = await storage.getUser(parsed.data.userId);
        if (!user || user.isActive === false || user.isApproved === false) {
          return res.status(404).json({ message: "User not found" });
        }
        if (VIEW_AS_BLOCKED_ROLES.includes(user.role ?? "")) {
          return res.status(400).json({ message: "View As is not available for administrators" });
        }
        target = toSafeUser(user) as unknown as ViewAsSessionUser;
        details = { mode: "user", role: user.role ?? "", targetUserId: user.id };
      } else {
        const role = await storage.getRoleByName(parsed.data.role);
        if (!role || role.isActive === false) {
          return res.status(404).json({ message: "Role not found" });
        }
        if (VIEW_AS_BLOCKED_ROLES.includes(role.name)) {
          return res.status(400).json({ message: "View As is not available for administrators" });
        }
        target = buildRoleStandIn(role.name, role.displayName);
        details = { mode: "role", role: role.name, targetUserId: null };
      }

      const previous = session.viewAs ? { state: session.viewAs, user: session.user } : null;
      beginViewAs(session, target, details);
      await saveSession(session);
      if (previous?.user) await recordViewAsEvent(req, admin, "view_as_ended", subjectFor(previous.state, previous.user));
      await recordViewAsEvent(req, admin, "view_as_started", subjectFor(details, target));
      res.json({ mode: details.mode, role: details.role, targetUserId: details.targetUserId });
    } catch (error) {
      console.error("[view-as] could not start:", error);
      res.status(500).json({ message: "Failed to start View As" });
    }
  });

  app.delete("/api/view-as", isAuthenticated, async (req: Request, res: Response) => {
    const session = viewAsSession(req);
    if (!session?.viewAs) return res.json({ ended: false });
    try {
      const viewed = session.user;
      const state = endViewAs(session);
      await saveSession(session);
      if (state) {
        // The next request re-reads the Admin instead of a cached state.
        forgetUserAuthState(state.realUser.id);
        if (viewed) await recordViewAsEvent(req, state.realUser, "view_as_ended", subjectFor(state, viewed));
      }
      res.json({ ended: true });
    } catch (error) {
      console.error("[view-as] could not end:", error);
      res.status(500).json({ message: "Failed to end View As" });
    }
  });
}
