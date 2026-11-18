"use client";
import * as React from "react";
import { Activity, CheckCircle } from "lucide-react";
import { Label, Pie, PieChart, Cell } from "recharts"; 
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart"; 
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WidgetConfig } from "@/types/dashboard-config";
import { isActiveProject, isClosedStatus, isWonStatus, isLostStatus } from "@/lib/project-status";
import { useChartTheme } from "@/hooks/useChartTheme";

// Light mode status colors
const STATUS_COLORS_LIGHT = [
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f97316', // orange
  '#10b981', // green
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#6366f1', // indigo
  '#84cc16', // lime
  '#14b8a6', // teal
];

// Dark mode status colors (brighter for visibility)
const STATUS_COLORS_DARK = [
  '#60a5fa', // blue
  '#a78bfa', // purple
  '#fb923c', // orange
  '#4ade80', // green
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#fbbf24', // amber
  '#818cf8', // indigo
  '#a3e635', // lime
  '#2dd4bf', // teal
];

const getStatusColors = (isDark: boolean) => isDark ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT;

const processProjectMetrics = (projects: any[], isDark: boolean = false) => {
  if (!projects || projects.length === 0) {
    return { 
      statusData: [], 
      closedData: [], 
      metrics: { totalActive: 0, avgDaysActive: 0, avgDaysOverdue: 0, avgDaysToClose: 0, completedCount: 0, tccCount: 0 } 
    };
  }

  const STATUS_COLORS = getStatusColors(isDark);
  const activeProjects = projects.filter(p => isActiveProject(p));
  const closedProjects = projects.filter(p => isClosedStatus(p.status));
  
  // Count Completed and TCC status projects
  const completedCount = projects.filter(p => 
    p.status?.toLowerCase() === 'completed'
  ).length;
  const tccCount = projects.filter(p => 
    p.status?.toLowerCase() === 'tcc' || p.status?.toLowerCase() === 'technical close confirmed'
  ).length;

  const capitalizeWords = (str: string) => 
    str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

  const statusCounts: Record<string, { count: number; originalValue: string }> = {};
  activeProjects.forEach(p => {
    const originalStatus = p.status || 'Unknown';
    const displayName = capitalizeWords(originalStatus);
    if (!statusCounts[displayName]) {
      statusCounts[displayName] = { count: 0, originalValue: originalStatus };
    }
    statusCounts[displayName].count++;
  });

  const statusData = Object.entries(statusCounts).map(([name, data], index) => ({
    name,
    value: data.count,
    originalValue: data.originalValue,
    fill: STATUS_COLORS[index % STATUS_COLORS.length]
  }));

  const wonCount = projects.filter(p => isWonStatus(p.status)).length;
  const lostCount = projects.filter(p => isLostStatus(p.status)).length;
  
  // Theme-aware colors for closed data
  const wonColor = isDark ? '#4ade80' : '#10b981';
  const lostColor = isDark ? '#f87171' : '#ef4444';
  
  const closedData = [
    { name: 'Closed Won', value: wonCount, originalValue: 'closed won', fill: wonColor },
    { name: 'Closed Lost', value: lostCount, originalValue: 'closed lost', fill: lostColor }
  ].filter(d => d.value > 0);

  const now = new Date().getTime();
  
  let totalAge = 0;
  activeProjects.forEach(p => { 
    if (p.startDate) totalAge += (now - new Date(p.startDate).getTime());
  });

  let totalCycle = 0;
  closedProjects.forEach(p => { 
    if (p.startDate && p.endDate) {
      totalCycle += (new Date(p.endDate).getTime() - new Date(p.startDate).getTime());
    }
  });

  const overdueProjects = activeProjects.filter(p => p.endDate && new Date(p.endDate).getTime() < now);
  let totalOverdueDays = 0;
  overdueProjects.forEach(p => {
    totalOverdueDays += (now - new Date(p.endDate).getTime());
  });

  return {
    statusData,
    closedData,
    metrics: {
      totalActive: activeProjects.length,
      avgDaysActive: activeProjects.length > 0 ? Math.round(totalAge / activeProjects.length / 86400000) : 0,
      avgDaysOverdue: overdueProjects.length > 0 ? Math.round(totalOverdueDays / overdueProjects.length / 86400000) : 0,
      avgDaysToClose: closedProjects.length > 0 ? Math.round(totalCycle / closedProjects.length / 86400000) : 0,
      completedCount,
      tccCount
    }
  };
};

