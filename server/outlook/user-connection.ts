// Each person's Outlook link: a working access token (refreshed when it runs
// out) and the liveness check behind "Connected" / "Reconnect needed" on
// Profile Settings › Integrations and the sidebar icon. Mirrors
// server/salesforce/salesforce-user-connection.ts: one Graph call per person
// at most every CHECK_TTL_MS.
import { storage } from "../storage";
import { decryptText, encryptText } from "../auth/mfaUtils";
import { isExternalRole } from "../lib/internal-access";
import type { MyOutlookConnection } from "@shared/outlook";
import { getActiveOutlookSigninConfig, type OutlookSigninConfig } from "./config";
import { MicrosoftAuthError, readMailbox, refreshTokens, type FetchFn } from "./oauth";

const CHECK_TTL_MS = 10 * 60 * 1000;

interface CachedCheck {
  healthy: boolean | null;
  accountLabel: string | null;
  checkedAt: number;
}

const checks = new Map<string, CachedCheck>();
// One refresh per person at a time, so two calls racing on an expired token
// don't both redeem the refresh token.
const refreshing = new Map<string, Promise<string | null>>();

/** Forget a person's last check (after connect or disconnect). */
export function clearOutlookUserCheck(userId?: string): void {
  if (userId) checks.delete(userId);
  else checks.clear();
}

export interface OutlookTokenDeps {
  now?: () => number;
  fetchFn?: FetchFn;
  config?: () => Promise<OutlookSigninConfig | null>;
}

function decryptOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    return decryptText(value);
  } catch {
    return null;
  }
}

/**
 * A current access token for the person's Outlook calendar, refreshing it
 * when it has run out. Null when they haven't linked Outlook, the admin has
 * turned Outlook sign-in off, or the stored tokens can't be read. Throws
 * MicrosoftAuthError when Microsoft refuses the refresh (revoked=true means
 * the person must reconnect).
 */
export async function getOutlookAccessToken(userId: string, deps: OutlookTokenDeps = {}): Promise<string | null> {
  const now = deps.now ?? Date.now;
  const row = await storage.getOutlookTokenRow(userId);
  if (!row) return null;
  const config = await (deps.config ?? getActiveOutlookSigninConfig)();
  if (!config) return null;

  const access = decryptOrNull(row.accessToken);
  if (access && row.expiresAt && row.expiresAt.getTime() > now()) return access;

  const refreshToken = decryptOrNull(row.refreshToken);
  if (!refreshToken) return null;

  const pending = refreshing.get(userId);
  if (pending) return pending;
  const run = (async () => {
    const tokens = await refreshTokens(config, refreshToken, deps.fetchFn);
    await storage.updateOutlookTokens(userId, {
      accessTokenEnc: encryptText(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshTokenEnc: encryptText(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  })().finally(() => refreshing.delete(userId));
  refreshing.set(userId, run);
  return run;
}

export interface MyOutlookDeps extends OutlookTokenDeps {
  mailbox?: (accessToken: string) => Promise<string | null>;
}

/** GET /api/outlook/me: the person's Outlook link with a cached liveness check. */
export async function getMyOutlookConnection(
  user: { id: string; role?: string | null },
  deps: MyOutlookDeps = {},
): Promise<MyOutlookConnection> {
  const now = deps.now ?? Date.now;
  const loadConfig = deps.config ?? getActiveOutlookSigninConfig;
  const external = isExternalRole(user.role);
  const empty: MyOutlookConnection = { available: false, external, connected: false, healthy: null, accountLabel: null, connectedAt: null };
  if (external) return empty;

  const [config, row] = await Promise.all([loadConfig(), storage.getOutlookTokenRow(user.id)]);
  const available = config !== null;
  if (!row?.refreshToken) {
    checks.delete(user.id);
    return { ...empty, available };
  }
  const connectedAt = row.connectedAt ? row.connectedAt.toISOString() : null;
  // Switched off by the admin: the link is kept but can't be used or checked.
  if (!config) return { ...empty, connected: true, accountLabel: row.accountLabel, connectedAt };

  let check = checks.get(user.id);
  if (!check || now() - check.checkedAt > CHECK_TTL_MS) {
    const mailbox = deps.mailbox ?? ((token: string) => readMailbox(token, deps.fetchFn));
    try {
      const token = await getOutlookAccessToken(user.id, { ...deps, config: async () => config });
      if (!token) {
        check = { healthy: false, accountLabel: row.accountLabel, checkedAt: now() };
      } else {
        const label = (await mailbox(token)) ?? row.accountLabel;
        if (label && label !== row.accountLabel) {
          try {
            await storage.setOutlookAccountLabel(user.id, label);
          } catch {
            // Only the "Connected as" text; the next check tries again.
          }
        }
        check = { healthy: true, accountLabel: label, checkedAt: now() };
      }
    } catch (error) {
      // Only a refused token counts as broken; an outage says nothing about it.
      const revoked = error instanceof MicrosoftAuthError && error.revoked;
      if (!revoked) console.warn("[outlook] connection check failed:", error instanceof Error ? error.message : error);
      check = { healthy: revoked ? false : null, accountLabel: check?.accountLabel ?? row.accountLabel, checkedAt: now() };
    }
    checks.set(user.id, check);
  }

  return { available, external, connected: true, healthy: check.healthy, accountLabel: check.accountLabel, connectedAt };
}
