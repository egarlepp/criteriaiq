"use client";
import React, { useMemo, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { 
  LucideIcon, Activity, CheckCircle, Users, Trophy, CalendarCheck, 
  TrendingUp, TrendingDown, Clock, Target, DollarSign, AlertTriangle,
  ArrowUp, ArrowDown, Briefcase, Info
} from "lucide-react";
import { WidgetConfig } from "@/types/dashboard-config";
import { MetricSparkline } from "@/components/dashboard-widgets/metric-sparkline";
import { formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isActiveProject, isWonStatus, isLostStatus, isTCCStatus } from "@/lib/project-status";

interface KPIItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  shadowColor: string;
  clickType: string;
  clickValue: string;
  metricKey: string;
  unit: "count" | "currency" | "percentage" | "days" | "hours";
  secondaryLabel: string;
  secondaryValue: string | number;
  trendPercent: number;
  trendDirection: 'up' | 'down' | 'neutral';
  lastWeekValue: string | number;
  lastMonthValue: string | number;
  description: string;
  calculation: string;
}

const formatCurrency = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const calculateKPIs = (projects: any[]): KPIItem[] => {
  if (!projects) return [];

  const now = new Date();
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
  const lastWeekStart = new Date(weekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const future5 = new Date(now); future5.setDate(now.getDate() + 5);

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const parseACV = (p: any) => {
    const val = p.opportunityAcvValue;
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[$,]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const tccProjects = projects.filter(p => isTCCStatus(p.status));
  const tcc = tccProjects.length;
  const tccLastWeek = projects.filter(p => {
    const completed = p.completedAt ? new Date(p.completedAt) : null;
    return completed && completed >= lastWeekStart && completed <= lastWeekEnd && isTCCStatus(p.status);
  }).length;
  const avgDaysToClose = (() => {
    const completed = tccProjects.filter(p => p.startDate && p.endDate);
    if (completed.length === 0) return 0;
    const totalDays = completed.reduce((sum, p) => {
      return sum + Math.ceil((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86400000);
    }, 0);
    return Math.round(totalDays / completed.length);
  })();

  const activeProjects = projects.filter(isActiveProject);
  const activeACV = activeProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const newThisWeekProjects = activeProjects.filter(p => p.createdAt && new Date(p.createdAt) >= weekStart);
  const newThisWeekACV = newThisWeekProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const activeLastWeek = projects.filter(p => {
    const created = p.createdAt ? new Date(p.createdAt) : null;
    return created && created >= lastWeekStart && created < weekStart && isActiveProject(p);
  });
  const activeLastWeekACV = activeLastWeek.reduce((sum, p) => sum + parseACV(p), 0);

  const wonProjects = projects.filter(p => isWonStatus(p.status));
  const lostProjects = projects.filter(p => isLostStatus(p.status));
  const totalClosed = wonProjects.length + lostProjects.length;
  const successRate = totalClosed > 0 ? Math.round((wonProjects.length / totalClosed) * 100) : 0;
  const wonLastWeek = projects.filter(p => {
    const closed = p.closedAt ? new Date(p.closedAt) : null;
    return closed && closed >= lastWeekStart && closed <= lastWeekEnd && isWonStatus(p.status);
  }).length;
  const closedLastWeek = projects.filter(p => {
    const closed = p.closedAt ? new Date(p.closedAt) : null;
    return closed && closed >= lastWeekStart && closed <= lastWeekEnd && (isWonStatus(p.status) || isLostStatus(p.status));
  }).length;
  const successRateLastWeek = closedLastWeek > 0 ? Math.round((wonLastWeek / closedLastWeek) * 100) : 0;

  const completingSoon = projects.filter(p => {
    if (!p.endDate) return false;
    const end = new Date(p.endDate);
    return end >= now && end <= future5 && isActiveProject(p);
  }).length;
  const dueThisWeek = projects.filter(p => {
    if (!p.endDate) return false;
    const end = new Date(p.endDate);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    return end >= weekStart && end <= weekEnd && isActiveProject(p);
  }).length;

  const startedThisWeek = projects.filter(p => {
    if (!p.startDate) return false;
    const start = new Date(p.startDate);
    return start >= weekStart && start <= now;
  }).length;
  const totalActive = activeProjects.length;
  const startedLastWeek = projects.filter(p => {
    if (!p.startDate) return false;
    const start = new Date(p.startDate);
    return start >= lastWeekStart && start < weekStart;
  }).length;

  const atRisk = projects.filter(p => p.risk === 'Red' || p.risk === 'High').length;
  const criticalRisk = projects.filter(p => p.risk === 'Red').length;
  const atRiskLastWeek = 0;

  const wonACVTotal = wonProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const wonThisMonth = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= startMonth && isWonStatus(p.status);
  });
  const wonACVThisMonth = wonThisMonth.length > 0 ? wonThisMonth.reduce((sum, p) => sum + parseACV(p), 0) : wonACVTotal;
  const wonThisWeek = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= weekStart && isWonStatus(p.status);
  });
  const wonACVThisWeek = wonThisWeek.reduce((sum, p) => sum + parseACV(p), 0);
  const wonLastWeekProjects = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= lastWeekStart && updated < weekStart && isWonStatus(p.status);
  });
  const wonACVLastWeek = wonLastWeekProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const wonLastMonthProjects = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= startLastMonth && updated <= endLastMonth && isWonStatus(p.status);
  });
  const wonACVLastMonth = wonLastMonthProjects.reduce((sum, p) => sum + parseACV(p), 0);

  const lostACVTotal = lostProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const lostThisMonth = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= startMonth && isLostStatus(p.status);
  });
  const lostACVThisMonth = lostThisMonth.length > 0 ? lostThisMonth.reduce((sum, p) => sum + parseACV(p), 0) : lostACVTotal;
  const lostThisWeekProjects = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= weekStart && isLostStatus(p.status);
  });
  const lostACVThisWeek = lostThisWeekProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const lostLastWeekProjects = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= lastWeekStart && updated < weekStart && isLostStatus(p.status);
  });
  const lostACVLastWeek = lostLastWeekProjects.reduce((sum, p) => sum + parseACV(p), 0);
  const lostLastMonthProjects = projects.filter(p => {
    const updated = p.updatedAt ? new Date(p.updatedAt) : null;
    return updated && updated >= startLastMonth && updated <= endLastMonth && isLostStatus(p.status);
  });
  const lostACVLastMonth = lostLastMonthProjects.reduce((sum, p) => sum + parseACV(p), 0);

  const customers = new Set(projects.map(p => p.customerName)).size;
  const newCustomersThisMonth = new Set(
    projects.filter(p => p.createdAt && new Date(p.createdAt) >= startMonth).map(p => p.customerName)
  ).size;
  const customersLastWeek = new Set(
    projects.filter(p => p.createdAt && new Date(p.createdAt) < weekStart).map(p => p.customerName)
  ).size;

  const calcTrend = (current: number, previous: number): { trendPercent: number; trendDirection: 'up' | 'down' | 'neutral' } => {
    if (previous === 0 && current === 0) return { trendPercent: 0, trendDirection: 'neutral' };
    if (previous === 0) return { trendPercent: 100, trendDirection: 'up' };
    const change = ((current - previous) / previous) * 100;
    return {
      trendPercent: Math.abs(Math.round(change)),
      trendDirection: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'
    };
  };

  return [
    {
      label: "Clear2Close",
      value: tcc,
      icon: CheckCircle,
      color: "text-green-500",
      shadowColor: "shadow-green-200/50 dark:shadow-green-900/30",
      clickType: "tcc",
      clickValue: "all",
      metricKey: "kpi.total_completed_count",
      unit: "count" as const,
      secondaryLabel: "avg days",
      secondaryValue: avgDaysToClose,
      ...calcTrend(tcc, tccLastWeek > 0 ? tccLastWeek : tcc),
      lastWeekValue: tccLastWeek,
      lastMonthValue: tcc,
      description: "Total number of projects with TCC status",
      calculation: "Count of projects where Internal Status = 'TCC'"
    },
    {
      label: "Active Pipeline",
      value: formatCurrency(activeACV),
      icon: Briefcase,
      color: "text-blue-500",
      shadowColor: "shadow-blue-200/50 dark:shadow-blue-900/30",
      clickType: "pipeline",
      clickValue: "active",
      metricKey: "kpi.active_pipeline_acv",
      unit: "currency" as const,
      secondaryLabel: "new this week",
      secondaryValue: formatCurrency(newThisWeekACV),
      ...calcTrend(activeACV, activeLastWeekACV > 0 ? activeLastWeekACV : activeACV),
      lastWeekValue: formatCurrency(activeLastWeekACV),
      lastMonthValue: formatCurrency(activeACV),
      description: "Total ACV value of all active projects in the pipeline",
      calculation: "Sum of ACV for projects not Completed, Closed Won, Closed Lost, or Cancelled"
    },
    {
      label: "Success Rate",
      value: `${successRate}%`,
      icon: Trophy,
      color: "text-yellow-500",
      shadowColor: "shadow-yellow-200/50 dark:shadow-yellow-900/30",
      clickType: "success_rate",
      clickValue: "all",
      metricKey: "kpi.success_rate",
      unit: "percentage" as const,
      secondaryLabel: "won/total",
      secondaryValue: `${wonProjects.length}/${totalClosed}`,
      ...calcTrend(successRate, successRateLastWeek),
      lastWeekValue: `${successRateLastWeek}%`,
      lastMonthValue: `${successRate}%`,
      description: "Percentage of closed projects that were won",
      calculation: "Closed Won / (Closed Won + Closed Lost) × 100"
    },
    {
      label: "Completing Soon",
      value: completingSoon,
      icon: CalendarCheck,
      color: "text-orange-500",
      shadowColor: "shadow-orange-200/50 dark:shadow-orange-900/30",
      clickType: "date",
      clickValue: "soon",
      metricKey: "kpi.completing_soon_count",
      unit: "count" as const,
      secondaryLabel: "due this week",
      secondaryValue: dueThisWeek,
      ...calcTrend(completingSoon, completingSoon),
      lastWeekValue: completingSoon,
      lastMonthValue: completingSoon,
      description: "Active projects with end dates within the next 5 days",
      calculation: "Count of active projects where end date is between today and 5 days from now"
    },
    {
      label: "Started This Week",
      value: startedThisWeek,
      icon: TrendingUp,
      color: "text-teal-500",
      shadowColor: "shadow-teal-200/50 dark:shadow-teal-900/30",
      clickType: "date",
      clickValue: "new",
      metricKey: "kpi.started_this_week_count",
      unit: "count" as const,
      secondaryLabel: "total active",
      secondaryValue: totalActive,
      ...calcTrend(startedThisWeek, startedLastWeek),
      lastWeekValue: startedLastWeek,
      lastMonthValue: startedThisWeek,
      description: "Projects that started during the current week",
      calculation: "Count of projects where start date is within this week"
    },
    {
      label: "At Risk",
      value: atRisk,
      icon: AlertTriangle,
      color: "text-red-500",
      shadowColor: "shadow-red-200/50 dark:shadow-red-900/30",
      clickType: "risk",
      clickValue: "high",
      metricKey: "kpi.at_risk_count",
      unit: "count" as const,
      secondaryLabel: "critical",
      secondaryValue: criticalRisk,
      ...calcTrend(atRisk, atRiskLastWeek),
      lastWeekValue: atRiskLastWeek,
      lastMonthValue: atRisk,
      description: "Projects flagged as High or Red risk level",
      calculation: "Count of projects where risk = 'High' or 'Red'"
    },
    {
      label: "Won ACV",
      value: formatCurrency(wonACVThisMonth),
      icon: DollarSign,
      color: "text-emerald-500",
      shadowColor: "shadow-emerald-200/50 dark:shadow-emerald-900/30",
      clickType: "acv",
      clickValue: "won",
      metricKey: "kpi.won_acv",
      unit: "currency" as const,
      secondaryLabel: "this week",
      secondaryValue: formatCurrency(wonACVThisWeek),
      ...calcTrend(wonACVThisWeek, wonACVLastWeek),
      lastWeekValue: formatCurrency(wonACVLastWeek),
      lastMonthValue: formatCurrency(wonACVLastMonth),
      description: "Total ACV value of projects closed as won this month",
      calculation: "Sum of ACV for projects with status 'Closed Won' updated this month"
    },
    {
      label: "Lost ACV",
      value: formatCurrency(lostACVThisMonth),
      icon: TrendingDown,
      color: "text-rose-500",
      shadowColor: "shadow-rose-200/50 dark:shadow-rose-900/30",
      clickType: "acv",
      clickValue: "lost",
      metricKey: "kpi.lost_acv",
      unit: "currency" as const,
      secondaryLabel: "this week",
      secondaryValue: formatCurrency(lostACVThisWeek),
      ...calcTrend(lostACVThisWeek, lostACVLastWeek),
      lastWeekValue: formatCurrency(lostACVLastWeek),
      lastMonthValue: formatCurrency(lostACVLastMonth),
      description: "Total ACV value of projects closed as lost this month",
      calculation: "Sum of ACV for projects with status 'Closed Lost' updated this month"
    },
    {
      label: "Accounts",
      value: customers,
      icon: Users,
      color: "text-purple-500",
      shadowColor: "shadow-purple-200/50 dark:shadow-purple-900/30",
      clickType: "account",
      clickValue: "all",
      metricKey: "kpi.customer_count",
      unit: "count" as const,
      secondaryLabel: "new this month",
      secondaryValue: newCustomersThisMonth,
      ...calcTrend(customers, customersLastWeek),
      lastWeekValue: customersLastWeek,
      lastMonthValue: customers,
      description: "Total unique accounts across all projects",
      calculation: "Count of distinct account names from all projects"
    }
  ];
};

interface KPIStripProps {
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

function FlipCard({ item, idx, onChartClick }: { item: KPIItem; idx: number; onChartClick?: (type: string, value: any) => void }) {
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
                  className={`absolute left-1 top-1/2 h-20 w-20 ${item.color} opacity-[0.05] dark:opacity-[0.10]`} 
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
                  <div className="w-full h-7 mt-1 flex items-center justify-end pr-2 opacity-70">
                    <MetricSparkline
                      metricKey={item.metricKey}
                      width={70}
                      height={24}
                      unit={item.unit}
                      showPoints={true}
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

export function KPIStrip({ projects = [], config, onChartClick }: KPIStripProps) {
  const items = useMemo(() => calculateKPIs(projects), [projects]);
  const title = config?.title || "Key Performance Indicators";
  const activeColor = config?.settings?.colorScheme?.[0] || "text-blue-600";
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
          <Activity className={`h-4 w-4 ${!isHex ? activeColor : ""}`} style={isHex ? { color: activeColor } : {}} />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-2 px-4">
        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {items.map((item, idx) => (
            <FlipCard key={idx} item={item} idx={idx} onChartClick={onChartClick} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
