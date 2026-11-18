/**
 * Salesforce Sync Issues panel (Admin > Integrations > Salesforce > Sync
 * History). Health KPIs plus the list of records whose latest sync failed,
 * with Retry and Resolve. Ported from ImpactIQ's CRM Sync page.
 *
 * An issue is the latest sync attempt for a record + direction when that
 * attempt failed. A later success clears it; Resolve marks it handled
 * without retrying, and a newer failure reopens it.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Link2Off,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

type IssueStatus = "open" | "resolved" | "all";

interface SyncIssue {
  itemId: number;
  runId: number;
  cqiEntityType: string;
  cqiRecordId: string;
  recordName: string | null;
  sfObjectType: string | null;
  sfRecordId: string | null;
  direction: string;
  message: string | null;
  failedAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  linkStatus: string | null;
}

interface SyncHealth {
  openIssues: number;
  resolvedIssues: number;
  successRate24h: number | null;
  attempts24h: number;
  pendingQueue: number;
  retryingQueue: number;
  brokenLinks: number;
  lastRunAt: string | null;
}

const HEALTH_KEY = ["/api/admin/salesforce/sync/health"];
const issuesKey = (status: IssueStatus) => ["/api/admin/salesforce/sync/issues", status];

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: "red" | "green" | "amber" | "blue" | "gray" }) {
  const toneClass = {
    red: "text-red-600 dark:text-red-400",
    green: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
    gray: "text-gray-900 dark:text-gray-100",
  }[tone];
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** `showLinkCheck` hides the Check links now button; it checks the active CRM's links. */
export function SalesforceSyncIssuesPanel({ showLinkCheck = true }: { showLinkCheck?: boolean } = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<IssueStatus>("open");
  const [sortConfig, handleSort] = useUrlSortState("sfSyncIssues");

  const { data: healthData } = useQuery<{ health: SyncHealth }>({
    queryKey: HEALTH_KEY,
    queryFn: () => apiRequest("GET", "/api/admin/salesforce/sync/health"),
    refetchInterval: 60_000,
  });

  const { data: issuesData, isLoading, refetch, isFetching } = useQuery<{ issues: SyncIssue[] }>({
    queryKey: issuesKey(status),
    queryFn: () => apiRequest("GET", `/api/admin/salesforce/sync/issues?status=${status}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: HEALTH_KEY });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/salesforce/sync/issues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/salesforce/sync/history"] });
  };

  const resolveMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest("POST", `/api/admin/salesforce/sync/issues/${itemId}/resolve`),
    onSuccess: () => {
      showSuccessToast(t("integrations.salesforce.syncIssues.resolvedToastTitle"), t("integrations.salesforce.syncIssues.resolvedToastBody"));
      invalidate();
    },
    onError: (error: Error) => showErrorToast(t("integrations.salesforce.syncIssues.actionFailed"), error.message),
  });

  const retryMutation = useMutation({
    mutationFn: (itemId: number) => apiRequest("POST", `/api/admin/salesforce/sync/issues/${itemId}/retry`),
    onSuccess: () => {
      showSuccessToast(t("integrations.salesforce.syncIssues.retriedToastTitle"), t("integrations.salesforce.syncIssues.retriedToastBody"));
      invalidate();
    },
    onError: (error: Error) => showErrorToast(t("integrations.salesforce.syncIssues.actionFailed"), error.message),
  });

  const linkCheckMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/salesforce/sync/link-check"),
    onSuccess: (data: { result?: { checked: number; markedBroken: number; restored: number } }) => {
      showSuccessToast(
        t("integrations.salesforce.syncIssues.linkCheckDoneTitle"),
        t("integrations.salesforce.syncIssues.linkCheckDoneBody", {
          checked: data?.result?.checked ?? 0,
          broken: data?.result?.markedBroken ?? 0,
          restored: data?.result?.restored ?? 0,
        }),
      );
      invalidate();
    },
    onError: (error: Error) => showErrorToast(t("integrations.salesforce.syncIssues.actionFailed"), error.message),
  });

  const health = healthData?.health;
  const issues = sortRows(issuesData?.issues ?? [], sortConfig, {
    record: (i) => i.recordName || `${i.cqiEntityType} #${i.cqiRecordId}`,
    direction: (i) => i.direction,
    message: (i) => i.message,
    failedAt: (i) => (i.failedAt ? new Date(i.failedAt) : null),
  });
  const pendingId = resolveMutation.isPending ? resolveMutation.variables : retryMutation.isPending ? retryMutation.variables : null;

  const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

  const statusOptions: { value: IssueStatus; label: string }[] = [
    { value: "open", label: t("integrations.salesforce.syncIssues.filterOpen") },
    { value: "resolved", label: t("integrations.salesforce.syncIssues.filterResolved") },
    { value: "all", label: t("integrations.salesforce.syncIssues.filterAll") },
  ];

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              {t("integrations.salesforce.syncIssues.title")}
            </CardTitle>
            <CardDescription>{t("integrations.salesforce.syncIssues.description")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {showLinkCheck ? (
              <Button size="sm" variant="outline" onClick={() => linkCheckMutation.mutate()} disabled={linkCheckMutation.isPending}>
                {linkCheckMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                {t("integrations.salesforce.syncIssues.checkLinksNow")}
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={() => { refetch(); queryClient.invalidateQueries({ queryKey: HEALTH_KEY }); }} disabled={isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              {t("integrations.salesforce.syncIssues.refresh")}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard
            label={t("integrations.salesforce.syncIssues.kpiOpenResolved")}
            value={health ? `${health.openIssues}/${health.resolvedIssues}` : "—"}
            tone={health && health.openIssues > 0 ? "red" : "gray"}
          />
          <KpiCard
            label={t("integrations.salesforce.syncIssues.kpiSuccessRate")}
            value={health?.successRate24h != null ? `${health.successRate24h}%` : "—"}
            sub={health ? t("integrations.salesforce.syncIssues.kpiAttempts", { count: health.attempts24h }) : undefined}
            tone={health?.successRate24h != null && health.successRate24h < 95 ? "amber" : "green"}
          />
          <KpiCard
            label={t("integrations.salesforce.syncIssues.kpiQueue")}
            value={health ? String(health.pendingQueue) : "—"}
            sub={health ? t("integrations.salesforce.syncIssues.kpiRetrying", { count: health.retryingQueue }) : undefined}
            tone="blue"
          />
          <KpiCard
            label={t("integrations.salesforce.syncIssues.kpiBrokenLinks")}
            value={health ? String(health.brokenLinks) : "—"}
            tone={health && health.brokenLinks > 0 ? "amber" : "gray"}
          />
          <KpiCard
            label={t("integrations.salesforce.syncIssues.kpiLastRun")}
            value={health?.lastRunAt ? new Date(health.lastRunAt).toLocaleDateString() : "—"}
            sub={health?.lastRunAt ? new Date(health.lastRunAt).toLocaleTimeString() : undefined}
            tone="gray"
          />
        </div>

        <div className="flex items-center gap-1" role="group" aria-label={t("integrations.salesforce.syncIssues.filterLabel")}>
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={status === opt.value ? "default" : "outline"}
              onClick={() => setStatus(opt.value)}
            >
              {opt.value === "open" ? <AlertTriangle className="mr-1.5 h-3.5 w-3.5" /> : opt.value === "resolved" ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Clock className="mr-1.5 h-3.5 w-3.5" />}
              {opt.label}
            </Button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
          </div>
        ) : issues.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-emerald-500 dark:text-emerald-400" />
            <p className="text-sm text-muted-foreground">
              {status === "open" ? t("integrations.salesforce.syncIssues.emptyOpen") : t("integrations.salesforce.syncIssues.emptyOther")}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                  <SortableTableHead sortKey="record" sortConfig={sortConfig} onSort={handleSort}>
                    {t("integrations.salesforce.syncIssues.colRecord")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="direction" sortConfig={sortConfig} onSort={handleSort}>
                    {t("integrations.salesforce.syncIssues.colDirection")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="message" sortConfig={sortConfig} onSort={handleSort}>
                    {t("integrations.salesforce.syncIssues.colError")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="failedAt" sortConfig={sortConfig} onSort={handleSort}>
                    {t("integrations.salesforce.syncIssues.colFailed")}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right">{t("integrations.salesforce.syncIssues.colActions")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => {
                  const resolved = !!issue.resolvedAt;
                  const busy = pendingId === issue.itemId;
                  return (
                    <TableRow key={issue.itemId} className={resolved ? "opacity-60" : undefined}>
                      <TableCell>
                        <div className="font-medium text-gray-900 dark:text-gray-100">
                          {issue.recordName || `${issue.cqiEntityType} #${issue.cqiRecordId}`}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="capitalize">{t(`integrations.salesforce.syncIssues.entity.${issue.cqiEntityType}`, { defaultValue: issue.cqiEntityType })}</span>
                          {issue.sfObjectType ? <span>· {issue.sfObjectType}</span> : null}
                          {issue.linkStatus === "broken" ? (
                            <Badge variant="outline" className="ml-1 border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
                              <Link2Off className="mr-1 h-3 w-3" />
                              {t("integrations.salesforce.syncIssues.linkBroken")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-gray-200 dark:border-gray-700">
                          {issue.direction === "inbound" ? <ArrowLeft className="mr-1 h-3 w-3" /> : <ArrowRight className="mr-1 h-3 w-3" />}
                          {issue.direction === "inbound" ? t("integrations.salesforce.syncIssues.inbound") : t("integrations.salesforce.syncIssues.outbound")}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md">
                        <p className="break-words text-sm text-red-700 dark:text-red-300">{issue.message || t("integrations.salesforce.syncIssues.noMessage")}</p>
                        {resolved ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("integrations.salesforce.syncIssues.resolvedBy", { name: issue.resolvedByName || t("integrations.salesforce.syncIssues.unknownUser"), date: formatDate(issue.resolvedAt) })}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(issue.failedAt)}</TableCell>
                      <TableCell className="text-right">
                        <TooltipProvider>
                          <div className="flex justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="sm" variant="outline" disabled={busy || issue.linkStatus === "broken"} onClick={() => retryMutation.mutate(issue.itemId)}>
                                  {busy && retryMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
                                  {t("integrations.salesforce.syncIssues.retry")}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {issue.linkStatus === "broken" ? t("integrations.salesforce.syncIssues.retryBrokenTip") : t("integrations.salesforce.syncIssues.retryTip")}
                              </TooltipContent>
                            </Tooltip>
                            {!resolved ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => resolveMutation.mutate(issue.itemId)}>
                                    {busy && resolveMutation.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                                    {t("integrations.salesforce.syncIssues.resolve")}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{t("integrations.salesforce.syncIssues.resolveTip")}</TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
