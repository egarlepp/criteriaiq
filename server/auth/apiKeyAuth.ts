// Bearer-token authentication middleware for API key access (n8n integration, migration 056).
//
// Placement: registered as app-level middleware in server/routes.ts createApp(),
// before all route registrations. Runs on every request.
//
// Behaviour:
//   • If no "Authorization: Bearer <token>" header → call next() immediately
//     so session-based auth proceeds as normal. Zero cost.
//   • If Bearer token present:
//       1. Extract the 8-char display prefix from the token.
//       2. Load candidate keys from DB by prefix + isActive=true.
//       3. bcrypt-compare the full token against each candidate's hash.
//       4. On match: set req.session.user to a synthetic admin user so the
//          existing isAuthenticated + req.session.user.role checks in all
//          route handlers work without modification.
//          Also set req.apiKeyContext for scope enforcement on opt-in routes.
//       4b. Before that, checkApiKeyAccess() (./apiKeyScopes.ts) enforces the
//          key's scopes against the request path; a miss is a 403.
//          Fire-and-forget: update last_used_at.
//       5. On no match: return 401 immediately (don't fall through to session,
//          since the caller explicitly signalled API-key intent).
//
// req.apiKeyContext shape:
//   { keyId: number, label: string, scopes: string[] }
//
// Scope helper — requireApiKeyScope(scope):
//   Express middleware that ensures the request was API-key-authenticated AND
//   the key includes either 'admin' or the specific scope string.

import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { apiKeys } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { checkApiKeyAccess } from "./apiKeyScopes";

export const apiKeyAuth: RequestHandler = async (req: any, res, next) => {
  const authHeader = req.headers["authorization"] as string | undefined;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(); // Not an API-key request — let session auth handle it
  }

  const token = authHeader.slice(7).trim();
  if (!token) return next();

  try {
    // Prefix = first 8 chars of the raw token (stored as key_prefix for fast lookup)
    const prefix = token.slice(0, 8);

    const candidates = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.keyPrefix, prefix), eq(apiKeys.isActive, true)));

    for (const candidate of candidates) {
      const match = await bcrypt.compare(token, candidate.keyHash);
      if (!match) continue;

      // Check expiry
      if (candidate.expiresAt && candidate.expiresAt < new Date()) {
        continue;
      }

      // Derive the effective session role from the key's declared
      // scopes. The previous implementation unconditionally set
      // `role: "Admin"` regardless of scope — meaning every active
      // API key passed every admin-gated endpoint's
      // `req.session.user.role === 'Admin'` check (the scopes column
      // was decorative in practice; only `requireApiKeyScope()`-
      // protected routes actually consulted it). Architect security
      // review finding #4.
      //
      // Now: a key only becomes a session-Admin if it explicitly
      // carries the `admin` scope. Anything else gets the
      // synthetic role `"ApiKey"`, which fails the role-check on
      // every admin endpoint and forces narrower routes to opt in
      // via `requireApiKeyScope()`.
      const scopes = (candidate.scopes as string[]) ?? [];
      const sessionRole = scopes.includes("admin") ? "Admin" : "ApiKey";

      // Per-route scope enforcement (see ./apiKeyScopes.ts). Identity,
      // credential and secret surfaces are refused for every key,
      // including legacy `admin` keys; non-admin keys must carry the
      // scope the path maps to, and unmapped paths are denied.
      const decision = checkApiKeyAccess(scopes, req.method, req.path);
      if (!decision.allowed) {
        return res.status(403).json({ message: decision.message });
      }

      // Set synthetic session user so isAuthenticated + role checks pass
      req.session = req.session ?? {};
      req.session.user = {
        id: `apikey:${candidate.id}`,
        email: `apikey:${candidate.label}`,
        role: sessionRole,
        firstName: "API",
        lastName: "Key",
        isActive: true,
        isApproved: true,
      };

      // Expose key context for optional scope enforcement
      req.apiKeyContext = {
        keyId: candidate.id,
        label: candidate.label,
        scopes,
      };

      // Fire-and-forget: record last usage time
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, candidate.id))
        .catch((e: any) =>
          console.error("[apiKeyAuth] last_used_at update failed:", e)
        );

      return next();
    }

    // Token provided but no valid match → reject outright
    return res.status(401).json({ message: "Invalid or revoked API key" });
  } catch (err) {
    // Fail closed. The previous behaviour (`return next()`) let the
    // request continue under whatever auth the rest of the chain
    // resolved, which during a DB outage could land at a route that
    // treats `req.session.user === undefined` as anonymous-public
    // — effectively bypassing the Bearer token check. The contract
    // for this middleware is: "Bearer present and invalid ⇒ 401",
    // and a DB-error path that can't determine validity must be
    // treated as invalid, not as if no token were sent. Architect
    // security review finding #9.
    console.error("[apiKeyAuth] unexpected error:", err);
    return res.status(401).json({ message: "API key verification failed" });
  }
};

/**
 * Route-level middleware: ensures the request was authenticated via an API key
 * AND that the key carries the required scope (or 'admin' which grants all).
 *
 * Usage:
 *   app.post("/api/n8n/trigger", isAuthenticated, requireApiKeyScope("automation:execute"), handler);
 */
export function requireApiKeyScope(scope: string): RequestHandler {
  return (req: any, res, next) => {
    if (!req.apiKeyContext) {
      return res
        .status(403)
        .json({ message: "API key authentication required for this endpoint" });
    }
    const scopes = (req.apiKeyContext.scopes as string[]) ?? [];
    if (scopes.includes("admin") || scopes.includes(scope)) {
      return next();
    }
    return res
      .status(403)
      .json({ message: `API key missing required scope: ${scope}` });
  };
}
