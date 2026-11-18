// What CriteriaIQ tells ImpactIQ about a project for its activity count
// (ImpactIQ POST /api/v1/effort/project-counts): the CriteriaIQ id, the CRM
// project record behind the project's Evaluation link, the Opportunity and
// the dates. Only these fields leave CriteriaIQ.
import { extractSalesforceIdFromUrl, toSalesforceId18 } from "@shared/crm-record-id";
import type { ImpactiqProjectRef } from "./client";

const CRM_ID_RX = /^[A-Za-z0-9]{1,40}$/;
// HubSpot record pages: https://app.hubspot.com/contacts/<portal>/record/<objectType>/<id>
const HUBSPOT_RECORD_RX = /\/record\/[^/?#]+\/(\d{1,30})(?:[/?#]|$)/;

export interface ProjectRefSource {
  id: number;
  crmProvider?: string | null;
  crmOpportunityId?: string | null;
  salesforceEvaluationLink?: string | null;
  startDate?: Date | string | null;
  endDate?: Date | string | null;
}

/** The CRM record id inside a project's Evaluation link, or null. */
export function crmProjectIdFromLink(link: string | null | undefined, crmProvider: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (crmProvider === "hubspot") {
    const match = HUBSPOT_RECORD_RX.exec(trimmed);
    if (match) return match[1]!;
    return /^\d{1,30}$/.test(trimmed) ? trimmed : null;
  }
  return extractSalesforceIdFromUrl(trimmed) ?? toSalesforceId18(trimmed);
}

function isoDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function toImpactiqProjectRef(project: ProjectRefSource): ImpactiqProjectRef {
  const opp = project.crmOpportunityId?.trim() ?? "";
  const crmProjectId = crmProjectIdFromLink(project.salesforceEvaluationLink, project.crmProvider);
  return {
    criteriaiqProjectId: project.id,
    crmProjectId: crmProjectId && CRM_ID_RX.test(crmProjectId) ? crmProjectId : null,
    crmOpportunityId: CRM_ID_RX.test(opp) ? opp : null,
    startDate: isoDay(project.startDate),
    endDate: isoDay(project.endDate),
  };
}
