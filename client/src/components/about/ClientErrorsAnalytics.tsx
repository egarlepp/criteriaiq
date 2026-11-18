"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  filterErrorLogs,
  computeErrorLogAnalytics,
  type ErrorLogLike,
  type ErrorLogFilters,
} from "./error-audit-log-utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  FileWarning,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useChartTheme } from "@/hooks/useChartTheme";
import {
  SEVERITY_CONFIG,
  SEVERITY_ORDER,
  type SeverityLevel,
} from "@/lib/error-severity";

/**
 * Shape returned by `GET /api/error-logs/analytics`. The four datasets
 * are computed server-side, UNCAPPED across the whole `client_error_logs`
 * table (the audit-log `/api/error-logs` endpoint is capped at 500 rows
 * for the table view; this panel needs every error). Severity is computed
 * server-side with the SAME `classifyErrorSeverity` heuristic the table
 * uses, so the pie chart and table always agree.
 */
interface ClientErrorAnalytics {
  totalErrors: number;
  errorsByDay: Array<{ date: string; count: number }>;
  topPages: Array<{ page: string; count: number }>;
  topMessages: Array<{ message: string; count: number }>;
  severityCounts: Record<SeverityLevel, number>;
}

const EMPTY_ANALYTICS: ClientErrorAnalytics = {
  totalErrors: 0,
  errorsByDay: [],
  topPages: [],
  topMessages: [],
  severityCounts: { critical: 0, high: 0, medium: 0, low: 0 },
};

const TIME_WINDOW_DAYS = 14;

/** Truncate a long label for axis display while keeping the full text for tooltips. */
function truncateLabel(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.substring(0, max - 1) + "…";
}

interface ClientErrorsAnalyticsProps {
  /** Only fetch when the panel is actually expanded. */
  expanded: boolean;
  /**
   * Full filter set applied to the Client Error Audit Log table below.
   * When any field is non-default, the analytics charts re-aggregate
   * from the filtered row set so the panel reflects exactly what the
   * table shows. Mirrors the search-and-filters integration used
   * elsewhere in the app.
   */
  filters?: ErrorLogFilters;
}

