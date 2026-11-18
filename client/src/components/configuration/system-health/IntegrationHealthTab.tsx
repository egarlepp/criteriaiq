import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Plug,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Cloud,
  Webhook,
  Brain,
  Network,
  Shield,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";

interface IntegrationHealthData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  salesforce: {
    connectedUsers: number;
    totalConfigurations: number;
    recentSyncCount: number;
    failedSyncs24h: number;
    lastSyncTime: string | null;
  };
  webhooks: {
    totalConfigurations: number;
    activeWebhooks: number;
    deliverySuccessRate24h: number;
    pendingRetries: number;
    recentFailures: Array<{
      webhookName: string;
      error: string;
      timestamp: string;
    }>;
  };
  aiProviders: {
    configuredProviders: number;
    activeProviders: string[];
    lastTestTime: string | null;
  };
  /** n8n workflow automation — present on deployments that have run the migration */
  n8n?: {
    isConfigured: boolean;
    isEnabled: boolean;
    /** 'success' | 'failed' | null (null = never tested) */
    lastTestResult: string | null;
    lastTestedAt: string | null;
    lastTestError: string | null;
  };
  /** Okta OIDC SSO — present on deployments that have run migration 071 */
  sso?: {
    isConfigured: boolean;
    isEnabled: boolean;
    provider: string;
    /** 'success' | 'failure' | null (null = never tested) */
    lastTestResult: string | null;
    lastTestedAt: string | null;
    lastTestError: string | null;
    successfulLogins24h: number;
    failedLogins24h: number;
  };
}

/** "Okta SSO", "Azure SSO" or "Okta + Azure SSO" from the comma-separated provider list. */
function ssoTitle(provider: string | undefined): string {
  const labels = (provider ?? "")
    .split(",")
    .map((p) => (p === "azure" ? "Azure" : p === "okta" ? "Okta" : ""))
    .filter(Boolean);
  return labels.length > 0 ? `${labels.join(" + ")} SSO` : "Single Sign-On";
}

