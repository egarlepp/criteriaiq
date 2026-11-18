"use client";
import * as React from "react";
import { ChartColumn, Activity, AlertTriangle, CalendarClock, CalendarCheck } from "lucide-react";
import { Label as ChartLabel, Pie, PieChart, Cell } from "recharts";
import { startOfWeek, endOfWeek, addWeeks } from "date-fns";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isActiveProject } from "@/lib/project-status";
import { parseProjectDate } from "@/lib/date-utils";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useTranslation } from "react-i18next";

interface StatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
}

interface SuccessCriteriaItem {
  id: number;
  status?: string;
  isActive?: boolean;
}

interface ProjectData {
  id: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  successCriteria?: SuccessCriteriaItem[];
}

interface AccountMetricsWidgetProps {
  projects: ProjectData[];
  statusConfigs?: StatusConfig[];
  className?: string;
  onInternalStatusClick?: (status: string) => void;
  onCriteriaStatusClick?: (status: string) => void;
  /**
   * Internal Project Status is for internal teams only. Pass false for
   * Customer, Partner and Guest viewers: the Internal Project Status chart is
   * left out and the widget title drops the word "Internal".
   */
  showInternalStatus?: boolean;
}

const getCriteriaStatusColors = (isDark: boolean): Record<string, string> => ({
  in_progress: isDark ? "#60a5fa" : "#3b82f6",
  blocked: isDark ? "#f87171" : "#ef4444",
  deferred: isDark ? "#fbbf24" : "#eab308",
  stalled: isDark ? "#fb923c" : "#f97316",
  at_risk: isDark ? "#c084fc" : "#a855f7",
});

const CRITERIA_STATUS_LABELS: Record<string, string> = {
  in_progress: "In Progress",
  blocked: "Blocked",
  deferred: "Deferred",
  stalled: "Stalled",
  at_risk: "At Risk",
};

const getStatusFallbackColors = (isDark: boolean) => isDark ? [
  "#60a5fa", "#a78bfa", "#fb923c", "#4ade80", "#f472b6",
  "#22d3ee", "#fbbf24", "#818cf8", "#a3e635", "#2dd4bf",
] : [
  "#3b82f6", "#8b5cf6", "#f97316", "#10b981", "#ec4899",
  "#06b6d4", "#f59e0b", "#6366f1", "#84cc16", "#14b8a6",
];

