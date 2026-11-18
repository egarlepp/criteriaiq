// The CRM provider registry. Everything above it asks for the active
// provider; nothing outside server/crm/ and server/salesforce/ should import
// a CRM's own code.
import type { RequestHandler } from "express";
import type { CrmProviderId } from "@shared/crm-provider";
import { getCrmProviderId } from "./provider-setting";
import { salesforceProvider } from "./salesforce-provider";
import { hubspotProvider } from "./hubspot-provider";
import type { CrmProvider } from "./types";

export type { CrmAccount, CrmAccountDetails, CrmAccountRead, CrmOpportunity, CrmProvider, CrmUserSession, CrmValidationRecord } from "./types";
export { getCrmProviderId, isCrmProviderActive } from "./provider-setting";

const PROVIDERS: Partial<Record<CrmProviderId, CrmProvider>> = {
  salesforce: salesforceProvider,
  hubspot: hubspotProvider,
};

/** The CRM this install talks to, or null when there is none. */
export async function getActiveCrmProvider(): Promise<CrmProvider | null> {
  return PROVIDERS[await getCrmProviderId()] ?? null;
}

/**
 * Guards one CRM's own routes (e.g. /api/salesforce/*). "One CRM or the
 * other" is enforced on the server, not only by hiding screens: when the
 * install runs a different CRM (or none), these routes answer 409.
 */
export function requireCrmProvider(provider: Exclude<CrmProviderId, "none">): RequestHandler {
  return async (_req, res, next) => {
    if ((await getCrmProviderId()) === provider) {
      next();
      return;
    }
    res.status(409).json({
      message: "This CRM is not the one this install uses",
      errorCode: "crm_provider_mismatch",
      required: provider,
    });
  };
}
