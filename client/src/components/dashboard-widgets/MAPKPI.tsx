"use client";
import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  Map, Clock, CheckSquare, AlertTriangle, Layers, ListChecks, 
  BarChart3, Target, ArrowUp, ArrowDown, LucideIcon, Info
} from "lucide-react";
import { WidgetConfig } from "@/types/dashboard-config";
import { MetricSparkline } from "@/components/dashboard-widgets/metric-sparkline";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";

interface MAPDashboardMetrics {
  phases: { active: number; completed: number; total: number };
  steps: { active: number; completed: number; total: number };
  tasks: { active: number; completed: number; total: number };
}

interface MAPItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  shadowColor: string;
  clickType: string;
  clickValue: string;
  metricKey: string;
  unit: "count" | "percentage" | "currency" | "days";
  secondaryLabel: string;
  secondaryValue: string | number;
  trendPercent: number;
  trendDirection: 'up' | 'down' | 'neutral';
  lastWeekValue: string | number;
  lastMonthValue: string | number;
  description: string;
  calculation: string;
}

const calculateMAPMetrics = (projects: any[], mapMetrics?: MAPDashboardMetrics | null, mapProjects?: any[] | null): MAPItem[] => {
  const emptyDefaults = { trendPercent: 0, trendDirection: 'neutral' as const, lastWeekValue: 0, lastMonthValue: 0 };
  
  if ((!projects || projects.length === 0) && !mapMetrics && (!mapProjects || mapProjects.length === 0)) {
    return [
      { label: "Avg Progress", value: "0%", icon: BarChart3, color: "text-blue-600", shadowColor: "shadow-blue-200/50 dark:shadow-blue-900/30", clickType: "map", clickValue: "progress", metricKey: "map.overall_completion", unit: "percentage", secondaryLabel: "days avg active", secondaryValue: 0, ...emptyDefaults, lastWeekValue: "0%", lastMonthValue: "0%", description: "Average completion percentage across all active MAPs", calculation: "Sum of progress % / number of active projects" },
      { label: "Active Phases", value: 0, icon: Layers, color: "text-purple-600", shadowColor: "shadow-purple-200/50 dark:shadow-purple-900/30", clickType: "map", clickValue: "phases", metricKey: "map.phases_total", unit: "count", secondaryLabel: "completed", secondaryValue: 0, ...emptyDefaults, description: "Number of MAP phases currently in progress", calculation: "Count of phases not yet completed" },
      { label: "Active Steps", value: 0, icon: ListChecks, color: "text-cyan-600", shadowColor: "shadow-cyan-200/50 dark:shadow-cyan-900/30", clickType: "map", clickValue: "steps", metricKey: "map.steps_total", unit: "count", secondaryLabel: "completed", secondaryValue: 0, ...emptyDefaults, description: "Number of MAP steps currently in progress", calculation: "Count of steps not yet completed" },
      { label: "Active Tasks", value: 0, icon: CheckSquare, color: "text-green-600", shadowColor: "shadow-green-200/50 dark:shadow-green-900/30", clickType: "map", clickValue: "tasks", metricKey: "map.tasks_total", unit: "count", secondaryLabel: "completed", secondaryValue: 0, ...emptyDefaults, description: "Number of MAP tasks currently in progress", calculation: "Count of tasks not yet completed" },
      { label: "Completion Rate", value: "0%", icon: Target, color: "text-indigo-600", shadowColor: "shadow-indigo-200/50 dark:shadow-indigo-900/30", clickType: "map", clickValue: "completion", metricKey: "map.overall_completion", unit: "percentage", secondaryLabel: "of tasks done", secondaryValue: "0/0", ...emptyDefaults, lastWeekValue: "0%", lastMonthValue: "0%", description: "Percentage of all MAP tasks that are complete", calculation: "Completed tasks / Total tasks × 100" },
      { label: "On Track", value: 0, icon: Clock, color: "text-teal-600", shadowColor: "shadow-teal-200/50 dark:shadow-teal-900/30", clickType: "map", clickValue: "ontrack", metricKey: "map.phases_completed", unit: "count", secondaryLabel: "ahead of schedule", secondaryValue: 0, ...emptyDefaults, description: "Projects with MAPs where end date has not passed", calculation: "Count of active projects with MAPs where end date >= today" },
      { label: "Overdue", value: 0, icon: AlertTriangle, color: "text-red-600", shadowColor: "shadow-red-200/50 dark:shadow-red-900/30", clickType: "map", clickValue: "overdue", metricKey: "kpi.at_risk_count", unit: "count", secondaryLabel: "days avg overdue", secondaryValue: 0, ...emptyDefaults, description: "Projects with MAPs that have passed their end date", calculation: "Count of active projects with MAPs where end date < today" }
    ];
  }

  const now = new Date();

  const mapProjectsList = mapProjects || [];

  const totalActiveDays = mapProjectsList.reduce((sum, p) => {
    if (!p.startDate) return sum;
    const start = new Date(p.startDate);
    const days = Math.ceil((now.getTime() - start.getTime()) / 86400000);
    return sum + Math.max(0, days);
  }, 0);
  const avgActiveDays = mapProjectsList.length > 0 ? Math.round(totalActiveDays / mapProjectsList.length) : 0;

  const progressSum = mapProjectsList.reduce((sum, p) => sum + (p.progress || 0), 0);
  const avgProgress = mapProjectsList.length > 0 ? Math.round(progressSum / mapProjectsList.length) : 0;

  const activePhases = mapMetrics?.phases.active ?? 0;
  const completedPhases = mapMetrics?.phases.completed ?? 0;
  const totalPhases = mapMetrics?.phases.total ?? 0;

  const activeSteps = mapMetrics?.steps.active ?? 0;
  const completedSteps = mapMetrics?.steps.completed ?? 0;
  const totalSteps = mapMetrics?.steps.total ?? 0;

  const activeTasks = mapMetrics?.tasks.active ?? 0;
  const completedTasks = mapMetrics?.tasks.completed ?? 0;
  const totalTasks = mapMetrics?.tasks.total ?? 0;

  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const onTrackProjects = mapProjectsList.filter(p => {
    if (!p.endDate) return true;
    return new Date(p.endDate) >= now;
  }).length;
  const aheadOfSchedule = mapProjectsList.filter(p => {
    if (!p.endDate || !p.startDate) return false;
    const totalDuration = new Date(p.endDate).getTime() - new Date(p.startDate).getTime();
    const elapsed = now.getTime() - new Date(p.startDate).getTime();
    const expectedProgress = totalDuration > 0 ? (elapsed / totalDuration) * 100 : 0;
    return (p.progress || 0) > expectedProgress;
  }).length;

  const overdueProjects = mapProjectsList.filter(p => {
    if (!p.endDate) return false;
    return new Date(p.endDate) < now;
  });
  const overdueCount = overdueProjects.length;
  const avgOverdueDays = overdueProjects.length > 0 
    ? Math.round(overdueProjects.reduce((sum, p) => {
        const overdue = Math.ceil((now.getTime() - new Date(p.endDate).getTime()) / 86400000);
        return sum + overdue;
      }, 0) / overdueProjects.length)
    : 0;

  const neutralTrend = { trendPercent: 0, trendDirection: 'neutral' as const };

  return [
    {
      label: "Avg Progress",
      value: `${avgProgress}%`,
      icon: BarChart3,
      color: "text-blue-600",
      shadowColor: "shadow-blue-200/50 dark:shadow-blue-900/30",
      clickType: "map",
      clickValue: "progress",
      metricKey: "map.overall_completion",
      unit: "percentage",
      secondaryLabel: "days avg active",
      secondaryValue: avgActiveDays,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Average completion percentage across all active MAPs",
      calculation: "Sum of progress % / number of active projects"
    },
    {
      label: "Active Phases",
      value: activePhases,
      icon: Layers,
      color: "text-purple-600",
      shadowColor: "shadow-purple-200/50 dark:shadow-purple-900/30",
      clickType: "map",
      clickValue: "phases",
      metricKey: "map.phases_total",
      unit: "count",
      secondaryLabel: "completed",
      secondaryValue: completedPhases,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Number of MAP phases currently in progress",
      calculation: "Count of phases not yet completed"
    },
    {
      label: "Active Steps",
      value: activeSteps,
      icon: ListChecks,
      color: "text-cyan-600",
      shadowColor: "shadow-cyan-200/50 dark:shadow-cyan-900/30",
      clickType: "map",
      clickValue: "steps",
      metricKey: "map.steps_total",
      unit: "count",
      secondaryLabel: "completed",
      secondaryValue: completedSteps,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Number of MAP steps currently in progress",
      calculation: "Count of steps not yet completed"
    },
    {
      label: "Active Tasks",
      value: activeTasks,
      icon: CheckSquare,
      color: "text-green-600",
      shadowColor: "shadow-green-200/50 dark:shadow-green-900/30",
      clickType: "map",
      clickValue: "tasks",
      metricKey: "map.tasks_total",
      unit: "count",
      secondaryLabel: "completed",
      secondaryValue: completedTasks,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Number of MAP tasks currently in progress",
      calculation: "Count of tasks not yet completed"
    },
    {
      label: "Completion Rate",
      value: `${completionRate}%`,
      icon: Target,
      color: "text-indigo-600",
      shadowColor: "shadow-indigo-200/50 dark:shadow-indigo-900/30",
      clickType: "map",
      clickValue: "completion",
      metricKey: "map.overall_completion",
      unit: "percentage",
      secondaryLabel: "of tasks done",
      secondaryValue: `${completedTasks}/${totalTasks}`,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Percentage of all MAP tasks that are complete",
      calculation: "Completed tasks / Total tasks × 100"
    },
    {
      label: "On Track",
      value: onTrackProjects,
      icon: Clock,
      color: "text-teal-600",
      shadowColor: "shadow-teal-200/50 dark:shadow-teal-900/30",
      clickType: "map",
      clickValue: "ontrack",
      metricKey: "map.phases_completed",
      unit: "count",
      secondaryLabel: "ahead of schedule",
      secondaryValue: aheadOfSchedule,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Projects where end date has not passed",
      calculation: "Count of active projects where end date >= today"
    },
    {
      label: "Overdue",
      value: overdueCount,
      icon: AlertTriangle,
      color: "text-red-600",
      shadowColor: "shadow-red-200/50 dark:shadow-red-900/30",
      clickType: "map",
      clickValue: "overdue",
      metricKey: "kpi.at_risk_count",
      unit: "count",
      secondaryLabel: "days avg overdue",
      secondaryValue: avgOverdueDays,
      ...neutralTrend,
      lastWeekValue: "N/A",
      lastMonthValue: "N/A",
      description: "Projects that have passed their end date",
      calculation: "Count of active projects where end date < today"
    }
  ];
};

