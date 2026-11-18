// Picking a CRM account on Create Project (PR 5 of the CRM-linked accounts
// plan). The account picker's CRM mode searches the CRM; the pick comes
// here before anything is created:
//
//   - a CriteriaIQ account already linked to it → the form selects that one;
//   - otherwise → the CRM's values for a new account, plus CriteriaIQ
//     accounts that look like it (same email domain, same or close name),
//     so a person links an existing account instead of making a duplicate.
//
// Reads on the user's own CRM connection; writes nothing.
import { storage } from "../storage";
import { getActiveCrmProvider } from "./index";
import { crmColumnsForUrl } from "../lib/account-crm-link";
import { crmAccountUpdate, type CrmAccountValues } from "./account-fields";
import { loadCrmFieldLookups } from "./account-refresh";
import { matchCandidate, MAX_SUGGESTIONS, type MatchReason, type MatchStrength } from "./account-matching";

export interface CrmLookalike {
  id: number;
  accountName: string;
  isActive: boolean;
  strength: MatchStrength;
  reason: MatchReason;
}

export type CrmAccountResolution =
  | { ok: true; status: "linked"; customer: { id: number; accountName: string } }
  | {
      ok: true;
      status: "new";
      crmProvider: string;
      crmAccountId: string;
      url: string;
      name: string;
      values: CrmAccountValues;
      managed: string[];
      lookalikes: CrmLookalike[];
    }
  | { ok: false; status: number; errorCode: string; message: string };

const STRENGTH_RANK: Record<MatchStrength, number> = { strong: 0, likely: 1, possible: 2 };

/** CriteriaIQ accounts that look like this CRM account, strongest first. */
export function rankLookalikes(
  crm: { id: string; name: string; website: string | null },
  accounts: Array<{ id: number; accountName: string; approvedEmailDomains: string[] | null; isActive: boolean }>,
  limit = MAX_SUGGESTIONS,
): CrmLookalike[] {
  const out: Array<CrmLookalike & { score: number }> = [];
  for (const account of accounts) {
    const match = matchCandidate(
      { accountName: account.accountName, approvedEmailDomains: account.approvedEmailDomains },
      { id: crm.id, name: crm.name, url: null, website: crm.website },
    );
    if (match) {
      out.push({
        id: account.id,
        accountName: account.accountName,
        isActive: account.isActive,
        strength: match.strength,
        reason: match.reason,
        score: match.score,
      });
    }
  }
  return out
    .sort(
      (a, b) =>
        STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength] ||
        b.score - a.score ||
        a.accountName.localeCompare(b.accountName),
    )
    .slice(0, limit)
    .map(({ score: _score, ...rest }) => rest);
}

export async function resolveCrmAccount(userId: string, url: string): Promise<CrmAccountResolution> {
  const provider = await getActiveCrmProvider();
  if (!provider) return { ok: false, status: 409, errorCode: "crm_not_active", message: "No CRM is active on this install" };
  const { crmProvider, crmAccountId } = crmColumnsForUrl(url);
  if (!crmProvider || !crmAccountId || crmProvider !== provider.id || !provider.isRecordId(crmAccountId)) {
    return { ok: false, status: 400, errorCode: "crm_link_invalid", message: "That isn't a record link for this install's CRM" };
  }

  const linked = await storage.findCustomerByCrmAccount(crmProvider, crmAccountId);
  if (linked) return { ok: true, status: "linked", customer: linked };

  const session = await provider.connectForUser(userId);
  if (!session) return { ok: false, status: 401, errorCode: "crm_not_connected", message: "CRM not connected" };
  const read = await session.readAccounts([crmAccountId]);
  const details = read.found.find((d) => d.id === crmAccountId);
  if (!details) return { ok: false, status: 404, errorCode: "crm_record_missing", message: "The CRM has no account with that id" };

  const [{ values, managed }, candidates] = await Promise.all([
    loadCrmFieldLookups().then((lookups) => crmAccountUpdate(details, lookups)),
    storage.getCrmLookalikeCandidates(crmProvider, crmAccountId),
  ]);
  return {
    ok: true,
    status: "new",
    crmProvider,
    crmAccountId,
    url: url.trim(),
    name: details.name,
    values,
    managed,
    lookalikes: rankLookalikes({ id: crmAccountId, name: details.name, website: details.website }, candidates),
  };
}
