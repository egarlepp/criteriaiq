import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useSystemHealthCategoryQuery } from "./useSystemHealthCategoryQuery";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Mail,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Send,
  XCircle,
  Clock,
  Settings,
  Zap,
  Activity,
  Wifi,
  ExternalLink,
  AlertCircle,
  Calendar,
  CalendarDays,
  Percent,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HealthFreshnessIndicator } from "./HealthFreshnessIndicator";
import { formatDistanceToNow } from "date-fns";
import { EmailLogCard } from "./EmailLogCard";
import { EMAIL_CONFIGURATION_HREF } from "@/lib/admin-redirects";

interface EmailHealthData {
  status: "ok" | "warning" | "error";
  lastChecked: string;
  message: string;
  configuration: {
    isConfigured: boolean;
    enabled: boolean;
    provider: string | null;
    server: string | null;
    port: number | null;
    /** Delivery transport: 'smtp' (default) or 'graph' (Microsoft Graph). */
    authType?: string;
  };
  queueStats: {
    firedToday: number;
    sent24h: number;
    failed24h: number;
    totalLogs: number;
    sentThisWeek: number;
    sentThisMonth: number;
    successRate: number;
  };
  /** Most recent email_logs entry (all-time). Null fields = no email history. */
  lastSendStatus: {
    success: boolean | null;
    sentAt: string | null;
    error: string | null;
  };
  recentFailures: Array<{
    id: number;
    recipient: string;
    subject: string;
    error: string;
    sentAt: string;
  }>;
  schedulerStatus: {
    active: boolean;
    lastRun: string | null;
    /** Count of enabled automation rules; distinguishes "no rules" from "engine stopped". */
    enabledRulesCount: number;
  };
}

interface ProbeResult {
  success: boolean;
  message: string;
  latencyMs: number;
  authType: string;
}

interface EmailLogMetricTileProps {
  label: string;
  value: string | number;
  sub: string;
  icon: typeof Mail;
  tone: string;
  iconTone: string;
  valueTone: string;
}

/** One Email Log metric, styled like the overview tiles above it. */
function EmailLogMetricTile({ label, value, sub, icon: Icon, tone, iconTone, valueTone }: EmailLogMetricTileProps) {
  return (
    <Card className={`relative overflow-hidden ${tone}`}>
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <Icon className={`h-24 w-24 opacity-10 ${valueTone}`} />
      </div>
      <CardContent className="relative p-4">
        <div className="mb-2 flex items-center space-x-2">
          <Icon className={`h-5 w-5 ${iconTone}`} />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</h3>
        </div>
        <div className={`text-2xl font-bold ${valueTone}`}>{value}</div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>
      </CardContent>
    </Card>
  );
}

