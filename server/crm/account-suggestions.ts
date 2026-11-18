// Suggested CRM matches for an unlinked account (PR 4 of the CRM-linked
// accounts plan). Computed when someone opens the account, on that user's
// own CRM connection, never by a crawler and never stored. A person links
// or dismisses each one; dismissals are kept (account_crm_dismissals).
//
// With no CRM, or when the user hasn't connected theirs, there is nothing
// to suggest.
import { storage } from "../storage";
import { getActiveCrmProvider } from "./index";
import { rankCrmMatches, searchTermsFor, type CrmMatch, type MatchCandidate } from "./account-matching";

/** Upper bound on CRM accounts read per lookup (two searches of 20). */
const MAX_CANDIDATES = 40;

export type CrmSuggestionsResult =
  | { status: "ok"; suggestions: CrmMatch[] }
  | { status: "not_found" | "linked" | "internal" | "crm_not_active" | "not_connected" };

export async function suggestCrmMatches(customerId: number, userId: string): Promise<CrmSuggestionsResult> {
  const customer = await storage.getCustomer(customerId);
  if (!customer) return { status: "not_found" };
  const provider = await getActiveCrmProvider();
  if (!provider) return { status: "crm_not_active" };
  if (customer.crmAccountId && customer.crmProvider === provider.id) return { status: "linked" };
  if (customer.isInternal) return { status: "internal" };
  const session = await provider.connectForUser(userId);
  if (!session) return { status: "not_connected" };

  const found = new Map<string, { id: string; name: string; url: string | null }>();
  for (const term of searchTermsFor(customer.accountName)) {
    for (const account of await session.searchAccounts(term)) {
      if (found.size >= MAX_CANDIDATES) break;
      if (!found.has(account.id)) found.set(account.id, account);
    }
  }
  if (found.size === 0) return { status: "ok", suggestions: [] };

  const ids = Array.from(found.keys());
  const [details, linked, dismissed] = await Promise.all([
    session.readAccounts(ids),
    storage.getLinkedCrmAccountIds(provider.id, ids),
    storage.getCrmDismissals(customerId, provider.id),
  ]);
  const websites = new Map(details.found.map((d) => [d.id, d.website] as const));
  const candidates: MatchCandidate[] = ids.map((id) => {
    const account = found.get(id)!;
    return { id, name: account.name, url: account.url, website: websites.get(id) ?? null };
  });
  const exclude = new Set<string>([...linked, ...dismissed, ...details.missing]);
  const domains = customer.approvedEmailDomains ?? [];
  return {
    status: "ok",
    suggestions: rankCrmMatches({ accountName: customer.accountName, approvedEmailDomains: domains }, candidates, exclude),
  };
}

/** "Not this one": the pair isn't suggested again. */
export async function dismissCrmMatch(
  customerId: number,
  crmAccountId: string,
  userId: string,
): Promise<"dismissed" | "not_found" | "crm_not_active" | "invalid_id"> {
  if (!(await storage.getCustomer(customerId))) return "not_found";
  const provider = await getActiveCrmProvider();
  if (!provider) return "crm_not_active";
  if (!provider.isRecordId(crmAccountId)) return "invalid_id";
  await storage.addCrmDismissal(customerId, provider.id, crmAccountId, userId);
  return "dismissed";
}
