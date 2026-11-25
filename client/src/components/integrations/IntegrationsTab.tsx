import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Tabs, TabsContent } from "@/components/ui/tabs";

import { SalesforceConfigurationTab } from "./SalesforceConfigurationTab";
import { AIProvidersTab } from "./AIProvidersTab";
import { N8nTab } from "./N8nTab";
import { ApiKeysTab } from "./ApiKeysTab";
import { IntegrationsOverview } from "./IntegrationsOverview";
import { McpServerTab } from "./McpServerTab";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { usePermissions } from "@/hooks/usePermissions";
import { INTEGRATION_SUBTAB_SECTIONS } from "./integration-sections";

// Okta SSO, Azure SSO and Email Configuration are configured inline on the
// Overview. The old `subtab=sso` URL falls through to it like any unknown
// value; `subtab=email-configuration` is redirected to the open Email card
// (admin-redirects.ts).
const INTEGRATIONS_SUB_TABS = Object.keys(INTEGRATION_SUBTAB_SECTIONS);

// A CRM's own views are hidden unless it is the install's CRM (Overview › CRM),
// so an old link to one opens the Overview instead.
const CRM_SUB_TABS = ['salesforce', 'hubspot'];

interface IntegrationsTabProps {
  user: any;
}

export function IntegrationsTab({ user }: IntegrationsTabProps) {
  const [location] = useLocation();
  const searchString = useSearch();
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const { provider: activeCrm, ready: crmReady } = useCrmProvider();
  const { canView } = usePermissions();
  // Each view has its own permission (Role Management › Admin › Integrations).
  const allowedSubTabs = INTEGRATIONS_SUB_TABS.filter((tab) => canView(INTEGRATION_SUBTAB_SECTIONS[tab]));
  const allowedKey = allowedSubTabs.join(",");

  useEffect(() => {
    const urlParams = new URLSearchParams(searchString);
    const subTabParam = urlParams.get('subtab');
    const known = !!subTabParam && allowedSubTabs.includes(subTabParam);
    const hiddenCrm = !!subTabParam && CRM_SUB_TABS.includes(subTabParam) && crmReady && subTabParam !== activeCrm;
    if (hiddenCrm) {
      urlParams.set('subtab', 'overview');
      urlParams.delete('sfsubtab');
      window.history.replaceState(null, '', `${window.location.pathname}?${urlParams.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
      return;
    }
    setActiveSubTab(subTabParam && known ? subTabParam : allowedSubTabs[0] ?? "overview");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allowedKey stands for allowedSubTabs
  }, [location, searchString, activeCrm, crmReady, allowedKey]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('subtab', value);
    const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="pt-0">
        {/* The view is picked from the top tab bar (Integrations' sidebar sub-items). */}
        <div>
          <TabsContent value="overview" className="space-y-4">
            <IntegrationsOverview />
          </TabsContent>

          <TabsContent value="salesforce" className="space-y-4">
            <SalesforceConfigurationTab user={user} />
          </TabsContent>

          {/* The same field sync screens, for HubSpot Deals and Companies. */}
          <TabsContent value="hubspot" className="space-y-4">
            <SalesforceConfigurationTab user={user} crm="hubspot" />
          </TabsContent>

          <TabsContent value="ai-providers" className="space-y-4">
            <AIProvidersTab user={user} />
          </TabsContent>

          <TabsContent value="n8n" className="space-y-4">
            <N8nTab user={user} />
          </TabsContent>

          <TabsContent value="api-keys" className="space-y-4">
            <ApiKeysTab />
          </TabsContent>

          <TabsContent value="mcp-server" className="space-y-4">
            <McpServerTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
