import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { crmWordingVariables, type CrmProviderId } from "@shared/crm-provider";

/**
 * t() whose {{crm}} / {{crmShort}} name a given CRM instead of the install's,
 * for a screen that shows one CRM's settings whichever CRM is active (Admin ›
 * Integrations › Salesforce or › HubSpot). ImpactIQ's useCrmViewTranslation.
 */
export function useCrmViewTranslation(crm: CrmProviderId) {
  const { t: base } = useTranslation();
  return useMemo(() => {
    const vars = crmWordingVariables(crm);
    const t = (key: string | string[], options?: Record<string, unknown>) => base(key, { ...vars, ...options });
    return { t: t as unknown as typeof base };
  }, [base, crm]);
}
