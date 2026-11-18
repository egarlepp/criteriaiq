// Account Users from CRM contacts (PR 6 of the CRM-linked accounts plan,
// docs/features/crm-provider.md). A linked account's CRM contacts can be
// ticked into Account Users and stay in step one way; importing only makes
// a profile. Login access is a separate, deliberate Invite, so a CRM edit
// can never grant or change anyone's login.
//
//   - Imported users start as role Customer, inactive and not approved.
//   - Name and title follow the contact. The email is the login: a CRM
//     change is stored in crm_email for an Admin to accept, never applied.
//   - A contact deleted in the CRM or moved off the account is flagged
//     (crm_contact_missing_at), never deactivated.
//   - Unticking stops the sync; the user stays, as added in CriteriaIQ.
//
// Reads run on the signed-in user's CRM connection; the nightly refresh
// uses the HubSpot portal token, or for Salesforce the connection of the
// user who linked the account.
import { storage } from "../storage";
import { getActiveCrmProvider } from "./index";
import { hubspotContactsForAccount } from "./hubspot-provider";
import { salesforceContactsForAccount } from "./salesforce-provider";
import { getSalesforceConnectionForUser } from "../salesforce/salesforce-config-service";
import { HubspotError } from "../hubspot/client";
import { emailDomainOf } from "../lib/personal-email-domains";
import { toPageValues } from "@shared/permissions";
import { sendWelcomeEmail } from "../email/email";
import { canImport, contactEligibility, type ContactBlockReason, type ContactState, type ContactUserFacts } from "./contact-eligibility";
import type { CrmContact } from "./types";
import type { User } from "@shared/schema";

type Customer = NonNullable<Awaited<ReturnType<typeof storage.getCustomer>>>;

export const IMPORTED_CONTACT_ROLE = "Customer";
/** Upper bound on contacts imported in one request. */
export const MAX_IMPORT = 100;

export interface CrmContactRow extends CrmContact {
  state: ContactState;
  reason?: ContactBlockReason;
  userId?: string;
  /** The imported user's status, for the panel's badges and actions. */
  user?: { isActive: boolean; crmEmail: string | null };
}

/** An imported user whose contact is no longer on the CRM account. */
export interface MissingContactUser {
  userId: string;
  name: string;
  email: string | null;
}

type Refusal = "not_found" | "not_linked" | "crm_not_active" | "not_connected" | "scope_missing";

export type ContactListResult =
  | { status: "ok"; crmProvider: string; contacts: CrmContactRow[]; missing: MissingContactUser[] }
  | { status: Refusal };

export type ImportOutcome = { contactId: string; outcome: "imported" | "linked" | "skipped"; reason?: ContactBlockReason | "notAllowed" | "notFound"; userId?: string };

export type ImportResult = { status: "ok"; results: ImportOutcome[] } | { status: Refusal };

function facts(user: User): ContactUserFacts {
  return {
    id: user.id,
    accountId: user.accountId ?? null,
    role: user.role ?? null,
    crmProvider: user.crmProvider ?? null,
    crmContactId: user.crmContactId ?? null,
  };
}

function displayName(user: Pick<User, "firstName" | "lastName" | "email">): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || "";
}

/** The account and its CRM link, or why there is nothing to read. */
async function linkedAccount(customerId: number): Promise<{ customer: Customer; provider: "salesforce" | "hubspot"; crmAccountId: string } | { status: Refusal }> {
  const customer = await storage.getCustomer(customerId);
  if (!customer) return { status: "not_found" };
  const provider = await getActiveCrmProvider();
  if (!provider) return { status: "crm_not_active" };
  if (!customer.crmAccountId || customer.crmProvider !== provider.id) return { status: "not_linked" };
  return { customer, provider: provider.id, crmAccountId: customer.crmAccountId };
}

/** The account's contacts on the user's own connection; null when not connected. */
async function readContacts(userId: string, crmAccountId: string): Promise<CrmContact[] | null> {
  const provider = await getActiveCrmProvider();
  const session = provider ? await provider.connectForUser(userId) : null;
  if (!session) return null;
  return session.contactsForAccount(crmAccountId);
}

