import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useLocation, useSearch } from "wouter";
import type { LucideIcon } from "lucide-react";
import { Activity, AlertCircle, Brain, CalendarDays, CheckCircle2, CircleSlash, Cloud, Hexagon, KeyRound, Loader2, MailPlus, Server, Shield, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCrmProvider } from "@/hooks/use-crm-provider";
import { CRM_DISPLAY_NAMES } from "@shared/crm-provider";
import { RateLimitCard } from "./RateLimitCard";
import { ValidationRecordCard } from "./ValidationRecordCard";
import { CrmProviderCard } from "./CrmProviderCard";
import { SsoProviderForm, type SsoProvider } from "./SsoProviderForm";
import { HubspotConnectionForm } from "./HubspotConnectionForm";
import { ImpactiqConnectionForm } from "./ImpactiqConnectionForm";
import { OutlookSigninForm } from "./OutlookSigninForm";
import { EmailConfigurationForm } from "./EmailConfigurationForm";
import { OverviewCard } from "./OverviewCard";

type IntegrationKey = "okta" | "azure" | "salesforce" | "hubspot" | "email" | "aiProviders" | "n8n" | "mcp" | "impactiq" | "outlook";

interface IntegrationStatus {
  key: IntegrationKey;
  configured: boolean;
  enabled: boolean;
}

type InlineForm = { kind: "sso"; provider: SsoProvider } | { kind: "hubspot" } | { kind: "impactiq" } | { kind: "outlook" } | { kind: "email" };

type IntegrationDef = {
  key: IntegrationKey;
  icon: LucideIcon;
} & (
  | /** Configured in its own Integrations view. */ { href: string; inline?: never }
  | /** Configured inline on this page, as ImpactIQ does for SSO and HubSpot. */ { inline: InlineForm; href?: never }
);

const INTEGRATIONS_HREF = "/admin?tab=salesforce-configuration";

// Card order follows ImpactIQ's Integrations page: sign-in first, then the
// CRM, mail and AI. The status endpoint returns a list, so an alternate CRM
// is one more entry here and one more on the server.
const SIGN_IN_INTEGRATIONS: IntegrationDef[] = [
  { key: "okta", icon: Shield, inline: { kind: "sso", provider: "okta" } },
  { key: "azure", icon: KeyRound, inline: { kind: "sso", provider: "azure" } },
];

/** Listed under the CRM card; the ones that aren't the chosen CRM are grayed out. */
const CRM_INTEGRATIONS: (IntegrationDef & { key: "salesforce" | "hubspot" })[] = [
  { key: "salesforce", icon: Cloud, href: `${INTEGRATIONS_HREF}&subtab=salesforce` },
  { key: "hubspot", icon: Hexagon, inline: { kind: "hubspot" } },
];

const OTHER_INTEGRATIONS: IntegrationDef[] = [
  { key: "email", icon: MailPlus, inline: { kind: "email" } },
  { key: "outlook", icon: CalendarDays, inline: { kind: "outlook" } },
  { key: "aiProviders", icon: Brain, href: `${INTEGRATIONS_HREF}&subtab=ai-providers` },
  { key: "n8n", icon: Zap, href: `${INTEGRATIONS_HREF}&subtab=n8n` },
  { key: "mcp", icon: Server, href: `${INTEGRATIONS_HREF}&subtab=mcp-server` },
  { key: "impactiq", icon: Activity, inline: { kind: "impactiq" } },
];

