// Who may read or change an account's Infrastructure Discovery profiles
// (docs/features/infrastructure-discovery.md).
//
// Internal roles (everyone but Customer, Guest and Partner) may use every
// account's profiles, like the Account Directory. Outside users may only
// use the profiles of accounts they belong to: the same accounts
// GET /api/customers and the profile summary show them.
import { getExternalUserAccountIds } from "./customer-access";
import { isExternalRole } from "./internal-access";

export interface InfrastructureProfileViewer {
  id?: string;
  role?: string | null;
  email?: string | null;
}

export type ExternalAccountIdsLookup = (userId: string, email: string | null | undefined) => Promise<number[]>;

export async function canUseInfrastructureProfiles(
  viewer: InfrastructureProfileViewer | null | undefined,
  customerId: number,
  externalAccountIds: ExternalAccountIdsLookup = getExternalUserAccountIds,
): Promise<boolean> {
  if (!viewer?.id || !viewer.role) return false;
  if (!isExternalRole(viewer.role)) return true;
  const accountIds = await externalAccountIds(viewer.id, viewer.email);
  return accountIds.includes(customerId);
}
