import { useState, useMemo, useEffect, useCallback, RefObject } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { AssumptionSheet } from "@/components/shared/assumption-dependency-sheets";
import { formatDateForDisplay } from "@/lib/date-utils";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
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
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
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
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BookMarked,
  Settings,
  Plus,
  Edit,
  Lock,
  Trash2,
  X,
  FolderHeart,
  FolderCog,
  FolderLock,
  FolderClock,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Target,
  KeyRound,
  Cpu,
  Network,
  Eye,
  EyeOff,
  Save,
  RotateCcw,
} from "lucide-react";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SolutionBadge, AllSolutionsBadge } from "@/components/ui/solution-badge";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { MetricCard } from "@/components/shared/MetricCard";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

interface AssumptionRecord {
  id: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  projectId?: number | null;
  assumptionId?: number | null;
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

interface Product {
  id: number;
  name: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

interface ProjectInfo {
  id: number;
  projectName?: string | null;
  name?: string | null;
  customerName?: string | null;
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

function statusBadge(isActive: boolean) {
  return isActive ? (
    <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
      Active
    </Badge>
  ) : (
    <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
      Inactive
    </Badge>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────────

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
              No assumptions in this category
            </div>
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
}

// ─── AssumptionTable (per-section) ───────────────────────────────────────────────

interface AssumptionTableProps {
  items: AssumptionRecord[];
  products: Product[];
  isAdmin: boolean;
  userId?: string;
  adminOnly?: boolean;
  allProjectAssumptions: AssumptionRecord[];
  onEdit: (item: AssumptionRecord) => void;
  onDelete: (id: number) => void;
  onViewProjects: (item: AssumptionRecord) => void;
}

function AssumptionTable({
  items,
  products,
  isAdmin,
  userId,
  adminOnly = false,
  allProjectAssumptions,
  onEdit,
  onDelete,
  onViewProjects,
}: AssumptionTableProps) {
  const { sortConfig, handleSort } = useSortState();
  const sorted = sortConfig ? stableSort(items, makeComparator(sortConfig)) : items;
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;
  const paged = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset to page 1 whenever the input dataset changes (filter or search applied)
  useEffect(() => {
    setCurrentPage(1);
  }, [items]);

  return (
    <>
      <SortableTable>
        <SortableTableHeader>
          <SortableTableRow>
            <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by ID">
              ID
            </SortableTableHead>
            <SortableTableHead sortKey="title" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by name">
              Name
            </SortableTableHead>
            <SortableTableHead sortKey="category.name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by category">
              Category
            </SortableTableHead>
            <SortableTableHead sortKey="solutionId" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by solution">
              Solution(s)
            </SortableTableHead>
            <SortableTableHead sortKey="createdByUser.email" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by created by">
              Created By
            </SortableTableHead>
            <SortableTableHead sortKey="updatedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Sort by last updated date">
              Last Updated
            </SortableTableHead>
            <SortableTableHead sortable={false}>Projects</SortableTableHead>
            <SortableTableHead sortable={false}>Actions</SortableTableHead>
          </SortableTableRow>
        </SortableTableHeader>
        <SortableTableBody>
          {paged.map((item) => {
            const itemSolutions = (() => {
              if (item.solutionIds && item.solutionIds.length > 0) {
                return products.filter((p) => item.solutionIds!.includes(p.id));
              }
              if (item.solutionId) {
                const p = products.find((p) => p.id === item.solutionId);
                return p ? [p] : [];
              }
              return [];
            })();
            const canEdit = adminOnly ? isAdmin : (isAdmin || item.createdBy === userId);
            const canDelete = adminOnly ? isAdmin : (isAdmin || (!item.isSystem && item.createdBy === userId));

            return (
              <SortableTableRow key={item.id} className={!item.isActive ? "opacity-60" : undefined}>
                <SortableTableCell className="text-sm text-gray-500">{item.id}</SortableTableCell>
                <SortableTableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {item.title}
                    {item.isSystem && (
                      <Tooltip>
                        <TooltipTrigger>
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>System assumption</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {item.description && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {item.description}
                    </div>
                  )}
                </SortableTableCell>
                <SortableTableCell>
                  {item.category ? (
                    <span className="flex items-center gap-1.5">
                      {item.category.icon && (
                        <DynamicIcon name={item.category.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      {item.category.name}
                    </span>
                  ) : "—"}
                </SortableTableCell>
                <SortableTableCell>
                  <div className="flex flex-wrap gap-1">
                    {itemSolutions.length > 0
                      ? itemSolutions.map((s) => (
                          <SolutionBadge key={s.id} solutionName={s.name} solutionIcon={s.solutionIcon} solutionIconName={s.solutionIconName} />
                        ))
                      : <AllSolutionsBadge />
                    }
                  </div>
                </SortableTableCell>
                <SortableTableCell>{formatUserName(item.createdByUser)}</SortableTableCell>
                <SortableTableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDateForDisplay(item.updatedAt)}
                </SortableTableCell>
                <SortableTableCell>
                  {(() => {
                    const count = new Set(
                      allProjectAssumptions
                        .filter(a => a.assumptionId === item.id && a.projectId != null)
                        .map(a => a.projectId!)
                    ).size;
                    return (
                      <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {count}
                      </span>
                    );
                  })()}
                </SortableTableCell>
                <SortableTableCell onClick={(e) => e.stopPropagation()}>
                  <ResponsiveTableActionsMenu
                    actions={[
                      {
                        id: "view-projects",
                        label: "View Associated Projects",
                        icon: Target,
                        variant: "purple" as const,
                        onClick: () => onViewProjects(item),
                      },
                      {
                        id: "edit",
                        label: "Edit",
                        icon: Edit,
                        onClick: () => onEdit(item),
                        hidden: !canEdit,
                      },
                      {
                        id: "delete",
                        label: "Delete",
                        icon: Trash2,
                        onClick: () => onDelete(item.id),
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
        entityLabel="assumptions"
      />
    </>
  );
}

// ─── ViewAssociatedProjectsSheet ─────────────────────────────────────────────────

interface ViewAssociatedProjectsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assumption: AssumptionRecord | null;
  projects: ProjectInfo[];
  allProjectAssumptions: AssumptionRecord[];
  setLocation: (path: string) => void;
}

function ViewAssociatedProjectsSheet({
  open,
  onOpenChange,
  assumption,
  projects,
  allProjectAssumptions,
  setLocation,
}: ViewAssociatedProjectsSheetProps) {

  const associatedProjects = useMemo(() => {
    if (!assumption) return [];
    const matching = allProjectAssumptions.filter(
      (a) => a.assumptionId === assumption.id || (a.projectId && a.title.toLowerCase() === assumption.title.toLowerCase())
    );
    const projectIds = new Set(matching.map((a) => a.projectId!).filter(Boolean));
    return projects.filter((p) => projectIds.has(p.id));
  }, [assumption, allProjectAssumptions, projects]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetDescription className="sr-only">Associated Projects</SheetDescription>
        <SheetHeader className="mb-6">
          <SheetTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Associated Projects
          </SheetTitle>
          {assumption && (
            <p className="text-sm text-muted-foreground">
              Projects using <span className="font-semibold">{assumption.title}</span>
            </p>
          )}
        </SheetHeader>
        {associatedProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">No projects are currently using this assumption.</p>
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
                        setLocation(`/project/${project.id}?tab=validation&subtab=assumptions`);
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

// ─── Main component ─────────────────────────────────────────────────────────────

interface AssumptionsLibraryTabProps {
  filterContainerRef?: RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

export default function AssumptionsLibraryTab({
  filterContainerRef,
  onFilterStateChange,
}: AssumptionsLibraryTabProps = {}) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  const isAdmin = user?.role === "Admin";

  // ── Filter state ───────────────────────────────────────────────────────────────
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // ── UI state ───────────────────────────────────────────────────────────────────
  const [showCategoriesPanel, setShowCategoriesPanel] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AssumptionRecord | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [viewProjectsItem, setViewProjectsItem] = useState<AssumptionRecord | null>(null);

  // ── Section expand state ───────────────────────────────────────────────────────
  const [myExpanded, setMyExpanded] = useState(true);
  const [customExpanded, setCustomExpanded] = useState(true);
  const [systemExpanded, setSystemExpanded] = useState(true);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────────────
  // Always fetch ALL library assumptions (active + inactive) so metric cards
  // reflect stable library-wide totals regardless of UI filter state.
  // The showInactive toggle controls what appears in section tables (client-side).
  const { data: assumptions = [], isLoading } = useQuery<AssumptionRecord[]>({
    queryKey: ["/api/assumptions/library"],
    queryFn: async () => {
      const res = await fetch("/api/assumptions?includeInactive=true");
      if (!res.ok) throw new Error("Failed to fetch assumptions");
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["/api/assumption-categories"],
    queryFn: async () => {
      const res = await fetch("/api/assumption-categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
  });

  const { data: projects = [] } = useQuery<ProjectInfo[]>({
    queryKey: ["/api/projects", { limit: 9999 }],
    queryFn: async () => {
      const res = await fetch("/api/projects?limit=9999");
      if (!res.ok) throw new Error("Failed to fetch projects");
      return res.json();
    },
  });

  const { data: allProjectAssumptions = [] } = useQuery<AssumptionRecord[]>({
    queryKey: ["/api/project-assumptions/all"],
    queryFn: async () => {
      const res = await fetch("/api/project-assumptions/all");
      if (!res.ok) throw new Error("Failed to fetch project assumptions");
      return res.json();
    },
  });

  // ── Delete mutation ───────────────────────────────────────────────────────────
  const deleteAssumptionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assumptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assumptions/library"] });
      showSuccessToast("Assumption deleted");
    },
    onError: (err: any) =>
      showErrorToast("Failed to delete assumption", err.message),
  });

  // ── Metric calculations ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const total = assumptions.length;
    // Active assumptions in "Access & Permissions" category (case-insensitive match)
    const accessPermissions = assumptions.filter((a) => {
      if (!a.isActive || !a.category?.name) return false;
      const name = a.category.name.toLowerCase();
      return name.includes("access") || name.includes("permission");
    }).length;
    // Active assumptions in "Operations" category (case-insensitive match)
    const operations = assumptions.filter((a) => {
      if (!a.isActive || !a.category?.name) return false;
      return a.category.name.toLowerCase().includes("operation");
    }).length;
    // Distinct projects with at least one active assumption from the library
    const activeLibraryIds = new Set(
      assumptions.filter((a) => a.isActive).map((a) => a.id)
    );
    const projectsConnected = new Set(
      allProjectAssumptions
        .filter((a) => a.projectId != null && (
          (a.assumptionId != null && activeLibraryIds.has(a.assumptionId)) ||
          (a.isActive && a.projectId != null)
        ))
        .map((a) => a.projectId)
    ).size;
    return { total, accessPermissions, operations, projectsConnected };
  }, [assumptions, allProjectAssumptions]);

  // ── Filtered + sorted data ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return assumptions.filter((a) => {
      if (categoryFilter !== "all" && String(a.categoryId) !== categoryFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (
          !a.title.toLowerCase().includes(term) &&
          !(a.description ?? "").toLowerCase().includes(term)
        )
          return false;
      }
      return true;
    });
  }, [assumptions, categoryFilter, searchTerm]);

  // ── Category sections ─────────────────────────────────────────────────────────
  // Each AssumptionTable handles its own sort state independently.
  const myAssumptions = useMemo(
    () => filtered.filter((a) => a.isActive && !a.isSystem && a.createdBy === user?.id),
    [filtered, user?.id]
  );
  const customAssumptions = useMemo(
    () => filtered.filter((a) => a.isActive && !a.isSystem && a.createdBy !== user?.id),
    [filtered, user?.id]
  );
  const systemAssumptions = useMemo(
    () => filtered.filter((a) => a.isActive && a.isSystem),
    [filtered]
  );
  const inactiveAssumptions = useMemo(
    () => filtered.filter((a) => !a.isActive),
    [filtered]
  );

  // ── Filter state change reporting ─────────────────────────────────────────────
  const activeFilterCount =
    (categoryFilter !== "all" ? 1 : 0) + (searchTerm ? 1 : 0);

  const clearFilters = useCallback(() => {
    setCategoryFilter("all");
    setSearchTerm("");
  }, []);

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  const filterContent = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="space-y-1.5 flex-1 min-w-[180px]">
        <FilterLabel>Search</FilterLabel>
        <Input
          placeholder="Search assumptions..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
          }}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5 min-w-[160px]">
        <FilterLabel>Category</FilterLabel>
        <Select
          value={categoryFilter}
          onValueChange={(v) => {
            setCategoryFilter(v);
          }}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories
              .filter((c) => c.isActive)
              .map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <TabsContent value="assumptions" className="space-y-4">
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="assumptions" className="space-y-4">
      {/* Filters — portal when ref provided, inline otherwise */}
      {filterContainerRef?.current
        ? createPortal(filterContent, filterContainerRef.current)
        : (
          <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearFilters}>
            {filterContent}
          </SearchFiltersSection>
        )
      }

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Assumptions"
          value={metrics.total}
          icon={<BookMarked />}
          sub="All library items"
          color="blue"
          loading={isLoading}
        />
        <MetricCard
          title="Access & Permissions"
          value={metrics.accessPermissions}
          icon={<KeyRound />}
          sub="In category"
          color="green"
          loading={isLoading}
        />
        <MetricCard
          title="Operations"
          value={metrics.operations}
          icon={<Cpu />}
          sub="In category"
          color="amber"
          loading={isLoading}
        />
        <MetricCard
          title="Projects Connected"
          value={metrics.projectsConnected}
          icon={<Network />}
          sub="With active assumptions"
          color="purple"
          loading={isLoading}
        />
      </div>

      {/* Table card */} 
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={BookMarked} />
        <CardHeader className="flex flex-row items-start justify-between py-4 relative z-10">
          <div className="flex-1 mr-4">
            <CardTitle className="flex items-center text-2xl gap-2">
              <BookMarked data-title-icon className="h-5 w-5" />
              Assumptions Library
            </CardTitle>
            <CardDescription className="mt-1.5">
              Global library of reusable assumptions across all projects. Admins can create system items; all users can create personal items. Statements you’re treating as true for the Project to be meaningful.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <Button size="sm" onClick={() => setShowCategoriesPanel(true)}>
                <Settings className="h-4 w-4 mr-1" />
                Categories
              </Button>
            )}
            {isAdmin && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingItem(null);
                  setSheetOpen(true);
                }}
              >
                <BookMarked className="h-4 w-4 mr-1" />
                Create Assumption
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-6 pb-4 relative z-10 space-y-3">
          {[
            {
              key: "my",
              label: "My Assumptions",
              icon: FolderHeart,
              iconColor: "text-rose-500",
              items: myAssumptions,
              expanded: myExpanded,
              toggle: () => setMyExpanded((v) => !v),
            },
            {
              key: "custom",
              label: "Other Assumptions",
              icon: FolderCog,
              iconColor: "text-amber-600",
              items: customAssumptions,
              expanded: customExpanded,
              toggle: () => setCustomExpanded((v) => !v),
            },
            {
              key: "system",
              label: "System Assumptions",
              icon: FolderLock,
              iconColor: "text-blue-600",
              items: systemAssumptions,
              expanded: systemExpanded,
              toggle: () => setSystemExpanded((v) => !v),
            },
          ].map(({ key, label, icon, iconColor, items, expanded, toggle }) => (
            <CollapsibleSection
              key={key}
              label={label}
              icon={icon}
              iconColor={iconColor}
              count={items.length}
              expanded={expanded}
              onToggle={toggle}
            >
              <AssumptionTable
                items={items}
                products={products}
                isAdmin={isAdmin}
                userId={user?.id}
                allProjectAssumptions={allProjectAssumptions}
                onEdit={(item) => {
                  setEditingItem(item);
                  setSheetOpen(true);
                }}
                onDelete={(id) => {
                  setPendingDeleteId(id);
                  setDeleteConfirmOpen(true);
                }}
                onViewProjects={(item) => setViewProjectsItem(item)}
              />
            </CollapsibleSection>
          ))}

          {/* Inactive section — always shown, collapsed by default, Admin-edit only */}
          <CollapsibleSection
            label="Inactive Assumptions"
            icon={FolderClock}
            iconColor="text-gray-400"
            count={inactiveAssumptions.length}
            expanded={inactiveExpanded}
            onToggle={() => setInactiveExpanded((v) => !v)}
          >
            <AssumptionTable
              items={inactiveAssumptions}
              products={products}
              isAdmin={isAdmin}
              userId={user?.id}
              adminOnly={true}
              allProjectAssumptions={allProjectAssumptions}
              onEdit={(item) => {
                setEditingItem(item);
                setSheetOpen(true);
              }}
              onDelete={(id) => {
                setPendingDeleteId(id);
                setDeleteConfirmOpen(true);
              }}
              onViewProjects={(item) => setViewProjectsItem(item)}
            />
          </CollapsibleSection>
        </CardContent>
      </Card>

      {/* Create/Edit Sheet */}
      <AssumptionSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        mode="library"
        editingItem={editingItem ?? undefined}
        categories={categories}
        products={products}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["/api/assumptions/library"] })}
      />

