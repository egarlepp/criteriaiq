import { useQuery } from "@tanstack/react-query";
import type { MyCrmConnection } from "@shared/my-connections";

export const MY_CRM_CONNECTION_KEY = ["/api/crm/me"] as const;

/**
 * The signed-in user's own link to the install's CRM: Salesforce sign-in
 * (with a "reconnect needed" check) or the HubSpot owner they're matched to.
 * Read by Profile Settings › Integrations and the sidebar footer icon.
 */
export function useMyCrmConnection(enabled = true) {
  return useQuery<MyCrmConnection>({
    queryKey: MY_CRM_CONNECTION_KEY,
    staleTime: 60_000,
    enabled,
  });
}
