// The install-wide `crm_provider` setting (shared/crm-provider.ts).
//
// Read on every CRM request and every CRM job tick, so cached briefly: a
// write from this process clears the cache, and another replica's write is
// picked up within the TTL. Deliberately imports nothing from a CRM's own
// code, so the Salesforce code can ask "am I the active CRM?" without an
// import cycle.
import { storage } from "../storage";
import {
  CRM_PROVIDER_SETTING_KEY,
  DEFAULT_CRM_PROVIDER,
  normalizeCrmProvider,
  type CrmProviderId,
} from "@shared/crm-provider";

const CACHE_TTL_MS = 30_000;
let cache: { value: CrmProviderId; at: number } | null = null;

export async function getCrmProviderId(): Promise<CrmProviderId> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const row = await storage.getSystemSetting(CRM_PROVIDER_SETTING_KEY);
    const value = normalizeCrmProvider(row?.value);
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    // A brief settings read failure keeps the last known CRM rather than
    // switching a working CRM off; with nothing known yet, the default.
    console.warn("[crm-provider] failed to read setting, using the last known value:", err);
    return cache?.value ?? DEFAULT_CRM_PROVIDER;
  }
}

export async function isCrmProviderActive(provider: CrmProviderId): Promise<boolean> {
  return (await getCrmProviderId()) === provider;
}

/**
 * Writes the setting as-is. Changes after install go through
 * changeCrmProvider() (provider-lock.ts), which checks the lock first.
 */
export async function writeCrmProviderId(provider: CrmProviderId, updatedBy: string | undefined): Promise<CrmProviderId> {
  await storage.upsertSystemSetting(
    CRM_PROVIDER_SETTING_KEY,
    { provider },
    updatedBy,
    "The CRM this install uses (Admin › Integrations › Overview › CRM)",
  );
  cache = { value: provider, at: Date.now() };
  return provider;
}

export function clearCrmProviderCache(): void {
  cache = null;
}

/**
 * Wraps one CRM's scheduled job so it stands down quietly while the install
 * runs a different CRM (or none): the tick returns "skipped", which writes no
 * run row and sends no error email, and picks up again on the next tick after
 * the CRM is switched back. ImpactIQ's rule for every Salesforce/HubSpot job.
 */
export function onlyWhenCrmActive<T extends { status: "success" | "skipped" } | void>(
  provider: Exclude<CrmProviderId, "none">,
  task: () => Promise<T>,
): () => Promise<T | { status: "skipped"; message: string }> {
  return async () => {
    if (!(await isCrmProviderActive(provider))) return { status: "skipped", message: "crm_not_active" };
    return task();
  };
}
