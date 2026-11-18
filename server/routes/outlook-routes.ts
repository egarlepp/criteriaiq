// Per-user Outlook sign-in, ported from ImpactIQ's /auth/microsoft routes.
//
//   GET    /api/admin/outlook-signin        — Admin; the Entra app summary (never the secret)
//   PUT    /api/admin/outlook-signin        — Admin; { tenantId, clientId, clientSecret?, enabled },
//                                             checked with Microsoft before it is saved
//   DELETE /api/admin/outlook-signin        — Admin; removes the app and every person's link
//   GET    /api/outlook/me                  — signed-in user; their own Outlook link
//   GET    /api/auth/microsoft/connect      — internal user; redirect to Microsoft sign-in
//   GET    /api/auth/microsoft/callback     — Microsoft's redirect back; checks the session's state
//   POST   /api/auth/microsoft/disconnect   — signed-in user; removes their own link
//
// The callback only stores tokens for the person whose session started the
// sign-in: the one-time state lives in that session, so a forged link or a
// code from someone else's sign-in is refused (same rule as the Salesforce
// sign-in in salesforce-integration-routes.ts).
import crypto from "crypto";
import type { Express, NextFunction, Request, Response } from "express";
import { isAuthenticated } from "../auth/simpleAuth";
import { encryptText } from "../auth/mfaUtils";
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { outlookSigninSaveSchema, type OutlookErrorCode } from "@shared/outlook";
import {
  getActiveOutlookSigninConfig,
  getOutlookSigninConfig,
  getOutlookSigninSummary,
  outlookRedirectUri,
  saveOutlookSigninConfig,
} from "../outlook/config";
import { syncOutlookScheduleForUser } from "../services/outlook-schedule-sync";
import {
  removeAllOutlookMapDueDates,
  removeOutlookMapDueDatesForUser,
  syncOutlookMapDueDatesForUser,
} from "../services/outlook-map-due-dates";
import { buildAuthorizeUrl, exchangeCode, MicrosoftAuthError, readMailbox, verifyAppCredentials } from "../outlook/oauth";
import { clearOutlookUserCheck, getMyOutlookConnection } from "../outlook/user-connection";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

// Back to the app with Profile Settings open on Integrations; the sidebar
// reads ?outlook= and shows the result as a toast. Never any error text.
const PROFILE_INTEGRATIONS = "/?profile=integrations";

type SessionUser = { id?: string; role?: string | null; email?: string | null; firstName?: string | null; lastName?: string | null };
type OutlookOAuthState = { value: string; userId: string; issuedAt: number };
type SessionWithOutlook = { user?: SessionUser; outlookOAuthState?: OutlookOAuthState };

function session(req: Request): SessionWithOutlook | undefined {
  return (req as Request & { session?: SessionWithOutlook }).session;
}

function stateMatches(expected: string, given: unknown): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = session(req)?.user;
  if (!user) return res.status(401).json({ message: "Authentication required", errorCode: "unknown" });
  if (user.role !== "Admin") return res.status(403).json({ message: "Admin role required", errorCode: "unknown" });
  return next();
}

/** Never throws; the change is already saved. */
async function recordOutlookAppEvent(req: Request, eventType: "outlook_signin_saved" | "outlook_signin_removed", subject: string): Promise<void> {
  const actor = session(req)?.user;
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
    console.error("[outlook] could not write audit row:", error);
  }
}

function adminError(res: Response, status: number, errorCode: OutlookErrorCode, message: string) {
  return res.status(status).json({ message, errorCode });
}

