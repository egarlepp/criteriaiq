import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  Over,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Image as ImageIcon,
  Link,
  RotateCcw,
  Save,
  Search,
  Share2,
  ShieldAlert,
  SquareKanban,
  User,
  X,
  Download,
  AlertTriangle,
  Filter,
  Activity,
  PencilRuler,
  FolderKanban,
  Users,
  UserCircle,
  Table,
  Clock,
  Briefcase,
  Rows,
  Landmark,
  Building
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { NO_TEAM_FILTER } from "@/components/teams/user-teams";
import { matchesProjectTeamFilter, useProjectTeams } from "@/components/teams/project-teams";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { WebSocketManager } from "@/lib/websocket-manager";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

import {
  Project,
  StatusDimension,
  StatusOption,
  SwimlaneDimension,
  NonEditableDimension,
  FilterColumn,
  TagConfig,
  TagsLookup,
  AuditEvent,
  ProjectBoardProps,
  DISPLAY_NAME_BY_EDITABLE_DIM,
  DISPLAY_NAME_BY_NON_EDITABLE,
  statusFieldByDimension,
} from "./project-board-types";

import { isEngineerOnProject } from "@/lib/project-access-utils";
import {
  fetchProjects,
  updateProjectStatus,
  persistOrder,
  persistColumnOrder,
  loadUserColumnOrder,
  persistAudit,
  groupByField,
  timeAgo,
  humanMoney,
  sum,
  statusLabel,
  friendlyDim,
  copyToClipboard,
  getAcvBandBackgroundColor,
  getRandomPastelColor,
  hexToRgb,
  download,
  loadHtml2Canvas,
  loadJsPDF,
  convertConfigsToStatusOptions,
} from "./project-board-utils";

import {
  DirtyDot,
  IconToggleSwitch,
  ProjectStatsView,
  ColumnShell,
  Column,
  DraggableProjectCard,
  ProjectCard,
  ErrorBoundary,
} from "./project-board-components";

export type { Project, StatusDimension, StatusOption, SwimlaneDimension, NonEditableDimension, FilterColumn, TagConfig, TagsLookup };

export default function App({ filterContainerRef, onFilterStateChange, showMyProjects }: ProjectBoardProps) {
  return (
    <ErrorBoundary>
      <KanbanBoardPage filterContainerRef={filterContainerRef} onFilterStateChange={onFilterStateChange} showMyProjects={showMyProjects} />
    </ErrorBoundary>
  );
}

