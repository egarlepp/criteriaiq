// Save-time normalization and lookup filters for a project's CRM record
// ids (crmProvider / crmOpportunityId / crmAccountId, migration 086).
//
// Used by POST/PUT/PATCH /api/projects (normalizeProjectCrmFields) and the
// GET /api/projects lookup filters (parseProjectCrmFilters). The id parsing
// itself lives in shared/crm-record-id.ts so the project form uses the same
// rules.
import {
  crmIdFilterCandidates,
  isHubspotUrl,
  extractSalesforceIdFromUrl,
  isCrmProvider,
  parseCrmRecordInput,
  toSalesforceId18,
  type CrmProvider,
} from "@shared/crm-record-id";

export const CRM_ID_FIELDS = ["crmOpportunityId", "crmAccountId"] as const;
type CrmIdField = (typeof CRM_ID_FIELDS)[number];

export interface ProjectCrmValues {
  crmProvider?: CrmProvider | null;
  crmOpportunityId?: string | null;
  crmAccountId?: string | null;
}

export type NormalizeCrmResult =
  | { ok: true; values: ProjectCrmValues }
  | { ok: false; message: string };

function isBlank(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Normalizes the CRM fields present in a project create/update body.
 * Fields the body does not mention are left out of `values`, so a partial
 * update never clears them. Blank strings clear a field. Ids may be a bare
 * id or a record URL; Salesforce ids come back in 18-character form. When
 * ids are given without `crmProvider`, the provider is inferred from them.
 */
export function normalizeProjectCrmFields(body: Record<string, unknown>): NormalizeCrmResult {
  const values: ProjectCrmValues = {};

  let provider: CrmProvider | null | undefined;
  if (body.crmProvider !== undefined) {
    if (isBlank(body.crmProvider)) {
      provider = null;
    } else if (isCrmProvider(body.crmProvider)) {
      provider = body.crmProvider;
    } else {
      return { ok: false, message: "crmProvider must be salesforce or hubspot" };
    }
    values.crmProvider = provider;
  }

  let inferred: CrmProvider | null = null;
  for (const field of CRM_ID_FIELDS) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (isBlank(raw)) {
      values[field] = null;
      continue;
    }
    if (typeof raw !== "string" || raw.length > 500) {
      return { ok: false, message: `${field} must be a CRM record id or URL` };
    }
    const parsed = parseCrmRecordInput(raw, provider ?? inferred);
    if (!parsed) {
      const expected = provider ?? inferred;
      return {
        ok: false,
        message: expected
          ? `${field} is not a valid ${expected === "salesforce" ? "Salesforce" : "HubSpot"} record id or URL`
          : `${field} is not a valid CRM record id or URL`,
      };
    }
    inferred = parsed.provider;
    values[field] = parsed.id;
  }

  if (!provider && inferred) {
    values.crmProvider = inferred;
  }
  return { ok: true, values };
}

/**
 * One CRM per install: a save may only link a project to the active CRM.
 * A value the project already holds is always kept (with None the form
 * sends stored ids back untouched), so only a newly chosen CRM is checked.
 * Returns the refusal message, or null when the save may go ahead.
 */
export function crmLinkRefusal(
  values: ProjectCrmValues,
  storedProvider: string | null | undefined,
  activeProvider: string,
): string | null {
  const next = values.crmProvider;
  if (!next || next === storedProvider || next === activeProvider) return null;
  return activeProvider === "none"
    ? "No CRM is active on this install, so a project can't be linked to one"
    : `This install uses ${activeProvider === "salesforce" ? "Salesforce" : "HubSpot"}, so a project can't be linked to another CRM`;
}

/**
 * The account form's CRM link (customers.salesforce_account_url, which holds
 * either CRM's record URL) follows the same rule: an unchanged link is kept,
 * a new one must belong to the active CRM.
 */
export function accountLinkRefusal(
  url: string | null | undefined,
  storedUrl: string | null | undefined,
  activeProvider: string,
): string | null {
  const next = (url ?? "").trim();
  if (!next || next === (storedUrl ?? "").trim()) return null;
  const provider = isHubspotUrl(next) ? "hubspot" : "salesforce";
  if (provider === activeProvider) return null;
  return activeProvider === "none"
    ? "No CRM is active on this install, so an account can't be linked to one"
    : `This install uses ${activeProvider === "salesforce" ? "Salesforce" : "HubSpot"}, so the account link must be a ${activeProvider === "salesforce" ? "Salesforce" : "HubSpot"} record URL`;
}

/** Copies normalized CRM values onto a body, replacing the raw input. */
export function applyProjectCrmValues(target: Record<string, unknown>, values: ProjectCrmValues): void {
  delete target.crmProvider;
  for (const field of CRM_ID_FIELDS) delete target[field];
  Object.assign(target, values);
}

export interface ProjectCrmFilters {
  /** Stored values crm_opportunity_id may equal. */
  crmOpportunityIds?: string[];
  /** Stored values crm_account_id may equal. */
  crmAccountIds?: string[];
  /** 18-character Salesforce Evaluation id to find in salesforce_evaluation_link. */
  evaluationId?: string;
}

export type ParseCrmFiltersResult =
  | { ok: true; filters: ProjectCrmFilters }
  | { ok: false; message: string };

function singleQueryValue(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null; // repeated param or nested object
  return value;
}

/** Parses the crmOpportunityId / crmAccountId / evaluationId query filters. */
export function parseProjectCrmFilters(query: Record<string, unknown>): ParseCrmFiltersResult {
  const filters: ProjectCrmFilters = {};
  const fieldToFilter: Record<CrmIdField, "crmOpportunityIds" | "crmAccountIds"> = {
    crmOpportunityId: "crmOpportunityIds",
    crmAccountId: "crmAccountIds",
  };
  for (const field of CRM_ID_FIELDS) {
    const raw = singleQueryValue(query[field]);
    if (raw === undefined) continue;
    const candidates = raw === null ? [] : crmIdFilterCandidates(raw);
    if (candidates.length === 0) {
      return { ok: false, message: `Invalid ${field}: expected a Salesforce (15 or 18 characters) or HubSpot record id` };
    }
    filters[fieldToFilter[field]] = candidates;
  }

  const rawEvaluation = singleQueryValue(query.evaluationId);
  if (rawEvaluation !== undefined) {
    const evaluationId = rawEvaluation === null ? null : toSalesforceId18(rawEvaluation);
    if (!evaluationId) {
      return { ok: false, message: "Invalid evaluationId: expected a 15 or 18 character Salesforce id" };
    }
    filters.evaluationId = evaluationId;
  }
  return { ok: true, filters };
}

export function hasProjectCrmFilters(filters: ProjectCrmFilters): boolean {
  return Boolean(filters.crmOpportunityIds || filters.crmAccountIds || filters.evaluationId);
}

/**
 * Exact check behind the evaluationId filter: the id inside the project's
 * salesforceEvaluationLink is the same record. Storage narrows candidates
 * with a substring match first; this rejects a link where the id only
 * appears as part of something else.
 */
export function evaluationLinkMatches(link: string | null | undefined, evaluationId18: string): boolean {
  const linked = extractSalesforceIdFromUrl(link);
  if (linked) return linked === evaluationId18;
  // Some links are stored as a bare id rather than a URL.
  return typeof link === "string" && toSalesforceId18(link) === evaluationId18;
}
