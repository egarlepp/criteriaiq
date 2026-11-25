// OIDC Single Sign-On (Okta SSO + Azure SSO) — public + admin routes.
//
// Two providers, configured on Admin › Integrations › Overview as in
// ImpactIQ: Okta (sso_config row 1) and Azure / Microsoft Entra ID
// (row 2). Both run the same openid-client authorization-code flow and
// the same account rules below; only issuer discovery, the external id
// claim and the email-verification rule differ (see PROVIDERS).
//
// Architectural contract (see also docs/guides/okta-setup.md):
//
//   1. Lookups are keyed on `(ssoProvider, ssoExternalId)` — never on
//      email. The id_token `sub` claim is the durable identifier and
//      email is mutable. Using email as the join key would let an
//      Okta admin take over an existing CriteriaIQ account by
//      reassigning the address (architect security review item #1 in
//      the plan).
//
//   2. A verified email is REQUIRED before any JIT-create or
//      existing-user link is allowed. Falling back to "trust the IdP"
//      without this check is the classic OIDC foot-gun — many IdPs
//      let users self-register an unverified email. Okta: the
//      `email_verified` claim. Entra does not send that claim, so for
//      Azure the email must be the user's UPN (`preferred_username`,
//      whose domain Entra only allows if the tenant verified it) or
//      carry `xms_edov: true`. Guest accounts (UPN `…#EXT#@…`) fail
//      this check by design.
//
//   3. Linking an existing password user to Okta is NOT automatic by
//      email match. The callback redirects to a confirmation page
//      (`/sso/link-account`) where the user must enter their
//      CriteriaIQ password to confirm the link. Without this an Okta
//      misconfig (or a dev tenant tied to the same email domain)
//      takes over a matching CriteriaIQ admin account.
//
//   4. Internal-only scope (v1): if the resolved CriteriaIQ role is
//      customer-facing (Customer/Guest/Partner), the login is
//      rejected with `external_role_not_eligible` and audited. The
//      Okta path is for internal users; customers continue
//      with password + MFA. Per-tenant customer SSO is a v2
//      follow-on.
//
//   5. Trust IdP MFA when the id_token's ACR claim asserts MFA. The
//      admin can flip the `requireMfaTrust` toggle in `sso_config` to
//      OFF to force the CriteriaIQ TOTP/WebAuthn gate to run on top
//      of Okta — defense-in-depth at the cost of extra friction.
//
//   6. Session fixation defense: after id_token verification but
//      before populating `req.session.user`, the session is
//      regenerated. This prevents an attacker who fixates a session
//      ID on a victim from inheriting the post-auth session.
//
//   7. PKCE with S256 + state + nonce + one-time-use. All three are
//      stored on the server-side session during /login, validated on
//      /callback, then DELETED so a browser-back replay cannot
//      re-execute the callback. This holds even though the client
//      authenticates with a real client_secret — PKCE on top of
//      client_secret is defense-in-depth and costs nothing.
//
//   8. Log redaction: `code`, `id_token`, `access_token`, and
//      `refresh_token` must NEVER appear in logs (including
//      DEBUG_AUTH=true). `safeLog` below scrubs them; the global
//      log redactor in server/lib/logger.ts (or equivalent)
//      provides defense-in-depth for any spot we forgot.
//
//   9. `SSO_DISABLE=true` env override forces the routes to behave as
//      if SSO is disabled regardless of the DB row. Pure escape hatch
//      for an emergency redeploy where the DB row's `enabled` toggle
//      is unreachable.
//
//  10. Rate limits: /api/auth/sso/login uses a per-IP bucket so an
//      attacker can't flood the OIDC redirect path with state/nonce
//      generation. /api/auth/sso/callback uses a tighter per-IP
//      bucket so failed code-exchange bursts don't establish a
//      side-channel.
//
//  11. CSRF: the /callback routes are exempted from the double-submit
//      cookie check in server/lib/csrf.ts because the `state`
//      parameter (a one-time-use server-stored token) IS the CSRF
//      defense for this leg. Adding the double-submit cookie on top
//      would require Okta to know about it.

import type { Express, RequestHandler, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  discovery,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  buildEndSessionUrl,
  calculatePKCECodeChallenge,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  ClientSecretBasic,
  type Configuration,
} from "openid-client";

import { storage } from "../storage";
import { decryptText, encryptText, checkRateLimit, recordAttemptResult } from "./mfaUtils";
import {
  recordSuccessfulLogin,
  recordFailedLogin,
  loginRateLimitKeys,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL,
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP,
  LOGIN_RATE_LIMIT_WINDOW_MS,
  LOGIN_RATE_LIMIT_REASON,
} from "./simpleAuth";
import { parkSsoMfaChallenge, ssoMfaPendingHandler } from "./ssoMfaHandoff";
import { getPublicAppUrl } from "../lib/app-config";
import { isSsoProvider, SSO_PROVIDERS } from "@shared/schema";
import { parseTeamGroupMapping, targetsFromGroups, teamGroupMappingSchema, type TeamGroupMapping } from "@shared/teams";
import type { SsoConfig, SsoProvider, User } from "@shared/schema";
import { trimTrailingChar } from "@shared/trim-edge";

// ---------------------------------------------------------------------------
// Configuration & constants
// ---------------------------------------------------------------------------

/**
 * Internal roles eligible for the Okta path in v1. Resolved from the
 * group→role mapping. Anything not on this list (Customer, Guest,
 * Partner) is rejected at the callback even if the Okta side allowed
 * the user in.
 */
const INTERNAL_ROLES = ["Admin", "Manager", "Engineer", "CX", "Sales", "Support"] as const;

/**
 * Precedence used when a user's Okta groups map to MULTIPLE
 * CriteriaIQ roles. Highest-precedence wins. Order matters: more
 * privileged roles come first.
 */
