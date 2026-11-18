import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie,
  ResponsiveContainer, XAxis, YAxis, Tooltip, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar,
} from "recharts";
import { Loader2, AlertCircle } from "lucide-react";
import { fetchAnalyticsData } from "@/lib/mock-analytics";
import { WidgetConfig } from "@/types/dashboard-config";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useChartTheme } from "@/hooks/useChartTheme";

// --- IMPORTS ---
import { KPIStrip } from "./KPICards";
import { MAPKPI } from "./MAPKPI";
import { ProjectMetricsWidget } from "./ProjectMetricsWidget";
import { SupportMetricsWidget } from "./SupportMetricsWidget";
import { FiscalTrendsWidget } from "./FiscalTrendsWidget";
import { AccountMetricsWidget } from "./AccountMetricsWidget";
import { ProjectSchedulesWidget } from "./ProjectSchedulesWidget";
import { StatusDistributionWidget } from "./StatusDistributionWidget";

// --- HELPER: TITLE FONT SIZE CLASS ---
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

// --- HELPER: TITLE FONT WEIGHT CLASS ---
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

// --- 1. MOCK DATA FOR BUILDER PREVIEW ---
// (Prevents blank charts when designing layouts)
const MOCK_PROJECTS_PREVIEW = Array.from({ length: 20 }).map((_, i) => ({
  id: i,
  status: i % 5 === 0 ? 'closed_won' : i % 3 === 0 ? 'active' : 'scoping',
  risk: i % 4 === 0 ? 'high' : 'low',
  opportunityAcvValue: (i + 1) * 10000,
  createdAt: new Date(new Date().setMonth(new Date().getMonth() - (i % 6))).toISOString(),
  endDate: new Date(new Date().setMonth(new Date().getMonth() + (i % 3))).toISOString(),
  customerName: `Mock Customer ${i}`,
  solutionName: i % 2 === 0 ? "PAM" : "IGA"
}));

// --- 2. THE REGISTRY (Maps DB Type -> Component) ---
const SMART_WIDGET_REGISTRY: Record<string, React.ComponentType<any>> = {
  // Standard KPI
  "kpi_strip": KPIStrip,

  // MAP KPI
  "map_kpi_component": MAPKPI,

  // Complex Widgets
  "project_metrics": ProjectMetricsWidget,
  "project_metrics_component": ProjectMetricsWidget,
  "fiscal_trends": FiscalTrendsWidget,
  "fiscal_trends_component": FiscalTrendsWidget,
  "support_metrics": SupportMetricsWidget,
  "support_metrics_component": SupportMetricsWidget,
  "account_metrics": AccountMetricsWidget,
  "account_metrics_component": AccountMetricsWidget,
  "project_schedules": ProjectSchedulesWidget,
  "project_schedules_component": ProjectSchedulesWidget,
  "status_distribution": StatusDistributionWidget,
  "status_distribution_component": StatusDistributionWidget,
};

interface LiveChartRendererProps {
  widget: WidgetConfig;
  data?: any; 
  onChartClick?: (type: string, value: any) => void;
}

