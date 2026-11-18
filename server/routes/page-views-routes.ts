// Page-view counts (Admin › Monitoring & Audit › Page Usage).
// See docs/features/page-usage.md.
//
//   POST /api/page-views          signed in; { pageKey } adds one view by the caller today
//   GET  /api/admin/page-usage    Admin; ?days=30|90|180|365, totals per page
//
// A view is always recorded for the session user; the request can't name
// anyone else. The report returns totals per page only, never who opened what.
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireAdmin } from "../lib/section-permissions";
import { storage } from "../storage";
import {
  PAGE_KEY_PATTERN,
  PAGE_USAGE_WINDOWS,
  type PageUsageReport,
  type PageUsageWindow,
} from "@shared/page-views";

const DAY_MS = 24 * 60 * 60 * 1000;

const recordSchema = z.object({ pageKey: z.string().regex(PAGE_KEY_PATTERN) });

function sessionUserId(req: Request): string | undefined {
  return (req as Request & { session?: { user?: { id?: string } } }).session?.user?.id;
}

/** UTC day `days - 1` days before today, so a 30-day window includes today. */
export function windowStartDay(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

export function parseWindow(raw: unknown): PageUsageWindow {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return (PAGE_USAGE_WINDOWS as readonly number[]).includes(n) ? (n as PageUsageWindow) : 90;
}

export function registerPageViewsRoutes(app: Express) {
  app.post("/api/page-views", isAuthenticated, async (req: Request, res: Response) => {
    const userId = sessionUserId(req);
    if (!userId) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid page key" });
      return;
    }
    try {
      await storage.recordPageView(userId, parsed.data.pageKey);
      res.status(204).end();
    } catch (err) {
      console.error("[page-views] record failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ message: "Could not record the page view" });
    }
  });

  app.get("/api/admin/page-usage", isAuthenticated, requireAdmin, async (req: Request, res: Response) => {
    const days = parseWindow(req.query.days);
    try {
      const totals = await storage.getPageUsageTotals(windowStartDay(days));
      const report: PageUsageReport = { days, ...totals };
      res.json(report);
    } catch (err) {
      console.error("[page-views] report failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ message: "Could not read page usage" });
    }
  });
}
