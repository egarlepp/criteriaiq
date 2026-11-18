// Integrations overview — mixin for DatabaseStorage.
//
// Backs the status cards on Admin › Integrations › Overview. Each read is a
// cheap single-row lookup on the integration's own config table; nothing
// here decrypts a secret or calls an external service. Salesforce is read
// through salesforceConfigService by the route instead, because it also
// honours the SALESFORCE_* env fallback.
import { db } from "../db";
import { and, count, eq, or, sql, type SQL } from "drizzle-orm";
import {
  aiProviderConfigs,
  archivedCustomers,
  archivedProjects,
  customers,
  emailConfiguration,
  n8nConfig,
  projects,
  salesforceRecordLinks,
  ssoConfig,
} from "@shared/schema";
import type { CrmLinkedDataCounts } from "@shared/crm-provider";
import { HUBSPOT_URL_PATTERN } from "@shared/crm-record-id";

/** Configured = enough settings saved to work; enabled = switched on. */
export interface IntegrationConfigState {
  configured: boolean;
  enabled: boolean;
}

export interface StoredIntegrationStates {
  okta: IntegrationConfigState;
  azure: IntegrationConfigState;
  email: IntegrationConfigState;
  aiProviders: IntegrationConfigState & { activeCount: number };
  n8n: IntegrationConfigState;
}

export class IntegrationsStorageMixin {
  async getStoredIntegrationStates(): Promise<StoredIntegrationStates> {
    const [ssoRows, [email], [ai], [n8n]] = await Promise.all([
      db
        .select({
          provider: ssoConfig.provider,
          enabled: ssoConfig.enabled,
          issuerUrl: ssoConfig.issuerUrl,
          tenantId: ssoConfig.tenantId,
          clientId: ssoConfig.clientId,
          clientSecretEnc: ssoConfig.clientSecretEnc,
        })
        .from(ssoConfig),
      db
        .select({ enabled: emailConfiguration.enabled })
        .from(emailConfiguration)
        .limit(1),
      db
        .select({ value: count() })
        .from(aiProviderConfigs)
        .where(eq(aiProviderConfigs.isActive, true)),
      db
        .select({ hostUrl: n8nConfig.hostUrl, isEnabled: n8nConfig.isEnabled })
        .from(n8nConfig)
        .limit(1),
    ]);

    const ssoState = (provider: "okta" | "azure"): IntegrationConfigState => {
      const row = ssoRows.find((r) => r.provider === provider);
      const issuerSource = provider === "azure" ? row?.tenantId : row?.issuerUrl;
      const configured = !!(issuerSource && row?.clientId && row.clientSecretEnc);
      return { configured, enabled: configured && !!row?.enabled };
    };
    const aiActive = Number(ai?.value ?? 0);
    return {
      okta: ssoState("okta"),
      azure: ssoState("azure"),
      email: { configured: !!email, enabled: !!email && email.enabled !== false },
      aiProviders: { configured: aiActive > 0, enabled: aiActive > 0, activeCount: aiActive },
      n8n: { configured: !!n8n?.hostUrl, enabled: !!n8n?.hostUrl && n8n.isEnabled },
    };
  }

  /**
   * Rows holding a record id from each CRM, for the CRM provider lock
   * (server/crm/provider-lock.ts). Live and archived projects and accounts
   * both count, since a restore brings the ids back. Demo rows don't: demo
   * data is made up and can be removed, so it never locks the choice.
   *
   * A project with no crm_provider predates the column and only ever held
   * Salesforce links, so its evaluation link or record ids count as
   * Salesforce.
   */
  async countCrmLinkedData(): Promise<CrmLinkedDataCounts> {
    const salesforceProject = (table: typeof projects | typeof archivedProjects): SQL =>
      and(
        eq(table.isDemo, false),
        or(
          eq(table.crmProvider, "salesforce"),
          and(
            sql`${table.crmProvider} is null`,
            or(
              sql`coalesce(${table.salesforceEvaluationLink}, '') <> ''`,
              sql`${table.crmOpportunityId} is not null`,
              sql`${table.crmAccountId} is not null`,
            ),
          ),
        ),
      )!;
    const hubspotProject = (table: typeof projects | typeof archivedProjects): SQL =>
      and(eq(table.isDemo, false), eq(table.crmProvider, "hubspot"))!;
    // The account's CRM link column predates HubSpot and holds either CRM's
    // record URL; a hubspot.com link is HubSpot's, anything else Salesforce's.
    const hubspotUrl = (table: typeof customers | typeof archivedCustomers): SQL =>
      sql`coalesce(${table.salesforceAccountUrl}, '') ~* ${HUBSPOT_URL_PATTERN}`;
    const salesforceAccount = (table: typeof customers | typeof archivedCustomers): SQL =>
      and(eq(table.isDemo, false), sql`coalesce(${table.salesforceAccountUrl}, '') <> ''`, sql`not (${hubspotUrl(table)})`)!;
    const hubspotAccount = (table: typeof customers | typeof archivedCustomers): SQL =>
      and(eq(table.isDemo, false), hubspotUrl(table))!;

    const tally = async (query: Promise<{ value: number | string }[]>) => Number((await query)[0]?.value ?? 0);
    const [sfProjects, sfArchived, sfAccounts, sfArchivedAccounts, sfLinks, hsProjects, hsArchived, hsAccounts, hsArchivedAccounts] = await Promise.all([
      tally(db.select({ value: count() }).from(projects).where(salesforceProject(projects))),
      tally(db.select({ value: count() }).from(archivedProjects).where(salesforceProject(archivedProjects))),
      tally(db.select({ value: count() }).from(customers).where(salesforceAccount(customers))),
      tally(db.select({ value: count() }).from(archivedCustomers).where(salesforceAccount(archivedCustomers))),
      tally(db.select({ value: count() }).from(salesforceRecordLinks)),
      tally(db.select({ value: count() }).from(projects).where(hubspotProject(projects))),
      tally(db.select({ value: count() }).from(archivedProjects).where(hubspotProject(archivedProjects))),
      tally(db.select({ value: count() }).from(customers).where(hubspotAccount(customers))),
      tally(db.select({ value: count() }).from(archivedCustomers).where(hubspotAccount(archivedCustomers))),
    ]);
    return {
      salesforce: sfProjects + sfArchived + sfAccounts + sfArchivedAccounts + sfLinks,
      hubspot: hsProjects + hsArchived + hsAccounts + hsArchivedAccounts,
    };
  }
}