function isScopeError(error: unknown): boolean {
  return error instanceof HubspotError && error.code === "forbidden";
}

/** Whether each domain belongs to the internal account. */
async function internalDomains(contacts: CrmContact[]): Promise<Set<string>> {
  const domains = Array.from(new Set(contacts.map((c) => emailDomainOf(c.email)).filter(Boolean)));
  const internal = new Set<string>();
  for (const domain of domains) {
    if (await storage.getInternalAccountForEmailDomain(domain)) internal.add(domain);
  }
  return internal;
}

async function classify(customer: Customer, provider: string, contacts: CrmContact[]) {
  const [imported, byEmail, internal] = await Promise.all([
    storage.getUsersByCrmContacts(provider, contacts.map((c) => c.id)),
    storage.findUsersByEmails(contacts.map((c) => c.email ?? "").filter(Boolean)),
    internalDomains(contacts),
  ]);
  const importedById = new Map(imported.map((u) => [u.crmContactId!, u] as const));
  const userByEmail = new Map(byEmail.map((u) => [(u.email ?? "").toLowerCase(), u] as const));
  return contacts.map((contact) => {
    const importedUser = importedById.get(contact.id) ?? null;
    const emailUser = contact.email ? (userByEmail.get(contact.email.trim().toLowerCase()) ?? null) : null;
    const domain = emailDomainOf(contact.email);
    const verdict = contactEligibility({
      contactId: contact.id,
      email: contact.email,
      crmProvider: provider,
      customerId: customer.id,
      approvedDomains: customer.approvedEmailDomains ?? [],
      internalDomain: !!domain && internal.has(domain),
      importedUser: importedUser && importedUser.accountId === customer.id ? facts(importedUser) : null,
      emailUser: emailUser ? facts(emailUser) : null,
    });
    return { contact, verdict, user: importedUser ?? emailUser };
  });
}

/**
 * Brings the account's imported users in step with its contacts: name and
 * title copied, a different email recorded, a contact gone flagged.
 */
export async function syncContactUsers(customerId: number, provider: string, contacts: CrmContact[]): Promise<{ synced: number; flagged: number }> {
  const users = await storage.getCrmContactUsersForAccount(customerId, provider);
  const byId = new Map(contacts.map((c) => [c.id, c] as const));
  const now = new Date();
  let synced = 0;
  let flagged = 0;
  for (const user of users) {
    const contact = byId.get(user.crmContactId!);
    if (!contact) {
      if (!user.crmContactMissingAt) {
        await storage.updateUser(user.id, { crmContactMissingAt: now });
        flagged++;
      }
      continue;
    }
    const crmEmail = contact.email && contact.email.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase() ? contact.email.trim() : null;
    await storage.updateUser(user.id, {
      firstName: contact.firstName ?? user.firstName,
      lastName: contact.lastName ?? user.lastName,
      title: contact.title ?? user.title,
      crmEmail,
      crmContactMissingAt: null,
      crmSyncedAt: now,
    });
    synced++;
  }
  return { synced, flagged };
}

/** The account's CRM contacts with what each one is to CriteriaIQ. Refreshes imported users on the way. */
export async function listAccountContacts(customerId: number, userId: string): Promise<ContactListResult> {
  const link = await linkedAccount(customerId);
  if ("status" in link) return link;
  let contacts: CrmContact[] | null;
  try {
    contacts = await readContacts(userId, link.crmAccountId);
  } catch (error) {
    if (isScopeError(error)) return { status: "scope_missing" };
    throw error;
  }
  if (!contacts) return { status: "not_connected" };

  await syncContactUsers(customerId, link.provider, contacts);
  const classified = await classify(link.customer, link.provider, contacts);
  const rows: CrmContactRow[] = classified
    // Staff aren't Account Users: internal-domain contacts aren't offered.
    .filter((c) => c.verdict.reason !== "internalDomain")
    .map(({ contact, verdict, user }) => ({
      ...contact,
      state: verdict.state,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      ...(verdict.userId ? { userId: verdict.userId } : {}),
      ...(verdict.state === "imported" && user ? { user: { isActive: user.isActive !== false, crmEmail: user.crmEmail ?? null } } : {}),
    }));
  const present = new Set(contacts.map((c) => c.id));
  const missing = (await storage.getCrmContactUsersForAccount(customerId, link.provider))
    .filter((u) => !present.has(u.crmContactId!))
    .map((u) => ({ userId: u.id, name: displayName(u), email: u.email ?? null }));
  return { status: "ok", crmProvider: link.provider, contacts: rows, missing };
}

