// Personal notifications (header bell) and the scheduled maintenance window.
//
// Endpoints:
//   GET  /api/notifications                       — signed in; { items, unreadCount } for the caller only
//   POST /api/notifications/:id/read              — signed in; marks one of the caller's own read (404 otherwise)
//   POST /api/notifications/read-all              — signed in
//   GET  /api/users/me/notification-preferences   — signed in; { digest: "off" | "daily" }
//   PUT  /api/users/me/notification-preferences   — signed in; { digest }
//   GET  /api/maintenance                         — signed in; { window, phase } — null once it has ended
//   PUT  /api/admin/maintenance                   — Admin; see shared/maintenance.ts
//   DELETE /api/admin/maintenance                 — Admin; cancels the announced window
//
// Every notification read and write is scoped to the session user's id;
// there is no way to name another user's notifications.
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import {
  MAINTENANCE_SETTING_KEY,
  maintenancePhase,
  maintenanceWindowSchema,
  type MaintenanceWindow,
} from "@shared/maintenance";

type SessionUser = { id?: string; role?: string };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function requireSessionUser(req: Request, res: Response, next: NextFunction) {
  if (!sessionUser(req)?.id) {
    return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  }
  return next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user?.id) {
    return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  }
  if (user.role !== "Admin") {
    return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  }
  return next();
}

function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const digestSchema = z.object({ digest: z.enum(["off", "daily"]) });

async function readMaintenanceWindow(): Promise<MaintenanceWindow | null> {
  const row = await storage.getSystemSetting(MAINTENANCE_SETTING_KEY);
  if (!row?.value) return null;
  const parsed = maintenanceWindowSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

export function registerNotificationsRoutes(app: Express) {
  app.get("/api/notifications", isAuthenticated, requireSessionUser, async (req, res) => {
    try {
      const userId = sessionUser(req)!.id!;
      const [items, unreadCount] = await Promise.all([
        storage.listUserNotifications(userId),
        storage.countUnreadUserNotifications(userId),
      ]);
      res.json({ items, unreadCount });
    } catch (err) {
      console.error("[notifications] list failed:", err);
      res.status(500).json({ message: "Failed to load notifications" });
    }
  });

  app.post("/api/notifications/read-all", isAuthenticated, requireSessionUser, async (req, res) => {
    try {
      const updated = await storage.markAllUserNotificationsRead(sessionUser(req)!.id!);
      res.json({ updated });
    } catch (err) {
      console.error("[notifications] read-all failed:", err);
      res.status(500).json({ message: "Failed to update notifications" });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, requireSessionUser, async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ message: "Invalid notification id" });
    try {
      const ok = await storage.markUserNotificationRead(sessionUser(req)!.id!, id);
      if (!ok) return res.status(404).json({ message: "Notification not found" });
      res.json({ ok: true });
    } catch (err) {
      console.error("[notifications] read failed:", err);
      res.status(500).json({ message: "Failed to update the notification" });
    }
  });

  app.get("/api/users/me/notification-preferences", isAuthenticated, requireSessionUser, async (req, res) => {
    try {
      res.json({ digest: await storage.getNotificationDigestSetting(sessionUser(req)!.id!) });
    } catch (err) {
      console.error("[notifications] preference read failed:", err);
      res.status(500).json({ message: "Failed to load notification preferences" });
    }
  });

  app.put("/api/users/me/notification-preferences", isAuthenticated, requireSessionUser, async (req, res) => {
    const parsed = digestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid notification preferences" });
    try {
      await storage.setNotificationDigestSetting(sessionUser(req)!.id!, parsed.data.digest);
      res.json(parsed.data);
    } catch (err) {
      console.error("[notifications] preference save failed:", err);
      res.status(500).json({ message: "Failed to save notification preferences" });
    }
  });

  app.get("/api/maintenance", isAuthenticated, requireSessionUser, async (_req, res) => {
    try {
      const window = await readMaintenanceWindow();
      const phase = window ? maintenancePhase(window) : null;
      if (!window || phase === "ended") return res.json({ window: null, phase: null });
      res.json({ window, phase });
    } catch (err) {
      console.error("[maintenance] read failed:", err);
      res.status(500).json({ message: "Failed to load the maintenance window" });
    }
  });

  app.get("/api/admin/maintenance", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const window = await readMaintenanceWindow();
      res.json({ window, phase: window ? maintenancePhase(window) : null });
    } catch (err) {
      console.error("[maintenance] admin read failed:", err);
      res.status(500).json({ message: "Failed to load the maintenance window" });
    }
  });

  app.put("/api/admin/maintenance", isAuthenticated, requireAdmin, async (req, res) => {
    const parsed = maintenanceWindowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid maintenance window", errors: parsed.error.issues });
    }
    if (maintenancePhase(parsed.data) === "ended") {
      return res.status(400).json({ message: "The maintenance window has already ended", errorCode: "maintenance_ended" });
    }
    try {
      const user = sessionUser(req)!;
      const window = { ...parsed.data, message: parsed.data.message || null };
      await storage.upsertSystemSetting(MAINTENANCE_SETTING_KEY, window, user.id, "Scheduled maintenance window");
      console.info(`[maintenance] window set to ${window.startsAt} (+${window.durationMinutes}m) by ${user.id}`);
      res.json({ window, phase: maintenancePhase(window) });
    } catch (err) {
      console.error("[maintenance] save failed:", err);
      res.status(500).json({ message: "Failed to save the maintenance window" });
    }
  });

  app.delete("/api/admin/maintenance", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const user = sessionUser(req)!;
      // value is NOT NULL; an empty object reads back as "no window".
      await storage.upsertSystemSetting(MAINTENANCE_SETTING_KEY, {}, user.id, "Scheduled maintenance window");
      console.info(`[maintenance] window cancelled by ${user.id}`);
      res.json({ window: null, phase: null });
    } catch (err) {
      console.error("[maintenance] cancel failed:", err);
      res.status(500).json({ message: "Failed to cancel the maintenance window" });
    }
  });
}
