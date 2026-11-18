// HubSpot behind the CrmProvider interface (Phase 1, PR 5). CriteriaIQ's
// Opportunity is a HubSpot Deal and its Account a Company; the validation
// record is the object type an admin picks on Admin › Integrations ›
// Overview › Validation Record.
//
// HubSpot uses one portal-wide token, so CriteriaIQ is the gate (ImpactIQ's
// rule): only an active internal user matched by email to an active HubSpot
// owner gets a session. Everyone else is "not connected", exactly as a
// Salesforce user without their own token is.
import { isExternalRole } from "../lib/internal-access";
import { storage } from "../storage";
import { getHubspotConfig, type HubspotConfig } from "../hubspot/config";
import { hubspotJson, hubspotRequest } from "../hubspot/client";
import { getValidationRecordSettings } from "../lib/crm-validation-record-settings";
import type { CrmAccount, CrmAccountDetails, CrmAccountRead, CrmContact, CrmOpportunity, CrmProvider, CrmUserSession, CrmValidationRecord } from "./types";

const HUBSPOT_ID = /^\d{1,20}$/;
const COMPANY_LIMIT = 10;
const DEAL_LIMIT = 50;
const CACHE_TTL_MS = 10 * 60_000;

export function isHubspotRecordId(id: string): boolean {
  return HUBSPOT_ID.test(id);
}

// ---- Record links ------------------------------------------------------

/** HubSpot's own UI host from account-info, or the default when it looks wrong. */
export function hubspotUiHost(uiDomain: string | null | undefined): string {
  const host = (uiDomain ?? "").trim().toLowerCase();
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.hubspot\.com$/.test(host) ? host : "app.hubspot.com";
}

/** A record page in HubSpot; shared/crm-record-id.ts reads the id back from it. */
export function hubspotRecordUrl(cfg: Pick<HubspotConfig, "uiDomain" | "portalId">, objectTypeId: string, id: string): string | null {
  if (!cfg.portalId || !/^\d+$/.test(cfg.portalId) || !/^\d+-\d+$/.test(objectTypeId) || !isHubspotRecordId(id)) return null;
  return `https://${hubspotUiHost(cfg.uiDomain)}/contacts/${cfg.portalId}/record/${objectTypeId}/${id}`;
}

// ---- Small typed readers -----------------------------------------------

interface HubspotObject {
  id?: unknown;
  properties?: Record<string, unknown>;
}

function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function recordId(obj: HubspotObject): string | undefined {
  const id = str(obj.id);
  return id && isHubspotRecordId(id) ? id : undefined;
}