const ROLE_PRECEDENCE = ["Admin", "Manager", "Engineer", "CX", "Sales", "Support"] as const;

const SSO_LOGIN_RATE_LIMIT_MAX = 30;
const SSO_CALLBACK_RATE_LIMIT_MAX = 10;
const SSO_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

interface ProviderMeta {
  /** Shown on the login button and in messages. */
  label: string;
  loginPath: string;
  callbackPath: string;
}

const PROVIDERS: Record<SsoProvider, ProviderMeta> = {
  okta: { label: "Okta", loginPath: "/api/auth/sso/login", callbackPath: "/api/auth/sso/callback" },
  azure: { label: "Microsoft", loginPath: "/api/auth/sso/azure/login", callbackPath: "/api/auth/sso/azure/callback" },
};

/** Entra endpoints that accept any tenant; refused so the issuer is pinned to one directory. */
const AZURE_MULTI_TENANT = new Set(["common", "organizations", "consumers"]);
const AZURE_AUTHORITY = "https://login.microsoftonline.com";

const REDACT_KEYS = new Set([
  "code",
  "id_token",
  "access_token",
  "refresh_token",
  "client_secret",
  "clientSecretEnc",
  "code_verifier",
]);


// ---------------------------------------------------------------------------
// In-memory OIDC Configuration cache
// ---------------------------------------------------------------------------

/**
 * The OIDC Configuration (from `openid-client`) is cached per provider
 * keyed on the (issuer source, clientId, scopes, clientSecret) tuple so
 * a config save invalidates ONLY when one of those fields actually
 * changed. Discovery costs ~200ms; doing it on every login would be
 * gratuitous.
 *
 * `loadOidcConfiguration()` returns null when the provider is not
 * configured or `SSO_DISABLE=true`. Callers should treat that as
 * "feature off".
 */
type CachedConfig = {
  config: Configuration;
  fingerprint: string;
};
const cachedOidcConfig = new Map<SsoProvider, CachedConfig>();

function isSsoEnvDisabled(): boolean {
  const raw = process.env.SSO_DISABLE;
  return typeof raw === "string" && raw.toLowerCase() === "true";
}

function configFingerprint(row: SsoConfig): string {
  return [row.issuerUrl ?? "", row.tenantId ?? "", row.clientId ?? "", row.scopes, row.clientSecretEnc ?? ""].join("|");
}

/** Enough is saved to attempt discovery (says nothing about `enabled`). */
function hasProviderSettings(row: SsoConfig): boolean {
  const issuerSource = row.provider === "azure" ? row.tenantId : row.issuerUrl;
  return !!(issuerSource && row.clientId && row.clientSecretEnc);
}

/** "your-org.okta.com" or "https://your-org.okta.com/" → "https://your-org.okta.com". */
function normalizeOktaDomain(raw: string): string {
  const trimmed = trimTrailingChar(raw.trim(), "/");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Issuer URLs to try, in order. Okta: a value with a path (a custom
 * authorization server, `/oauth2/<id>`) is used as-is; a bare domain
 * tries the org authorization server first (what earlier CriteriaIQ
 * versions used) and then `/oauth2/default`, which some developer orgs
 * expose instead (ImpactIQ's discovery order, reversed to keep existing
 * installs on the same issuer). Azure: the tenant's v2.0 issuer; a
 * domain-form tenant is resolved to its GUID issuer first because
 * openid-client requires the discovered issuer to equal the URL.
 */
export async function issuerCandidates(row: SsoConfig): Promise<URL[]> {
  if (row.provider === "azure") {
    const tenant = (row.tenantId ?? "").trim();
    const issuer = `${AZURE_AUTHORITY}/${encodeURIComponent(tenant)}/v2.0`;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenant)) {
      return [new URL(issuer)];
    }
    const res = await fetch(`${issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Azure tenant discovery failed (${res.status})`);
    const doc = (await res.json()) as { issuer?: unknown };
    if (typeof doc.issuer !== "string" || !doc.issuer.startsWith(`${AZURE_AUTHORITY}/`)) {
      throw new Error("Azure tenant discovery returned an unexpected issuer");
    }
    return [new URL(doc.issuer)];
  }
  const base = normalizeOktaDomain(row.issuerUrl ?? "");
  const url = new URL(base);
  if (url.pathname && url.pathname !== "/") return [url];
  return [new URL(base), new URL(`${base}/oauth2/default`)];
}

async function loadOidcConfiguration(
  provider: SsoProvider,
  opts: { requireEnabled?: boolean } = {},
): Promise<{ config: Configuration; row: SsoConfig } | null> {
  if (isSsoEnvDisabled()) return null;

  const row = await storage.getSsoConfig(provider);
  if ((opts.requireEnabled !== false && !row.enabled) || !hasProviderSettings(row)) {
    return null;
  }

  let clientSecret: string;
  try {
    clientSecret = decryptText(row.clientSecretEnc!);
  } catch (err) {
    console.error("[sso] %s: failed to decrypt client secret — disabling until resaved:", provider, err);
    return null;
  }

  const fingerprint = configFingerprint(row);
  const cached = cachedOidcConfig.get(provider);
  if (cached && cached.fingerprint === fingerprint) {
    return { config: cached.config, row };
  }

  let candidates: URL[];
  try {
    candidates = await issuerCandidates(row);
  } catch (err) {
    console.error("[sso] %s: issuer resolution failed:", provider, redactError(err));
    return null;
  }

  for (const issuer of candidates) {
    try {
      const config = await discovery(
        issuer,
        row.clientId!,
        // ClientMetadata is optional in 6.x; openid-client infers from
        // the discovery doc + our explicit ClientSecretBasic.
        undefined,
        ClientSecretBasic(clientSecret),
      );
      cachedOidcConfig.set(provider, { config, fingerprint });
      return { config, row };
    } catch (err) {
      console.error("[sso] %s: OIDC discovery failed for %s%s:", provider, issuer.origin, issuer.pathname, redactError(err));
    }
  }
  return null;
}

