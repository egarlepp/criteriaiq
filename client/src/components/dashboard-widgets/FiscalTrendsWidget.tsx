"use client";

import { useState, useMemo } from "react";
import { TrendingUp, ChevronLeft, ChevronRight, Info } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { WidgetConfig } from "@/types/dashboard-config";
import { addMonths, startOfMonth } from "date-fns";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useFiscalConfig } from "@/hooks/use-fiscal-config";
import { useChartTheme } from "@/hooks/useChartTheme";

const parseACV = (val: any) => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseFloat(val.toString().replace(/[$,]/g, '')) || 0;
};

// Chart color config with light/dark mode support
const getChartConfig = (isDark: boolean): ChartConfig => ({
  created: { 
    label: "Projects Created", 
    color: isDark ? "#60a5fa" : "#1e40af" 
  },
  completed: { 
    label: "Projects Completed", 
    color: isDark ? "#fbbf24" : "#eab308" 
  },
  closedWonACV: { 
    label: "Closed Won ($)", 
    color: isDark ? "#4ade80" : "#10b981" 
  },
  closedLostACV: { 
    label: "Closed Lost ($)", 
    color: isDark ? "#f87171" : "#ef4444" 
  },
  createdACV: {
    label: "Created ACV ($)",
    color: isDark ? "#60a5fa" : "#1e40af"
  },
});

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

