import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Activity, CheckCircle2, Clock, Loader2, RefreshCw, Timer, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { cn } from "@/lib/utils";

type CallStatus = "ok" | "error" | "throttled";

interface McpCall {
  id: number;
  calledAt: string;
  tool: string;
  status: CallStatus;
  latencyMs: number | null;
  error: string | null;
  apiKeyLabel: string | null;
  apiKeyPrefix: string | null;
}

const ALL = "all";

const STATUS_STYLE: Record<CallStatus, { icon: LucideIcon; className: string }> = {
  ok: { icon: CheckCircle2, className: "text-green-700 dark:text-green-400" },
  error: { icon: XCircle, className: "text-red-700 dark:text-red-400" },
  throttled: { icon: Clock, className: "text-amber-700 dark:text-amber-400" },
};

function StatusLabel({ status }: { status: CallStatus }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap", className)}>
      <Icon className="h-3.5 w-3.5" />
      {t(`integrations.mcp.activity.status.${status}`)}
    </span>
  );
}

function StatTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone?: CallStatus }) {
  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Icon className={cn("h-3.5 w-3.5", tone && STATUS_STYLE[tone].className)} />
        {label}
      </div>
      <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

/**
 * Admin › Integrations › MCP Server › Activity (from ImpactIQ's McpActivity):
 * today's call counts and latency, then the most recent tool calls with a
 * status filter and a text search. Kept 30 days on the server.
 */
export function McpActivityCard() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<CallStatus | typeof ALL>(ALL);
  const [search, setSearch] = useState("");
  const [sortConfig, handleSort] = useUrlSortState("mcpActivity");

  const query = status === ALL ? "" : `&status=${status}`;
  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ calls: McpCall[] }>({
    queryKey: [`/api/admin/mcp/activity?limit=500${query}`],
  });
  const calls = data?.calls ?? [];

  const stats = useMemo(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const today = calls.filter((c) => new Date(c.calledAt) >= midnight);
    const latencies = today.map((c) => c.latencyMs ?? 0).filter((ms) => ms > 0);
    return {
      total: today.length,
      ok: today.filter((c) => c.status === "ok").length,
      errors: today.filter((c) => c.status === "error").length,
      throttled: today.filter((c) => c.status === "throttled").length,
      avgMs: latencies.length ? Math.round(latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length) : 0,
    };
  }, [calls]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? calls.filter((c) => [c.tool, c.apiKeyLabel ?? "", c.error ?? ""].some((value) => value.toLowerCase().includes(term)))
      : calls;
    return sortRows(matches, sortConfig, {
      calledAt: (c) => new Date(c.calledAt),
      status: (c) => t(`integrations.mcp.activity.status.${c.status}`),
      latencyMs: (c) => c.latencyMs,
      key: (c) => c.apiKeyLabel ?? t("integrations.mcp.activity.revokedKey"),
      error: (c) => c.error,
    });
  }, [calls, search, sortConfig, t]);

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(i18n.language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <Card className="flex flex-col gap-4 p-5" data-testid="mcp-activity">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{t("integrations.mcp.activity.title")}</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t("integrations.mcp.activity.description")}</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          {t("integrations.mcp.activity.refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile label={t("integrations.mcp.activity.stats.today")} value={String(stats.total)} icon={Activity} />
        <StatTile label={t("integrations.mcp.activity.status.ok")} value={String(stats.ok)} icon={CheckCircle2} tone="ok" />
        <StatTile label={t("integrations.mcp.activity.stats.errors")} value={String(stats.errors)} icon={XCircle} tone="error" />
        <StatTile label={t("integrations.mcp.activity.status.throttled")} value={String(stats.throttled)} icon={Clock} tone="throttled" />
        <StatTile
          label={t("integrations.mcp.activity.stats.avgLatency")}
          value={t("integrations.mcp.activity.ms", { value: stats.avgMs })}
          icon={Timer}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("integrations.mcp.activity.searchPlaceholder")}
          aria-label={t("integrations.mcp.activity.searchPlaceholder")}
          className="sm:max-w-xs"
        />
        <Select value={status} onValueChange={(value) => setStatus(value as CallStatus | typeof ALL)}>
          <SelectTrigger className="sm:w-44" aria-label={t("integrations.mcp.activity.statusFilter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("integrations.mcp.activity.allStatuses")}</SelectItem>
            <SelectItem value="ok">{t("integrations.mcp.activity.status.ok")}</SelectItem>
            <SelectItem value="error">{t("integrations.mcp.activity.status.error")}</SelectItem>
            <SelectItem value="throttled">{t("integrations.mcp.activity.status.throttled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-700 dark:text-red-300">{t("integrations.mcp.activity.loadError")}</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t("integrations.mcp.activity.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="calledAt" sortConfig={sortConfig} onSort={handleSort}>
                  {t("integrations.mcp.activity.columns.time")}
                </SortableTableHead>
                <SortableTableHead sortKey="tool" sortConfig={sortConfig} onSort={handleSort}>
                  {t("integrations.mcp.activity.columns.tool")}
                </SortableTableHead>
                <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                  {t("integrations.mcp.activity.columns.status")}
                </SortableTableHead>
                <SortableTableHead sortKey="latencyMs" sortConfig={sortConfig} onSort={handleSort} align="right">
                  {t("integrations.mcp.activity.columns.latency")}
                </SortableTableHead>
                <SortableTableHead sortKey="key" sortConfig={sortConfig} onSort={handleSort}>
                  {t("integrations.mcp.activity.columns.key")}
                </SortableTableHead>
                <SortableTableHead sortKey="error" sortConfig={sortConfig} onSort={handleSort}>
                  {t("integrations.mcp.activity.columns.error")}
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((call) => (
                <TableRow key={call.id}>
                  <TableCell className="whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">{formatTime(call.calledAt)}</TableCell>
                  <TableCell className="font-mono text-xs text-gray-900 dark:text-gray-100">{call.tool}</TableCell>
                  <TableCell className="text-xs">
                    <StatusLabel status={call.status} />
                  </TableCell>
                  <TableCell className="text-right text-xs text-gray-600 dark:text-gray-400">
                    {call.latencyMs == null ? "" : t("integrations.mcp.activity.ms", { value: call.latencyMs })}
                  </TableCell>
                  <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                    {call.apiKeyLabel ?? t("integrations.mcp.activity.revokedKey")}
                    {call.apiKeyPrefix && <span className="ml-1 font-mono text-gray-400 dark:text-gray-500">{call.apiKeyPrefix}…</span>}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-xs text-red-700 dark:text-red-300" title={call.error ?? undefined}>
                    {call.error}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