export function registerOutlookRoutes(app: Express) {
  app.get("/api/admin/outlook-signin", isAuthenticated, requireAdmin, async (_req, res) => {
    try {
      res.json(await getOutlookSigninSummary());
    } catch (error) {
      console.error("[outlook] summary failed:", error);
      adminError(res, 500, "unknown", "Failed to load Outlook sign-in");
    }
  });

  app.put("/api/admin/outlook-signin", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const parsed = outlookSigninSaveSchema.safeParse(req.body ?? {});
      if (!parsed.success) return adminError(res, 400, "invalid", "Invalid Outlook sign-in settings");
      const existing = await getOutlookSigninConfig();
      const clientSecret = parsed.data.clientSecret ?? existing?.clientSecret;
      if (!clientSecret) return adminError(res, 400, "invalid", "A client secret is required");

      // An app or secret Microsoft refuses never replaces one that works.
      try {
        await verifyAppCredentials({ ...parsed.data, clientSecret, readWorkingHours: false, writeMapDueDates: false });
      } catch (error) {
        if (error instanceof MicrosoftAuthError) {
          return adminError(res, 400, "credentials_rejected", "Microsoft refused the tenant, client ID or secret");
        }
        console.warn("[outlook] could not reach Microsoft:", error instanceof Error ? error.message : error);
        return adminError(res, 502, "unreachable", "Could not reach Microsoft");
      }

      await saveOutlookSigninConfig(parsed.data, session(req)?.user?.id ?? null);
      if (existing?.readWorkingHours && parsed.data.readWorkingHours === false) await storage.clearOutlookWorkDays();
      // Switching MAP due dates off takes CriteriaIQ's events back out of
      // everyone's Outlook; switching on writes them for those who can.
      if (existing?.writeMapDueDates && parsed.data.writeMapDueDates === false) void removeAllOutlookMapDueDates();
      if (!existing?.writeMapDueDates && parsed.data.writeMapDueDates === true) {
        void (async () => {
          for (const id of await storage.listOutlookConnectedUserIds()) await syncOutlookMapDueDatesForUser(id);
        })().catch((error: unknown) => console.warn("[outlook] first due-date sync failed:", error));
      }
      // A new app makes every cached check meaningless.
      clearOutlookUserCheck();
      await recordOutlookAppEvent(req, "outlook_signin_saved", `${parsed.data.tenantId} / ${parsed.data.clientId}`);
      res.json(await getOutlookSigninSummary());
    } catch (error) {
      console.error("[outlook] save failed:", error);
      adminError(res, 500, "unknown", "Failed to save Outlook sign-in");
    }
  });

  app.delete("/api/admin/outlook-signin", isAuthenticated, requireAdmin, async (req, res) => {
    try {
      const existing = await getOutlookSigninConfig();
      await storage.deleteOutlookSigninConfigRow();
      // Tokens issued to the removed app would never be refreshable again.
      await storage.deleteAllOutlookTokens();
      await storage.clearOutlookSchedules();
      // Without tokens the events can't be removed; turning the switch off
      // first removes them (docs/features/working-calendar.md).
      await storage.deleteOutlookMapEventRows();
      clearOutlookUserCheck();
      await recordOutlookAppEvent(req, "outlook_signin_removed", existing ? `${existing.tenantId} / ${existing.clientId}` : "");
      res.json(await getOutlookSigninSummary());
    } catch (error) {
      console.error("[outlook] remove failed:", error);
      adminError(res, 500, "unknown", "Failed to remove Outlook sign-in");
    }
  });

  app.get("/api/outlook/me", isAuthenticated, async (req, res) => {
    const user = session(req)?.user;
    if (!user?.id) return res.status(401).json({ message: "Not signed in" });
    try {
      res.json(await getMyOutlookConnection({ id: user.id, role: user.role }));
    } catch (error) {
      console.error("[outlook] my connection failed:", error);
      res.status(500).json({ message: "Failed to read your Outlook connection" });
    }
  });

  app.get("/api/auth/microsoft/connect", isAuthenticated, async (req, res) => {
    const s = session(req);
    const user = s?.user;
    if (!s || !user?.id) return res.redirect(PROFILE_INTEGRATIONS + "&outlook=error");
    if (isExternalRole(user.role)) return res.status(403).json({ message: "Outlook sign-in is for internal users" });
    try {
      const config = await getActiveOutlookSigninConfig();
      if (!config) return res.redirect(PROFILE_INTEGRATIONS + "&outlook=unavailable");
      const state = crypto.randomBytes(24).toString("base64url");
      s.outlookOAuthState = { value: state, userId: user.id, issuedAt: Date.now() };
      res.redirect(buildAuthorizeUrl(config, { state, redirectUri: outlookRedirectUri(), loginHint: user.email }));
    } catch (error) {
      console.error("[outlook] could not start sign-in:", error);
      res.redirect(PROFILE_INTEGRATIONS + "&outlook=error");
    }
  });

  app.get("/api/auth/microsoft/callback", async (req, res) => {
    const s = session(req);
    const expected = s?.outlookOAuthState;
    if (s) delete s.outlookOAuthState;
    try {
      if (typeof req.query.error === "string") {
        // The person cancelled, or their directory refused consent.
        console.warn("[outlook] sign-in returned an error:", req.query.error);
        return res.redirect(PROFILE_INTEGRATIONS + "&outlook=error");
      }
      const code = req.query.code;
      const user = s?.user;
      if (
        typeof code !== "string" || code.length === 0 || code.length > 4000 ||
        !expected || !user?.id || user.id !== expected.userId ||
        !stateMatches(expected.value, req.query.state) ||
        Date.now() - expected.issuedAt > OAUTH_STATE_TTL_MS
      ) {
        return res.redirect(PROFILE_INTEGRATIONS + "&outlook=expired");
      }
      const config = await getActiveOutlookSigninConfig();
      if (!config) return res.redirect(PROFILE_INTEGRATIONS + "&outlook=unavailable");

      const tokens = await exchangeCode(config, code, outlookRedirectUri());
      if (!tokens.refreshToken) {
        // Without offline_access the link would stop working within the hour.
        console.warn("[outlook] Microsoft returned no refresh token");
        return res.redirect(PROFILE_INTEGRATIONS + "&outlook=error");
      }
      const accountLabel = await readMailbox(tokens.accessToken).catch(() => null);
      await storage.saveOutlookTokens(expected.userId, {
        accessTokenEnc: encryptText(tokens.accessToken),
        refreshTokenEnc: encryptText(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        accountLabel,
      });
      clearOutlookUserCheck(expected.userId);
      // Bring in their out-of-office days now rather than at the next daily run.
      void syncOutlookScheduleForUser(expected.userId);
      void syncOutlookMapDueDatesForUser(expected.userId);
      res.redirect(PROFILE_INTEGRATIONS + "&outlook=connected");
    } catch (error) {
      console.error("[outlook] sign-in failed:", error instanceof Error ? error.message : error);
      res.redirect(PROFILE_INTEGRATIONS + "&outlook=error");
    }
  });

  app.post("/api/auth/microsoft/disconnect", isAuthenticated, async (req, res) => {
    const user = session(req)?.user;
    if (!user?.id) return res.status(401).json({ message: "Not signed in" });
    try {
      // Take CriteriaIQ's due-date events out of their Outlook while the token still works.
      await removeOutlookMapDueDatesForUser(user.id);
      await storage.deleteOutlookTokens(user.id);
      await storage.clearOutlookSchedules(user.id);
      clearOutlookUserCheck(user.id);
      res.json({ message: "Outlook disconnected" });
    } catch (error) {
      console.error("[outlook] disconnect failed:", error);
      res.status(500).json({ message: "Failed to disconnect Outlook" });
    }
  });
}