interface MAPKPIProps {
  projects?: any[];
  config?: WidgetConfig;
  onChartClick?: (type: string, value: any) => void;
}

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

function FlipCard({ item, idx, onChartClick }: { item: MAPItem; idx: number; onChartClick?: (type: string, value: any) => void }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const Icon = item.icon;
  const TrendIcon = item.trendDirection === 'up' ? ArrowUp : item.trendDirection === 'down' ? ArrowDown : null;
  const trendColorClass = item.trendDirection === 'up' ? 'text-green-500' : item.trendDirection === 'down' ? 'text-red-500' : 'text-slate-400';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Don't flip if clicking on any button (View Details or Back button have their own handlers)
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    setIsFlipped(!isFlipped);
  };

  const handleFlipBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onChartClick) {
      onChartClick(item.clickType, item.clickValue);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div
            className="relative h-[120px] cursor-pointer group"
            style={{ perspective: '1000px' }}
          >
            <div
              className="relative w-full h-full transition-transform duration-500"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
              }}
            >
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center px-3 rounded-xl bg-white dark:bg-gray-800 transition-all overflow-hidden group-hover:border group-hover:border-slate-200 dark:group-hover:border-gray-600 group-hover:shadow-lg group-hover:${item.shadowColor}`}
                style={{ backfaceVisibility: 'hidden', pointerEvents: isFlipped ? 'none' : 'auto' }}
                onClick={handleClick}
              >
                <Icon 
                  className={`absolute left-4 top-1/2 h-20 w-20 ${item.color} opacity-[0.05] dark:opacity-[0.10]`} 
                  style={{ transform: 'translateY(-50%) rotate(-12deg)' }}
                />
                <div className="relative z-10 flex flex-col items-center w-full">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className={`h-4 w-4 ${item.color}`} />
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide">
                      {item.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 leading-none">
                      {item.value}
                    </span>
                    {TrendIcon && item.trendPercent > 0 && (
                      <div className={`flex items-center text-sm ${trendColorClass}`}>
                        <TrendIcon className="h-4 w-4" />
                        <span className="font-semibold">{item.trendPercent}%</span>
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-center">
                    <span className="font-medium">{item.secondaryValue}</span>{' '}
                    <span className="opacity-75">{item.secondaryLabel}</span>
                  </div>
                  <div className="w-full h-7 mt-1 flex items-center justify-end pr-6 opacity-70">
                    <MetricSparkline
                      metricKey={item.metricKey}
                      unit={item.unit}
                    />
                  </div>
                </div>
              </div>

              <div
                className={`absolute inset-0 flex flex-col items-center justify-center p-2 rounded-xl border bg-slate-50 dark:bg-gray-900 border-slate-200 dark:border-gray-600 shadow-md ${item.shadowColor} overflow-hidden`}
                style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', pointerEvents: isFlipped ? 'auto' : 'none' }}
              >
                <Icon 
                  className={`absolute -left-4 top-1/2 -translate-y-1/2 h-24 w-24 ${item.color} opacity-[0.08]`} 
                  style={{ transform: 'translateY(-50%) rotate(-12deg)' }}
                />
                <div className="relative z-10 text-center space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-600 dark:text-slate-300 tracking-wide">{item.label}</div>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Last Week:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{item.lastWeekValue}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Last Month:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{item.lastMonthValue}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 pt-1">
                    Updated {formatDistanceToNow(new Date(), { addSuffix: false })} ago
                  </div>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    <button
                      onClick={handleNavigate}
                      className="text-[10px] font-medium text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline cursor-pointer"
                    >
                      View Details →
                    </button>
                    <button
                      onClick={handleFlipBack}
                      className="text-[10px] font-medium text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 cursor-pointer"
                    >
                      ← Back
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px]">
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-blue-500" />
              <span className="font-semibold text-xs">{item.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            <div className="text-[10px] text-muted-foreground/80 border-t pt-1 mt-1">
              <span className="font-medium">Formula:</span> {item.calculation}
            </div>
            <div className="text-[10px] text-blue-500 font-medium pt-1">
              Click For Additional Data!
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function MAPKPI({ projects = [], config, onChartClick }: MAPKPIProps) {
  const { data: mapMetrics } = useQuery<MAPDashboardMetrics>({
    queryKey: ["/api/map/dashboard-metrics"],
    staleTime: 30000,
  });

  const { data: mapProjects } = useQuery<any[]>({
    queryKey: ["/api/map/dashboard-projects"],
    staleTime: 30000,
  });

  const items = useMemo(() => calculateMAPMetrics(projects, mapMetrics, mapProjects), [projects, mapMetrics, mapProjects]);
  const title = config?.title || "MAP Progress Indicators";
  const iconName = config?.iconName;
  const activeColor = config?.settings?.colorScheme?.[0] || "text-indigo-600";
  const isHex = activeColor.startsWith("#");

  const titleFontSize = getTitleFontSizeClass(config?.settings?.titleFontSize);
  const titleFontWeight = getTitleFontWeightClass(config?.settings?.titleFontWeight);
  const titleColor = config?.settings?.titleColor;
  const isTitleHex = titleColor?.startsWith("#");

  return (
    <Card className="shadow-sm border-slate-200 dark:border-gray-700 h-full dark:bg-gray-900">
      <CardHeader className="py-1.5 px-4">
        <CardTitle
          className={`flex items-center gap-2 ${titleFontSize} ${titleFontWeight} tracking-tight ${!isTitleHex ? (titleColor || 'text-slate-800 dark:text-slate-100') : ''}`}
          style={isTitleHex ? { color: titleColor } : undefined}
        >
          {iconName ? <DynamicIcon name={iconName} className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} /> : <Map className={`h-5 w-5 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2 px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {items.map((item, idx) => (
            <FlipCard key={idx} item={item} idx={idx} onChartClick={onChartClick} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
