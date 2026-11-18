// Whether a user's stored Salesforce token still works, for Profile Settings ›
// Integrations ("Reconnect needed") and the sidebar icon. Ported from
// ImpactIQ's /auth/salesforce/status health check. One identity call per user
// at most every CHECK_TTL_MS, so opening the profile or polling the sidebar
// doesn't spend API calls.
import type { MySalesforceConnection } from "@shared/my-connections";
import { getSalesforceConnectionForUser, salesforceConfigService } from "./salesforce-config-service";

const CHECK_TTL_MS = 10 * 60 * 1000;

interface CachedCheck {
  healthy: boolean | null;
  accountLabel: string | null;
  checkedAt: number;
}

const checks = new Map<string, CachedCheck>();

/** Forget a user's last check (after connect or disconnect). */
export function clearSalesforceUserCheck(userId?: string): void {
  if (userId) checks.delete(userId);
  else checks.clear();
}

/**
 * Errors that mean the token itself is dead: Salesforce refused the refresh
 * token (revoked, expired, or the connected app was removed) or the session.
 * Anything else (network, a 5xx, an API limit) says nothing about the token.
 */
export function isRevokedTokenError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; errorCode?: unknown; message?: unknown };
  const codes = [e.name, e.errorCode].filter((v): v is string => typeof v === "string");
  if (codes.some((c) => c === "invalid_grant" || c === "INVALID_SESSION_ID" || c === "INVALID_AUTH_HEADER")) return true;
  const message = typeof e.message === "string" ? e.message.toLowerCase() : "";
  return message.includes("expired access/refresh token") || message.includes("invalid_grant");
}

interface IdentityLike {
  username?: unknown;
  display_name?: unknown;
}

function labelFrom(identity: IdentityLike): string | null {
  if (typeof identity.username === "string" && identity.username.trim()) return identity.username.trim();
  if (typeof identity.display_name === "string" && identity.display_name.trim()) return identity.display_name.trim();
  return null;
}

export interface SalesforceCheckDeps {
  now?: () => number;
  identity?: (userId: string) => Promise<IdentityLike>;
}

/** The user's Salesforce connection, with a cached liveness check. */
export async function getSalesforceUserConnection(
  userId: string,
  deps: SalesforceCheckDeps = {},
): Promise<MySalesforceConnection> {
  const now = deps.now ?? Date.now;
  const [configured, stored] = await Promise.all([
    salesforceConfigService.isOAuthConfigured(),
    salesforceConfigService.getUserConnectionRecord(userId),
  ]);
  if (!stored.connected) {
    checks.delete(userId);
    return { configured, connected: false, healthy: null, accountLabel: null, connectedAt: null };
  }

  let check = checks.get(userId);
  if (!check || now() - check.checkedAt > CHECK_TTL_MS) {
    const identity = deps.identity ?? (async (id: string) => (await getSalesforceConnectionForUser(id)).identity());
    try {
      const result = await identity(userId);
      check = { healthy: true, accountLabel: labelFrom(result), checkedAt: now() };
    } catch (error) {
      // Only a refused token counts as broken; an outage keeps the last label.
      const revoked = isRevokedTokenError(error);
      if (!revoked) console.warn("[salesforce] connection check failed:", error instanceof Error ? error.message : error);
      check = { healthy: revoked ? false : null, accountLabel: check?.accountLabel ?? null, checkedAt: now() };
    }
    checks.set(userId, check);
  }

  return {
    configured,
    connected: true,
    healthy: check.healthy,
    accountLabel: check.accountLabel,
    connectedAt: stored.connectedAt ? stored.connectedAt.toISOString() : null,
  };
}