export function invalidateOidcConfigCache(provider?: SsoProvider): void {
  if (provider) cachedOidcConfig.delete(provider);
  else cachedOidcConfig.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDefaultRedirectUri(provider: SsoProvider): string {
  const base = trimTrailingChar(getPublicAppUrl(), "/");
  return `${base}${PROVIDERS[provider].callbackPath}`;
}

/** The admin's override when set, else derived from PUBLIC_APP_URL. */
function getRedirectUri(provider: SsoProvider, row: Pick<SsoConfig, "redirectUri">): string {
  return row.redirectUri || getDefaultRedirectUri(provider);
}

function isInternalRole(role: string | null | undefined): boolean {
  return !!role && (INTERNAL_ROLES as readonly string[]).includes(role);
}

function resolveRoleFromGroups(
  groups: unknown,
  mapping: Record<string, string>,
  defaultRole: string,
): string {
  const list = Array.isArray(groups) ? groups.filter((g): g is string => typeof g === "string") : [];
  const matched = new Set<string>();
  for (const g of list) {
    const role = mapping[g];
    if (role) matched.add(role);
  }
  for (const role of ROLE_PRECEDENCE) {
    if (matched.has(role)) return role;
  }
  return defaultRole;
}

/**
 * Group → Team table: puts the person on the teams and subteams their groups
 * map to and takes them off SSO-added ones their groups no longer map to.
 * Teams an admin added by hand are never removed. Teams only organize
 * people and never grant access, so a failure here never blocks sign-in.
 */
export async function syncTeamsFromGroups(provider: SsoProvider, userId: string, groups: unknown, rawMapping: unknown): Promise<void> {
  try {
    const targets = targetsFromGroups(groups, parseTeamGroupMapping(rawMapping));
    const result = await storage.syncSourcedTeams(userId, "sso", targets, { removeStale: true });
    if (result.added > 0 || result.removed > 0) {
      safeLog("Teams updated from IdP groups", { provider, userId, ...result });
    }
  } catch (err) {
    safeLog("Team sync from IdP groups failed", { provider, userId, err: redactError(err) });
  }
}

/** Unknown teams, and subteams outside their row's team, are refused. */
export async function checkTeamMapping(rows: TeamGroupMapping[]): Promise<string | null> {
  if (rows.length === 0) return null;
  const teams = await storage.listTeams();
  for (const row of rows) {
    const team = teams.find((t) => t.id === row.teamId);
    if (!team) return `Unknown team for group "${row.group}"`;
    if (row.subteamId !== null && !team.subteams.some((s) => s.id === row.subteamId)) {
      return `The subteam for group "${row.group}" is not part of ${team.name}`;
    }
  }
  return null;
}

function getClientIp(req: Request): string {
  return (req.ip || (req as any).connection?.remoteAddress || "unknown") as string;
}

function safeLog(message: string, meta: Record<string, unknown> = {}): void {
  const scrubbed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    scrubbed[k] = REDACT_KEYS.has(k) ? "[REDACTED]" : v;
  }
  console.log("[sso] %s", message, scrubbed);
}

function redactError(err: unknown): unknown {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      // Stack traces from openid-client occasionally include URL
      // fragments with the code/token in failure paths. Strip them.
      stack: err.stack?.replace(/(code|id_token|access_token|refresh_token)=[^&\s]+/g, "$1=[REDACTED]"),
    };
  }
  return err;
}

function emailDomain(email: string): string | null {
  const at = email.indexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase();
}

function buildSsoErrorUrl(provider: SsoProvider, reason: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ reason, provider, ...(extra ?? {}) });
  return `/sso/error?${params.toString()}`;
}

/**
 * The IdP's durable user id and verified email. Okta: `sub` and
 * `email` + `email_verified`. Azure: `oid` (stable for the user across
 * every app in the tenant; `sub` is per-app) and the email rule in
 * contract #2 above.
 */
export function readIdentity(
  provider: SsoProvider,
  claims: Record<string, unknown>,
): { externalId: string; email: string; emailVerified: boolean } {
  const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
  if (provider === "azure") {
    const upn = lower(claims.preferred_username);
    const email = lower(claims.email) || upn;
    const emailVerified =
      claims.email_verified === true || claims.xms_edov === true || (!!upn && email === upn && !upn.includes("#ext#"));
    const oid = typeof claims.oid === "string" && claims.oid ? claims.oid : String(claims.sub);
    return { externalId: oid, email, emailVerified };
  }
  return { externalId: String(claims.sub), email: lower(claims.email), emailVerified: claims.email_verified === true };
}

// ---------------------------------------------------------------------------
// Route handlers — public
// ---------------------------------------------------------------------------

/**
 * Public — the landing page calls this on render to decide which
 * "Continue with …" buttons to show (one per enabled provider). Does
 * NOT leak client secrets or any internal state. `providerName` /
 * `providerLabel` describe the first enabled provider, for clients
 * that predate Azure SSO.
 */
const statusHandler: RequestHandler = async (_req, res) => {
  try {
    const envDisabled = isSsoEnvDisabled();
    const rows = await Promise.all(SSO_PROVIDERS.map((p) => storage.getSsoConfig(p)));
    const providers = envDisabled
      ? []
      : rows
          .filter((row) => row.enabled && hasProviderSettings(row) && isSsoProvider(row.provider))
          .map((row) => {
            const provider = row.provider as SsoProvider;
            return { name: provider, label: PROVIDERS[provider].label, loginUrl: PROVIDERS[provider].loginPath };
          });
    res.json({
      enabled: providers.length > 0,
      providers,
      providerName: providers[0]?.name ?? "okta",
      providerLabel: providers[0]?.label ?? PROVIDERS.okta.label,
    });
  } catch (err) {
    console.error("[sso] Failed to read SSO status:", redactError(err));
    res.json({ enabled: false, providers: [], providerName: "okta", providerLabel: PROVIDERS.okta.label });
  }
};