/** Recent Webhook Failures table; newest first until a column is clicked. */
function WebhookFailuresTable({ failures }: { failures: IntegrationHealthData["webhooks"]["recentFailures"] }) {
  const { t } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState("webhookFailures");
  const rows = useMemo(
    () =>
      sortRows(
        [...failures].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
        sortConfig,
        { timestamp: (f) => new Date(f.timestamp) },
      ),
    [failures, sortConfig],
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead sortKey="webhookName" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.integrations.webhookFailures.colWebhook")}
          </SortableTableHead>
          <SortableTableHead sortKey="error" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.integrations.webhookFailures.colError")}
          </SortableTableHead>
          <SortableTableHead sortKey="timestamp" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.integrations.webhookFailures.colTime")}
          </SortableTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((failure, index) => (
          <TableRow key={`${failure.webhookName}-${failure.timestamp}-${index}`}>
            <TableCell className="font-medium">{failure.webhookName}</TableCell>
            <TableCell className="text-red-600 dark:text-red-400 text-sm max-w-[300px] truncate">
              {failure.error}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(failure.timestamp).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function IntegrationHealthTab() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<IntegrationHealthData>({
    queryKey: ["system-health-integrations"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/integrations");
      if (!response.ok) throw new Error("Failed to fetch integration health");
      return response.json();
    },
    refetchInterval: 60000,
  });

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            All Connected
          </Badge>
        );
      case "warning":
        return (
          <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Issues Detected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Connection Error
          </Badge>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-5 w-5" />
            <span>Failed to load integration health data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="integration-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Plug className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Integration Health
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor Salesforce, webhooks, AI providers, n8n automation, and single sign-on connectivity
          </p>
        </CardHeader> 
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-4 pb-4 pt-0">
        <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Cloud className="h-24 w-24 opacity-10 text-blue-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Cloud className="w-5 h-5 text-blue-700 dark:text-blue-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Salesforce</h3>
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {data.salesforce.connectedUsers}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">connected users</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Webhook className="h-24 w-24 opacity-10 text-green-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Webhook className="w-5 h-5 text-green-700 dark:text-green-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Webhooks</h3>
            </div>
            <div className="text-2xl font-bold text-green-600">
              {data.webhooks.activeWebhooks}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">active webhooks</p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Brain className="h-24 w-24 opacity-10 text-purple-600" />
          </div>
          <CardContent className="relative p-4">
            <div className="flex items-center space-x-2 mb-2">
              <Brain className="w-5 h-5 text-purple-700 dark:text-purple-300" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Providers</h3>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {data.aiProviders.configuredProviders}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">configured providers</p>
          </CardContent>
        </Card>

        {/* n8n workflow automation — reads stored last-test result, no live probe */}
        {(() => {
          const n8n = data.n8n;
          // Derive a simple 5-state status from the stored DB values
          const n8nState = !n8n
            ? 'unknown'
            : !n8n.isConfigured
            ? 'unconfigured'
            : !n8n.isEnabled
            ? 'disabled'
            : n8n.lastTestResult === 'success'
            ? 'ok'
            : n8n.lastTestResult === 'failed'
            ? 'failed'
            : 'untested';

          const statusLabel: Record<string, string> = {
            ok: 'Connected',
            failed: 'Failed',
            disabled: 'Disabled',
            unconfigured: 'Not Set Up',
            untested: 'Not Tested',
            unknown: 'Unavailable',
          };

          const statusColor: Record<string, string> = {
            ok: 'text-green-600 dark:text-green-400',
            failed: 'text-red-600 dark:text-red-400',
            disabled: 'text-gray-400 dark:text-gray-500',
            unconfigured: 'text-gray-400 dark:text-gray-500',
            untested: 'text-gray-400 dark:text-gray-500',
            unknown: 'text-gray-400 dark:text-gray-500',
          };

          const lastTestedText = n8n?.lastTestedAt
            ? `Tested ${formatDistanceToNow(new Date(n8n.lastTestedAt))} ago`
            : n8nState === 'ok' || n8nState === 'failed'
            ? 'Test time unavailable'
            : 'Never tested — use the Test Connection button in Configuration → Integrations → n8n';

          return (
            <Card className="relative overflow-hidden bg-orange-50/80 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Network className="h-24 w-24 opacity-10 text-orange-600" />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Network className="w-5 h-5 text-orange-700 dark:text-orange-300" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">n8n Automation</h3>
                </div>
                <div className={`text-2xl font-bold ${statusColor[n8nState]}`}>
                  {statusLabel[n8nState]}
                </div>
                <p
                  className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight"
                  title={n8n?.lastTestError ?? undefined}
                >
                  {lastTestedText}
                </p>
                {n8nState === 'failed' && n8n?.lastTestError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate" title={n8n.lastTestError}>
                    {n8n.lastTestError}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Okta SSO / Azure SSO — same pattern as n8n: stored last-test result, no live probe */}
        {(() => {
          const sso = data.sso;
          const ssoState = !sso
            ? 'unknown'
            : !sso.isConfigured
            ? 'unconfigured'
            : !sso.isEnabled
            ? 'disabled'
            : sso.lastTestResult === 'success'
            ? 'ok'
            : sso.lastTestResult === 'failure'
            ? 'failed'
            : 'untested';

          const statusLabel: Record<string, string> = {
            ok: 'Connected',
            failed: 'Failed',
            disabled: 'Disabled',
            unconfigured: 'Not Set Up',
            untested: 'Not Tested',
            unknown: 'Unavailable',
          };

          const statusColor: Record<string, string> = {
            ok: 'text-green-600 dark:text-green-400',
            failed: 'text-red-600 dark:text-red-400',
            disabled: 'text-gray-400 dark:text-gray-500',
            unconfigured: 'text-gray-400 dark:text-gray-500',
            untested: 'text-gray-400 dark:text-gray-500',
            unknown: 'text-gray-400 dark:text-gray-500',
          };

          const lastTestedText = sso?.lastTestedAt
            ? `Tested ${formatDistanceToNow(new Date(sso.lastTestedAt))} ago`
            : ssoState === 'ok' || ssoState === 'failed'
            ? 'Test time unavailable'
            : 'Never tested — use Test Connection on the Okta SSO or Azure SSO card in Admin → Integrations → Overview';

          return (
            <Card className="relative overflow-hidden bg-indigo-50/80 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <Shield className="h-24 w-24 opacity-10 text-indigo-600" />
              </div>
              <CardContent className="relative p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Shield className="w-5 h-5 text-indigo-700 dark:text-indigo-300" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {ssoTitle(sso?.provider)}
                  </h3>
                </div>
                <div className={`text-2xl font-bold ${statusColor[ssoState]}`}>
                  {statusLabel[ssoState]}
                </div>
                {sso && ssoState === 'ok' && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {sso.successfulLogins24h} sign-in{sso.successfulLogins24h === 1 ? '' : 's'} · {sso.failedLogins24h} failed (24h)
                  </p>
                )}
                <p
                  className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight"
                  title={sso?.lastTestError ?? undefined}
                >
                  {lastTestedText}
                </p>
                {ssoState === 'failed' && sso?.lastTestError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate" title={sso.lastTestError}>
                    {sso.lastTestError}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()}
      </div>

      {data.webhooks.recentFailures.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="text-lg text-yellow-800 dark:text-yellow-200">{t("systemHealth.integrations.webhookFailures.title")}</CardTitle>
            <CardDescription className="text-yellow-600 dark:text-yellow-400">
              {t("systemHealth.integrations.webhookFailures.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebhookFailuresTable failures={data.webhooks.recentFailures} />
          </CardContent>
        </Card>
      )}
      </Card>
    </div>
  );
}
