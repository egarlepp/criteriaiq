// What a linked account copies from its CRM account, and which of its fields
// that makes read-only (Eric, 2026-11-02: CRM-owned fields flow one way,
// CRM → CriteriaIQ). Pure: account-refresh.ts does the reads and writes.
//
// The CRM holds free text; CriteriaIQ keeps picklists. A value is copied,
// and its field locked, only when it maps cleanly:
//   name     → accountName (always, once linked)
//   industry → industryId, by the industry's name (case, spaces, _ and & ignored)
//   country  → region, by the country table below
//   website  → website
//   owner    → accountRepresentativeId, by email, when the owner is an active CriteriaIQ user
// A field that doesn't map stays editable, so nobody is stuck with a blank
// required field the CRM can't fill.
import type { CrmAccountDetails } from "./types";

export const CRM_MANAGED_FIELDS = ["accountName", "industryId", "region", "website", "accountRepresentativeId"] as const;
export type CrmManagedField = (typeof CRM_MANAGED_FIELDS)[number];

export function isCrmManagedField(value: unknown): value is CrmManagedField {
  return typeof value === "string" && (CRM_MANAGED_FIELDS as readonly string[]).includes(value);
}

export interface CrmAccountValues {
  accountName?: string;
  industryId?: number;
  region?: string;
  website?: string;
  accountRepresentativeId?: string;
}

export interface CrmFieldLookups {
  industries: ReadonlyArray<{ id: number; name: string; isActive?: boolean | null }>;
  /** The active internal user with this (lower-cased) email, or null. */
  userIdByEmail: (email: string) => string | null;
}

/** Lower-cased letters and digits only, so "Financial_Services" equals "Financial Services". */
export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const REGION_COUNTRIES: Record<string, string[]> = {
  "North America": [
    "us", "usa", "united states", "united states of america", "america", "ca", "canada", "mx", "mexico",
    "guatemala", "belize", "honduras", "el salvador", "nicaragua", "costa rica", "panama", "cuba", "jamaica",
    "haiti", "dominican republic", "puerto rico", "bahamas", "barbados", "trinidad and tobago",
  ],
  "South America": [
    "br", "brazil", "brasil", "ar", "argentina", "cl", "chile", "co", "colombia", "pe", "peru", "ve", "venezuela",
    "ec", "ecuador", "bolivia", "paraguay", "uy", "uruguay", "guyana", "suriname",
  ],
  Europe: [
    "uk", "gb", "united kingdom", "great britain", "england", "scotland", "wales", "northern ireland", "ie", "ireland",
    "de", "germany", "deutschland", "fr", "france", "es", "spain", "espana", "it", "italy", "italia", "pt", "portugal",
    "nl", "netherlands", "the netherlands", "holland", "be", "belgium", "lu", "luxembourg", "ch", "switzerland",
    "at", "austria", "se", "sweden", "no", "norway", "dk", "denmark", "fi", "finland", "is", "iceland", "pl", "poland",
    "cz", "czech republic", "czechia", "sk", "slovakia", "hu", "hungary", "ro", "romania", "bg", "bulgaria",
    "gr", "greece", "hr", "croatia", "si", "slovenia", "rs", "serbia", "ee", "estonia", "lv", "latvia",
    "lt", "lithuania", "ua", "ukraine", "mt", "malta", "cy", "cyprus", "monaco", "liechtenstein",
  ],
  "Asia Pacific": [
    "au", "australia", "nz", "new zealand", "jp", "japan", "cn", "china", "hk", "hong kong", "tw", "taiwan",
    "kr", "south korea", "korea", "republic of korea", "sg", "singapore", "in", "india", "id", "indonesia",
    "my", "malaysia", "th", "thailand", "vn", "vietnam", "viet nam", "ph", "philippines", "pk", "pakistan",
    "bd", "bangladesh", "lk", "sri lanka", "np", "nepal",
  ],
  "Middle East & Africa": [
    "ae", "uae", "united arab emirates", "sa", "saudi arabia", "il", "israel", "qa", "qatar", "kw", "kuwait",
    "bh", "bahrain", "om", "oman", "jo", "jordan", "lb", "lebanon", "tr", "turkey", "turkiye", "eg", "egypt",
    "za", "south africa", "ng", "nigeria", "ke", "kenya", "ma", "morocco", "gh", "ghana", "et", "ethiopia",
    "tz", "tanzania", "tn", "tunisia", "dz", "algeria",
  ],
};

const REGION_BY_COUNTRY = new Map<string, string>(
  Object.entries(REGION_COUNTRIES).flatMap(([region, names]) => names.map((name) => [normalizeLabel(name), region] as const)),
);

/** The CriteriaIQ region for a CRM country, or null when it isn't in the table. */
export function regionForCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  return REGION_BY_COUNTRY.get(normalizeLabel(country)) ?? null;
}

/** "www.acme.com/", "https://acme.com" → "https://acme.com" / kept as given when it isn't a plain host. */
export function normalizeWebsite(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
    return `${url.protocol}//${url.host.toLowerCase()}${path}`.slice(0, 500);
  } catch {
    return null;
  }
}

/**
 * The values a CRM account gives a linked account, and the fields those
 * values make read-only.
 */
export function crmAccountUpdate(
  details: CrmAccountDetails,
  lookups: CrmFieldLookups,
): { values: CrmAccountValues; managed: CrmManagedField[] } {
  const values: CrmAccountValues = {};
  const managed: CrmManagedField[] = [];

  const name = details.name.trim();
  if (name) {
    values.accountName = name.slice(0, 255);
    managed.push("accountName");
  }

  if (details.industry) {
    const want = normalizeLabel(details.industry);
    const industry = lookups.industries.find((i) => i.isActive !== false && normalizeLabel(i.name) === want);
    if (industry) {
      values.industryId = industry.id;
      managed.push("industryId");
    }
  }

  const region = regionForCountry(details.country);
  if (region) {
    values.region = region;
    managed.push("region");
  }

  const website = normalizeWebsite(details.website);
  if (website) {
    values.website = website;
    managed.push("website");
  }

  const email = (details.ownerEmail ?? "").trim().toLowerCase();
  const ownerId = email ? lookups.userIdByEmail(email) : null;
  if (ownerId) {
    values.accountRepresentativeId = ownerId;
    managed.push("accountRepresentativeId");
  }

  return { values, managed };
}

export interface CrmFieldChange {
  field: CrmManagedField;
  from: string | number | null;
  to: string | number | null;
}

/** The managed fields whose value the CRM would change on this account. */
export function crmFieldChanges(
  current: Partial<Record<CrmManagedField, string | number | null | undefined>>,
  values: CrmAccountValues,
): CrmFieldChange[] {
  const changes: CrmFieldChange[] = [];
  for (const field of CRM_MANAGED_FIELDS) {
    const next = values[field];
    if (next === undefined) continue;
    const before = current[field] ?? null;
    if (String(before ?? "") !== String(next)) changes.push({ field, from: before, to: next });
  }
  return changes;
}