/**
 * Public — kicks off the OIDC redirect. Generates state, nonce, and
 * a PKCE verifier/challenge pair, stores them on the session, then
 * redirects to the IdP's authorization endpoint.
 *
 * Rate-limited per-IP (30 / 15 min) so an attacker can't flood the
 * endpoint to consume session storage or fingerprint the IdP setup.
 */
function makeLoginHandler(provider: SsoProvider): RequestHandler {
  return async (req: any, res) => {
    const ip = getClientIp(req);
    const bucket = `sso_login:ip:${ip}`;
    const within = await checkRateLimit(bucket, SSO_LOGIN_RATE_LIMIT_MAX, SSO_RATE_LIMIT_WINDOW_MS);
    if (!within) {
      return res.redirect(buildSsoErrorUrl(provider, "rate_limited"));
    }
    await recordAttemptResult(bucket, false, SSO_RATE_LIMIT_WINDOW_MS);

    const loaded = await loadOidcConfiguration(provider);
    if (!loaded) {
      return res.redirect(buildSsoErrorUrl(provider, "sso_disabled"));
    }
    const { config, row } = loaded;

    const state = randomState();
    const nonce = randomNonce();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

    // Stash on the session — the callback validates against these and
    // then deletes the slot so a browser-back replay can't re-execute.
    // `provider` pins the callback to the IdP this flow started with.
    req.session.oidc = {
      provider,
      state,
      nonce,
      codeVerifier,
      createdAt: Date.now(),
    };

    const authUrl = buildAuthorizationUrl(config, {
      redirect_uri: getRedirectUri(provider, row),
      scope: row.scopes,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    safeLog("Redirecting to IdP", { provider, scope: row.scopes });
    return res.redirect(authUrl.toString());
  };
}

/**
 * Public — IdP redirects here with `code`, `state`. Validates the
 * exchange, resolves or JIT-creates the user, establishes the
 * session.
 *
 * Rate-limited per-IP (10 / 15 min) — failed code exchanges should
 * be rare; bursts indicate forged-callback probing.
 */
function makeCallbackHandler(provider: SsoProvider): RequestHandler {
  // Audit `login_method` values: "okta", "okta-mfa-skipped", …, "azure", …
  const method = (suffix?: string) => (suffix ? `${provider}-${suffix}` : provider);

  return async (req: any, res) => {
    const ip = getClientIp(req);
    const bucket = `sso_callback:ip:${ip}`;
    const within = await checkRateLimit(bucket, SSO_CALLBACK_RATE_LIMIT_MAX, SSO_RATE_LIMIT_WINDOW_MS);
    if (!within) {
      return res.redirect(buildSsoErrorUrl(provider, "rate_limited"));
    }

    const pending = req.session.oidc;
    // Flows started before Azure SSO existed carry no provider; they were Okta.
    const pendingProvider = pending?.provider ?? "okta";
    if (!pending || !pending.state || !pending.codeVerifier || !pending.nonce || pendingProvider !== provider) {
      await recordAttemptResult(bucket, false, SSO_RATE_LIMIT_WINDOW_MS);
      return res.redirect(buildSsoErrorUrl(provider, "callback_expired"));
    }

    // One-time use — clear the slot up front so browser-back / replay
    // can't re-execute even if the rest of this handler throws.
    delete req.session.oidc;

    const loaded = await loadOidcConfiguration(provider);
    if (!loaded) {
      return res.redirect(buildSsoErrorUrl(provider, "sso_disabled"));
    }
    const { config, row } = loaded;

    let tokens;
    try {
      // openid-client takes the redirect_uri for the token request from
      // this URL, so it must be the exact registered redirect URI plus
      // the IdP's query string.
      const currentUrl = new URL(getRedirectUri(provider, row));
      currentUrl.search = new URL(req.originalUrl, getPublicAppUrl()).search;
      tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        pkceCodeVerifier: pending.codeVerifier,
      });
    } catch (err) {
      await recordAttemptResult(bucket, false, SSO_RATE_LIMIT_WINDOW_MS);
      safeLog("OIDC token exchange failed", { provider, err: redactError(err) });
      await recordFailedLogin(req, { email: null }, method(), "idp_returned_error");
      return res.redirect(buildSsoErrorUrl(provider, "idp_returned_error"));
    }

    const claims = tokens.claims() as Record<string, unknown> | undefined;
    if (!claims) {
      await recordAttemptResult(bucket, false, SSO_RATE_LIMIT_WINDOW_MS);
      safeLog("OIDC token had no claims", { provider });
      return res.redirect(buildSsoErrorUrl(provider, "idp_returned_error"));
    }

    const { externalId, email, emailVerified } = readIdentity(provider, claims);
    const firstName = (claims.given_name as string | undefined) ?? "";
    const lastName = (claims.family_name as string | undefined) ?? "";
    const fullName = (claims.name as string | undefined) ?? "";
    const groupsClaim = claims[row.groupClaimName];
    const acrClaim = claims.acr;
    const amrClaim = claims.amr;

    if (!email) {
      await recordFailedLogin(req, { email: null }, method(), "no_email_claim");
      return res.redirect(buildSsoErrorUrl(provider, "idp_returned_error"));
    }
    if (!emailVerified) {
      await recordFailedLogin(req, { email }, method(), "email_not_verified");
      return res.redirect(buildSsoErrorUrl(provider, "email_not_verified"));
    }

    // Resolve or create the user.
    let user: User | undefined = await storage.findUserBySsoExternalId(provider, externalId);

    // Email-match path (existing user, no SSO link yet) — does NOT
    // auto-link. The user must confirm with their CriteriaIQ password
    // on /sso/link-account. We park the candidacy on the session and
    // redirect. A user already linked to a different SSO identity is refused:
    // one account carries one SSO identity.
    if (!user) {
      const existingByEmail = await storage.getUserByEmail(email);
      if (existingByEmail && existingByEmail.ssoExternalId) {
        await recordFailedLogin(req, { email, id: existingByEmail.id }, method(), "linked_to_other_identity");
        return res.redirect(buildSsoErrorUrl(provider, "linked_to_other_identity"));
      }
      if (existingByEmail) {
        req.session.pendingSsoLink = {
          provider,
          externalId,
          email,
          firstName,
          lastName,
          createdAt: Date.now(),
        };
        safeLog("Existing password user — redirecting to link-account confirmation", { provider, email });
        return res.redirect(buildSsoErrorUrl(provider, "link_password_required", { email }));
      }
    }

    // Resolve the CriteriaIQ role from the groups claim BEFORE deciding
    // whether to JIT-create — internal-only scope means we refuse to
    // create a customer-facing user via the SSO path.
    const roleMapping = (row.roleMapping ?? {}) as Record<string, string>;
    const resolvedRole = user && !row.syncRoleOnEveryLogin
      ? (user.role ?? row.defaultRoleForUnmapped)
      : resolveRoleFromGroups(groupsClaim, roleMapping, row.defaultRoleForUnmapped);

    if (!isInternalRole(resolvedRole)) {
      await recordFailedLogin(req, { email, id: user?.id ?? null }, method(), "external_role_not_eligible");
      return res.redirect(buildSsoErrorUrl(provider, "external_role_not_eligible"));
    }

    if (!user) {
      // User Provisioning Rule (ImpactIQ's "allow JIT"): with JIT off,
      // only people who already have a CriteriaIQ account can sign in.
      if (!row.allowJit) {
        await recordFailedLogin(req, { email }, method(), "no_account");
        return res.redirect(buildSsoErrorUrl(provider, "no_account"));
      }

      // Domain → account resolution. Required for JIT.
      const domain = emailDomain(email);
      const allowed = domain ? await storage.getAllowedDomainByDomain(domain) : undefined;
      if (!allowed || !allowed.isActive) {
        await recordFailedLogin(req, { email }, method(), "domain_not_allowed");
        return res.redirect(buildSsoErrorUrl(provider, "domain_not_allowed"));
      }
      const identity = {
        email,
        firstName: firstName || fullName.split(" ")[0] || null,
        lastName: lastName || fullName.split(" ").slice(1).join(" ") || null,
        password: null,
        role: resolvedRole,
        accountId: allowed.accountId,
        allAccountsAccess: true,
        ssoProvider: provider,
        ssoExternalId: externalId,
        ssoLastLoginAt: new Date(),
      };
      if (!allowed.autoApprove) {
        // Domain is recognized but not auto-approve — create the user
        // as pending so the admin sees them in the pending list.
        const pendingUser = await storage.upsertUser({
          id: randomUUID(),
          ...identity,
          isApproved: false,
          isActive: false,
        } as any);
        await recordFailedLogin(req, { email, id: pendingUser.id }, method("jit-create"), "pending_admin_approval");
        return res.redirect(buildSsoErrorUrl(provider, "pending_admin_approval"));
      }
      // Auto-approve JIT.
      user = await storage.upsertUser({
        id: randomUUID(),
        ...identity,
        isApproved: true,
        approvedAt: new Date(),
        isActive: true,
      } as any);
      safeLog("JIT created user from IdP", { provider, email, userId: user.id, role: resolvedRole });
    } else {
      // Returning user. Re-sync role if the admin opted in. Update
      // email if the IdP-side value changed.
      const updates: Record<string, unknown> = {};
      if (row.syncRoleOnEveryLogin && user.role !== resolvedRole) {
        updates.role = resolvedRole;
      }
      if (user.email && user.email.toLowerCase() !== email) {
        // Email change at the IdP. Record the old value before
        // overwriting; the admin sees it in the audit feed.
        await recordFailedLogin(req, { email: user.email, id: user.id }, method("email-changed"), `was:${user.email}`);
        updates.email = email;
      }
      if (Object.keys(updates).length > 0) {
        user = await storage.updateUser(user.id, updates as any);
      }
    }

    if (!user.isActive) {
      await recordFailedLogin(req, { email, id: user.id }, method(), "user_inactive");
      return res.redirect(buildSsoErrorUrl(provider, "user_inactive"));
    }
    if (!user.isApproved) {
      await recordFailedLogin(req, { email, id: user.id }, method(), "pending_admin_approval");
      return res.redirect(buildSsoErrorUrl(provider, "pending_admin_approval"));
    }
    // Per-user sign-in policy (migration 075): an admin restricted this
    // account to password sign-in. Bail before any session write.
    if (user.allowedLoginMethods === "password_only") {
      await recordFailedLogin(req, { email, id: user.id }, method(), "sso_not_allowed");
      return res.redirect(buildSsoErrorUrl(provider, "sso_not_allowed"));
    }

    await syncTeamsFromGroups(provider, user.id, groupsClaim, row.teamMapping);

    // MFA decision. If the IdP asserts MFA (ACR claim names a multi-
    // factor LoA, OR `amr` claim contains "mfa"), we may skip the
    // CriteriaIQ TOTP/WebAuthn gate. The admin can flip
    // `requireMfaTrust` off to always run the gate regardless.
    const idpAssertsMfa =
      (typeof acrClaim === "string" && /(2fa|mfa|aal2|loa-2|level-2)/i.test(acrClaim)) ||
      (Array.isArray(amrClaim) && amrClaim.includes("mfa"));
    const mfaSkipped = row.requireMfaTrust && idpAssertsMfa;

    // Session fixation defense — regenerate the session ID before we
    // populate it with the authenticated user.
    await new Promise<void>((resolve, reject) => {
      req.session.regenerate((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });

    // If MFA is NOT skipped and the user has MFA enrolled, defer
    // session establishment and route through the MFA challenge flow.
    // The SSO error page picks the parked sign-in up and runs the same
    // MFA challenge dialog as password sign-in (see ssoMfaHandoff.ts).
    if (!mfaSkipped && user.mfaEnabled) {
      parkSsoMfaChallenge(req.session, user.id, provider);
      await recordAttemptResult(bucket, true, SSO_RATE_LIMIT_WINDOW_MS);
      return res.redirect(buildSsoErrorUrl(provider, "mfa_required"));
    }

    // Populate the session. Shape mirrors simpleAuth.ts's normal login
    // response so all downstream `req.session.user` consumers behave
    // identically regardless of the auth path.
    req.session.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      isActive: user.isActive,
      isApproved: user.isApproved,
      mfaEnabled: user.mfaEnabled,
      accountId: user.accountId,
      allAccountsAccess: user.allAccountsAccess,
      loginCount: user.loginCount,
      lastLogin: user.lastLogin,
    };
    // Which IdP to offer RP-initiated logout for.
    req.session.ssoProvider = provider;

    await storage.updateSsoUserLastLogin(user.id);
    await recordSuccessfulLogin(
      req,
      {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        loginCount: user.loginCount,
      },
      mfaSkipped ? method("mfa-skipped") : method(),
    );

    // Successful exchange clears the rate-limit bucket.
    await recordAttemptResult(bucket, true, SSO_RATE_LIMIT_WINDOW_MS);

    res.redirect("/");
  };
}

/**
 * Public — POST /api/auth/sso/link-confirm.
 * Validates the CriteriaIQ password the user just typed against the
 * existing password row, then links the row to the IdP identity parked
 * on the session by the callback, then establishes the session.
 */
const linkConfirmHandler: RequestHandler = async (req: any, res) => {
  const pending = req.session.pendingSsoLink;
  if (!pending || !pending.externalId || !pending.email || !isSsoProvider(pending.provider)) {
    return res.status(400).json({ message: "No pending SSO link", code: "no_pending_link" });
  }
  const provider: SsoProvider = pending.provider;
  // 10 minute expiry on the pending link slot.
  if (Date.now() - (pending.createdAt ?? 0) > 10 * 60 * 1000) {
    delete req.session.pendingSsoLink;
    return res.status(400).json({ message: "Link request expired", code: "link_expired" });
  }

  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ message: "Password required", code: "password_required" });
  }

  // This is a password check, so it shares the /api/login budgets: a
  // guess here counts toward the same per-account and per-IP lockout
  // as a guess on the sign-in form.
  const { emailKey, ipKey } = loginRateLimitKeys(
    String(pending.email).trim().toLowerCase(),
    getClientIp(req),
  );
  const [emailWithinBudget, ipWithinBudget] = await Promise.all([
    checkRateLimit(emailKey, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_EMAIL, LOGIN_RATE_LIMIT_WINDOW_MS),
    checkRateLimit(ipKey, LOGIN_RATE_LIMIT_MAX_ATTEMPTS_PER_IP, LOGIN_RATE_LIMIT_WINDOW_MS),
  ]);
  if (!emailWithinBudget || !ipWithinBudget) {
    await recordFailedLogin(req, { email: pending.email }, `${provider}-link`, LOGIN_RATE_LIMIT_REASON);
    return res.status(429).json({ message: "Too many attempts. Please try again later.", code: "rate_limited" });
  }

  const existing = await storage.getUserByEmail(pending.email);
  if (!existing || !existing.password) {
    delete req.session.pendingSsoLink;
    return res.status(400).json({ message: "No matching account", code: "no_match" });
  }

  const bcrypt = await import("bcryptjs");
  const ok = await bcrypt.default.compare(password, existing.password);
  if (!ok) {
    await Promise.all([
      recordAttemptResult(emailKey, false, LOGIN_RATE_LIMIT_WINDOW_MS),
      recordAttemptResult(ipKey, false, LOGIN_RATE_LIMIT_WINDOW_MS),
    ]);
    await recordFailedLogin(req, { email: pending.email, id: existing.id }, `${provider}-link`, "invalid_password");
    return res.status(401).json({ message: "Invalid password", code: "invalid_password" });
  }
  await Promise.all([
    recordAttemptResult(emailKey, true, LOGIN_RATE_LIMIT_WINDOW_MS),
    recordAttemptResult(ipKey, true, LOGIN_RATE_LIMIT_WINDOW_MS),
  ]);

  if (!isInternalRole(existing.role)) {
    delete req.session.pendingSsoLink;
    return res.status(403).json({ message: "Account is not eligible for single sign-on", code: "external_role_not_eligible" });
  }

  // Linking signs the user in via SSO, so the per-user policy applies
  // here too (migration 075). Checked after the password so the error
  // shape can't be used to probe account policy.
  if (existing.allowedLoginMethods === "password_only") {
    delete req.session.pendingSsoLink;
    await recordFailedLogin(req, { email: pending.email, id: existing.id }, `${provider}-link`, "sso_not_allowed");
    return res.status(403).json({ message: "This account must sign in with a password", code: "sso_not_allowed" });
  }

  const linked = await storage.linkUserToSso(existing.id, provider, pending.externalId);

  // Regenerate session and establish the authenticated session, same
  // shape as the callback's success branch.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err: Error | null | undefined) => (err ? reject(err) : resolve()));
  });

  req.session.user = {
    id: linked.id,
    email: linked.email,
    firstName: linked.firstName,
    lastName: linked.lastName,
    role: linked.role,
    isActive: linked.isActive,
    isApproved: linked.isApproved,
    mfaEnabled: linked.mfaEnabled,
    accountId: linked.accountId,
    allAccountsAccess: linked.allAccountsAccess,
    loginCount: linked.loginCount,
    lastLogin: linked.lastLogin,
  };
  req.session.ssoProvider = provider;

  delete req.session.pendingSsoLink;

  await recordSuccessfulLogin(
    req,
    {
      id: linked.id,
      email: linked.email,
      firstName: linked.firstName,
      lastName: linked.lastName,
      loginCount: linked.loginCount,
    },
    `${provider}-linked`,
  );

  res.json({ ok: true, provider });
};

