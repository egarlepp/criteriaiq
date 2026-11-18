// Route-side check for an account save's CRM link: the link rule
// (account-crm-link.ts) plus the "already linked to another account" check,
// answered with the existing account's name so the user can pick it.
import { storage } from "../storage";
import { accountLinkRule, crmColumnsForUrl, exceptionColumns } from "./account-crm-link";

export type AccountLinkCheck =
  | { ok: true; extraColumns: Record<string, string | Date | null> }
  | { ok: false; status: number; body: Record<string, unknown> };

export async function checkAccountLink(input: {
  activeProvider: string;
  isInternal: boolean;
  role: string | undefined;
  userId: string;
  nextUrl: string | null | undefined;
  /** Undefined on create. */
  stored?: { id: number; salesforceAccountUrl: string | null };
  exceptionReason: string | null | undefined;
}): Promise<AccountLinkCheck> {
  const rule = accountLinkRule({
    activeProvider: input.activeProvider,
    isInternal: input.isInternal,
    isAdmin: input.role === "Admin",
    nextUrl: input.nextUrl,
    storedUrl: input.stored ? input.stored.salesforceAccountUrl : undefined,
    exceptionReason: input.exceptionReason,
  });
  if (!rule.ok) {
    return { ok: false, status: rule.status, body: { message: rule.message, error: "VALIDATION_ERROR", errorCode: rule.errorCode } };
  }

  const { crmProvider, crmAccountId } = crmColumnsForUrl(input.nextUrl);
  if (crmProvider && crmAccountId) {
    const holder = await storage.findCustomerByCrmAccount(crmProvider, crmAccountId, input.stored?.id);
    if (holder) {
      return {
        ok: false,
        status: 409,
        body: {
          message: `This CRM account is already linked to ${holder.accountName}`,
          error: "DUPLICATE_ERROR",
          errorCode: "crm_account_already_linked",
          existingAccount: holder,
        },
      };
    }
  }

  return { ok: true, extraColumns: exceptionColumns(rule.exception, input.exceptionReason, input.userId) };
}

/** The 409 body for a duplicate caught by the unique index (a race the pre-check missed). */
export const CRM_ACCOUNT_CONFLICT_BODY = {
  message: "This CRM account is already linked to another account",
  error: "DUPLICATE_ERROR",
  errorCode: "crm_account_already_linked",
} as const;
