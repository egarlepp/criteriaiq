// ImpactIQ: SE effort on a project page (the ImpactIQ card on Admin ›
// Integrations › Overview, and the SE effort card on the project page).
//
//   GET    /api/admin/impactiq        — Admin; connection summary (never the key)
//   PUT    /api/admin/impactiq        — Admin; { baseUrl, apiKey?, enabled }, checked with ImpactIQ before it is saved
//   POST   /api/admin/impactiq/check  — Admin; checks the saved connection again
//   DELETE /api/admin/impactiq        — Admin; removes the connection
//   GET    /api/projects/:id/impactiq-effort — internal users who can open the project;
//          the cost total only for Admin or a role with the impactiq_cost section
//   GET    /api/admin/impactiq/activity-counts — Admin; chosen activity types + ImpactIQ's type list
//   PUT    /api/admin/impactiq/activity-counts — Admin; { activityTypes, opportunityFallback }
//   GET    /api/impactiq/project-activity-counts — internal users; ImpactIQ activity counts for the
//          projects this viewer sees on Manage Projects (ImpactIQ v1.453+)
//   GET    /api/projects/:id/impactiq-activities — internal users who can open the project;
//          the activities behind that project's count, for the drawer (ImpactIQ v1.479+)
//
// The key is an ImpactIQ effort:read key: it reads hour totals per CRM
// Opportunity and nothing else (ImpactIQ docs/effort-api.md). Saving or
// removing it goes to Login History like the HubSpot key. Errors answer
// { errorCode } from shared/impactiq.ts, which the card translates.
import type { Express, NextFunction, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess } from "../lib/project-access";
import { assertOutboundUrl } from "../lib/outbound-url";
import { getImpactiqConfig, getImpactiqConnectionSummary, saveImpactiqConfig } from "../impactiq/config";
import {
  checkImpactiqConnection,
  clearImpactiqCache,
  getOpportunityEffort,
  getProjectActivities,
  getProjectActivityCounts,
  impactiqActivitiesUrl,
  ImpactiqError,
  requestActivityTypes,
} from "../impactiq/client";
import { activityCountSettingsSchema, getActivityCountSettings, saveActivityCountSettings } from "../impactiq/activity-count-settings";
import { toImpactiqProjectRef } from "../impactiq/project-refs";
import {
  demoEffortPeopleIds,
  demoImpactiqActivities,
  demoImpactiqActivityCount,
  demoImpactiqEffort,
  loadDemoEffortPeople,
  peopleFor,
} from "../impactiq/demo-effort";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { filterProjectsForViewer } from "../lib/project-list-access";
import { userCanViewSection } from "../lib/section-permissions";
import {
  IMPACTIQ_COST_SECTION,
  IMPACTIQ_KEY_PATTERN,
  type ImpactiqActivityCountsAdminView,
  type ImpactiqCheck,
  type ImpactiqErrorCode,
  type ImpactiqProjectActivityCount,
  type ProjectActivityCountsResponse,
  type ProjectImpactiqActivitiesResponse,
  type ProjectImpactiqEffortResponse,
} from "@shared/impactiq";

const configBodySchema = z.object({
  baseUrl: z.url({ protocol: /^https?$/ }).max(500),
  apiKey: z.string().trim().regex(IMPACTIQ_KEY_PATTERN).optional(),
  enabled: z.boolean().default(true),
});

type SessionUser = { id?: string; role?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null };

function sessionUser(req: Request): SessionUser | undefined {
  return (req as Request & { session?: { user?: SessionUser } }).session?.user;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ message: "Authentication required", errorCode: "unauthenticated" });
  if (user.role !== "Admin") return res.status(403).json({ message: "Admin role required", errorCode: "forbidden" });
  return next();
}

/** Never throws; the change is already saved. */
async function recordImpactiqKeyEvent(req: Request, eventType: "impactiq_key_saved" | "impactiq_key_removed", subject: string): Promise<void> {
  const actor = sessionUser(req);
  const email = actor?.email ?? "";
  try {
    await storage.createAuditLogin({
      userId: actor?.id ?? null,
      userEmail: email,
      userName: [actor?.firstName, actor?.lastName].filter(Boolean).join(" ") || email,
      ipAddress: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
      loginMethod: "admin",
      success: true,
      failureReason: null,
      eventType,
      eventSubject: subject,
    } as Parameters<typeof storage.createAuditLogin>[0]);
  } catch (error) {
    console.error("[impactiq] could not write audit row:", error);
  }
}