/**
 * Public — POST /api/auth/sso/logout. Local logout always runs; if
 * the admin enabled RP-initiated logout for the provider this session
 * signed in with, we also return the IdP's end_session_endpoint so the
 * client can redirect there.
 */
const logoutHandler: RequestHandler = async (req: any, res) => {
  let endSessionUrl: string | null = null;
  const provider: SsoProvider = isSsoProvider(req.session?.ssoProvider) ? req.session.ssoProvider : "okta";
  try {
    const row = await storage.getSsoConfig(provider);
    if (row.rpInitiatedLogout) {
      const loaded = await loadOidcConfiguration(provider);
      if (loaded) {
        const url = buildEndSessionUrl(loaded.config, {
          post_logout_redirect_uri: getPublicAppUrl(),
        });
        endSessionUrl = url.toString();
      }
    }
  } catch (err) {
    safeLog("Failed to compute end_session URL", { provider, err: redactError(err) });
  }

  req.session.destroy(() => {
    res.json({ ok: true, endSessionUrl });
  });
};

// ---------------------------------------------------------------------------
// Route handlers — admin
// ---------------------------------------------------------------------------

function requireAdmin(req: any, res: Response): boolean {
  if (!req.session?.user || req.session.user.role !== "Admin") {
    res.status(403).json({ message: "Admin only" });
    return false;
  }
  return true;
}

