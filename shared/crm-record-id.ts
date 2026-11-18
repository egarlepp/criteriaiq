// CRM record id helpers shared by the server (save-time normalization,
// API filters, backfill) and the client (the project form's "paste an id
// or URL" field).
//
// The project columns are CRM-neutral (crm_provider, crm_opportunity_id,
// crm_account_id) because HubSpot support is coming:
//
//   - Salesforce ids are 15-character case-sensitive or 18-character
//     case-insensitive. We always store the 18-character form, so a
//     lookup by either form hits the same row.
//   - HubSpot record ids are numeric.

export const CRM_PROVIDERS = ["salesforce", "hubspot"] as const;
export type CrmProvider = (typeof CRM_PROVIDERS)[number];

export function isCrmProvider(value: unknown): value is CrmProvider {
  return typeof value === "string" && (CRM_PROVIDERS as readonly string[]).includes(value);
}

const SALESFORCE_ID = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;
const SALESFORCE_SUFFIX_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const HUBSPOT_ID = /^\d{1,20}$/;

/**
 * A HubSpot record link, as a regex source both JavaScript and Postgres
 * (`~*`) read the same way. The account form's CRM link column holds either
 * CRM's URL, so this is how a stored link is told apart.
 */
export const HUBSPOT_URL_PATTERN = "^https?://([a-z0-9-]+\\.)*hubspot\\.com(/|$)";

export function isHubspotUrl(value: string | null | undefined): boolean {
  return !!value && new RegExp(HUBSPOT_URL_PATTERN, "i").test(value.trim());
}

/** Key prefixes of the Salesforce objects the project form links. */
export const SALESFORCE_KEY_PREFIXES = {
  Account: "001",
  Opportunity: "006",
} as const;

/** True for a string shaped like a 15- or 18-character Salesforce id. */
export function isSalesforceId(value: string): boolean {
  return SALESFORCE_ID.test(value);
}

/**
 * Returns the 18-character form of a Salesforce id, or null when the input
 * is not a Salesforce id. An 18-character input is rebuilt from its first
 * 15 characters, so a suffix with the wrong case is corrected.
 */
export function toSalesforceId18(value: string): string | null {
  const id = value.trim();
  if (!isSalesforceId(id)) return null;
  const base = id.slice(0, 15);
  let suffix = "";
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const ch = base.charAt(chunk * 5 + i);
      if (ch >= "A" && ch <= "Z") bits |= 1 << i;
    }
    suffix += SALESFORCE_SUFFIX_ALPHABET.charAt(bits);
  }
  return base + suffix;
}

/** True when the two inputs are the same Salesforce record (15 or 18 chars). */
export function salesforceIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = toSalesforceId18(a);
  return left !== null && left === toSalesforceId18(b);
}

function looksLikeSalesforceIdSegment(segment: string): boolean {
  // Record ids always contain a digit (the key prefix and instance
  // digits); this skips words like "Evaluation__c" or "lightningpage".
  return isSalesforceId(segment) && /\d/.test(segment);
}

function parseUrl(value: string): URL | null {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

/**
 * Pulls the record id out of a Salesforce record URL, in its 18-character
 * form. Handles Lightning (`/lightning/r/Object__c/<id>/view`,
 * `/lightning/r/<id>/view`), Classic (`/<id>`) and `?id=<id>` links.
 * Returns null when no id is found.
 */
export function extractSalesforceIdFromUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = parseUrl(value);
  if (!url) return null;
  const segments = url.pathname.split("/").filter(Boolean).map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  });
  const fromPath = segments.find(looksLikeSalesforceIdSegment);
  if (fromPath) return toSalesforceId18(fromPath);
  const fromQuery = url.searchParams.get("id");
  if (fromQuery && looksLikeSalesforceIdSegment(fromQuery)) return toSalesforceId18(fromQuery);
  return null;
}

function extractHubspotIdFromUrl(url: URL): string | null {
  const path = url.pathname;
  // New record pages: /contacts/<portal>/record/0-3/<id> (0-3 deal, 0-2 company)
  const record = path.match(/\/record\/\d+-\d+\/(\d+)/);
  if (record) return record[1];
  // Legacy pages: /contacts/<portal>/deal/<id>, /contacts/<portal>/company/<id>
  const legacy = path.match(/\/(?:deal|company)\/(\d+)/);
  return legacy ? legacy[1] : null;
}

export interface ParsedCrmRecord {
  provider: CrmProvider;
  /** Normalized id: 18 characters for Salesforce, digits for HubSpot. */
  id: string;
}

/**
 * Parses what a user pasted into a CRM record field: a bare id or a record
 * URL from Salesforce or HubSpot. When `provider` is given, the input must
 * belong to that CRM. Returns null when nothing usable is found.
 */
export function parseCrmRecordInput(
  value: string | null | undefined,
  provider?: CrmProvider | null,
): ParsedCrmRecord | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const url = parseUrl(trimmed);
  if (url) {
    const host = url.hostname.toLowerCase();
    if (host === "hubspot.com" || host.endsWith(".hubspot.com")) {
      if (provider && provider !== "hubspot") return null;
      const id = extractHubspotIdFromUrl(url);
      return id ? { provider: "hubspot", id } : null;
    }
    if (provider && provider !== "salesforce") return null;
    const id = extractSalesforceIdFromUrl(trimmed);
    return id ? { provider: "salesforce", id } : null;
  }

  if (provider === "hubspot") {
    return HUBSPOT_ID.test(trimmed) ? { provider: "hubspot", id: trimmed } : null;
  }
  if (provider === "salesforce") {
    const id = toSalesforceId18(trimmed);
    return id ? { provider: "salesforce", id } : null;
  }
  // No provider given: digits only is a HubSpot id, otherwise Salesforce.
  if (HUBSPOT_ID.test(trimmed)) return { provider: "hubspot", id: trimmed };
  const id = toSalesforceId18(trimmed);
  return id ? { provider: "salesforce", id } : null;
}

/**
 * The stored values a lookup filter should match. A Salesforce-shaped id
 * matches its 18-character form (so 15- and 18-character input find the same
 * row); the trimmed input is kept too, for HubSpot ids and for an all-digit
 * value that could be either. Returns [] for anything that is not a
 * plausible CRM id.
 */
export function crmIdFilterCandidates(value: string): string[] {
  const trimmed = value.trim();
  const candidates = new Set<string>();
  if (HUBSPOT_ID.test(trimmed)) candidates.add(trimmed);
  const sf = toSalesforceId18(trimmed);
  if (sf) candidates.add(sf);
  return Array.from(candidates);
}

/** The Salesforce object a record id belongs to, for the objects we link. */
export function salesforceObjectForId(id: string): keyof typeof SALESFORCE_KEY_PREFIXES | null {
  if (!isSalesforceId(id)) return null;
  const prefix = id.slice(0, 3);
  for (const [object, keyPrefix] of Object.entries(SALESFORCE_KEY_PREFIXES)) {
    if (keyPrefix === prefix) return object as keyof typeof SALESFORCE_KEY_PREFIXES;
  }
  return null;
}