/** Recent Failures table; newest first until a column is clicked. */
function RecentFailuresTable({ failures }: { failures: EmailHealthData["recentFailures"] }) {
  const { t } = useTranslation();
  const [sortConfig, handleSort] = useUrlSortState("emailFailures");
  const rows = useMemo(
    () =>
      sortRows(
        [...failures].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()),
        sortConfig,
        { sentAt: (f) => new Date(f.sentAt) },
      ),
    [failures, sortConfig],
  );
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableTableHead sortKey="recipient" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.email.recentFailures.colRecipient")}
          </SortableTableHead>
          <SortableTableHead sortKey="subject" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.email.recentFailures.colSubject")}
          </SortableTableHead>
          <SortableTableHead sortKey="error" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.email.recentFailures.colError")}
          </SortableTableHead>
          <SortableTableHead sortKey="sentAt" sortConfig={sortConfig} onSort={handleSort}>
            {t("systemHealth.email.recentFailures.colTime")}
          </SortableTableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((failure) => (
          <TableRow key={failure.id}>
            <TableCell className="font-medium">{failure.recipient}</TableCell>
            <TableCell className="max-w-[200px] truncate">{failure.subject}</TableCell>
            <TableCell className="text-red-600 dark:text-red-400 text-sm max-w-[200px] truncate">
              {failure.error}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {new Date(failure.sentAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function EmailHealthTab() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useSystemHealthCategoryQuery<EmailHealthData>({
    queryKey: ["system-health-email"],
    queryFn: async () => {
      const response = await fetch("/api/system/health/email");
      if (!response.ok) throw new Error("Failed to fetch email health");
      return response.json();
    },
    refetchInterval: 60000,
  });

  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);

  const handleProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const res = await fetch("/api/system/health/email/probe", { method: "POST" });
      const json: ProbeResult = await res.json();
      setProbeResult(json);
    } catch {
      setProbeResult({ success: false, message: "Network error — could not reach the server.", latencyMs: 0, authType: "smtp" });
    } finally {
      setProbeLoading(false);
    }
  };

  const getStatusBadge = (status: "ok" | "warning" | "error") => {
    switch (status) {
      case "ok":
        return (
          <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Operational
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
            Not Configured
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
            <span>Failed to load email health data.</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const isGraph = data.configuration.authType === "graph";
  const transportLabel = isGraph ? "Microsoft Graph" : "SMTP";

  const { lastSendStatus, schedulerStatus } = data;

  // Last-send delivery badge colour
  const lastSendVariant: "green" | "red" | "gray" =
    lastSendStatus.success === true
      ? "green"
      : lastSendStatus.success === false
        ? "red"
        : "gray";

  const lastSentAgo =
    lastSendStatus.sentAt
      ? formatDistanceToNow(new Date(lastSendStatus.sentAt), { addSuffix: true })
      : null;

  // Automation status: three distinct states
  const automationState: "active" | "no-rules" | "stopped" =
    schedulerStatus.active
      ? "active"
      : schedulerStatus.enabledRulesCount > 0
        ? "stopped"
        : "no-rules";

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* ── Overview card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="relative">
          <div className="absolute top-4 right-4 flex items-center gap-3">
            {getStatusBadge(data.status)}
            <HealthFreshnessIndicator
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => refetch()}
              testIdPrefix="email-health"
              lastCheckedIso={data.lastChecked}
            />
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-6 w-6 text-blue-600" />
            <CardTitle className="text-2xl font-bold">
              Email System Health
            </CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {isGraph
              ? "Microsoft Graph configuration, queue status, and delivery metrics"
              : "SMTP configuration, queue status, and delivery metrics"}
          </p>
        </CardHeader>

        <div className="grid grid-cols-4 gap-4 px-4 pb-4 pt-0">
          {/* Configuration */}
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Settings className="h-24 w-24 opacity-10 text-blue-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Settings className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Configuration</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {data.configuration.isConfigured ? "Configured" : "Not Configured"}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isGraph ? "Microsoft Graph" : "SMTP settings"}
              </p>
            </CardContent>
          </Card>

          {/* Sent 24 h */}
          <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Send className="h-24 w-24 opacity-10 text-green-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Send className="w-5 h-5 text-green-700 dark:text-green-300" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sent (24h)</h3>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {data.queueStats.sent24h}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">emails delivered</p>
            </CardContent>
          </Card>

          {/* Failed 24 h */}
          <Card className={`relative overflow-hidden ${data.queueStats.failed24h > 0 ? "bg-red-50/80 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-gray-50/80 dark:bg-gray-800 border-gray-200 dark:border-gray-700"}`}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <XCircle className={`h-24 w-24 opacity-10 ${data.queueStats.failed24h > 0 ? "text-red-600" : "text-gray-600 dark:text-gray-400"}`} />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <XCircle className={`w-5 h-5 ${data.queueStats.failed24h > 0 ? "text-red-700 dark:text-red-300" : "text-gray-700 dark:text-gray-300"}`} />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Failed (24h)</h3>
              </div>
              <div className={`text-2xl font-bold ${data.queueStats.failed24h > 0 ? "text-red-600" : "text-gray-600 dark:text-gray-400"}`}>
                {data.queueStats.failed24h}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">delivery failures</p>
            </CardContent>
          </Card>

          {/* Rules fired 24 h */}
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Zap className="h-24 w-24 opacity-10 text-blue-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Zap className="w-5 h-5 text-blue-700 dark:text-blue-300" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Rules Fired (24h)</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {data.queueStats.firedToday}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">automation rules triggered</p>
            </CardContent>
          </Card>
        </div>

        {/* Email Log metrics (moved from Integrations › Email Configuration). */}
        <div className="grid grid-cols-2 gap-4 px-4 pb-4 pt-0 md:grid-cols-4" data-testid="email-log-metrics">
          <EmailLogMetricTile
            label={t("systemHealth.emailLog.metrics.total")}
            value={data.queueStats.totalLogs.toLocaleString()}
            sub={t("systemHealth.emailLog.metrics.totalSub")}
            icon={Mail}
            tone="bg-blue-50/80 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
            iconTone="text-blue-700 dark:text-blue-300"
            valueTone="text-blue-600 dark:text-blue-400"
          />
          <EmailLogMetricTile
            label={t("systemHealth.emailLog.metrics.week")}
            value={data.queueStats.sentThisWeek.toLocaleString()}
            sub={t("systemHealth.emailLog.metrics.weekSub")}
            icon={Calendar}
            tone="bg-purple-50/80 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
            iconTone="text-purple-700 dark:text-purple-300"
            valueTone="text-purple-600 dark:text-purple-400"
          />
          <EmailLogMetricTile
            label={t("systemHealth.emailLog.metrics.month")}
            value={data.queueStats.sentThisMonth.toLocaleString()}
            sub={t("systemHealth.emailLog.metrics.monthSub")}
            icon={CalendarDays}
            tone="bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
            iconTone="text-amber-700 dark:text-amber-300"
            valueTone="text-amber-600 dark:text-amber-400"
          />
          <EmailLogMetricTile
            label={t("systemHealth.emailLog.metrics.successRate")}
            value={`${data.queueStats.successRate}%`}
            sub={t("systemHealth.emailLog.metrics.successRateSub")}
            icon={Percent}
            tone="bg-green-50/80 dark:bg-green-900/20 border-green-200 dark:border-green-800"
            iconTone="text-green-700 dark:text-green-300"
            valueTone="text-green-600 dark:text-green-400"
          />
        </div>
      </Card>

      {/* ── Email Delivery Status (Option D) ────────────────────────────── */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Activity} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            <CardTitle className="text-2xl">Email Delivery Status</CardTitle>
          </div>
          <CardDescription>
            Last known send result from email history, plus an on-demand live connection test.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Last-send history row */}
          <div className="flex items-start gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Last Known Delivery</p>
              {lastSendVariant === "green" && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                  <span className="text-sm text-green-700 dark:text-green-300 font-medium">
                    Successful — sent {lastSentAgo}
                  </span>
                </div>
              )}
              {lastSendVariant === "red" && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                    <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                      Last send failed {lastSentAgo}
                    </span>
                  </div>
                  {lastSendStatus.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 ml-6 truncate max-w-md">
                      {lastSendStatus.error}
                    </p>
                  )}
                </div>
              )}
              {lastSendVariant === "gray" && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    No email history — no messages have been sent yet.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* On-demand probe row */}
          <div className="flex items-center gap-4 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40">
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Live Connection Test</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isGraph
                  ? "Acquires a Microsoft Graph token to verify your Entra app credentials — no email is sent."
                  : "Opens a TCP connection to your SMTP server and verifies credentials — no email is sent."}
              </p>
              {probeResult && (
                <div className={`flex items-start gap-2 mt-2 text-sm ${probeResult.success ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}>
                  {probeResult.success
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                  <span>
                    {probeResult.message}
                    {probeResult.latencyMs > 0 && (
                      <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                        ({probeResult.latencyMs}ms)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleProbe}
              disabled={probeLoading || !data.configuration.isConfigured}
              className="shrink-0"
            >
              {probeLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing…
                </>
              ) : (
                <>
                  <Wifi className="h-4 w-4 mr-2" />
                  Test {transportLabel} Connection
                </>
              )}
            </Button>
          </div>

          {!data.configuration.isConfigured && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {t("systemHealth.email.notConfigured.prefix")}{" "}
              <a
                href={EMAIL_CONFIGURATION_HREF}
                className="underline underline-offset-2 hover:text-amber-800 dark:hover:text-amber-200"
              >
                {t("systemHealth.email.notConfigured.link")}
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Email Automation Status ──────────────────────────────────────── */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={Mail} />
        <CardHeader className="relative z-10">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            <CardTitle className="text-2xl">Email Automation Status</CardTitle>
          </div>
          <CardDescription>
            Status of the email automation rules engine. Active when at least one rule is enabled and the engine has initialised.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">

              {/* Active */}
              {automationState === "active" && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-700 dark:text-green-300 font-medium">Active</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                    — {schedulerStatus.enabledRulesCount} rule{schedulerStatus.enabledRulesCount !== 1 ? "s" : ""} enabled
                  </span>
                </div>
              )}

              {/* No rules configured — expected/neutral */}
              {automationState === "no-rules" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 cursor-default">
                      <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                      <span className="text-gray-600 dark:text-gray-400">Inactive</span>
                      <AlertCircle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 ml-0.5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm font-medium mb-1">No automation rules are configured</p>
                    <p className="text-xs text-muted-foreground">
                      The engine is inactive because there are no enabled rules to process.
                      This is expected on a fresh installation. Create and enable rules to
                      start automated email sending.
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Rules exist but engine not running — a real problem */}
              {automationState === "stopped" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 cursor-default">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      <span className="text-amber-700 dark:text-amber-300 font-medium">Stopped</span>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 ml-0.5" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm font-medium mb-1">
                      {schedulerStatus.enabledRulesCount} enabled rule{schedulerStatus.enabledRulesCount !== 1 ? "s" : ""} found but the automation engine is not running
                    </p>
                    <p className="text-xs text-muted-foreground">
                      This may indicate the engine failed to initialise at startup. Check the
                      server logs for [EmailAutomation] errors. A server restart often resolves
                      transient start-up failures.
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}

              <div className="text-sm text-muted-foreground">
                Total emails logged:{" "}
                <span className="font-medium">{data.queueStats.totalLogs.toLocaleString()}</span>
              </div>
            </div>

            {/* Link to the automation rules page (Workflow Automation → Rules) */}
            <a
              href="/admin?tab=workflow-automation"
              className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Manage automation rules
            </a>
          </div>

          {/* Contextual guidance when inactive */}
          {automationState === "no-rules" && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-md px-3 py-2">
              Automation rules let you send emails automatically when project events occur — for example, notifying stakeholders when a phase status changes or a task is overdue.{" "}
              <a
                href="/admin?tab=workflow-automation"
                className="underline underline-offset-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              >
                Visit Workflow Automation → Rules
              </a>{" "}
              to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Failures ──────────────────────────────────────────────── */}
      {data.recentFailures.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="text-lg text-red-800 dark:text-red-300">{t("systemHealth.email.recentFailures.title")}</CardTitle>
            <CardDescription className="text-red-600 dark:text-red-400">
              {t("systemHealth.email.recentFailures.description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RecentFailuresTable failures={data.recentFailures} />
          </CardContent>
        </Card>
      )}

      {/* ── Email Log (recent emails) ────────────────────────────────────── */}
      <EmailLogCard />
    </div>
    </TooltipProvider>
  );
}