/** `?provider=` (GET) or `provider` in the body (POST); defaults to Okta. */
function providerFrom(req: Request, res: Response): SsoProvider | null {
  const raw = (req.body && typeof req.body === "object" ? req.body.provider : undefined) ?? req.query.provider ?? "okta";
  if (!isSsoProvider(raw)) {
    res.status(400).json({ message: "Unknown SSO provider" });
    return null;
  }
  return raw;
}

function adminView(provider: SsoProvider, row: SsoConfig) {
  return {
    provider,
    enabled: row.enabled,
    issuerUrl: row.issuerUrl,
    tenantId: row.tenantId,
    clientId: row.clientId,
    clientSecretConfigured: !!row.clientSecretEnc,
    // What the IdP must have registered, and whether it is the admin's
    // override or the PUBLIC_APP_URL default.
    redirectUri: getRedirectUri(provider, row),
    redirectUriOverride: row.redirectUri,
    defaultRedirectUri: getDefaultRedirectUri(provider),
    allowJit: row.allowJit,
    scopes: row.scopes,
    groupClaimName: row.groupClaimName,
    roleMapping: row.roleMapping,
    teamMapping: parseTeamGroupMapping(row.teamMapping),
    defaultRoleForUnmapped: row.defaultRoleForUnmapped,
    requireMfaTrust: row.requireMfaTrust,
    syncRoleOnEveryLogin: row.syncRoleOnEveryLogin,
    rpInitiatedLogout: row.rpInitiatedLogout,
    lastTestedAt: row.lastTestedAt,
    lastTestResult: row.lastTestResult,
    lastTestError: row.lastTestError,
    updatedAt: row.updatedAt,
  };
}

