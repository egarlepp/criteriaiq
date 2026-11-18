// Which CRM contacts of a linked account may become its Account Users
// (PR 6 of the CRM-linked accounts plan; rules confirmed by Eric,
// 2026-11-02). Pure, so the list and the import apply the same rules.
//
//   - No email, or a personal/disposable domain: never.
//   - A domain of the internal account: never offered (staff aren't
//     Account Users).
//   - Already a user: linked when that user is an outside user of this
//     account and not tied to another contact; otherwise refused.
//   - A domain that isn't one of the account's approved domains: Admin only.
import { emailDomainOf, isPersonalEmailDomain } from "../lib/personal-email-domains";
import { isExternalRole } from "../lib/internal-access";

export type ContactState =
  /** Already imported: this user came from this contact. */
  | "imported"
  /** An outside user of this account has this email; importing links them. */
  | "linkable"
  /** Importable by anyone who can edit the account. */
  | "available"
  /** The domain isn't approved for the account: only an Admin imports it. */
  | "adminOnly"
  | "blocked";

export type ContactBlockReason = "noEmail" | "personalDomain" | "internalDomain" | "otherAccount" | "linkedElsewhere";

export interface ContactUserFacts {
  id: string;
  accountId: number | null;
  role: string | null;
  crmProvider: string | null;
  crmContactId: string | null;
}

export interface ContactEligibilityInput {
  contactId: string;
  email: string | null;
  crmProvider: string;
  customerId: number;
  approvedDomains: readonly string[];
  /** Whether the email's domain belongs to the internal account. */
  internalDomain: boolean;
  /** The user already imported from this contact, if any. */
  importedUser: ContactUserFacts | null;
  /** The user whose email matches, if any. */
  emailUser: ContactUserFacts | null;
}

export interface ContactEligibility {
  state: ContactState;
  reason?: ContactBlockReason;
  userId?: string;
}

export function normalizeDomains(domains: readonly string[] | null | undefined): string[] {
  return (domains ?? []).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
}

export function contactEligibility(input: ContactEligibilityInput): ContactEligibility {
  if (input.importedUser) return { state: "imported", userId: input.importedUser.id };

  const domain = emailDomainOf(input.email);
  if (!domain) return { state: "blocked", reason: "noEmail" };
  if (isPersonalEmailDomain(domain)) return { state: "blocked", reason: "personalDomain" };
  if (input.internalDomain) return { state: "blocked", reason: "internalDomain" };

  const existing = input.emailUser;
  if (existing) {
    if (existing.accountId !== input.customerId || !isExternalRole(existing.role ?? undefined)) {
      return { state: "blocked", reason: "otherAccount" };
    }
    if (existing.crmContactId && !(existing.crmProvider === input.crmProvider && existing.crmContactId === input.contactId)) {
      return { state: "blocked", reason: "linkedElsewhere" };
    }
    return { state: "linkable", userId: existing.id };
  }

  return normalizeDomains(input.approvedDomains).includes(domain) ? { state: "available" } : { state: "adminOnly" };
}

/** Whether this actor may import a contact in this state. */
export function canImport(state: ContactState, isAdmin: boolean): boolean {
  return state === "available" || state === "linkable" || (state === "adminOnly" && isAdmin);
}
