// An account's CRM link state for the Account Directory's "CRM link" column
// and filter. Read from the account row; no CRM call.
import type { CrmProviderId } from "@shared/crm-provider";

export type CrmLinkStatus = "linked" | "missing" | "exception" | "needsLink" | "internal";

export const CRM_LINK_STATUSES: readonly CrmLinkStatus[] = ["linked", "missing", "exception", "needsLink", "internal"];

export interface CrmLinkFields {
  isInternal?: boolean | null;
  crmProvider?: string | null;
  crmAccountId?: string | null;
  crmRecordMissingAt?: string | null;
  crmLinkExceptionReason?: string | null;
}

/** Null when the install has no CRM (the column and filter are hidden). */
export function crmLinkStatus(account: CrmLinkFields, installCrm: CrmProviderId): CrmLinkStatus | null {
  if (installCrm === "none") return null;
  if (account.crmAccountId && account.crmProvider === installCrm) {
    return account.crmRecordMissingAt ? "missing" : "linked";
  }
  if (account.isInternal) return "internal";
  return account.crmLinkExceptionReason ? "exception" : "needsLink";
}

/** Sort order: the ones that need someone first. */
export const CRM_LINK_STATUS_RANK: Record<CrmLinkStatus, number> = {
  needsLink: 0,
  missing: 1,
  exception: 2,
  linked: 3,
  internal: 4,
};