/** HubSpot CONTAINS_TOKEN takes `*` wildcards; strip characters that change its meaning. */
export function hubspotSearchToken(term: string): string | null {
  const cleaned = term.replace(/[*"\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned ? `*${cleaned}*` : null;
}

// ---- Cached lookups ----------------------------------------------------

let stageCache: { at: number; labels: Map<string, string> } | null = null;
const schemaCache = new Map<string, { at: number; objectTypeId: string; displayProperty: string }>();

export function clearHubspotProviderCaches(): void {
  stageCache = null;
  schemaCache.clear();
}

async function dealStageLabels(): Promise<Map<string, string>> {
  if (stageCache && Date.now() - stageCache.at < CACHE_TTL_MS) return stageCache.labels;
  const labels = new Map<string, string>();
  try {
    const body = await hubspotJson<{ results?: Array<{ stages?: Array<{ id?: unknown; label?: unknown }> }> }>("/crm/v3/pipelines/deals");
    for (const pipeline of body.results ?? []) {
      for (const stage of pipeline.stages ?? []) {
        const id = str(stage.id);
        const label = str(stage.label);
        if (id && label) labels.set(id, label);
      }
    }
  } catch (error) {
    // Stage names are a nicety; the stage id still shows.
    console.warn("[hubspot] deal pipelines unavailable:", error instanceof Error ? error.message : error);
  }
  stageCache = { at: Date.now(), labels };
  return labels;
}

const STANDARD_OBJECTS: Record<string, { objectTypeId: string; displayProperty: string }> = {
  deals: { objectTypeId: "0-3", displayProperty: "dealname" },
  companies: { objectTypeId: "0-2", displayProperty: "name" },
  contacts: { objectTypeId: "0-1", displayProperty: "email" },
  tickets: { objectTypeId: "0-5", displayProperty: "subject" },
};

/** The type id (for links) and the property that names a record of `objectType`. */
async function objectSchema(objectType: string): Promise<{ objectTypeId: string; displayProperty: string }> {
  const standard = STANDARD_OBJECTS[objectType];
  if (standard) return standard;
  const cached = schemaCache.get(objectType);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached;
  const body = await hubspotJson<{ objectTypeId?: unknown; primaryDisplayProperty?: unknown }>(
    `/crm/v3/schemas/${encodeURIComponent(objectType)}`,
  );
  const objectTypeId = str(body.objectTypeId);
  const entry = {
    at: Date.now(),
    objectTypeId: objectTypeId && /^\d+-\d+$/.test(objectTypeId) ? objectTypeId : /^\d+-\d+$/.test(objectType) ? objectType : "",
    displayProperty: str(body.primaryDisplayProperty) ?? "hs_object_id",
  };
  schemaCache.set(objectType, entry);
  return entry;
}

// ---- HubSpot calls -----------------------------------------------------

async function associatedIds(fromType: string, toType: string, fromIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (fromIds.length === 0) return out;
  const body = await hubspotJson<{ results?: Array<{ from?: { id?: unknown }; to?: Array<{ toObjectId?: unknown }> }> }>(
    `/crm/v4/associations/${encodeURIComponent(fromType)}/${encodeURIComponent(toType)}/batch/read`,
    { method: "POST", body: { inputs: fromIds.map((id) => ({ id })) } },
  );
  for (const row of body.results ?? []) {
    const from = str(row.from?.id);
    if (!from) continue;
    const to = (row.to ?? []).map((t) => str(t.toObjectId)).filter((id): id is string => !!id && isHubspotRecordId(id));
    out.set(from, to);
  }
  return out;
}

async function batchRead(objectType: string, ids: string[], properties: string[]): Promise<HubspotObject[]> {
  if (ids.length === 0) return [];
  const body = await hubspotJson<{ results?: HubspotObject[] }>(`/crm/v3/objects/${encodeURIComponent(objectType)}/batch/read`, {
    method: "POST",
    body: { properties, inputs: ids.slice(0, 100).map((id) => ({ id })) },
  });
  return body.results ?? [];
}

async function searchCompanies(term: string, limit: number): Promise<HubspotObject[]> {
  const token = hubspotSearchToken(term);
  if (!token) return [];
  const body = await hubspotJson<{ results?: HubspotObject[] }>("/crm/v3/objects/companies/search", {
    method: "POST",
    search: true,
    body: {
      filterGroups: [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: token }] }],
      properties: ["name", "domain", "hubspot_owner_id"],
      sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
      limit,
    },
  });
  return body.results ?? [];
}

async function ownerNames(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id) => isHubspotRecordId(id))));
  const rows = await storage.getHubspotOwnersByIds(unique);
  return new Map(
    rows.map((o) => [o.id, [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || o.id] as const),
  );
}

// ---- The session -------------------------------------------------------

async function opportunitiesForAccount(accountName: string): Promise<CrmOpportunity[]> {
  const companies = (await searchCompanies(accountName, COMPANY_LIMIT)).filter((c) => recordId(c));
  return dealsOfCompanies(new Map(companies.map((c) => [recordId(c)!, str(c.properties?.name) ?? ""] as const)));
}

/** The Deals of one Company, by its id (a linked account's). The name isn't read: the form knows it. */
async function opportunitiesForAccountId(companyId: string): Promise<CrmOpportunity[]> {
  if (!isHubspotRecordId(companyId)) throw new Error("Not a HubSpot id");
  return dealsOfCompanies(new Map([[companyId, ""]]));
}

