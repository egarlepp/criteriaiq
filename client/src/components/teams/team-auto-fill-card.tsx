// Teams page setup card: "Fill teams automatically". Teams can fill
// themselves from sign-in groups (Okta, Azure) and from the CRM (Salesforce
// departments, HubSpot teams). The card shows what is set up and links to
// where each one is configured. People added by hand are never removed by
// either sync. See docs/features/teams.md.
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Building2, CheckCircle2, CircleSlash, Clock, KeyRound, Settings, Wand2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CRM_DISPLAY_NAMES } from "@shared/crm-provider";
import type { TeamSummary } from "@shared/teams";

interface AutoFillStatus {
  sso: Array<{ provider: "okta" | "azure"; enabled: boolean; mappings: number }>;
  crm: { provider: string; lastRun: { status: string; finishedAt: string; itemsProcessed: number | null } | null };
  canOpenIntegrations: boolean;
}

const INTEGRATIONS_HREF = "/admin?tab=salesforce-configuration&subtab=overview";

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <Badge className="gap-1 border-transparent bg-green-100 text-xs text-green-800 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-300 dark:hover:bg-green-900/40">
      <CheckCircle2 className="h-3 w-3" />
      {label}
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1 text-xs">
      <CircleSlash className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function TeamsAutoFillCard({ teams }: { teams: readonly TeamSummary[] }) {
  const { t, i18n } = useTranslation();
  const { data } = useQuery<AutoFillStatus>({
    queryKey: ["/api/teams/auto-fill"],
    queryFn: () => apiRequest("GET", "/api/teams/auto-fill"),
    staleTime: 60_000,
  });

  const linkedTeams = teams.filter((team) => team.crmDepartments.length > 0).length;
  const linkedSubteams = teams.reduce((sum, team) => sum + team.subteams.filter((s) => s.crmDepartments.length > 0).length, 0);
  const crmProvider = data?.crm.provider ?? "none";
  const hasCrm = crmProvider === "salesforce" || crmProvider === "hubspot";
  const crmName = hasCrm ? CRM_DISPLAY_NAMES[crmProvider].name : "";
  const ssoRows = data?.sso ?? [];
  const lastRun = data?.crm.lastRun;

  return (
    <Card data-testid="teams-auto-fill-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Wand2 className="h-5 w-5 text-primary" />
          {t("teams.autoFill.title")}
        </CardTitle>
        <CardDescription>{t("teams.autoFill.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700" data-testid="teams-auto-fill-sso">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {t("teams.autoFill.sso.title")}
          </p>
          <p className="text-xs text-muted-foreground">{t("teams.autoFill.sso.hint")}</p>
          <div className="flex flex-col gap-2">
            {ssoRows.map((row) => (
              <div key={row.provider} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-gray-700 dark:text-gray-300">{t(`teams.autoFill.sso.${row.provider}`)}</span>
                <div className="flex items-center gap-2">
                  <StatusPill
                    ok={row.enabled && row.mappings > 0}
                    label={
                      !row.enabled
                        ? t("teams.autoFill.sso.off")
                        : row.mappings > 0
                          ? t("teams.autoFill.sso.mappings", { count: row.mappings })
                          : t("teams.autoFill.sso.noMappings")
                    }
                  />
                  {data?.canOpenIntegrations && (
                    <Button asChild variant="outline" size="sm" className="h-7">
                      <Link href={`${INTEGRATIONS_HREF}&open=${row.provider}`}>
                        <Settings className="mr-1 h-3.5 w-3.5" />
                        {t("teams.autoFill.setUp")}
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data && !data.canOpenIntegrations && <p className="text-xs text-muted-foreground">{t("teams.autoFill.adminOnly")}</p>}
        </section>

        <section className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700" data-testid="teams-auto-fill-crm">
          <p className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {t("teams.autoFill.crm.title")}
          </p>
          {!hasCrm ? (
            <>
              <p className="text-xs text-muted-foreground">{t("teams.autoFill.crm.noCrm")}</p>
              {data?.canOpenIntegrations && (
                <Button asChild variant="outline" size="sm" className="h-7">
                  <Link href={`${INTEGRATIONS_HREF}&open=crm`}>
                    <Settings className="mr-1 h-3.5 w-3.5" />
                    {t("teams.autoFill.crm.chooseCrm")}
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t("teams.autoFill.crm.hint", { crm: crmName })}</p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  ok={linkedTeams + linkedSubteams > 0}
                  label={
                    linkedTeams + linkedSubteams > 0
                      ? t("teams.autoFill.crm.linked", { teams: linkedTeams, subteams: linkedSubteams })
                      : t("teams.autoFill.crm.notLinked")
                  }
                />
              </div>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {!lastRun
                  ? t("teams.autoFill.crm.neverRun")
                  : lastRun.status === "error"
                    ? t("teams.autoFill.crm.lastRunFailed", { when: new Date(lastRun.finishedAt).toLocaleString(i18n.language) })
                    : t("teams.autoFill.crm.lastRun", {
                        when: new Date(lastRun.finishedAt).toLocaleString(i18n.language),
                        count: lastRun.itemsProcessed ?? 0,
                      })}
              </p>
            </>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
