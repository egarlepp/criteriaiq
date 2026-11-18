import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import {
  AssumptionSheet,
  DependencySheet,
  type Category as SheetCategory,
  type ProjectAssumptionRecord as SheetAssumptionRecord,
  type ProjectDependencyRecord as SheetDependencyRecord,
} from "@/components/shared/assumption-dependency-sheets";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DangerIconButton } from "@/components/shared/danger-icon-button";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Edit,
  Eye,
  EyeOff,
  Link2,
  BookMarked,
  CircleCheckBig,
  Star,
} from "lucide-react";

import { formatDateForDisplay } from "@/lib/date-utils";
import { EndDateBadge } from "@/components/shared/end-date-badge";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: number;
  name: string;
  isSystem: boolean;
}

interface LibraryItem {
  id: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  isSystem: boolean;
  isActive: boolean;
}

interface AssumptionRecord {
  id: number;
  assumptionId?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  projectSolutionIds?: number[] | null;
  projectId?: number | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  libraryItem?: LibraryItem | null;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

export interface DependencyRecord {
  id: number;
  dependencyId?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  projectSolutionIds?: number[] | null;
  projectId?: number | null;
  owner?: string | null;
  dueDate?: string | null;
  status?: "open" | "in_review" | "blocking" | "resolved" | "fail" | "blocked" | "inconclusive" | null;
  successCriteriaId?: number | null;
  successCriteriaIds?: number[] | null;
  showOnSuccessCriteria?: boolean | null;
  assignedUserIds?: string[] | null;
  assignedCustomerEmails?: string[] | null;
  assignedTeams?: string[] | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  libraryItem?: LibraryItem | null;
  createdByUser?: {
    firstName?: string | null;
    lastName?: string | null;
    email: string;
  } | null;
}

export interface SuccessCriterion {
  id: number;
  name: string;
  productName?: string | null;
  solutionIcon?: string | null; solutionIconName?: string | null;
  lineNumber?: number | null;
  criterion?: string | null;
  componentName?: string | null;
  valueMappingName?: string | null;
  expectedOutcome?: string | null;
}

export interface Product {
  id: number;
  name: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

interface AssumptionsDependenciesTabProps {
  projectId: number;
  availableProducts: Product[];
  projectProductIds?: number[];
  projectSuccessCriteria?: SuccessCriterion[];
  projectStatus?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getEffectiveSolutionIds(
  item: AssumptionRecord | DependencyRecord
): number[] {
  const ids = item.solutionIds ?? item.projectSolutionIds ?? null;
  if (ids && ids.length > 0) return ids;
  if (item.solutionId) return [item.solutionId];
  return [];
}

function SolutionIcons({
  solutionIds,
  products,
  allSolutionsColor,
}: {
  solutionIds: number[];
  products: Product[];
  allSolutionsColor?: "blue" | "purple";
}) {
  const { t } = useTranslation();
  if (solutionIds.length === 0) {
    if (!allSolutionsColor) return null;
    const starClass =
      allSolutionsColor === "blue"
        ? "text-blue-900 dark:text-blue-700"
        : "text-purple-900 dark:text-purple-700";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Star className={`w-4 h-4 shrink-0 ${starClass}`} />
        </TooltipTrigger>
        <TooltipContent>{t('projects.assumptionsDeps.allSolutions')}</TooltipContent>
      </Tooltip>
    );
  }
  const matched = solutionIds
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as Product[];
  if (matched.length === 0) return null;
  return (
    <div className="flex items-center gap-1 shrink-0">
      {matched.map((p) =>
        p.solutionIcon || p.solutionIconName ? (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-5 h-5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{p.name}</TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip key={p.id}>
            <TooltipTrigger asChild>
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {p.name.substring(0, 2).toUpperCase()}
              </span>
            </TooltipTrigger>
            <TooltipContent>{p.name}</TooltipContent>
          </Tooltip>
        )
      )}
    </div>
  );
}

function statusBadge(status: DependencyRecord["status"]) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  switch (status) {
    case "open":
      return (
        <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 text-xs">
          Open
        </Badge>
      );
    case "in_review":
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 text-xs">
          In Review
        </Badge>
      );
    case "resolved":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
          Resolved
        </Badge>
      );
    case "fail":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
          Fail
        </Badge>
      );
    case "blocked":
    case "blocking":
      return (
        <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/60 dark:text-orange-200 text-xs">
          Blocked
        </Badge>
      );
    case "inconclusive":
      return (
        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">
          Inconclusive
        </Badge>
      );
    default:
      return <span className="text-muted-foreground">—</span>;
  }
}

