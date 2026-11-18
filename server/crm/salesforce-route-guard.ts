// Keeps Salesforce's own routes off while Salesforce isn't the install's CRM
// (ImpactIQ's requireCrmProvider('salesforce') on /api/salesforce/*).
//
// One guard on the path prefixes rather than a middleware on every route, so
// a Salesforce route added later is covered without anyone remembering to.
// The exceptions are the routes an admin needs to set Salesforce up before
// switching to it (the connection itself), and a user's own disconnect.
import type { Express, RequestHandler } from "express";
import { requireCrmProvider } from "./index";

const GUARDED_PREFIXES = ["/api/admin/salesforce/", "/api/salesforce/", "/api/auth/salesforce/"] as const;

/** Paths reachable whichever CRM is active. Exact matches. */
const ALWAYS_OPEN = new Set([
  // Saving and testing the connection is allowed before choosing the CRM.
  "/api/admin/salesforce/credentials",
  "/api/admin/salesforce/credentials/test",
  "/api/admin/salesforce/mock-mode",
  // Answers { active: false } instead, so screens can say why.
  "/api/auth/salesforce/status",
  // Removing your own stored tokens is always allowed.
  "/api/auth/salesforce/disconnect",
]);

/**
 * Field sync screens and their routes serve both CRMs: the mappings, value
 * translations, policies, runs and issues are tagged by CRM
 * (server/crm/sync-crm.ts), so on HubSpot they read and write HubSpot's
 * rows. The rest under /api/admin/salesforce/ (the Salesforce connection,
 * manual record linking, the nightly link check, the CRM id backfill and the
 * mapping validation dry run) stays Salesforce-only.
 */
const SHARED_SYNC_PATHS: readonly RegExp[] = [
  /^\/api\/admin\/salesforce\/metadata\/(cqi|sf\/objects|sf\/fields|sf\/field-options)$/,
  /^\/api\/admin\/salesforce\/mappings$/,
  /^\/api\/admin\/salesforce\/mappings\/\d+(\/(value-maps|test-translation|suggest-translations))?$/,
  /^\/api\/admin\/salesforce\/value-maps\/\d+$/,
  /^\/api\/admin\/salesforce\/cqi-picklist-values\/[^/]+\/[^/]+$/,
  /^\/api\/admin\/salesforce\/(entity-pairs|policies)$/,
  /^\/api\/admin\/salesforce\/sync\/(run|history|health|issues|link-check)$/,
  /^\/api\/admin\/salesforce\/sync\/run\/\d+$/,
  /^\/api\/admin\/salesforce\/sync\/issues\/\d+\/(resolve|retry)$/,
];

export function isSharedSyncPath(path: string): boolean {
  return SHARED_SYNC_PATHS.some((pattern) => pattern.test(path));
}

export function salesforceRouteNeedsActiveCrm(path: string): boolean {
  if (ALWAYS_OPEN.has(path)) return false;
  return GUARDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * The OAuth callback is a browser redirect, so a JSON 409 would strand the
 * user on a blank page. Send them back to their profile with a message.
 */
const CALLBACK_PATH = "/api/auth/salesforce/callback";

export function registerSalesforceRouteGuard(app: Express): void {
  const guard: RequestHandler = requireCrmProvider("salesforce");
  app.use(async (req, res, next) => {
    if (!salesforceRouteNeedsActiveCrm(req.path)) {
      next();
      return;
    }
    if (req.path === CALLBACK_PATH) {
      const { isCrmProviderActive } = await import("./provider-setting");
      if (await isCrmProviderActive("salesforce")) {
        next();
        return;
      }
      res.redirect("/?profile=integrations&sf_error=" + encodeURIComponent("Salesforce is not this install's CRM."));
      return;
    }
    if (isSharedSyncPath(req.path)) {
      const { getCrmProviderId } = await import("./provider-setting");
      if ((await getCrmProviderId()) !== "none") {
        next();
        return;
      }
    }
    await guard(req, res, next);
  });
}
