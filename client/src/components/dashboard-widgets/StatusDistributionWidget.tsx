"use client";
import * as React from "react";
import { ChartPie, CalendarCheck, Calendar1, CalendarClock, CalendarRange } from "lucide-react";
import { Label as ChartLabel, Pie, PieChart, Cell } from "recharts";
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
import { useChartTheme } from "@/hooks/useChartTheme";

interface StatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
}

interface ProjectData {
  id: number;
  customerStatus?: string;
  startDate: string;
  endDate?: string;
}

interface StatusDistributionWidgetProps {
  projects: ProjectData[];
  customerStatusConfigs: StatusConfig[];
  neutralFallbackColor?: string;
  className?: string;
  onStatusClick?: (status: string) => void;
}

const getCustomerStatusConfig = (
  status: string,
  configs: StatusConfig[]
): StatusConfig | undefined => {
  return configs.find(
    (c) => c.name.toLowerCase() === status.toLowerCase()
  );
};

export function StatusDistributionWidget({
  projects,
  customerStatusConfigs,
  neutralFallbackColor = "#6b7280",
  className = "",
  onStatusClick,
}: StatusDistributionWidgetProps) {
  const { isDark, tooltipStyles, legendStyles } = useChartTheme();
  
  const statusCounts = projects.reduce(
    (acc, project) => {
      const status = project.customerStatus || "Not Set";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const total = projects.length;

  const completeCount = projects.filter(
    (p) => p.customerStatus?.toLowerCase() === "complete"
  ).length;

  const completedProjects = projects.filter(
    (p) => p.customerStatus?.toLowerCase() === "complete" && p.startDate
  );
  let avgDaysToComplete = 0;
  if (completedProjects.length > 0) {
    const totalDays = completedProjects.reduce((sum, p) => {
      const start = new Date(p.startDate).getTime();
      const end = p.endDate ? new Date(p.endDate).getTime() : Date.now();
      return sum + Math.max(0, Math.round((end - start) / 86400000));
    }, 0);
    avgDaysToComplete = Math.round(totalDays / completedProjects.length);
  }

  const atRiskStatuses = ["on-hold", "on hold", "delayed", "needs assistance"];
  const atRiskCount = projects.filter((p) =>
    atRiskStatuses.includes(p.customerStatus?.toLowerCase() || "")
  ).length;

  const awaitingStatuses = ["in cab", "pending feedback", "evaluating competitors"];
  const awaitingDecisionsCount = projects.filter((p) =>
    awaitingStatuses.includes(p.customerStatus?.toLowerCase() || "")
  ).length;

  const chartData = Object.entries(statusCounts).map(([status, count]) => {
    const config = getCustomerStatusConfig(status, customerStatusConfigs);
    const color = config?.color || neutralFallbackColor;
    return {
      name: status,
      value: count,
      fill: color,
    };
  });

  const chartConfig: ChartConfig = {};
  chartData.forEach((item) => {
    chartConfig[item.name] = { label: item.name, color: item.fill };
  });

  return (
    <div
      className={`rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-3 ${className}`}
    >
      <div className="flex items-center gap-2 mb-3">
        <ChartPie className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
          Account Status Metrics
        </p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative overflow-hidden rounded-lg border border-green-200/60 dark:border-green-800/50 bg-green-50/80 dark:bg-green-950/65 p-2 cursor-help">
                <div className="flex items-center gap-1 mb-1">
                  <CalendarCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <p className="text-[10px] font-medium text-green-700 dark:text-green-300">
                    Complete
                  </p>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                  {completeCount}
                </p>
                <CalendarCheck className="absolute -bottom-1 -right-1 h-8 w-8 text-green-500 dark:text-green-400 opacity-10 pointer-events-none" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold mb-1">Complete Projects</p>
              <p className="text-xs">
                Count of projects with Account Status of "Complete"
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative overflow-hidden rounded-lg border border-blue-200/60 dark:border-blue-800/50 bg-blue-50/80 dark:bg-blue-950/65 p-2 cursor-help">
                <div className="flex items-center gap-1 mb-1">
                  <Calendar1 className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  <p className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                    AVG Days
                  </p>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                  {avgDaysToComplete}d
                </p>
                <Calendar1 className="absolute -bottom-1 -right-1 h-8 w-8 text-blue-500 dark:text-blue-400 opacity-10 pointer-events-none" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold mb-1">AVG Days to Complete</p>
              <p className="text-xs">
                Average project duration (Start Date to End Date) for projects
                with Account Status "Complete"
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                Calculation: (End Date - Start Date) / Complete projects
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative overflow-hidden rounded-lg border border-red-200/60 dark:border-red-800/50 bg-red-50/80 dark:bg-red-950/65 p-2 cursor-help">
                <div className="flex items-center gap-1 mb-1">
                  <CalendarClock className="h-3 w-3 text-red-600 dark:text-red-400" />
                  <p className="text-[10px] font-medium text-red-700 dark:text-red-300">
                    At-Risk
                  </p>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                  {atRiskCount}
                </p>
                <CalendarClock className="absolute -bottom-1 -right-1 h-8 w-8 text-red-500 dark:text-red-400 opacity-10 pointer-events-none" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold mb-1">Projects At-Risk</p>
              <p className="text-xs">
                Count of projects with Account Status: On-Hold, Delayed, or
                Needs Assistance
              </p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="relative overflow-hidden rounded-lg border border-purple-200/60 dark:border-purple-800/50 bg-purple-50/80 dark:bg-purple-950/65 p-2 cursor-help">
                <div className="flex items-center gap-1 mb-1">
                  <CalendarRange className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  <p className="text-[10px] font-medium text-purple-700 dark:text-purple-300">
                    In Review
                  </p>
                </div>
                <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums text-center">
                  {awaitingDecisionsCount}
                </p>
                <CalendarRange className="absolute -bottom-1 -right-1 h-8 w-8 text-purple-500 dark:text-purple-400 opacity-10 pointer-events-none" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="font-semibold mb-1">Projects Awaiting Decisions</p>
              <p className="text-xs">
                Count of projects with Account Status: In CAB, Pending Feedback,
                or Evaluating Competitors
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {chartData.length > 0 ? (
          <div className="flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                  <ChartPie className="w-3 h-3"/> Account Status
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs max-w-[200px]">
                  Click on any slice to filter projects by that status. Shows the distribution of projects across different account statuses.
                </p>
              </TooltipContent>
            </Tooltip>
            <ChartContainer config={chartConfig} className="w-full h-[205px]">
              <PieChart>
                <ChartTooltip
                  content={<ChartTooltipContent hideLabel nameKey="name" />}
                />
                <Pie
                  data={chartData}
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
                              {total}
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
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.fill} 
                      className={onStatusClick ? "cursor-pointer" : ""}
                      onClick={() => onStatusClick?.(entry.name)}
                    />
                  ))}
                </Pie>
                <ChartLegend
                  content={<ChartLegendContent nameKey="name" />}
                  className="flex-wrap gap-1 text-[9px] mt-1"
                />
              </PieChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center h-[205px] text-muted-foreground text-sm">
            No status data available
          </div>
        )}
      </div>
    </div>
  );
}
