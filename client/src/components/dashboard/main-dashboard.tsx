import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useDashboardRuntime, type SavedMetric } from "@/hooks/useMetricEngine";
import { useDashboardFilters } from "@/contexts/dashboard-context";
import { useFiscalConfig } from "@/hooks/use-fiscal-config";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useCustomerStatusConfigRealtime } from "@/hooks/useConfigRealtime";
import { PocWithRelations, type Customer, type Product, type User, type StatusConfig, type CustomerStatusConfig } from "@shared/schema";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";

import { isEngineerOnProject } from "@/lib/project-access-utils";
import { ProjectDrillDownSheet } from "@/components/project-detail/project-drill-down-sheet";
import { KPIDetailDrawer, KPIDrawerConfig, getDrawerConfig } from "@/components/dashboard-widgets/KPIDetailDrawer";
import CreateCustomerDialog from "@/components/accounts/CreateCustomerDialog";
import {
  Trophy,
  Clock,
  TrendingUp,
  Target,
  History,
  Activity,
  Server,
  ServerCog,
  ServerCrash,
  X,
  Crosshair,
  CalendarCog,
  Rocket,
  Flame
} from "lucide-react";
import {
  getStartOfDayInTimezone,
  parseProjectDate,
  getTodayInTimezone,
} from "@/lib/date-utils";
import {
  SearchFiltersSection,
  FilterLabel,
  FilterMultiSelectButton,
} from "@/components/ui/search-filters-section";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  ProjectTeamFilterSelect,
  matchesProjectTeamFilter,
  useProjectTeams,
} from "@/components/teams/project-teams";

import type { DrillDownState } from "./main-dashboard-types";
import {
  getNormalizedStatusValue,
} from "./main-dashboard-utils";

