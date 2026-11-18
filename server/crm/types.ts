// The CRM provider boundary (Phase 1, PR 2; ImpactIQ's services/crm/types.ts
// is the model). Routes and screens ask the active provider for CRM work
// instead of calling Salesforce code directly. Below it the Salesforce
// provider calls the same services the routes used before, unchanged;
// HubSpot is the second implementation (hubspot-provider.ts).
//
// Record shapes use CriteriaIQ's canonical kinds (Opportunity, Account, the
// validation record) with the field names the client already reads. A
// provider translates its own objects (Deal → Opportunity, Company →
// Account) at this boundary.
import type { CrmProvider as CrmProviderName } from "@shared/crm-record-id";

export interface CrmOpportunity {
  id: string;
  name: string;
  accountName?: string;
  accountId?: string;
  ownerName?: string;
  ownerId?: string;
  stageName?: string;
  amount?: number;
  closeDate?: string;
  type?: string;
}

/** An Account (HubSpot Company) as the account form links it. */
export interface CrmAccount {
  id: string;
  name: string;
  /** Link to the record in the CRM; the account form stores it. */
  url: string | null;
}

/**
 * The CRM-owned fields of one Account (HubSpot Company), as a linked
 * account copies them (server/crm/account-refresh.ts). Free text as the CRM
 * holds it; the refresh maps industry, country and owner to CriteriaIQ.
 */
export interface CrmAccountDetails {
  id: string;
  name: string;
  industry: string | null;
  country: string | null;
  website: string | null;
  ownerEmail: string | null;
}

/** A batch read of Accounts: what was found, and the ids the CRM says don't exist. */
export interface CrmAccountRead {
  found: CrmAccountDetails[];
  /** Ids the CRM answered "not found" for. An id in neither list is unknown (left alone). */
  missing: string[];
}

/** A Contact on an Account (HubSpot: a contact associated with the Company). */
export interface CrmContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
}

/** The CRM record that holds a technical validation (Evaluation, POC, …). */
export interface CrmValidationRecord {
  id: string;
  name: string;
  /** Link to the record in the CRM; the project form stores it. */
  url: string | null;
}

/**
 * One signed-in user's live CRM access. Reads run as that user (their own
 * connection and permissions), never as an admin connection.
 */
export interface CrmUserSession {
  /** Opportunities (Deals) whose Account (Company) name contains `accountName`. */
  opportunitiesForAccount(accountName: string): Promise<CrmOpportunity[]>;
  /**
   * Opportunities (Deals) of one Account (Company), by its CRM id, for a
   * project whose account is linked. The caller has checked the id.
   */
  opportunitiesForAccountId(accountId: string): Promise<CrmOpportunity[]>;
  /**
   * Validation records linked to one Opportunity (Deal). The caller has
   * already checked the id with isRecordId().
   */
  validationRecordsForOpportunity(opportunityId: string): Promise<CrmValidationRecord[]>;
  /** Accounts (Companies) whose name contains `term`, newest first. */
  searchAccounts(term: string): Promise<CrmAccount[]>;
  /** The CRM-owned fields of these Accounts (Companies). The caller has checked the ids. */
  readAccounts(ids: string[]): Promise<CrmAccountRead>;
  /**
   * The Contacts on one Account (Company), by its id. The caller has checked
   * the id. HubSpot throws HubspotError("forbidden") when the private app
   * lacks the contacts read scope.
   */
  contactsForAccount(accountId: string): Promise<CrmContact[]>;
}

export interface CrmProvider {
  readonly id: CrmProviderName;
  /** Whether a string is shaped like this CRM's record ids (checked before it reaches the CRM). */
  isRecordId(id: string): boolean;
  /** Null when the user hasn't connected this CRM (or their token is gone). */
  connectForUser(userId: string): Promise<CrmUserSession | null>;
}