function StatusBadge({ status, notChosen }: { status: IntegrationStatus | undefined; notChosen?: boolean }) {
  const { t } = useTranslation();
  if (notChosen) {
    return (
      <Badge variant="secondary" className="inline-flex items-center gap-1 whitespace-nowrap" data-testid="integration-not-chosen">
        <CircleSlash className="h-3 w-3" />
        {t("integrations.overview.status.notChosen")}
      </Badge>
    );
  }
  if (!status?.configured) {
    return (
      <Badge variant="secondary" className="inline-flex items-center gap-1 whitespace-nowrap">
        <AlertCircle className="h-3 w-3" />
        {t("integrations.overview.status.notConfigured")}
      </Badge>
    );
  }
  if (!status.enabled) {
    return (
      <Badge
        variant="outline"
        className="inline-flex items-center gap-1 whitespace-nowrap border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
      >
        <AlertCircle className="h-3 w-3" />
        {t("integrations.overview.status.disabled")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="inline-flex items-center gap-1 whitespace-nowrap border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-950/40 dark:text-green-300"
    >
      <CheckCircle2 className="h-3 w-3" />
      {t("integrations.overview.status.configured")}
    </Badge>
  );
}

function IntegrationCard({
  def,
  status,
  notChosen = false,
}: {
  def: IntegrationDef;
  status: IntegrationStatus | undefined;
  /** A CRM other than the one chosen in the CRM card: grayed out, can't be configured. */
  notChosen?: boolean;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  // `?open=<key>` (e.g. EMAIL_CONFIGURATION_HREF) opens that card on arrival.
  const openParam = new URLSearchParams(useSearch()).get("open");
  const linkedOpen = !!def.inline && openParam === def.key;
  const [expanded, setExpanded] = useState(linkedOpen);
  useEffect(() => {
    if (linkedOpen) setExpanded(true);
  }, [linkedOpen]);
  const crmName = def.key === "salesforce" || def.key === "hubspot" ? CRM_DISPLAY_NAMES[def.key].name : "";

  return (
    <OverviewCard
      testId={`integration-card-${def.key}`}
      configureTestId={`integration-configure-${def.key}`}
      icon={def.icon}
      active={!!status?.configured && status.enabled}
      title={t(`integrations.overview.cards.${def.key}.name`)}
      description={t(`integrations.overview.cards.${def.key}.description`)}
      note={notChosen ? t("integrations.overview.notChosenNote", { crm: crmName }) : undefined}
      badge={<StatusBadge status={status} notChosen={notChosen} />}
      dimmed={notChosen}
      expanded={expanded}
      onToggle={() => (def.href ? navigate(def.href) : setExpanded((open) => !open))}
    >
      {def.inline ? (
        def.inline.kind === "sso" ? (
          <SsoProviderForm provider={def.inline.provider} />
        ) : def.inline.kind === "hubspot" ? (
          <HubspotConnectionForm />
        ) : def.inline.kind === "outlook" ? (
          <OutlookSigninForm />
        ) : def.inline.kind === "email" ? (
          <EmailConfigurationForm />
        ) : (
          <ImpactiqConnectionForm />
        )
      ) : null}
    </OverviewCard>
  );
}

/**
 * Admin › Integrations › Overview, modeled on ImpactIQ's Integrations page:
 * one card per integration with its status and a Configure button that
 * opens its settings view, then the global Rate Limiting card. The CRM card
 * heads its own group: while it is open, the Salesforce and HubSpot cards
 * (the one not chosen grayed out) and the Validation Record card show right
 * under it; closed, it is one card like the rest.
 */
export function IntegrationsOverview() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useQuery<{ integrations: IntegrationStatus[] }>({
    queryKey: ["/api/admin/integrations/status"],
  });
  const byKey = new Map((data?.integrations ?? []).map((row) => [row.key, row]));
  const { provider: crm, ready: crmReady } = useCrmProvider();
  // `?open=crm` (the Teams page setup card) opens the CRM group on arrival.
  const [crmOpen, setCrmOpen] = useState(() => new URLSearchParams(window.location.search).get("open") === "crm");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t("integrations.overview.description")}</p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : isError ? (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("integrations.overview.loadError")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {SIGN_IN_INTEGRATIONS.map((def) => (
            <IntegrationCard key={def.key} def={def} status={byKey.get(def.key)} />
          ))}

          <section className="flex flex-col gap-4" aria-label={t("integrations.crmProvider.title")} data-testid="crm-group">
            <CrmProviderCard expanded={crmOpen} onToggle={() => setCrmOpen((open) => !open)} />
            {crmOpen && (
              <div className="ml-4 flex flex-col gap-4 border-l-2 border-gray-200 pl-4 dark:border-gray-700" data-testid="crm-group-cards">
                {CRM_INTEGRATIONS.map((def) => (
                  <IntegrationCard
                    key={def.key}
                    def={def}
                    status={byKey.get(def.key)}
                    notChosen={crmReady && crm !== def.key}
                  />
                ))}
                <ValidationRecordCard />
              </div>
            )}
          </section>

          {OTHER_INTEGRATIONS.map((def) => (
            <IntegrationCard key={def.key} def={def} status={byKey.get(def.key)} />
          ))}
        </div>
      )}

      <RateLimitCard />
    </div>
  );
}
