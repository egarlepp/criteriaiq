// Internal vs. external users. External roles are the ones customers and
// partners sign up with (see the self-registration allow-list in
// server/auth/simpleAuth.ts); every other signed-in role is internal staff.
import type { RequestHandler } from "express";

export const EXTERNAL_ROLES: ReadonlySet<string> = new Set(["Customer", "Guest", "Partner"]);

export function isExternalRole(role: string | null | undefined): boolean {
  return EXTERNAL_ROLES.has(role ?? "");
}

/**
 * Route guard: refuses external users (Customer, Guest, Partner). Used for
 * shared content only staff should change, such as project templates,
 * validation criteria templates and MAP templates.
 */
export const requireInternalUser: RequestHandler = (req, res, next) => {
  const role = (req as { session?: { user?: { role?: string } } }).session?.user?.role;
  if (!role || isExternalRole(role)) {
    res.status(403).json({ message: "Only internal users can make this change" });
    return;
  }
  next();
};

// The internal (company) account (customers.is_internal) decides who counts
// as staff, so beyond Account Management edit only an Admin may mark or
// unmark it, deactivate it, or archive it.

/**
 * Why a non-Admin may not make this change to an account, or null when
 * it's allowed. `next` is undefined for an archive.
 */
export function internalAccountChangeRefusal(
  actorRole: string | null | undefined,
  current: { isInternal?: boolean | null; isActive?: boolean | null },
  next?: { isInternal: boolean; isActive: boolean },
): string | null {
  if (actorRole === 'Admin') return null;
  const wasInternal = current.isInternal === true;
  if (!next) {
    return wasInternal ? "Only an Admin can archive the internal account" : null;
  }
  if (next.isInternal !== wasInternal) {
    return "Only an Admin can change whether an account is internal";
  }
  if (wasInternal && current.isActive !== false && !next.isActive) {
    return "Only an Admin can deactivate the internal account";
  }
  return null;
}

/** customers.is_internal; the Customer type predates the column. */
export function isInternalAccount(account: unknown): boolean {
  return (account as { isInternal?: unknown } | null | undefined)?.isInternal === true;
}