export function AccountMetricsWidget({
  projects,
  statusConfigs = [],
  className = "",
  onInternalStatusClick,
  onCriteriaStatusClick,
  showInternalStatus = true,
}: AccountMetricsWidgetProps) {
  const { t } = useTranslation();
  const { isDark } = useChartTheme();
  const CRITERIA_STATUS_COLORS = getCriteriaStatusColors(isDark);
  const STATUS_FALLBACK_COLORS = getStatusFallbackColors(isDark);
  
  const metrics = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisWeekStart = startOfWeek(today, { weekStartsOn: 0 });
    const thisWeekEnd = endOfWeek(today, { weekStartsOn: 0 });
    
    const nextWeekStart = addWeeks(thisWeekStart, 1);
    const nextWeekEnd = addWeeks(thisWeekEnd, 1);

    const activeProjects = projects.filter(isActiveProject);
    
    const overdueProjects = activeProjects.filter((p) => {
      if (!p.endDate) return false;
      const endDate = parseProjectDate(p.endDate);
      return endDate < today;
    });

    const dueThisWeek = activeProjects.filter((p) => {
      if (!p.endDate) return false;
      const endDate = parseProjectDate(p.endDate);
      return endDate >= thisWeekStart && endDate <= thisWeekEnd;
    });

    const dueNextWeek = activeProjects.filter((p) => {
      if (!p.endDate) return false;
      const endDate = parseProjectDate(p.endDate);
      return endDate >= nextWeekStart && endDate <= nextWeekEnd;
    });

    return {
      activeCount: activeProjects.length,
      overdueCount: overdueProjects.length,
      dueThisWeekCount: dueThisWeek.length,
      dueNextWeekCount: dueNextWeek.length,
    };
  }, [projects]);

  const activeCriteriaData = React.useMemo(() => {
    const activeStatuses = ["in_progress", "blocked", "deferred", "stalled", "at_risk"];
    const statusCounts: Record<string, number> = {};

    projects.forEach((project) => {
      if (!project.successCriteria) return;
      project.successCriteria.forEach((criteria) => {
        if (criteria.isActive === false) return;
        const status = criteria.status?.toLowerCase() || "";
        if (activeStatuses.includes(status)) {
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
      });
    });

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: CRITERIA_STATUS_LABELS[status] || status,
      value: count,
      fill: CRITERIA_STATUS_COLORS[status] || "#6b7280",
      statusKey: status,
    }));
  }, [projects]);

  const internalStatusData = React.useMemo(() => {
    const statusCounts: Record<string, number> = {};

    projects.forEach((project) => {
      const status = project.status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const capitalizeWords = (str: string) =>
      str
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");

    return Object.entries(statusCounts).map(([status, count], index) => {
      const config = statusConfigs.find(
        (c) => c.name.toLowerCase() === status.toLowerCase()
      );
      return {
        name: capitalizeWords(status),
        value: count,
        fill: config?.color || STATUS_FALLBACK_COLORS[index % STATUS_FALLBACK_COLORS.length],
        statusKey: status,
      };
    });
  }, [projects, statusConfigs]);

  const activeCriteriaTotal = activeCriteriaData.reduce((sum, d) => sum + d.value, 0);
  const internalStatusTotal = internalStatusData.reduce((sum, d) => sum + d.value, 0);

  const criteriaChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    activeCriteriaData.forEach((item) => {
      cfg[item.name] = { label: item.name, color: item.fill };
    });
    return cfg;
  }, [activeCriteriaData]);

  const internalChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    internalStatusData.forEach((item) => {
      cfg[item.name] = { label: item.name, color: item.fill };
    });
    return cfg;
  }, [internalStatusData]);

  return (
    <div
      className={`rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <ChartColumn className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-help">
              {showInternalStatus
                ? t("accountPortal.metrics.titleInternal")
                : t("accountPortal.metrics.title")}
            </p>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs max-w-[200px]">
              {showInternalStatus
                ? t("accountPortal.metrics.tooltipInternal")
                : t("accountPortal.metrics.tooltip")}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative overflow-hidden rounded-lg border border-emerald-200/60 dark:border-emerald-800/50 bg-emerald-50/80 dark:bg-emerald-950/65 p-2 cursor-help">
              <div className="flex items-center gap-1 mb-1">
                <Activity className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  Active
                </p>
              </div>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                {metrics.activeCount}
              </p>
              <Activity className="absolute -bottom-1 -right-1 h-8 w-8 text-emerald-500 dark:text-emerald-400 opacity-10 pointer-events-none" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold mb-1">Active Projects</p>
            <p className="text-xs">
              Projects with status NOT in: Completed, Closed Won, Closed Lost, Cancelled, or Archived.
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative overflow-hidden rounded-lg border border-rose-200/60 dark:border-rose-800/50 bg-rose-50/80 dark:bg-rose-950/65 p-2 cursor-help">
              <div className="flex items-center gap-1 mb-1 flex">
                <AlertTriangle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                <p className="text-[10px] font-medium text-rose-700 dark:text-rose-300">
                  Overdue
                </p>
              </div>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                {metrics.overdueCount}
              </p>
              <AlertTriangle className="absolute -bottom-1 -right-1 h-8 w-8 text-rose-500 dark:text-rose-400 opacity-10 pointer-events-none" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold mb-1">Overdue Projects</p>
            <p className="text-xs">
              Active projects where the end date has passed.
            </p>
            <p className="text-xs mt-1 text-muted-foreground">
              Calculation: Active projects with End Date &lt; Today
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative overflow-hidden rounded-lg border border-amber-200/60 dark:border-amber-800/50 bg-amber-50/80 dark:bg-amber-950/65 p-2 cursor-help">
              <div className="flex items-center gap-1 mb-1">
                <CalendarClock className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                  This Week
                </p>
              </div>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                {metrics.dueThisWeekCount}
              </p>
              <CalendarClock className="absolute -bottom-1 -right-1 h-8 w-8 text-amber-500 dark:text-amber-400 opacity-10 pointer-events-none" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold mb-1">Projects Due This Week</p>
            <p className="text-xs">
              Active projects with end date falling within the current week (Sunday to Saturday).
            </p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative overflow-hidden rounded-lg border border-blue-200/60 dark:border-blue-800/50 bg-blue-50/80 dark:bg-blue-950/65 p-2 cursor-help">
              <div className="flex items-center gap-1 mb-1">
                <CalendarCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                  Next Week
                </p>
              </div>
              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                {metrics.dueNextWeekCount}
              </p>
              <CalendarCheck className="absolute -bottom-1 -right-1 h-8 w-8 text-blue-500 dark:text-blue-400 opacity-10 pointer-events-none" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="font-semibold mb-1">Projects Due Next Week</p>
            <p className="text-xs">
              Active projects with end date falling within the upcoming week.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className={`grid gap-4 ${showInternalStatus ? "grid-cols-2" : "grid-cols-1"}`}>
        <div className="flex flex-col items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                <ChartColumn className="w-3 h-3"/>
                Active Success Criteria
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs max-w-[200px]">
                Success criteria that are actively being worked on. Excludes Complete, Cancelled, and Not Started statuses.
              </p>
            </TooltipContent>
          </Tooltip>
          {activeCriteriaData.length > 0 ? (
            <ChartContainer config={criteriaChartConfig} className="w-full h-[205px]">
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel nameKey="name" />}
                />
                <Pie
                  data={activeCriteriaData} 
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={75}
                  strokeWidth={4}
                  paddingAngle={1}
                >
                  <ChartLabel
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-4xl font-bold"
                            >
                              {activeCriteriaTotal}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 16}
                              className="fill-muted-foreground text-[10px]"
                            >
                              Active
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                  {activeCriteriaData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.fill}
                      className={onCriteriaStatusClick ? "cursor-pointer" : ""}
                      onClick={() => onCriteriaStatusClick?.(entry.statusKey)}
                    />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="name" />}
                  className="flex-wrap gap-1 text-[9px] mt-1"
                />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="h-[205px] flex items-center justify-center text-slate-400 dark:text-slate-500">
              <div className="text-center">
                <p className="text-xs">No active criteria</p>
              </div>
            </div>
          )}
        </div>

        {showInternalStatus && (
        <div className="flex flex-col items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="text-xs font-semibold mb-1 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                <ChartColumn className="w-3 h-3"/>
                Internal Project Status
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs max-w-[200px]">
                Distribution of all projects by their Internal Status (internal project status).
              </p>
            </TooltipContent>
          </Tooltip>
          {internalStatusData.length > 0 ? (
            <ChartContainer config={internalChartConfig} className="w-full h-[205px]">
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel nameKey="name" />}
                />
                <Pie
                  data={internalStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={40}
                  outerRadius={75}
                  strokeWidth={4}
                  paddingAngle={1}
                >
                  <ChartLabel
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text
                            x={viewBox.cx}
                            y={viewBox.cy}
                            textAnchor="middle"
                            dominantBaseline="middle"
                          >
                            <tspan
                              x={viewBox.cx}
                              y={viewBox.cy}
                              className="fill-foreground text-4xl font-bold"
                            >
                              {internalStatusTotal}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 16}
                              className="fill-muted-foreground text-[10px]"
                            >
                              Total
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }}
                  />
                  {internalStatusData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.fill}
                      className={onInternalStatusClick ? "cursor-pointer" : ""}
                      onClick={() => onInternalStatusClick?.(entry.statusKey)}
                    />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="name" />}
                  className="flex-wrap gap-1 text-[9px] mt-1"
                />
              </PieChart>
            </ChartContainer>
          ) : (
            <div className="h-[205px] flex items-center justify-center text-slate-400 dark:text-slate-500">
              <div className="text-center">
                <p className="text-xs">No projects</p>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
