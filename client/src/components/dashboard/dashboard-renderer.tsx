import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslation } from "react-i18next";
import { defaultDashboardConfig } from "@/config/dashboard-data";
import { DashboardSystemConfig } from "@/types/dashboard-config";
import { LiveChartRenderer } from "@/components/dashboard-widgets/LiveChartRenderer";

// --- INTERFACE FOR REAL DATA ---
export interface DashboardDataContext {
  projects?: any[];
  dynamicData?: Record<string, any>;
  kpiItems?: any[];
  projectMetrics?: {
    statusData: any[];
    closedData: any[];
    metrics: any;
  };
}

interface DashboardRendererProps {
  pageKey: string;
  className?: string;
  // NEW: Accepts the real calculated data from MainDashboard
  dataContext?: DashboardDataContext; 
  onChartClick?: (type: string, value: any) => void;
}

export function DashboardRenderer({ pageKey, className, dataContext, onChartClick }: DashboardRendererProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // 1. DATA FETCHING (Layout Only)
  const { data: layoutData, isLoading, error } = useQuery({
    queryKey: [`/api/dashboard-layout`, pageKey, user?.role],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard-layout?page=${pageKey}&role=${user?.role || 'All'}`);
      if (res.status === 401) return null;
      if (!res.ok) throw new Error("Failed to load layout");
      return res.json();
    },
    enabled: !!user,
    placeholderData: { config: defaultDashboardConfig } 
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error) return <Alert variant="destructive"><AlertDescription>{t("dashboard.renderer.errorLoading")}</AlertDescription></Alert>;

  // 2. CONFIG PARSING
  const systemConfig: DashboardSystemConfig = 
    (layoutData && layoutData.config) ? layoutData.config : defaultDashboardConfig;

  const activeLayout = systemConfig.layouts.find(l => l.id === layoutData?.activeLayoutId) 
    || systemConfig.layouts[0];

  if (!activeLayout) return <div className="p-8 border-2 border-dashed rounded-lg text-center text-gray-500">{t("dashboard.renderer.noLayoutFound")}</div>;

  const sections = activeLayout.sections || [];

  // --- HELPER: ROUTE DATA TO WIDGETS ---
  const getWidgetData = (widget: any) => {
    if (!dataContext) return undefined;

    // A. DYNAMIC PRIORITY: Check if widget is linked to a Dynamic Metric
    // The builder saves the metric ID into widget.dataSource
    if (widget.dataSource && dataContext.dynamicData) {
        const val = dataContext.dynamicData[widget.dataSource];
        if (val !== undefined) return val;
    }
    
    // B. SMART WIDGETS: All smart widgets need raw projects data
    // Return the full dataContext so LiveChartRenderer can access dataContext.projects
    const smartWidgetTypes = [
      'kpi_strip',
      'map_kpi_component',
      'project_metrics_component', 
      'project_metrics',
      'fiscal_trends_component', 
      'fiscal_trends',
      'support_metrics_component', 
      'support_metrics',
      'account_metrics_component',
      'account_metrics',
      'project_schedules_component',
      'project_schedules',
      'status_distribution_component',
      'status_distribution'
    ];
    
    if (smartWidgetTypes.includes(widget.type)) {
      return dataContext; // Contains { projects: [...], dynamicData: {...}, ... }
    }
    
    return undefined; // Standard charts fetch their own data
  };

  // 3. RENDER LOOP
  return (
    <div className={`space-y-4 ${className}`}>
      {sections.map((section: any) => (
        <div 
          key={section.id} 
          className="grid gap-4"
          style={{ 
            display: 'grid',
            gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))` 
          }} 
        >
          {section.widgetIds.map((widgetId: string) => {
            const widget = systemConfig.widgets[widgetId];
            if (!widget) return null;

            const colSpan = Math.min(widget.gridColSpan || 1, section.columns);
            const rowSpan = widget.gridRowSpan || 1;

            return (
              <div 
                key={widgetId} 
                style={{ 
                  gridColumn: `span ${colSpan}`,
                  gridRow: `span ${rowSpan}` 
                }}
              >
                <LiveChartRenderer 
                  widget={widget} 
                  data={getWidgetData(widget)} 
                  onChartClick={onChartClick}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[120px] w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-6">
         <Skeleton className="h-[300px] rounded-lg" />
         <Skeleton className="h-[300px] rounded-lg" />
      </div>
    </div>
  );
}