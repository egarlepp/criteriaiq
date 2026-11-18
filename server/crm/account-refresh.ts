// Keeps linked accounts in step with their CRM account, one way (CRM →
// CriteriaIQ). Three triggers, one write path (applyCrmAccountDetails):
//
//   - Link or create-from-CRM, and the Refresh button: refreshAccountFromCrm,
//     on the signed-in user's CRM connection.
//   - Opening a linked account whose crm_synced_at is over a day old: the
//     same call, with `ifOlderThanMs`.
//   - Nightly, after the link checks: refreshLinkedAccounts. HubSpot reads
//     with the portal token; Salesforce, which has no org-wide connection,
//     reads each account on the connection of the user who linked it
//     (crm_linked_by). Accounts whose linker can't connect wait for the next
//     open by a connected user.
//
// A failed read never changes anything. Only an id the CRM says doesn't
// exist marks the account "CRM record missing"; it keeps its last values.
// The rename goes through storage.updateCustomer, so the account's projects
// follow it (PR 1, migration 120).
import { and, eq, isNotNull } from "drizzle-orm";
import { storage } from "../storage";
import { isExternalRole } from "../lib/internal-access";
import { crmColumnsForUrl } from "../lib/account-crm-link";
import { getSalesforceConnectionForUser } from "../salesforce/salesforce-config-service";
import { getActiveCrmProvider } from "./index";
import { readHubspotAccounts } from "./hubspot-provider";
import { readSalesforceAccounts } from "./salesforce-provider";
import { crmAccountUpdate, crmFieldChanges, type CrmFieldChange, type CrmFieldLookups, type CrmManagedField } from "./account-fields";
import type { CrmAccountDetails, CrmAccountRead } from "./types";

type Customer = NonNullable<Awaited<ReturnType<typeof storage.getCustomer>>>;

export const CRM_REFRESH_STALE_MS = 24 * 60 * 60 * 1000;

/** Industries and the active internal users by email, read once per refresh run. */
export async function loadCrmFieldLookups(): Promise<CrmFieldLookups> {
  const [industries, users] = await Promise.all([storage.getIndustries(), storage.getAllUsers()]);
  const byEmail = new Map<string, string>();
  for (const user of users) {
    if (!user.email || user.isActive === false || isExternalRole(user.role)) continue;
    byEmail.set(user.email.trim().toLowerCase(), user.id);
  }
  return {
    industries: industries.map((i) => ({ id: i.id, name: i.name, isActive: i.isActive })),
    userIdByEmail: (email) => byEmail.get(email) ?? null,
  };
}

/** Copies the CRM-owned fields onto the account and records which ones are now read-only. */
export async function applyCrmAccountDetails(
  customerId: number,
  details: CrmAccountDetails,
  lookups: CrmFieldLookups,
): Promise<Customer> {
  const { values, managed } = crmAccountUpdate(details, lookups);
  return storage.updateCustomer(customerId, {
    ...values,
    crmManagedFields: managed,
    crmSyncedAt: new Date(),
    crmRecordMissingAt: null,
  } as Parameters<typeof storage.updateCustomer>[1]);
}

async function markCrmRecordMissing(customerId: number): Promise<Customer> {
  return storage.updateCustomer(customerId, {
    crmRecordMissingAt: new Date(),
  } as Parameters<typeof storage.updateCustomer>[1]);
}

export type AccountRefreshOutcome =
  | { status: "refreshed" | "missing" | "fresh"; customer: Customer }
  | { status: "not_linked" | "crm_not_active" | "not_connected" | "not_found" };

/**
 * Refreshes one linked account on this user's CRM connection. With
 * `ifOlderThanMs`, an account refreshed more recently is left as it is.
 */
export async function refreshAccountFromCrm(
  customerId: number,
  userId: string,
  options: { ifOlderThanMs?: number } = {},
): Promise<AccountRefreshOutcome> {
  const customer = await storage.getCustomer(customerId);
  if (!customer) return { status: "not_found" };
  if (!customer.crmProvider || !customer.crmAccountId) return { status: "not_linked" };
  const provider = await getActiveCrmProvider();
  if (!provider || provider.id !== customer.crmProvider) return { status: "crm_not_active" };
  if (
    options.ifOlderThanMs !== undefined &&
    customer.crmSyncedAt &&
    Date.now() - new Date(customer.crmSyncedAt).getTime() < options.ifOlderThanMs
  ) {
    return { status: "fresh", customer };
  }
  const session = await provider.connectForUser(userId);
  if (!session) return { status: "not_connected" };

  const read = await session.readAccounts([customer.crmAccountId]);
  const details = read.found.find((d) => d.id === customer.crmAccountId);
  if (details) {
    return { status: "refreshed", customer: await applyCrmAccountDetails(customerId, details, await loadCrmFieldLookups()) };
  }
  if (read.missing.includes(customer.crmAccountId)) {
    return { status: "missing", customer: await markCrmRecordMissing(customerId) };
  }
  return { status: "fresh", customer };
}

export type CrmLinkPreview =
  | {
      ok: true;
      crmProvider: string;
      crmAccountId: string;
      name: string;
      values: ReturnType<typeof crmAccountUpdate>["values"];
      managed: CrmManagedField[];
      changes: CrmFieldChange[];
      /** Another account already linked to this CRM account; saving would be refused. */
      existingAccount: { id: number; accountName: string } | null;
    }
  | { ok: false; status: number; errorCode: string; message: string };

