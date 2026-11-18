import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { PocWithRelations, RankingConfig, RiskLevelConfig } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { usePermissions } from "@/hooks/usePermissions";
import { useCustomerStatusConfigRealtime } from "@/hooks/useConfigRealtime";
import { apiRequest } from "@/lib/queryClient";
import { calculateDaysDiff } from "@/lib/date-utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Target, CalendarHeart, CalendarClock, CalendarX2, ClipboardCheck, LayoutList, CalendarArrowUp, CalendarArrowDown, CalendarX, Server, ServerCog, ServerCrash, Rows3, Rows4 } from "lucide-react";
import { FilterLabel, FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import { TAPDrawer } from "@/components/project-detail/TAPDrawer";
import { GapDrawer } from "@/components/gap-analysis/GapDrawer";
import { AuditHistoryDrawer } from "@/components/project-detail/audit-history-drawer";
import { AssessmentAuditDrawer } from "@/components/ai-assessments/assessment-audit-drawer";
import InfrastructureDiscoveryDrawer from "@/components/accounts/InfrastructureDiscoveryDrawer";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { cn } from "@/lib/utils";
import { ProjectGroupedViews } from "./project-grouped-views";
import { ManageProjectsTable, type ManageProject, type ManageProjectAction } from "./manage-projects-table";
import { engineerName, type RIndexInfo, type TableDensity } from "./manage-projects-table-cells";
import { impactiqActivitySortValue, useImpactiqActivityColumn } from "./impactiq-activity-column";
import {
  ProjectTeamFilterSelect,
  matchesProjectTeamFilter,
  projectTeamLabel,
  useProjectTeams,
} from "@/components/teams/project-teams";

type ProjectsViewMode = "due" | "review" | "table";
const VIEW_MODE_STORAGE_KEY = "manage-projects-view-mode";
const VIEW_MODES: readonly ProjectsViewMode[] = ["due", "review", "table"];

// The Due / For Review / Table choice is a per-viewer convenience, so it
// lives in browser storage; the page falls back to Table when storage is
// unavailable or holds an unknown value.
function readStoredViewMode(): ProjectsViewMode {
  try {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return VIEW_MODES.includes(stored as ProjectsViewMode) ? (stored as ProjectsViewMode) : "table";
  } catch {
    return "table";
  }
}

function storeViewMode(mode: ProjectsViewMode): void {
  try {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // Storage blocked (private window, cleared site data): keep the in-memory choice only.
  }
}

const DENSITY_STORAGE_KEY = "manage-projects-table-density";

// Compact / Comfortable rows are a per-viewer convenience like the view
// mode; Compact is the default.
function readStoredDensity(): TableDensity {
  try {
    return window.localStorage.getItem(DENSITY_STORAGE_KEY) === "comfortable" ? "comfortable" : "compact";
  } catch {
    return "compact";
  }
}

function storeDensity(density: TableDensity): void {
  try {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Storage blocked: keep the in-memory choice only.
  }
}

type Project = ManageProject;

interface ValidationProjectsPageProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
  showMyProjects?: boolean;
}

