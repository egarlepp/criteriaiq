// An account's CRM link (migration 121, docs/features/crm-provider.md).
//
// The link is entered as a record URL (customers.salesforce_account_url, for
// either CRM). Storage derives crm_provider + crm_account_id from it on every
// save, and a unique index stops one CRM account being linked twice.
//
// With a CRM active an account must be linked. The only exception is one an
// Admin approves, with a reason; everyone else can ask the Admins for one.
// Internal accounts (the company's own login account) never need a link, and
// with no CRM nothing here applies.
import { parseCrmRecordInput } from "@shared/crm-record-id";

export const CRM_ACCOUNT_UNIQUE_CONSTRAINT = "customers_crm_account_unique";
export const CRM_LINK_REASON_MAX = 500;

export interface AccountCrmColumns {
  crmProvider: string | null;
  crmAccountId: string | null;
}

/** The CRM columns for a stored link URL; both null when there is no usable link. */
export function crmColumnsForUrl(url: string | null | undefined): AccountCrmColumns {
  const parsed = parseCrmRecordInput(url ?? null);
  return parsed ? { crmProvider: parsed.provider, crmAccountId: parsed.id } : { crmProvider: null, crmAccountId: null };
}

/**
 * Adds crmProvider/crmAccountId to a customer write whenever it carries the
 * link URL, so the two can never disagree. Writes without the URL are
 * returned unchanged.
 */
export function withCrmColumns<T extends { salesforceAccountUrl?: string | null }>(values: T): T & Partial<AccountCrmColumns> {
  if (!("salesforceAccountUrl" in values) || values.salesforceAccountUrl === undefined) return values;
  return { ...values, ...crmColumnsForUrl(values.salesforceAccountUrl) };
}

export interface AccountLinkRuleInput {
  activeProvider: string;
  isInternal: boolean;
  isAdmin: boolean;
  /** The link URL the save sends (empty = no link). */
  nextUrl: string | null | undefined;
  /** The stored link URL; undefined on create. */
  storedUrl?: string | null;
  /** The Admin's reason for an unlinked account, when one was sent. */
  exceptionReason: string | null | undefined;
}

export type AccountLinkRuleResult =
  | { ok: true; exception: "record" | "clear" | "keep" }
  | { ok: false; status: 400 | 403; errorCode: "crm_link_required" | "crm_link_reason_required" | "crm_link_reason_too_long"; message: string };

/**
 * Whether a create or update may save the account's CRM link as sent, and
 * what to do with the stored exception: record a new one, clear it (the
 * account is linked now), or keep it as it is. Pure.
 */
export function accountLinkRule(input: AccountLinkRuleInput): AccountLinkRuleResult {
  if (input.activeProvider === "none" || input.isInternal) return { ok: true, exception: "keep" };

  const next = (input.nextUrl ?? "").trim();
  if (next) return { ok: true, exception: "clear" };

  const reason = (input.exceptionReason ?? "").trim();
  if (reason.length > CRM_LINK_REASON_MAX) {
    return { ok: false, status: 400, errorCode: "crm_link_reason_too_long", message: `The reason can be at most ${CRM_LINK_REASON_MAX} characters` };
  }

  const isCreate = input.storedUrl === undefined;
  const unlinking = !isCreate && (input.storedUrl ?? "").trim() !== "";

  // An account saved before this rule with no link stays editable without
  // one; an Admin can still record an exception for it.
  if (!isCreate && !unlinking) {
    return { ok: true, exception: input.isAdmin && reason ? "record" : "keep" };
  }

  if (!input.isAdmin) {
    return {
      ok: false,
      status: 403,
      errorCode: "crm_link_required",
      message: isCreate
        ? "This account must be linked to a CRM account. Ask an Admin for an exception."
        : "Only an Admin can remove an account's CRM link",
    };
  }
  if (!reason) {
    return { ok: false, status: 400, errorCode: "crm_link_reason_required", message: "Give a reason for leaving this account unlinked" };
  }
  return { ok: true, exception: "record" };
}

/** The exception columns a save writes for a rule result. */
export function exceptionColumns(
  exception: "record" | "clear" | "keep",
  reason: string | null | undefined,
  userId: string,
): Record<string, string | Date | null> {
  if (exception === "record") {
    return { crmLinkExceptionReason: (reason ?? "").trim(), crmLinkExceptionBy: userId, crmLinkExceptionAt: new Date() };
  }
  if (exception === "clear") {
    return { crmLinkExceptionReason: null, crmLinkExceptionBy: null, crmLinkExceptionAt: null };
  }
  return {};
}

/** True when a database error is the duplicate-CRM-account unique violation. */
export function isCrmAccountConflict(error: unknown): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  const constraint = e?.constraint ?? e?.cause?.constraint;
  return code === "23505" && constraint === CRM_ACCOUNT_UNIQUE_CONSTRAINT;
}

/**
 * Account fields flow only from the CRM into CriteriaIQ (Eric, 2026-11-02),
 * so an account field mapping may only read from the CRM. Null when the
 * mapping is allowed.
 */
export function accountMappingDirectionProblem(cqiEntity: unknown, direction: unknown): string | null {
  if (cqiEntity !== "customer") return null;
  return direction === "inbound" ? null : "Account fields only sync from the CRM into CriteriaIQ, so account mappings must be inbound";
}

export interface StoredAccountLink {
  crmProvider?: string | null;
  crmAccountId?: string | null;
  crmManagedFields?: string[] | null;
}

export type AccountLinkChange = "none" | "same" | "linked" | "relinked" | "unlinked";

/**
 * How a save changes the account's CRM link, judged on the CRM id (not the
 * URL text, which can be written several ways). With no CRM active nothing
 * is CRM-managed, so every save is "none".
 */
export function accountLinkChange(activeProvider: string, stored: StoredAccountLink | null, nextUrl: string | null | undefined): AccountLinkChange {
  if (activeProvider === "none") return "none";
  const next = crmColumnsForUrl(nextUrl);
  const wasLinked = !!stored?.crmAccountId && stored.crmProvider === activeProvider;
  const isLinked = !!next.crmAccountId && next.crmProvider === activeProvider;
  if (!wasLinked && !isLinked) return "none";
  if (wasLinked && !isLinked) return "unlinked";
  if (!wasLinked) return "linked";
  return next.crmAccountId === stored!.crmAccountId ? "same" : "relinked";
}

/**
 * The CRM-managed fields a save must not change: the account name always,
 * plus whatever the last refresh filled, while the link stays the same.
 */
export function lockedAccountFields(change: AccountLinkChange, stored: StoredAccountLink | null): string[] {
  if (change !== "same") return [];
  return Array.from(new Set(["accountName", ...(stored?.crmManagedFields ?? [])]));
}

/** The CRM columns a save writes for a link change (the refresh fills the rest). */
export function linkChangeColumns(change: AccountLinkChange, userId: string): Record<string, string | string[] | Date | null> {
  if (change === "unlinked") {
    // Unlinking keeps the last CRM values and makes them editable again.
    return { crmManagedFields: null, crmLinkedBy: null, crmSyncedAt: null, crmRecordMissingAt: null };
  }
  if (change === "linked" || change === "relinked") {
    return { crmManagedFields: null, crmLinkedBy: userId, crmSyncedAt: null, crmRecordMissingAt: null };
  }
  return {};
}
