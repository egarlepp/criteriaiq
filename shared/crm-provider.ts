// Which CRM this install talks to: one install-wide choice, never both.
// HubSpot is an alternative to Salesforce, not an add-on (the rule ImpactIQ
// settled on in v1.383, docs/crm-providers.md there).
//
// 'none' is the default (Eric's call): an install with no saved choice runs
// CriteriaIQ on its own, and projects and accounts are only created and
// changed here, never in a CRM. An admin picks Salesforce or HubSpot on
// Admin › Integrations › Overview › CRM. Stored as { provider } in the
// `crm_provider` system_settings row.
//
// Record ids from one CRM mean nothing in another, so once CRM-linked data
// exists the install may only switch between that data's CRM and 'none'.
// Which CRM the data came from is read from the data itself (project
// crm_provider, Salesforce links and URLs), not remembered separately, so it
// can never drift from what is actually stored.
import { CRM_PROVIDERS, type CrmProvider } from "./crm-record-id";

export const CRM_PROVIDER_IDS = [...CRM_PROVIDERS, "none"] as const;
export type CrmProviderId = (typeof CRM_PROVIDER_IDS)[number];

export const DEFAULT_CRM_PROVIDER: CrmProviderId = "none";
export const CRM_PROVIDER_SETTING_KEY = "crm_provider";

export function isCrmProviderId(value: unknown): value is CrmProviderId {
  return typeof value === "string" && (CRM_PROVIDER_IDS as readonly string[]).includes(value);
}

/** Anything unreadable falls back to the default. */
export function normalizeCrmProvider(raw: unknown): CrmProviderId {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>).provider : raw;
  return isCrmProviderId(value) ? value : DEFAULT_CRM_PROVIDER;
}

/** Rows holding a record id from each CRM. */
export type CrmLinkedDataCounts = Record<CrmProvider, number>;

/** The CRMs that have linked data in this install. */
export function crmProvidersWithData(counts: CrmLinkedDataCounts): CrmProvider[] {
  return CRM_PROVIDERS.filter((provider) => counts[provider] > 0);
}

/**
 * Whether the install may switch from `from` to `to`. With no CRM-linked
 * data every change is allowed. With data from one CRM, only that CRM or
 * 'none'. Data from both (only possible from an import) leaves 'none' and
 * the current choice.
 */
export function crmProviderChangeAllowed(from: CrmProviderId, to: CrmProviderId, counts: CrmLinkedDataCounts): boolean {
  if (to === from || to === "none") return true;
  const withData = crmProvidersWithData(counts);
  if (withData.length === 0) return true;
  return withData.length === 1 && withData[0] === to;
}

/**
 * The CRM's name on screen. Proper nouns, the same in every language; 'none'
 * reads as the generic "CRM". Wording that names the CRM uses the i18next
 * variables {{crm}} / {{crmShort}} filled from these, so adding a CRM means
 * adding it here, not editing translations.
 */
export const CRM_DISPLAY_NAMES: Record<CrmProviderId, { name: string; short: string }> = {
  salesforce: { name: "Salesforce", short: "SF" },
  hubspot: { name: "HubSpot", short: "HubSpot" },
  none: { name: "CRM", short: "CRM" },
};

export function crmWordingVariables(provider: CrmProviderId): { crm: string; crmShort: string } {
  const names = CRM_DISPLAY_NAMES[provider];
  return { crm: names.name, crmShort: names.short };
}

/** GET /api/admin/integrations/crm-provider */
export interface CrmProviderState {
  provider: CrmProviderId;
  linkedData: CrmLinkedDataCounts;
  /** The CRMs the install may switch to right now (always includes the current one). */
  allowed: CrmProviderId[];
  /** Whether each CRM's connection is saved. Choosing a CRM never needs it. */
  configured: Record<CrmProvider, boolean>;
}

/**
 * Whether a project must name its validation record (Evaluation / POC ...).
 * Only while a CRM is active: with None nothing lives in a CRM to link to.
 * Unknown (still loading) counts as required, so a form never under-checks.
 */
export function validationRecordRequired(provider: CrmProviderId | null | undefined): boolean {
  return provider !== "none";
}