function checkResult(error: unknown): ImpactiqCheck {
  return {
    ok: !error,
    errorCode: error ? (error instanceof ImpactiqError ? error.code : "unreachable") : null,
    checkedAt: new Date().toISOString(),
  };
}

function impactiqErrorCode(error: unknown): ImpactiqErrorCode {
  return error instanceof ImpactiqError ? error.code : "unreachable";
}

function parseProjectId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function registerImpactiqRoutes(app: Express) {
  app.get("/api/admin/impactiq", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      res.json(await getImpactiqConnectionSummary());
    } catch (error) {
      console.error("[impactiq] summary failed:", error);
      res.status(500).json({ message: "Failed to load the ImpactIQ connection", errorCode: "unknown" });
    }
  });

  app.put("/api/admin/impactiq", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = configBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid ImpactIQ settings", errorCode: "invalid" });
      const baseUrl = parsed.data.baseUrl.replace(/\/+$/, "");
      try {
        await assertOutboundUrl(baseUrl);
      } catch {
        return res.status(400).json({ message: "ImpactIQ address is not allowed", errorCode: "url_not_allowed" });
      }
      const existing = await getImpactiqConfig();
      const apiKey = parsed.data.apiKey ?? existing?.apiKey;
      if (!apiKey) return res.status(400).json({ message: "An ImpactIQ API key is required", errorCode: "key_invalid" });

      // A key or address that doesn't work is refused before it replaces the saved one.
      let check: ImpactiqCheck;
      try {
        await checkImpactiqConnection({ baseUrl, apiKey });
        check = checkResult(null);
      } catch (error) {
        const failed = checkResult(error);
        return res.status(400).json({ message: "ImpactIQ refused the connection", errorCode: failed.errorCode });
      }

      const actor = sessionUser(req);
      await saveImpactiqConfig({ baseUrl, apiKey: parsed.data.apiKey, enabled: parsed.data.enabled }, actor?.id ?? null);
      await storage.saveImpactiqConnectionCheck(check);
      clearImpactiqCache();
      await recordImpactiqKeyEvent(req, "impactiq_key_saved", baseUrl);
      res.json(await getImpactiqConnectionSummary());
    } catch (error) {
      console.error("[impactiq] save failed:", error);
      res.status(500).json({ message: "Failed to save the ImpactIQ connection", errorCode: "unknown" });
    }
  });

  app.post("/api/admin/impactiq/check", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const config = await getImpactiqConfig();
      if (!config) return res.status(400).json({ message: "ImpactIQ is not connected", errorCode: "not_configured" });
      let check: ImpactiqCheck;
      try {
        await checkImpactiqConnection(config);
        check = checkResult(null);
      } catch (error) {
        check = checkResult(error);
      }
      await storage.saveImpactiqConnectionCheck(check);
      clearImpactiqCache();
      res.json(await getImpactiqConnectionSummary());
    } catch (error) {
      console.error("[impactiq] check failed:", error);
      res.status(500).json({ message: "Failed to check the ImpactIQ connection", errorCode: "unknown" });
    }
  });

  app.delete("/api/admin/impactiq", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      await storage.deleteImpactiqConnectionRow();
      clearImpactiqCache();
      await recordImpactiqKeyEvent(req, "impactiq_key_removed", "removed");
      res.json(await getImpactiqConnectionSummary());
    } catch (error) {
      console.error("[impactiq] remove failed:", error);
      res.status(500).json({ message: "Failed to remove the ImpactIQ connection", errorCode: "unknown" });
    }
  });

  app.get("/api/projects/:id/impactiq-effort", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseProjectId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid project id" });
      const user = sessionUser(req);
      const [row] = await storage.getProjectSummaryRows({ ids: [id] }, 1);
      // Same 404 for missing and not allowed, so ids can't be probed.
      if (!row || !user?.id || !(await hasProjectAccess(user.id, user.role, user.email, id))) {
        return res.status(404).json({ message: "Project not found" });
      }
      res.set("Cache-Control", "private, no-store");
      // Demo projects aren't in ImpactIQ: show made-up effort, ask nothing.
      if (isCurrentRequestDemo()) {
        const project = await storage.getProjectById(id);
        if (!project) return res.status(404).json({ message: "Project not found" });
        const people = peopleFor(project, await loadDemoEffortPeople(demoEffortPeopleIds(project)));
        const { cost, ...effort } = demoImpactiqEffort(project, people);
        const canSeeCost = cost !== undefined && (await userCanViewSection(req, IMPACTIQ_COST_SECTION));
        const body: ProjectImpactiqEffortResponse = {
          status: "ok",
          effort: canSeeCost ? { ...effort, cost } : effort,
          impactiqUrl: null,
          activitiesUrl: null,
        };
        return res.json(body);
      }
      const hidden: ProjectImpactiqEffortResponse = { status: "hidden" };
      if (!row.crmOpportunityId) return res.json(hidden);
      try {
        const result = await getOpportunityEffort(row.crmOpportunityId);
        if (!result) return res.json(hidden);
        // Cost is a rate-derived figure ImpactIQ shows only to leaders, so it
        // goes only to roles granted it in Role Management.
        const { cost, ...effort } = result.effort;
        const canSeeCost = cost !== undefined && (await userCanViewSection(req, IMPACTIQ_COST_SECTION));
        const body: ProjectImpactiqEffortResponse = {
          status: "ok",
          effort: canSeeCost ? { ...effort, cost } : effort,
          impactiqUrl: result.impactiqUrl,
          activitiesUrl: impactiqActivitiesUrl(result.impactiqUrl, row.crmOpportunityId, row.opportunityName),
        };
        return res.json(body);
      } catch (error) {
        const errorCode = error instanceof ImpactiqError ? error.code : "unreachable";
        console.warn(`[impactiq] effort for project ${id} failed: ${errorCode}`);
        const body: ProjectImpactiqEffortResponse = { status: "unavailable", errorCode };
        return res.json(body);
      }
    } catch (error) {
      console.error("[impactiq] project effort failed:", error);
      return res.status(500).json({ message: "Failed to load ImpactIQ effort" });
    }
  });

  app.get("/api/admin/impactiq/activity-counts", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      const settings = await getActivityCountSettings();
      const config = await getImpactiqConfig();
      let view: ImpactiqActivityCountsAdminView = { settings, options: null, errorCode: "not_configured" };
      if (config) {
        try {
          view = { settings, options: await requestActivityTypes(config), errorCode: null };
        } catch (error) {
          view = { settings, options: null, errorCode: impactiqErrorCode(error) };
        }
      }
      res.set("Cache-Control", "private, no-store");
      res.json(view);
    } catch (error) {
      console.error("[impactiq] activity count settings failed:", error);
      res.status(500).json({ message: "Failed to load activity count settings", errorCode: "unknown" });
    }
  });

  app.put("/api/admin/impactiq/activity-counts", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = activityCountSettingsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid activity count settings", errorCode: "invalid" });
      const saved = await saveActivityCountSettings(parsed.data, sessionUser(req)?.id);
      clearImpactiqCache();
      res.json(saved);
    } catch (error) {
      console.error("[impactiq] activity count settings save failed:", error);
      res.status(500).json({ message: "Failed to save activity count settings", errorCode: "unknown" });
    }
  });

  // The project ids come from the projects this viewer may list, never from
  // the browser, so the call can't be used to read counts for other deals.
  app.get("/api/impactiq/project-activity-counts", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      res.set("Cache-Control", "private, no-store");
      const user = sessionUser(req);
      if (!user?.id) return res.status(401).json({ message: "Authentication required" });
      const settings = await getActivityCountSettings();
      const hidden: ProjectActivityCountsResponse = { status: "hidden" };
      const demo = isCurrentRequestDemo();
      if (settings.activityTypes.length === 0 && !demo) return res.json(hidden);

      const visible = filterProjectsForViewer(await storage.getProjects(user.id), user.id, user.role, user.email);
      // Demo projects aren't in ImpactIQ: counts come from the same made-up
      // effort as the SE Effort card, and nothing is sent to ImpactIQ.
      if (demo) {
        const directory = await loadDemoEffortPeople(visible.flatMap(demoEffortPeopleIds));
        const counts: Record<string, ImpactiqProjectActivityCount> = {};
        for (const project of visible) {
          const count = demoImpactiqActivityCount(demoImpactiqEffort(project, peopleFor(project, directory)), settings.activityTypes);
          if (count.activityCount > 0) counts[String(project.id)] = count;
        }
        const body: ProjectActivityCountsResponse = { status: "ok", counts, opportunityFallback: false };
        return res.json(body);
      }
      try {
        const result = await getProjectActivityCounts(settings, visible.map(toImpactiqProjectRef));
        if (!result) return res.json(hidden);
        const counts: Record<string, ImpactiqProjectActivityCount> = {};
        for (const project of visible) {
          const count = result.counts.get(project.id);
          if (!count) continue;
          const opp = project.crmOpportunityId?.trim();
          counts[String(project.id)] = {
            activityCount: count.activityCount,
            totalHours: count.totalHours,
            lastActivityAt: count.lastActivityAt,
            viaOpportunity: count.viaOpportunity,
            activitiesUrl: opp ? impactiqActivitiesUrl(result.impactiqUrl, opp, project.opportunityName ?? null) : null,
          };
        }
        const body: ProjectActivityCountsResponse = { status: "ok", counts, opportunityFallback: settings.opportunityFallback };
        return res.json(body);
      } catch (error) {
        const errorCode = impactiqErrorCode(error);
        console.warn(`[impactiq] project activity counts failed: ${errorCode}`);
        const body: ProjectActivityCountsResponse = { status: "unavailable", errorCode };
        return res.json(body);
      }
    } catch (error) {
      console.error("[impactiq] project activity counts failed:", error);
      return res.status(500).json({ message: "Failed to load ImpactIQ activity counts" });
    }
  });

  // The activities behind one project's count. Same access as the SE effort
  // card, same activity types and matching as the column.
  app.get("/api/projects/:id/impactiq-activities", isAuthenticated, requireInternalUser, async (req, res) => {
    try {
      const id = parseProjectId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid project id" });
      const user = sessionUser(req);
      // Same 404 for missing and not allowed, so ids can't be probed.
      if (!user?.id || !(await hasProjectAccess(user.id, user.role, user.email, id))) {
        return res.status(404).json({ message: "Project not found" });
      }
      const project = await storage.getProjectById(id);
      if (!project) return res.status(404).json({ message: "Project not found" });
      res.set("Cache-Control", "private, no-store");
      const settings = await getActivityCountSettings();
      const hidden: ProjectImpactiqActivitiesResponse = { status: "hidden" };

      // Demo projects aren't in ImpactIQ: the same made-up effort as the column.
      if (isCurrentRequestDemo()) {
        const effort = demoImpactiqEffort(project, peopleFor(project, await loadDemoEffortPeople(demoEffortPeopleIds(project))));
        const count = demoImpactiqActivityCount(effort, settings.activityTypes);
        const body: ProjectImpactiqActivitiesResponse = {
          status: "ok",
          activities: demoImpactiqActivities(project.id, effort, settings.activityTypes),
          activityCount: count.activityCount,
          totalHours: count.totalHours,
          truncated: false,
          activitiesUrl: null,
        };
        return res.json(body);
      }
      if (settings.activityTypes.length === 0) return res.json(hidden);
      try {
        const result = await getProjectActivities(settings, toImpactiqProjectRef(project));
        if (!result) return res.json(hidden);
        const opp = project.crmOpportunityId?.trim();
        const body: ProjectImpactiqActivitiesResponse = {
          status: "ok",
          activities: result.list.activities,
          activityCount: result.list.activityCount,
          totalHours: result.list.totalHours,
          truncated: result.list.truncated,
          activitiesUrl: opp ? impactiqActivitiesUrl(result.impactiqUrl, opp, project.opportunityName ?? null) : null,
        };
        return res.json(body);
      } catch (error) {
        const errorCode = impactiqErrorCode(error);
        console.warn(`[impactiq] activities for project ${id} failed: ${errorCode}`);
        const body: ProjectImpactiqActivitiesResponse = { status: "unavailable", errorCode };
        return res.json(body);
      }
    } catch (error) {
      console.error("[impactiq] project activities failed:", error);
      return res.status(500).json({ message: "Failed to load ImpactIQ activities" });
    }
  });
}
