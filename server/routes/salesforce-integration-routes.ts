// Salesforce Integration routes (Phase 8 extraction #13).
//
// 4 user-facing handlers covering the Profile page's Salesforce
// connect/disconnect flow:
//
//   GET  /api/auth/salesforce/status
//   GET  /api/auth/salesforce/connect             (OAuth redirect)
//   GET  /api/auth/salesforce/callback            (OAuth callback)
//   POST /api/auth/salesforce/disconnect
//
// All real work routes through `salesforceConfigService`
// (server/salesforce/salesforce-config-service.ts) — the same DB-backed,
// env-fallback OAuth config every other Salesforce feature in the app
// uses. The OAuth callback is the only public-unauthenticated route in
// this slice.
//
// Workstream 4 Phase 2 consolidation: this file previously routed through
// a second, separate `salesforceService` (server/webhooks/
// salesforce-service.ts, now deleted) with its own env-var-only OAuth
// config (no DB fallback) — meaning this page's "Connect to Salesforce"
// failed with "OAuth is not configured" whenever an org configured
// Salesforce OAuth only through the admin UI. That file's other exports
// (getOpportunity, updateOpportunityStage, getOpportunityStages,
// enrichProjectFromOpportunity, searchOpportunities, dynamicFieldSearch)
// and the routes that called them
// (GET/POST /api/salesforce/opportunities/*, GET /api/salesforce/stages,
// POST /api/salesforce/enrich) had zero client callers and were removed
// rather than migrated — the project-creation "link an Opportunity" flow
// already goes through /api/salesforce/opportunities/by-account and
// /api/salesforce/evaluations/by-opportunity below, both already on the
// consolidated system.
import crypto from "crypto";
import type { Express } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { isSalesforceId } from "@shared/crm-record-id";
import { salesforceProvider } from "../crm/salesforce-provider";
import { isCrmProviderActive } from "../crm/provider-setting";
import { clearSalesforceUserCheck } from "../salesforce/salesforce-user-connection";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function stateMatches(expected: string, given: unknown): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  // The state is a fixed-length random value, so comparing lengths first
  // reveals nothing.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Back to the app with Profile Settings open on Integrations (the sidebar
// reads ?profile= and shows the result as a toast).
const PROFILE_INTEGRATIONS = "/?profile=integrations";