/** Deals associated with these Companies (id → name), most recently changed first. */
async function dealsOfCompanies(companyName: Map<string, string>): Promise<CrmOpportunity[]> {
  if (companyName.size === 0) return [];
  const dealsByCompany = await associatedIds("companies", "deals", Array.from(companyName.keys()));
  const companyOfDeal = new Map<string, string>();
  for (const [companyId, dealIds] of dealsByCompany) {
    for (const dealId of dealIds) if (!companyOfDeal.has(dealId)) companyOfDeal.set(dealId, companyId);
  }
  const deals = await batchRead("deals", Array.from(companyOfDeal.keys()).slice(0, 100), [
    "dealname",
    "amount",
    "closedate",
    "dealstage",
    "dealtype",
    "hubspot_owner_id",
    "hs_lastmodifieddate",
  ]);
  const [stages, owners] = await Promise.all([
    dealStageLabels(),
    ownerNames(deals.map((d) => str(d.properties?.hubspot_owner_id) ?? "")),
  ]);
  return deals
    .filter((d) => recordId(d))
    .sort((a, b) => String(b.properties?.hs_lastmodifieddate ?? "").localeCompare(String(a.properties?.hs_lastmodifieddate ?? "")))
    .slice(0, DEAL_LIMIT)
    .map((d) => {
      const id = recordId(d)!;
      const p = d.properties ?? {};
      const accountId = companyOfDeal.get(id);
      const ownerId = str(p.hubspot_owner_id);
      const stage = str(p.dealstage);
      const closeDate = str(p.closedate);
      return {
        id,
        name: str(p.dealname) ?? id,
        accountId,
        accountName: (accountId && companyName.get(accountId)) || undefined,
        ownerId,
        ownerName: ownerId ? owners.get(ownerId) : undefined,
        stageName: stage ? (stages.get(stage) ?? stage) : undefined,
        amount: num(p.amount),
        closeDate: closeDate ? closeDate.slice(0, 10) : undefined,
        type: str(p.dealtype),
      };
    });
}

/** Upper bound on contacts read for one Company. */
const CONTACT_LIMIT = 500;

/**
 * The contacts associated with one Company, with the portal token. Needs the
 * private app's contacts read scope: without it HubSpot answers 403 and
 * hubspotJson throws HubspotError("forbidden").
 */
export async function hubspotContactsForAccount(companyId: string): Promise<CrmContact[]> {
  if (!isHubspotRecordId(companyId)) throw new Error("Not a HubSpot id");
  const ids = ((await associatedIds("companies", "contacts", [companyId])).get(companyId) ?? []).slice(0, CONTACT_LIMIT);
  const rows: HubspotObject[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    rows.push(...(await batchRead("contacts", ids.slice(i, i + 100), ["firstname", "lastname", "email", "jobtitle"])));
  }
  return rows
    .filter((r) => recordId(r))
    .map((r) => ({
      id: recordId(r)!,
      firstName: str(r.properties?.firstname) ?? null,
      lastName: str(r.properties?.lastname) ?? null,
      email: str(r.properties?.email) ?? null,
      title: str(r.properties?.jobtitle) ?? null,
    }))
    .sort((a, b) => (a.lastName ?? "").localeCompare(b.lastName ?? "") || (a.firstName ?? "").localeCompare(b.firstName ?? ""));
}

async function validationRecordsForOpportunity(cfg: HubspotConfig, dealId: string): Promise<CrmValidationRecord[]> {
  if (!isHubspotRecordId(dealId)) throw new Error("Not a HubSpot id");
  const { hubspot } = await getValidationRecordSettings();
  if (!hubspot.objectType) return [];
  const schema = await objectSchema(hubspot.objectType);
  const ids = (await associatedIds("deals", hubspot.objectType, [dealId])).get(dealId) ?? [];
  const records = await batchRead(hubspot.objectType, ids.slice(0, DEAL_LIMIT), [schema.displayProperty]);
  return records
    .filter((r) => recordId(r))
    .map((r) => {
      const id = recordId(r)!;
      return {
        id,
        name: str(r.properties?.[schema.displayProperty]) ?? id,
        url: schema.objectTypeId ? hubspotRecordUrl(cfg, schema.objectTypeId, id) : null,
      };
    });
}

