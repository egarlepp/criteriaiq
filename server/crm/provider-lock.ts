// Record ids from one CRM mean nothing in another, so once an install holds
// CRM-linked data it can't switch to a different CRM: projects and accounts
// would point at ids the new CRM doesn't have. Switching between the data's
// own CRM and 'none' stays allowed, since that leaves every link valid, and
// 'none' never deletes an id.
import { storage } from "../storage";
import { salesforceConfigService } from "../salesforce/salesforce-config-service";
import {
  CRM_PROVIDER_IDS,
  crmProviderChangeAllowed,
  type CrmProviderId,
  type CrmProviderState,
} from "@shared/crm-provider";
import { getCrmProviderId, writeCrmProviderId } from "./provider-setting";
import { isHubspotConfigured } from "../hubspot/config";

export async function isSalesforceConfigured(): Promise<boolean> {
  try {
    const cfg = await salesforceConfigService.getOAuthConfig();
    return !!(cfg?.clientId && cfg.clientSecret);
  } catch (err) {
    // A secret that no longer decrypts (ENCRYPTION_KEY changed) reads as
    // not configured rather than failing the whole page.
    console.warn("[crm-provider] Salesforce config unreadable:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function hubspotConfigured(): Promise<boolean> {
  try {
    return await isHubspotConfigured();
  } catch (err) {
    console.warn("[crm-provider] HubSpot config unreadable:", err instanceof Error ? err.message : err);
    return false;
  }
}

export async function getCrmProviderState(): Promise<CrmProviderState> {
  const [provider, linkedData, salesforce, hubspot] = await Promise.all([
    getCrmProviderId(),
    storage.countCrmLinkedData(),
    isSalesforceConfigured(),
    hubspotConfigured(),
  ]);
  return {
    provider,
    linkedData,
    allowed: CRM_PROVIDER_IDS.filter((to) => crmProviderChangeAllowed(provider, to, linkedData)),
    configured: { salesforce, hubspot },
  };
}

export type ChangeCrmProviderResult =
  | { ok: true; before: CrmProviderId; after: CrmProviderId; state: CrmProviderState }
  | { ok: false; status: 409; errorCode: "crm_provider_locked"; state: CrmProviderState };

/**
 * Checks the lock and saves. A CRM can be chosen before its connection is
 * saved; until it is, its screens read "not configured".
 */
export async function changeCrmProvider(to: CrmProviderId, updatedBy: string | undefined): Promise<ChangeCrmProviderResult> {
  const before = await getCrmProviderId();
  const linkedData = await storage.countCrmLinkedData();
  if (!crmProviderChangeAllowed(before, to, linkedData)) {
    return { ok: false, status: 409, errorCode: "crm_provider_locked", state: await getCrmProviderState() };
  }
  if (to !== before) await writeCrmProviderId(to, updatedBy);
  return { ok: true, before, after: to, state: await getCrmProviderState() };
}
