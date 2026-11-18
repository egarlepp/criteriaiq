// Builds GET /api/crm/me: the signed-in user's own link to the install's CRM.
// Salesforce is a per-user OAuth connection with a liveness check; HubSpot has
// no per-user sign-in (one portal-wide key), so the user's "connection" is the
// HubSpot owner matched to them by email, as in ImpactIQ.
import type { MyCrmConnection } from "@shared/my-connections";
import type { CrmProviderId } from "@shared/crm-provider";
import { isExternalRole } from "../lib/internal-access";

export interface MyCrmConnectionDeps {
  providerId: () => Promise<CrmProviderId>;
  salesforce: (userId: string) => Promise<NonNullable<MyCrmConnection["salesforce"]>>;
  hubspotConfig: () => Promise<{ portalName: string | null } | null>;
  hubspotOwner: (userId: string) => Promise<NonNullable<MyCrmConnection["hubspot"]>["owner"]>;
}

export async function buildMyCrmConnection(
  user: { id: string; role?: string | null },
  deps: MyCrmConnectionDeps,
): Promise<MyCrmConnection> {
  const provider = await deps.providerId();
  const external = isExternalRole(user.role);
  const base: MyCrmConnection = { provider, external, salesforce: null, hubspot: null };
  if (external || provider === "none") return base;

  if (provider === "salesforce") {
    return { ...base, salesforce: await deps.salesforce(user.id) };
  }

  if (provider === "hubspot") {
    const config = await deps.hubspotConfig();
    const owner = config ? await deps.hubspotOwner(user.id) : null;
    return {
      ...base,
      hubspot: { configured: config !== null, portalName: config?.portalName ?? null, owner },
    };
  }

  return base;
}
