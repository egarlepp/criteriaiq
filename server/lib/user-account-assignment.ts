// Which account a user record points at.
//
// Outside users (Customer, Guest, Partner) belong to customer accounts and
// never to the internal account. Every other role is internal staff: staff
// see all accounts, and their accountId may only name an internal account
// (customers.is_internal) — the company's own account in the Account
// Directory. An email domain linked to an internal account (Domain Allow
// List) always wins, the same rule SSO sign-in applies when it creates a
// user (server/auth/oidcAuth.ts).
import { isExternalRole } from "./internal-access";

export type AccountAssignmentInput = {
  role: string;
  /** accountId sent by the client; undefined when the field wasn't sent. */
  requestedAccountId: number | null | undefined;
  /** Whether the requested account is internal; undefined when it doesn't exist. */
  requestedAccountIsInternal: boolean | undefined;
  /** Internal account linked to the user's email domain, if any. */
  domainInternalAccountId: number | null;
};

export type AccountAssignment =
  | { ok: true; staff: true; accountId: number | null }
  | { ok: true; staff: false }
  | { ok: false; message: string };

export function resolveAccountAssignment(input: AccountAssignmentInput): AccountAssignment {
  const requested = input.requestedAccountId ?? null;
  const staff = input.domainInternalAccountId != null || !isExternalRole(input.role);

  if (!staff) {
    if (requested != null && input.requestedAccountIsInternal === true) {
      return { ok: false, message: "Outside users can't be assigned to an internal account" };
    }
    return { ok: true, staff: false };
  }

  if (input.domainInternalAccountId != null) {
    return { ok: true, staff: true, accountId: input.domainInternalAccountId };
  }
  if (requested == null) {
    return { ok: true, staff: true, accountId: null };
  }
  if (input.requestedAccountIsInternal !== true) {
    return { ok: false, message: "Internal users can only be assigned to an internal account" };
  }
  return { ok: true, staff: true, accountId: requested };
}

/** Parses an accountId from a request body: a positive integer, null, or undefined. */
export function parseRequestedAccountId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