export default function ValidationProjectsPage({ filterContainerRef, onFilterStateChange, showMyProjects }: ValidationProjectsPageProps) {
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEdit } = usePermissions();
  const canEditProjects = canEdit("project.validation");
  const canDeleteProjects = canEdit("project.validation");
  
  useCustomerStatusConfigRealtime();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [productFilter, setProductFilter] = useState<string[]>([]);
  const [rankingFilter, setRankingFilter] = useState("all");
  const [environmentFilter, setEnvironmentFilter] = useState("all");
  const [primaryEngineerFilter, setPrimaryEngineerFilter] = useState<string[]>([]);
  const [specialistEngineerFilter, setSpecialistEngineerFilter] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const { isInternal: showTeams, teams } = useProjectTeams();
  const impactiqActivities = useImpactiqActivityColumn(showTeams);
  const [sortField, setSortField] = useState<string>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ProjectsViewMode>(readStoredViewMode);

  const [density, setDensity] = useState<TableDensity>(readStoredDensity);

  const handleViewModeChange = (mode: ProjectsViewMode) => {
    setViewMode(mode);
    storeViewMode(mode);
  };

  const handleDensityChange = (next: TableDensity) => {
    setDensity(next);
    storeDensity(next);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== "all") count++;
    if (customerStatusFilter !== "all") count++;
    if (customerFilter !== "all") count++;
    if (riskFilter !== "all") count++;
    if (productFilter.length > 0) count++;
    if (rankingFilter !== "all") count++;
    if (environmentFilter !== "all") count++;
    if (primaryEngineerFilter.length > 0) count++;
    if (specialistEngineerFilter.length > 0) count++;
    if (teamFilter !== "all") count++;
    return count;
  }, [searchTerm, statusFilter, customerStatusFilter, customerFilter, riskFilter, productFilter, rankingFilter, environmentFilter, primaryEngineerFilter, specialistEngineerFilter, teamFilter]);

  const clearAllFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setCustomerStatusFilter("all");
    setCustomerFilter("all");
    setRiskFilter("all");
    setProductFilter([]);
    setRankingFilter("all");
    setEnvironmentFilter("all");
    setPrimaryEngineerFilter([]);
    setSpecialistEngineerFilter([]);
    setTeamFilter("all");
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [isTAPDrawerOpen, setIsTAPDrawerOpen] = useState(false);
  const [tapProjectId, setTapProjectId] = useState<number | null>(null);
  const [isGapDrawerOpen, setIsGapDrawerOpen] = useState(false);
  const [gapProjectId, setGapProjectId] = useState<number | null>(null);
  const [gapProjectName, setGapProjectName] = useState<string>("");
  const [gapProjectSolutions, setGapProjectSolutions] = useState<string[]>([]);
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [auditProjectId, setAuditProjectId] = useState<number | null>(null);
  const [isDiscoveryDrawerOpen, setIsDiscoveryDrawerOpen] = useState(false);
  const [discoveryCustomerId, setDiscoveryCustomerId] = useState<number | null>(null);
  const [discoveryCustomerName, setDiscoveryCustomerName] = useState<string>("");
  const [isAssessmentAuditOpen, setIsAssessmentAuditOpen] = useState(false);
  const [assessmentAuditProjectId, setAssessmentAuditProjectId] = useState<number | null>(null);
  const [assessmentAuditProjectName, setAssessmentAuditProjectName] = useState<string>("");
  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/status-configs"],
  });

  const { data: customerStatusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/customer-status-configs"],
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products"],
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ["/api/customers"],
  });

  const { data: rIndexScores = [] } = useQuery<
    Array<{ projectId: number; score: string; level: string; confidence: string | null; runAt: string | null }>
  >({
    queryKey: ["/api/risk/r-index"],
    // R-Index is internal; the server refuses outside users.
    enabled: !!user?.role && !["Customer", "Guest", "Partner"].includes(user.role),
  });

  const rIndexMap = useMemo(() => {
    const map = new Map<number, RIndexInfo>();
    rIndexScores.forEach((item) => {
      const confidence = item.confidence === null || item.confidence === undefined ? NaN : parseFloat(item.confidence);
      map.set(item.projectId, {
        score: parseFloat(item.score),
        level: item.level,
        confidence: Number.isFinite(confidence) ? confidence : null,
        runAt: item.runAt ?? null,
      });
    });
    return map;
  }, [rIndexScores]);

  const { data: users = [] } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });

  const { data: rankingConfigs = [] } = useQuery<RankingConfig[]>({
    queryKey: ["/api/ranking-configs"],
  });

  const { data: riskLevelConfigs = [] } = useQuery<RiskLevelConfig[]>({
    queryKey: ["/api/risk-level-configs"],
  });

  const products = allProducts.filter(product => product.isActive !== false);
  const engineers = users.filter((u: any) => u.role === 'Engineer');

  const getProductInfo = (solutionName: string) => {
    if (!solutionName || !solutionName.trim()) return null;
    let product = products.find((p: any) => p.name === solutionName);
    if (!product) {
      product = products.find((p: any) => p.name?.toLowerCase() === solutionName?.toLowerCase());
    }
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = products.find((p: any) => {
        const lowerProduct = p.name?.toLowerCase() || '';
        return lowerProduct.length > 0 && (lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution));
      });
    }
    return {
      name: product?.name || solutionName,
      abbreviation: product?.abbreviation ?? null,
      graphic: product?.solutionIcon ?? null,
      icon: product?.solutionIconName ?? null,
    };
  };

  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PUT", `/api/projects/${id}`, updates);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update project");
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async ({ projectId, reason }: { projectId: number; reason?: string }) => {
      return apiRequest(
        "DELETE",
        `/api/projects/${projectId}`,
        reason ? { reason } : undefined,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({ title: "Project deleted successfully" });
      setProjectToDelete(null);
    },
    onError: () => {
      showErrorToast("Failed to delete project");
    },
  });

  const handleFieldUpdate = (projectId: number, field: string, value: string) => {
    queryClient.setQueryData(["/api/projects"], (oldData: any[]) => {
      if (!oldData) return oldData;
      return oldData.map((project: any) => 
        project.id === projectId ? { ...project, [field]: value } : project
      );
    });

    updateProjectMutation.mutate({ id: projectId, updates: { [field]: value } }, {
      onSuccess: (data) => {
        queryClient.setQueryData(["/api/projects"], (oldData: any[]) => {
          if (!oldData) return oldData;
          return oldData.map((project: any) => 
            project.id === projectId ? { ...project, ...data } : project
          );
        });
      },
      onError: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // A merged column's "sort by" picker switches the field and starts ascending.
  const handlePickSortField = (field: string) => {
    setSortField(field);
    setSortDirection("asc");
  };

  const findProjectAccount = (poc: Project): { id: number; accountName?: string } | undefined =>
    poc.customerId
      ? customers.find((c: any) => c.id === poc.customerId)
      : customers.find((c: any) => c.accountName === poc.customerName);

  const canUseEngineerTools = !!user?.role && ["engineer", "admin"].includes(user.role.toLowerCase());

  const handleTableAction = (action: ManageProjectAction, poc: Project, solutions: string[]) => {
    switch (action) {
      case "view":
        setLocation(`/project/${poc.id}?source=projects`);
        return;
      case "coach":
        setLocation(`/project/${poc.id}?source=projects&tab=projectiq-coach`);
        return;
      case "edit":
        setLocation(`/edit-project/${poc.id}?source=projects`);
        return;
      case "assessment":
        setAssessmentAuditProjectId(poc.id);
        setAssessmentAuditProjectName(poc.customerName || t("projects.manageTable.projectFallbackName", { id: poc.id }));
        setIsAssessmentAuditOpen(true);
        return;
      case "plan":
        setSelectedProjectId(poc.id);
        setIsMapDrawerOpen(true);
        return;
      case "tap":
        setTapProjectId(poc.id);
        setIsTAPDrawerOpen(true);
        return;
      case "gaps":
        setGapProjectId(poc.id);
        setGapProjectName(poc.customerName);
        setGapProjectSolutions(solutions);
        setIsGapDrawerOpen(true);
        return;
      case "discovery": {
        const account = findProjectAccount(poc);
        if (account) {
          setDiscoveryCustomerId(account.id);
          setDiscoveryCustomerName(account.accountName || poc.customerName);
          setIsDiscoveryDrawerOpen(true);
        }
        return;
      }
      case "audit":
        setAuditProjectId(poc.id);
        setIsAuditDrawerOpen(true);
        return;
      case "delete":
        setProjectToDelete(poc.id);
        return;
    }
  };

  const filteredAndSortedProjects = useMemo(() => {
    let filtered = projects.filter((project: any) => {
      if (showMyProjects && user?.id) {
        const userId = user.id.toString();
        const isPrimary = project.primarySe?.id?.toString() === userId;
        const isSpecialist = project.specialistSe?.id?.toString() === userId;
        const isOpportunity = project.opportunityEngineerId?.toString() === userId;
        const isSupporting =
          (Array.isArray(project.supportingEngineers) && project.supportingEngineers.map((x: any) => x?.toString()).includes(userId)) ||
          (Array.isArray(project.supportingEngineerIds) && project.supportingEngineerIds.map((x: any) => x?.toString()).includes(userId));
        if (!isPrimary && !isSpecialist && !isOpportunity && !isSupporting) return false;
      }

      const matchesSearch = !searchTerm || 
        project.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.solutionName?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || project.status?.toLowerCase() === statusFilter.toLowerCase();
      const matchesCustomerStatus = customerStatusFilter === "all" || project.customerStatus?.toLowerCase() === customerStatusFilter.toLowerCase();
      const matchesCustomer = customerFilter === "all" || project.customerName === customerFilter;
      const matchesRisk = riskFilter === "all" || project.risk === riskFilter;
      const matchesRanking = rankingFilter === "all" || project.ranking === rankingFilter;
      const matchesEnvironment = environmentFilter === "all" || project.environment === environmentFilter;
      const matchesProduct = productFilter.length === 0 || 
        (project.successCriteria && project.successCriteria.some((criteria: any) => productFilter.includes(criteria.productName)));
      const matchesPrimaryEngineer = primaryEngineerFilter.length === 0 || 
        (project.primarySe && primaryEngineerFilter.includes(project.primarySe.id?.toString()));
      const matchesSpecialistEngineer = specialistEngineerFilter.length === 0 || 
        (project.specialistSe && specialistEngineerFilter.includes(project.specialistSe.id?.toString()));

      const matchesTeam = matchesProjectTeamFilter(project, teamFilter);

      return matchesSearch && matchesStatus && matchesCustomerStatus && matchesCustomer && matchesRisk && matchesRanking && matchesEnvironment && matchesProduct && matchesPrimaryEngineer && matchesSpecialistEngineer && matchesTeam;
    });

    filtered.sort((a: any, b: any) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      if (sortField === "impactiqActivities") {
        const aCount = impactiqActivitySortValue(impactiqActivities, a.id);
        const bCount = impactiqActivitySortValue(impactiqActivities, b.id);
        return sortDirection === "asc" ? aCount - bCount : bCount - aCount;
      } else if (sortField === "rIndex") {
        const aScore = rIndexMap.get(a.id)?.score ?? -1;
        const bScore = rIndexMap.get(b.id)?.score ?? -1;
        return sortDirection === "asc" ? aScore - bScore : bScore - aScore;
      } else if (sortField === "team") {
        aValue = projectTeamLabel(teams, a);
        bValue = projectTeamLabel(teams, b);
      } else if (sortField === "primarySe" || sortField === "specialistSe") {
        aValue = engineerName(a[sortField]);
        bValue = engineerName(b[sortField]);
      } else if (sortField === "status" || sortField === "customerStatus" || sortField === "type" || sortField === "environment") {
        aValue = a[sortField] || "";
        bValue = b[sortField] || "";
      } else if (sortField === "endDate") {
        const dateA = a.endDate ? new Date(a.endDate) : null;
        const dateB = b.endDate ? new Date(b.endDate) : null;
        if (!dateA && !dateB) return 0;
        if (!dateA) return sortDirection === "asc" ? -1 : 1;
        if (!dateB) return sortDirection === "asc" ? 1 : -1;
        return sortDirection === "asc" ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      }

      if (typeof aValue === "string") {
        aValue = aValue.toLowerCase();
        bValue = (bValue || "").toLowerCase();
      }

      return sortDirection === "asc" ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
    });

    return filtered;
  }, [projects, searchTerm, statusFilter, customerStatusFilter, customerFilter, riskFilter, rankingFilter, environmentFilter, productFilter, primaryEngineerFilter, specialistEngineerFilter, teamFilter, teams, sortField, sortDirection, rIndexMap, impactiqActivities, showMyProjects, user]);

  const totalPages = Math.ceil(filteredAndSortedProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = filteredAndSortedProjects.slice(startIndex, endIndex);

  const getDueDateCounts = useMemo(() => {
    const userTimezone = user?.timezone || 'America/New_York';
    let dueToday = 0, dueThisWeek = 0, overdue = 0;

    filteredAndSortedProjects.forEach((project: any) => {
      if (!project.endDate) return;
      const daysDiff = calculateDaysDiff(project.endDate, userTimezone);
      if (daysDiff === 0) dueToday++;
      else if (daysDiff > 0 && daysDiff <= 7) dueThisWeek++;
      else if (daysDiff < 0) {
        const status = project.status?.toLowerCase();
        if (!['closed won', 'closed lost', 'cancelled'].includes(status || '')) overdue++;
      }
    });

    return { dueToday, dueThisWeek, overdue };
  }, [filteredAndSortedProjects, user?.timezone]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, customerStatusFilter, customerFilter, riskFilter, rankingFilter, environmentFilter, productFilter, primaryEngineerFilter, specialistEngineerFilter, teamFilter]);

  const uniqueCustomers = [...new Set(projects.map((project: any) => project.customerName))];
  const sortConfig = { key: sortField, direction: sortDirection };

  const filterContent = (
    <div className={cn("grid grid-cols-1 gap-3", showTeams ? "md:grid-cols-5 xl:grid-cols-10" : "md:grid-cols-9")}>
      <div>
        <FilterLabel>Customer</FilterLabel>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {uniqueCustomers.map((customer: string) => (
              <SelectItem key={customer} value={customer}>{customer}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Internal Status</FilterLabel>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Internal Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {statusConfigs.map((status: any) => (
              <SelectItem key={status.id} value={status.name}>
                <div className="flex items-center gap-2">
                  {status.icon && status.icon.trim() ? (
                    <DynamicIcon name={status.icon} className="h-4 w-4" style={{ color: status.color }} />
                  ) : (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }} />
                  )}
                  {status.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Account Status</FilterLabel>
        <Select value={customerStatusFilter} onValueChange={setCustomerStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {customerStatusConfigs.filter((config: any) => config.isActive).map((config: any) => (
              <SelectItem key={config.id} value={config.name}>
                <div className="flex items-center gap-2">
                  {config.icon && <DynamicIcon name={config.icon} className="h-4 w-4" style={{ color: config.color }} />}
                  {config.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Risk Level</FilterLabel>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Risk Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk Levels</SelectItem>
            <SelectItem value="Red">
              <div className="flex items-center gap-2">
                <ServerCrash className="h-4 w-4 text-red-500" />
                Red
              </div>
            </SelectItem>
            <SelectItem value="Yellow">
              <div className="flex items-center gap-2">
                <ServerCog className="h-4 w-4 text-yellow-500" />
                Yellow
              </div>
            </SelectItem>
            <SelectItem value="None">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-green-500" />
                None
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Ranking</FilterLabel>
        <Select value={rankingFilter} onValueChange={setRankingFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Rankings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rankings</SelectItem>
            <SelectItem value="In Quarter">
              <div className="flex items-center gap-2">
                <CalendarHeart className="h-4 w-4 text-green-600" />
                <span>In Quarter</span>
              </div>
            </SelectItem>
            <SelectItem value="Upside">
              <div className="flex items-center gap-2">
                <CalendarArrowUp className="h-4 w-4 text-blue-600" />
                <span>Upside</span>
              </div>
            </SelectItem>
            <SelectItem value="Stretch">
              <div className="flex items-center gap-2">
                <CalendarArrowDown className="h-4 w-4 text-yellow-600" />
                <span>Stretch</span>
              </div>
            </SelectItem>
            <SelectItem value="Out Quarter">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-orange-600" />
                <span>Out Quarter</span>
              </div>
            </SelectItem>
            <SelectItem value="Burn it Down">
              <div className="flex items-center gap-2">
                <CalendarX className="h-4 w-4 text-red-600" />
                <span>Burn it Down</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Solutions</FilterLabel>
        <Popover>
          <PopoverTrigger asChild>
            <FilterMultiSelectButton className="h-9 text-sm">
              Solutions {productFilter.length > 0 && `(${productFilter.length})`}
            </FilterMultiSelectButton>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-medium">Select Solutions</h4>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {products.map((product: any) => (
                  <div key={product.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`solution-${product.id}`}
                      checked={productFilter.includes(product.name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setProductFilter([...productFilter, product.name]);
                        } else {
                          setProductFilter(productFilter.filter(s => s !== product.name));
                        }
                      }}
                    />
                    <label htmlFor={`solution-${product.id}`} className="text-sm flex items-center gap-2">
                      <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-4 h-4" />
                      {product.name}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {showTeams && (
        <div>
          <FilterLabel>{t("projects.teams.filterLabel")}</FilterLabel>
          <ProjectTeamFilterSelect teams={teams} value={teamFilter} onChange={setTeamFilter} className="h-9 text-sm" />
        </div>
      )}
      <div>
        <FilterLabel>Environment</FilterLabel>
        <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Environments</SelectItem>
            <SelectItem value="CloudLAB">CloudLAB</SelectItem>
            <SelectItem value="OnPremise Production">OnPremise Production</SelectItem>
            <SelectItem value="OnPremise PreProd">OnPremise PreProd</SelectItem>
            <SelectItem value="SaaS">SaaS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Primary Engineer</FilterLabel>
        <Popover>
          <PopoverTrigger asChild>
            <FilterMultiSelectButton className="h-9 text-sm">
              {primaryEngineerFilter.length > 0 ? `${primaryEngineerFilter.length} selected` : "All Primary Engineers"}
            </FilterMultiSelectButton>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-4">
              <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-3">Select Primary Engineers</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {engineers.map((engineer: any) => (
                  <div key={engineer.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`primary-${engineer.id}`}
                      checked={primaryEngineerFilter.includes(engineer.id?.toString())}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setPrimaryEngineerFilter([...primaryEngineerFilter, engineer.id?.toString()]);
                        } else {
                          setPrimaryEngineerFilter(primaryEngineerFilter.filter(id => id !== engineer.id?.toString()));
                        }
                      }}
                    />
                    <Label htmlFor={`primary-${engineer.id}`} className="text-sm font-normal">
                      {engineer.firstName && engineer.lastName ? `${engineer.firstName} ${engineer.lastName}` : engineer.email}
                    </Label>
                  </div>
                ))}
              </div>
              {primaryEngineerFilter.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setPrimaryEngineerFilter([])} className="mt-3 w-full">
                  Clear Selection
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div>
        <FilterLabel>Specialist Engineer</FilterLabel>
        <Popover>
          <PopoverTrigger asChild>
            <FilterMultiSelectButton className="h-9 text-sm">
              {specialistEngineerFilter.length > 0 ? `${specialistEngineerFilter.length} selected` : "All Specialist Engineers"}
            </FilterMultiSelectButton>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <div className="p-4">
              <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 mb-3">Select Specialist Engineers</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {engineers.map((engineer: any) => (
                  <div key={engineer.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`specialist-${engineer.id}`}
                      checked={specialistEngineerFilter.includes(engineer.id?.toString())}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSpecialistEngineerFilter([...specialistEngineerFilter, engineer.id?.toString()]);
                        } else {
                          setSpecialistEngineerFilter(specialistEngineerFilter.filter(id => id !== engineer.id?.toString()));
                        }
                      }}
                    />
                    <Label htmlFor={`specialist-${engineer.id}`} className="text-sm font-normal">
                      {engineer.firstName && engineer.lastName ? `${engineer.firstName} ${engineer.lastName}` : engineer.email}
                    </Label>
                  </div>
                ))}
              </div>
              {specialistEngineerFilter.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setSpecialistEngineerFilter([])} className="mt-3 w-full">
                  Clear Selection
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <>
        {filterContainerRef?.current && createPortal(filterContent, filterContainerRef.current)}
        
        <Card className="@container relative overflow-hidden">
          <DecorativeCardIcon icon={Target} />
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center justify-between gap-2 text-2xl">
              <div className="flex items-center gap-2">
                <Target data-title-icon className="h-5 w-5" />
                {t("dashboard.table.recentProjects", { count: filteredAndSortedProjects.length })}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
              {viewMode === "table" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={t(`projects.manageTable.densityToggle_${density}`)}
                      data-testid="button-projects-density-toggle"
                      data-density={density}
                      onClick={() => handleDensityChange(density === "compact" ? "comfortable" : "compact")}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      {density === "compact" ? <Rows4 className="h-4 w-4" /> : <Rows3 className="h-4 w-4" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">{t(`projects.manageTable.densityToggle_${density}`)}</TooltipContent>
                </Tooltip>
              )}
              <div
                role="group"
                aria-label={t("dashboard.table.viewSwitcher")}
                className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                {(
                  [
                    { key: "due", hint: t("dashboard.table.viewDueHint"), Icon: CalendarClock },
                    { key: "review", hint: t("dashboard.table.viewReviewHint"), Icon: ClipboardCheck },
                    { key: "table", hint: t("dashboard.table.viewTableHint"), Icon: LayoutList },
                  ] as const
                ).map(({ key, hint, Icon }) => (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-pressed={viewMode === key}
                        aria-label={hint}
                        data-testid={`button-projects-view-${key}`}
                        onClick={() => handleViewModeChange(key)}
                        className={cn(
                          "flex h-8 w-9 items-center justify-center transition-colors",
                          viewMode === key
                            ? "bg-primary text-primary-foreground"
                            : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">{hint}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              </div>
            </CardTitle>
            <CardDescription className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CalendarHeart className="h-4 w-4 text-green-600" />
                <span className="text-gray-600 dark:text-gray-400">{t("dashboard.table.dueToday")}</span>
                <span className="font-bold text-green-600">{getDueDateCounts.dueToday}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-orange-600" />
                <span className="text-gray-600 dark:text-gray-400">{t("dashboard.table.dueThisWeek")}</span>
                <span className="font-bold text-orange-600">{getDueDateCounts.dueThisWeek}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarX2 className="h-4 w-4 text-red-600" />
                <span className="text-gray-600 dark:text-gray-400">{t("dashboard.table.overdue")}</span>
                <span className="font-bold text-red-600">{getDueDateCounts.overdue}</span>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            {isLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : viewMode !== "table" ? (
              <ProjectGroupedViews
                mode={viewMode}
                projects={filteredAndSortedProjects as unknown as PocWithRelations[]}
                userTimezone={user?.timezone || "America/New_York"}
                statusConfigs={statusConfigs}
                customerStatusConfigs={customerStatusConfigs}
                products={products}
                rankingConfigs={rankingConfigs}
                riskLevelConfigs={riskLevelConfigs}
                onViewProject={(id) => setLocation(`/project/${id}?source=projects`)}
                onViewPlan={(id) => setLocation(`/project/${id}?source=projects&tab=map`)}
              />
            ) : filteredAndSortedProjects.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 mb-4">
                  <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-lg mx-auto mb-4 flex items-center justify-center">
                    <Plus className="h-8 w-8" />
                  </div>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t("projects.manageTable.empty.title")}</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {projects.length === 0
                    ? t("projects.manageTable.empty.firstProject")
                    : showMyProjects
                      ? t("projects.manageTable.empty.noneOfYours")
                      : t("projects.manageTable.empty.noMatch")}
                </p>
                <Button onClick={() => setLocation("/create")}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("projects.manageTable.empty.create")}
                </Button>
              </div>
            ) : (
              <>
                <ManageProjectsTable
                  projects={paginatedProjects}
                  density={density}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onPickSortField={handlePickSortField}
                  showTeams={showTeams}
                  teams={teams}
                  impactiqActivities={impactiqActivities}
                  rIndexMap={rIndexMap}
                  statusConfigs={statusConfigs}
                  customerStatusConfigs={customerStatusConfigs}
                  riskLevelConfigs={riskLevelConfigs}
                  rankingConfigs={rankingConfigs}
                  timezone={user?.timezone ?? undefined}
                  canEditProjects={canEditProjects}
                  canDeleteProjects={canDeleteProjects}
                  canUseEngineerTools={canUseEngineerTools}
                  getProductInfo={getProductInfo}
                  getAccountId={(poc) => findProjectAccount(poc)?.id}
                  onFieldUpdate={handleFieldUpdate}
                  onAction={handleTableAction}
                />

                <TablePaginationFooter
                  totalItems={filteredAndSortedProjects.length}
                  pageSize={itemsPerPage}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  entityLabel="projects"
                />
              </>
            )}
          </CardContent>
        </Card>

        {selectedProjectId && (
          <MapDrawer
            key={`map-${selectedProjectId}`}
            projectId={selectedProjectId}
            open={isMapDrawerOpen}
            onOpenChange={(open) => {
              setIsMapDrawerOpen(open);
              if (!open) setSelectedProjectId(null);
            }}
            accessLevel={canEditProjects ? 'edit' : 'view'}
          />
        )}

        {tapProjectId && (
          <TAPDrawer
            key={`tap-${tapProjectId}`}
            projectId={tapProjectId}
            open={isTAPDrawerOpen}
            onOpenChange={(open) => {
              setIsTAPDrawerOpen(open);
              if (!open) setTapProjectId(null);
            }}
          />
        )}

        {gapProjectId && (
          <GapDrawer
            key={`gap-${gapProjectId}`}
            projectId={gapProjectId}
            projectName={gapProjectName}
            projectSolutions={gapProjectSolutions}
            open={isGapDrawerOpen}
            onOpenChange={(open) => {
              setIsGapDrawerOpen(open);
              if (!open) setGapProjectId(null);
            }}
          />
        )}

        {auditProjectId && (
          <AuditHistoryDrawer
            key={`audit-${auditProjectId}`}
            projectId={auditProjectId}
            open={isAuditDrawerOpen}
            onOpenChange={(open) => {
              setIsAuditDrawerOpen(open);
              if (!open) setAuditProjectId(null);
            }}
          />
        )}

        {discoveryCustomerId && (
          <InfrastructureDiscoveryDrawer
            key={`discovery-${discoveryCustomerId}`}
            customerId={discoveryCustomerId}
            customerName={discoveryCustomerName}
            open={isDiscoveryDrawerOpen}
            onOpenChange={(open: boolean) => {
              setIsDiscoveryDrawerOpen(open);
              if (!open) {
                setDiscoveryCustomerId(null);
                setDiscoveryCustomerName("");
              }
            }}
          />
        )}

        {assessmentAuditProjectId && (
          <AssessmentAuditDrawer
            key={`assessment-audit-${assessmentAuditProjectId}`}
            projectId={assessmentAuditProjectId}
            projectName={assessmentAuditProjectName}
            open={isAssessmentAuditOpen}
            onOpenChange={(open) => {
              setIsAssessmentAuditOpen(open);
              if (!open) setAssessmentAuditProjectId(null);
            }}
          />
        )}

        <ConfirmationDialog
          open={projectToDelete !== null}
          onOpenChange={(open) => { if (!open) setProjectToDelete(null); }}
          onConfirm={(reason) => {
            if (projectToDelete) {
              deleteProjectMutation.mutate({ projectId: projectToDelete, reason });
            }
          }}
          title="Delete Project"
          description="Are you sure you want to delete this project? This action cannot be undone."
          confirmLabel="Delete"
          variant="destructive"
          collectReason
          reasonLabel="Reason for archiving"
          reasonPlaceholder="Briefly explain why this project is being archived (optional)"
        />
      </>
    </TooltipProvider>
  );
}
