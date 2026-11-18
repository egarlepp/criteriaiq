import { SolutionGraphic, hasSolutionMark } from "@/components/ui/solution-graphic";
import { useState, useMemo, useCallback, useEffect, RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { DependencySheet, type ProjectDependencyRecord } from "@/components/shared/assumption-dependency-sheets";
import type { StatusConfig } from "@shared/schema";
import { formatDateForDisplay } from "@/lib/date-utils";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableHead,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { CategoriesManagementPanel } from "@/components/projects/AssumptionsLibraryTab";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemWithIcon,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Link2,
  Unlink2,
  Settings,
  Plus,
  Edit,
  Trash2,
  FolderHeart,
  FolderCog,
  FolderLock,
  FolderClock,
  ChevronDown,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
  ExternalLink,
  FolderOpen,
  TrendingUp,
  DollarSign,
  Target,
  X,
  ClipboardList,
  Save,
  Tag,
  Circle,
  CircleCheckBig,
  OctagonX,
  Siren,
  Info,
  Check,
  ChevronsUpDown,
  User,
} from "lucide-react";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricCard } from "@/components/shared/MetricCard";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DependencyCategory {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

interface DependencyRecord {
  id: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: DependencyCategory | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  isAllSolutions?: boolean | null;
  librarySolutionIds?: number[] | null;
  libraryIsAllSolutions?: boolean | null;
  projectId?: number | null;
  dependencyId?: number | null;
  owner?: string | null;
  dueDate?: string | null;
  status?: "open" | "in_review" | "blocking" | "resolved" | "fail" | "blocked" | "inconclusive" | null;
  projectSolutionIds?: number[] | null;
  successCriteriaIds?: number[] | null;
  assignedUserIds?: string[] | null;
  assignedCustomerEmails?: string[] | null;
  assignedTeams?: string[] | null;
  libraryItem?: Record<string, unknown> | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

interface ProjectInfo {
  id: number;
  projectName?: string | null;
  name?: string | null;
  customerName?: string | null;
  acv?: number | null;
  opportunityAcvValue?: string | null;
  createdBy?: string | null;
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  supportingEngineers?: string[] | null;
  additionalSupportingTeam?: string[] | null;
  status?: string | null;
}

interface Product {
  id: number;
  name: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getProjectDisplayName(project?: ProjectInfo | null): string {
  if (!project) return "—";
  return project.projectName || project.name || `Project #${project.id}`;
}

function formatUserName(
  user?: { firstName?: string | null; lastName?: string | null; email: string } | null
): string {
  if (!user) return "—";
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return full || user.email;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-muted-foreground text-xs">—</span>;
  const cfg: Record<string, { label: string; cls: string }> = {
    open:         { label: "Open",         cls: "bg-gray-100 text-gray-700 dark:bg-gray-700/60 dark:text-gray-300" },
    in_review:    { label: "In Review",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
    resolved:     { label: "Resolved",     cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
    fail:         { label: "Fail",         cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
    blocked:      { label: "Blocked",      cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
    inconclusive: { label: "Inconclusive", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800/60 dark:text-gray-400" },
    blocking:     { label: "Blocked",      cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  };
  const { label, cls } = cfg[status] ?? { label: status, cls: "bg-gray-100 text-gray-700" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", cls)}>
      {label}
    </span>
  );
}

// ─── Metric cards ────────────────────────────────────────────────────────────────

// ─── Collapsible section ──────────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function CollapsibleSection({
  label,
  icon: Icon,
  iconColor,
  count,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
      >
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <span className="font-semibold text-sm">{label}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {count}
        </Badge>
        <ChevronDown
          className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
      </button>
      {expanded && (
        <div>
          {count === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No dependencies in this category
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────────

interface DependenciesRegistrySectionProps {
  filterContainerRef?: RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

export default function DependenciesRegistrySection({
  filterContainerRef,
  onFilterStateChange,
}: DependenciesRegistrySectionProps = {}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  

  // ── Panel toggle ──────────────────────────────────────────────────────────────
  const [managementOpen, setManagementOpen] = useState(false);

  // ── Filters (shared) ──────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [solutionFilter, setSolutionFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  // ── Filters (management-only) ─────────────────────────────────────────────────
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [ownerPopoverOpen, setOwnerPopoverOpen] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [showCategoriesPanel, setShowCategoriesPanel] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DependencyRecord | null>(null);
  const [mgmtSheetOpen, setMgmtSheetOpen] = useState(false);
  const [mgmtEditingItem, setMgmtEditingItem] = useState<DependencyRecord | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [viewProjectsItem, setViewProjectsItem] = useState<DependencyRecord | null>(null);

  // ── Section expand state — Library view ───────────────────────────────────────
  const [myExpanded, setMyExpanded] = useState(true);
  const [customExpanded, setCustomExpanded] = useState(true);
  const [systemExpanded, setSystemExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  // ── Section expand state — Management view ────────────────────────────────────
  const [mgmtMyExpanded, setMgmtMyExpanded] = useState(true);
  const [mgmtOtherExpanded, setMgmtOtherExpanded] = useState(true);

  // ── Sort ──────────────────────────────────────────────────────────────────────
  const { sortConfig, handleSort } = useSortState();

  // ── Data ─────────────────────────────────────────────────────────────────────
  const { data: dependencies = [], isLoading } = useQuery<DependencyRecord[]>({
    queryKey: ["/api/dependencies/library"],
    queryFn: async () => {
      const res = await fetch("/api/dependencies?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch dependencies");
      return res.json();
    },
  });

  const { data: dependencyStats } = useQuery<{ revenueAtRisk: number; blockingProjectCount: number; projectsConnected?: number }>({
    queryKey: ["/api/dependencies/stats"],
    queryFn: async () => {
      const res = await fetch("/api/dependencies/stats");
      if (!res.ok) throw new Error("Failed to fetch dependency stats");
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<ProjectInfo[]>({
    queryKey: ["/api/projects"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: dependencyCategories = [] } = useQuery<DependencyCategory[]>({
    queryKey: ["/api/dependency-categories"],
    queryFn: async () => {
      const res = await fetch("/api/dependency-categories");
      if (!res.ok) throw new Error("Failed to fetch dependency categories");
      return res.json();
    },
  });

  const { data: allProjectDeps = [] } = useQuery<DependencyRecord[]>({
    queryKey: ["/api/project-dependencies/all"],
    queryFn: async () => {
      const res = await fetch("/api/project-dependencies/all");
      if (!res.ok) throw new Error("Failed to fetch project dependencies");
      return res.json();
    },
  });

  const projectCountByDepId = useMemo(() => {
    const seenMap = new Map<number, Set<number>>();
    allProjectDeps.forEach((d) => {
      if (!d.dependencyId || !d.projectId) return;
      if (!seenMap.has(d.dependencyId)) seenMap.set(d.dependencyId, new Set());
      seenMap.get(d.dependencyId)!.add(d.projectId);
    });
    const countMap = new Map<number, number>();
    seenMap.forEach((projectIds, depId) => {
      countMap.set(depId, projectIds.size);
    });
    return countMap;
  }, [allProjectDeps]);

  // ── Delete mutation ───────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/dependencies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dependencies/library"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dependencies/stats"] });
      showSuccessToast("Dependency deleted");
    },
    onError: (err: Error) =>
      showErrorToast("Failed to delete dependency", err.message),
  });

  // ── Reset management-only filters when panel closes ───────────────────────────
  useEffect(() => {
    if (!managementOpen) {
      setStatusFilter("all");
      setOwnerFilter("all");
    }
  }, [managementOpen]);

  // ── Derived: unique owners for management filter dropdown ─────────────────────
  const uniqueOwners = useMemo(() => {
    const owners = new Set<string>();
    allProjectDeps.forEach((d) => {
      if (d.owner) {
        d.owner.split(/[,;]/).forEach((part) => {
          const name = part.trim();
          if (name) owners.add(name);
        });
      }
    });
    return [...owners].sort();
  }, [allProjectDeps]);

  // ── Library filtered + sorted ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return dependencies.filter((dep) => {
      if (solutionFilter !== "all") {
        const hasSolutionIds = dep.solutionIds && dep.solutionIds.length > 0;
        const matchesNew = hasSolutionIds && dep.solutionIds!.includes(parseInt(solutionFilter));
        const matchesLegacy = !hasSolutionIds && String(dep.solutionId) === solutionFilter;
        if (!matchesNew && !matchesLegacy) return false;
      }
      if (categoryFilter !== "all" && String(dep.categoryId) !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !dep.title.toLowerCase().includes(term) &&
          !(dep.description ?? "").toLowerCase().includes(term)
        )
          return false;
      }
      return true;
    });
  }, [dependencies, solutionFilter, categoryFilter, searchTerm]);

  const sorted = sortConfig ? stableSort(filtered, makeComparator(sortConfig)) : filtered;

  // ── Management filtered + sorted ──────────────────────────────────────────────
  const mgmtFiltered = useMemo(() => {
    return allProjectDeps.filter((dep) => {
      if (statusFilter !== "all") {
        const effectiveStatus = dep.status === "blocking" ? "blocked" : dep.status;
        if (effectiveStatus !== statusFilter) return false;
      }
      if (ownerFilter !== "all") {
        const ownerNames = (dep.owner ?? "").split(/[,;]/).map((p) => p.trim()).filter(Boolean);
        if (!ownerNames.includes(ownerFilter)) return false;
      }
      if (solutionFilter !== "all") {
        const hasSolutionIds = dep.solutionIds && dep.solutionIds.length > 0;
        const matchesNew = hasSolutionIds && dep.solutionIds!.includes(parseInt(solutionFilter));
        const matchesLegacy = !hasSolutionIds && String(dep.solutionId) === solutionFilter;
        if (!matchesNew && !matchesLegacy) return false;
      }
      if (categoryFilter !== "all" && String(dep.categoryId) !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !dep.title.toLowerCase().includes(term) &&
          !(dep.description ?? "").toLowerCase().includes(term)
        )
          return false;
      }
      return true;
    });
  }, [allProjectDeps, statusFilter, ownerFilter, solutionFilter, categoryFilter, searchTerm]);

  const mgmtSorted = mgmtFiltered;

  // ── My project IDs (projects where the current user is attached) ──────────────
  const myProjectIds = useMemo(() => {
    const uid = user?.id;
    if (!uid) return new Set<number>();
    const ids = new Set<number>();
    projects.forEach((p) => {
      if (
        p.createdBy === uid ||
        p.primaryEngineerId === uid ||
        p.specialistEngineerId === uid ||
        (p.supportingEngineers && p.supportingEngineers.includes(uid)) ||
        (p.additionalSupportingTeam && p.additionalSupportingTeam.includes(uid))
      ) {
        ids.add(p.id);
      }
    });
    return ids;
  }, [projects, user?.id]);

  // ── Library category sections ─────────────────────────────────────────────────
  const myDeps = useMemo(
    () => sorted.filter((d) => d.isActive && !d.isSystem && d.createdBy === user?.id),
    [sorted, user?.id]
  );
  const customDeps = useMemo(
    () => sorted.filter((d) => d.isActive && !d.isSystem && d.createdBy !== user?.id),
    [sorted, user?.id]
  );
  const systemDeps = useMemo(() => sorted.filter((d) => d.isActive && d.isSystem), [sorted]);
  const inactiveDeps = useMemo(() => sorted.filter((d) => !d.isActive), [sorted]);

  // ── Management category sections ──────────────────────────────────────────────
  const mgmtMyDeps = useMemo(
    () => mgmtSorted.filter((d) => d.projectId != null && myProjectIds.has(d.projectId)),
    [mgmtSorted, myProjectIds]
  );
  const mgmtOtherDeps = useMemo(
    () => mgmtSorted.filter((d) => d.projectId == null || !myProjectIds.has(d.projectId)),
    [mgmtSorted, myProjectIds]
  );

  // ── Metric calculations ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = dependencies.length;
    const systemItems = dependencies.filter((d) => d.isSystem).length;
    const customItems = dependencies.filter((d) => !d.isSystem && d.isActive).length;
    const revenueAtRisk = dependencyStats?.revenueAtRisk ?? 0;
    const projectsConnected = dependencyStats?.projectsConnected ?? 0;
    const categorySet = new Set(dependencies.filter((d) => d.categoryId).map((d) => d.categoryId));
    const categoriesUsed = categorySet.size;
    return { total, systemItems, customItems, revenueAtRisk, projectsConnected, categoriesUsed };
  }, [dependencies, dependencyStats]);

  // ── Filter state ──────────────────────────────────────────────────────────────
  const activeFilterCount = managementOpen
    ? (statusFilter !== "all" ? 1 : 0) +
      (ownerFilter !== "all" ? 1 : 0) +
      (solutionFilter !== "all" ? 1 : 0) +
      (categoryFilter !== "all" ? 1 : 0) +
      (searchTerm ? 1 : 0)
    : (solutionFilter !== "all" ? 1 : 0) +
      (categoryFilter !== "all" ? 1 : 0) +
      (searchTerm ? 1 : 0);

  const clearFilters = useCallback(() => {
    setSolutionFilter("all");
    setCategoryFilter("all");
    setSearchTerm("");
    setCurrentPage(1);
    setStatusFilter("all");
    setOwnerFilter("all");
  }, []);

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  // ── Filter content (single tree; management-only filters conditionally rendered) ──
  const activeFilterContent = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="space-y-1.5 flex-1 min-w-[160px]">
        <FilterLabel>Search</FilterLabel>
        <Input
          placeholder="Search by name or description..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="h-9 text-sm"
        />
      </div>
      {managementOpen && (
        <div className="space-y-1.5 min-w-[140px]">
          <FilterLabel>Status</FilterLabel>
          <Select
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItemWithIcon value="open" icon={<Circle className="h-3.5 w-3.5 text-gray-500" />}>Open</SelectItemWithIcon>
              <SelectItemWithIcon value="in_review" icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}>In Review</SelectItemWithIcon>
              <SelectItemWithIcon value="resolved" icon={<CircleCheckBig className="h-3.5 w-3.5 text-green-500" />}>Resolved</SelectItemWithIcon>
              <SelectItemWithIcon value="fail" icon={<Siren className="h-3.5 w-3.5 text-red-500" />}>Fail</SelectItemWithIcon>
              <SelectItemWithIcon value="blocked" icon={<OctagonX className="h-3.5 w-3.5 text-orange-500" />}>Blocked</SelectItemWithIcon>
              <SelectItemWithIcon value="inconclusive" icon={<Info className="h-3.5 w-3.5 text-gray-500" />}>Inconclusive</SelectItemWithIcon>
            </SelectContent>
          </Select>
        </div>
      )}
      {managementOpen && (
        <div className="space-y-1.5 min-w-[160px]">
          <FilterLabel>Owner</FilterLabel>
          <Popover open={ownerPopoverOpen} onOpenChange={setOwnerPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <span className={ownerFilter === "all" ? "text-muted-foreground" : ""}>
                  {ownerFilter === "all" ? "All Owners" : ownerFilter}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search owner…" />
                <CommandList>
                  <CommandEmpty>No owners found.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="all"
                      onSelect={() => {
                        setOwnerFilter("all");
                        setCurrentPage(1);
                        setOwnerPopoverOpen(false);
                      }}
                    >
                      <Check className={ownerFilter === "all" ? "mr-2 opacity-100" : "mr-2 opacity-0"} />
                      <User className="mr-1 h-3.5 w-3.5 opacity-50" />
                      All Owners
                    </CommandItem>
                    {uniqueOwners.map((o) => (
                      <CommandItem
                        key={o}
                        value={o}
                        onSelect={() => {
                          setOwnerFilter(o);
                          setCurrentPage(1);
                          setOwnerPopoverOpen(false);
                        }}
                      >
                        <Check className={ownerFilter === o ? "mr-2 opacity-100" : "mr-2 opacity-0"} />
                        {o}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div className="space-y-1.5 min-w-[140px]">
        <FilterLabel>Solution</FilterLabel>
        <Select
          value={solutionFilter}
          onValueChange={(v) => {
            setSolutionFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Solutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Solutions</SelectItem>
            {products.map((p) => (
              <SelectItemWithIcon
                key={p.id}
                value={String(p.id)}
                icon={hasSolutionMark(p.solutionIcon, p.solutionIconName) ? (
                  <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="h-4 w-4" />
                ) : undefined}
              >
                {p.name}
              </SelectItemWithIcon>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 min-w-[140px]">
        <FilterLabel>Category</FilterLabel>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
            setCurrentPage(1);
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {dependencyCategories.filter((c) => c.isActive).map((c) => (
              <SelectItemWithIcon
                key={c.id}
                value={String(c.id)}
                icon={c.icon ? (
                  <DynamicIcon name={c.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                ) : undefined}
              >
                {c.name}
              </SelectItemWithIcon>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters — portal when ref provided, inline otherwise */}
      {filterContainerRef?.current
        ? createPortal(activeFilterContent, filterContainerRef.current)
        : (
          <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearFilters}>
            {activeFilterContent}
          </SearchFiltersSection>
        )
      }

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          title="Total"
          value={metrics.total}
          icon={<Link2 />}
          sub="All library items"
          color="blue"
          loading={isLoading}
        />
        <MetricCard
          title="System Items"
          value={metrics.systemItems}
          icon={<ShieldCheck />}
          sub="Admin-curated"
          color="purple"
          loading={isLoading}
        />
        <MetricCard
          title="Custom Items"
          value={metrics.customItems}
          icon={<ClipboardList />}
          sub="User-created"
          color="orange"
          loading={isLoading}
        />
        <MetricCard
          title="Categories"
          value={metrics.categoriesUsed}
          icon={<Tag />}
          sub="In use"
          color="amber"
          loading={isLoading}
        />
        <MetricCard
          title="Projects Connected"
          value={metrics.projectsConnected}
          icon={<TrendingUp />}
          sub="With active dependencies"
          color="green"
          loading={isLoading}
        />
        <MetricCard
          title="Revenue at Risk"
          value={metrics.revenueAtRisk > 0 ? `$${(metrics.revenueAtRisk / 1000).toFixed(0)}k` : "$0"}
          icon={<DollarSign />}
          sub="Across all projects"
          color="teal"
          loading={isLoading}
        />
      </div>

      {/* Card area: sliver + library card OR sliver + management panel */}
      <div className="flex gap-3 items-stretch">

        {/* ── Sliver (visible only when management panel is open) ── */}
        {managementOpen && (
          <div
            className="w-12 shrink-0 rounded-lg border bg-card shadow-sm flex flex-col
                       items-center justify-start pt-5 pb-4 gap-3 cursor-pointer
                       hover:bg-muted/40 transition-colors animate-in fade-in duration-200"
            onClick={() => setManagementOpen(false)}
            title="Return to library view"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center gap-3">
                  <Link2 className="h-5 w-5 text-purple-500 shrink-0" />
                  <span
                    className="text-xs font-semibold text-muted-foreground select-none"
                    style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
                  >
                    Dependencies Library
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">Return to library view</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* ── Library Card (hidden when management is open) ── */}
        {!managementOpen && (
          <Card className="relative overflow-hidden flex-1">
            <DecorativeCardIcon icon={Link2} />
            <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
              <div className="flex-1 mr-4">
                <CardTitle className="flex items-center text-2xl gap-2">
                  <Link2 data-title-icon className="h-5 w-5" />
                  Dependencies Library
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Global library of reusable dependencies. Admins can create system items; all users can create personal items. Concrete prerequisites you need from the customer/environment/tools.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setManagementOpen(true)}
                    >
                      <Unlink2 className="h-4 w-4 mr-1" />
                      Project Dependencies View
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open dependency registry management</TooltipContent>
                </Tooltip>
                {isAdmin && (
                  <Button size="sm" onClick={() => setShowCategoriesPanel(true)}>
                    <Settings className="h-4 w-4 mr-1" />
                    Categories
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingItem(null);
                    setSheetOpen(true);
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  Create Library Dependency
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">
              {[
                {
                  key: "my",
                  label: "My Dependencies",
                  icon: FolderHeart,
                  iconColor: "text-rose-500",
                  deps: myDeps,
                  expanded: myExpanded,
                  toggle: () => setMyExpanded((v) => !v),
                },
                {
                  key: "custom",
                  label: "Other Dependencies",
                  icon: FolderCog,
                  iconColor: "text-amber-600",
                  deps: customDeps,
                  expanded: customExpanded,
                  toggle: () => setCustomExpanded((v) => !v),
                },
                {
                  key: "system",
                  label: "System Dependencies",
                  icon: FolderLock,
                  iconColor: "text-blue-600",
                  deps: systemDeps,
                  expanded: systemExpanded,
                  toggle: () => setSystemExpanded((v) => !v),
                },
              ].map(({ key, label, icon, iconColor, deps, expanded, toggle }) => (
                <CollapsibleSection
                  key={key}
                  label={label}
                  icon={icon}
                  iconColor={iconColor}
                  count={deps.length}
                  expanded={expanded}
                  onToggle={toggle}
                >
                  <DependencyTable
                    deps={deps}
                    products={products}
                    isAdmin={isAdmin}
                    userId={user?.id}
                    projectCountByDepId={projectCountByDepId}
                    onEdit={(dep) => {
                      setEditingItem(dep);
                      setSheetOpen(true);
                    }}
                    onDelete={(id) => {
                      setPendingDeleteId(id);
                      setDeleteConfirmOpen(true);
                    }}
                    onViewProjects={(dep) => setViewProjectsItem(dep)}
                  />
                </CollapsibleSection>
              ))}

              {/* Inactive section */}
              <CollapsibleSection
                label="Inactive Dependencies"
                icon={FolderClock}
                iconColor="text-gray-400"
                count={inactiveDeps.length}
                expanded={inactiveExpanded}
                onToggle={() => setInactiveExpanded((v) => !v)}
              >
                <DependencyTable
                  deps={inactiveDeps}
                  products={products}
                  isAdmin={isAdmin}
                  userId={user?.id}
                  adminOnly={true}
                  projectCountByDepId={projectCountByDepId}
                  onEdit={(dep) => {
                    setEditingItem(dep);
                    setSheetOpen(true);
                  }}
                  onDelete={(id) => {
                    setPendingDeleteId(id);
                    setDeleteConfirmOpen(true);
                  }}
                  onViewProjects={(dep) => setViewProjectsItem(dep)}
                />
              </CollapsibleSection>
            </CardContent>
          </Card>
        )}

        {/* ── Management Panel (visible only when open) ── */}
        {managementOpen && (
          <Card className="flex-1 relative overflow-hidden animate-in slide-in-from-right-4 duration-300">
            <DecorativeCardIcon icon={Link2} />
            <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
              <div className="flex-1 mr-4">
                <CardTitle className="flex items-center text-2xl gap-2">
                  <Link2 data-title-icon className="h-5 w-5 text-purple-500" />
                  Dependency Management
                </CardTitle>
                <CardDescription className="mt-1.5">
                  Track and manage dependency status, owners, and due dates across all project-linked dependencies.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setManagementOpen(false)}
                    >
                      <Link2 className="h-4 w-4 mr-1" />
                      Dependency Library View
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Return to library view</TooltipContent>
                </Tooltip>
                {isAdmin && (
                  <Button size="sm" onClick={() => setShowCategoriesPanel(true)}>
                    <Settings className="h-4 w-4 mr-1" />
                    Categories
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingItem(null);
                    setSheetOpen(true);
                  }}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  Create Library Dependency
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">
              {[
                {
                  key: "my",
                  label: "My Project Dependencies",
                  icon: FolderHeart,
                  iconColor: "text-rose-500",
                  deps: mgmtMyDeps,
                  expanded: mgmtMyExpanded,
                  toggle: () => setMgmtMyExpanded((v) => !v),
                },
                {
                  key: "other",
                  label: "Other Project Dependencies",
                  icon: FolderCog,
                  iconColor: "text-amber-600",
                  deps: mgmtOtherDeps,
                  expanded: mgmtOtherExpanded,
                  toggle: () => setMgmtOtherExpanded((v) => !v),
                },
              ].map(({ key, label, icon, iconColor, deps, expanded, toggle }) => (
                <CollapsibleSection
                  key={key}
                  label={label}
                  icon={icon}
                  iconColor={iconColor}
                  count={deps.length}
                  expanded={expanded}
                  onToggle={toggle}
                >
                  <ManagementDependencyTable
                    deps={deps}
                    projects={projects}
                    products={products}
                    isAdmin={isAdmin}
                    userId={user?.id}
                    onEdit={(dep) => {
                      setMgmtEditingItem(dep);
                      setMgmtSheetOpen(true);
                    }}
                    onDelete={(id) => {
                      setPendingDeleteId(id);
                      setDeleteConfirmOpen(true);
                    }}
                    onViewProjects={(dep) => setViewProjectsItem(dep)}
                  />
                </CollapsibleSection>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Library Create/Edit Sheet */}
      <DependencySheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode="library"
        editingItem={editingItem ?? undefined}
        categories={dependencyCategories}
        products={products}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/dependencies/library"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dependencies/stats"] });
        }}
      />

      {/* Management Panel — Project-level Edit Sheet */}
      <DependencySheet
        open={mgmtSheetOpen}
        onOpenChange={setMgmtSheetOpen}
        mode="project"
        editingItem={(mgmtEditingItem as ProjectDependencyRecord | null) ?? undefined}
        projectId={mgmtEditingItem?.projectId ?? undefined}
        products={products}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/project-dependencies/all"] });
          setMgmtSheetOpen(false);
        }}
      />

      {/* View Associated Projects Sheet */}
      <ViewAssociatedProjectsSheet
        open={!!viewProjectsItem}
        onOpenChange={(o) => { if (!o) setViewProjectsItem(null); }}
        dependency={viewProjectsItem}
        projects={projects}
        setLocation={setLocation}
      />

      {/* Categories Management Panel */}
      <CategoriesManagementPanel
        open={showCategoriesPanel}
        onOpenChange={setShowCategoriesPanel}
        type="dependency"
        categories={dependencyCategories}
        onCategoriesChange={() =>
          queryClient.invalidateQueries({ queryKey: ["/api/dependency-categories"] })
        }
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Dependency"
        description="This dependency will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

// ─── DependencyTable ──────────────────────────────────────────────────────────────

interface DependencyTableProps {
  deps: DependencyRecord[];
  products: Product[];
  isAdmin: boolean;
  userId?: string;
  adminOnly?: boolean;
  projectCountByDepId?: Map<number, number>;
  onEdit: (dep: DependencyRecord) => void;
  onDelete: (id: number) => void;
  onViewProjects: (dep: DependencyRecord) => void;
}

function DependencyTable({
  deps,
  products,
  isAdmin,
  userId,
  adminOnly = false,
  projectCountByDepId,
  onEdit,
  onDelete,
  onViewProjects,
}: DependencyTableProps) {
  const { sortConfig, handleSort } = useSortState();
  const sorted = sortConfig ? stableSort(deps, makeComparator(sortConfig)) : deps;
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <TooltipProvider>
      <>
        <SortableTable>
          <SortableTableHeader>
            <SortableTableRow>
              <SortableTableHead sortKey="title" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name">
                Dependency
              </SortableTableHead>
              <SortableTableHead sortKey="category.name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by category">
                Category
              </SortableTableHead>
              <SortableTableHead sortKey="solutionId" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solution">
                Solution
              </SortableTableHead>
              <SortableTableHead sortKey="validationCheck" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by validation check">
                Validation Check
              </SortableTableHead>
              <SortableTableHead sortKey="createdByUser.email" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by created by">
                Created By
              </SortableTableHead>
              <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by last updated">
                Last Updated
              </SortableTableHead>
              <SortableTableHead sortable={false}>Projects</SortableTableHead>
              <SortableTableHead sortable={false}>Actions</SortableTableHead>
            </SortableTableRow>
          </SortableTableHeader>
          <SortableTableBody>
            {paged.map((dep) => {
              const canEdit = adminOnly ? isAdmin : (isAdmin || dep.createdBy === userId);
              const canDelete = adminOnly ? isAdmin : (isAdmin || (!dep.isSystem && dep.createdBy === userId));
              const projectCount = projectCountByDepId?.get(dep.id) ?? 0;

              const solutionCell = (() => {
                if (dep.isAllSolutions) return <AllSolutionsBadge />;
                const ids = dep.solutionIds && dep.solutionIds.length > 0
                  ? dep.solutionIds
                  : dep.solutionId ? [dep.solutionId] : [];
                if (ids.length === 0) return <span className="text-muted-foreground">—</span>;
                const badges = ids.map((sid) => {
                  const p = products.find((x) => x.id === sid);
                  if (!p) return null;
                  return <SolutionBadge key={sid} solutionName={p.name} solutionIcon={p.solutionIcon} solutionIconName={p.solutionIconName} />;
                }).filter(Boolean);
                return badges.length > 0
                  ? <div className="flex flex-wrap gap-1">{badges}</div>
                  : <span className="text-muted-foreground">—</span>;
              })();

              return (
                <SortableTableRow key={dep.id} className={!dep.isActive ? "opacity-60" : undefined}>
                  <SortableTableCell>
                    <div className="font-medium">{dep.title}</div>
                    {dep.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {dep.description}
                      </div>
                    )}
                  </SortableTableCell>
                  <SortableTableCell>
                    {dep.category ? (
                      <span className="flex items-center gap-1.5">
                        {dep.category.icon && (
                          <DynamicIcon name={dep.category.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {dep.category.name}
                      </span>
                    ) : "—"}
                  </SortableTableCell>
                  <SortableTableCell>{solutionCell}</SortableTableCell>
                  <SortableTableCell>
                    {dep.validationCheck ? (
                      <Badge variant="outline" className="text-xs">
                        {dep.validationCheck}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </SortableTableCell>
                  <SortableTableCell className="text-xs text-muted-foreground">
                    {formatUserName(dep.createdByUser)}
                  </SortableTableCell>
                  <SortableTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {dep.updatedAt ? formatDateForDisplay(dep.updatedAt) : "—"}
                  </SortableTableCell>
                  <SortableTableCell>
                    {projectCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => onViewProjects(dep)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-200 dark:hover:bg-purple-800/60 transition-colors"
                        title="View associated projects"
                      >
                        {projectCount}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </SortableTableCell>
                  <SortableTableCell onClick={(e) => e.stopPropagation()}>
                    <ResponsiveTableActionsMenu
                      actions={[
                        {
                          id: "view-projects",
                          label: "View Associated Projects",
                          icon: Target,
                          variant: "purple" as const,
                          onClick: () => onViewProjects(dep),
                        },
                        {
                          id: "edit",
                          label: "Edit",
                          icon: Edit,
                          onClick: () => onEdit(dep),
                          hidden: !canEdit,
                        },
                        {
                          id: "delete",
                          label: "Delete",
                          icon: Trash2,
                          onClick: () => onDelete(dep.id),
                          variant: "destructive",
                          hidden: !canDelete,
                          separator: true,
                        },
                      ]}
                    />
                  </SortableTableCell>
                </SortableTableRow>
              );
            })}
          </SortableTableBody>
        </SortableTable>
        <TablePaginationFooter
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          entityLabel="dependencies"
        />
      </>
    </TooltipProvider>
  );
}

// ─── ManagementDependencyTable ────────────────────────────────────────────────────

interface ManagementDependencyTableProps {
  deps: DependencyRecord[];
  projects: ProjectInfo[];
  products: Product[];
  isAdmin: boolean;
  userId?: string;
  onEdit: (dep: DependencyRecord) => void;
  onDelete: (id: number) => void;
  onViewProjects: (dep: DependencyRecord) => void;
}

function ManagementDependencyTable({
  deps,
  projects,
  products,
  isAdmin,
  userId,
  onEdit,
  onDelete,
  onViewProjects,
}: ManagementDependencyTableProps) {
  const { sortConfig, handleSort } = useSortState();
  const sorted = sortConfig ? stableSort(deps, makeComparator(sortConfig)) : deps;
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const { data: statusConfigs = [] } = useQuery<StatusConfig[]>({
    queryKey: ["/api/status-configs"],
  });

  const getStatusConfig = (status?: string | null) => {
    if (!status) return null;
    return statusConfigs.find((s) => s.name?.toLowerCase() === status.toLowerCase()) ?? {
      name: status,
      icon: null,
      color: "#64748B",
    };
  };

  return (
    <TooltipProvider>
      <>
        <SortableTable>
          <SortableTableHeader>
            <SortableTableRow>
              <SortableTableHead sortable={false} className="w-16">ID</SortableTableHead>
              <SortableTableHead sortKey="title" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name">
                Dependency
              </SortableTableHead>
              <SortableTableHead sortable={false}>Project</SortableTableHead>
              <SortableTableHead sortable={false}>Project Status</SortableTableHead>
              <SortableTableHead sortable={false}>ACV</SortableTableHead>
              <SortableTableHead sortKey="category.name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by category">
                Category
              </SortableTableHead>
              <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by status">
                Status
              </SortableTableHead>
              <SortableTableHead sortKey="owner" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by owner">
                Owner
              </SortableTableHead>
              <SortableTableHead sortKey="dueDate" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by due date">
                Due Date
              </SortableTableHead>
              <SortableTableHead sortKey="solutionId" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solution">
                Solution
              </SortableTableHead>
              <SortableTableHead sortable={false}>Actions</SortableTableHead>
            </SortableTableRow>
          </SortableTableHeader>
          <SortableTableBody>
            {paged.map((dep) => {
              const canEdit = isAdmin || dep.createdBy === userId;
              const canDelete = isAdmin || (!dep.isSystem && dep.createdBy === userId);
              const project = dep.projectId ? projects.find((p) => p.id === dep.projectId) : null;
              const projectName = getProjectDisplayName(project);

              const solutionCell = (() => {
                const effectiveIsAllSolutions = dep.isAllSolutions ?? dep.libraryIsAllSolutions;
                if (effectiveIsAllSolutions) return <AllSolutionsBadge />;
                const ids = (dep.solutionIds && dep.solutionIds.length > 0)
                  ? dep.solutionIds
                  : (dep.librarySolutionIds && dep.librarySolutionIds.length > 0)
                    ? dep.librarySolutionIds
                    : dep.solutionId ? [dep.solutionId] : [];
                if (ids.length === 0) return <span className="text-muted-foreground">—</span>;
                const badges = ids.map((sid) => {
                  const p = products.find((x) => x.id === sid);
                  if (!p) return null;
                  return <SolutionBadge key={sid} solutionName={p.name} solutionIcon={p.solutionIcon} solutionIconName={p.solutionIconName} />;
                }).filter(Boolean);
                return badges.length > 0
                  ? <div className="flex flex-wrap gap-1">{badges}</div>
                  : <span className="text-muted-foreground">—</span>;
              })();

              return (
                <SortableTableRow key={dep.id} className={!dep.isActive ? "opacity-60" : undefined}>
                  <SortableTableCell className="text-xs text-muted-foreground font-mono">
                    #{dep.id}
                  </SortableTableCell>
                  <SortableTableCell>
                    <div className="font-medium">{dep.title}</div>
                    {dep.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {dep.description}
                      </div>
                    )}
                  </SortableTableCell>
                  <SortableTableCell className="text-sm">
                    {dep.projectId ? (
                      <span className="font-medium">{projectName}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </SortableTableCell>
                  <SortableTableCell>
                    {(() => {
                      const cfg = getStatusConfig(project?.status);
                      if (!project || !cfg) return <span className="text-muted-foreground">—</span>;
                      return (
                        <Badge
                          variant="secondary"
                          className="text-white text-xs flex items-center gap-1 whitespace-nowrap w-fit"
                          style={{ backgroundColor: cfg.color }}
                        >
                          {cfg.icon && <DynamicIcon name={cfg.icon} className="h-3 w-3 shrink-0" />}
                          <span>{cfg.name}</span>
                        </Badge>
                      );
                    })()}
                  </SortableTableCell>
                  <SortableTableCell className="text-xs whitespace-nowrap">
                    {(() => {
                      const raw = project?.opportunityAcvValue;
                      const num = raw ? parseFloat(raw.replace(/[^0-9.-]/g, "")) : NaN;
                      if (!project || isNaN(num) || num <= 0) {
                        return <span className="text-muted-foreground">—</span>;
                      }
                      return (
                        <span className="font-medium">
                          ${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </span>
                      );
                    })()}
                  </SortableTableCell>
                  <SortableTableCell>
                    {dep.category ? (
                      <span className="flex items-center gap-1.5">
                        {dep.category.icon && (
                          <DynamicIcon name={dep.category.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {dep.category.name}
                      </span>
                    ) : "—"}
                  </SortableTableCell>
                  <SortableTableCell>
                    <StatusBadge status={dep.status} />
                  </SortableTableCell>
                  <SortableTableCell className="text-sm">
                    {dep.owner || <span className="text-muted-foreground">—</span>}
                  </SortableTableCell>
                  <SortableTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {dep.dueDate ? (
                      <div className="flex items-center gap-1.5">
                        <span>{formatDateForDisplay(dep.dueDate)}</span>
                        <EndDateBadge endDate={dep.dueDate} targetField="dependency.dueDate" projectStatus={project?.status ?? undefined} />
                      </div>
                    ) : "—"}
                  </SortableTableCell>
                  <SortableTableCell>{solutionCell}</SortableTableCell>
                  <SortableTableCell onClick={(e) => e.stopPropagation()}>
                    <ResponsiveTableActionsMenu
                      actions={[
                        {
                          id: "edit",
                          label: "Edit",
                          icon: Edit,
                          onClick: () => onEdit(dep),
                          hidden: !canEdit,
                        },
                        {
                          id: "delete",
                          label: "Delete",
                          icon: Trash2,
                          onClick: () => onDelete(dep.id),
                          variant: "destructive",
                          hidden: !canDelete,
                          separator: true,
                        },
                      ]}
                    />
                  </SortableTableCell>
                </SortableTableRow>
              );
            })}
          </SortableTableBody>
        </SortableTable>
        <TablePaginationFooter
          totalItems={sorted.length}
          pageSize={PAGE_SIZE}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          entityLabel="dependencies"
        />
      </>
    </TooltipProvider>
  );
}

// ─── ViewAssociatedProjectsSheet ───────────────────────────────────────────────

interface ViewAssociatedProjectsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dependency: DependencyRecord | null;
  projects: ProjectInfo[];
  setLocation: (path: string) => void;
}

function ViewAssociatedProjectsSheet({
  open,
  onOpenChange,
  dependency,
  projects,
  setLocation,
}: ViewAssociatedProjectsSheetProps) {
  const { data: allProjectDeps = [] } = useQuery<DependencyRecord[]>({
    queryKey: ["/api/project-dependencies/all"],
    queryFn: async () => {
      const res = await fetch("/api/project-dependencies/all");
      if (!res.ok) throw new Error("Failed to fetch project dependencies");
      return res.json();
    },
    enabled: open,
  });

  const associatedProjects = useMemo(() => {
    if (!dependency) return [];
    const matchingDeps = allProjectDeps.filter(
      (d) => d.dependencyId === dependency.id || (d.projectId && d.title.toLowerCase() === dependency.title.toLowerCase())
    );
    const projectIds = new Set(matchingDeps.map((d) => d.projectId!).filter(Boolean));
    return projects.filter((p) => projectIds.has(p.id));
  }, [dependency, allProjectDeps, projects]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetDescription className="sr-only">Associated Projects</SheetDescription>
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Associated Projects
          </SheetTitle>
          {dependency && (
            <p className="text-sm text-muted-foreground">
              Projects using <span className="font-semibold">{dependency.title}</span>
            </p>
          )}
        </SheetHeader>
        {associatedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No projects are currently using this dependency.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {associatedProjects.map((project) => (
              <div
                key={project.id}
                className="flex items-center justify-between border rounded-lg px-3 py-2.5 hover:bg-muted/40 transition-colors"
              >
                <div>
                  <div className="font-medium text-sm">
                    {getProjectDisplayName(project)}
                  </div>
                  {project.customerName && (
                    <div className="text-xs text-muted-foreground">{project.customerName}</div>
                  )}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setLocation(`/project/${project.id}?tab=validation&subtab=dependencies`);
                        onOpenChange(false);
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open project</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
