// Read-only dashboard routes used by the built-in Home, Support and Accounts
// dashboards (client/src/components/dashboard/dashboard-renderer.tsx).
//
//   GET /api/dashboard-layout    signed in; ?page=<key>&role=<role> → that page's layout
//   GET /api/dashboard-metrics   signed in; custom KPI definitions the dashboards evaluate
//
// Dashboard Builder and Metric Builder were archived (archive/analytics-builders/),
// so the routes that let them write were removed with them:
// POST/DELETE /api/dashboard-layout, POST/PUT/DELETE /api/dashboard-metrics,
// GET /api/schema-context and GET/POST /api/dashboard-config. Those routes only
// checked that someone was signed in, so any user, outside users included,
// could rewrite or delete the Home dashboard and its KPIs, or read the raw
// database schema. The built-in layouts are seeded on boot from
// server/lib/default-protected-dashboards.ts; changing one is now a code change.
import type { Express } from "express";
import { db } from "../db";
import { dashboardLayouts, dashboardMetrics } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../auth/simpleAuth";

export function registerDashboardRoutes(app: Express) {
  app.get("/api/dashboard-layout", isAuthenticated, async (req, res) => {
    try {
      const { page, role } = req.query;
      const targetPage = page?.toString() || "overview";
      const userRole = role?.toString() || req.user?.role || "All";

      const [roleSpecificLayout] = await db.select().from(dashboardLayouts).where(and(eq(dashboardLayouts.pageKey, targetPage), eq(dashboardLayouts.role, userRole))).limit(1);
      if (roleSpecificLayout) return res.json({ activeLayoutId: roleSpecificLayout.id, config: roleSpecificLayout.layoutConfig, isProtected: !!roleSpecificLayout.isProtected, name: roleSpecificLayout.name });

      const [defaultLayout] = await db.select().from(dashboardLayouts).where(and(eq(dashboardLayouts.pageKey, targetPage), eq(dashboardLayouts.role, "All"))).limit(1);
      if (defaultLayout) return res.json({ activeLayoutId: defaultLayout.id, config: defaultLayout.layoutConfig, isProtected: !!defaultLayout.isProtected, name: defaultLayout.name });

      return res.json({ config: null });
    } catch (error) {
      console.error("Error fetching dashboard layout:", error);
      res.status(500).json({ message: "Failed to fetch layout" });
    }
  });

  app.get("/api/dashboard-metrics", isAuthenticated, async (_req, res) => {
    try {
      const metrics = await db.select().from(dashboardMetrics).orderBy(dashboardMetrics.category, dashboardMetrics.name);
      res.json(metrics);
    } catch (err) {
      console.error("Error fetching metrics:", err);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });
}
