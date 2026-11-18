// Microsoft identity platform calls for Outlook sign-in (authorization code
// flow with a client secret, delegated permissions), ported from ImpactIQ's
// services/auth/microsoft.ts. Every call goes to the fixed
// login.microsoftonline.com / graph.microsoft.com hosts; the only value
// that reaches a URL path is the tenant, checked by isValidOutlookTenant.
import { isValidOutlookTenant, outlookAuthorizeScopes, OUTLOOK_SCOPES } from "@shared/outlook";
import type { OutlookSigninConfig } from "./config";

const LOGIN_HOST = "https://login.microsoftonline.com";
const GRAPH_ME = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
const REQUEST_TIMEOUT_MS = 10_000;
// Store a token as expiring a minute early so a call never starts with one
// that runs out mid-request.
const EXPIRY_MARGIN_S = 60;

export type FetchFn = typeof fetch;

export interface MicrosoftTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

/** Microsoft refused the request. `revoked` = the refresh token or grant is dead, so the person must reconnect. */
export class MicrosoftAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly revoked: boolean,
  ) {
    super(message);
    this.name = "MicrosoftAuthError";
  }
}

function tenantPath(config: OutlookSigninConfig): string {
  if (!isValidOutlookTenant(config.tenantId)) throw new MicrosoftAuthError("Invalid tenant", "invalid_tenant", false);
  return `${LOGIN_HOST}/${encodeURIComponent(config.tenantId)}/oauth2/v2.0`;
}

export function buildAuthorizeUrl(
  config: OutlookSigninConfig,
  opts: { state: string; redirectUri: string; loginHint?: string | null },
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: outlookAuthorizeScopes(config.readWorkingHours, config.writeMapDueDates).join(" "),
    state: opts.state,
    prompt: "select_account",
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${tenantPath(config)}/authorize?${params.toString()}`;
}

// Errors from the token endpoint that mean the grant itself is gone (consent
// revoked, password reset, refresh token expired or already redeemed).
const REVOKED_ERRORS = new Set(["invalid_grant", "interaction_required", "consent_required", "login_required"]);

async function tokenRequest(config: OutlookSigninConfig, body: Record<string, string>, fetchFn: FetchFn): Promise<MicrosoftTokens> {
  const res = await fetchFn(`${tenantPath(config)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: OUTLOOK_SCOPES.join(" "),
      ...body,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    error?: unknown;
    error_description?: unknown;
  };
  if (!res.ok || typeof json.access_token !== "string") {
    const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
    // Only the error code is kept: Microsoft's description can echo request details.
    throw new MicrosoftAuthError(`Microsoft token request failed (${code})`, code, REVOKED_ERRORS.has(code));
  }
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : Number(json.expires_in) || 3600;
  return {
    accessToken: json.access_token,
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    expiresAt: new Date(Date.now() + Math.max(expiresIn - EXPIRY_MARGIN_S, 60) * 1000),
  };
}

export function exchangeCode(
  config: OutlookSigninConfig,
  code: string,
  redirectUri: string,
  fetchFn: FetchFn = fetch,
): Promise<MicrosoftTokens> {
  return tokenRequest(config, { grant_type: "authorization_code", code, redirect_uri: redirectUri }, fetchFn);
}

export function refreshTokens(config: OutlookSigninConfig, refreshToken: string, fetchFn: FetchFn = fetch): Promise<MicrosoftTokens> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchFn);
}

/**
 * The mailbox the token belongs to (Graph /me). Throws MicrosoftAuthError
 * with revoked=true on a 401, so a dead token reads as "Reconnect needed".
 */
export async function readMailbox(accessToken: string, fetchFn: FetchFn = fetch): Promise<string | null> {
  const res = await fetchFn(GRAPH_ME, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.status === 401) throw new MicrosoftAuthError("Microsoft refused the token", "unauthorized", true);
  if (!res.ok) throw new MicrosoftAuthError(`Microsoft Graph request failed (${res.status})`, `http_${res.status}`, false);
  const me = (await res.json().catch(() => ({}))) as { mail?: unknown; userPrincipalName?: unknown };
  if (typeof me.mail === "string" && me.mail.trim()) return me.mail.trim();
  if (typeof me.userPrincipalName === "string" && me.userPrincipalName.trim()) return me.userPrincipalName.trim();
  return null;
}

/**
 * Checks the tenant, client id and secret before an admin's save replaces
 * working ones: asks for an app-only token, which Microsoft hands out for
 * any valid app and secret even with no application permissions granted.
 * The token is thrown away. Skipped for "organizations", which has no
 * directory to issue one.
 */
export async function verifyAppCredentials(config: OutlookSigninConfig, fetchFn: FetchFn = fetch): Promise<void> {
  // An app-only token needs a real directory; "organizations" can't issue one.
  if (config.tenantId.toLowerCase() === "organizations") return;
  const res = await fetchFn(`${tenantPath(config)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (res.ok) return;
  const json = (await res.json().catch(() => ({}))) as { error?: unknown };
  const code = typeof json.error === "string" ? json.error : `http_${res.status}`;
  throw new MicrosoftAuthError(`Microsoft refused the app (${code})`, code, false);
}