/** A new user's starting page permissions: its role's (Role Management), as POST /api/users does. */
async function copyRolePermissions(userId: string, role: string): Promise<void> {
  try {
    const roleRow = await storage.getRoleByName(role);
    if (!roleRow) return;
    const defaults = toPageValues(await storage.getRolePermissions(roleRow.id));
    if (defaults.length > 0) await storage.setUserPermissions(userId, defaults);
  } catch (error) {
    console.error("[CRM contacts] could not copy role permissions to an imported user:", error);
  }
}

function newUserId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Imports the ticked contacts. The contacts are read again from the CRM,
 * never taken from the request, and each one is checked with the same
 * rules the list shows.
 */
export async function importAccountContacts(
  customerId: number,
  contactIds: string[],
  actor: { id: string; role: string | null | undefined },
): Promise<ImportResult> {
  const link = await linkedAccount(customerId);
  if ("status" in link) return link;
  let contacts: CrmContact[] | null;
  try {
    contacts = await readContacts(actor.id, link.crmAccountId);
  } catch (error) {
    if (isScopeError(error)) return { status: "scope_missing" };
    throw error;
  }
  if (!contacts) return { status: "not_connected" };

  const wanted = Array.from(new Set(contactIds)).slice(0, MAX_IMPORT);
  const byId = new Map((await classify(link.customer, link.provider, contacts)).map((c) => [c.contact.id, c] as const));
  const isAdmin = actor.role === "Admin";
  const now = new Date();
  const results: ImportOutcome[] = [];
  for (const contactId of wanted) {
    const entry = byId.get(contactId);
    if (!entry) {
      results.push({ contactId, outcome: "skipped", reason: "notFound" });
      continue;
    }
    const { contact, verdict } = entry;
    if (verdict.state === "imported") {
      results.push({ contactId, outcome: "skipped", userId: verdict.userId });
      continue;
    }
    if (!canImport(verdict.state, isAdmin)) {
      results.push({ contactId, outcome: "skipped", reason: verdict.reason ?? "notAllowed" });
      continue;
    }
    const crm = { crmProvider: link.provider, crmContactId: contact.id, crmSyncedAt: now, crmEmail: null, crmContactMissingAt: null };
    if (verdict.state === "linkable" && verdict.userId) {
      // Already a user of this account: link, don't duplicate. Their access stays as it is.
      await storage.updateUser(verdict.userId, {
        ...crm,
        firstName: contact.firstName ?? undefined,
        lastName: contact.lastName ?? undefined,
        title: contact.title ?? undefined,
      });
      results.push({ contactId, outcome: "linked", userId: verdict.userId });
      continue;
    }
    const created = await storage.createUser({
      id: newUserId(),
      email: contact.email!.trim(),
      firstName: contact.firstName ?? contact.email!.trim(),
      lastName: contact.lastName ?? null,
      title: contact.title ?? null,
      accountId: customerId,
      allAccountsAccess: false,
      role: IMPORTED_CONTACT_ROLE,
      // A profile only: no login until someone clicks Invite.
      isActive: false,
      isApproved: false,
      createdBy: actor.id,
      ...crm,
    } as never);
    await copyRolePermissions(created.id, IMPORTED_CONTACT_ROLE);
    results.push({ contactId, outcome: "imported", userId: created.id });
  }
  return { status: "ok", results };
}