// ─── Query keys ───────────────────────────────────────────────────────────────

function assumptionsQueryKey(projectId: number) {
  return [`/api/project-assumptions`, { projectId }];
}

function dependenciesQueryKey(projectId: number) {
  return [`/api/project-dependencies`, { projectId }];
}

// ─── AssumptionCard ───────────────────────────────────────────────────────────

function AssumptionCard({
  item,
  products,
  canEdit,
  onEdit,
  onDelete,
}: {
  item: AssumptionRecord;
  products: Product[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const solutionIds = getEffectiveSolutionIds(item);

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-blue-50 dark:bg-blue-950/30">
      {/* Top rail — blue */}
      <div className="bg-blue-900 dark:bg-blue-950/50 flex items-center px-3 py-2 gap-2">
        <span className="text-white text-med font-bold flex-1 truncate">
          <div className="flex items-center gap-1">
            <BookMarked className="h-4 w-4 text-blue-200" />
          {item.category?.name ?? "Uncategorized"}
          </div>
        </span>
        {canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                  onClick={onEdit}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.edit')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <DangerIconButton
                  onClick={onDelete}
                  className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white border-0 bg-transparent"
                />
              </TooltipTrigger>
              <TooltipContent>{t('common.delete')}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Name + solution icons row */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-sm leading-snug">
          {item.title}
          {!item.isActive && (
            <Badge variant="outline" className="ml-2 text-xs">
              {t('common.inactive')}
            </Badge>
          )}
        </span>
        <SolutionIcons solutionIds={solutionIds} products={products} allSolutionsColor="blue" />
      </div>

      {/* Description row */}
      {item.description && (
        <div className="px-4 pb-3 text-xs text-muted-foreground leading-relaxed">
          {item.description}
        </div>
      )}
    </div>
  );
}

// ─── DependencyCard ───────────────────────────────────────────────────────────

export function DependencyCard({
  item,
  products,
  successCriteria,
  canEdit,
  onEdit,
  onDelete,
  readOnly = false,
  projectId,
  allUsers = [],
  projectStatus,
}: {
  item: DependencyRecord;
  products: Product[];
  successCriteria: SuccessCriterion[];
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  readOnly?: boolean;
  projectId?: number;
  allUsers?: { id: string; role?: string | null }[];
  projectStatus?: string;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState<boolean>(!!item.showOnSuccessCriteria);
  const queryClient = useQueryClient();

  useEffect(() => {
    setPinned(!!item.showOnSuccessCriteria);
  }, [item.showOnSuccessCriteria]);
  const solutionIds = getEffectiveSolutionIds(item);

  const pinMutation = useMutation({
    mutationFn: (checked: boolean) =>
      apiRequest("PATCH", `/api/project-dependencies/${item.id}`, { showOnSuccessCriteria: checked }),
    onMutate: (checked) => {
      setPinned(checked);
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/project-dependencies`, { projectId }] });
      }
    },
    onError: (_err, checked) => {
      setPinned(!checked);
    },
  });

  const linkedCriteria = useMemo<SuccessCriterion[]>(() => {
    const ids: number[] =
      item.successCriteriaIds && item.successCriteriaIds.length > 0
        ? item.successCriteriaIds
        : item.successCriteriaId
        ? [item.successCriteriaId]
        : [];
    return ids
      .map((id) => successCriteria.find((sc) => sc.id === id))
      .filter((sc): sc is SuccessCriterion => sc !== undefined);
  }, [item.successCriteriaIds, item.successCriteriaId, successCriteria]);

  return (
    <div className="border rounded-lg overflow-hidden shadow-sm bg-purple-50 dark:bg-purple-950/30">
      {/* Top rail — purple */}
      <div className="bg-purple-900 dark:bg-purple-950/50 flex items-center px-3 py-2 gap-2">
        <span className="text-white text-med font-bold flex-1 truncate">
          <div className="flex items-center gap-1">
            <Link2 className="h-4 w-4 text-purple-200" />
          {item.category?.name ?? "Uncategorized"}
          </div>
        </span>
        {!readOnly && !canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`flex items-center justify-center h-7 w-7 cursor-not-allowed rounded ${pinned ? 'text-purple-300' : 'text-white/30'}`}>
                {pinned ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {pinned ? 'Visible on Success Criteria (view only)' : 'Hidden from Success Criteria (view only)'}
            </TooltipContent>
          </Tooltip>
        )}
        {!readOnly && canEdit && (
          <div className="flex items-center gap-1 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => pinMutation.mutate(!pinned)}
                  aria-label={pinned ? 'Hide from Success Criteria' : 'Show on Success Criteria'}
                  className={`flex items-center justify-center h-7 w-7 rounded transition-colors ${
                    pinned
                      ? 'text-purple-300 bg-white/10 hover:bg-white/20'
                      : 'text-white/40 hover:text-white/80 hover:bg-white/10'
                  }`}
                >
                  {pinned ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {pinned ? 'Project Details Page Only: Hide from Success Criteria view' : 'Project Details Page Only: Show on Success Criteria view'}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white"
                  onClick={onEdit}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('common.edit')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <DangerIconButton
                  onClick={onDelete}
                  className="h-7 w-7 p-0 text-white hover:bg-white/20 hover:text-white border-0 bg-transparent"
                />
              </TooltipTrigger>
              <TooltipContent>{t('common.delete')}</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Name + solution icons row */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-3">
        <span className="font-semibold text-sm leading-snug">
          {item.title}
          {!item.isActive && (
            <Badge variant="outline" className="ml-2 text-xs">
              {t('common.inactive')}
            </Badge>
          )}
        </span>
        <SolutionIcons solutionIds={solutionIds} products={products} allSolutionsColor="purple" />
      </div>

      {/* Description row */}
      {item.description && (
        <div className="px-4 pb-2 text-xs text-muted-foreground leading-relaxed">
          {item.description}
        </div>
      )}

      {/* Owner / Due Date / Status row */}
      <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground border-t pt-2 mt-1">
        <span className="flex-1 min-w-0 truncate">
          <span className="font-medium text-foreground">Owner:</span>{" "}
          {(() => {
            const assignedIds = item.assignedUserIds ?? [];
            const internalCount = assignedIds.filter((id) => {
              const u = allUsers.find((u) => u.id === id);
              return !u || u.role !== "Partner";
            }).length;
            const partnerCount = assignedIds.filter((id) => {
              const u = allUsers.find((u) => u.id === id);
              return u?.role === "Partner";
            }).length;
            const customerCount = item.assignedCustomerEmails?.length ?? 0;
            const teamCount = item.assignedTeams?.length ?? 0;
            const total = internalCount + partnerCount + customerCount + teamCount;
            if (total === 1) {
              return item.owner ?? (item.assignedCustomerEmails?.[0] ?? item.assignedTeams?.[0] ?? "—");
            }
            if (total > 1) {
              const parts: string[] = [];
              if (internalCount > 0) parts.push(`${internalCount} Internal`);
              if (partnerCount > 0) parts.push(`${partnerCount} Partner`);
              if (customerCount > 0) parts.push(`${customerCount} Customer`);
              if (teamCount > 0) parts.push(`${teamCount} ${teamCount === 1 ? "Team" : "Teams"}`);
              return parts.join(" · ");
            }
            return item.owner ?? "—";
          })()}
        </span>
        <span className="flex-1 text-center flex items-center justify-center gap-1.5 flex-wrap">
          <span><span className="font-medium text-foreground">Due:</span>{" "}{item.dueDate ? formatDateForDisplay(item.dueDate) : "—"}</span>
          {item.dueDate && (
            <EndDateBadge endDate={item.dueDate} targetField="dependency.dueDate" projectStatus={projectStatus} />
          )}
        </span>
        <span className="shrink-0">{statusBadge(item.status)}</span>
      </div>

      {/* Expand/collapse success criteria */}
      <div className="border-t">
        <div className="flex items-center px-3 py-1.5">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            )}
            <CircleCheckBig className="h-3.5 w-3.5 shrink-0" />
            <span>{t('projects.assumptionsDeps.linkedToSuccessCriteria')}</span>
          </button>
        </div>
        {expanded && (
          <div className="px-4 pb-3 pt-1 space-y-2">
            {linkedCriteria.length > 0 ? (
              linkedCriteria.map((sc) => (
                <div
                  key={sc.id}
                  className="rounded-md border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-2.5 space-y-2"
                >
                  {/* Solution header */}
                  <div className="flex items-center gap-1.5">
                    {sc.solutionIcon || sc.solutionIconName ? (
<SolutionGraphic graphic={sc.solutionIcon} icon={sc.solutionIconName} name="" className="h-4 w-4 object-contain shrink-0" />
) : (
                      <Boxes className="h-4 w-4 text-purple-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate">
                      {sc.productName || "No Solution"}
                    </span>
                  </div>
                  {/* Detail grid */}
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div className="col-span-2 flex gap-1.5">
                      <span className="shrink-0 font-bold text-purple-700 dark:text-purple-400 text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-1 py-0.5">
                        #{sc.lineNumber ?? sc.id}
                      </span>
                      <span className="text-foreground leading-tight">
                        {sc.criterion || sc.name}
                      </span>
                    </div>
                    {sc.componentName && (
                      <>
                        <span className="font-medium text-muted-foreground">Component:</span>
                        <span className="text-foreground truncate">{sc.componentName}</span>
                      </>
                    )}
                    {sc.valueMappingName && (
                      <>
                        <span className="font-medium text-muted-foreground">{t('projects.assumptionsDeps.valueMapping')}:</span>
                        <span className="text-foreground truncate">{sc.valueMappingName}</span>
                      </>
                    )}
                    {sc.expectedOutcome && (
                      <>
                        <span className="font-medium text-muted-foreground col-span-2">{t('projects.assumptionsDeps.expectedOutcome')}:</span>
                        <span className="text-foreground col-span-2 leading-snug">{sc.expectedOutcome}</span>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No success criteria linked
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AssumptionsDependenciesTab({
  projectId,
  availableProducts,
  projectProductIds = [],
  projectSuccessCriteria = [],
  projectStatus,
}: AssumptionsDependenciesTabProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { canEdit } = usePermissions();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "Admin";
  const canEditAssumptions = isAdmin || canEdit("project.assumptions");

  // ── Sheet state ───────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetType, setSheetType] = useState<"assumption" | "dependency">("assumption");
  const [editingItem, setEditingItem] = useState<AssumptionRecord | DependencyRecord | null>(null);

  // ── Delete confirm state ──────────────────────────────────────────────────
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    type: "assumption" | "dependency";
    id: number;
  } | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: assumptions = [], isLoading: assumptionsLoading } = useQuery<AssumptionRecord[]>({
    queryKey: assumptionsQueryKey(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/project-assumptions?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch assumptions");
      return res.json();
    },
  });

  const { data: dependencies = [], isLoading: dependenciesLoading } = useQuery<DependencyRecord[]>({
    queryKey: dependenciesQueryKey(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/project-dependencies?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch dependencies");
      return res.json();
    },
  });

  const { data: assumptionCategories = [] } = useQuery<Category[]>({
    queryKey: ["/api/assumption-categories"],
    queryFn: async () => {
      const res = await fetch("/api/assumption-categories");
      if (!res.ok) throw new Error("Failed to fetch assumption categories");
      return res.json();
    },
  });

  const { data: dependencyCategories = [] } = useQuery<Category[]>({
    queryKey: ["/api/dependency-categories"],
    queryFn: async () => {
      const res = await fetch("/api/dependency-categories");
      if (!res.ok) throw new Error("Failed to fetch dependency categories");
      return res.json();
    },
  });

  const { data: allUsers = [] } = useQuery<{ id: string; role?: string | null }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  // ── Delete mutations ──────────────────────────────────────────────────────
  const deleteAssumptionMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/project-assumptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assumptionsQueryKey(projectId) });
      showSuccessToast(t('projects.assumptionsDeps.assumptionRemoved'));
    },
    onError: (err: any) => showErrorToast(t('projects.assumptionsDeps.assumptionRemoveFailed'), err.message),
  });

  const deleteDependencyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/project-dependencies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dependenciesQueryKey(projectId) });
      showSuccessToast(t('projects.assumptionsDeps.dependencyRemoved'));
    },
    onError: (err: any) => showErrorToast(t('projects.assumptionsDeps.dependencyRemoveFailed'), err.message),
  });

  // ── Action helpers ────────────────────────────────────────────────────────
  const openCreate = (type: "assumption" | "dependency") => {
    setSheetType(type);
    setEditingItem(null);
    setSheetOpen(true);
  };

  const openEdit = (
    item: AssumptionRecord | DependencyRecord,
    type: "assumption" | "dependency"
  ) => {
    setSheetType(type);
    setEditingItem(item);
    setSheetOpen(true);
  };

  const requestDelete = (type: "assumption" | "dependency", id: number) => {
    setPendingDelete({ type, id });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.type === "assumption") {
      deleteAssumptionMutation.mutate(pendingDelete.id);
    } else {
      deleteDependencyMutation.mutate(pendingDelete.id);
    }
    setPendingDelete(null);
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (assumptionsLoading || dependenciesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Assumptions section ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <BookMarked className="h-5 w-5 text-blue-500" />
                Project Assumptions
              </CardTitle>
              <CardDescription>
                Conditions assumed to be true for this project to succeed and be meaningful. These are not requirements.
              </CardDescription>
            </div>
            {canEditAssumptions && (
              <Button size="sm" onClick={() => openCreate("assumption")}>
                <BookMarked className="h-4 w-4 mr-1" />
                Add Project Assumption
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4">
            {assumptions.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No assumptions recorded for this project yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {assumptions.map((item) => (
                  <AssumptionCard
                    key={item.id}
                    item={item}
                    products={availableProducts}
                    canEdit={canEditAssumptions}
                    onEdit={() => openEdit(item, "assumption")}
                    onDelete={() => requestDelete("assumption", item.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Dependencies section ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Link2 className="h-5 w-5 text-purple-500" />
                Project Dependencies
              </CardTitle>
              <CardDescription>
                External factors this project depends on to proceed from the customer/environment/tools. These are not requirements.
              </CardDescription>
            </div>
            {canEditAssumptions && (
              <Button size="sm" onClick={() => openCreate("dependency")}>
                <Link2 className="h-4 w-4 mr-1" />
                Add Project Dependency
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-4">
            {dependencies.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No dependencies recorded for this project yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {dependencies.map((item) => (
                  <DependencyCard
                    key={item.id}
                    item={item}
                    products={availableProducts}
                    successCriteria={projectSuccessCriteria}
                    canEdit={canEditAssumptions}
                    onEdit={() => openEdit(item, "dependency")}
                    onDelete={() => requestDelete("dependency", item.id)}
                    projectId={projectId}
                    allUsers={allUsers}
                    projectStatus={projectStatus}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Sheets ─────────────────────────────────────────────────────────
         * The local `AssumptionRecord` / `DependencyRecord` / `Category` shapes
         * defined at the top of this file include a few extra project-specific
         * fields (e.g. `solutionIds`, `projectSolutionIds`) that the shared
         * sheet types intentionally omit, so a direct structural assignment is
         * rejected even though both shapes describe the same row. The
         * `as unknown as Sheet*Record` boundary casts are the documented bridge:
         * the data still originates from the same API response and the sheets
         * only read the shared subset. */}
        <AssumptionSheet
          open={sheetOpen && sheetType === "assumption"}
          onOpenChange={(o) => { if (!o) setSheetOpen(false); }}
          mode="project"
          editingItem={sheetType === "assumption" ? (editingItem as unknown as SheetAssumptionRecord) : null}
          projectId={projectId}
          categories={assumptionCategories as unknown as SheetCategory[]}
          products={availableProducts}
          projectProductIds={projectProductIds}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: assumptionsQueryKey(projectId) })}
        />
        <DependencySheet
          open={sheetOpen && sheetType === "dependency"}
          onOpenChange={(o) => { if (!o) setSheetOpen(false); }}
          mode="project"
          editingItem={sheetType === "dependency" ? (editingItem as unknown as SheetDependencyRecord) : null}
          projectId={projectId}
          categories={dependencyCategories as unknown as SheetCategory[]}
          products={availableProducts}
          projectProductIds={projectProductIds}
          projectSuccessCriteria={projectSuccessCriteria}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: dependenciesQueryKey(projectId) })}
        />

        {/* ── Delete confirmation ───────────────────────────────────────────── */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title={`Delete ${
            pendingDelete?.type === "assumption" ? "Assumption" : "Dependency"
          }`}
          description="This action cannot be undone. Are you sure you want to delete this item?"
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      </div>
    </TooltipProvider>
  );
}