function KanbanBoardPage({ filterContainerRef, onFilterStateChange, showMyProjects }: ProjectBoardProps) {
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const queryClient = useQueryClient();
  
  const currentUserId = user?.id || "";
  const isAdmin = true;
  const canEditProjects = canEdit("project.validation");

  const [mode, setMode] = useState<"editable" | "nonEditable">("editable");
  const [dimension, setDimension] = useState<StatusDimension>("internal");
  const [view, setView] = useState<"all" | "mine">("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [showAudit, setShowAudit] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  
  const [filterSeOverload, setFilterSeOverload] = useState(false);
  const [filterMissingCoverage, setFilterMissingCoverage] = useState(false);
  const [filterRepSePairing, setFilterRepSePairing] = useState(false);
  const [filterRepSePairingRepId, setFilterRepSePairingRepId] = useState<string | null>(null);
  const [filterRepSePairingSearch, setFilterRepSePairingSearch] = useState("");
  const [filterOverEngineer, setFilterOverEngineer] = useState(false);
  const [filterOverEngineerCount, setFilterOverEngineerCount] = useState<number>(2);
  
  const [filterStaleOpportunities, setFilterStaleOpportunities] = useState(false);
  const [filterHighValueLowActivity, setFilterHighValueLowActivity] = useState(false);
  const [filterNoCurrentSituation, setFilterNoCurrentSituation] = useState(false);
  
  const [filterMultiProduct, setFilterMultiProduct] = useState(false);
  const [filterMultiProductCounts, setFilterMultiProductCounts] = useState<Set<string>>(new Set());
  const [filterCompetitorPresence, setFilterCompetitorPresence] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProjectId, setDrawerProjectId] = useState<string | null>(null);
  const [swimlaneDim, setSwimlaneDim] = useState<SwimlaneDimension>("none");

  const [compactMode, setCompactMode] = useState(false);

  const [industryFilter, setIndustryFilter] = useState<number | null>(null);
  const [regionFilters, setRegionFilters] = useState<string[]>([]);
  const [teamFilter, setTeamFilter] = useState("all");
  const { isInternal, teams } = useProjectTeams();
  // The board is for staff only (the kanban endpoint refuses outside users).
  const showTeams = isInternal;
  const { t } = useTranslation();
  const teamFilterControl = showTeams ? (
    <div>
      <FilterLabel>{t("projects.teams.filterLabel")}</FilterLabel>
      <div className="relative group">
        <select
          className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          title={t("projects.teams.filterTooltip")}
          data-testid="select-board-team-filter"
        >
          <option value="all">{t("teams.users.allTeams")}</option>
          <option value={NO_TEAM_FILTER}>{t("projects.teams.noTeam")}</option>
          {teams.map((team) => (
            <option key={team.id} value={String(team.id)}>{team.name}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
      </div>
    </div>
  ) : null;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query) count++;
    if (view !== "all") count++;
    if (filterSeOverload) count++;
    if (filterMissingCoverage) count++;
    if (filterRepSePairing) count++;
    if (filterOverEngineer) count++;
    if (filterStaleOpportunities) count++;
    if (filterHighValueLowActivity) count++;
    if (filterNoCurrentSituation) count++;
    if (filterMultiProduct) count++;
    if (industryFilter !== null) count++;
    if (regionFilters.length > 0) count++;
    if (teamFilter !== "all") count++;
    return count;
  }, [query, view, filterSeOverload, filterMissingCoverage, filterRepSePairing, 
      filterOverEngineer, filterStaleOpportunities, filterHighValueLowActivity, 
      filterNoCurrentSituation, filterMultiProduct, industryFilter, regionFilters, teamFilter]);

  const clearAllFilters = () => {
    setQuery("");
    setView("all");
    setFilterSeOverload(false);
    setFilterMissingCoverage(false);
    setFilterRepSePairing(false);
    setFilterRepSePairingRepId(null);
    setFilterOverEngineer(false);
    setFilterStaleOpportunities(false);
    setFilterHighValueLowActivity(false);
    setFilterNoCurrentSituation(false);
    setFilterMultiProduct(false);
    setFilterMultiProductCounts(new Set());
    setIndustryFilter(null);
    setRegionFilters([]);
    setTeamFilter("all");
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  const [showDimensionConfirm, setShowDimensionConfirm] = useState(false);
  const [pendingDimension, setPendingDimension] = useState<StatusDimension | null>(null);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingMode, setPendingMode] = useState<"editable" | "nonEditable" | null>(null);

  const { data: allUsers = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: drawerOpen || showAudit,
    select: (users: any[]) => {
      return users.map((u: any) => ({
        id: String(u.id),
        role: u.role || "User",
        name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email
      }));
    },
  });

  const { data: salesUsers = [] } = useQuery({
    queryKey: ["/api/users/sales-active"],
    queryFn: async () => {
      const response = await fetch("/api/users?role=Sales&isActive=true");
      if (!response.ok) return [];
      const users = await response.json();
      return users
        .filter((u: any) => u.isActive !== false && u.role === "Sales")
        .map((u: any) => ({
          id: String(u.id),
          name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}`.trim() : u.email,
          email: u.email || ""
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
    enabled: filterRepSePairing || showAdvancedFilters,
  });

  const { data: backendAuditEvents = [] } = useQuery({
    queryKey: ["/api/board-audit", dimension],
    queryFn: async () => {
      try {
        const response = await fetch(`/api/board-audit?dimension=${dimension}&limit=100`);
        if (!response.ok) return [];
        const events = await response.json();
        return events.map((e: any) => ({
          ts: new Date(e.createdAt).getTime(),
          user: e.userId,
          type: e.eventType === 'move' ? 'move' : e.eventType === 'reorder' ? 'reorder' : 'columns-reorder',
          projectId: e.projectId,
          dim: e.dimension as StatusDimension,
          from: e.fromStatus,
          to: e.toStatus,
          statusId: e.fromStatus,
          ids: [],
          order: []
        }));
      } catch (error) {
        console.error("Failed to fetch audit events:", error);
        return [];
      }
    },
    enabled: showAudit,
  });

  const { data: projectStatusConfigs = null } = useQuery({
    queryKey: ["/api/status-configs"],
    queryFn: async () => {
      try {
        const configs: any[] = await apiRequest("GET", "/api/status-configs");
        return configs;
      } catch (error) {
        console.error("Failed to fetch status configs:", error);
        return null;
      }
    },
  });

  const { data: riskLevelConfigs = null } = useQuery({
    queryKey: ["/api/risk-level-configs"],
    queryFn: async () => {
      try {
        const configs: any[] = await apiRequest("GET", "/api/risk-level-configs");
        return configs;
      } catch (error) {
        console.error("Failed to fetch risk level configs:", error);
        return null;
      }
    },
  });

  const { data: rankingConfigs = null } = useQuery({
    queryKey: ["/api/ranking-configs"],
    queryFn: async () => {
      try {
        const configs: any[] = await apiRequest("GET", "/api/ranking-configs");
        return configs;
      } catch (error) {
        console.error("Failed to fetch ranking configs:", error);
        return null;
      }
    },
  });

  const { data: customerStatusConfigs = null } = useQuery({
    queryKey: ["/api/customer-status-configs"],
    queryFn: async () => {
      try {
        const configs: any[] = await apiRequest("GET", "/api/customer-status-configs");
        return configs;
      } catch (error) {
        console.error("Failed to fetch customer status configs:", error);
        return null;
      }
    },
  });

  const { data: roles = [] } = useQuery({
    queryKey: ["/api/roles"],
    queryFn: async () => {
      try {
        const rolesData: any[] = await apiRequest("GET", "/api/roles");
        return rolesData;
      } catch (error) {
        console.error("Failed to fetch roles:", error);
        return [];
      }
    },
  });

  const { data: industries = [] } = useQuery({
    queryKey: ["/api/industries"],
    queryFn: async () => {
      try {
        const industriesData: any[] = await apiRequest("GET", "/api/industries");
        return industriesData;
      } catch (error) {
        console.error("Failed to fetch industries:", error);
        return [];
      }
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      try {
        const productsData: any[] = await apiRequest("GET", "/api/products");
        return productsData;
      } catch (error) {
        console.error("Failed to fetch products:", error);
        return [];
      }
    },
  });

  const { data: tagConfigs = [] } = useQuery({
    queryKey: ["/api/tags"],
    queryFn: async () => {
      try {
        const tagsData: TagConfig[] = await apiRequest("GET", "/api/tags");
        return tagsData;
      } catch (error) {
        console.error("Failed to fetch tags:", error);
        return [];
      }
    },
  });

  const tagsLookup: TagsLookup = useMemo(() => {
    const lookup: TagsLookup = {};
    tagConfigs.forEach((tag: TagConfig) => {
      lookup[tag.name] = tag.color || "#6B7280";
    });
    return lookup;
  }, [tagConfigs]);

  const configLookupMap = useMemo(() => {
    return {
      internal: projectStatusConfigs ? convertConfigsToStatusOptions(projectStatusConfigs, 'internal') : [],
      risk: riskLevelConfigs ? convertConfigsToStatusOptions(riskLevelConfigs, 'risk') : [],
      ranking: rankingConfigs ? convertConfigsToStatusOptions(rankingConfigs, 'ranking') : []
    };
  }, [projectStatusConfigs, riskLevelConfigs, rankingConfigs]);

  const statusList = useMemo(() => {
    return configLookupMap[dimension];
  }, [dimension, configLookupMap]);

  const [dndMounted, setDndMounted] = useState(true);
  const [dndEpoch, setDndEpoch] = useState(0);

  const [nonEditableDim, setNonEditableDim] = useState<NonEditableDimension>("acvBands");
  const [byAccountPage, setByAccountPage] = useState(0);
  const ACCOUNTS_PER_PAGE = 10;
  const [acvFilters, setAcvFilters] = useState<FilterColumn[]>([
    { id: "acv-1", label: "$0–10k", filter: { type: "acvBands", min: 0, max: 10000 } },
    { id: "acv-2", label: "$10k–25k", filter: { type: "acvBands", min: 10000.01, max: 25000 } },
    { id: "acv-3", label: "$25k–75k", filter: { type: "acvBands", min: 25000.01, max: 75000 } },
    { id: "acv-4", label: "$75k–100k", filter: { type: "acvBands", min: 75000.01, max: 100000 } },
    { id: "acv-5", label: "$100k–200k", filter: { type: "acvBands", min: 100000.01, max: 200000 } },
    { id: "acv-6", label: "$200k–500k", filter: { type: "acvBands", min: 200000.01, max: 500000 } },
    { id: "acv-7", label: "$500k–1m", filter: { type: "acvBands", min: 500000.01, max: 1000000 } },
    { id: "acv-8", label: "$1m+", filter: { type: "acvBands", min: 1000000.01, max: Number.MAX_SAFE_INTEGER } },
  ]);

  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [undoMap, setUndoMap] = useState<Record<string, { fromStatus: string; fromIndex: number }>>({});
  const [pendingStatus, setPendingStatus] = useState<Record<StatusDimension, Record<string, string>>>({ internal: {}, risk: {}, ranking: {} });

  // Optimistic drag-drop: immediate per-card status PATCH with rollback on failure
  const [isDndTransitionPending, startDndTransition] = useTransition();
  const pendingStatusForDim = useMemo(
    () => pendingStatus[dimension] || ({} as Record<string, string>),
    [pendingStatus, dimension]
  );
  const [optimisticDragStatuses, applyOptimisticDragStatus] = useOptimistic(
    pendingStatusForDim,
    (cur: Record<string, string>, { cardId, status }: { cardId: string; status: string }) => ({ ...cur, [cardId]: status })
  );

  const [order, setOrder] = useState<Record<StatusDimension, Record<string, string[]>>>({ internal: {}, risk: {}, ranking: {} });
  // The value saved for a column: the configured Internal Status name
  // ("In Progress"), not its lowercased column id.
  const statusValueForColumn = (columnId: string): string =>
    dimension === "internal" ? (statusList.find((s) => s.id === columnId)?.label ?? columnId) : columnId;
  const baselineOrderRef = useRef<Record<StatusDimension, Record<string, string[]>> | null>(null);
  const [columnOrder, setColumnOrder] = useState<Record<StatusDimension, string[]>>({ internal: [], risk: [], ranking: [] });
  const baselineColumnOrderRef = useRef<Record<StatusDimension, string[]> | null>(null);
  const [collapsedByColumn, setCollapsedByColumn] = useState<Record<string, boolean>>({}); 

  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveDelaySec, setAutoSaveDelaySec] = useState(20);
  const [statsOpenByColumn, setStatsOpenByColumn] = useState<Record<string, boolean>>({});

  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditTypes, setAuditTypes] = useState<{ move: boolean; reorder: boolean; columns: boolean }>({ move: true, reorder: false, columns: false });
  const [auditTimeRange, setAuditTimeRange] = useState<"7d" | "30d" | "all">("all");

  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSaveChangesRef = useRef<() => Promise<void>>(async () => {});

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const columnElsRef = useRef<Record<string, HTMLElement | null>>({});
  const columnScrollRef = useRef<Record<string, number>>({});
  const registerColumn = (id: string, el: HTMLElement | null) => {
    columnElsRef.current[id] = el;
    const pos = columnScrollRef.current[id];
    if (el && typeof pos === "number") el.scrollTop = pos;
  };
  const rememberScroll = (id: string, top: number) => { columnScrollRef.current[id] = top; };

  useEffect(() => {
    let isMounted = true;

    async function loadProjects() {
      if (!isInternal) return;
      try {
        const fetchedProjects = await fetchProjects(view, currentUserId, dimension);
        if (isMounted) {
          setProjects(fetchedProjects);
        }
      } catch (error) {
        console.error("Failed to fetch projects:", error);
        showErrorToast("Failed to load projects");
      }
    }

    loadProjects();
    return () => { isMounted = false; };
  }, [view, currentUserId, dimension, isInternal]);

  useEffect(() => {
    requestAnimationFrame(() => {
      Object.entries(columnElsRef.current).forEach(([id, el]) => {
        const pos = columnScrollRef.current[id];
        if (el && typeof pos === "number") el.scrollTop = pos;
      });
    });
  }, [dndEpoch, dimension, mode]);

  const projectById = useMemo(() => {
    const m: Record<string, Project> = {};
    for (const p of projects) m[String(p.id)] = p;
    return m;
  }, [projects]);

  const searchedProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.customer || "").toLowerCase().includes(q));
  }, [projects, query]);

  const primaryEngineerProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    projects.forEach(p => {
      if (p.primaryEngineerId && p.internalStatus === "In Progress") {
        counts[p.primaryEngineerId] = (counts[p.primaryEngineerId] || 0) + 1;
      }
    });
    return counts;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    let filtered = searchedProjects;

    if (showMyProjects || view !== "all") {
      filtered = filtered.filter((p) => isEngineerOnProject(p, currentUserId));
    }

    if (industryFilter !== null) {
      filtered = filtered.filter(p => p.customerIndustryId === industryFilter);
    }

    if (regionFilters.length > 0) {
      filtered = filtered.filter(p => p.customerRegion && regionFilters.includes(p.customerRegion));
    }

    if (teamFilter !== "all") {
      filtered = filtered.filter(p => matchesProjectTeamFilter(p, teamFilter));
    }

    if (filterSeOverload) {
      filtered = filtered.filter(p => {
        if (!p.primaryEngineerId) return false;
        return (primaryEngineerProjectCounts[p.primaryEngineerId] || 0) > 5;
      });
    }

    if (filterMissingCoverage) {
      filtered = filtered.filter(p => p.accountRepId && !p.primaryEngineerId);
    }

    if (filterRepSePairing && filterRepSePairingRepId) {
      filtered = filtered.filter(p => 
        p.accountRepId === filterRepSePairingRepId &&
        (p.primaryEngineerId === currentUserId || p.specialistEngineerId === currentUserId)
      );
    }

    if (filterOverEngineer && filterOverEngineerCount >= 2) {
      filtered = filtered.filter(p => {
        let count = 0;
        if (p.primaryEngineerId) count++;
        if (p.specialistEngineerId) count++;
        count += (p.supportingEngineerIds || []).length;
        return count > filterOverEngineerCount;
      });
    }

    if (filterStaleOpportunities) {
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(p => {
        if (!p.updatedAt) return true;
        return new Date(p.updatedAt).getTime() < thirtyDaysAgo;
      });
    }

    if (filterHighValueLowActivity) {
      const tenDaysAgo = Date.now() - (10 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(p => {
        const isHighValue = (p.acv || 0) >= 100000;
        const isLowActivity = !p.updatedAt || new Date(p.updatedAt).getTime() < tenDaysAgo;
        return isHighValue && isLowActivity;
      });
    }

    if (filterNoCurrentSituation) {
      filtered = filtered.filter(p => 
        p.internalStatus === "In Progress" && 
        (!p.currentSituation || p.currentSituation.trim() === "")
      );
    }

    if (filterMultiProduct && filterMultiProductCounts.size > 0) {
      filtered = filtered.filter(p => {
        const productCount = (p.productAbbreviations || []).length;
        for (const selection of filterMultiProductCounts) {
          if (selection === "5+" && productCount >= 5) return true;
          if (selection === String(productCount)) return true;
        }
        return false;
      });
    }

    return filtered;
  }, [
    searchedProjects, view, industryFilter, regionFilters, teamFilter, currentUserId,
    filterSeOverload, primaryEngineerProjectCounts,
    filterMissingCoverage,
    filterRepSePairing, filterRepSePairingRepId,
    filterOverEngineer, filterOverEngineerCount,
    filterStaleOpportunities,
    filterHighValueLowActivity,
    filterNoCurrentSituation,
    filterMultiProduct, filterMultiProductCounts
  ]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    projects.forEach(p => {
      if (p.customerRegion) regions.add(p.customerRegion);
    });
    return Array.from(regions).sort();
  }, [projects]);

  const swimlaneGroups = useMemo(() => {
    const groups: { id: string; title: string; projects: Project[] }[] = [];

    if (swimlaneDim === "none") {
      groups.push({ id: "default", title: "All Projects", projects: filteredProjects });
    } else {
      let field: keyof Project = "accountRepId";
      let userPropName: 'accountRep' | 'primaryEngineer' | 'specialistEngineer' = 'accountRep';

      if (swimlaneDim === "primary_se") {
        field = "primaryEngineerId";
        userPropName = 'primaryEngineer';
      } else if (swimlaneDim === "specialist_se") {
        field = "specialistEngineerId";
        userPropName = 'specialistEngineer';
      }

      const grouped = groupByField(filteredProjects, field);

      Object.entries(grouped).forEach(([key, list]) => {
         let title = key === "_unset" ? "Unassigned" : key;
         if (key !== "_unset" && list.length > 0) {
           const firstProject = list[0];
           const userObj = firstProject[userPropName];
           if (userObj?.fullName) {
             title = userObj.fullName;
           }
         }
         groups.push({ id: key, title, projects: list });
      });

      groups.sort((a, b) => {
         if (a.id === "_unset") return 1;
         if (b.id === "_unset") return -1;
         return a.title.localeCompare(b.title);
      });
    }
    return groups;
  }, [filteredProjects, swimlaneDim]);

  // Internal Status column ids are the lowercased status names (see
  // convertConfigsToStatusOptions) while projects store the name as
  // configured ("In Progress"), so that dimension matches on lowercase.
  const columnsEditable = useMemo(() => {
    const field = statusFieldByDimension[dimension];
    const map = dimension === "internal"
      ? groupByField(
          filteredProjects.map((p) => ({ ...p, internalStatus: (p.internalStatus || "").toLowerCase() })),
          field,
        )
      : groupByField(filteredProjects, field);
    const normalized: Record<string, Project[]> = {};
    statusList.forEach((s: StatusOption) => {
      normalized[s.id] = map[s.id] || [];
    });
    return normalized;
  }, [filteredProjects, dimension, statusList]);

  useEffect(() => {
    setOrder((prev) => {
      const next = { ...prev, [dimension]: { ...prev[dimension] } };
      let changed = false;
      statusList.forEach((s: StatusOption) => {
        const existing = (next as any)[dimension][s.id] as string[] | undefined;
        const col = columnsEditable[s.id] || [];
        const colIds = col.map((p) => String(p.id));
        if (!existing) {
          (next as any)[dimension][s.id] = colIds;
          changed = true;
        } else {
          const filteredIds = existing.filter((id) => colIds.includes(id));
          colIds.forEach((id) => { if (!filteredIds.includes(id)) filteredIds.push(id); });
          if (filteredIds.length !== existing.length || filteredIds.some((v, i) => v !== (existing[i] ?? null))) {
            (next as any)[dimension][s.id] = filteredIds;
            changed = true;
          }
        }
      });
      return changed ? (next as any) : prev;
    });
  }, [dimension, columnsEditable, statusList]);

  useEffect(() => {
    const currentDimension = order[dimension] || {};
    const totalProjectsInOrder = Object.values(currentDimension).reduce(
      (sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0
    );

    if (totalProjectsInOrder === 0) return;

    const baselineDimension = baselineOrderRef.current?.[dimension] || {};
    const baselineProjectCount = Object.values(baselineDimension).reduce(
      (sum: number, arr: unknown) => sum + (Array.isArray(arr) ? arr.length : 0), 0
    );

    if (baselineProjectCount === 0) {
      if (!baselineOrderRef.current) {
        baselineOrderRef.current = JSON.parse(JSON.stringify(order));
      } else {
        baselineOrderRef.current = {
          ...baselineOrderRef.current,
          [dimension]: JSON.parse(JSON.stringify(currentDimension))
        };
      }
    }
  }, [dimension, order]);

  useEffect(() => {
    if (!statusList.length) return;
    setColumnOrder((prev) => {
      if ((prev[dimension] || []).length > 0) return prev;
      const ids = statusList.map((s) => s.id);
      const next = { ...prev, [dimension]: ids };
      if (!baselineColumnOrderRef.current) baselineColumnOrderRef.current = JSON.parse(JSON.stringify(next));
      else if (!baselineColumnOrderRef.current[dimension]) baselineColumnOrderRef.current = { ...baselineColumnOrderRef.current, [dimension]: ids };
      return next;
    });
  }, [dimension, statusList]);

  useEffect(() => {
    if (!currentUserId || !dimension || !statusList.length) return;

    async function loadUserPreferences() {
      const userColumnOrder = await loadUserColumnOrder(currentUserId, dimension);
      if (userColumnOrder && userColumnOrder.length > 0) {
        setColumnOrder((prev) => ({
          ...prev,
          [dimension]: userColumnOrder
        }));
      }
    }

    loadUserPreferences();
  }, [dimension, currentUserId, statusList.length]);

  const columnIdsForDim = (columnOrder[dimension]?.length
    ? columnOrder[dimension]
    : statusList.map((s) => s.id));

  useEffect(() => {
    setStatsOpenByColumn((prev) => {
      const next = { ...prev };
      columnIdsForDim.forEach((id) => {
        if (typeof next[id] === "undefined") next[id] = false;
      });
      return next;
    });
    setCollapsedByColumn((prev) => {
      const next = { ...prev };
      columnIdsForDim.forEach((id) => {
        if (typeof next[id] === "undefined") next[id] = false;
      });
      return next;
    });
  }, [dimension, columnIdsForDim.join(",")]);

  useEffect(() => {
    const wsManager = WebSocketManager.getInstance();

    const handleProjectUpdate = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects/kanban'] });
    };

    const handleProjectCreated = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects/kanban'] });
    };

    const handleProjectDeleted = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects/kanban'] });
    };

    wsManager.on('project_updated', handleProjectUpdate);
    wsManager.on('project_created', handleProjectCreated);
    wsManager.on('project_deleted', handleProjectDeleted);

    return () => {
      wsManager.off('project_updated', handleProjectUpdate);
      wsManager.off('project_created', handleProjectCreated);
      wsManager.off('project_deleted', handleProjectDeleted);
    };
  }, [queryClient]);

  const filteredAudit = useMemo(() => {
    const allEvents = [...backendAuditEvents, ...audit].sort((a, b) => b.ts - a.ts);

    const byType = allEvents.filter(e => 
        (auditTypes.move && e.type === "move") ||
        (auditTypes.reorder && e.type === "reorder") ||
        (auditTypes.columns && e.type === "columns-reorder")
    );
    const byTime = byType.filter(e => {
        if (auditTimeRange === "all") return true;
        const days = auditTimeRange === "7d" ? 7 : 30;
        return (Date.now() - e.ts) <= (days * 86400000);
    });
    const q = auditSearch.trim().toLowerCase();
    if (!q) return byTime;
    return byTime.filter(e => JSON.stringify(e).toLowerCase().includes(q));
  }, [audit, backendAuditEvents, auditTypes, auditTimeRange, auditSearch]);

  function markDirty(idOrFlag: string) {
    if (idOrFlag === "__columns__") { setUnsavedChanges(true); return; }
    setDirtyIds((prev) => { const next = new Set(prev); next.add(idOrFlag); return next; });
    setUnsavedChanges(true);
  }
  function clearDirty(id: string) {
    setDirtyIds((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
  }
  const dragOriginRef = useRef<{ statusId: string; index: number } | null>(null);
  function getContainerId(over: Over | null): string | null {
    if (!over) return null;
    const id = String(over.id);
    if (statusList.some((s) => s.id === id)) return id;
    if (id.startsWith("col-")) return id.replace("col-", "");
    const dimOrder = order[dimension] || {};
    for (const [statusId, list] of Object.entries(dimOrder)) if (list.includes(id)) return statusId;
    return null;
  }
  function computeDestIndex(destList: string[], overId: string) {
    if (!overId || statusList.some((s) => s.id === overId) || overId.startsWith("col-")) return destList.length;
    const idx = destList.indexOf(overId);
    return idx >= 0 ? idx : destList.length;
  }
  const smartCollision = (args: any) => {
    const byPointer = pointerWithin(args);
    if (byPointer.length) return byPointer;
    const byRect = rectIntersection(args);
    if (byRect.length) return byRect;
    return closestCenter(args);
  };
  function moveWithinColumn(statusId: string, fromIdx: number, toIdx: number) {
    setOrder((prev) => {
      const list = (prev[dimension][statusId] || []).slice();
      const pid = list[fromIdx];
      const reordered = arrayMove(list, fromIdx, toIdx);
      const next = { ...prev, [dimension]: { ...prev[dimension], [statusId]: reordered } };
      return next;
    });
  }
  function moveAcrossColumns(cardId: string, sourceStatus: string, destStatus: string, destIndex: number) {
    setOrder((prev) => {
      const nextDim = { ...prev[dimension] } as Record<string, string[]>;
      const fromList = (nextDim[sourceStatus] || []).filter((id) => id !== cardId);
      const toList = [...(nextDim[destStatus] || [])];
      const existIdx = toList.indexOf(cardId);
      if (existIdx >= 0) toList.splice(existIdx, 1);
      const insertIndex = Math.min(Math.max(0, destIndex), toList.length);
      toList.splice(insertIndex, 0, cardId);
      nextDim[sourceStatus] = fromList;
      nextDim[destStatus] = toList;
      return { ...prev, [dimension]: nextDim } as typeof prev;
    });
    setUndoMap((prev) => ({ ...prev, [cardId]: { fromStatus: sourceStatus, fromIndex: destIndex } }));
    setPendingStatus((prev) => {
      const copy = { ...prev };
      const m = { ...(copy[dimension] || {}) };
      m[cardId] = destStatus;
      copy[dimension] = m;
      return copy;
    });
    markDirty(cardId);
  }
  function onColumnDragEnd(activeIdStr: string, overIdStr: string | null) {
    if (!overIdStr) return;
    const fromId = activeIdStr.replace(/^col-/, "");
    const toId = overIdStr.replace(/^col-/, "");
    setColumnOrder((prev) => {
      const current = prev[dimension] || [];
      const fromIndex = current.indexOf(fromId);
      const toIndex = current.indexOf(toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev;
      const reordered = arrayMove(current, fromIndex, toIndex);
      const next = { ...prev, [dimension]: reordered };
      markDirty("__columns__");
      return next;
    });
  }
  function handleDragStart(active: { id: string | number }) {
    const idStr = String(active.id);
    setActiveId(idStr);
    document.body.style.cursor = "grabbing";
    if (idStr.startsWith("col-")) return;
    const dimOrder = order[dimension] || {};
    for (const [statusId, list] of Object.entries(dimOrder)) {
      const idx = list.indexOf(idStr);
      if (idx >= 0) { dragOriginRef.current = { statusId, index: idx }; return; }
    }
    dragOriginRef.current = null;
  }
  function handleDragOver(e: any) {
    const { active, over } = e;
    if (!over) return;
    const activeIdStr = String(active.id);
    if (activeIdStr.startsWith("col-")) return;
    const destStatus = getContainerId(over);
    if (!destStatus) return;
    const dimOrder = order[dimension] || {};
    const sourceStatus = (Object.entries(dimOrder).find(([_, list]) => list.includes(activeIdStr))?.[0]) as string | undefined;
    if (!sourceStatus || sourceStatus === destStatus) return;
    const destList = dimOrder[destStatus] || [];
    const destIndex = computeDestIndex(destList, String(over.id));
    setOrder((prev) => {
      const nextDim = { ...prev[dimension] } as Record<string, string[]>;
      const fromList = (nextDim[sourceStatus] || []).filter((id) => id !== activeIdStr);
      const toList = [...(nextDim[destStatus] || [])];
      const existIdx = toList.indexOf(activeIdStr);
      if (existIdx >= 0) toList.splice(existIdx, 1);
      toList.splice(destIndex, 0, activeIdStr);
      nextDim[sourceStatus] = fromList;
      nextDim[destStatus] = toList;
      return { ...prev, [dimension]: nextDim } as typeof prev;
    });
  }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const activeIdStr = String(active.id);
    setActiveId(null);
    document.body.style.cursor = "";
    if (activeIdStr.startsWith("col-")) {
      const overIdStr = over ? (String(over.id).startsWith("col-") ? String(over.id) : `col-${String(over.id)}`) : null;
      onColumnDragEnd(activeIdStr, overIdStr);
      return;
    }
    if (!over) { dragOriginRef.current = null; return; }
    const destStatus = getContainerId(over);
    if (!destStatus) { dragOriginRef.current = null; return; }
    const dimOrder = order[dimension] || {};
    const overId = String(over.id);
    const destListNow = dimOrder[destStatus] || [];
    const destIndex = computeDestIndex(destListNow, overId);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (!origin) {
      const list = destListNow;
      const oldIndex = list.indexOf(activeIdStr);
      if (oldIndex !== -1) moveWithinColumn(destStatus, oldIndex, destIndex);
      return;
    }
    if (origin.statusId === destStatus) { moveWithinColumn(destStatus, origin.index, destIndex); return; }
    moveAcrossColumns(activeIdStr, origin.statusId, destStatus, destIndex);

    // Fire immediate status PATCH — optimistically show new status, rollback card if it fails
    const capturedOriginStatus = origin.statusId;
    const capturedOriginIndex = origin.index;
    const capturedDest = destStatus;
    const capturedCardId = activeIdStr;
    startDndTransition(async () => {
      applyOptimisticDragStatus({ cardId: capturedCardId, status: capturedDest });
      try {
        await updateProjectStatus(Number(capturedCardId), dimension, statusValueForColumn(capturedDest));
        // Status persisted immediately; remove from pending so batch saveChanges skips status PATCH
        setPendingStatus((prev) => {
          const d = { ...(prev[dimension] || {}) };
          delete d[capturedCardId];
          return { ...prev, [dimension]: d };
        });
      } catch (err: any) {
        // Revert card position in the board
        setOrder((prev) => {
          const nextDim = { ...(prev[dimension] || {}) };
          nextDim[capturedDest] = (nextDim[capturedDest] || []).filter((id: string) => id !== capturedCardId);
          const toList = [...(nextDim[capturedOriginStatus] || [])];
          toList.splice(capturedOriginIndex, 0, capturedCardId);
          nextDim[capturedOriginStatus] = toList;
          return { ...prev, [dimension]: nextDim };
        });
        setPendingStatus((prev) => {
          const d = { ...(prev[dimension] || {}) };
          delete d[capturedCardId];
          return { ...prev, [dimension]: d };
        });
        setDirtyIds((prev) => { const s = new Set(prev); s.delete(capturedCardId); return s; });
        showErrorToast("Failed to move card", err?.message || "Please try again.");
      }
    });
  }
  function hardRemountDnD() {
    setActiveId(null);
    dragOriginRef.current = null;
    setDndMounted(false);
    setTimeout(() => { setDndEpoch((e) => e + 1); setDndMounted(true); }, 0);
  }

  async function saveChanges() {
    const statusMap = pendingStatus[dimension] || {};
    const ops: Promise<any>[] = [];
    for (const [pid, newStatus] of Object.entries(statusMap)) ops.push(updateProjectStatus(Number(pid), dimension, statusValueForColumn(newStatus)));
    const dimOrder = order[dimension] || {};
    for (const [statusId, ids] of Object.entries(dimOrder)) ops.push(persistOrder(dimension, statusId, ids.map(Number)));
    const colOrder = columnOrder[dimension] || [];
    ops.push(persistColumnOrder(dimension, colOrder, currentUserId));

    const nowTs = Date.now();
    const newAudit: AuditEvent[] = [];
    for (const [pidStr, toStatus] of Object.entries(statusMap)) {
        const pid = Number(pidStr);
        const field = statusFieldByDimension[dimension];
        const fromStatus = projectById[pidStr]?.[field] as string | undefined;
        newAudit.push({ ts: nowTs, user: currentUserId, type: "move", projectId: pid, dim: dimension, from: fromStatus, to: toStatus });
    }
    const base = baselineOrderRef.current?.[dimension] || {};
    for (const [statusId, ids] of Object.entries(dimOrder)) {
      const baseIds = base[statusId] || [];
      const isSameSet = baseIds.length === ids.length && new Set(baseIds).size === new Set(ids).size && baseIds.every(id => ids.includes(id));

      if (isSameSet) {
          const isSameOrder = baseIds.every((v, i) => v === ids[i]);
          if (!isSameOrder) {
             newAudit.push({ ts: nowTs, user: currentUserId, type: "reorder", dim: dimension, statusId, ids: ids.map(Number) });
          }
      }
    }

    const baseCols = (baselineColumnOrderRef.current?.[dimension] || []) as string[];
    const cols = columnOrder[dimension] || [];
    const colsSame = baseCols.length === cols.length && baseCols.every((v, i) => v === cols[i]);
    if (!colsSame) newAudit.push({ ts: nowTs, user: currentUserId, type: "columns-reorder", dim: dimension, order: cols.slice() });

    try {
      await Promise.all(ops);
      setProjects((prev) => {
        const field = statusFieldByDimension[dimension] as keyof Project;
        return prev.map((p) => (statusMap[String(p.id)] ? ({ ...p, [field]: statusValueForColumn(statusMap[String(p.id)]) } as Project) : p));
      });
      if (newAudit.length) {
          await persistAudit(newAudit, user);
          setAudit(prev => [...newAudit, ...prev]);
      }
      setPendingStatus((prev) => ({ ...prev, [dimension]: {} }));
      setDirtyIds(new Set());
      setUndoMap({});
      setUnsavedChanges(false);
      if (!baselineOrderRef.current) baselineOrderRef.current = { internal: {}, risk: {}, ranking: {} };
      if (baselineOrderRef.current) {
        baselineOrderRef.current[dimension] = JSON.parse(JSON.stringify(order[dimension]));
      }

      if (!baselineColumnOrderRef.current) baselineColumnOrderRef.current = { internal: [], risk: [], ranking: [] };
      if (baselineColumnOrderRef.current) {
        baselineColumnOrderRef.current[dimension] = JSON.parse(JSON.stringify(columnOrder[dimension]));
      }

      hardRemountDnD();
      showSuccessToast("Changes saved.");
    } catch (e: any) {
      showErrorToast("Save failed", e?.message || String(e));
      // Refetch authoritative server state — some ops in Promise.all may have partially succeeded,
      // so resetAll() to a stale baseline could be inaccurate. Refetch to reconcile.
      try {
        const freshProjects = await fetchProjects(view, currentUserId, dimension);
        setProjects(freshProjects);
        // Clear order/column so the initialization effects rebuild from fresh data
        setOrder({ internal: {}, risk: {}, ranking: {} });
        setColumnOrder({ internal: [], risk: [], ranking: [] });
        baselineOrderRef.current = null;
        baselineColumnOrderRef.current = null;
        setPendingStatus((prev) => ({ ...prev, [dimension]: {} }));
        setDirtyIds(new Set());
        setUndoMap({});
        setUnsavedChanges(false);
        hardRemountDnD();
      } catch {
        resetAll();
      }
    }
  }

  useLayoutEffect(() => {
    latestSaveChangesRef.current = saveChanges;
  });

  useEffect(() => {
    // Skip auto-save while a DnD PATCH is in flight to prevent double-save race conditions
    if (!autoSave || !unsavedChanges || isDndTransitionPending) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      latestSaveChangesRef.current();
    }, autoSaveDelaySec * 1000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unsavedChanges, autoSave, autoSaveDelaySec, isDndTransitionPending]);

  function resetAll() {
    const baseCards = baselineOrderRef.current;
    const baseCols = baselineColumnOrderRef.current;
    if (baseCards) setOrder(JSON.parse(JSON.stringify(baseCards)));
    if (baseCols) setColumnOrder(JSON.parse(JSON.stringify(baseCols)));
    setPendingStatus((prev) => ({ ...prev, [dimension]: {} }));
    setDirtyIds(new Set());
    setUndoMap({});
    setUnsavedChanges(false);
    hardRemountDnD();
    showInfoToast("Reverted unsaved moves.");
  }

  function handleDimensionChange(newDim: StatusDimension) {
    if (unsavedChanges) {
      setPendingDimension(newDim);
      setShowDimensionConfirm(true);
    } else {
      setDimension(newDim);
    }
  }

  function confirmDimensionChange() {
    if (pendingDimension) {
      resetAll();
      setDimension(pendingDimension);
      setPendingDimension(null);
    }
  }

  function handleModeChange(newMode: "editable" | "nonEditable") {
    if (unsavedChanges && mode === "editable") {
      setPendingMode(newMode);
      setShowModeConfirm(true);
    } else {
      setMode(newMode);
    }
  }

  function confirmModeChange() {
    if (pendingMode) {
      resetAll();
      setMode(pendingMode);
      setPendingMode(null);
    }
  }

  async function exportPNG() {
    const el = document.getElementById("board-scroll");
    if (!el) return;
    try {
      showInfoToast("Preparing PNG…");
      const html2canvas = await loadHtml2Canvas();
      const prev = el.style.overflow;
      el.style.overflow = "visible";
      const width = el.scrollWidth;
      const height = el.scrollHeight;
      const canvas = await html2canvas(el, {
        backgroundColor: "#f8fafc",
        width,
        height,
        windowWidth: width,
        windowHeight: height,
        scrollX: 0,
        scrollY: 0,
      });
      el.style.overflow = prev;
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) return;
        download("kanban.png", blob);
      });
      showSuccessToast("PNG downloaded.");
    } catch (e: any) {
      showErrorToast("PNG export failed", e?.message || String(e));
    }
  }
  async function exportPDF() {
    const el = document.getElementById("board-scroll");
    if (!el) return;
    const jsPDF = await loadJsPDF();
    if (!jsPDF) {
      showErrorToast("PDF export needs jspdf. Run: npm i jspdf");
      return;
    }
    try {
      showInfoToast("Preparing PDF…");
      const html2canvas = await loadHtml2Canvas();
      const prev = el.style.overflow;
      el.style.overflow = "visible";
      const width = el.scrollWidth;
      const height = el.scrollHeight;
      const canvas = await html2canvas(el, { backgroundColor: "#f8fafc", width, height, windowWidth: width, windowHeight: height, scrollX: 0, scrollY: 0 });
      el.style.overflow = prev;

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "l", unit: "px", format: [width, height] });
      pdf.addImage(imgData, "PNG", 0, 0, width, height);
      pdf.save("kanban.pdf");
      showSuccessToast("PDF downloaded.");
    } catch (e: any) {
      showErrorToast("PDF export failed", e?.message || String(e));
    }
  }
  function exportBoardSummaryCSV() {
    const statusIds = columnIdsForDim;
    const rows = [["Column", "Count", "Total ACV", "Avg ACV", "Avg LOE (d)", "Last Updated"]];
    statusIds.forEach((sid) => {
      const ids = order[dimension][sid] || [];
      const ps = ids.map((id) => projectById[id]).filter(Boolean);
      const c = ps.length;
      const total = sum(ps.map((p) => p.acv || 0));
      const avgAcv = c ? Math.round(total / c) : 0;
      const avg = c ? Math.round(sum(ps.map((p) => p.loeDays || 0)) / c) : 0;
      const last = ps.length ? ps.reduce((a, b) => (new Date(a.updatedAt || 0) > new Date(b.updatedAt || 0) ? a : b)).updatedAt : undefined;
      const label = statusLabel(configLookupMap, dimension, sid);
      rows.push([label, String(c), String(total), String(avgAcv), String(avg), last ? new Date(last).toISOString() : ""]);
    });
    const csvContent = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    download("kanban_summary.csv", blob);
    showSuccessToast("Board summary CSV downloaded.");
  }
  function exportProjectDataCSV() {
    const header = ["Project ID", "Name", "Customer", "ACV", "LOE (days)", "Internal Status", "Risk Level", "Ranking", "Account Rep", "Primary Eng", "Specialist Eng", "Supporting Eng", "Notes", "Last Updated"];
    const rows = [header];

    const currentProjects = filteredProjects;

    currentProjects.forEach(p => {
       rows.push([
           String(p.id),
           p.name,
           p.customer || "",
           String(p.acv || 0),
           String(p.loeDays || 0),
           statusLabel(configLookupMap, "internal", p.internalStatus),
           statusLabel(configLookupMap, "risk", p.riskLevel),
           statusLabel(configLookupMap, "ranking", p.ranking),
           p.accountRepId || "",
           p.primaryEngineerId || "",
           p.specialistEngineerId || "",
           (p.supportingEngineerIds || []).join("; "),
           p.notes ? p.notes.replace(/\n/g, " ") : "",
           p.updatedAt ? new Date(p.updatedAt).toISOString() : ""
       ]);
    });

    const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    download("project_data.csv", blob);
    showSuccessToast("Project data CSV downloaded.");
  }
  function exportAuditCSV() {
      const header = ["Time", "User", "Type", "Dimension", "Details"];
      const rows = [header];
      filteredAudit.forEach(e => {
          const dimName = 'dim' in e ? friendlyDim(e.dim) : '';
          let details = "";
          if (e.type === "move" && 'dim' in e) details = `Project ${e.projectId} from ${statusLabel(configLookupMap, e.dim, e.from)} to ${statusLabel(configLookupMap, e.dim, e.to)}`;
          else if (e.type === "reorder" && 'dim' in e) details = `Reordered items in ${statusLabel(configLookupMap, e.dim, e.statusId)}`;
          else if (e.type === "columns-reorder" && 'dim' in e) details = `Reordered columns`;
          rows.push([new Date(e.ts).toISOString(), e.user, e.type, dimName || "", details]);
      });
      const csvContent = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
      download("audit_log.csv", blob);
      showSuccessToast("Audit CSV downloaded.");
  }

  function toggleCollapsed(id: string) {
    setCollapsedByColumn((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function tempSortACV(id: string) {
    setOrder((prev) => {
      const ids = prev[dimension][id] || [];
      const sorted = [...ids].sort((a, b) => (projectById[b]?.acv ?? 0) - (projectById[a]?.acv ?? 0));
      return { ...prev, [dimension]: { ...prev[dimension], [id]: sorted } };
    });
  }
  function tempSortLOE(id: string) {
    setOrder((prev) => {
      const ids = prev[dimension][id] || [];
      const sorted = [...ids].sort((a, b) => (projectById[b]?.loeDays ?? 0) - (projectById[a]?.loeDays ?? 0));
      return { ...prev, [dimension]: { ...prev[dimension], [id]: sorted } };
    });
  }

  function renderStats(projectList: Project[]) {
    const c = projectList.length;
    const sumAcv = sum(projectList.map((p) => p.acv || 0));
    const avgAcv = c ? Math.round(sumAcv / c) : 0;
    const avgLoe = c ? Math.round(sum(projectList.map((p) => p.loeDays || 0)) / c) : 0;
    const uniqueCustomers = new Set(projectList.map((p) => p.customer).filter(Boolean)).size;

    return (
      <div className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] text-slate-600 dark:text-slate-400 mt-1.5">
        <div className="flex items-center gap-1.5" title="Total ACV">
          <Landmark className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          <span className="opacity-70">Total ACV:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{humanMoney(sumAcv)}</span>
        </div>
        <div className="flex items-center gap-1.5" title="Average ACV">
          <Landmark className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          <span className="opacity-70">Avg ACV:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{humanMoney(avgAcv)}</span>
        </div>
        <div className="flex items-center gap-1.5" title="Average LOE">
          <Activity className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          <span className="opacity-70">Avg LOE:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{avgLoe}d</span>
        </div>
        <div className="flex items-center gap-1.5" title="Number of Accounts">
          <Building className="w-3 h-3 text-slate-400 dark:text-slate-500" />
          <span className="opacity-70"># of Accounts:</span>
          <span className="font-semibold text-slate-700 dark:text-slate-200">{uniqueCustomers}</span>
        </div>
      </div>
    );
  }

  const nonEditableColumns = useMemo(() => {
    const result: Record<string, { title: string; color: string; icon?: string; list: Project[] }> = {};
    
    if (nonEditableDim === "salesStage") {
      const salesStages = [
        { id: "discover", matchValue: "Discover", title: "Discover", color: "#3B82F6", icon: "Search" },
        { id: "align", matchValue: "Align", title: "Align", color: "#6366F1", icon: "Users" },
        { id: "scope", matchValue: "Scope", title: "Scope", color: "#A855F7", icon: "Target" },
        { id: "validate", matchValue: "Validate", title: "Validate", color: "#F59E0B", icon: "CheckCircle" },
        { id: "negotiate", matchValue: "Negotiate", title: "Negotiate", color: "#F97316", icon: "MessageSquare" },
        { id: "closedWon", matchValue: "Closed Won", title: "Closed Won", color: "#22C55E", icon: "Trophy" },
        { id: "closedLost", matchValue: "Closed Lost", title: "Closed Lost", color: "#EF4444", icon: "XCircle" },
        { id: "unassigned", matchValue: "", title: "Unassigned", color: "#6B7280", icon: "HelpCircle" },
      ];
      salesStages.forEach((stage) => {
        const list = stage.id === "unassigned"
          ? filteredProjects.filter((p) => !p.salesStage || p.salesStage.trim() === "")
          : filteredProjects.filter((p) => p.salesStage?.toLowerCase() === stage.matchValue.toLowerCase());
        result[stage.id] = { title: stage.title, color: stage.color, icon: stage.icon, list };
      });
    } else if (nonEditableDim === "forecastCategory") {
      const forecastCategories = [
        { id: "pipeline", matchValue: "Pipeline", title: "Pipeline", color: "#3B82F6", icon: "TrendingUp" },
        { id: "bestCase", matchValue: "Best Case", title: "Best Case", color: "#06B6D4", icon: "Star" },
        { id: "commit", matchValue: "Commit", title: "Commit", color: "#22C55E", icon: "CheckSquare" },
        { id: "closed", matchValue: "Closed", title: "Closed", color: "#10B981", icon: "CheckCircle2" },
        { id: "omitted", matchValue: "Omitted", title: "Omitted", color: "#6B7280", icon: "MinusCircle" },
        { id: "unassigned", matchValue: "", title: "Unassigned", color: "#9CA3AF", icon: "HelpCircle" },
      ];
      forecastCategories.forEach((cat) => {
        const list = cat.id === "unassigned"
          ? filteredProjects.filter((p) => !p.forecastCategory || p.forecastCategory.trim() === "")
          : filteredProjects.filter((p) => p.forecastCategory?.toLowerCase() === cat.matchValue.toLowerCase());
        result[cat.id] = { title: cat.title, color: cat.color, icon: cat.icon, list };
      });
    } else if (nonEditableDim === "acvBands") {
      acvFilters.forEach((fc) => {
        const list = filteredProjects.filter((p) => (p.acv ?? 0) >= fc.filter.min && (p.acv ?? 0) <= fc.filter.max);
        result[fc.id] = { title: fc.label, color: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700", list };
      });
    } else if (nonEditableDim === "customerStatus") {
      if (customerStatusConfigs && Array.isArray(customerStatusConfigs)) {
        customerStatusConfigs.forEach((config: any) => {
          const list = filteredProjects.filter((p) => p.customerStatus === config.name);
          result[config.name] = { 
            title: config.name, 
            color: config.color || "#6B7280",
            icon: config.icon || undefined,
            list 
          };
        });
      } else {
        const map = groupByField(filteredProjects, "customerStatus");
        Object.entries(map).forEach(([statusId, list]) => {
          if (statusId !== "_unset") {
            result[statusId] = { 
              title: statusId, 
              color: "#6B7280",
              list 
            };
          }
        });
      }
    } else if (nonEditableDim === "loe") {
      const buckets = [
        { id: "loe-1", title: "1-14 Days", min: 1, max: 14, color: "#86efac", icon: "CalendarDays" },
        { id: "loe-2", title: "15-21 Days", min: 15, max: 21, color: "#86efac", icon: "CalendarDays" },
        { id: "loe-3", title: "22-31 Days", min: 22, max: 31, color: "#fdba74", icon: "CalendarDays" },
        { id: "loe-4", title: "32-45 Days", min: 32, max: 45, color: "#fdba74", icon: "CalendarDays" },
        { id: "loe-5", title: "46-60 Days", min: 46, max: 60, color: "#fca5a5", icon: "CalendarDays" },
        { id: "loe-6", title: "61-74 Days", min: 61, max: 74, color: "#fca5a5", icon: "CalendarDays" },
        { id: "loe-7", title: "75+ Days", min: 75, max: 999, color: "#fca5a5", icon: "CalendarDays" },
      ];
      buckets.forEach((b) => {
        const list = filteredProjects.filter((p) => (p.loeDays ?? 0) >= b.min && (p.loeDays ?? 0) <= b.max);
        result[b.id] = { title: b.title, color: b.color, icon: b.icon, list };
      });
    } else if (nonEditableDim === "byAccount") {
      const accounts = Array.from(new Set(filteredProjects.map((p) => p.customer || "—")));
      const usedColors = new Set<string>();
      accounts.forEach((accountName) => {
        const list = filteredProjects.filter((p) => (p.customer || "—") === accountName);
        const pastelColor = getRandomPastelColor(usedColors);
        usedColors.add(pastelColor);
        result[`acct-${accountName}`] = { title: accountName, color: pastelColor, icon: "Building", list };
      });
    } else if (nonEditableDim === "byDate") {
      const bands = [
        { id: "d-7", title: "Updated ≤ 7D", minDays: 0, maxDays: 7, color: "#86efac", icon: "CalendarSync" },
        { id: "d-14", title: "Updated ≤ 14D", minDays: 8, maxDays: 14, color: "#fef08a", icon: "CalendarSync" },
        { id: "d-30", title: "Updated ≤ 30D", minDays: 15, maxDays: 30, color: "#fdba74", icon: "CalendarSync" },
        { id: "d-45", title: "Updated ≤ 45D", minDays: 31, maxDays: 45, color: "#fca5a5", icon: "CalendarSync" },
        { id: "d-60", title: "Updated ≤ 60D", minDays: 46, maxDays: 60, color: "#f87171", icon: "CalendarSync" },
        { id: "d-older", title: "Updated Older", minDays: 61, maxDays: 999999, color: "#dc2626", icon: "CalendarSync" },
      ];
      bands.forEach((b) => {
        const list = filteredProjects.filter((p) => {
          const diff = (Date.now() - new Date(p.updatedAt || Date.now()).getTime()) / 86400000;
          return diff >= b.minDays && diff <= b.maxDays;
        });
        result[b.id] = { title: b.title, color: b.color, icon: b.icon, list };
      });
    } else if (nonEditableDim === "solutions") {
       const usedColors = new Set<string>();
       const normalizeForMatch = (str: string) => 
         str.toLowerCase().trim().replace(/\s+add-on$/i, '');

       products.forEach((product: any) => {
          const displayName = product.isActive ? product.name : `${product.name} (N/A)`;
          const productAbbrev = (product.abbreviation || "").toLowerCase().trim();
          const productNameNormalized = normalizeForMatch(product.name);

          const list = filteredProjects.filter(p => {
            if (productAbbrev && (p.productAbbreviations || []).some(
              abbrev => abbrev.toLowerCase().trim() === productAbbrev
            )) {
              return true;
            }
            const solutionTokens = (p.name || "").split(/[,;+&]/).map(normalizeForMatch);
            if (solutionTokens.some(token => token === productNameNormalized)) {
              return true;
            }
            return false;
          });
          const pastelColor = getRandomPastelColor(usedColors);
          usedColors.add(pastelColor);
          result[`sol-${product.name}`] = { 
            title: displayName, 
            color: pastelColor, 
            icon: product.solutionIcon || product.solutionIconName || "Package", 
            list 
          };
       });
    }
    return result;
  }, [filteredProjects, nonEditableDim, acvFilters, customerStatusConfigs, products]);

  const paginatedNonEditableColumns = useMemo(() => {
    if (nonEditableDim !== "byAccount") {
      return { columns: nonEditableColumns, totalPages: 1, currentPage: 0 };
    }
    const allEntries = Object.entries(nonEditableColumns);
    const totalPages = Math.ceil(allEntries.length / ACCOUNTS_PER_PAGE);
    const validPage = Math.min(byAccountPage, Math.max(0, totalPages - 1));
    const startIndex = validPage * ACCOUNTS_PER_PAGE;
    const paginatedEntries = allEntries.slice(startIndex, startIndex + ACCOUNTS_PER_PAGE);
    const columns = Object.fromEntries(paginatedEntries) as typeof nonEditableColumns;
    return { columns, totalPages, currentPage: validPage, totalAccounts: allEntries.length };
  }, [nonEditableColumns, nonEditableDim, byAccountPage, ACCOUNTS_PER_PAGE]);

  const pageTitle = `Project Board`;

  const rootClassName = filterContainerRef?.current
    ? "flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans"
    : "h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-sans";
  
  return (
    <div className={rootClassName} id="kanban-board-root">

      {showAudit && (
        <Sheet open={showAudit} onOpenChange={setShowAudit}>
          <SheetContent side="right" className="w-[400px] sm:w-[540px] overflow-hidden flex flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <History className="w-4 h-4" /> Audit Trail
              </SheetTitle>
            </SheetHeader>

            <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input className="w-full pl-8 pr-2 py-1.5 text-xs border border-slate-200 dark:border-slate-600 rounded bg-slate-50 dark:bg-slate-900 focus:bg-white dark:focus:bg-slate-800 transition-colors text-slate-900 dark:text-slate-100" placeholder="Search audit..." value={auditSearch} onChange={e => setAuditSearch(e.target.value)} />
                </div>
                <select className="text-xs border border-slate-200 dark:border-slate-600 rounded px-2 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-200" value={auditTimeRange} onChange={e => setAuditTimeRange(e.target.value as any)}>
                  <option value="all">All time</option>
                  <option value="7d">Last 7d</option>
                  <option value="30d">Last 30d</option>
                </select>
              </div>
              <div className="flex gap-4 text-xs text-slate-600 dark:text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={auditTypes.move} onChange={e => setAuditTypes(p => ({...p, move: e.target.checked}))} className="rounded text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600" /> Moves</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={auditTypes.reorder} onChange={e => setAuditTypes(p => ({...p, reorder: e.target.checked}))} className="rounded text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600" /> Column Reorders</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={auditTypes.columns} onChange={e => setAuditTypes(p => ({...p, columns: e.target.checked}))} className="rounded text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700 border-slate-300 dark:border-slate-600" /> Column Headers</label>
              </div>
              <div className="flex items-center justify-end">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={exportAuditCSV} className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-slate-600 dark:text-slate-400"><Download className="w-4 h-4" /></button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Export CSV
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
              {filteredAudit.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic">No matching audit events found.</div>
              ) : (
                filteredAudit.map((e, i) => {
                  const getUserName = (userId: string) => {
                    const user = allUsers.find(u => u.id === userId);
                    return user ? user.name : userId;
                  };

                  return (
                    <div key={i} className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm text-xs space-y-1">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200">
                          <UserCircle className="w-3.5 h-3.5 text-blue-500" />
                          {getUserName(e.user)}
                        </div>
                        <span className="text-[10px] text-slate-400">{timeAgo(new Date(e.ts).toISOString())}</span>
                      </div>
                      <div className="text-slate-600 dark:text-slate-400 pl-5">
                        {e.type === "move" && <>Moved <strong>Project {e.projectId}</strong> from <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">{statusLabel(configLookupMap, e.dim, e.from)}</span> to <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">{statusLabel(configLookupMap, e.dim, e.to)}</span></>}
                        {e.type === "reorder" && <>Reordered items within <strong>{statusLabel(configLookupMap, e.dim, e.statusId)}</strong></>}
                        {e.type === "columns-reorder" && <>Reordered columns for <strong>{friendlyDim(e.dim)}</strong></>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {drawerOpen && drawerProjectId && (
         <div className="fixed inset-0 z-[9999] flex justify-end isolate">
             <div className="absolute inset-0 bg-black/10 backdrop-blur-sm transition-all animate-in fade-in duration-200" onClick={() => setDrawerOpen(false)} />

             <div className="w-[380px] h-full bg-white dark:bg-slate-900 shadow-2xl relative z-10 flex flex-col animate-in slide-in-from-right duration-300 border-l border-slate-200 dark:border-slate-700">
                 {(() => {
                     const p = projectById[drawerProjectId];
                     if (!p) return null;
                     return (
                         <>
                             <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between bg-slate-50/50 dark:bg-slate-800/50">
                                 <div className="flex items-center gap-3">
                                     <div className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm"><User className="w-5 h-5 text-slate-600 dark:text-slate-300" /></div>
                                     <div>
                                         <h2 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">{p.name}</h2>
                                         <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Customer: <span className="font-medium text-slate-700 dark:text-slate-300">{p.customer || "Unknown"}</span></div>
                                     </div>
                                 </div>
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                       <button onClick={() => setDrawerOpen(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       Close drawer
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                             </div>
                             <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                                 <div>
                                     <h3 className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wide">Owners</h3>
                                     <div className="space-y-3">
                                         <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Account Rep</label>
                                                <select className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-200" value={p.accountRepId || ""} onChange={() => {}}>
                                                    <option value="">None</option>
                                                    {allUsers.map((u) => (
                                                      <option key={u.id} value={u.id}>{u.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 mb-1">Primary Eng.</label>
                                                <select className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-200" value={p.primaryEngineerId || ""} onChange={() => {}}>
                                                    <option value="">None</option>
                                                    {allUsers.map((u) => (
                                                      <option key={u.id} value={u.id}>{u.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                         </div>
                                         <div>
                                             <label className="block text-[10px] font-medium text-slate-500 mb-1">Specialist Eng.</label>
                                             <select className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-200" value={p.specialistEngineerId || ""} onChange={() => {}}>
                                                  <option value="">None</option>
                                                  {allUsers.map((u) => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                  ))}
                                             </select>
                                         </div>
                                     </div>
                                 </div>

                                 <div>
                                     <h3 className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wide flex items-center gap-2">
                                       <Calendar className="w-3.5 h-3.5" />
                                       Project Timeline
                                     </h3>
                                     <div className="space-y-3">
                                         <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                                                  <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                                  Start Date
                                                </label>
                                                <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                                  {p.startDate ? new Date(p.startDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                                                  <Calendar className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                                  End Date
                                                </label>
                                                <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                                  {p.endDate ? new Date(p.endDate).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—'}
                                                </div>
                                            </div>
                                         </div>
                                         <div>
                                             <label className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                                               <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                               Duration
                                             </label>
                                             <div className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                                               {(() => {
                                                 if (!p.startDate || !p.endDate) return '—';
                                                 try {
                                                   const start = new Date(p.startDate);
                                                   const end = new Date(p.endDate);
                                                   if (isNaN(start.getTime()) || isNaN(end.getTime())) return '—';
                                                   const diffTime = Math.abs(end.getTime() - start.getTime());
                                                   const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                   return `${diffDays} days`;
                                                 } catch {
                                                   return '—';
                                                 }
                                               })()}
                                             </div>
                                         </div>
                                     </div>
                                 </div>

                                 <div>
                                     <h3 className="text-xs uppercase font-bold text-slate-400 mb-3 tracking-wide">Notes</h3>
                                     <textarea className="w-full field-sizing-content min-h-[80px] max-h-[400px] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded p-3 text-sm text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 focus:ring-1 focus:ring-blue-500 resize-none" placeholder="Add a quick note about this opportunity..." defaultValue={p.notes} />
                                 </div>

                                 <div className="bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-100 dark:border-blue-800 p-3 flex gap-3 items-start">
                                     <AlertTriangle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                                     <div className="text-xs text-blue-800 dark:text-blue-200">
                                         Changes are optimistic and will be audited only when <strong>saved</strong> via the board action.
                                     </div>
                                 </div>
                             </div>
                             <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                                 <span>Updated {new Date(p.updatedAt || Date.now()).toLocaleString()}</span>
                                 <TooltipProvider>
                                   <Tooltip>
                                     <TooltipTrigger asChild>
                                       <button className="flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors" onClick={() => { copyToClipboard(location.href); showSuccessToast('Link copied'); }}>
                                           <Link className="w-3.5 h-3.5" /> Copy Link
                                       </button>
                                     </TooltipTrigger>
                                     <TooltipContent>
                                       Copy project link
                                     </TooltipContent>
                                   </Tooltip>
                                 </TooltipProvider>
                             </div>
                         </>
                     );
                 })()}
             </div>
         </div>
      )}

      <Card className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
        <DecorativeCardIcon icon={SquareKanban} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between gap-4 w-full">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <SquareKanban className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              {pageTitle}
              <DirtyDot show={unsavedChanges} />
            </CardTitle>

            <div className="flex items-center gap-3 pl-4 border-l border-slate-100 dark:border-slate-700">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded transition-colors border ${showAudit ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border-transparent'}`} onClick={() => setShowAudit((v) => !v)}>
                      <History className="w-3.5 h-3.5" /> Audit Log
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open audit trail
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <div className="h-8 w-px bg-slate-100 dark:bg-slate-700" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-8 flex items-center px-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors rounded cursor-pointer" onClick={() => setCompactMode(!compactMode)}>
                    <input 
                      type="checkbox" 
                      checked={compactMode} 
                      onChange={(e) => setCompactMode(e.target.checked)}
                      className="w-3.5 h-3.5 text-blue-600 rounded focus:ring-blue-500 border-gray-300 dark:border-slate-600 dark:bg-slate-700 cursor-pointer"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="ml-1.5 text-[10px] font-medium text-slate-600 dark:text-slate-300 select-none">Compact</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Toggle Compact Project Cards
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" onClick={() => { copyToClipboard(location.href); showSuccessToast("Snapshot link copied."); }}>
                    <Share2 className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Copy snapshot link
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" onClick={exportPNG}>
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Export PNG
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" onClick={exportPDF}>
                    <FileText className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Export PDF
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" onClick={exportBoardSummaryCSV}>
                    <Download className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Export Board Summary CSV
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 transition-colors" onClick={exportProjectDataCSV}>
                    <Table className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Export Full Project Data CSV
                </TooltipContent>
              </Tooltip>

              <div className="h-8 w-px bg-slate-100 dark:bg-slate-700" />

              <div className="flex items-center gap-2 text-xs">
                <label className="text-slate-500 dark:text-slate-400 font-medium">Auto-save</label>
                <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} title="Enable auto-save" className="accent-blue-600" />
                <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1" />
                <input type="number" min={5} max={120} value={autoSaveDelaySec} onChange={(e) => setAutoSaveDelaySec(Number(e.target.value))} className="w-8 text-center border-b border-dashed border-slate-300 dark:border-slate-600 bg-transparent text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500" title="Delay (sec)" />
                <span className="text-slate-400">s</span>
              </div>

              {unsavedChanges && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={resetAll} className="p-2 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm text-slate-600 dark:text-slate-400 transition-colors">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Reset all moves & column order to initial (not saved)
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={saveChanges} className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow transition-all">
                        <Save className="w-4 h-4" /> Save Changes
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Save card moves and column order
                    </TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </div>

          <CardDescription>
            This board tracks all opportunities by status, providing matrix views for resource allocation and pipeline health. 
            Use the swimlanes to filter by ownership (People) and the advanced filters for hygiene (Process).
          </CardDescription>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col min-h-0 p-0 relative z-10">
          {filterContainerRef?.current ? (
            createPortal(
              <div className={showTeams ? "grid grid-cols-1 md:grid-cols-[auto_repeat(7,1fr)] gap-3" : "grid grid-cols-1 md:grid-cols-[auto_repeat(6,1fr)] gap-3"}>

        <div className="flex items-center pt-[26px]">
           <IconToggleSwitch 
              checked={mode === "nonEditable"} 
              onChange={(val) => handleModeChange(val ? "nonEditable" : "editable")}
              iconLeft={<PencilRuler size={16} />}
              iconRight={<FolderKanban size={16} />}
              titleLeft="Editable Mode"
              titleRight="Static View"
           />
        </div>

        {mode === "editable" ? (
          <div>
             <FilterLabel>Group By</FilterLabel>
             <div className="relative group">
                <select 
                    className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                    value={dimension} 
                    onChange={(e) => handleDimensionChange(e.target.value as StatusDimension)}
                    title="Choose status dimension"
                >
                   <option value="internal">Internal Status</option>
                   <option value="risk">Risk Level</option>
                   <option value="ranking">Ranking</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
             </div>
          </div>
        ) : (
          <div>
             <FilterLabel>Static View</FilterLabel>
             <div className="relative group">
                <select 
                    className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                    value={nonEditableDim} 
                    onChange={(e) => { setNonEditableDim(e.target.value as NonEditableDimension); setByAccountPage(0); }} 
                    title="Choose non-editable dimension"
                >
                  <option value="salesStage">Sales Stages</option>
                  <option value="forecastCategory">Forecast Categories</option>
                  <option value="acvBands">ACV Bands</option>
                  <option value="customerStatus">Account Status</option>
                  <option value="loe">LOE (days)</option>
                  <option value="byAccount">By Account</option>
                  <option value="byDate">Updated By Date</option>
                  <option value="solutions">Solutions</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
             </div>
          </div>
        )}

        <div>
           <FilterLabel>Swimlanes</FilterLabel>
           <div className="relative group">
              <select 
                  className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                  value={swimlaneDim}
                  onChange={(e) => setSwimlaneDim(e.target.value as SwimlaneDimension)}
                  title="Group rows by..."
              >
                 <option value="none">None</option>
                 <option value="rep">Account Rep</option>
                 <option value="primary_se">Primary SE</option>
                 <option value="specialist_se">Specialist SE</option>
              </select>
              <Rows className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Filter Scope</FilterLabel>
           <div className="relative group">
             <select className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-9 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full" value={view} onChange={(e) => setView(e.target.value as any)} title="Choose scope">
               <option value="all">All Projects</option>
               <option value="mine">Assigned to Me</option>
             </select>
             <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Industry</FilterLabel>
           <div className="relative group">
             <select 
               className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
               value={industryFilter ?? ""}
               onChange={(e) => setIndustryFilter(e.target.value ? Number(e.target.value) : null)}
               title="Filter by industry"
             >
               <option value="">All Industries</option>
               {industries.map((ind: any) => (
                 <option key={ind.id} value={ind.id}>{ind.name}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        {teamFilterControl}

        <div>
           <FilterLabel>Region</FilterLabel>
           <div className="relative group">
             <select 
               className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
               value={regionFilters.length === 0 ? "" : regionFilters.length === 1 ? regionFilters[0] : "multiple"}
               onChange={(e) => {
                 const val = e.target.value;
                 if (val === "" || val === "multiple") {
                   setRegionFilters([]);
                 } else {
                   setRegionFilters(prev => 
                     prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val]
                   );
                 }
               }}
               title="Filter by region"
             >
               <option value="">All Regions</option>
               {regionFilters.length > 1 && <option value="multiple" disabled>Multiple ({regionFilters.length})</option>}
               {uniqueRegions.map((region) => (
                 <option key={region} value={region}>{region} {regionFilters.includes(region) ? "✓" : ""}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Search</FilterLabel>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project name, customer..." className="w-full pl-10 pr-2 h-9 text-sm bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100 border shadow-sm" />
           </div>
        </div>
        </div>,
              filterContainerRef.current
            )
          ) : null}
          
          {filterContainerRef?.current && showAdvancedFilters && createPortal(
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm mt-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-3 gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-400">
                            <Users className="w-4 h-4" />
                            <h3 className="text-xs font-bold uppercase tracking-wide">People (Team & Coverage)</h3>
                        </div>
                        <div className="space-y-2">
                            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                <input 
                                  type="checkbox" 
                                  checked={filterSeOverload}
                                  onChange={(e) => setFilterSeOverload(e.target.checked)}
                                  className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                />
                                <div>
                                    <span className="font-medium">SE Overload</span>
                                    <p className="text-[10px] text-slate-400">Primary Eng has &gt;5 active POCs</p>
                                </div>
                            </label>
                            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterMissingCoverage}
                                   onChange={(e) => setFilterMissingCoverage(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">Missing Coverage</span>
                                     <p className="text-[10px] text-slate-400">Opp has Account Rep but no Engineer assigned</p>
                                 </div>
                            </label>
                            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterRepSePairing}
                                   onChange={(e) => {
                                     setFilterRepSePairing(e.target.checked);
                                     if (!e.target.checked) {
                                       setFilterRepSePairingRepId(null);
                                       setFilterRepSePairingSearch("");
                                     }
                                   }}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">Rep-SE Pairing</span>
                                     <p className="text-[10px] text-slate-400">My projects with selected Sales Rep</p>
                                 </div>
                            </label>
                            {filterRepSePairing && (
                              <div className="ml-6 mt-1">
                                <input
                                  type="text"
                                  placeholder="Search Sales Reps..."
                                  value={filterRepSePairingSearch}
                                  onChange={(e) => setFilterRepSePairingSearch(e.target.value)}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 mb-1"
                                />
                                <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700">
                                  {salesUsers
                                    .filter((u: any) => 
                                      filterRepSePairingSearch === "" || 
                                      u.name.toLowerCase().includes(filterRepSePairingSearch.toLowerCase()) ||
                                      u.email.toLowerCase().includes(filterRepSePairingSearch.toLowerCase())
                                    )
                                    .slice(0, 50)
                                    .map((u: any) => (
                                      <button
                                        key={u.id}
                                        onClick={() => setFilterRepSePairingRepId(u.id)}
                                        className={`w-full text-left px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-600 ${filterRepSePairingRepId === u.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}
                                      >
                                        {u.name}
                                      </button>
                                    ))}
                                  {salesUsers.length === 0 && (
                                    <div className="px-2 py-1 text-xs text-slate-400">No Sales users found</div>
                                  )}
                                </div>
                              </div>
                            )}
                            <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterOverEngineer}
                                   onChange={(e) => setFilterOverEngineer(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">OverEngineer</span>
                                     <p className="text-[10px] text-slate-400">Projects with more than X engineers (2-9)</p>
                                 </div>
                            </label>
                            {filterOverEngineer && (
                              <div className="ml-6 mt-1 flex items-center gap-2">
                                <span className="text-xs text-slate-500">More than:</span>
                                <input
                                  type="number"
                                  min={2}
                                  max={9}
                                  value={filterOverEngineerCount}
                                  onChange={(e) => setFilterOverEngineerCount(Math.min(9, Math.max(2, parseInt(e.target.value) || 2)))}
                                  className="w-14 px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                                />
                                <span className="text-xs text-slate-400">engineers</span>
                              </div>
                            )}
                        </div>
                    </div>

                    <div className="border-l border-slate-100 dark:border-slate-700 pl-6">
                        <div className="flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-400">
                            <Clock className="w-4 h-4" />
                            <h3 className="text-xs font-bold uppercase tracking-wide">Process (Health & Hygiene)</h3>
                        </div>
                        <div className="space-y-2">
                             <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterStaleOpportunities}
                                   onChange={(e) => setFilterStaleOpportunities(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">Stale Opportunities</span>
                                     <p className="text-[10px] text-slate-400">No updates in &gt;30 days</p>
                                 </div>
                             </label>
                             <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterHighValueLowActivity}
                                   onChange={(e) => setFilterHighValueLowActivity(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">High Value / Low Activity</span>
                                     <p className="text-[10px] text-slate-400">ACV &gt;$100k and inactive &gt;10 days</p>
                                 </div>
                             </label>
                             <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterNoCurrentSituation}
                                   onChange={(e) => setFilterNoCurrentSituation(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">No Current Situation / Next Steps</span>
                                     <p className="text-[10px] text-slate-400">Active projects missing TAP situation field</p>
                                 </div>
                             </label>
                        </div>
                    </div>

                    <div className="border-l border-slate-100 dark:border-slate-700 pl-6">
                        <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                            <Briefcase className="w-4 h-4" />
                            <h3 className="text-xs font-bold uppercase tracking-wide">Product (Strategy & Risk)</h3>
                        </div>
                        <div className="space-y-2">
                             <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                                 <input 
                                   type="checkbox" 
                                   checked={filterMultiProduct}
                                   onChange={(e) => {
                                     setFilterMultiProduct(e.target.checked);
                                     if (!e.target.checked) {
                                       setFilterMultiProductCounts(new Set());
                                     }
                                   }}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                 />
                                 <div>
                                     <span className="font-medium">Multi-Product Deals</span>
                                     <p className="text-[10px] text-slate-400">Filter by number of products/solutions</p>
                                 </div>
                             </label>
                             {filterMultiProduct && (
                               <div className="ml-6 mt-1 flex flex-wrap gap-2">
                                 {["1", "2", "3", "4", "5+"].map((count) => (
                                   <label key={count} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                     <input
                                       type="checkbox"
                                       checked={filterMultiProductCounts.has(count)}
                                       onChange={(e) => {
                                         const newSet = new Set(filterMultiProductCounts);
                                         if (e.target.checked) {
                                           newSet.add(count);
                                         } else {
                                           newSet.delete(count);
                                         }
                                         setFilterMultiProductCounts(newSet);
                                       }}
                                       className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700"
                                     />
                                     <span>{count}</span>
                                   </label>
                                 ))}
                               </div>
                             )}
                             <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer opacity-50">
                                 <input 
                                   type="checkbox" 
                                   checked={filterCompetitorPresence}
                                   onChange={(e) => setFilterCompetitorPresence(e.target.checked)}
                                   className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                                   disabled
                                 />
                                 <div>
                                     <span className="font-medium">Competitor Presence</span>
                                     <p className="text-[10px] text-slate-400">Coming soon</p>
                                 </div>
                             </label>
                        </div>
                    </div>
                </div>
            </div>,
            filterContainerRef.current
          )}

          {!filterContainerRef?.current && (
            <div className="mx-6">
            <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
            <div className={showTeams ? "grid grid-cols-1 md:grid-cols-[auto_repeat(7,1fr)] gap-3" : "grid grid-cols-1 md:grid-cols-[auto_repeat(6,1fr)] gap-3"}>

        <div className="flex items-center pt-[26px]">
           <IconToggleSwitch 
              checked={mode === "nonEditable"} 
              onChange={(val) => handleModeChange(val ? "nonEditable" : "editable")}
              iconLeft={<PencilRuler size={16} />}
              iconRight={<FolderKanban size={16} />}
              titleLeft="Editable Mode"
              titleRight="Static View"
           />
        </div>

        {mode === "editable" ? (
          <div>
             <FilterLabel>Group By</FilterLabel>
             <div className="relative group">
                <select 
                    className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                    value={dimension} 
                    onChange={(e) => handleDimensionChange(e.target.value as StatusDimension)}
                    title="Choose status dimension"
                >
                   <option value="internal">Internal Status</option>
                   <option value="risk">Risk Level</option>
                   <option value="ranking">Ranking</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
             </div>
          </div>
        ) : (
          <div>
             <FilterLabel>Static View</FilterLabel>
             <div className="relative group">
                <select 
                    className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                    value={nonEditableDim} 
                    onChange={(e) => { setNonEditableDim(e.target.value as NonEditableDimension); setByAccountPage(0); }} 
                    title="Choose non-editable dimension"
                >
                  <option value="salesStage">Sales Stages</option>
                  <option value="forecastCategory">Forecast Categories</option>
                  <option value="acvBands">ACV Bands</option>
                  <option value="customerStatus">Account Status</option>
                  <option value="loe">LOE (days)</option>
                  <option value="byAccount">By Account</option>
                  <option value="byDate">Updated By Date</option>
                  <option value="solutions">Solutions</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
             </div>
          </div>
        )}

        <div>
           <FilterLabel>Swimlanes</FilterLabel>
           <div className="relative group">
              <select 
                  className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
                  value={swimlaneDim}
                  onChange={(e) => setSwimlaneDim(e.target.value as SwimlaneDimension)}
                  title="Group rows by..."
              >
                 <option value="none">None</option>
                 <option value="rep">Account Rep</option>
                 <option value="primary_se">Primary SE</option>
                 <option value="specialist_se">Specialist SE</option>
              </select>
              <Rows className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Filter Scope</FilterLabel>
           <div className="relative group">
             <select className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-9 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full" value={view} onChange={(e) => setView(e.target.value as any)} title="Choose scope">
               <option value="all">All Projects</option>
               <option value="mine">Assigned to Me</option>
             </select>
             <ShieldAlert className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Industry</FilterLabel>
           <div className="relative group">
             <select 
               className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
               value={industryFilter ?? ""}
               onChange={(e) => setIndustryFilter(e.target.value ? Number(e.target.value) : null)}
               title="Filter by industry"
             >
               <option value="">All Industries</option>
               {industries.map((ind: any) => (
                 <option key={ind.id} value={ind.id}>{ind.name}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        {teamFilterControl}

        <div>
           <FilterLabel>Region</FilterLabel>
           <div className="relative group">
             <select 
               className="appearance-none bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 rounded-md pl-3 pr-8 h-9 text-sm font-semibold text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 cursor-pointer border shadow-sm w-full"
               value={regionFilters.length === 0 ? "" : regionFilters.length === 1 ? regionFilters[0] : "multiple"}
               onChange={(e) => {
                 const val = e.target.value;
                 if (val === "" || val === "multiple") {
                   setRegionFilters([]);
                 } else {
                   setRegionFilters(prev => 
                     prev.includes(val) ? prev.filter(r => r !== val) : [...prev, val]
                   );
                 }
               }}
               title="Filter by region"
             >
               <option value="">All Regions</option>
               {regionFilters.length > 1 && <option value="multiple" disabled>Multiple ({regionFilters.length})</option>}
               {uniqueRegions.map((region) => (
                 <option key={region} value={region}>{region} {regionFilters.includes(region) ? "✓" : ""}</option>
               ))}
             </select>
             <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none group-hover:text-slate-600" />
           </div>
        </div>

        <div>
           <FilterLabel>Search</FilterLabel>
           <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Project name, customer..." className="w-full pl-10 pr-2 h-9 text-sm bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-700 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all text-slate-900 dark:text-slate-100 border shadow-sm" />
           </div>
        </div>
        </div>

      {showAdvancedFilters && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm mt-4 animate-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-3 gap-6">
                <div>
                    <div className="flex items-center gap-2 mb-3 text-blue-700 dark:text-blue-400">
                        <Users className="w-4 h-4" />
                        <h3 className="text-xs font-bold uppercase tracking-wide">People (Team & Coverage)</h3>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={filterSeOverload}
                              onChange={(e) => setFilterSeOverload(e.target.checked)}
                              className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                            />
                            <div>
                                <span className="font-medium">SE Overload</span>
                                <p className="text-[10px] text-slate-400">Primary Eng has &gt;5 active POCs</p>
                            </div>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterMissingCoverage}
                               onChange={(e) => setFilterMissingCoverage(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">Missing Coverage</span>
                                 <p className="text-[10px] text-slate-400">Opp has Account Rep but no Engineer assigned</p>
                             </div>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterRepSePairing}
                               onChange={(e) => {
                                 setFilterRepSePairing(e.target.checked);
                                 if (!e.target.checked) {
                                   setFilterRepSePairingRepId(null);
                                   setFilterRepSePairingSearch("");
                                 }
                               }}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">Rep-SE Pairing</span>
                                 <p className="text-[10px] text-slate-400">My projects with selected Sales Rep</p>
                             </div>
                        </label>
                        {filterRepSePairing && (
                          <div className="ml-6 mt-1">
                            <input
                              type="text"
                              placeholder="Search Sales Reps..."
                              value={filterRepSePairingSearch}
                              onChange={(e) => setFilterRepSePairingSearch(e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 mb-1"
                            />
                            <div className="max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700">
                              {salesUsers
                                .filter((u: any) => 
                                  filterRepSePairingSearch === "" || 
                                  u.name.toLowerCase().includes(filterRepSePairingSearch.toLowerCase()) ||
                                  u.email.toLowerCase().includes(filterRepSePairingSearch.toLowerCase())
                                )
                                .slice(0, 50)
                                .map((u: any) => (
                                  <button
                                    key={u.id}
                                    onClick={() => setFilterRepSePairingRepId(u.id)}
                                    className={`w-full text-left px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-600 ${filterRepSePairingRepId === u.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'}`}
                                  >
                                    {u.name}
                                  </button>
                                ))}
                              {salesUsers.length === 0 && (
                                <div className="px-2 py-1 text-xs text-slate-400">No Sales users found</div>
                              )}
                            </div>
                          </div>
                        )}
                        <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterOverEngineer}
                               onChange={(e) => setFilterOverEngineer(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">OverEngineer</span>
                                 <p className="text-[10px] text-slate-400">Projects with more than X engineers (2-9)</p>
                             </div>
                        </label>
                        {filterOverEngineer && (
                          <div className="ml-6 mt-1 flex items-center gap-2">
                            <span className="text-xs text-slate-500">More than:</span>
                            <input
                              type="number"
                              min={2}
                              max={9}
                              value={filterOverEngineerCount}
                              onChange={(e) => setFilterOverEngineerCount(Math.min(9, Math.max(2, parseInt(e.target.value) || 2)))}
                              className="w-14 px-2 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                            />
                            <span className="text-xs text-slate-400">engineers</span>
                          </div>
                        )}
                    </div>
                </div>

                <div className="border-l border-slate-100 dark:border-slate-700 pl-6">
                    <div className="flex items-center gap-2 mb-3 text-indigo-700 dark:text-indigo-400">
                        <Clock className="w-4 h-4" />
                        <h3 className="text-xs font-bold uppercase tracking-wide">Process (Health & Hygiene)</h3>
                    </div>
                    <div className="space-y-2">
                         <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterStaleOpportunities}
                               onChange={(e) => setFilterStaleOpportunities(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">Stale Opportunities</span>
                                 <p className="text-[10px] text-slate-400">No updates in &gt;30 days</p>
                             </div>
                         </label>
                         <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterHighValueLowActivity}
                               onChange={(e) => setFilterHighValueLowActivity(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">High Value / Low Activity</span>
                                 <p className="text-[10px] text-slate-400">ACV &gt;$100k and inactive &gt;10 days</p>
                             </div>
                         </label>
                         <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterNoCurrentSituation}
                               onChange={(e) => setFilterNoCurrentSituation(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">No Current Situation / Next Steps</span>
                                 <p className="text-[10px] text-slate-400">Active projects missing TAP situation field</p>
                             </div>
                         </label>
                    </div>
                </div>

                <div className="border-l border-slate-100 dark:border-slate-700 pl-6">
                    <div className="flex items-center gap-2 mb-3 text-emerald-700 dark:text-emerald-400">
                        <Briefcase className="w-4 h-4" />
                        <h3 className="text-xs font-bold uppercase tracking-wide">Product (Strategy & Risk)</h3>
                    </div>
                    <div className="space-y-2">
                         <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer">
                             <input 
                               type="checkbox" 
                               checked={filterMultiProduct}
                               onChange={(e) => {
                                 setFilterMultiProduct(e.target.checked);
                                 if (!e.target.checked) {
                                   setFilterMultiProductCounts(new Set());
                                 }
                               }}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                             />
                             <div>
                                 <span className="font-medium">Multi-Product Deals</span>
                                 <p className="text-[10px] text-slate-400">Filter by number of products/solutions</p>
                             </div>
                         </label>
                         {filterMultiProduct && (
                           <div className="ml-6 mt-1 flex flex-wrap gap-2">
                             {["1", "2", "3", "4", "5+"].map((count) => (
                               <label key={count} className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                                 <input
                                   type="checkbox"
                                   checked={filterMultiProductCounts.has(count)}
                                   onChange={(e) => {
                                     const newSet = new Set(filterMultiProductCounts);
                                     if (e.target.checked) {
                                       newSet.add(count);
                                     } else {
                                       newSet.delete(count);
                                     }
                                     setFilterMultiProductCounts(newSet);
                                   }}
                                   className="rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700"
                                 />
                                 <span>{count}</span>
                               </label>
                             ))}
                           </div>
                         )}
                         <label className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer opacity-50">
                             <input 
                               type="checkbox" 
                               checked={filterCompetitorPresence}
                               onChange={(e) => setFilterCompetitorPresence(e.target.checked)}
                               className="mt-0.5 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-0 bg-slate-100 dark:bg-slate-700" 
                               disabled
                             />
                             <div>
                                 <span className="font-medium">Competitor Presence</span>
                                 <p className="text-[10px] text-slate-400">Coming soon</p>
                             </div>
                         </label>
                    </div>
                </div>
            </div>
        </div>
      )}
      </SearchFiltersSection>
      </div>
          )}

      <div id="board-scroll" className="flex-1 flex flex-col gap-6 overflow-y-auto pb-4 min-h-0 px-6 mx-6">
        {swimlaneGroups.map((group) => (
          <div key={group.id} className="flex flex-col">
            {swimlaneDim !== "none" && (
               <div className="sticky left-0 z-10 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur py-2 px-1 border-b border-slate-200 dark:border-slate-700 mb-2 flex items-center gap-2">
                  <div className={`w-1 h-4 rounded-full ${group.id === "_unset" ? "bg-slate-300" : "bg-blue-500"}`} />
                  <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">
                     {group.title}
                     <span className="ml-2 text-xs font-normal text-slate-400 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                        {group.projects.length} Deals · {humanMoney(sum(group.projects.map(p => p.acv || 0)))}
                     </span>
                  </h3>
               </div>
            )}

            <div className="flex items-start gap-0 px-1">
               {mode === "nonEditable" &&
                 Object.entries(paginatedNonEditableColumns.columns).map(([id, info], index) => {
                   const list = info.list.filter(p => group.projects.includes(p));
                   const isEmpty = list.length === 0;
                   const collapsed = !!collapsedByColumn[id];

                   const columnColor = nonEditableDim === "acvBands" ? getAcvBandBackgroundColor(index) : info.color;

                   return (
                     <Column
                       key={`${group.id}-${id}`}
                       dimLabel={DISPLAY_NAME_BY_NON_EDITABLE[nonEditableDim]}
                       title={info.title}
                       statusId={id}
                       color={columnColor}
                       count={list.length}
                       statsContent={renderStats(list)}
                       isDragging={!!activeId}
                       droppable={false}
                       isEmpty={isEmpty}
                       statsOpen={!!statsOpenByColumn[id]}
                       onToggleStats={() => setStatsOpenByColumn((prev) => ({ ...prev, [id]: !prev[id] }))}
                       onColumnRef={(cid, el) => { if(group.id === "default") registerColumn(cid, el) }}
                       onColumnScroll={rememberScroll}
                       collapsed={collapsed}
                       onToggleCollapsed={() => toggleCollapsed(id)}
                       onTempSortACV={() => {}}
                       onTempSortLOE={() => {}}
                       icon={info.icon}
                       useDirectBackgroundColor={nonEditableDim === "acvBands"}
                     >
                       {!isEmpty &&
                         list.map((p) => (
                           <div 
                             key={p.id} 
                             className="min-w-0 cursor-pointer"
                             onClick={() => {
                               setDrawerProjectId(String(p.id));
                               setDrawerOpen(true);
                             }}
                           >
                             <ProjectCard project={p} compactMode={compactMode} roles={roles} tagsLookup={tagsLookup} />
                           </div>
                         ))}
                     </Column>
                   );
                 })}

               {mode === "editable" && dndMounted && (
                 <DndContext
                   key={`${group.id}-${dndEpoch}`}
                   sensors={sensors}
                   collisionDetection={smartCollision}
                   autoScroll={false}
                   onDragStart={({ active }) => handleDragStart(active)}
                   onDragCancel={() => { setActiveId(null); dragOriginRef.current = null; document.body.style.cursor = ""; }}
                   onDragOver={(e) => handleDragOver(e)}
                   onDragEnd={(e) => handleDragEnd(e)}
                 >
                   <SortableContext id={`columns-${dimension}-${group.id}`} items={columnIdsForDim.map((id) => `col-${id}`)} strategy={horizontalListSortingStrategy} disabled={!isAdmin}>
                     {columnIdsForDim.map((statusId) => {
                       const s = statusList.find((x) => x.id === statusId) || { id: statusId, label: statusId, color: "#9CA3AF", icon: undefined };
                       const allIdsInCol = order[dimension][s.id] || [];
                       const groupProjectIds = new Set(group.projects.map(p => String(p.id)));
                       const ids = allIdsInCol.filter(id => groupProjectIds.has(id));

                       const isEmpty = ids.length === 0;
                       const collapsed = !!collapsedByColumn[s.id];

                       const columnProjects = ids.map(id => projectById[id]).filter(Boolean);

                       return (
                         <ColumnShell key={`col-${s.id}-${group.id}-${dndEpoch}`} sortableId={`col-${s.id}`} disabled={!isAdmin}>
                           <Column
                             dimLabel={DISPLAY_NAME_BY_EDITABLE_DIM[dimension]}
                             title={s.label}
                             statusId={`${group.id}::${s.id}`}
                             color={s.color}
                             count={ids.length}
                             statsContent={renderStats(columnProjects)}
                             isDragging={!!activeId}
                             droppable
                             isEmpty={isEmpty}
                             statsOpen={!!statsOpenByColumn[s.id]}
                             onToggleStats={() => setStatsOpenByColumn((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                             onColumnRef={(cid, el) => { if(group.id === "default") registerColumn(cid, el) }}
                             onColumnScroll={rememberScroll}
                             collapsed={collapsed}
                             onToggleCollapsed={() => toggleCollapsed(s.id)}
                             onTempSortACV={() => tempSortACV(s.id)}
                             onTempSortLOE={() => tempSortLOE(s.id)}
                             icon={s.icon}
                           >
                             <SortableContext id={`${group.id}::${s.id}`} items={ids} strategy={verticalListSortingStrategy} key={`${s.id}-sortable-${dndEpoch}`}>
                               {isEmpty ? (
                                 <div className="min-h-[120px] flex items-center justify-center text-slate-400 dark:text-slate-600 text-sm">
                                   Drop projects here
                                 </div>
                               ) : (
                                 ids.map((id) => {
                                   const p = projectById[id]; if (!p) return null;
                                   const showUndo = !!undoMap[id];
                                   const isDirty = dirtyIds.has(id) && (!!optimisticDragStatuses[id] || !!pendingStatus[dimension]?.[id]);
                                   return (
                                     <div key={`${p.id}-${dndEpoch}`} className="min-w-0">
                                       <DraggableProjectCard
                                         project={p}
                                         isActive={activeId === String(p.id)}
                                         disabled={!canEditProjects}
                                         onClick={() => {
                                             setDrawerProjectId(String(p.id));
                                             setDrawerOpen(true);
                                         }}
                                         isDirty={isDirty}
                                         showUndo={showUndo}
                                         roles={roles}
                                         tagsLookup={tagsLookup}
                                         onUndo={() => {
                                            const prevInfo = undoMap[id];
                                            if (!prevInfo) return;
                                            setOrder((prev) => {
                                              const nextDim = { ...prev[dimension] } as Record<string, string[]>;
                                              Object.keys(nextDim).forEach((k) => nextDim[k] = nextDim[k].filter((x) => x !== id));
                                              const list = nextDim[prevInfo.fromStatus] || [];
                                              const insert = Math.min(Math.max(0, prevInfo.fromIndex), list.length);
                                              list.splice(insert, 0, id);
                                              nextDim[prevInfo.fromStatus] = list;
                                              return { ...prev, [dimension]: nextDim } as typeof prev;
                                            });
                                            setPendingStatus((prev) => {
                                              const copy = { ...prev };
                                              const m = { ...(copy[dimension] || {}) };
                                              delete m[id];
                                             copy[dimension] = m;
                                              return copy;
                                            });
                                            clearDirty(id);
                                            setUndoMap((prev) => {
                                              const cp = { ...prev }; delete cp[id]; return cp;
                                            });
                                         }}
                                         compactMode={compactMode}
                                       />
                                     </div>
                                   );
                                 })
                               )}
                             </SortableContext>
                           </Column>
                         </ColumnShell>
                       );
                     })}
                   </SortableContext>

                   <DragOverlay key={`overlay-${dndEpoch}`}>
                     {activeId && !activeId.startsWith("col-") ? <ProjectCard project={projectById[activeId]} isActive isDirty={dirtyIds.has(activeId)} compactMode={compactMode} roles={roles} tagsLookup={tagsLookup} /> : null}
                   </DragOverlay>
                 </DndContext>
               )}
            </div>
          </div>
        ))}

        {mode === "nonEditable" && nonEditableDim === "byAccount" && paginatedNonEditableColumns.totalPages > 1 && (
          <div className="sticky bottom-0 bg-slate-50/95 dark:bg-slate-900/95 backdrop-blur py-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-4">
            <button
              onClick={() => setByAccountPage(p => Math.max(0, p - 1))}
              disabled={paginatedNonEditableColumns.currentPage === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">
              Page {paginatedNonEditableColumns.currentPage + 1} of {paginatedNonEditableColumns.totalPages}
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                ({paginatedNonEditableColumns.totalAccounts} accounts)
              </span>
            </span>
            <button
              onClick={() => setByAccountPage(p => Math.min(paginatedNonEditableColumns.totalPages - 1, p + 1))}
              disabled={paginatedNonEditableColumns.currentPage >= paginatedNonEditableColumns.totalPages - 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={showDimensionConfirm}
        onOpenChange={setShowDimensionConfirm}
        title="Unsaved Changes Will Be Lost"
        description="You have unsaved project moves. Switching the group by dimension will discard these changes. Do you want to continue?"
        confirmLabel="Discard & Switch"
        cancelLabel="Cancel"
        onConfirm={confirmDimensionChange}
        onCancel={() => setPendingDimension(null)}
        variant="warning"
      />

      <ConfirmationDialog
        open={showModeConfirm}
        onOpenChange={setShowModeConfirm}
        title="Unsaved Changes Will Be Lost"
        description="You have unsaved project moves. Switching to Static View will discard these changes. Do you want to continue?"
        confirmLabel="Discard & Switch"
        cancelLabel="Cancel"
        onConfirm={confirmModeChange}
        onCancel={() => setPendingMode(null)}
        variant="warning"
      />
    </div>
  );
}