/** The user, when it is one of this account's CRM-imported users. */
async function accountContactUser(customerId: number, userId: string): Promise<User | null> {
  const user = await storage.getUser(userId);
  return user && user.accountId === customerId && user.crmContactId ? user : null;
}

/** Unticking: the user stays, as added in CriteriaIQ, and keeps their access. */
export async function stopContactSync(customerId: number, userId: string): Promise<"stopped" | "not_found"> {
  if (!(await accountContactUser(customerId, userId))) return "not_found";
  await storage.updateUser(userId, { crmProvider: null, crmContactId: null, crmSyncedAt: null, crmEmail: null, crmContactMissingAt: null });
  return "stopped";
}

/** An Admin takes the CRM's new email as the login. */
export async function acceptCrmEmail(customerId: number, userId: string): Promise<"accepted" | "not_found" | "no_change" | "email_taken"> {
  const user = await accountContactUser(customerId, userId);
  if (!user) return "not_found";
  const next = user.crmEmail?.trim();
  if (!next) return "no_change";
  const [holder] = await storage.findUsersByEmails([next]);
  if (holder && holder.id !== user.id) return "email_taken";
  await storage.updateUser(userId, { email: next, crmEmail: null });
  return "accepted";
}

/** Invite: login access for an imported user, and the welcome email. */
export async function inviteContactUser(customerId: number, userId: string, actorId: string): Promise<"invited" | "not_found" | "already_active"> {
  const user = await accountContactUser(customerId, userId);
  if (!user) return "not_found";
  if (user.isActive !== false && user.isApproved) return "already_active";
  const updated = await storage.updateUser(userId, { isActive: true, isApproved: true, approvedBy: actorId, approvedAt: new Date() });
  try {
    await sendWelcomeEmail({ email: updated.email, firstName: updated.firstName, lastName: updated.lastName, role: updated.role });
  } catch (error) {
    // Access is granted either way; the email can be resent by resetting the password.
    console.error("[CRM contacts] the welcome email for an invited contact failed:", error);
  }
  return "invited";
}

export interface ContactUsersRefreshResult {
  accounts: number;
  synced: number;
  flagged: number;
  skipped: number;
  failed: number;
}

/** Nightly: every account with imported users of this CRM. Never throws for one account. */
export async function refreshContactUsers(provider: "salesforce" | "hubspot"): Promise<ContactUsersRefreshResult> {
  const result: ContactUsersRefreshResult = { accounts: 0, synced: 0, flagged: 0, skipped: 0, failed: 0 };
  for (const customerId of await storage.getAccountIdsWithCrmContactUsers(provider)) {
    const customer = await storage.getCustomer(customerId);
    if (!customer?.crmAccountId || customer.crmProvider !== provider) continue;
    result.accounts++;
    try {
      let contacts: CrmContact[];
      if (provider === "hubspot") {
        contacts = await hubspotContactsForAccount(customer.crmAccountId);
      } else {
        if (!customer.crmLinkedBy) {
          result.skipped++;
          continue;
        }
        let conn: Awaited<ReturnType<typeof getSalesforceConnectionForUser>>;
        try {
          conn = await getSalesforceConnectionForUser(customer.crmLinkedBy);
        } catch {
          result.skipped++;
          continue;
        }
        contacts = await salesforceContactsForAccount(conn, customer.crmAccountId);
      }
      const counts = await syncContactUsers(customerId, provider, contacts);
      result.synced += counts.synced;
      result.flagged += counts.flagged;
    } catch (error) {
      result.failed++;
      console.error(`[CRM contacts] refresh of account ${customerId} failed:`, error);
    }
  }
  return result;
}

export function describeContactRefresh(result: ContactUsersRefreshResult): string {
  return (
    `contacts: ${result.synced} synced, ${result.flagged} newly missing in the CRM` +
    (result.skipped > 0 ? `, ${result.skipped} accounts waiting for a connected user` : "") +
    (result.failed > 0 ? `, ${result.failed} accounts failed` : "")
  );
}
