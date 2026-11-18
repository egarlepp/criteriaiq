// Which CRM the field-mapping, linking and sync tables are read for.
//
// Those tables (salesforce_field_mappings, salesforce_record_links,
// salesforce_sync_policies, salesforce_sync_runs) serve both CRMs, tagged
// by crm_provider (migration 090). Every read and write goes through the
// active CRM's rows, so a HubSpot install never sees or runs Salesforce
// mappings. With no CRM, Salesforce's rows stay the default view; the sync
// routes and jobs are stood down anyway.
import type { CrmProvider } from "@shared/crm-record-id";
import { getCrmProviderId } from "./provider-setting";

export async function syncCrm(): Promise<CrmProvider> {
  return (await getCrmProviderId()) === "hubspot" ? "hubspot" : "salesforce";
}