export function FiscalTrendsWidget({
  projects = [],
  config,
  onChartClick
}: {
  projects?: any[];
  config?: WidgetConfig;
  onChartClick?: (type: string, value: any) => void;
}) {
  // INTERNAL STATE for Navigation
  const [offset, setOffset] = useState(0);
  
  // Use chart theme for dark mode support
  const { isDark, getColor } = useChartTheme();
  const chartConfig = getChartConfig(isDark);
  
  // Use fiscal configuration from system settings
  const { config: fiscalConfig, formatPeriod, getQuarterRange, getYearForDate, getQuarterForDate } = useFiscalConfig();

  const activeColor = config?.settings?.colorScheme?.[0] || "text-blue-600";
  const isHex = activeColor.startsWith("#");
  const title = config?.title || "Fiscal Quarter Trends"; // Updated Title
  const iconName = config?.iconName;
  
  // Title customization
  const titleFontSize = getTitleFontSizeClass(config?.settings?.titleFontSize);
  const titleFontWeight = getTitleFontWeightClass(config?.settings?.titleFontWeight);
  const titleColor = config?.settings?.titleColor;
  const isTitleHex = titleColor?.startsWith("#");

  // --- DATA PROCESSING ---
  const { chartData, navInfo } = useMemo(() => {
    const safeProjects = projects || [];
    const now = new Date();

    // Window: Show 6 Quarters centered on "Current + Offset"
    // We want 3 Prev, Current, 2 Future.
    // So range is from index -3 to +2 relative to 'viewDate'
    const viewDate = addMonths(now, offset * 3);
    
    // Get current fiscal year and quarter based on config
    const currentFY = getYearForDate(viewDate);
    const currentQ = getQuarterForDate(viewDate);

    const quarters = [];

    // Generate 6 quarters around the current view
    for (let i = -3; i <= 2; i++) {
        // Calculate which quarter we're looking at
        let targetQ = currentQ + i;
        let targetFY = currentFY;
        
        // Handle quarter rollover
        while (targetQ > 4) {
            targetQ -= 4;
            targetFY += 1;
        }
        while (targetQ < 1) {
            targetQ += 4;
            targetFY -= 1;
        }

        // Get date range for this quarter using fiscal config
        const { start: qStartDate, end: qEndDate } = getQuarterRange(targetFY, targetQ);
        
        // Create an end date that's the start of the next day after qEndDate for < comparison
        const qEndDateExclusive = new Date(qEndDate);
        qEndDateExclusive.setDate(qEndDateExclusive.getDate() + 1);

        // Format label based on fiscal config
        const label = fiscalConfig.displayMode === "fiscal" 
            ? `FY${targetFY} Q${targetQ}` 
            : `${targetFY} Q${targetQ}`;

        let created = 0, completed = 0, wonACV = 0, lostACV = 0, createdACV = 0;

        safeProjects.forEach(p => {
            const pDate = p.createdAt ? new Date(p.createdAt) : null;
            const pEnd = p.endDate ? new Date(p.endDate) : (p.updatedAt ? new Date(p.updatedAt) : null);
            const status = p.status?.toLowerCase() || '';

            // Created Line + Created ACV Bar
            if (pDate && pDate >= qStartDate && pDate < qEndDateExclusive) {
                created++;
                createdACV += parseACV(p.opportunityAcvValue);
            }

            // Completed Line (Closed/Won/Lost)
            if (pEnd && ['closed', 'completed', 'won', 'lost'].some(s => status.includes(s))) {
                 if (pEnd >= qStartDate && pEnd < qEndDateExclusive) completed++;
            }

            // ACV Bars
            if (pEnd && pEnd >= qStartDate && pEnd < qEndDateExclusive) {
                const acv = parseACV(p.opportunityAcvValue);
                if (status.includes('won')) wonACV += acv;
                if (status.includes('lost')) lostACV += acv;
            }
        });

        quarters.push({
            name: label,
            created,
            completed,
            wonACV,
            lostACV,
            createdACV,
        });
    }

    // Calculate Tooltip Labels for Buttons
    // Chart shows quarters at indices -3 to +2 (6 quarters from viewDate-9mo to viewDate+6mo)
    // When navigating back (offset-1): new leftmost = new viewDate - 9mo = old viewDate - 12mo
    // When navigating forward (offset+1): new rightmost = new viewDate + 6mo = old viewDate + 9mo
    const prevEdgeDate = addMonths(viewDate, -12); // New leftmost quarter after clicking back
    const nextEdgeDate = addMonths(viewDate, 9);   // New rightmost quarter after clicking forward
    const prevLabel = formatPeriod(prevEdgeDate);
    const nextLabel = formatPeriod(nextEdgeDate);

    return { chartData: quarters, navInfo: { prev: `Go to ${prevLabel}`, next: `Go to ${nextLabel}` } };
  }, [projects, offset, fiscalConfig, formatPeriod, getQuarterRange, getYearForDate, getQuarterForDate]);

  return (
    <Card className="h-full shadow-sm border-slate-200 dark:border-gray-700 flex flex-col dark:bg-gray-900">
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <div>
            {/* Header with Info Icon */}
            <div className="flex items-center gap-2">
                <CardTitle 
                  className={`${titleFontSize} ${titleFontWeight} flex items-center gap-2 ${!isTitleHex ? (titleColor || 'text-slate-800 dark:text-slate-100') : ''}`}
                  style={isTitleHex ? { color: titleColor } : undefined}
                >
                    {iconName ? (
                        <DynamicIcon name={iconName} className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
                    ) : (
                        <TrendingUp className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
                    )}
                    {title}      
                </CardTitle>

                {/* TOOLTIP: INFO */}
                <TooltipProvider>
                  <Tooltip delayDuration={300}>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-slate-400 dark:text-slate-500 cursor-help hover:text-slate-600 dark:hover:text-slate-300 transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[200px] bg-slate-800 text-white border-slate-700 shadow-xl">
                      <p className="font-semibold mb-1 text-xs">Chart Interactions</p>
                      <ul className="list-disc pl-3 space-y-1 text-[10px] text-slate-300">
                        <li><strong>Bars:</strong> Revenue (Won vs Lost)</li>
                        <li><strong>Lines:</strong> Project Volume</li>
                        <li>Click data points to drill down.</li>
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

              {/* NAVIGATION BUTTONS */}
              <div className="flex gap-1">
                  <TooltipProvider>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-5 w-7" onClick={() => setOffset(prev => prev - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{navInfo.prev}</p></TooltipContent>
                      </Tooltip>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button variant="outline" size="icon" className="h-5 w-7" onClick={() => setOffset(prev => prev + 1)}>
                                  <ChevronRight className="h-4 w-4" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent><p>{navInfo.next}</p></TooltipContent>
                      </Tooltip>
                  </TooltipProvider>
              </div>
              
            </div>
            <CardDescription className="text-xs text-slate-500 dark:text-slate-400 pt-0.5">Project Volume & ACV Performance</CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-[210px]">
        <ChartContainer config={chartConfig} className="w-full h-full">
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />

            <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} tickMargin={10} />

            {/* Left Y-Axis: Count (0, 2, 4...) */}
            <YAxis yAxisId="left" orientation="left" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />

            {/* Right Y-Axis: Currency ($0k, $100k...) */}
            <YAxis yAxisId="right" orientation="right" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val/1000}k`} />

            <ChartTooltip content={<ChartTooltipContent />} />

            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '9px', paddingTop: '8px' }}/>

            {/* BARS: Blue, Green & Red - using theme-aware colors */}
            <Bar
                yAxisId="right"
                dataKey="createdACV"
                name="Created ACV ($)"
                fill={chartConfig.createdACV.color}
                radius={[4, 4, 0, 0]}
                barSize={20}
                onClick={(d) => onChartClick && onChartClick('fiscal_created_acv', d.name)}
                cursor="pointer"
            />
            <Bar 
                yAxisId="right" 
                dataKey="wonACV" 
                name="Closed Won ($)" 
                fill={chartConfig.closedWonACV.color}
                radius={[4, 4, 0, 0]} 
                barSize={20}
                onClick={(d) => onChartClick && onChartClick('fiscal_won', d.name)}
                cursor="pointer"
            />
            <Bar 
                yAxisId="right" 
                dataKey="lostACV" 
                name="Closed Lost ($)" 
                fill={chartConfig.closedLostACV.color}
                radius={[4, 4, 0, 0]} 
                barSize={20}
                onClick={(d) => onChartClick && onChartClick('fiscal_lost', d.name)}
                cursor="pointer"
            />

            {/* LINES: Dark Blue & Green - using theme-aware colors */}
            <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="created" 
                name="Projects Created" 
                stroke={chartConfig.created.color}
                strokeWidth={3} 
                dot={{ r: 4, fill: chartConfig.created.color, strokeWidth: 2, stroke: isDark ? "#1e293b" : "#fff" }} 
                activeDot={{ 
                  r: 6, 
                  fill: chartConfig.created.color, 
                  strokeWidth: 2, 
                  stroke: isDark ? "#1e293b" : "#fff",
                  cursor: "pointer",
                  onClick: (e: any, payload: any) => onChartClick && onChartClick('fiscal_created', payload?.payload?.name)
                }}
            />
            <Line 
                yAxisId="left" 
                type="monotone" 
                dataKey="completed" 
                name="Projects Completed" 
                stroke={chartConfig.completed.color}
                strokeWidth={3} 
                dot={{ r: 4, fill: chartConfig.completed.color, strokeWidth: 2, stroke: isDark ? "#1e293b" : "#fff" }} 
                activeDot={{ 
                  r: 6, 
                  fill: chartConfig.completed.color, 
                  strokeWidth: 2, 
                  stroke: isDark ? "#1e293b" : "#fff",
                  cursor: "pointer",
                  onClick: (e: any, payload: any) => onChartClick && onChartClick('fiscal_completed', payload?.payload?.name)
                }}
            />

          </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}