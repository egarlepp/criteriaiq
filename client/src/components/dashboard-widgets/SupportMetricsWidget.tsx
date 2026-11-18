"use client";

import * as React from "react";
import { Bolt } from "lucide-react";
import { Pie, PieChart, Cell, Label } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from "@/components/ui/chart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { WidgetConfig } from "@/types/dashboard-config";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useQuery } from "@tanstack/react-query";
import { useChartTheme } from "@/hooks/useChartTheme";

// Helper to get title font size class
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

// Helper to get title font weight class
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

export function SupportMetricsWidget({
  projects = [],
  config,
  onChartClick
}: {
  projects?: any[];
  config?: WidgetConfig;
  onChartClick?: (type: string, value: any) => void;
}) {
  const { isDark } = useChartTheme();
  const title = config?.title || "Support Metrics";
  const iconName = config?.iconName;
  const activeColor = config?.settings?.colorScheme?.[0] || "text-blue-600";
  const isHex = activeColor.startsWith("#");
  
  // Title customization
  const titleFontSize = getTitleFontSizeClass(config?.settings?.titleFontSize);
  const titleFontWeight = getTitleFontWeightClass(config?.settings?.titleFontWeight);
  const titleColor = config?.settings?.titleColor;
  const isTitleHex = titleColor?.startsWith("#");

  // Fetch real support request analytics data
  const { data: analytics } = useQuery({
    queryKey: ["/api/support-requests/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/support-requests/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    staleTime: 30000,
  });

  // Theme-aware status color mapping (lowercase keys for case-insensitive lookup)
  const statusColors: Record<string, string> = isDark ? {
    "open": "#60a5fa",           // blue (brighter for dark mode)
    "in progress": "#fbbf24",   // amber (brighter for dark mode)
    "under review": "#a78bfa",  // purple (brighter for dark mode)
    "resolved": "#4ade80",      // green (brighter for dark mode)
    "escalated": "#f87171",     // red (brighter for dark mode)
    "closed": "#9ca3af",        // gray (brighter for dark mode)
  } : {
    "open": "#3b82f6",           // blue
    "in progress": "#f59e0b",   // amber
    "under review": "#8b5cf6",  // purple
    "resolved": "#10b981",      // green
    "escalated": "#ef4444",     // red
    "closed": "#6b7280",        // gray
  };

  // Theme-aware type color mapping (lowercase keys for case-insensitive lookup)
  const typeColors: Record<string, string> = isDark ? {
    "issue": "#f87171",          // red (brighter for dark mode)
    "review": "#fb923c",         // orange (brighter for dark mode)
    "question": "#60a5fa",       // blue (brighter for dark mode)
    "feature request": "#4ade80", // green (brighter for dark mode)
  } : {
    "issue": "#ef4444",          // red
    "review": "#f97316",         // orange
    "question": "#3b82f6",       // blue
    "feature request": "#10b981", // green
    "bug": "#dc2626",            // dark red
    "enhancement": "#8b5cf6",    // purple
    "documentation": "#06b6d4",  // cyan
  };

  // Case-insensitive color lookup helper
  const getStatusColor = (status: string) => statusColors[status.toLowerCase()] || "#6b7280";
  const getTypeColor = (type: string) => typeColors[type.toLowerCase()] || "#6b7280";

  // Build status data from analytics (API returns statusDistribution array)
  const statusData = React.useMemo(() => {
    if (!analytics?.statusDistribution) return [];
    return (analytics.statusDistribution as Array<{ status: string; count: number }>)
      .filter(item => item.count > 0)
      .map(item => ({
        name: item.status,
        value: item.count,
        fill: getStatusColor(item.status),
      }));
  }, [analytics?.statusDistribution]);

  // Build type data from analytics (API returns typeDistribution array)
  const typeData = React.useMemo(() => {
    if (!analytics?.typeDistribution) return [];
    return (analytics.typeDistribution as Array<{ type: string; count: number }>)
      .filter(item => item.count > 0)
      .map(item => ({
        name: item.type,
        value: item.count,
        fill: getTypeColor(item.type),
      }));
  }, [analytics?.typeDistribution]);

  const totalStatus = statusData.reduce((a, b) => a + b.value, 0);
  const totalType = typeData.reduce((a, b) => a + b.value, 0);

  // Summary metrics from analytics (using correct API field names)
  const avgResolutionHours = analytics?.avgResolutionTime || 0;
  const recentCount = analytics?.recentRequests || 0;
  const staleCount = analytics?.staleRequests || 0;
  const resolvedCount = analytics?.resolvedRequests || 0;

  // Helper to capitalize each word
  const toTitleCase = (str: string) => 
    str.replace(/\b\w/g, char => char.toUpperCase());

  // Build dynamic chart configs for proper legend labels (with title case)
  const statusChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    statusData.forEach(item => {
      cfg[item.name] = { label: toTitleCase(item.name), color: item.fill };
    });
    return cfg;
  }, [statusData]);

  const typeChartConfig = React.useMemo(() => {
    const cfg: ChartConfig = {};
    typeData.forEach(item => {
      cfg[item.name] = { label: toTitleCase(item.name), color: item.fill };
    });
    return cfg;
  }, [typeData]);

  return (
    <Card className="h-full flex flex-col shadow-sm border-slate-200 dark:border-gray-700 dark:bg-gray-900">
      <CardHeader className="pb-1">
        <CardTitle 
          className={`${titleFontSize} ${titleFontWeight} flex items-center gap-2 ${!isTitleHex ? (titleColor || 'text-slate-800 dark:text-slate-100') : ''}`}
          style={isTitleHex ? { color: titleColor } : undefined}
        >
          {iconName ? (
            <DynamicIcon name={iconName} className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
          ) : (
            <Bolt className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        {/* SUMMARY METRICS ROW */}
        <div className="grid grid-cols-4 gap-2 mb-3 text-center">
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold dark:text-slate-100">{avgResolutionHours.toFixed(2)}h</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">AVG Resolution</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Average Resolution Time</p>
               <p className="text-xs">The average time in hours it takes to resolve a support request from creation to resolution.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: (Resolution Date - Created Date) averaged across all resolved requests</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold dark:text-slate-100">{recentCount}</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">Recent (7 days)</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Recent Requests</p>
               <p className="text-xs">The number of support requests created within the last 7 days.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: Count of requests where Created Date &gt; (Today - 7 days)</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold text-red-500">{staleCount}</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">Stale {'>'}5 days</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Stale Requests</p>
               <p className="text-xs">Open support requests that have not been updated in more than 5 days and require attention.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: Count of open requests where Last Updated &gt; 5 days ago</p>
             </TooltipContent>
           </Tooltip>
           <Tooltip>
             <TooltipTrigger asChild>
               <div className="p-2 bg-slate-50 dark:bg-gray-800 rounded cursor-help">
                 <div className="text-xl font-bold text-green-500">{resolvedCount}</div>
                 <div className="text-[9px] uppercase text-muted-foreground font-bold">Resolved</div>
               </div>
             </TooltipTrigger>
             <TooltipContent side="bottom" className="max-w-xs">
               <p className="font-semibold mb-1">Resolved Requests</p>
               <p className="text-xs">The total number of support requests that have been successfully resolved.</p>
               <p className="text-xs mt-1 text-muted-foreground">Calculation: Count of requests with status = "Resolved"</p>
             </TooltipContent>
           </Tooltip>
        </div>

        {/* DUAL DONUT CHARTS */}
        <div className="grid grid-cols-2 gap-4">
          {/* Chart 1: Status */}
          <div className="flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                  <Bolt className="w-3 h-3"/>All Support Requests
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-semibold mb-1">Status of Support Requests</p>
                <p className="text-xs">Distribution of all support requests by their current status: Open, In Progress, Resolved, Escalated, or Closed.</p>
                <p className="text-xs mt-1 text-muted-foreground">Center number: Total count of all support requests</p>
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
                  onClick={(d) => onChartClick && onChartClick("support_status", d.name)}
                >
                  <Label content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">{totalStatus}</tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 16}
                            className="fill-muted-foreground text-[10px]"
                          >
                            Requests
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }} />
                  {statusData.map((e, i) => <Cell key={i} fill={e.fill} cursor="pointer"/>)}
                </Pie>
                <ChartLegend content={<ChartLegendContent nameKey="name" />} className="-translate-y-2 flex-wrap gap-2 text-[9px]" />
              </PieChart>
            </ChartContainer>
          </div>

          {/* Chart 2: Types */}
          <div className="flex flex-col items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-semibold mb-2 flex items-center gap-1 text-blue-600 dark:text-blue-400 cursor-help">
                  <Bolt className="w-3 h-3"/>All Request Types
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="font-semibold mb-1">Request Types</p>
                <p className="text-xs">Distribution of support requests by type: Issue (problems), Review (code/document review), Question (inquiries), or Feature Request (enhancements).</p>
                <p className="text-xs mt-1 text-muted-foreground">Center number: Total count of all typed requests</p>
              </TooltipContent>
            </Tooltip>
            <ChartContainer config={typeChartConfig} className="w-full h-[210px]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="name" />} />
                <Pie 
                  data={typeData} 
                  dataKey="value" 
                  nameKey="name" 
                  innerRadius={40} 
                  outerRadius={75} 
                  strokeWidth={4}
                  paddingAngle={1}
                  onClick={(d) => onChartClick && onChartClick("support_type", d.name)}
                >
                  <Label content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-4xl font-bold">{totalType}</tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 16}
                            className="fill-muted-foreground text-[10px]"
                          >
                            Requests
                          </tspan>
                        </text>
                      );
                    }
                    return null;
                  }} />
                  {typeData.map((e, i) => <Cell key={i} fill={e.fill} cursor="pointer"/>)}
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