export default function MainDashboard() {
  const { t } = useTranslation();
  const { isAuthenticated, user, isLoading: authLoading } = useAuth();
  
  const { config: fiscalConfig, getQuarterRange } = useFiscalConfig();

  const {
    filters,
    setFilters,
    completingPeriod,
    setCompletingPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    showMyProjects,
    setShowMyProjects,
    activeFilterCount,
    clearAllFilters,
  } = useDashboardFilters();

  useCustomerStatusConfigRealtime();
  const { isInternal: showTeams, teams } = useProjectTeams();

  const [drillDownState, setDrillDownState] = useState<DrillDownState>({ isOpen: false, title: "", projects: [] });
  const [advancedFiltersHovered, setAdvancedFiltersHovered] = useState(false);
  const [openDropdownCount, setOpenDropdownCount] = useState(0);
  const [kpiDrawerConfig, setKpiDrawerConfig] = useState<KPIDrawerConfig>({
    isOpen: false,
    clickType: "",
    clickValue: "",
    title: "",
    description: "",
  });
  const [editingAccountCustomer, setEditingAccountCustomer] = useState<Customer | null>(null);
  const [isAccountEditDialogOpen, setIsAccountEditDialogOpen] = useState(false);

  const showAdvancedFilters = advancedFiltersHovered || openDropdownCount > 0;
  const handleDropdownOpenChange = (open: boolean) =>
    setOpenDropdownCount((prev) => (open ? prev + 1 : Math.max(0, prev - 1)));

  const handleChartClick = useCallback((type: string, value: string) => {
    if (type === "status") {
      setFilters((prev) => ({ ...prev, status: value }));
    } else if (type === "date" || type === "risk" || type === "customer" || type === "account" || type === "map" || type === "tcc" || type === "pipeline" || type === "success_rate" || type === "acv") {
      const drawerConfig = getDrawerConfig(type, value);
      setKpiDrawerConfig({ isOpen: true, ...drawerConfig });
    } else if (type === "support_status") {
      const drawerConfig = getDrawerConfig("support_status", value);
      setKpiDrawerConfig({ isOpen: true, ...drawerConfig });
    } else if (type === "support_type") {
      const drawerConfig = getDrawerConfig("support_type", value);
      setKpiDrawerConfig({ isOpen: true, ...drawerConfig });
    } else if (type === "fiscal_won") {
      setFilters((prev) => ({ ...prev, fiscalQuarter: value, fiscalStatus: 'won' }));
    } else if (type === "fiscal_lost") {
      setFilters((prev) => ({ ...prev, fiscalQuarter: value, fiscalStatus: 'lost' }));
    } else if (type === "fiscal_created") {
      setFilters((prev) => ({ ...prev, fiscalQuarter: value, fiscalStatus: 'created' }));
    } else if (type === "fiscal_completed") {
      setFilters((prev) => ({ ...prev, fiscalQuarter: value, fiscalStatus: 'completed' }));
    }
  }, [setFilters]);

  const { data: savedMetrics = [] } = useQuery<SavedMetric[]>({
      queryKey: ["/api/dashboard-metrics"],
      enabled: isAuthenticated
  });

  const { data: customerStatusConfigs = [] } = useQuery<CustomerStatusConfig[]>({
    queryKey: ["/api/customer-status-configs"],
    enabled: isAuthenticated,
  });

  const { data: pocs, isLoading: pocsLoading } = useQuery<PocWithRelations[]>({
    queryKey: ["/api/projects", filters],
    retry: false,
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const { data: statusConfigs = [] } = useQuery<StatusConfig[]>({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
  });
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: isAuthenticated,
  });
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  const accessibleProjects = useMemo(() => {
    if (!showMyProjects) return pocs || [];
    return (pocs || []).filter((poc) => isEngineerOnProject(poc, user?.id ?? ""));
  }, [pocs, user, showMyProjects]);

  const filteredProjects = useMemo(() => {
    if (!accessibleProjects.length) return [];

    let projects = [...accessibleProjects];

    if (startDate || endDate) {
      projects = projects.filter((project) => {
        const pStart = project.startDate ? new Date(project.startDate) : null;
        const pEnd = project.endDate ? new Date(project.endDate) : null;
        const fStart = startDate ? new Date(startDate) : null;
        const fEnd = endDate ? new Date(endDate) : null;
        if (fStart && fEnd)
          return (!pStart || pStart <= fEnd) && (!pEnd || pEnd >= fStart);
        if (fStart) return !pEnd || pEnd >= fStart;
        if (fEnd) return !pStart || pStart <= fEnd;
        return true;
      });
    }

    if (filters.status && filters.status !== "all-statuses")
      projects = projects.filter(
        (p) => p.status?.toLowerCase() === filters.status!.toLowerCase(),
      );
    if (filters.customerName && filters.customerName !== "all-customers")
      projects = projects.filter(
        (p) => p.customerName === filters.customerName,
      );
    if (
      filters.customerStatus &&
      filters.customerStatus !== "all-customer-status"
    )
      projects = projects.filter(
        (p) => p.customerStatus === filters.customerStatus,
      );
    if (filters.riskLevel && filters.riskLevel !== "all-risk-levels")
      projects = projects.filter((p) => p.risk === filters.riskLevel);
    if (filters.ranking && filters.ranking !== "all-rankings")
      projects = projects.filter(
        (p) => p.ranking?.toString() === filters.ranking,
      );

    if (filters.solutions?.length)
      projects = projects.filter((p) =>
        filters.solutions!.some((s) =>
          p.solutionName?.toLowerCase().includes(s.toLowerCase()),
        ),
      );
    if (filters.primaryEngineer?.length)
      projects = projects.filter((p) =>
        filters.primaryEngineer!.includes(p.primaryEngineerId || ""),
      );
    if (filters.specialistEngineer?.length)
      projects = projects.filter((p) =>
        filters.specialistEngineer!.includes(p.specialistEngineerId || ""),
      );
    if (filters.environment && filters.environment !== "all-environments")
      projects = projects.filter((p) => p.environment === filters.environment);
    if (filters.team)
      projects = projects.filter((p) => matchesProjectTeamFilter(p, filters.team!));

    if (filters.fiscalQuarter && filters.fiscalStatus) {
      const quarterMatch = filters.fiscalQuarter.match(/(?:FY)?(\d{4})\s*Q(\d)/);
      
      if (quarterMatch) {
        const fiscalYear = parseInt(quarterMatch[1]);
        const quarterNum = parseInt(quarterMatch[2]);
        
        const { start: qStartDate, end: qEndDate } = getQuarterRange(fiscalYear, quarterNum);
        const qEndDateExclusive = new Date(qEndDate);
        qEndDateExclusive.setDate(qEndDateExclusive.getDate() + 1);
        
        projects = projects.filter((p) => {
          const status = p.status?.toLowerCase() || '';
          const pDate = p.createdAt ? new Date(p.createdAt) : null;
          const pEnd = p.endDate ? new Date(p.endDate) : (p.updatedAt ? new Date(p.updatedAt) : null);
          
          if (filters.fiscalStatus === 'won') {
            return status.includes('won') && pEnd && pEnd >= qStartDate && pEnd < qEndDateExclusive;
          } else if (filters.fiscalStatus === 'lost') {
            return status.includes('lost') && pEnd && pEnd >= qStartDate && pEnd < qEndDateExclusive;
          } else if (filters.fiscalStatus === 'created') {
            return pDate && pDate >= qStartDate && pDate < qEndDateExclusive;
          } else if (filters.fiscalStatus === 'completed') {
            const isCompletedStatus = ['closed', 'completed', 'won', 'lost'].some(s => status.includes(s));
            return isCompletedStatus && pEnd && pEnd >= qStartDate && pEnd < qEndDateExclusive;
          }
          return true;
        });
      }
    }

    if (completingPeriod !== "all-projects") {
      const userTimezone = user?.timezone || "America/New_York";
      const today = getTodayInTimezone(userTimezone);
      projects = projects.filter((p) => {
        if (!p.endDate) return false;
        const end = getStartOfDayInTimezone(
          parseProjectDate(p.endDate),
          userTimezone,
        );
        switch (completingPeriod) {
          case "today":
            return end.getTime() === today.getTime();
          case "this-week":
            const startW = new Date(today);
            startW.setDate(today.getDate() - today.getDay());
            const endW = new Date(startW);
            endW.setDate(startW.getDate() + 6);
            return end >= startW && end <= endW;
          case "past-due":
            return end < today;
          default:
            return true;
        }
      });
    }

    projects.sort(
      (a, b) =>
        new Date((b.updatedAt || b.createdAt) ?? 0).getTime() -
        new Date((a.updatedAt || a.createdAt) ?? 0).getTime(),
    );
    return projects;
  }, [accessibleProjects, filters, completingPeriod, startDate, endDate, getQuarterRange]);

  if (authLoading)
    return (
      <div className="flex items-center justify-center h-screen">
        {t("common.loading")}
      </div>
    );

  const dynamicResults = useDashboardRuntime(filteredProjects, savedMetrics ?? []);

  const dashboardDataContext = useMemo(() => {
    const total = filteredProjects.length;
    const active = filteredProjects.filter(p => !['closed won', 'closed lost', 'cancelled'].includes(p.status?.toLowerCase() || '')).length;
    const closedWon = filteredProjects.filter(p => p.status?.toLowerCase() === 'closed won').length;
    let totalAge = 0;
    let totalCycle = 0;
    let closedCount = 0;
    const now = new Date().getTime();
    filteredProjects.forEach(p => {
        const start = p.startDate ? new Date(p.startDate).getTime() : new Date(p.createdAt || now).getTime();
        const end = p.endDate ? new Date(p.endDate).getTime() : now;
        totalAge += (now - start);
        if (['closed won', 'closed lost'].includes(p.status?.toLowerCase() || '')) {
            closedCount++;
            totalCycle += (end - start);
        }
    });
    const avgAgeDays = total > 0 ? Math.round(totalAge / total / (1000 * 60 * 60 * 24)) : 0;
    const avgCycleDays = closedCount > 0 ? Math.round(totalCycle / closedCount / (1000 * 60 * 60 * 24)) : 0;
    const statusCounts: Record<string, number> = {};
    filteredProjects.forEach(p => {
        const s = p.status || 'Unknown';
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    return {
        projects: filteredProjects, 
        dynamicData: dynamicResults,
      kpiItems: [
        { label: t("dashboard.kpi.activeProjects"), value: active, change: 0, trend: "neutral", icon: Activity },
        { label: t("dashboard.kpi.avgAgeDays"), value: avgAgeDays, change: 0, trend: "neutral", icon: Clock },
        { label: t("dashboard.kpi.winRate"), value: total > 0 ? `${Math.round((closedWon / total) * 100)}%` : "0%", change: 0, trend: "up", icon: Trophy },
        { label: t("dashboard.kpi.avgCycleDays"), value: avgCycleDays, change: 0, trend: "down", icon: History },
      ],
      projectMetrics: {
        statusData: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
        closedData: [],
        metrics: { avgAge: avgAgeDays, avgCycle: avgCycleDays }
      }
    };
  }, [filteredProjects, dynamicResults]);

  return (
    <TooltipProvider delayDuration={2000}>
      <div className="space-y-4">
        {/* --- 1. SEARCH & FILTERS --- */}
        <SearchFiltersSection
          activeFilterCount={activeFilterCount}
          onClearFilters={clearAllFilters}
          actions={
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-my-projects"
                checked={showMyProjects}
                onCheckedChange={(checked) => setShowMyProjects(!!checked)}
              />
              <label
                htmlFor="show-my-projects"
                className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none whitespace-nowrap"
              >
                {t("dashboard.filters.showMyProjects")}
              </label>
            </div>
          }
        >
          <div
            className="space-y-4"
            onMouseEnter={() => setAdvancedFiltersHovered(true)}
            onMouseLeave={() => setAdvancedFiltersHovered(false)}
          >
            <div className={cn("grid grid-cols-1 gap-4", showTeams ? "md:grid-cols-4 xl:grid-cols-7" : "md:grid-cols-6")}>
              {showTeams && (
                <div>
                  <FilterLabel>{t("projects.teams.filterLabel")}</FilterLabel>
                  <ProjectTeamFilterSelect
                    teams={teams}
                    value={filters.team ?? "all"}
                    onChange={(val) => setFilters({ ...filters, team: val === "all" ? undefined : val })}
                    className="h-9 text-sm"
                  />
                </div>
              )}
              <div>
                <FilterLabel>{t("dashboard.filters.internalStatus")}</FilterLabel>
                <Select
                  value={getNormalizedStatusValue(statusConfigs, filters.status)}
                  onValueChange={(val) =>
                    setFilters({
                      ...filters,
                      status: val === "all-statuses" ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("dashboard.filters.allStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-statuses">{t("dashboard.filters.allStatus")}</SelectItem>
                    {statusConfigs?.map((config) => (
                      <SelectItem key={config.id} value={config.name}>
                        <div className="flex items-center gap-2">
                          {config.icon ? (
                            <DynamicIcon
                              name={config.icon}
                              className="h-4 w-4"
                              style={{ color: config.color }}
                            />
                          ) : (
                            <div
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: config.color }}
                            />
                          )}
                          <span>{config.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FilterLabel>{t("dashboard.filters.customers")}</FilterLabel>
                <Select
                  value={filters.customerName || "all-customers"}
                  onValueChange={(val) =>
                    setFilters({
                      ...filters,
                      customerName: val === "all-customers" ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("dashboard.filters.allCustomers")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-customers">{t("dashboard.filters.allCustomers")}</SelectItem>
                    {customers?.map((c) => (
                      <SelectItem key={c.id} value={c.accountName}>
                        {c.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FilterLabel>{t("dashboard.filters.accountStatus")}</FilterLabel>
                <Select
                  value={filters.customerStatus || "all-customer-status"}
                  onValueChange={(val) =>
                    setFilters({
                      ...filters,
                      customerStatus:
                        val === "all-customer-status" ? undefined : val,
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={t("dashboard.filters.allAccountStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-customer-status">
                      {t("dashboard.filters.allAccountStatus")}
                    </SelectItem>
                    {customerStatusConfigs
                      ?.filter((c) => c.isActive)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.name}>
                          <div className="flex gap-2">
                            {c.icon && (
                              <DynamicIcon
                                name={c.icon}
                                className="h-4 w-4"
                                style={{ color: c.color }}
                              />
                            )}
                            {c.name}
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FilterLabel>{t("dashboard.filters.completing")}</FilterLabel>
                <Select
                  value={completingPeriod}
                  onValueChange={setCompletingPeriod}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-projects">{t("dashboard.filters.allProjects")}</SelectItem>
                    <SelectItem value="today">{t("dashboard.filters.today")}</SelectItem>
                    <SelectItem value="this-week">{t("dashboard.filters.thisWeek")}</SelectItem>
                    <SelectItem value="past-due">{t("dashboard.filters.pastDue")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <FilterLabel>{t("projects.startDate")}</FilterLabel>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div>
                <FilterLabel>{t("projects.endDate")}</FilterLabel>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>
            <div
              className={`transition-all duration-300 ease-in-out ${showAdvancedFilters ? "max-h-[300px] opacity-100 pb-2 overflow-visible" : "max-h-0 opacity-0 overflow-hidden"}`}
            >
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 pt-2">
                <div>
                  <FilterLabel>{t("dashboard.filters.riskLevel")}</FilterLabel>
                  <Select
                    value={filters.riskLevel || "all-risk-levels"}
                    onValueChange={(val) =>
                      setFilters({
                        ...filters,
                        riskLevel: val === "all-risk-levels" ? undefined : val,
                      })
                    }
                    onOpenChange={handleDropdownOpenChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={t("dashboard.filters.allRisks")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-risk-levels">{t("dashboard.filters.allRisks")}</SelectItem>
                      <SelectItem value="Red">
                        <div className="flex gap-2">
                          <ServerCrash className="text-red-500 h-4 w-4" />
                          {t("dashboard.filters.riskRed")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Yellow">
                        <div className="flex gap-2">
                          <ServerCog className="text-yellow-500 h-4 w-4" />
                          {t("dashboard.filters.riskYellow")}
                        </div>
                      </SelectItem>
                      <SelectItem value="None">
                        <div className="flex gap-2">
                          <Server className="text-green-500 h-4 w-4" />
                          {t("dashboard.filters.riskNone")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FilterLabel>{t("dashboard.filters.ranking")}</FilterLabel>
                  <Select
                    value={filters.ranking || "all-rankings"}
                    onValueChange={(val) =>
                      setFilters({
                        ...filters,
                        ranking: val === "all-rankings" ? undefined : val,
                      })
                    }
                    onOpenChange={handleDropdownOpenChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={t("dashboard.filters.allRankings")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-rankings">{t("dashboard.filters.allRankings")}</SelectItem>
                      <SelectItem value="In Quarter">
                        <div className="flex items-center gap-2">
                          <Crosshair className="text-green-500 h-4 w-4" />
                          {t("dashboard.filters.rankingInQuarter")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Upside">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="text-blue-500 h-4 w-4" />
                          {t("dashboard.filters.rankingUpside")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Stretch">
                        <div className="flex items-center gap-2">
                          <Rocket className="text-purple-500 h-4 w-4" />
                          {t("dashboard.filters.rankingStretch")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Out Quarter">
                        <div className="flex items-center gap-2">
                          <CalendarCog className="text-orange-500 h-4 w-4" />
                          {t("dashboard.filters.rankingOutQuarter")}
                        </div>
                      </SelectItem>
                      <SelectItem value="Burn it Down">
                        <div className="flex items-center gap-2">
                          <Flame className="text-red-500 h-4 w-4" />
                          {t("dashboard.filters.rankingBurnItDown")}
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <FilterLabel>{t("dashboard.filters.solutions")}</FilterLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FilterMultiSelectButton className="h-9 text-sm">
                        {filters.solutions?.length
                          ? t("dashboard.filters.solutionsSelected", { count: filters.solutions.length })
                          : t("dashboard.filters.allSolutions")}
                      </FilterMultiSelectButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3">
                      <div className="space-y-2">
                        {products.map((p) => (
                          <div key={p.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={filters.solutions?.includes(p.name)}
                              onCheckedChange={(c) => {
                                const curr = filters.solutions || [];
                                setFilters({
                                  ...filters,
                                  solutions: c
                                    ? [...curr, p.name]
                                    : curr.filter((x) => x !== p.name),
                                });
                              }}
                            />
                            <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-4 h-4 object-contain" />
                            <label>{p.name}</label>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <FilterLabel>{t("dashboard.filters.primaryEngineer")}</FilterLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FilterMultiSelectButton className="h-9 text-sm">
                        {filters.primaryEngineer?.length
                          ? t("dashboard.filters.engineersSelected", { count: filters.primaryEngineer.length })
                          : t("dashboard.filters.allPrimaryEngineers")}
                      </FilterMultiSelectButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3">
                      <div className="space-y-2">
                        {users
                          .filter((u) => u.role === "Engineer")
                          .map((u) => (
                            <div key={u.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={filters.primaryEngineer?.includes(u.id)}
                                onCheckedChange={(c) => {
                                  const curr = filters.primaryEngineer || [];
                                  setFilters({
                                    ...filters,
                                    primaryEngineer: c
                                      ? [...curr, u.id]
                                      : curr.filter((x) => x !== u.id),
                                  });
                                }}
                              />
                              <label>{u.firstName} {u.lastName}</label>
                            </div>
                          ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <FilterLabel>{t("dashboard.filters.specialistEngineer")}</FilterLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FilterMultiSelectButton className="h-9 text-sm">
                        {filters.specialistEngineer?.length
                          ? t("dashboard.filters.engineersSelected", { count: filters.specialistEngineer.length })
                          : t("dashboard.filters.allSpecialistEngineers")}
                      </FilterMultiSelectButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3">
                      <div className="space-y-2">
                        {users
                          .filter((u) => u.role === "Engineer")
                          .map((u) => (
                            <div key={u.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={filters.specialistEngineer?.includes(u.id)}
                                onCheckedChange={(c) => {
                                  const curr = filters.specialistEngineer || [];
                                  setFilters({
                                    ...filters,
                                    specialistEngineer: c
                                      ? [...curr, u.id]
                                      : curr.filter((x) => x !== u.id),
                                  });
                                }}
                              />
                              <label>{u.firstName} {u.lastName}</label>
                            </div>
                          ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <FilterLabel>{t("dashboard.filters.environment")}</FilterLabel>
                  <Select
                    value={filters.environment || "all-environments"}
                    onValueChange={(val) =>
                      setFilters({
                        ...filters,
                        environment:
                          val === "all-environments" ? undefined : val,
                      })
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={t("dashboard.filters.environment")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-environments">{t("dashboard.filters.all")}</SelectItem>
                      <SelectItem value="CloudLAB">CloudLAB</SelectItem>
                      <SelectItem value="SaaS">SaaS</SelectItem>
                      <SelectItem value="OnPremise Production">
                        OnPremise
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </SearchFiltersSection>

        {/* ACTIVE FILTER INDICATOR */}
        {(filters.status || filters.customerName || filters.fiscalQuarter || filters.fiscalStatus) && (
          <div className="flex items-center gap-2 px-1">
            <span className="text-sm font-medium text-muted-foreground">
              {t("dashboard.filters.activeChartFilters")}
            </span>
            {filters.status && (
              <Badge
                variant="secondary"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, status: undefined }))
                }
                className="cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20"
              >
                {t("dashboard.filters.statusBadge", { status: filters.status })} <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
            {(filters.fiscalQuarter || filters.fiscalStatus) && (
              <Badge
                variant="secondary"
                onClick={() =>
                  setFilters((prev) => ({ ...prev, fiscalQuarter: undefined, fiscalStatus: undefined }))
                }
                className="cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20"
              >
                {t("dashboard.filters.fiscalBadge", {
                  quarter: filters.fiscalQuarter,
                  status: filters.fiscalStatus === 'won' ? t("dashboard.filters.fiscalStatusClosedWon")
                    : filters.fiscalStatus === 'lost' ? t("dashboard.filters.fiscalStatusClosedLost")
                    : filters.fiscalStatus === 'created' ? t("dashboard.filters.fiscalStatusCreated")
                    : t("dashboard.filters.fiscalStatusCompleted")
                })} <X className="h-3 w-3 ml-1" />
              </Badge>
            )}
          </div>
        )}

        <DashboardRenderer
          pageKey="overview"
          dataContext={dashboardDataContext}
          className="mt-4"
          onChartClick={handleChartClick}
        />

      </div>

      <ProjectDrillDownSheet
        isOpen={drillDownState.isOpen}
        onOpenChange={(open) =>
          setDrillDownState((prev) => ({ ...prev, isOpen: open }))
        }
        title={drillDownState.title}
        projects={drillDownState.projects}
      />
      <KPIDetailDrawer
        config={kpiDrawerConfig}
        onClose={() => setKpiDrawerConfig(prev => ({ ...prev, isOpen: false }))}
        projects={accessibleProjects}
        customers={customers}
        statusConfigs={statusConfigs}
        onAccountEdit={(customer) => {
          setEditingAccountCustomer(customer);
          setIsAccountEditDialogOpen(true);
        }}
      />
      <CreateCustomerDialog
        isOpen={isAccountEditDialogOpen}
        onClose={() => {
          setIsAccountEditDialogOpen(false);
          setEditingAccountCustomer(null);
        }}
        onCustomerCreated={() => {
          setIsAccountEditDialogOpen(false);
          setEditingAccountCustomer(null);
        }}
        editingCustomer={editingAccountCustomer}
      />
    </TooltipProvider>
  );
}