export const LiveChartRenderer: React.FC<LiveChartRendererProps> = ({
  widget,
  data,
  onChartClick,
}) => {
  const chartTheme = useChartTheme();
  const activeColor = widget.settings?.colorScheme?.[0] || chartTheme.getColor("primary");
  const COLORS = chartTheme.defaultPalette;

  // --- 3. TRAFFIC CONTROLLER ---

  // Resolve the component from the registry
  let SmartComponent = SMART_WIDGET_REGISTRY[widget.type];

  // Fallback for legacy "Title Hack" (Safety Net for old configs)
  if (widget.type === "kpi_strip" && widget.title && widget.title.includes("MAP")) {
    SmartComponent = MAPKPI;
  }

  // --- 4. RENDER SMART WIDGET ---
  if (SmartComponent) {
    // [CRITICAL FIX]: Handle both direct Arrays AND Context Objects
    let rawProjects: any[] = [];

    // Case A: Direct Array (Rare, but possible)
    if (Array.isArray(data)) {
        rawProjects = data; 
    } 
    // Case B: Context Object from Main Dashboard (Common)
    else if (data && Array.isArray(data.projects)) {
        rawProjects = data.projects; 
    } 
    // Case C: Builder Mode (Data is null/undefined) -> Use Mock Data
    else if (!data || (data && !data.projects)) {
        rawProjects = MOCK_PROJECTS_PREVIEW;
    }

    return (
      <div className="h-full w-full overflow-hidden">
        <SmartComponent 
          projects={rawProjects} 
          config={widget} 
          onChartClick={onChartClick} 
        />
      </div>
    );
  }

  // --- 5. RENDER STANDARD CHART (Fallback) ---

  const { data: queryData, isLoading, isError } = useQuery({
    queryKey: ["analytics", widget.id, widget.dataSource],
    queryFn: () => fetchAnalyticsData(widget.dataSource || "fiscal_trends"),
    enabled: !data && !SmartComponent, 
  });

  const chartData = data || queryData;

  if (isLoading && !chartData) return <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500"><Loader2 className="animate-spin mr-2 h-4 w-4" /> Loading...</div>;
  if (isError) return <div className="flex h-full items-center justify-center text-red-400 dark:text-red-500"><AlertCircle className="mr-2 h-4 w-4" /> Error</div>;

  // Title customization for fallback charts
  const titleFontSize = getTitleFontSizeClass(widget.settings?.titleFontSize);
  const titleFontWeight = getTitleFontWeightClass(widget.settings?.titleFontWeight);
  const titleColor = widget.settings?.titleColor;
  const isTitleHex = titleColor?.startsWith("#");

  const renderStandardChart = () => {
    switch (widget.type) {
      case "line":
        return (
          <LineChart data={chartData}>
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke={activeColor} strokeWidth={2} dot={false} />
          </LineChart>
        );
      case "area":
        return (
          <AreaChart data={chartData}>
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke={activeColor} fill={activeColor} fillOpacity={0.2} />
          </AreaChart>
        );
      case "pie":
      case "donut":
        return (
          <PieChart>
            <Pie data={chartData} innerRadius={widget.type === "donut" ? 40 : 0} outerRadius={60} dataKey="value">
              {chartData?.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        );
      case "radar":
        return (
          <RadarChart outerRadius="80%" data={chartData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
            <PolarRadiusAxis angle={30} domain={[0, 150]} tick={false} />
            <Radar name="Metrics" dataKey="value" stroke={activeColor} fill={activeColor} fillOpacity={0.6} />
            <Tooltip />
          </RadarChart>
        );
      case "radial":
        return (
          <RadialBarChart innerRadius="10%" outerRadius="80%" barSize={10} data={chartData}>
            <RadialBar label={{ position: "insideStart", fill: "#fff" }} background dataKey="value" fill={activeColor} />
            <Tooltip />
          </RadialBarChart>
        );
      default:
        return (
          <BarChart data={chartData}>
            <XAxis dataKey="name" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Bar dataKey="value" fill={activeColor} />
          </BarChart>
        );
    }
  };

  return (
    <Card className="h-full shadow-sm border-slate-200 dark:border-gray-700 flex flex-col dark:bg-gray-900">
      <CardHeader className="pb-2">
        <CardTitle 
          className={`${titleFontSize} ${titleFontWeight} flex items-center gap-2 ${!isTitleHex ? (titleColor || 'text-slate-800 dark:text-slate-100') : ''}`}
          style={isTitleHex ? { color: titleColor } : undefined}
        >
          {widget.iconName && (
            <DynamicIcon 
              name={widget.iconName} 
              className="h-5 w-5" 
              style={{ color: activeColor }}
            />
          )}
          {widget.title || 'Chart'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {renderStandardChart()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default LiveChartRenderer;