      {/* View Associated Projects Sheet */}
      <ViewAssociatedProjectsSheet
        open={!!viewProjectsItem}
        onOpenChange={(o) => { if (!o) setViewProjectsItem(null); }}
        assumption={viewProjectsItem}
        projects={projects}
        allProjectAssumptions={allProjectAssumptions}
        setLocation={setLocation}
      />

      {/* Categories Management Panel */}
      <CategoriesManagementPanel
        open={showCategoriesPanel}
        onOpenChange={setShowCategoriesPanel}
        type="assumption"
        categories={categories}
        onCategoriesChange={() =>
          queryClient.invalidateQueries({ queryKey: ["/api/assumption-categories"] })
        }
      />

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Assumption"
        description="This assumption will be permanently deleted. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (pendingDeleteId) deleteAssumptionMutation.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </TabsContent>
  );
}

// ─── CategoriesManagementPanel ─────────────────────────────────────────────────

export interface CategoriesManagementPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "assumption" | "dependency";
  categories?: Category[];
  onCategoriesChange: () => void;
}

export function CategoriesManagementPanel({
  open,
  onOpenChange,
  type,
  onCategoriesChange,
}: CategoriesManagementPanelProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "Admin";
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newIcon, setNewIcon] = useState("");
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteCatId, setPendingDeleteCatId] = useState<number | null>(null);
  

  const apiBase = type === "assumption" ? "/api/assumption-categories" : "/api/dependency-categories";
  const panelQueryKey = [apiBase, "all"];

  const { data: allCategories = [] } = useQuery<Category[]>({
    queryKey: panelQueryKey,
    queryFn: async () => {
      const res = await fetch(`${apiBase}?includeInactive=true`);
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json();
    },
    enabled: open,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: panelQueryKey });
    onCategoriesChange();
  };

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", apiBase, data),
    onSuccess: () => {
      invalidateAll();
      showSuccessToast("Category created");
      setNewName("");
      setNewDesc("");
      setNewIcon("");
    },
    onError: (err: any) =>
      showErrorToast("Failed to create category", err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `${apiBase}/${id}`, data),
    onSuccess: () => {
      invalidateAll();
      showSuccessToast("Category updated");
      setEditingCat(null);
    },
    onError: (err: any) =>
      showErrorToast("Failed to update category", err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${apiBase}/${id}`),
    onSuccess: () => {
      invalidateAll();
      showSuccessToast("Category deleted");
    },
    onError: (err: any) =>
      showErrorToast("Failed to delete category", err.message),
  });

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetDefaultsMutation = useMutation({
    mutationFn: () => apiRequest("POST", `${apiBase}/reset-defaults`),
    onSuccess: (data: any) => {
      invalidateAll();
      const s = data?.summary;
      const parts: string[] = [];
      if (s?.inserted) parts.push(`${s.inserted} re-created`);
      if (s?.updated) parts.push(`${s.updated} restored`);
      if (parts.length === 0) parts.push("nothing to change");
      showSuccessToast(
        "Categories restored",
        `${parts.join(", ")} (out of ${s?.totalDefaults ?? 0} defaults).`
      );
    },
    onError: (err: any) =>
      showErrorToast("Reset failed", err?.message || "Failed to reset categories"),
  });

  const toggleActive = (cat: Category) => {
    updateMutation.mutate({ id: cat.id, data: { isActive: !cat.isActive } });
  };

  const toggleSystem = (cat: Category) => {
    updateMutation.mutate({ id: cat.id, data: { isSystem: !cat.isSystem } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
        <SheetDescription className="sr-only">Manage Categories</SheetDescription>
        <SheetHeader className="mb-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              {type === "assumption" ? "Assumption" : "Dependency"} Categories
            </SheetTitle>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                disabled={resetDefaultsMutation.isPending}
                className="flex items-center gap-2"
                title="Restore the canonical default categories. Custom categories you have created will be left untouched."
                data-testid={`button-reset-${type}-categories`}
              >
                <RotateCcw className="h-4 w-4" />
                Reset to defaults
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Create new */}
        <div className="border rounded-lg p-4 mb-4 space-y-3 bg-muted/30">
          <p className="text-sm font-semibold">New Category</p>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name *</Label>
            <Input
              id="cat-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <LucideIconPicker value={newIcon} onChange={setNewIcon} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Input
              id="cat-desc"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <Button
            size="sm"
            disabled={!newName.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                name: newName.trim(),
                description: newDesc || null,
                icon: newIcon || null,
                isSystem: false,
                isActive: true,
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Category
          </Button>
        </div>

        {/* List */}
        <div className="space-y-2">
          {allCategories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No categories yet.</p>
          )}
          {allCategories.map((cat) => (
            <div
              key={cat.id}
              className={`flex flex-col border rounded-lg px-3 py-2 gap-1 ${!cat.isActive ? "opacity-50" : ""}`}
            >
              {/* Top row */}
              <div className="flex items-start gap-2">
                {editingCat?.id === cat.id ? (
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-7 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingCat(null);
                      }}
                      autoFocus
                    />
                    <LucideIconPicker value={editIcon} onChange={setEditIcon} />
                    <Input
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      className="h-7 text-sm"
                      placeholder="Description (optional)"
                    />
                  </div>
                ) : (
                  <span className="flex items-center gap-2 flex-1 text-sm font-medium min-w-0 pt-0.5">
                    {cat.icon && <DynamicIcon name={cat.icon} className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <span className="truncate">{cat.name}</span>
                  </span>
                )}

                <Badge
                  variant={cat.isSystem ? "default" : "outline"}
                  className={`text-xs shrink-0 mt-0.5 ${cat.isSystem ? "bg-black text-white border-black hover:bg-black" : ""}`}
                >
                  {cat.isSystem ? "System" : "Custom"}
                </Badge>

                <div className="flex items-center gap-1 shrink-0">
                  {editingCat?.id === cat.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => updateMutation.mutate({ id: cat.id, data: { name: editName, icon: editIcon || null, description: editDesc || null } })}
                    >
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditingCat(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => {
                        setEditingCat(cat);
                        setEditName(cat.name);
                        setEditIcon(cat.icon ?? "");
                        setEditDesc(cat.description ?? "");
                      }}
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleActive(cat)}
                        >
                          {cat.isActive
                            ? <EyeOff className="h-3.5 w-3.5" />
                            : <Eye className="h-3.5 w-3.5" />
                          }
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {cat.isActive ? "Deactivate" : "Activate"}
                      </TooltipContent>
                    </Tooltip>
                    {isAdmin && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center">
                            <Switch
                              checked={cat.isSystem}
                              onCheckedChange={() => toggleSystem(cat)}
                              className="scale-75"
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {cat.isSystem ? "Mark as Custom" : "Mark as System"}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {(!cat.isSystem || isAdmin) && (
                      <DangerIconButton
                        onClick={() => {
                          setPendingDeleteCatId(cat.id);
                          setDeleteConfirmOpen(true);
                        }}
                      />
                    )}
                  </>
                )}
                </div>
              </div>
              {/* Description row — full width, below all buttons/badges */}
              {editingCat?.id !== cat.id && cat.description && (
                <p className="text-xs text-muted-foreground">{cat.description}</p>
              )}
            </div>
          ))}
        </div>

        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Category"
          description="This will permanently delete the category. Existing items using this category will lose their category association."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => {
            if (pendingDeleteCatId) deleteMutation.mutate(pendingDeleteCatId);
            setPendingDeleteCatId(null);
          }}
          onCancel={() => setPendingDeleteCatId(null)}
        />

        <ConfirmationDialog
          open={resetConfirmOpen}
          onOpenChange={setResetConfirmOpen}
          title={`Reset ${type} categories to defaults?`}
          description={`This restores the default ${type} categories (names, icons, descriptions). Custom categories you have created will be left untouched. This action will be recorded in the audit trail.`}
          confirmLabel="Reset categories"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={() => resetDefaultsMutation.mutate()}
        />
      </SheetContent>
    </Sheet>
  );
}
