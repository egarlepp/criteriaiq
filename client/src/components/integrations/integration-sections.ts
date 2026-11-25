// The permission each Integrations view checks (Admin › Integrations). Kept
// apart from IntegrationsTab, which is lazy-loaded, so the Admin page can
// tell whether to offer Integrations at all without loading it.
export const INTEGRATION_SUBTAB_SECTIONS: Record<string, string> = {
  overview: "config.salesforce-configuration",
  salesforce: "config.salesforce",
  hubspot: "config.hubspot",
  "ai-providers": "config.ai-providers",
  n8n: "config.n8n",
  "api-keys": "config.api-keys",
  "mcp-server": "config.mcp-server",
};