const getTitleFontSizeClass = (size?: string) => {
  switch (size) {
    case 'xs': return 'text-xs';
    case 'sm': return 'text-sm';
    case 'base': return 'text-base';
    case 'lg': return 'text-lg';
    case '2xl': return 'text-2xl';
    case 'xl':
    default: return 'text-xl';
  }
};

const getTitleFontWeightClass = (weight?: string) => {
  switch (weight) {
    case 'thin': return 'font-thin';
    case 'extralight': return 'font-extralight';
    case 'light': return 'font-light';
    case 'normal': return 'font-normal';
    case 'medium': return 'font-medium';
    case 'semibold': return 'font-semibold';
    case 'extrabold': return 'font-extrabold';
    case 'black': return 'font-black';
    case 'bold':
    default: return 'font-bold';
  }
};

export function ProjectMetricsWidget({ projects = [], onChartClick, config }: { projects?: any[]; onChartClick?: (type: string, value: string) => void; config?: WidgetConfig }) {
  const { isDark } = useChartTheme();
  const { statusData, closedData, metrics } = React.useMemo(() => processProjectMetrics(projects, isDark), [projects, isDark]);
  const activeColor = config?.settings?.colorScheme?.[0] || "text-blue-600";
  const isHex = activeColor.startsWith("#");
  
  const statusChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    statusData.forEach(item => {
      cfg[item.name] = { label: item.name, color: item.fill };
    });
    return cfg;
  }, [statusData]);

  const closedChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    closedData.forEach(item => {
      cfg[item.name] = { label: item.name, color: item.fill };
    });
    return cfg;
  }, [closedData]);
  
  const titleFontSize = getTitleFontSizeClass(config?.settings?.titleFontSize);
  const titleFontWeight = getTitleFontWeightClass(config?.settings?.titleFontWeight);
  const titleColor = config?.settings?.titleColor;
  const isTitleHex = titleColor?.startsWith("#");

  return (
    <Card className="h-full flex flex-col shadow-sm border-slate-200 dark:border-gray-700 dark:bg-gray-900">
      <CardHeader className="pb-1">
        <CardTitle 
          className={`${titleFontSize} ${titleFontWeight} flex items-center gap-2 ${!isTitleHex ? (titleColor || 'text-slate-800 dark:text-slate-100') : ''}`}
          style={isTitleHex ? { color: titleColor } : undefined}
        >
          <Activity className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
          {config?.title || "Project Metrics"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        {/* SUMMARY ROW */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold dark:text-slate-100">
                   <span className="text-green-600">{metrics.completedCount}</span>
                   <span className="text-muted-foreground mx-1">|</span>
                   <span className="text-emerald-400">{metrics.tccCount}</span>
                 </div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">Completed | TCC</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Completed & TCC Projects</p>
               <p className="text-xs"><span className="text-green-600 font-medium">Completed:</span> Projects with "Completed" Internal Status</p>
               <p className="text-xs"><span className="text-emerald-400 font-medium">TCC:</span> Projects with "Technical Close Confirmed" Internal Status</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold dark:text-slate-100">{metrics.avgDaysActive}d</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">AVG Active</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Average Days Active</p>
               <p className="text-xs">The average number of days that active projects have been running since their start date.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: (Today - Start Date) averaged across all active projects</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl text-red-600 font-bold dark:text-red-100">{metrics.avgDaysOverdue}d</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">AVG Overdue</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Average Days Overdue</p>
               <p className="text-xs">The average number of days that overdue projects have exceeded their end date.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: (Today - End Date) averaged across active projects past their end date</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold dark:text-slate-100">{metrics.avgDaysToClose}d</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">AVG To Close</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Average Days To Close</p>
               <p className="text-xs">The average project duration from start to close for completed projects.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: (End Date - Start Date) averaged across all closed projects</p>
             </TooltipContent>
           </Tooltip>
        </div>

        {/* DUAL CHARTS */}
        <div className="grid grid-cols-2 gap-4">
          {/* LEFT: Active */}
          <div className="flex flex-col items-center">
             <Tooltip>
               <TooltipTrigger asChild>
                 <div className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                   <Activity className="w-3 h-3"/>All Active Projects
                 </div>
               </TooltipTrigger>
               <TooltipContent side="top" className="max-w-xs">
                 <p className="font-semibold mb-1">Statuses of Active Projects</p>
                 <p className="text-xs">Projects that are currently in progress and not yet closed. Active statuses include: Planning, In Progress, On Hold, and similar non-closed states.</p>
                 <p className="text-xs mt-1 text-muted-foreground">Center number: Total count of all active projects</p>
               </TooltipContent>
             </Tooltip>
             <ChartContainer config={statusChartConfig} className="w-full h-[210px]">
               <PieChart>
                 <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                 <Pie 
                   data={statusData} 
                   dataKey="value" 
                   nameKey="name" 
                   innerRadius={40} 
                   outerRadius={75} 
                   strokeWidth={4}
                   paddingAngle={1}
                   onClick={(d) => onChartClick && onChartClick("status", d.originalValue || d.name)}
                 >
                    <Label content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">{metrics.totalActive}</tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 16}
                              className="fill-muted-foreground text-[9px]"
                            >
                              Active
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }} />
                    {statusData.map((e, i) => <Cell key={i} fill={e.fill} cursor="pointer"/>)}
                 </Pie>
                 <ChartLegend content={<ChartLegendContent nameKey="name" />} className="-translate-y-2 flex-wrap gap-2 text-[10px]" />
               </PieChart>
             </ChartContainer>
          </div>

          {/* RIGHT: Closed */}
          <div className="flex flex-col items-center">
             <Tooltip>
               <TooltipTrigger asChild>
                 <div className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                   <CheckCircle className="w-3 h-3"/>All Closed Projects
                 </div>
               </TooltipTrigger>
               <TooltipContent side="top" className="max-w-xs">
                 <p className="font-semibold mb-1">Results of Closed Projects</p>
                 <p className="text-xs">Distribution of closed projects by outcome: Won (successful validations) vs Lost (unsuccessful validations).</p>
                 <p className="text-xs mt-1 text-muted-foreground">Center number: Total count of all closed projects</p>
               </TooltipContent>
             </Tooltip>
             <ChartContainer config={closedChartConfig} className="w-full h-[210px]">
               <PieChart>
                 <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                 <Pie 
                   data={closedData} 
                   dataKey="value" 
                   nameKey="name" 
                    innerRadius={40} 
                    outerRadius={75} 
                   strokeWidth={4}
                   paddingAngle={1}
                   onClick={(d) => onChartClick && onChartClick("status", d.originalValue || d.name)}
                 >
                    <Label content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">{closedData.reduce((a, b) => a + b.value, 0)}</tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 16}
                              className="fill-muted-foreground text-[10px]"
                            >
                              Closed
                            </tspan>
                          </text>
                        );
                      }
                      return null;
                    }} />
                    {closedData.map((e, i) => <Cell key={i} fill={e.fill} cursor="pointer"/>)}
                 </Pie>
                 <ChartLegend content={<ChartLegendContent nameKey="name" />} className="-translate-y-2 flex-wrap gap-2 text-[9px]" />
               </PieChart>
             </ChartContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
