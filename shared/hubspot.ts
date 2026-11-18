// HubSpot connection shapes shared by the server and Admin › Integrations ›
// HubSpot. Ported from ImpactIQ (its shared/hubspot.ts), trimmed to what
// CriteriaIQ uses: Deals and Companies are what projects and accounts link
// to, owners are how CriteriaIQ users are matched to HubSpot.

// What the access check probes. Required checks must pass before HubSpot can
// do its job here; the rest describe features a later release uses (writing
// fields back to HubSpot), so a key without them still connects and the card
// says what is off.
export const HUBSPOT_CAPABILITY_KEYS = [
  "deals_read",
  "companies_read",
  "owners_read",
  "deal_properties_read",
  "company_properties_read",
  "contacts_read",
  "deals_write",
  "companies_write",
] as const;
export type HubspotCapabilityKey = (typeof HUBSPOT_CAPABILITY_KEYS)[number];

export const REQUIRED_HUBSPOT_CAPABILITIES: ReadonlySet<HubspotCapabilityKey> = new Set<HubspotCapabilityKey>([
  "deals_read",
  "companies_read",
  "owners_read",
  "deal_properties_read",
  "company_properties_read",
]);

// The private app scope that grants each capability, listed on the card so
// the HubSpot admin knows what to tick.
export const HUBSPOT_CAPABILITY_SCOPES: Readonly<Record<HubspotCapabilityKey, string>> = {
  deals_read: "crm.objects.deals.read",
  companies_read: "crm.objects.companies.read",
  owners_read: "crm.objects.owners.read",
  deal_properties_read: "crm.schemas.deals.read",
  company_properties_read: "crm.schemas.companies.read",
  contacts_read: "crm.objects.contacts.read",
  deals_write: "crm.objects.deals.write",
  companies_write: "crm.objects.companies.write",
};

// ok: the key and the portal's tier allow it. missing: HubSpot answered 403.
// unknown: the probe failed some other way, so nothing can be concluded.
export type HubspotCapabilityStatus = "ok" | "missing" | "unknown";

export interface HubspotCapability {
  key: HubspotCapabilityKey;
  scope: string;
  required: boolean;
  status: HubspotCapabilityStatus;
}

export interface HubspotCapabilityReport {
  checkedAt: string;
  portalId: string | null;
  /** Every required capability is ok. */
  ready: boolean;
  capabilities: HubspotCapability[];
}

export interface HubspotOwnerMatchSummary {
  /** Active HubSpot owners in the local copy. */
  owners: number;
  lastSyncedAt: string | null;
  /** Active internal CriteriaIQ users whose email matches an active owner. */
  matchedUsers: number;
  unmatchedUsers: Array<{ id: string; name: string; email: string }>;
}

/** GET /api/admin/hubspot */
export interface HubspotConnectionSummary {
  configured: boolean;
  /** Last 4 characters only, so an admin can tell which key is on file. */
  keyHint: string | null;
  portalId: string | null;
  portalName: string | null;
  accountType: string | null;
  uiDomain: string | null;
  lastCheck: HubspotCapabilityReport | null;
  owners: HubspotOwnerMatchSummary;
  /** HubSpot-linked records exist, so a key for another portal is refused. */
  portalLocked: boolean;
}

/** Error codes the HubSpot routes answer with; the card translates them. */
export const HUBSPOT_ERROR_CODES = [
  "invalid_key",
  "not_configured",
  "unauthorized",
  "forbidden",
  "rate_limited",
  "unreachable",
  "bad_response",
  "portal_locked",
  "in_use",
] as const;
export type HubspotErrorCode = (typeof HUBSPOT_ERROR_CODES)[number];