/**
 * Admin — returns a provider's SSO config. clientSecretEnc is replaced
 * with a boolean so the admin UI never gets the plaintext but can
 * render "configured / not configured" correctly.
 */
const getConfigHandler: RequestHandler = async (req: any, res) => {
  if (!requireAdmin(req, res)) return;
  const provider = providerFrom(req, res);
  if (!provider) return;
  const row = await storage.getSsoConfig(provider);
  res.json(adminView(provider, row));
};

const optionalTrimmed = z
  .string()
  .max(2048)
  .transform((v) => v.trim());

const saveConfigSchema = z.object({
  provider: z.enum(SSO_PROVIDERS).optional(),
  enabled: z.boolean().optional(),
  // Okta domain or issuer URL; "" clears.
  issuerUrl: optionalTrimmed.optional(),
  // Azure tenant id or verified domain; "" clears.
  tenantId: optionalTrimmed.optional(),
  clientId: optionalTrimmed.optional(),
  // "" clears; "***masked***" (or omitting it) keeps the stored value.
  clientSecret: z.string().max(4096).optional(),
  // "" reverts to the PUBLIC_APP_URL default.
  redirectUri: optionalTrimmed.optional(),
  allowJit: z.boolean().optional(),
  scopes: optionalTrimmed.optional(),
  groupClaimName: optionalTrimmed.optional(),
  roleMapping: z.record(z.string().max(512), z.string()).optional(),
  teamMapping: teamGroupMappingSchema.optional(),
  defaultRoleForUnmapped: z.string().optional(),
  requireMfaTrust: z.boolean().optional(),
  syncRoleOnEveryLogin: z.boolean().optional(),
  rpInitiatedLogout: z.boolean().optional(),
});

/** Returns an error message, or null when the value is acceptable. */
export function validateIssuerSource(provider: SsoProvider, body: z.infer<typeof saveConfigSchema>): string | null {
  if (provider === "okta" && body.issuerUrl) {
    try {
      const url = new URL(normalizeOktaDomain(body.issuerUrl));
      if (url.protocol !== "https:") return "The Okta domain must use https";
    } catch {
      return "The Okta domain is not a valid URL or host name";
    }
  }
  if (provider === "azure" && body.tenantId) {
    if (AZURE_MULTI_TENANT.has(body.tenantId.toLowerCase())) {
      return "Enter your directory (tenant) ID or domain; multi-tenant endpoints are not allowed";
    }
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(body.tenantId)) {
      return "The tenant must be a directory (tenant) ID or a domain such as contoso.onmicrosoft.com";
    }
  }
  return null;
}