/**
 * What linking an account to this CRM record would change, before saving.
 * Reads the record on the user's own connection; writes nothing.
 */
export async function previewCrmLink(userId: string, url: string, customerId?: number): Promise<CrmLinkPreview> {
  const provider = await getActiveCrmProvider();
  if (!provider) return { ok: false, status: 409, errorCode: "crm_not_active", message: "No CRM is active on this install" };
  const { crmProvider, crmAccountId } = crmColumnsForUrl(url);
  if (!crmProvider || !crmAccountId || crmProvider !== provider.id) {
    return { ok: false, status: 400, errorCode: "crm_link_invalid", message: "That isn't a record link for this install's CRM" };
  }
  const session = await provider.connectForUser(userId);
  if (!session) return { ok: false, status: 401, errorCode: "crm_not_connected", message: "CRM not connected" };

  const read = await session.readAccounts([crmAccountId]);
  const details = read.found.find((d) => d.id === crmAccountId);
  if (!details) {
    return { ok: false, status: 404, errorCode: "crm_record_missing", message: "The CRM has no account with that id" };
  }
  const { values, managed } = crmAccountUpdate(details, await loadCrmFieldLookups());
  const current = customerId ? await storage.getCustomer(customerId) : undefined;
  const changes = crmFieldChanges(
    {
      accountName: current?.accountName ?? null,
      industryId: current?.industryId ?? null,
      region: current?.region ?? null,
      website: current?.website ?? null,
      accountRepresentativeId: current?.accountRepresentativeId ?? null,
    },
    values,
  );
  const existingAccount = await storage.findCustomerByCrmAccount(crmProvider, crmAccountId, customerId);
  return { ok: true, crmProvider, crmAccountId, name: details.name, values, managed, changes, existingAccount: existingAccount ?? null };
}

export interface LinkedAccountsRefreshResult {
  checked: number;
  refreshed: number;
  missing: number;
  /** Salesforce accounts whose linking user has no connection. */
  skipped: number;
  failed: number;
}

type LinkedRow = { id: number; crmAccountId: string; crmLinkedBy: string | null };

async function linkedAccounts(provider: "salesforce" | "hubspot"): Promise<LinkedRow[]> {
  const c = storage.schema.customers;
  const rows = await storage.db
    .select({ id: c.id, crmAccountId: c.crmAccountId, crmLinkedBy: c.crmLinkedBy })
    .from(c)
    .where(and(eq(c.crmProvider, provider), isNotNull(c.crmAccountId), eq(c.isDemo, false)));
  return rows.filter((r): r is LinkedRow => typeof r.crmAccountId === "string" && r.crmAccountId !== "");
}

async function applyRead(
  rows: LinkedRow[],
  read: CrmAccountRead,
  lookups: CrmFieldLookups,
  result: LinkedAccountsRefreshResult,
): Promise<void> {
  const byId = new Map(read.found.map((d) => [d.id, d] as const));
  const missing = new Set(read.missing);
  for (const row of rows) {
    result.checked++;
    const details = byId.get(row.crmAccountId);
    try {
      if (details) {
        await applyCrmAccountDetails(row.id, details, lookups);
        result.refreshed++;
      } else if (missing.has(row.crmAccountId)) {
        await markCrmRecordMissing(row.id);
        result.missing++;
      }
    } catch (error) {
      result.failed++;
      console.error(`[CRM account refresh] account ${row.id} could not be updated:`, error);
    }
  }
}

/** Refreshes every linked account of this CRM. Never throws for one account's failure. */
export async function refreshLinkedAccounts(provider: "salesforce" | "hubspot"): Promise<LinkedAccountsRefreshResult> {
  const result: LinkedAccountsRefreshResult = { checked: 0, refreshed: 0, missing: 0, skipped: 0, failed: 0 };
  const rows = await linkedAccounts(provider);
  if (rows.length === 0) return result;
  const lookups = await loadCrmFieldLookups();

  if (provider === "hubspot") {
    try {
      await applyRead(rows, await readHubspotAccounts(rows.map((r) => r.crmAccountId)), lookups, result);
    } catch (error) {
      result.failed += rows.length;
      console.error("[CRM account refresh] HubSpot read failed:", error);
    }
    return result;
  }

  const byUser = new Map<string, LinkedRow[]>();
  for (const row of rows) {
    if (!row.crmLinkedBy) {
      result.skipped++;
      continue;
    }
    byUser.set(row.crmLinkedBy, [...(byUser.get(row.crmLinkedBy) ?? []), row]);
  }
  for (const [userId, list] of byUser) {
    let conn: Awaited<ReturnType<typeof getSalesforceConnectionForUser>>;
    try {
      conn = await getSalesforceConnectionForUser(userId);
    } catch {
      result.skipped += list.length;
      continue;
    }
    try {
      await applyRead(list, await readSalesforceAccounts(conn, list.map((r) => r.crmAccountId)), lookups, result);
    } catch (error) {
      result.failed += list.length;
      console.error(`[CRM account refresh] Salesforce read for user ${userId} failed:`, error);
    }
  }
  return result;
}

export function describeAccountRefresh(result: LinkedAccountsRefreshResult): string {
  return (
    `accounts: ${result.refreshed} refreshed, ${result.missing} missing in the CRM` +
    (result.skipped > 0 ? `, ${result.skipped} waiting for a connected user` : "") +
    (result.failed > 0 ? `, ${result.failed} failed` : "")
  );
}
