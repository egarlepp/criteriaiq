// The install's HubSpot connection (hubspot_connection, migration 089): one
// private app access token for the whole portal, stored AES-256-GCM
// encrypted with encryptText like the other integration secrets, and listed
// in the key-rotation manifest. The token never leaves the server; the card
// only ever sees its last four characters.
import { storage } from "../storage";
import { decryptText, encryptText } from "../auth/mfaUtils";
import type { HubspotCapabilityReport } from "@shared/hubspot";

export interface HubspotPortalInfo {
  portalId: string | null;
  portalName: string | null;
  accountType: string | null;
  uiDomain: string | null;
}

export interface HubspotConfig extends HubspotPortalInfo {
  accessToken: string;
  lastCheck: HubspotCapabilityReport | null;
}

/**
 * Null when there is no key, or when the stored one can't be decrypted (a
 * restore onto an install with a different ENCRYPTION_KEY): the admin pastes
 * the key again in that case.
 */
export async function getHubspotConfig(): Promise<HubspotConfig | null> {
  const row = await storage.getHubspotConnectionRow();
  if (!row?.accessToken) return null;
  let accessToken: string;
  try {
    accessToken = decryptText(row.accessToken);
  } catch {
    return null;
  }
  const lastCheck = row.lastCheck && typeof row.lastCheck === "object" ? (row.lastCheck as HubspotCapabilityReport) : null;
  return {
    accessToken,
    portalId: row.portalId,
    portalName: row.portalName,
    accountType: row.accountType,
    uiDomain: row.uiDomain,
    lastCheck,
  };
}

export async function isHubspotConfigured(): Promise<boolean> {
  return (await getHubspotConfig()) !== null;
}

export async function setHubspotConfig(accessToken: string, portal: HubspotPortalInfo, updatedBy: string | null): Promise<void> {
  await storage.saveHubspotConnectionRow({ accessTokenEnc: encryptText(accessToken), ...portal }, updatedBy);
}

export async function saveHubspotCheck(report: HubspotCapabilityReport): Promise<void> {
  await storage.saveHubspotConnectionCheck(report);
}

export async function clearHubspotConfig(): Promise<void> {
  await storage.deleteHubspotConnectionRow();
}
