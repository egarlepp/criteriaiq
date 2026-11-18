import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { applyCrmWording } from "@/i18n";
import { DEFAULT_CRM_PROVIDER, type CrmProviderId } from "@shared/crm-provider";

export const CRM_PROVIDER_KEY = ["/api/crm/provider"] as const;

/**
 * The CRM this install uses (Admin › Integrations › Overview › CRM).
 * `ready` is false until the first answer, so callers can avoid flashing
 * CRM fields on a None install; while loading the default is reported.
 * It also points the {{crm}} / {{crmShort}} wording at that CRM.
 */
export function useCrmProvider(): { provider: CrmProviderId; ready: boolean; isActive: (id: CrmProviderId) => boolean } {
  const { data } = useQuery<{ provider: CrmProviderId }>({
    queryKey: CRM_PROVIDER_KEY,
    staleTime: 5 * 60_000,
  });
  const provider = data?.provider ?? DEFAULT_CRM_PROVIDER;
  useEffect(() => {
    if (data) applyCrmWording(data.provider);
  }, [data]);
  return { provider, ready: !!data, isActive: (id) => !!data && data.provider === id };
}