async function searchAccounts(cfg: HubspotConfig, term: string): Promise<CrmAccount[]> {
  const companies = await searchCompanies(term, 20);
  return companies
    .filter((c) => recordId(c))
    .map((c) => {
      const id = recordId(c)!;
      return { id, name: str(c.properties?.name) ?? id, url: hubspotRecordUrl(cfg, "0-2", id) };
    });
}

const COMPANY_DETAIL_PROPERTIES = ["name", "industry", "country", "website", "domain", "hubspot_owner_id"];

/**
 * The CRM-owned fields of these Companies, with the portal token. Only ids
 * HubSpot answers OBJECT_NOT_FOUND for are "missing"; a merged-away id comes
 * back as its survivor and is left alone (the nightly link check moves the
 * link). A failed batch throws, so an outage never marks anything missing.
 */
export async function readHubspotAccounts(ids: string[]): Promise<CrmAccountRead> {
  const wanted = Array.from(new Set(ids.filter((id) => isHubspotRecordId(id))));
  const out: CrmAccountRead = { found: [], missing: [] };
  const rows: HubspotObject[] = [];
  for (let i = 0; i < wanted.length; i += 100) {
    const part = wanted.slice(i, i + 100);
    const { status, body } = await hubspotRequest("/crm/v3/objects/companies/batch/read", {
      method: "POST",
      body: { properties: COMPANY_DETAIL_PROPERTIES, inputs: part.map((id) => ({ id })) },
    });
    if (status !== 200 && status !== 207) throw new Error(`HubSpot company read failed with status ${status}`);
    const data = (body && typeof body === "object" ? body : {}) as {
      results?: HubspotObject[];
      errors?: Array<{ category?: unknown; context?: { ids?: unknown } }>;
    };
    const asked = new Set(part);
    for (const row of data.results ?? []) {
      const id = recordId(row);
      if (id && asked.has(id)) rows.push(row);
    }
    for (const error of data.errors ?? []) {
      if (error.category !== "OBJECT_NOT_FOUND" || !Array.isArray(error.context?.ids)) continue;
      for (const raw of error.context.ids) {
        const id = str(raw);
        if (id && asked.has(id)) out.missing.push(id);
      }
    }
  }
  const owners = await storage.getHubspotOwnersByIds(
    rows.map((r) => str(r.properties?.hubspot_owner_id) ?? "").filter((id) => isHubspotRecordId(id)),
  );
  const ownerEmail = new Map(owners.map((o) => [o.id, o.email] as const));
  for (const row of rows) {
    const id = recordId(row)!;
    const p = row.properties ?? {};
    const ownerId = str(p.hubspot_owner_id);
    const details: CrmAccountDetails = {
      id,
      name: str(p.name) ?? id,
      industry: str(p.industry) ?? null,
      country: str(p.country) ?? null,
      website: str(p.website) ?? str(p.domain) ?? null,
      ownerEmail: (ownerId ? ownerEmail.get(ownerId) : null) ?? null,
    };
    out.found.push(details);
  }
  return out;
}

/** Who may use the portal token: an active internal user matched to an active owner. */
async function userMayUseHubspot(userId: string): Promise<boolean> {
  const user = await storage.getUser(userId);
  if (!user || user.isActive === false || isExternalRole(user.role)) return false;
  return (await storage.getHubspotOwnerIdForUser(userId)) !== null;
}

export const hubspotProvider: CrmProvider = {
  id: "hubspot",

  isRecordId: isHubspotRecordId,

  async connectForUser(userId: string): Promise<CrmUserSession | null> {
    const cfg = await getHubspotConfig();
    if (!cfg) return null;
    if (!(await userMayUseHubspot(userId))) return null;
    return {
      opportunitiesForAccount,
      opportunitiesForAccountId,
      validationRecordsForOpportunity: (dealId) => validationRecordsForOpportunity(cfg, dealId),
      searchAccounts: (term) => searchAccounts(cfg, term),
      readAccounts: readHubspotAccounts,
      contactsForAccount: hubspotContactsForAccount,
    };
  },
};

