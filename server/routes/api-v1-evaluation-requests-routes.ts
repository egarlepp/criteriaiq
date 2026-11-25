// Evaluation requests from other apps (DemoIQ): after a demo where the
// prospect agreed to a POC, DemoIQ asks for one on behalf of the SE who ran
// the demo. The request is the same open request the app's own form makes,
// with the SE as the requester, and the account team is told the same way.
//
// Endpoints:
//   GET  /api/v1/evaluation-requests/options?account=<text>
//        Active solutions, and (with 2+ characters) up to 20 accounts whose
//        name contains the text, for the caller's form. Accounts are ids and
//        names; solutions add iconName and graphicUrl, so the caller can draw
//        them the way CriteriaIQ does (the key may GET graphicUrl), plus their
//        type, description and linked components, so the caller can import them.
//   POST /api/v1/evaluation-requests
//        Creates the request. externalRef is the caller's own id for it, so
//        a retry returns the request already made (200, created: false).
//
// Callers: API keys with the evaluation-requests:write scope only (preset
// "Evaluation requests only (DemoIQ)"); a signed-in user uses
// /api/evaluation-requests. The requester must be an active, approved
// internal user; an unknown email and an outside user get the same 404.
// Demo mode follows the app-wide setting, like every API key request.
// Contract: docs/features/evaluation-requests.md (For other apps).
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireApiKeyScope } from "../auth/apiKeyAuth";
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { getPublicAppUrl } from "../lib/app-config";
import { notifyNewEvaluationRequest } from "../lib/evaluation-request-notify";

export const EVALUATION_REQUESTS_SCOPE = "evaluation-requests:write";
/** Most accounts one options lookup returns. */
export const ACCOUNT_MATCH_LIMIT = 20;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), "Invalid date")
  // Midnight UTC, like the app's own form (evaluation-request-utils.ts).
  .transform((value) => new Date(`${value}T00:00:00.000Z`));

export const externalEvaluationRequestSchema = z
  .object({
    requesterEmail: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    customerId: z.number().int().positive(),
    solutionIds: z.array(z.number().int().positive()).min(1).max(100),
    startDate: isoDate,
    endDate: isoDate,
    topReasons: z.string().trim().min(1).max(5000),
    compellingEvent: z.string().trim().min(1).max(5000),
    externalRef: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._:/-]+$/, "Letters, digits and . _ : / - only"),
  })
  .strict()
  .refine((body) => body.endDate >= body.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

const accountQuerySchema = z.string().trim().max(200).optional();

function requestUrl(id: number): string {
  return `${getPublicAppUrl()}/project?tab=validation&subtab=evaluation-requests&requestId=${id}`;
}

function fail(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ code, message });
}

export function registerApiV1EvaluationRequestsRoutes(app: Express) {
  const guard = [isAuthenticated, requireApiKeyScope(EVALUATION_REQUESTS_SCOPE)];

  app.get("/api/v1/evaluation-requests/options", ...guard, async (req: Request, res: Response) => {
    try {
      const raw = Array.isArray(req.query.account) ? undefined : req.query.account;
      const parsed = accountQuerySchema.safeParse(typeof raw === "string" ? raw : undefined);
      if (!parsed.success) return fail(res, 400, "invalid_request", "account must be 200 characters or fewer");
      const query = parsed.data ?? "";
      const [solutions, accounts] = await Promise.all([
        storage.getEvaluationRequestSolutions(),
        query.length >= 2 ? storage.searchEvaluationRequestAccounts(query, ACCOUNT_MATCH_LIMIT) : Promise.resolve([]),
      ]);
      res.set("Cache-Control", "private, no-store");
      return res.json({ data: { accounts, solutions } });
    } catch (error) {
      console.error("[api/v1] Couldn't load evaluation request options:", error);
      return res.status(500).json({ message: "Failed to load the options" });
    }
  });

  app.post("/api/v1/evaluation-requests", ...guard, async (req: Request, res: Response) => {
    try {
      const parsed = externalEvaluationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          code: "invalid_request",
          message: "Invalid data",
          errors: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
      }
      const body = parsed.data;

      const requester = await storage.getUserByEmail(body.requesterEmail);
      // Same answer for unknown, outside, inactive and unapproved people, so
      // the endpoint can't be used to find out who has an account.
      if (!requester || isExternalRole(requester.role) || requester.isActive === false || !requester.isApproved) {
        return fail(res, 404, "requester_not_found", "No active CriteriaIQ user has that email");
      }

      const existing = await storage.getEvaluationRequestByExternalRef(body.externalRef);
      if (existing) {
        if (existing.userId !== requester.id) {
          return fail(res, 409, "external_ref_conflict", "That externalRef belongs to another person's request");
        }
        return res.status(200).json({
          data: { id: existing.id, status: existing.status, created: false, url: requestUrl(existing.id) },
        });
      }

      const account = await storage.getEvaluationRequestAccount(body.customerId);
      if (!account) return fail(res, 404, "account_not_found", "No active account has that id");

      const solutionIds = Array.from(new Set(body.solutionIds));
      const known = new Set((await storage.getEvaluationRequestSolutions()).map((s) => s.id));
      const unknown = solutionIds.filter((id) => !known.has(id));
      if (unknown.length > 0) {
        return res.status(400).json({
          code: "unknown_solutions",
          message: "Some solutions are not active",
          solutionIds: unknown,
        });
      }

      const { request, created } = await storage.createExternalEvaluationRequest(
        {
          userId: requester.id,
          customerId: account.id,
          startDate: body.startDate,
          endDate: body.endDate,
          topReasons: body.topReasons,
          compellingEvent: body.compellingEvent,
          externalRef: body.externalRef,
        },
        solutionIds,
      );
      if (!created && request.userId !== requester.id) {
        return fail(res, 409, "external_ref_conflict", "That externalRef belongs to another person's request");
      }

      if (created) {
        await notifyNewEvaluationRequest({
          customerId: account.id,
          solutionIds,
          startDate: body.startDate,
          endDate: body.endDate,
          topReasons: body.topReasons,
          compellingEvent: body.compellingEvent,
          requester,
        });
      }

      return res.status(created ? 201 : 200).json({
        data: { id: request.id, status: request.status, created, url: requestUrl(request.id) },
      });
    } catch (error) {
      console.error("[api/v1] Couldn't create an evaluation request:", error);
      return res.status(500).json({ message: "Failed to create the evaluation request" });
    }
  });
}
