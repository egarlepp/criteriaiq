// Customer-access helpers shared between server/routes.ts and the
// progressively-extracted domain route modules (evaluation-requests-
// routes.ts, etc.).
//
// Extracted from routes.ts as a side effect of Phase 8 #3 — see
// docs/archive/routes-split-plan.md. Both helpers depend only on the
// storage layer, so they live cleanly under server/lib/ rather than
// being threaded through DI.
import { storage } from "../storage";
import { isExternalRole } from "./internal-access";

/**
 * True iff `userId` may read/write data scoped to `customerId`.
 * Every internal role (anything but Customer, Partner and Guest, so Sales,
 * CX and Product too) passes; external roles must appear in the
 * customer's `contactUsers` array.
 */
export async function hasCustomerAccess(
  userId: string,
  userRole: string | null | undefined,
  customerId: number | null | undefined,
): Promise<boolean> {
  // Internal roles have access to all customers
  if (userRole && !isExternalRole(userRole)) {
    return true;
  }

  // Check if user is assigned to this customer
  if (customerId == null) return false;
  const customer = await storage.getCustomer(customerId);
  if (!customer) return false;

  // Check if user is in the customer's contact users or account team
  if (customer.contactUsers && Array.isArray(customer.contactUsers)) {
    const hasAccess = customer.contactUsers.some(
      (contact: any) => contact.userId === userId,
    );
    if (hasAccess) return true;
  }

  return false;
}

/**
 * Return every customer ID the given external user can access via
 * `customer.contactUsers`. Internal roles aren't filtered through this
 * helper — they should be allowed through whatever query they were
 * trying to run without an `accessibleCustomerIds` constraint.
 */
export async function getUserAccessibleCustomers(
  userId: string,
  _userEmail: string | null | undefined,
): Promise<number[]> {
  const customers = await storage.getAllCustomersIncludingInactive();
  const accessibleCustomers: number[] = [];

  for (const customer of customers) {
    if (customer.contactUsers && Array.isArray(customer.contactUsers)) {
      const hasAccess = customer.contactUsers.some(
        (contact: any) => contact.userId === userId,
      );
      if (hasAccess) {
        accessibleCustomers.push(customer.id);
      }
    }
  }

  return accessibleCustomers;
}

/**
 * Every account an outside user belongs to: the account on their user
 * record, the accounts a Partner is assigned to, and any account that
 * lists them as a contact. The same rule the user directory uses
 * (users-routes.ts) to decide which accounts an outside viewer shares.
 */
export async function getExternalUserAccountIds(
  userId: string,
  userEmail: string | null | undefined,
): Promise<number[]> {
  const [contactAccounts, assignedAccounts, user] = await Promise.all([
    getUserAccessibleCustomers(userId, userEmail),
    storage.getUserAccounts(userId),
    storage.getUser(userId),
  ]);
  const accountId = (user as { accountId?: number | null } | undefined)?.accountId;
  return Array.from(new Set([...contactAccounts, ...assignedAccounts, ...(accountId != null ? [accountId] : [])]));
}