/** The override must be an absolute https URL ending in this provider's callback path. */
export function validateRedirectUri(provider: SsoProvider, value: string): string | null {
  try {
    const url = new URL(value);
    const localHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return "The redirect URI must use https";
    if (url.pathname !== PROVIDERS[provider].callbackPath || url.search || url.hash) {
      return `The redirect URI must end in ${PROVIDERS[provider].callbackPath}`;
    }
    return null;
  } catch {
    return "The redirect URI is not a valid URL";
  }
}

/**
 * Admin — saves a provider's SSO config. clientSecret in the request
 * body is encrypted BEFORE reaching the storage layer (the storage
 * layer expects the encrypted blob). An empty string clears the
 * secret; a missing field or the mask sentinel leaves it in place.
 */
const saveConfigHandler: RequestHandler = async (req: any, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = saveConfigSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid SSO settings", errors: parsed.error.issues });
  }
  const body = parsed.data;
  const provider: SsoProvider = body.provider ?? "okta";

  const issuerError = validateIssuerSource(provider, body);
  if (issuerError) return res.status(400).json({ message: issuerError });
  if (body.redirectUri) {
    const redirectError = validateRedirectUri(provider, body.redirectUri);
    if (redirectError) return res.status(400).json({ message: redirectError });
  }

  const updates: Record<string, unknown> = {};
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.issuerUrl !== undefined) updates.issuerUrl = body.issuerUrl || null;
  if (body.tenantId !== undefined) updates.tenantId = body.tenantId || null;
  if (body.clientId !== undefined) updates.clientId = body.clientId || null;
  if (body.redirectUri !== undefined) updates.redirectUri = body.redirectUri || null;
  if (body.allowJit !== undefined) updates.allowJit = body.allowJit;
  if (body.scopes) updates.scopes = body.scopes;
  if (body.groupClaimName) updates.groupClaimName = body.groupClaimName;
  if (body.defaultRoleForUnmapped !== undefined) {
    if (!isInternalRole(body.defaultRoleForUnmapped)) {
      return res.status(400).json({ message: "Default role must be an internal role" });
    }
    updates.defaultRoleForUnmapped = body.defaultRoleForUnmapped;
  }
  if (body.requireMfaTrust !== undefined) updates.requireMfaTrust = body.requireMfaTrust;
  if (body.syncRoleOnEveryLogin !== undefined) updates.syncRoleOnEveryLogin = body.syncRoleOnEveryLogin;
  if (body.rpInitiatedLogout !== undefined) updates.rpInitiatedLogout = body.rpInitiatedLogout;
  if (body.roleMapping) {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.roleMapping)) {
      if (k.trim() && isInternalRole(v)) cleaned[k.trim()] = v;
    }
    updates.roleMapping = cleaned;
  }
  if (body.teamMapping) {
    const teamError = await checkTeamMapping(body.teamMapping);
    if (teamError) return res.status(400).json({ message: teamError });
    updates.teamMapping = body.teamMapping;
  }
  if (body.clientSecret !== undefined) {
    if (body.clientSecret === "") {
      updates.clientSecretEnc = null;
    } else if (body.clientSecret !== "***masked***") {
      updates.clientSecretEnc = encryptText(body.clientSecret);
    }
  }

  const saved = await storage.upsertSsoConfig(provider, updates as any, req.session.user.id);
  invalidateOidcConfigCache(provider);
  safeLog("SSO config saved", { provider, enabled: saved.enabled, by: req.session.user.id });

  // Return the fresh server-side view so the UI re-renders with
  // canonical values (especially the redirect URI).
  res.json(adminView(provider, saved));
};

/**
 * Admin — POST /api/admin/sso/test. Runs OIDC discovery against the
 * provider's issuer and writes the result to lastTestedAt /
 * lastTestResult / lastTestError. Does NOT actually exchange tokens
 * (that requires a user redirect) — it validates the well-known doc
 * + client credentials can be loaded. Works before the provider is
 * enabled, so admins can test first and switch on after.
 */
const testConfigHandler: RequestHandler = async (req: any, res) => {
  if (!requireAdmin(req, res)) return;
  const provider = providerFrom(req, res);
  if (!provider) return;
  invalidateOidcConfigCache(provider);
  const loaded = await loadOidcConfiguration(provider, { requireEnabled: false });
  if (!loaded) {
    await storage.recordSsoConfigTestResult(provider, "failure", "Discovery failed or settings incomplete");
    return res.status(400).json({ ok: false, message: "Discovery failed. Check the issuer settings and credentials." });
  }
  await storage.recordSsoConfigTestResult(provider, "success", null);
  res.json({ ok: true, message: "OIDC discovery succeeded", issuer: loaded.config.serverMetadata().issuer });
};

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

export function setupOidcAuth(app: Express): void {
  // Public routes
  app.get("/api/auth/sso/status", statusHandler);
  for (const provider of SSO_PROVIDERS) {
    app.get(PROVIDERS[provider].loginPath, makeLoginHandler(provider));
    app.get(PROVIDERS[provider].callbackPath, makeCallbackHandler(provider));
  }
  app.post("/api/auth/sso/link-confirm", linkConfirmHandler);
  app.post("/api/auth/sso/mfa-pending", ssoMfaPendingHandler);
  app.post("/api/auth/sso/logout", logoutHandler);

  // Admin routes (provider via ?provider= or the body; default okta)
  app.get("/api/admin/sso/config", getConfigHandler);
  app.post("/api/admin/sso/config", saveConfigHandler);
  app.post("/api/admin/sso/test", testConfigHandler);
}

// ---------------------------------------------------------------------------
// Exports for the CSRF exemption list and other infra modules
// ---------------------------------------------------------------------------

export const SSO_CSRF_EXEMPT_PATHS = SSO_PROVIDERS.map((p) => PROVIDERS[p].callbackPath);