export function ClientErrorsAnalytics({
  expanded,
  filters = {},
}: ClientErrorsAnalyticsProps) {
  const { isDark, getColor, axisStyles } = useChartTheme();

  // Subscribe to the same `/api/error-logs?limit=500` query the audit
  // log table uses (identical React Query key → shared cache → no
  // duplicate request). The previous version fetched a separate
  // server-aggregated endpoint that ignored the page filters, which
  // left the analytics panel showing "111 errors" while the table
  // below was filtered down to one row. Computing client-side from the
  // same filtered set keeps the two surfaces in lock-step.
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ErrorLogLike[]>({
    queryKey: ["/api/error-logs"],
    queryFn: () => apiRequest("GET", "/api/error-logs?limit=500"),
    enabled: expanded,
    refetchOnWindowFocus: false,
  });

  const rawLogs = data ?? [];
  const filteredLogs = useMemo(
    () => filterErrorLogs(rawLogs, filters),
    [rawLogs, filters]
  );
  const analytics = useMemo(
    () => (filteredLogs.length > 0 ? computeErrorLogAnalytics(filteredLogs) : EMPTY_ANALYTICS),
    [filteredLogs]
  );

  // ── Chart 1: Errors per day (server zero-fills the trailing 14 days) ──
  // The server returns the contiguous, ascending YYYY-MM-DD series; we
  // just add a short "MMM d" axis label here.
  const errorsByDay = useMemo(
    () =>
      analytics.errorsByDay.map((row) => {
        const parsed = parseISO(row.date);
        return {
          date: row.date,
          label: isNaN(parsed.getTime()) ? row.date : format(parsed, "MMM d"),
          count: row.count,
        };
      }),
    [analytics.errorsByDay]
  );

  // ── Chart 2: Top 5 pages (server-aggregated by URL path) ─────────────
  const topPages = useMemo(
    () =>
      analytics.topPages.map((row) => {
        const page = row.page || "unknown";
        return { path: page, label: truncateLabel(page, 28), count: row.count };
      }),
    [analytics.topPages]
  );

  // ── Chart 3: Severity counts (server-classified, same heuristic) ─────
  const severityData = useMemo(
    () =>
      SEVERITY_ORDER.map((level) => ({
        key: level,
        name: SEVERITY_CONFIG[level].label,
        value: analytics.severityCounts[level] ?? 0,
        fill: isDark ? SEVERITY_CONFIG[level].chartColorDark : SEVERITY_CONFIG[level].chartColor,
      })).filter((entry) => entry.value > 0),
    [analytics.severityCounts, isDark]
  );

  const severityTotal = severityData.reduce((sum, e) => sum + e.value, 0);

  // ── Chart 4: Top 5 messages (server-aggregated by full message) ──────
  const topMessages = useMemo(
    () =>
      analytics.topMessages.map((row) => {
        const message = (row.message ?? "").trim() || "(no message)";
        return { message, label: truncateLabel(message, 32), count: row.count };
      }),
    [analytics.topMessages]
  );

  // Chart configs (drive shadcn tooltip/legend labels + colors).
  const timeChartConfig: ChartConfig = useMemo(
    () => ({ count: { label: "Errors", color: getColor("danger") } }),
    [getColor]
  );
  const pagesChartConfig: ChartConfig = useMemo(
    () => ({ count: { label: "Errors", color: getColor("primary") } }),
    [getColor]
  );
  const messagesChartConfig: ChartConfig = useMemo(
    () => ({ count: { label: "Errors", color: getColor("orange") } }),
    [getColor]
  );
  const severityChartConfig: ChartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    severityData.forEach((entry) => {
      cfg[entry.name] = { label: entry.name, color: entry.fill };
    });
    return cfg;
  }, [severityData]);

  const hasData = analytics.totalErrors > 0;

  // ── Shared chart-card shell ──────────────────────────────────────────
  const ChartCard = ({
    title,
    icon: Icon,
    children,
    empty,
  }: {
    title: string;
    icon: typeof BarChart3;
    children: React.ReactNode;
    empty: boolean;
  }) => (
    <Card className="border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
          <Icon className="h-4 w-4 text-red-500 dark:text-red-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[220px] flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <FileWarning className="mb-2 h-8 w-8 opacity-30" />
            <p className="text-xs">No data yet</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );

  return (
    <Card className="border border-gray-200 dark:border-gray-800 relative overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl text-gray-900 dark:text-gray-100">
              <BarChart3 className="h-5 w-5 text-red-500 dark:text-red-400" />
              Client Error Analytics
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {hasData
                ? `Based on all ${analytics.totalErrors} captured error${analytics.totalErrors !== 1 ? "s" : ""}.`
                : "Visual breakdown of captured client-side errors."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[260px] w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-12 text-red-500 dark:text-red-400">
            <AlertTriangle className="h-8 w-8 mb-2" />
            <p className="text-sm mb-3">Failed to load error analytics</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: Errors over time */}
            <ChartCard title={`Errors Over Time (Last ${TIME_WINDOW_DAYS} Days)`} icon={CalendarClock} empty={false}>
              <ChartContainer config={timeChartConfig} className="h-[220px] w-full">
                <BarChart data={errorsByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={axisStyles.gridColor} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                    width={28}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>

            {/* Chart 2: Top 5 pages with errors */}
            <ChartCard title="Top 5 Pages With Errors" icon={FileWarning} empty={topPages.length === 0}>
              <ChartContainer config={pagesChartConfig} className="h-[220px] w-full">
                <BarChart
                  data={topPages}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke={axisStyles.gridColor} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={150}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.path ?? ""}
                      />
                    }
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>

            {/* Chart 3: Severity counts (pie) */}
            <ChartCard title="Errors by Severity" icon={ShieldAlert} empty={severityData.length === 0}>
              <ChartContainer config={severityChartConfig} className="h-[220px] w-full">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                  <Pie
                    data={severityData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={45}
                    outerRadius={80}
                    strokeWidth={3}
                    paddingAngle={1}
                  >
                    {severityData.map((entry) => (
                      <Cell key={entry.key} fill={entry.fill} />
                    ))}
                  </Pie>
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} className="flex-wrap gap-2 text-xs" />
                </PieChart>
              </ChartContainer>
              <p className="text-center text-xs text-gray-400 dark:text-gray-500 -mt-1">
                {severityTotal} classified error{severityTotal !== 1 ? "s" : ""}
              </p>
            </ChartCard>

            {/* Chart 4: Top 5 messages */}
            <ChartCard title="Top 5 Error Messages" icon={BarChart3} empty={topMessages.length === 0}>
              <ChartContainer config={messagesChartConfig} className="h-[220px] w-full">
                <BarChart
                  data={topMessages}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke={axisStyles.gridColor} strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    width={180}
                    tick={{ fill: axisStyles.tickColor, fontSize: 10 }}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(_label, payload) => payload?.[0]?.payload?.message ?? ""}
                      />
                    }
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ChartContainer>
            </ChartCard>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