export function registerSalesforceIntegrationRoutes(app: Express) {
  // GET /api/auth/salesforce/status - Check if user has Salesforce connected
  app.get("/api/auth/salesforce/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { salesforceConfigService } = await import('../salesforce/index.js');

      const isConnected = await salesforceConfigService.isUserConnected(userId);
      const oauthConfigured = await salesforceConfigService.isOAuthConfigured();
      // False while the install runs another CRM (or none): screens hide
      // Salesforce, and every other Salesforce route answers 409.
      const active = await isCrmProviderActive("salesforce");

      res.json({
        connected: isConnected,
        oauthConfigured,
        active,
      });
    } catch (error: any) {
      console.error("Error checking Salesforce status:", error);
      res.status(500).json({ message: "Failed to check Salesforce status" });
    }
  });

  // GET /api/auth/salesforce/connect - Redirect user to Salesforce OAuth
  app.get("/api/auth/salesforce/connect", isAuthenticated, async (req: any, res) => {
    try {
      const { salesforceConfigService } = await import('../salesforce/index.js');

      // The state binds the callback to this user's session: a callback
      // that doesn't return the same one-time nonce (a forged link, or a
      // code from someone else's sign-in) is refused.
      const state = crypto.randomBytes(24).toString("base64url");
      const authUrl = await salesforceConfigService.getAuthorizationUrl(state);
      if (!authUrl) {
        return res.status(400).json({
          message: "Salesforce OAuth is not configured. Please contact your administrator."
        });
      }

      req.session.salesforceUserId = req.session.user.id;
      req.session.salesforceOAuthState = { value: state, issuedAt: Date.now() };

      res.redirect(authUrl);
    } catch (error: any) {
      console.error("Error initiating Salesforce OAuth:", error);
      res.status(500).json({ message: "Failed to initiate Salesforce connection" });
    }
  });

  // GET /api/auth/salesforce/callback - Handle OAuth callback from Salesforce
  app.get("/api/auth/salesforce/callback", async (req: any, res) => {
    try {
      const { code, error: oauthError, error_description } = req.query;

      if (oauthError) {
        console.error("Salesforce OAuth error:", oauthError, error_description);
        return res.redirect(PROFILE_INTEGRATIONS + "&sf_error=" + encodeURIComponent(error_description || oauthError));
      }

      if (!code) {
        return res.redirect(PROFILE_INTEGRATIONS + "&sf_error=No+authorization+code+received");
      }

      const userId = req.session?.salesforceUserId;
      const expected = req.session?.salesforceOAuthState as { value?: string; issuedAt?: number } | undefined;
      if (req.session) delete req.session.salesforceOAuthState;
      if (!userId || !req.session?.user || req.session.user.id !== userId) {
        return res.redirect(PROFILE_INTEGRATIONS + "&sf_error=Session+expired");
      }
      if (!expected?.value || !stateMatches(expected.value, req.query.state) ||
          Date.now() - (expected.issuedAt ?? 0) > OAUTH_STATE_TTL_MS) {
        delete req.session.salesforceUserId;
        return res.redirect(PROFILE_INTEGRATIONS + "&sf_error=" + encodeURIComponent("Connection request expired. Please try connecting again."));
      }

      const { salesforceConfigService } = await import('../salesforce/index.js');
      const tokens = await salesforceConfigService.handleOAuthCallback(code as string);
      await salesforceConfigService.saveTokensForUser(userId, tokens);
      clearSalesforceUserCheck(userId);

      // Clean up session
      delete req.session.salesforceUserId;

      res.redirect(PROFILE_INTEGRATIONS + "&sf=connected");
    } catch (error: any) {
      console.error("Error handling Salesforce callback:", error);
      res.redirect(PROFILE_INTEGRATIONS + "&sf_error=" + encodeURIComponent(
        error instanceof Error ? error.message : "Failed to connect to Salesforce"
      ));
    }
  });

  // POST /api/auth/salesforce/disconnect - Disconnect Salesforce
  app.post("/api/auth/salesforce/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { salesforceConfigService } = await import('../salesforce/index.js');

      await salesforceConfigService.disconnectUser(userId);
      clearSalesforceUserCheck(userId);

      res.json({ message: "Salesforce disconnected successfully" });
    } catch (error: any) {
      console.error("Error disconnecting Salesforce:", error);
      res.status(500).json({ message: "Failed to disconnect Salesforce" });
    }
  });

  // GET /api/salesforce/opportunities/by-account - Get opportunities filtered by account name
  app.get("/api/salesforce/opportunities/by-account", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { accountName } = req.query;

      if (!accountName || typeof accountName !== 'string') {
        return res.status(400).json({ message: "accountName query param is required" });
      }

      const session = await salesforceProvider.connectForUser(userId);
      if (!session) {
        return res.status(401).json({ message: "Salesforce not connected" });
      }
      res.json({ opportunities: await session.opportunitiesForAccount(accountName) });
    } catch (error: any) {
      console.error("Error fetching Salesforce opportunities by account:", error);
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ message: "Salesforce not connected" });
      }
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  // GET /api/salesforce/evaluations/by-opportunity - Get evaluation records linked to an opportunity
  app.get("/api/salesforce/evaluations/by-opportunity", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.session.user.id;
      const { opportunityId } = req.query;

      if (!opportunityId || typeof opportunityId !== 'string') {
        return res.status(400).json({ message: "opportunityId query param is required" });
      }
      // Only a Salesforce id may reach the SOQL.
      if (!isSalesforceId(opportunityId)) {
        return res.status(400).json({ message: "opportunityId must be a 15 or 18 character Salesforce id" });
      }

      const session = await salesforceProvider.connectForUser(userId);
      if (!session) {
        return res.status(401).json({ message: "Salesforce not connected" });
      }
      res.json({ evaluations: await session.validationRecordsForOpportunity(opportunityId) });
    } catch (error: any) {
      console.error("Error fetching Salesforce evaluations by opportunity:", error);
      if (error instanceof Error && error.message.includes('not connected')) {
        return res.status(401).json({ message: "Salesforce not connected" });
      }
      res.status(500).json({ message: "Failed to fetch evaluations" });
    }
  });
}
