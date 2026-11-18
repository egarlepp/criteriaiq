// What Admin › Integrations › HubSpot reads and writes. Routes stay thin;
// the rules live here so they can be tested. Ported from ImpactIQ.
import type { HubspotCapabilityReport, HubspotConnectionSummary, HubspotErrorCode } from "@shared/hubspot";
import { storage } from "../storage";
import { getCrmProviderId } from "../crm/provider-setting";
import { checkHubspotCapabilities, inspectHubspotToken } from "./capabilities";
import { HubspotError } from "./client";
import { clearHubspotConfig, getHubspotConfig, saveHubspotCheck, setHubspotConfig, type HubspotPortalInfo } from "./config";

async function holdsHubspotData(): Promise<boolean> {
  return (await storage.countCrmLinkedData()).hubspot > 0;
}

export async function getHubspotConnectionSummary(): Promise<HubspotConnectionSummary> {
  const [cfg, owners, locked] = await Promise.all([getHubspotConfig(), storage.getHubspotOwnerMatchSummary(), holdsHubspotData()]);
  return {
    configured: cfg !== null,
    keyHint: cfg ? cfg.accessToken.slice(-4) : null,
    portalId: cfg?.portalId ?? null,
    portalName: cfg?.portalName ?? null,
    accountType: cfg?.accountType ?? null,
    uiDomain: cfg?.uiDomain ?? null,
    lastCheck: cfg?.lastCheck ?? null,
    owners,
    portalLocked: locked,
  };
}

/**
 * Whether a key for `nextPortal` may replace the saved one. Record ids are
 * per portal, so once the install holds HubSpot-linked records a key for a
 * different portal would leave every link pointing at records that portal
 * doesn't have. A new key whose portal can't be named is refused too while
 * the saved portal is known, or any key could slip past the lock.
 */
export function hubspotPortalChangeAllowed(savedPortal: string | null, nextPortal: string | null, holdsData: boolean): boolean {
  if (!holdsData || savedPortal === null) return true;
  return savedPortal === nextPortal;
}

export type SaveHubspotTokenResult =
  | { ok: true; portal: HubspotPortalInfo; portalChanged: boolean }
  | { ok: false; status: 400 | 409 | 502; errorCode: HubspotErrorCode };

/** Checks the key with HubSpot before storing it; a rejected key is never saved. */
export async function saveHubspotToken(token: string, updatedBy: string | null): Promise<SaveHubspotTokenResult> {
  let portal: HubspotPortalInfo;
  try {
    portal = await inspectHubspotToken(token);
  } catch (err) {
    const code: HubspotErrorCode = err instanceof HubspotError ? err.code : "unreachable";
    return { ok: false, status: code === "unauthorized" ? 400 : 502, errorCode: code };
  }
  const saved = await getHubspotConfig();
  if (!hubspotPortalChangeAllowed(saved?.portalId ?? null, portal.portalId, await holdsHubspotData())) {
    return { ok: false, status: 409, errorCode: "portal_locked" };
  }
  const portalChanged = !!saved && saved.portalId !== portal.portalId;
  await setHubspotConfig(token, portal, updatedBy);
  // A new portal's owners are different people.
  if (portalChanged) await storage.clearHubspotOwners();
  return { ok: true, portal, portalChanged };
}

export type RemoveHubspotResult = { ok: true } | { ok: false; status: 409; errorCode: "in_use" };

/** HubSpot can't be disconnected while it's the install's CRM: choose None first. */
export async function removeHubspotConnection(): Promise<RemoveHubspotResult> {
  if ((await getCrmProviderId()) === "hubspot") return { ok: false, status: 409, errorCode: "in_use" };
  await clearHubspotConfig();
  await storage.clearHubspotOwners();
  return { ok: true };
}

/** Runs the access check with the saved key and keeps the result. */
export async function runHubspotCapabilityCheck(): Promise<HubspotCapabilityReport> {
  const cfg = await getHubspotConfig();
  if (!cfg) throw new HubspotError("not_configured");
  const report = await checkHubspotCapabilities({ token: cfg.accessToken, portalId: cfg.portalId });
  await saveHubspotCheck(report);
  return report;
}
