// Salesforce behind the CrmProvider interface. A thin adapter: each method
// runs the same query the /api/salesforce routes ran before Phase 1, so
// Salesforce behavior is unchanged (server/crm/__tests__/salesforce-provider
// pins the SOQL text).
import { isSalesforceId } from "@shared/crm-record-id";
import { salesforceConfigService, getSalesforceConnectionForUser } from "../salesforce/salesforce-config-service";
import { salesforceLinkageService } from "../salesforce/salesforce-linkage-service";
import type { CrmAccountDetails, CrmAccountRead, CrmContact, CrmProvider, CrmUserSession, CrmValidationRecord } from "./types";

type Connection = Awaited<ReturnType<typeof getSalesforceConnectionForUser>>;

/** getSalesforceConnectionForUser throws this when the user has no tokens. */
function isNotConnected(error: unknown): boolean {
  return error instanceof Error && error.message.includes("not connected");
}

async function validationRecordsForOpportunity(conn: Connection, opportunityId: string): Promise<CrmValidationRecord[]> {
  const objectApiName = await salesforceConfigService.getEvaluationObjectApiName();
  // `url` is the record link the project form stores in
  // salesforceEvaluationLink, so the record id can be read back from it
  // (GET /api/projects?evaluationId=...).
  const toRecord = (r: { Id: string; Name: string }): CrmValidationRecord => ({
    id: r.Id,
    name: r.Name,
    url: conn.instanceUrl ? `${conn.instanceUrl.replace(/\/$/, "")}/${r.Id}` : null,
  });

  // The lookup field is configurable (Admin › Integrations › Overview ›
  // Validation Record). For the default Opportunity__c, also try
  // OpportunityId__c, the older fallback.
  const lookupField = await salesforceConfigService.getEvaluationOpportunityLookupField();
  const candidates = lookupField === "Opportunity__c" ? ["Opportunity__c", "OpportunityId__c"] : [lookupField];

  for (const field of candidates) {
    try {
      const result = await conn.query<{ Id: string; Name: string }>(
        `SELECT Id, Name FROM ${objectApiName} WHERE ${field} = '${opportunityId}' ORDER BY LastModifiedDate DESC LIMIT 50`,
      );
      return (result.records || []).map(toRecord);
    } catch (soqlError) {
      console.warn(
        `[salesforce] evaluations lookup on ${objectApiName}.${field} failed:`,
        soqlError instanceof Error ? soqlError.message : soqlError,
      );
    }
  }
  return [];
}

/** SOQL IN-list size for Account reads (well under the query length limit). */
const ACCOUNT_CHUNK = 200;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The CRM-owned fields of these Accounts, read on one user's connection.
 * Only Salesforce ids reach the SOQL. An Account the query doesn't return
 * (deleted, or in the Recycle Bin) is "missing"; a failed query throws, so
 * an outage never marks anything missing.
 */
export async function readSalesforceAccounts(conn: Connection, ids: string[]): Promise<CrmAccountRead> {
  const wanted = Array.from(new Set(ids.filter((id) => isSalesforceId(id))));
  const out: CrmAccountRead = { found: [], missing: [] };
  for (let i = 0; i < wanted.length; i += ACCOUNT_CHUNK) {
    const part = wanted.slice(i, i + ACCOUNT_CHUNK);
    const result = await conn.query<{
      Id: string;
      Name?: unknown;
      Industry?: unknown;
      BillingCountry?: unknown;
      Website?: unknown;
      Owner?: { Email?: unknown } | null;
    }>(
      `SELECT Id, Name, Industry, BillingCountry, Website, Owner.Email FROM Account WHERE Id IN (${part.map((id) => `'${id}'`).join(",")})`,
    );
    // Salesforce answers with 18-character ids; match on the first 15 too.
    const byPrefix = new Map(part.map((id) => [id.slice(0, 15), id] as const));
    const seen = new Set<string>();
    for (const row of result.records ?? []) {
      const requested = byPrefix.get(String(row.Id).slice(0, 15));
      if (!requested) continue;
      seen.add(requested);
      const details: CrmAccountDetails = {
        id: requested,
        name: text(row.Name) ?? requested,
        industry: text(row.Industry),
        country: text(row.BillingCountry),
        website: text(row.Website),
        ownerEmail: text(row.Owner?.Email),
      };
      out.found.push(details);
    }
    for (const id of part) if (!seen.has(id)) out.missing.push(id);
  }
  return out;
}

/** Upper bound on Contacts read for one Account. */
const CONTACT_LIMIT = 500;

/** The Contacts on one Account. Only a Salesforce id reaches the SOQL. */
export async function salesforceContactsForAccount(conn: Connection, accountId: string): Promise<CrmContact[]> {
  if (!isSalesforceId(accountId)) throw new Error("Not a Salesforce id");
  const result = await conn.query<{ Id: string; FirstName?: unknown; LastName?: unknown; Email?: unknown; Title?: unknown }>(
    `SELECT Id, FirstName, LastName, Email, Title FROM Contact WHERE AccountId = '${accountId}' ORDER BY LastName, FirstName LIMIT ${CONTACT_LIMIT}`,
  );
  return (result.records ?? []).map((row) => ({
    id: String(row.Id),
    firstName: text(row.FirstName),
    lastName: text(row.LastName),
    email: text(row.Email),
    title: text(row.Title),
  }));
}

export const salesforceProvider: CrmProvider = {
  id: "salesforce",

  isRecordId: isSalesforceId,

  async connectForUser(userId: string): Promise<CrmUserSession | null> {
    let conn: Connection;
    try {
      conn = await getSalesforceConnectionForUser(userId);
    } catch (error) {
      if (isNotConnected(error)) return null;
      throw error;
    }
    return {
      opportunitiesForAccount: (accountName) => salesforceLinkageService.searchOpportunities(userId, "", accountName, 50),
      opportunitiesForAccountId: (accountId) => salesforceLinkageService.opportunitiesForAccountId(userId, accountId, 50),
      searchAccounts: async (term) => {
        const base = conn.instanceUrl ? conn.instanceUrl.replace(/\/$/, "") : null;
        const rows = await salesforceLinkageService.searchAccounts(userId, term, 20);
        return rows.map((r) => ({ id: r.id, name: r.name, url: base ? `${base}/${r.id}` : null }));
      },
      readAccounts: (ids) => readSalesforceAccounts(conn, ids),
      contactsForAccount: (accountId) => salesforceContactsForAccount(conn, accountId),
      validationRecordsForOpportunity: (opportunityId) => {
        // Only a Salesforce id may reach the SOQL.
        if (!isSalesforceId(opportunityId)) throw new Error("Not a Salesforce id");
        return validationRecordsForOpportunity(conn, opportunityId);
      },
    };
  },
};
