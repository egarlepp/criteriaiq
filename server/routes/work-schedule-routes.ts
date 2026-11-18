// Work week and time off (Profile Settings › Calendar, and the user dialog
// in Admin › User Management). See docs/features/working-calendar.md.
//
//   GET    /api/work-schedule/me                       the signed-in person's work week and time off
//   PUT    /api/work-schedule/me                       { workDays } (0 = Sunday)
//   DELETE /api/work-schedule/me                       back to Monday to Friday
//   POST   /api/work-schedule/me/time-off              { startDate, endDate, note? }
//   DELETE /api/work-schedule/me/time-off/:id
//
// The same routes under /api/users/:userId/work-schedule act on someone
// else: viewing needs User Management view, changing it needs User
// Management edit (Admins always can).
//
// Errors carry a `code` the client translates; `message` is English for logs.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { userCanEditSection, userCanViewSection } from "../lib/section-permissions";
import { storage } from "../storage";
import { timeOffCreateSchema, workScheduleSaveSchema, TIME_OFF_HISTORY_DAYS } from "@shared/work-schedule";
import { toIsoDate } from "@shared/working-calendar";

const USER_MANAGEMENT_SECTION = "config.user-management";

function fail(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ code, message });
}

function idParam(raw: unknown): number | null {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function historyStart(now = new Date()): string {
  return toIsoDate(new Date(now.getTime() - TIME_OFF_HISTORY_DAYS * 86_400_000));
}

/**
 * The person a request acts on: the signed-in user for /me, else
 * :userId when the caller may view (or, for changes, edit) users and the
 * user exists. Sends the error and answers null otherwise.
 */
async function targetUser(req: Request, res: Response, change: boolean): Promise<string | null> {
  const self = req.session.user!.id;
  const param = req.params.userId;
  if (param === undefined || param === self) return self;
  if (typeof param !== "string" || param.length === 0 || param.length > 200) {
    fail(res, 400, "invalid", "Invalid user id");
    return null;
  }
  const allowed = change
    ? await userCanEditSection(req, USER_MANAGEMENT_SECTION)
    : await userCanViewSection(req, USER_MANAGEMENT_SECTION);
  if (!allowed) {
    fail(res, 403, "forbidden", "You don't have permission to manage this user's work schedule");
    return null;
  }
  if (!(await storage.getUser(param))) {
    fail(res, 404, "not_found", "User not found");
    return null;
  }
  return param;
}

export function registerWorkScheduleRoutes(app: Express) {
  for (const base of ["/api/work-schedule/me", "/api/users/:userId/work-schedule"]) {
    app.get(base, isAuthenticated, async (req: Request, res: Response) => {
      try {
        const userId = await targetUser(req, res, false);
        if (!userId) return;
        res.json(await storage.getWorkScheduleView(userId, historyStart()));
      } catch (err) {
        console.error("[work-schedule] read failed:", err);
        fail(res, 500, "unknown", "Failed to load work schedule");
      }
    });

    app.put(base, isAuthenticated, async (req: Request, res: Response) => {
      try {
        const parsed = workScheduleSaveSchema.safeParse(req.body);
        if (!parsed.success) return fail(res, 400, "invalid", "Choose at least one working day");
        const userId = await targetUser(req, res, true);
        if (!userId) return;
        await storage.setWorkDays(userId, parsed.data.workDays, "manual", req.session.user!.id);
        res.json(await storage.getWorkScheduleView(userId, historyStart()));
      } catch (err) {
        console.error("[work-schedule] save failed:", err);
        fail(res, 500, "unknown", "Failed to save work schedule");
      }
    });

    app.delete(base, isAuthenticated, async (req: Request, res: Response) => {
      try {
        const userId = await targetUser(req, res, true);
        if (!userId) return;
        await storage.clearWorkDays(userId);
        res.json(await storage.getWorkScheduleView(userId, historyStart()));
      } catch (err) {
        console.error("[work-schedule] reset failed:", err);
        fail(res, 500, "unknown", "Failed to reset work schedule");
      }
    });

    app.post(`${base}/time-off`, isAuthenticated, async (req: Request, res: Response) => {
      try {
        const parsed = timeOffCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          const code = parsed.error.issues.find((i) => i.message === "end_before_start" || i.message === "too_long")?.message;
          return fail(res, 400, code ?? "invalid", "Invalid time off");
        }
        const userId = await targetUser(req, res, true);
        if (!userId) return;
        await storage.addTimeOff(userId, parsed.data, req.session.user!.id);
        res.status(201).json(await storage.getWorkScheduleView(userId, historyStart()));
      } catch (err) {
        console.error("[work-schedule] time off add failed:", err);
        fail(res, 500, "unknown", "Failed to add time off");
      }
    });

    app.delete(`${base}/time-off/:id`, isAuthenticated, async (req: Request, res: Response) => {
      try {
        const id = idParam(req.params.id);
        if (!id) return fail(res, 400, "invalid", "Invalid id");
        const userId = await targetUser(req, res, true);
        if (!userId) return;
        const result = await storage.deleteTimeOff(userId, id);
        if (result === "not_found") return fail(res, 404, "not_found", "Time off not found");
        if (result === "outlook") return fail(res, 409, "from_outlook", "Time off read from Outlook is changed in Outlook");
        res.json(await storage.getWorkScheduleView(userId, historyStart()));
      } catch (err) {
        console.error("[work-schedule] time off delete failed:", err);
        fail(res, 500, "unknown", "Failed to remove time off");
      }
    });
  }
}
