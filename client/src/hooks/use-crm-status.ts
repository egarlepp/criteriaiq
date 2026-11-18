import { useQuery } from "@tanstack/react-query";
import type { CrmProviderId } from "@shared/crm-provider";

export const CRM_STATUS_KEY = ["/api/crm/status"] as const;

export interface CrmStatus {
  provider: CrmProviderId;
  connected: boolean;
}

/**
 * The install's CRM and whether the signed-in user can query it right now.
 * Salesforce needs the user's own connection; HubSpot needs a matched
 * HubSpot owner. Outside users are never connected.
 */
export function useCrmStatus(): CrmStatus & { ready: boolean } {
  const { data } = useQuery<CrmStatus>({
    queryKey: CRM_STATUS_KEY,
    staleTime: 60_000,
  });
  return {
    provider: data?.provider ?? "none",
    connected: !!data?.connected,
    ready: !!data,
  };
}
