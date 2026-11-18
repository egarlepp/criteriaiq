// Versioned, read-only API for other apps (ImpactIQ, VectorIQ, n8n).
//
// Endpoints:
//   GET /api/v1/projects/:id/summary   — one project's summary
//   GET /api/v1/projects/summary       — summaries matching a CRM record:
//       ?crmOpportunityId= | ?crmAccountId= | ?evaluationId= (AND-combined;
//       at least one is required, so this is never a bulk export)
//   GET /api/v1/people/summary?email= — one person's counts for VectorIQ:
//       validations they were on, won/lost/cancelled, criteria met. No
//       names, customers or ids (shared/person-summary.ts). Callers: API
//       keys with people:read, Admins, or the person asking about
//       themselves. Unknown and outside users (Customer, Guest, Partner)
//       get the same 404. Contract: docs/features/person-summary-api.md.
//
// Callers: internal users and API keys with projects:read. Customer, Guest
// and Partner sessions are refused. Every project still goes through
// hasProjectAccess, so a restricted internal role (Sales, CX, Product) only
// sees projects it was given. Demo projects are only returned in demo mode.
//
// Shape: shared/project-summary.ts (ProjectSummaryV1). Contract, versioning
// rules and examples: docs/features/project-summary-api.md.
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { requireInternalUser } from "../lib/internal-access";
import { hasProjectAccess } from "../lib/project-access";
import { evaluationLinkMatches, hasProjectCrmFilters, parseProjectCrmFilters } from "../lib/crm-record-fields";
import { buildProjectSummaries } from "../lib/project-summary";
import { getPublicAppUrl } from "../lib/app-config";
import type { ProjectSummaryRow } from "../storage/project-summary";
import { buildPersonSummary } from "../lib/person-summary";
import { isExternalRole } from "../lib/internal-access";
import { z } from "zod";

/** Most summaries one lookup returns. */
export const SUMMARY_LOOKUP_LIMIT = 25;

type SessionUser = { id: string; role?: string | null; email?: string | null };

function sessionUser(req: Request): SessionUser {
  return (req as Request & { session: { user: SessionUser } }).session.user;
}

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const personEmailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Who may read someone's person summary: an API key (the people:read scope
 * was already enforced by apiKeyAuth before the request got here), an
 * Admin, or the person themselves.
 */
function canReadPersonSummary(req: Request, user: SessionUser, email: string): boolean {
  if ((req as Request & { apiKeyContext?: unknown }).apiKeyContext) return true;
  if (user.role === "Admin") return true;
  return (user.email ?? "").trim().toLowerCase() === email;
}

async function visibleRows(user: SessionUser, rows: ProjectSummaryRow[]): Promise<ProjectSummaryRow[]> {
  const out: ProjectSummaryRow[] = [];
  for (const row of rows) {
    if (await hasProjectAccess(user.id, user.role, user.email, row.id)) out.push(row);
  }
  return out;
}

async function summarize(rows: ProjectSummaryRow[]) {
  const data = await storage.getProjectSummaryData(rows);
  return buildProjectSummaries(data, getPublicAppUrl());
}

export function registerApiV1Routes(app: Express) {
  app.get("/api/v1/projects/summary", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    try {
      const parsed = parseProjectCrmFilters(req.query as Record<string, unknown>);
      if (!parsed.ok) return res.status(400).json({ message: parsed.message });
      if (!hasProjectCrmFilters(parsed.filters)) {
        return res.status(400).json({ message: "Pass crmOpportunityId, crmAccountId or evaluationId" });
      }
      const { evaluationId } = parsed.filters;
      // Fetch a little more than the limit: the exact evaluation check and
      // the access check can each drop candidates.
      let rows = await storage.getProjectSummaryRows(parsed.filters, SUMMARY_LOOKUP_LIMIT * 2);
      if (evaluationId) rows = rows.filter((r) => evaluationLinkMatches(r.salesforceEvaluationLink, evaluationId));
      rows = (await visibleRows(sessionUser(req), rows)).slice(0, SUMMARY_LOOKUP_LIMIT);
      res.set("Cache-Control", "private, no-store");
      return res.json({ data: await summarize(rows) });
    } catch (error) {
      console.error("[api/v1] Couldn't look up project summaries:", error);
      return res.status(500).json({ message: "Failed to load project summaries" });
    }
  });

  app.get("/api/v1/projects/:id/summary", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    try {
      const id = parseId(req.params.id);
      if (!id) return res.status(400).json({ message: "Invalid project id" });
      const user = sessionUser(req);
      const [row] = await storage.getProjectSummaryRows({ ids: [id] }, 1);
      // Same 404 for missing and not allowed, so ids can't be probed.
      if (!row || !(await hasProjectAccess(user.id, user.role, user.email, id))) {
        return res.status(404).json({ message: "Project not found" });
      }
      const [summary] = await summarize([row]);
      res.set("Cache-Control", "private, no-store");
      return res.json({ data: summary });
    } catch (error) {
      console.error("[api/v1] Couldn't load a project summary:", error);
      return res.status(500).json({ message: "Failed to load the project summary" });
    }
  });

  app.get("/api/v1/people/summary", isAuthenticated, requireInternalUser, async (req: Request, res: Response) => {
    try {
      const parsed = personEmailSchema.safeParse(req.query.email);
      if (!parsed.success) return res.status(400).json({ message: "Pass a single email address" });
      const email = parsed.data;
      if (!canReadPersonSummary(req, sessionUser(req), email)) {
        return res.status(403).json({ message: "Not allowed to read this person's summary" });
      }
      const person = await storage.getUserByEmail(email);
      // Same 404 for unknown and outside users, so accounts can't be probed.
      if (!person || isExternalRole(person.role)) {
        return res.status(404).json({ message: "Person not found" });
      }
      const data = await storage.getPersonSummaryData(person.id);
      res.set("Cache-Control", "private, no-store");
      return res.json({ data: buildPersonSummary(data, person.id, email) });
    } catch (error) {
      console.error("[api/v1] Couldn't load a person summary:", error);
      return res.status(500).json({ message: "Failed to load the person summary" });
    }
  });
}
