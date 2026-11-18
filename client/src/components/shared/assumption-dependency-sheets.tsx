import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { formatDateForDisplay } from "@/lib/date-utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  Check,
  Link2,
  BookOpenCheck,
  FolderOpen,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  Clock,
  OctagonX,
  CircleCheckBig,
  Siren,
  Info,
  Users,
  Building2,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { DEPARTMENTS } from "@/config/departments";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  description?: string | null;
  icon?: string | null;
  isSystem: boolean;
  isActive: boolean;
}

export interface Product {
  id: number;
  name: string;
  solutionIcon?: string | null; solutionIconName?: string | null;
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

interface AuditUser {
  firstName?: string | null;
  lastName?: string | null;
  email: string;
}

export interface LibraryAssumptionRecord {
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
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUser?: AuditUser | null;
  updatedByUser?: AuditUser | null;
}

export interface LibraryDependencyRecord {
  id: number;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  solutionIds?: number[] | null;
  isAllSolutions?: boolean | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUser?: AuditUser | null;
  updatedByUser?: AuditUser | null;
}

export interface ProjectAssumptionRecord {
  id: number;
  assumptionId?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  projectSolutionIds?: number[] | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUser?: AuditUser | null;
  updatedByUser?: AuditUser | null;
  libraryItem?: LibraryAssumptionRecord | null;
}

export interface ProjectDependencyRecord {
  id: number;
  dependencyId?: number | null;
  title: string;
  description?: string | null;
  notes?: string | null;
  validationCheck?: string | null;
  categoryId?: number | null;
  category?: Category | null;
  solutionId?: number | null;
  projectSolutionIds?: number[] | null;
  owner?: string | null;
  dueDate?: string | null;
  status?: "open" | "in_review" | "blocking" | "resolved" | "fail" | "blocked" | "inconclusive" | null;
  successCriteriaId?: number | null;
  successCriteriaIds?: number[] | null;
  assignedUserIds?: string[] | null;
  assignedCustomerEmails?: string[] | null;
  assignedTeams?: string[] | null;
  isSystem: boolean;
  isActive: boolean;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUser?: AuditUser | null;
  updatedByUser?: AuditUser | null;
  libraryItem?: LibraryDependencyRecord | null;
}

// ─── AssumptionSheet ──────────────────────────────────────────────────────────
// Unified drawer for assumptions in both library and project contexts.
// mode="library": manages library-level fields (title, category, solutionIds, description, notes, admin toggles)
// mode="project": picker to select a library item + project-instance overrides (description, notes, validationCheck, solutionId)
// ─────────────────────────────────────────────────────────────────────────────

export interface AssumptionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "library" | "project";
  editingItem?: LibraryAssumptionRecord | ProjectAssumptionRecord | null;
  projectId?: number;
  categories?: Category[];
  products?: Product[];
  projectProductIds?: number[];
  onSuccess?: () => void;
}

export function AssumptionSheet({
  open,
  onOpenChange,
  mode,
  editingItem,
  projectId,
  categories = [],
  products = [],
  projectProductIds = [],
  onSuccess,
}: AssumptionSheetProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const isAdmin = user?.role === "Admin";
  const isEditing = !!editingItem;

  // ── Library-mode fields ───────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedSolutionIds, setSelectedSolutionIds] = useState<number[]>([]);
  const [isAllSolutions, setIsAllSolutions] = useState(true);
  const [isSystem, setIsSystem] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // ── Shared / project-instance override fields ─────────────────────────────
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [validationCheck, setValidationCheck] = useState("");
  const [solutionId, setSolutionId] = useState<string>("");

  // ── Project-mode: library item picker ────────────────────────────────────
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");

  // ── Library items for picker (project mode only) ─────────────────────────
  const { data: libraryItems = [] } = useQuery<LibraryAssumptionRecord[]>({
    queryKey: ["/api/assumptions", { active: true }],
    queryFn: async () => {
      const res = await fetch("/api/assumptions");
      if (!res.ok) throw new Error("Failed to fetch assumptions library");
      return res.json();
    },
    enabled: open && mode === "project" && !isEditing,
  });

  const selectedLibraryItem = libraryItems.find((i) => String(i.id) === selectedLibraryId) ?? null;

  const displayedLibItem =
    isEditing && mode === "project"
      ? ((editingItem as ProjectAssumptionRecord).libraryItem ?? null)
      : selectedLibraryItem;

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (isEditing && editingItem) {
      if (mode === "library") {
        const lib = editingItem as LibraryAssumptionRecord;
        setTitle(lib.title ?? "");
        setDescription(lib.description ?? "");
        setNotes(lib.notes ?? "");
        setValidationCheck(lib.validationCheck ?? "");
        setCategoryId(lib.categoryId ? String(lib.categoryId) : "");
        const hasSolIds = lib.solutionIds && lib.solutionIds.length > 0;
        const legacyIds = !hasSolIds && lib.solutionId ? [lib.solutionId] : [];
        const resolved = hasSolIds ? lib.solutionIds! : legacyIds;
        setSelectedSolutionIds(resolved);
        setIsAllSolutions(resolved.length === 0);
        setIsSystem(lib.isSystem ?? false);
        setIsActive(lib.isActive ?? true);
        setSolutionId("");
      } else {
        const proj = editingItem as ProjectAssumptionRecord;
        setDescription(proj.description ?? "");
        setNotes(proj.notes ?? "");
        setValidationCheck(proj.validationCheck ?? "");
        const projSolIds =
          proj.projectSolutionIds && proj.projectSolutionIds.length > 0
            ? proj.projectSolutionIds
            : proj.solutionId
              ? [proj.solutionId]
              : [];
        setSelectedSolutionIds(projSolIds);
        setIsAllSolutions(projSolIds.length === 0);
        setSolutionId("");
        setSelectedLibraryId("");
      }
    } else {
      setTitle("");
      setDescription("");
      setNotes("");
      setValidationCheck("");
      setCategoryId("");
      setSelectedSolutionIds([]);
      setIsAllSolutions(true);
      setIsSystem(false);
      setIsActive(true);
      setSolutionId("");
      setSelectedLibraryId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem?.id, mode]);

  useEffect(() => {
    if (!open || mode !== "project" || isEditing || !selectedLibraryId) return;
    const item = libraryItems.find((i) => String(i.id) === selectedLibraryId);
    if (!item) return;
    setDescription(item.description ?? "");
    setNotes(item.notes ?? "");
    setValidationCheck(item.validationCheck ?? "");
    const libSolIds = item.solutionIds && item.solutionIds.length > 0 ? item.solutionIds : [];
    const filteredIds = projectProductIds.length > 0
      ? libSolIds.filter((id) => projectProductIds.includes(id))
      : libSolIds;
    setSelectedSolutionIds(filteredIds);
    setIsAllSolutions(filteredIds.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLibraryId]);

  const createLibMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/assumptions", data),
    onSuccess: () => {
      onSuccess?.();
      showSuccessToast(t("shared.assumptionSheet.toastCreated"));
      onOpenChange(false);
    },
    onError: (err: any) =>
      showErrorToast(t("shared.assumptionSheet.toastCreateFailed"), err.message),
  });

  const updateLibMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/assumptions/${id}`, data),
    onSuccess: () => {
      onSuccess?.();
      showSuccessToast(t("shared.assumptionSheet.toastUpdated"));
      onOpenChange(false);
    },
    onError: (err: any) =>
      showErrorToast(t("shared.assumptionSheet.toastUpdateFailed"), err.message),
  });

  const [isSavingProject, setIsSavingProject] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "library") {
      const data = {
        title,
        description: description || null,
        notes: notes || null,
        validationCheck: validationCheck || null,
        categoryId: categoryId ? parseInt(categoryId) : null,
        solutionIds: isAllSolutions ? null : selectedSolutionIds,
        isSystem,
        isActive,
      };
      if (isEditing && editingItem) {
        updateLibMutation.mutate({ id: editingItem.id, data });
      } else {
        createLibMutation.mutate(data);
      }
    } else {
      // project mode
      setIsSavingProject(true);
      try {
        const instanceFields = {
          description: description || null,
          notes: notes || null,
          validationCheck: validationCheck || null,
          solutionIds: isAllSolutions ? [] : selectedSolutionIds,
          solutionId: !isAllSolutions && selectedSolutionIds.length > 0 ? selectedSolutionIds[0] : null,
        };
        if (isEditing && editingItem) {
          await apiRequest("PATCH", `/api/project-assumptions/${editingItem.id}`, instanceFields);
          showSuccessToast(t("shared.assumptionSheet.toastUpdated"));
        } else {
          if (!selectedLibraryId) {
            showErrorToast(t("shared.assumptionSheet.selectLibraryFirst"));
            return;
          }
          await apiRequest("POST", "/api/project-assumptions", {
            assumptionId: parseInt(selectedLibraryId),
            projectId,
            ...instanceFields,
          });
          showSuccessToast(t("shared.assumptionSheet.toastAddedToProject"));
        }
        onSuccess?.();
        onOpenChange(false);
      } catch (err: any) {
        showErrorToast(t("shared.assumptionSheet.toastSaveFailed"), err.message);
      } finally {
        setIsSavingProject(false);
      }
    }
  };

  const isSaving =
    createLibMutation.isPending || updateLibMutation.isPending || isSavingProject;

  const canSave = mode === "library" ? !!title.trim() : isEditing || !!selectedLibraryId;

  const toggleSolution = (id: number, checked: boolean) => {
    setSelectedSolutionIds((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id)
    );
  };

  const libraryOptions = useMemo(() => {
    const filtered = mode === "project" && projectProductIds.length > 0
      ? libraryItems.filter((item) => {
          const isForAll = !item.solutionIds || item.solutionIds.length === 0;
          return isForAll || item.solutionIds!.some((id) => projectProductIds.includes(id));
        })
      : libraryItems;
    return filtered.map((i) => ({ value: String(i.id), label: i.title }));
  }, [libraryItems, projectProductIds, mode]);

  const projectProducts = useMemo(
    () => projectProductIds.length > 0 ? products.filter((p) => projectProductIds.includes(p.id)) : products,
    [products, projectProductIds]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[540px] sm:max-w-[540px] overflow-y-auto">
        <SheetDescription className="sr-only">
          {isEditing ? t("shared.assumptionSheet.editAssumption") : mode === "library" ? t("shared.assumptionSheet.createAssumption") : t("shared.assumptionSheet.addToProject")}
        </SheetDescription>
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <BookMarked className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {isEditing ? t("shared.assumptionSheet.editAssumption") : mode === "library" ? t("shared.assumptionSheet.newAssumption") : t("shared.assumptionSheet.addProjectAssumption")}
          </SheetTitle>
          {isEditing && editingItem && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-0.5">
              {editingItem.createdAt && (
                <div className="flex flex-col gap-0.5">
                  <span>{t("shared.assumptionSheet.createdLabel")} <span className="font-medium text-foreground">{formatDateForDisplay(editingItem.createdAt)}</span></span>
                  {editingItem.createdByUser && (
                    <span>{t("shared.assumptionSheet.byLabel")} <span className="font-medium text-foreground">{[editingItem.createdByUser.firstName, editingItem.createdByUser.lastName].filter(Boolean).join(" ") || editingItem.createdByUser.email}</span></span>
                  )}
                </div>
              )}
              {editingItem.updatedAt && (
                <div className="flex flex-col gap-0.5">
                  <span>{t("shared.assumptionSheet.lastUpdated")} <span className="font-medium text-foreground">{formatDateForDisplay(editingItem.updatedAt)}</span></span>
                  {(editingItem as any).updatedByUser && (
                    <span>{t("shared.assumptionSheet.byLabel")} <span className="font-medium text-foreground">{[(editingItem as any).updatedByUser.firstName, (editingItem as any).updatedByUser.lastName].filter(Boolean).join(" ") || (editingItem as any).updatedByUser.email}</span></span>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-0">
          {/* ── Library Item Section ───────────────────────────────────── */}
          <div className="space-y-4 pb-5">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
                <BookOpenCheck className="h-3.5 w-3.5" />
                {t("shared.assumptionSheet.libraryItem")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {mode === "library" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="asm-title">{t("shared.assumptionSheet.titleRequired")}</Label>
                  <Input
                    id="asm-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("shared.assumptionSheet.enterTitle")}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t("shared.assumptionSheet.category")}</Label>
                  <Select
                    value={categoryId || "_none"}
                    onValueChange={(v) => setCategoryId(v === "_none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("shared.assumptionSheet.selectCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("shared.assumptionSheet.noneOption")}</SelectItem>
                      {categories.filter((c) => c.isActive).map((c) => (
                        <Tooltip key={c.id}>
                          <TooltipTrigger asChild>
                            <SelectItem value={String(c.id)}>
                              <span className="flex items-center gap-2">
                                {c.icon && <DynamicIcon name={c.icon} className="h-4 w-4 shrink-0" />}
                                {c.name}
                              </span>
                            </SelectItem>
                          </TooltipTrigger>
                          {c.description && (
                            <TooltipContent side="right" className="max-w-xs">
                              {c.description}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("shared.assumptionSheet.solutionAlignment")}</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Checkbox
                        id="asm-sol-all"
                        checked={isAllSolutions}
                        onCheckedChange={(checked) => {
                          setIsAllSolutions(!!checked);
                          if (checked) setSelectedSolutionIds([]);
                        }}
                      />
                      <Label htmlFor="asm-sol-all" className="font-semibold cursor-pointer">
                        {t("shared.assumptionSheet.allSolutions")}
                      </Label>
                    </div>
                    {products.map((p) => (
                      <div key={p.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`asm-sol-${p.id}`}
                          checked={selectedSolutionIds.includes(p.id)}
                          disabled={isAllSolutions}
                          onCheckedChange={(checked) => toggleSolution(p.id, !!checked)}
                        />
                        <Label
                          htmlFor={`asm-sol-${p.id}`}
                          className={`flex items-center gap-1.5 cursor-pointer ${isAllSolutions ? "opacity-50" : ""}`}
                        >
                          <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-4 h-4 object-contain shrink-0" />
                          {p.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("shared.assumptionSheet.selectSpecificSolutionsHint")}
                  </p>
                </div>

                {isAdmin && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/40">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("shared.assumptionSheet.adminSettings")}
                    </p>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("shared.assumptionSheet.active")}</Label>
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("shared.assumptionSheet.systemItem")}</Label>
                      <Switch checked={isSystem} onCheckedChange={setIsSystem} />
                    </div>
                  </div>
                )}
              </>
            ) : isEditing ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {t("shared.assumptionSheet.linkedLibraryReadOnly")}
                </p>
                <p className="font-semibold text-sm">
                  {displayedLibItem?.title ?? (editingItem as ProjectAssumptionRecord)?.title ?? "—"}
                </p>
                {displayedLibItem?.category && (
                  <p className="text-xs text-muted-foreground">
                    {t("shared.assumptionSheet.categoryPrefix")} {displayedLibItem.category.name}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("shared.assumptionSheet.selectFromLibrary")}</Label>
                <SearchableSelect
                  options={libraryOptions}
                  value={selectedLibraryId || "_none"}
                  onValueChange={(v) => setSelectedLibraryId(v === "_none" ? "" : v)}
                  placeholder={t("shared.assumptionSheet.searchAssumptions")}
                  searchPlaceholder={t("shared.assumptionSheet.filterAssumptions")}
                />
                {selectedLibraryItem && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1 mt-2">
                    <p className="font-semibold text-sm">{selectedLibraryItem.title}</p>
                    {selectedLibraryItem.category && (
                      <p className="text-xs text-muted-foreground">
                        {t("shared.assumptionSheet.categoryPrefix")} {selectedLibraryItem.category.name}
                      </p>
                    )}
                    {selectedLibraryItem.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {selectedLibraryItem.description}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("shared.assumptionSheet.pickExistingHint")}
                </p>
              </div>
            )}
          </div>

          {/* ── Project Instance Section (project mode) or Description/Notes (library mode) ── */}
          <div className="space-y-4 pt-1 pb-5">
            {mode === "project" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t("shared.assumptionSheet.projectInstance")}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  {t("shared.assumptionSheet.projectFieldsHint")}
                </p>
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="asm-desc">{t("shared.assumptionSheet.description")}</Label>
              <Textarea
                id="asm-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === "project" ? t("shared.assumptionSheet.descriptionPlaceholderProject") : t("shared.assumptionSheet.descriptionPlaceholderLibrary")}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asm-notes">{t("shared.assumptionSheet.notes")}</Label>
              <Textarea
                id="asm-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={mode === "project" ? t("shared.assumptionSheet.notesPlaceholderProject") : t("shared.assumptionSheet.notesPlaceholderLibrary")}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="asm-validation">{t("shared.assumptionSheet.validationCheck")}</Label>
              <Textarea
                id="asm-validation"
                value={validationCheck}
                onChange={(e) => setValidationCheck(e.target.value)}
                placeholder={mode === "project" ? t("shared.assumptionSheet.validationPlaceholderProject") : t("shared.assumptionSheet.validationPlaceholderLibrary")}
                rows={2}
              />
            </div>

            {mode === "project" && projectProducts.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("shared.assumptionSheet.solutionAlignment")}</Label>
                <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                  <div className="flex items-center space-x-2 pb-2 border-b">
                    <Checkbox
                      id="asm-proj-sol-all"
                      checked={isAllSolutions}
                      onCheckedChange={(checked) => {
                        setIsAllSolutions(!!checked);
                        if (checked) setSelectedSolutionIds([]);
                      }}
                    />
                    <Label htmlFor="asm-proj-sol-all" className="font-semibold cursor-pointer">
                      {t("shared.assumptionSheet.allSolutions")}
                    </Label>
                  </div>
                  {projectProducts.map((p) => (
                    <div key={p.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`asm-proj-sol-${p.id}`}
                        checked={selectedSolutionIds.includes(p.id)}
                        disabled={isAllSolutions}
                        onCheckedChange={(checked) => toggleSolution(p.id, !!checked)}
                      />
                      <Label
                        htmlFor={`asm-proj-sol-${p.id}`}
                        className={`flex items-center gap-1.5 cursor-pointer ${isAllSolutions ? "opacity-50" : ""}`}
                      >
                        <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-4 h-4 object-contain shrink-0" />
                        {p.name}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("shared.assumptionSheet.tagSolutionsHint")}
                </p>
              </div>
            )}
          </div>

          <SheetFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1.5" />
              {t("shared.assumptionSheet.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || !canSave}>
              {isSaving ? (
                t("shared.assumptionSheet.saving")
              ) : isEditing ? (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  {mode === "library" ? t("shared.assumptionSheet.update") : t("shared.assumptionSheet.updateAssumption")}
                </>
              ) : mode === "library" ? (
                <>
                  <BookMarked className="h-4 w-4 mr-1.5" />
                  {t("shared.assumptionSheet.createAssumption")}
                </>
              ) : (
                <>
                  <BookMarked className="h-4 w-4 mr-1.5" />
                  {t("shared.assumptionSheet.addProjectAssumption")}
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── CriteriaGroupedPicker ────────────────────────────────────────────────────

interface CriteriaGroupedPickerProps {
  criteria: SuccessCriterion[];
  value: string[];
  onValueChange: (value: string[]) => void;
}

function CriteriaGroupedPicker({ criteria, value, onValueChange }: CriteriaGroupedPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const selectedSet = useMemo(() => new Set(value), [value]);

  const grouped = useMemo(() => {
    const groups: Record<string, SuccessCriterion[]> = {};
    for (const sc of criteria) {
      const key = sc.productName || t("shared.dependencySheet.noSolution");
      if (!groups[key]) groups[key] = [];
      groups[key].push(sc);
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criteria]);

  const filteredGroups = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return grouped;
    const result: Record<string, SuccessCriterion[]> = {};
    for (const [productName, items] of Object.entries(grouped)) {
      const matchingItems = items.filter(
        (sc) =>
          productName.toLowerCase().includes(q) ||
          (sc.componentName || "").toLowerCase().includes(q) ||
          (sc.criterion || "").toLowerCase().includes(q)
      );
      if (matchingItems.length > 0) result[productName] = matchingItems;
    }
    return result;
  }, [grouped, search]);

  const getLabel = useCallback((sc: SuccessCriterion) => {
    const num = sc.lineNumber ?? sc.id;
    if (sc.componentName) return `#${num}: ${sc.componentName} — ${sc.criterion}`;
    return `#${num}: ${sc.criterion}`;
  }, []);

  const toggleGroup = (name: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleToggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onValueChange(Array.from(next));
  };

  const handleClearAll = () => {
    onValueChange([]);
  };

  const triggerLabel = useMemo(() => {
    if (value.length === 0) return null;
    if (value.length === 1) {
      const sc = criteria.find((c) => String(c.id) === value[0]);
      return sc ? (
        <span className="flex items-center gap-2 min-w-0">
          <SolutionGraphic graphic={sc.solutionIcon} icon={sc.solutionIconName} name="" className="h-4 w-4 object-contain shrink-0" />
          <span className="truncate text-sm">{getLabel(sc)}</span>
        </span>
      ) : null;
    }
    return (
      <span className="flex items-center gap-1.5 text-sm">
        <span className="shrink-0 font-bold text-purple-700 dark:text-purple-400 text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-1.5 py-0.5">
          {value.length}
        </span>
        <span>{t("shared.dependencySheet.criteriaSelected")}</span>
      </span>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, criteria, getLabel]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-auto min-h-9 py-1.5"
        >
          {triggerLabel ?? (
            <span className="text-muted-foreground text-sm">{t("shared.dependencySheet.selectSuccessCriteria")}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[500px]" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("shared.dependencySheet.searchCriteria")}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-80">
            <CommandItem
              value="_none"
              onSelect={handleClearAll}
              className="text-muted-foreground italic"
            >
              {t("shared.dependencySheet.clearAll")}
            </CommandItem>
            {Object.keys(filteredGroups).length === 0 && (
              <CommandEmpty>{t("shared.dependencySheet.noCriteriaMatch")}</CommandEmpty>
            )}
            {Object.entries(filteredGroups).map(([productName, items]) => {
              const first = items[0];
              const isCollapsed = collapsedGroups.has(productName);
              return (
                <CommandGroup key={productName}>
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleGroup(productName)}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    )}
                    <SolutionGraphic graphic={first?.solutionIcon} icon={first?.solutionIconName} className="h-4 w-4" />
                    <span>{productName}</span>
                  </div>
                  {!isCollapsed && (
                    <div className="grid grid-cols-2 gap-1.5 px-2 pb-2 pt-0.5">
                      {items.map((sc) => {
                        const num = sc.lineNumber ?? sc.id;
                        const isSelected = selectedSet.has(String(sc.id));
                        const tooltipParts = [
                          sc.componentName ? { label: t("shared.dependencySheet.componentLabel"), val: sc.componentName } : null,
                          sc.valueMappingName ? { label: t("shared.dependencySheet.valueMappingLabel"), val: sc.valueMappingName } : null,
                          sc.expectedOutcome ? { label: t("shared.dependencySheet.expectedOutcomeLabel"), val: sc.expectedOutcome } : null,
                        ].filter(Boolean) as { label: string; val: string }[];
                        return (
                          <Tooltip key={sc.id}>
                            <TooltipTrigger asChild>
                              <div
                                onClick={() => handleToggle(String(sc.id))}
                                className={`relative flex flex-col gap-0.5 rounded-md border cursor-pointer p-2 text-xs transition-colors select-none ${
                                  isSelected
                                    ? "bg-purple-100 border-purple-400 dark:bg-purple-900/40 dark:border-purple-600"
                                    : "bg-background hover:bg-purple-50 dark:hover:bg-purple-950/20 border-border"
                                }`}
                              >
                                {isSelected && (
                                  <span className="absolute top-1 right-1 text-purple-600 dark:text-purple-400">
                                    <Check className="h-3 w-3" />
                                  </span>
                                )}
                                <div className="flex items-center gap-1.5 min-w-0 pr-4">
                                  <span className="shrink-0 font-bold text-purple-700 dark:text-purple-400 text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-1 py-0.5">
                                    #{num}
                                  </span>
                                  {sc.componentName && (
                                    <span className="text-[10px] text-muted-foreground font-medium truncate">
                                      {sc.componentName}
                                    </span>
                                  )}
                                </div>
                                <span className="leading-tight text-foreground line-clamp-2 text-xs">
                                  {sc.criterion || sc.name}
                                </span>
                                {sc.valueMappingName && (
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {sc.valueMappingName}
                                  </span>
                                )}
                              </div>
                            </TooltipTrigger>
                            {tooltipParts.length > 0 && (
                              <TooltipContent side="right" className="max-w-72">
                                <div className="space-y-1 text-xs">
                                  {tooltipParts.map((p) => (
                                    <div key={p.label}>
                                      <span className="font-semibold">{p.label}:</span> {p.val}
                                    </div>
                                  ))}
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
        {value.length > 0 && (
          <div className="border-t px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t("shared.dependencySheet.selectedCount", { count: value.length })}</span>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setOpen(false)}
            >
              {t("shared.dependencySheet.done")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified drawer for dependencies in both library and project contexts.
// mode="library": manages library-level fields (title, category, solutionIds, validationCheck, description, notes, admin toggles)
// mode="project": picker to select a library item + project-instance fields (status, owner, dueDate, solutionId, successCriteriaId, description, notes, validationCheck)
// ─────────────────────────────────────────────────────────────────────────────

export interface DependencySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "library" | "project";
  editingItem?: LibraryDependencyRecord | ProjectDependencyRecord | null;
  projectId?: number;
  categories?: Category[];
  products?: Product[];
  projectProductIds?: number[];
  projectSuccessCriteria?: SuccessCriterion[];
  onSuccess?: () => void;
}

export function DependencySheet({
  open,
  onOpenChange,
  mode,
  editingItem,
  projectId,
  categories = [],
  products = [],
  projectProductIds = [],
  projectSuccessCriteria = [],
  onSuccess,
}: DependencySheetProps) {
  const { user } = useAuth();
  const { t } = useTranslation();

  const isAdmin = user?.role === "Admin";
  const isEditing = !!editingItem;

  // ── Library-mode fields ───────────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [selectedSolutionIds, setSelectedSolutionIds] = useState<number[]>([]);
  const [isAllSolutions, setIsAllSolutions] = useState(true);
  const [isSystem, setIsSystem] = useState(false);
  const [isActive, setIsActive] = useState(true);

  // ── Shared / project-instance override fields ─────────────────────────────
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [validationCheck, setValidationCheck] = useState("");
  const [solutionId, setSolutionId] = useState<string>("");

  // ── Project-only fields ───────────────────────────────────────────────────
  const [owner, setOwner] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"open" | "in_review" | "blocking" | "resolved" | "fail" | "blocked" | "inconclusive">("open");
  const [successCriteriaIds, setSuccessCriteriaIds] = useState<string[]>([]);

  // ── Assignment picker state ───────────────────────────────────────────────
  const [assignedUserIds, setAssignedUserIds] = useState<string[]>([]);
  const [assignedCustomerEmails, setAssignedCustomerEmails] = useState<string[]>([]);
  const [assignedTeams, setAssignedTeams] = useState<string[]>([]);
  const [internalSectionOpen, setInternalSectionOpen] = useState(false);
  const [partnerSectionOpen, setPartnerSectionOpen] = useState(false);
  const [customerSectionOpen, setCustomerSectionOpen] = useState(false);
  const [teamOwnedSectionOpen, setTeamOwnedSectionOpen] = useState(false);

  // ── Project-mode: library item picker ────────────────────────────────────
  const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");

  // ── Library items for picker (project mode only) ─────────────────────────
  const { data: libraryItems = [] } = useQuery<LibraryDependencyRecord[]>({
    queryKey: ["/api/dependencies", { active: true }],
    queryFn: async () => {
      const res = await fetch("/api/dependencies");
      if (!res.ok) throw new Error("Failed to fetch dependencies library");
      return res.json();
    },
    enabled: open && mode === "project" && !isEditing,
  });

  const selectedLibraryItem = libraryItems.find((i) => String(i.id) === selectedLibraryId) ?? null;

  const displayedLibItem =
    isEditing && mode === "project"
      ? ((editingItem as ProjectDependencyRecord).libraryItem ?? null)
      : selectedLibraryItem;

  // ── Project team data (for assignment picker) ─────────────────────────────
  const { data: projectData } = useQuery<{
    primaryEngineerId?: string | null;
    specialistEngineerId?: string | null;
    supportingEngineers?: string[] | null;
    accountRepresentativeId?: string | null;
  }>({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: open && mode === "project" && !!projectId,
  });

  const { data: allUsers = [] } = useQuery<{
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email: string;
    role?: string | null;
    stakeholderTypes?: string[] | null;
  }[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: open && mode === "project" && !!projectId,
  });

  const { data: customerAccess = [] } = useQuery<{
    id: number;
    userEmail: string;
    permission: string;
  }[]>({
    queryKey: ["/api/customer-access", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/customer-access/${projectId}`);
      if (!res.ok) throw new Error("Failed to fetch customer access");
      return res.json();
    },
    enabled: open && mode === "project" && !!projectId,
  });

  const teamMemberIds = useMemo(() => {
    if (!projectData) return [];
    const ids = new Set<string>();
    if (projectData.primaryEngineerId) ids.add(projectData.primaryEngineerId);
    if (projectData.specialistEngineerId) ids.add(projectData.specialistEngineerId);
    if (projectData.supportingEngineers) projectData.supportingEngineers.forEach((id) => ids.add(id));
    if (projectData.accountRepresentativeId) ids.add(projectData.accountRepresentativeId);
    return Array.from(ids);
  }, [projectData]);

  const teamMembers = useMemo(() => {
    return teamMemberIds
      .map((id) => allUsers.find((u) => u.id === id))
      .filter(Boolean) as { id: string; firstName?: string | null; lastName?: string | null; email: string; role?: string | null; stakeholderTypes?: string[] | null }[];
  }, [teamMemberIds, allUsers]);

  const internalMembers = useMemo(
    () => teamMembers.filter((u) => u.role !== "Partner"),
    [teamMembers]
  );

  const partnerMembers = useMemo(
    () => teamMembers.filter((u) => u.role === "Partner"),
    [teamMembers]
  );

  const getUserDisplayName = useCallback((id: string) => {
    const u = allUsers.find((u) => u.id === id);
    if (!u) return id;
    if (u.firstName || u.lastName) return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
    return u.email;
  }, [allUsers]);

  // ── Reset on open ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (isEditing && editingItem) {
      if (mode === "library") {
        const lib = editingItem as LibraryDependencyRecord;
        setTitle(lib.title ?? "");
        setDescription(lib.description ?? "");
        setNotes(lib.notes ?? "");
        setValidationCheck(lib.validationCheck ?? "");
        setCategoryId(lib.categoryId ? String(lib.categoryId) : "");
        const hasSolIds = lib.solutionIds && lib.solutionIds.length > 0;
        const legacyIds = !hasSolIds && lib.solutionId ? [lib.solutionId] : [];
        const resolved = hasSolIds ? lib.solutionIds! : legacyIds;
        setSelectedSolutionIds(resolved);
        setIsAllSolutions(lib.isAllSolutions !== false && resolved.length === 0);
        setIsSystem(lib.isSystem ?? false);
        setIsActive(lib.isActive ?? true);
        setSolutionId("");
        setOwner("");
        setDueDate("");
        setStatus("open");
        setSuccessCriteriaIds([]);
      } else {
        const proj = editingItem as ProjectDependencyRecord;
        setDescription(proj.description ?? "");
        setNotes(proj.notes ?? "");
        setValidationCheck(proj.validationCheck ?? "");
        const projSolIds =
          proj.projectSolutionIds && proj.projectSolutionIds.length > 0
            ? proj.projectSolutionIds
            : proj.solutionId
              ? [proj.solutionId]
              : [];
        setSelectedSolutionIds(projSolIds);
        setIsAllSolutions(projSolIds.length === 0);
        setSolutionId("");
        setOwner(proj.owner ?? "");
        setDueDate(proj.dueDate ? proj.dueDate.substring(0, 10) : "");
        setStatus(proj.status ?? "open");
        setSuccessCriteriaIds(
          proj.successCriteriaIds && proj.successCriteriaIds.length > 0
            ? proj.successCriteriaIds.map(String)
            : proj.successCriteriaId
            ? [String(proj.successCriteriaId)]
            : []
        );
        setAssignedUserIds(proj.assignedUserIds ?? []);
        setAssignedCustomerEmails(proj.assignedCustomerEmails ?? []);
        setAssignedTeams(proj.assignedTeams ?? []);
        setSelectedLibraryId("");
      }
    } else {
      setTitle("");
      setDescription("");
      setNotes("");
      setValidationCheck("");
      setCategoryId("");
      setSelectedSolutionIds([]);
      setIsAllSolutions(true);
      setIsSystem(false);
      setIsActive(true);
      setSolutionId("");
      setOwner("");
      setDueDate("");
      setStatus("open");
      setSuccessCriteriaIds([]);
      setAssignedUserIds([]);
      setAssignedCustomerEmails([]);
      setAssignedTeams([]);
      setSelectedLibraryId("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingItem?.id, mode]);

  useEffect(() => {
    if (!open || mode !== "project" || isEditing || !selectedLibraryId) return;
    const item = libraryItems.find((i) => String(i.id) === selectedLibraryId);
    if (!item) return;
    setDescription(item.description ?? "");
    setNotes(item.notes ?? "");
    setValidationCheck(item.validationCheck ?? "");
    const libSolIds = item.solutionIds && item.solutionIds.length > 0 ? item.solutionIds : [];
    const filteredIds = projectProductIds.length > 0
      ? libSolIds.filter((id) => projectProductIds.includes(id))
      : libSolIds;
    const libIsAllSolutions = item.isAllSolutions !== false;
    setSelectedSolutionIds(libIsAllSolutions ? [] : filteredIds);
    setIsAllSolutions(libIsAllSolutions || filteredIds.length === 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLibraryId]);

  const createLibMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/dependencies", data),
    onSuccess: () => {
      onSuccess?.();
      showSuccessToast(t("shared.dependencySheet.toastCreated"));
      onOpenChange(false);
    },
    onError: (err: any) =>
      showErrorToast(t("shared.dependencySheet.toastCreateFailed"), err.message),
  });

  const updateLibMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/dependencies/${id}`, data),
    onSuccess: () => {
      onSuccess?.();
      showSuccessToast(t("shared.dependencySheet.toastUpdated"));
      onOpenChange(false);
    },
    onError: (err: any) =>
      showErrorToast(t("shared.dependencySheet.toastUpdateFailed"), err.message),
  });

  const [isSavingProject, setIsSavingProject] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "library") {
      const data = {
        title,
        description: description || null,
        notes: notes || null,
        validationCheck: validationCheck || null,
        categoryId: categoryId ? parseInt(categoryId) : null,
        solutionIds: isAllSolutions ? [] : selectedSolutionIds,
        isAllSolutions,
        solutionId: null,
        isSystem,
        isActive,
      };
      if (isEditing && editingItem) {
        updateLibMutation.mutate({ id: editingItem.id, data });
      } else {
        createLibMutation.mutate(data);
      }
    } else {
      setIsSavingProject(true);
      try {
        const computedOwnerParts: string[] = [];
        assignedUserIds.forEach((id) => computedOwnerParts.push(getUserDisplayName(id)));
        assignedCustomerEmails.forEach((email) => {
          const u = allUsers.find((u) => u.email === email);
          if (u && (u.firstName || u.lastName)) {
            computedOwnerParts.push(`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim());
          } else {
            computedOwnerParts.push(email);
          }
        });
        assignedTeams.forEach((team) => computedOwnerParts.push(team));
        const computedOwner = computedOwnerParts.length > 0 ? computedOwnerParts.join(", ") : (owner || null);

        const instanceFields = {
          description: description || null,
          notes: notes || null,
          validationCheck: validationCheck || null,
          solutionIds: isAllSolutions ? [] : selectedSolutionIds,
          solutionId: !isAllSolutions && selectedSolutionIds.length > 0 ? selectedSolutionIds[0] : null,
          status,
          owner: computedOwner,
          dueDate: dueDate || null,
          successCriteriaIds: successCriteriaIds.map(Number),
          successCriteriaId: successCriteriaIds.length > 0 ? parseInt(successCriteriaIds[0]) : null,
          assignedUserIds,
          assignedCustomerEmails,
          assignedTeams,
        };
        if (isEditing && editingItem) {
          await apiRequest("PATCH", `/api/project-dependencies/${editingItem.id}`, instanceFields);
          showSuccessToast(t("shared.dependencySheet.toastUpdated"));
        } else {
          if (!selectedLibraryId) {
            showErrorToast(t("shared.dependencySheet.selectLibraryFirst"));
            return;
          }
          await apiRequest("POST", "/api/project-dependencies", {
            dependencyId: parseInt(selectedLibraryId),
            projectId,
            ...instanceFields,
          });
          showSuccessToast(t("shared.dependencySheet.toastAddedToProject"));
        }
        onSuccess?.();
        onOpenChange(false);
      } catch (err: any) {
        showErrorToast(t("shared.dependencySheet.toastSaveFailed"), err.message);
      } finally {
        setIsSavingProject(false);
      }
    }
  };

  const isSaving =
    createLibMutation.isPending || updateLibMutation.isPending || isSavingProject;

  const canSave = mode === "library" ? !!title.trim() : isEditing || !!selectedLibraryId;

  const toggleSolution = (id: number, checked: boolean) => {
    setSelectedSolutionIds((prev) =>
      checked ? [...prev, id] : prev.filter((s) => s !== id)
    );
  };

  const libraryOptions = useMemo(() => {
    const filtered = mode === "project" && projectProductIds.length > 0
      ? libraryItems.filter((item) => {
          const isForAll = item.isAllSolutions !== false || !item.solutionIds || item.solutionIds.length === 0;
          return isForAll || item.solutionIds!.some((id) => projectProductIds.includes(id));
        })
      : libraryItems;
    return filtered.map((i) => ({ value: String(i.id), label: i.title }));
  }, [libraryItems, projectProductIds, mode]);

  const projectProducts = useMemo(
    () => projectProductIds.length > 0 ? products.filter((p) => projectProductIds.includes(p.id)) : products,
    [products, projectProductIds]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] overflow-y-auto">
        <SheetDescription className="sr-only">
          {isEditing ? t("shared.dependencySheet.editDependency") : mode === "library" ? t("shared.dependencySheet.createDependency") : t("shared.dependencySheet.addToProject")}
        </SheetDescription>
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {isEditing ? t("shared.dependencySheet.editDependency") : mode === "library" ? t("shared.dependencySheet.newDependency") : t("shared.dependencySheet.addProjectDependency")}
          </SheetTitle>
          {isEditing && editingItem && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground mt-0.5">
              {editingItem.createdAt && (
                <div className="flex flex-col gap-0.5">
                  <span>{t("shared.dependencySheet.createdLabel")} <span className="font-medium text-foreground">{formatDateForDisplay(editingItem.createdAt)}</span></span>
                  {editingItem.createdByUser && (
                    <span>{t("shared.dependencySheet.byLabel")} <span className="font-medium text-foreground">{[editingItem.createdByUser.firstName, editingItem.createdByUser.lastName].filter(Boolean).join(" ") || editingItem.createdByUser.email}</span></span>
                  )}
                </div>
              )}
              {editingItem.updatedAt && (
                <div className="flex flex-col gap-0.5">
                  <span>{t("shared.dependencySheet.lastUpdated")} <span className="font-medium text-foreground">{formatDateForDisplay(editingItem.updatedAt)}</span></span>
                  {(editingItem as any).updatedByUser && (
                    <span>{t("shared.dependencySheet.byLabel")} <span className="font-medium text-foreground">{[(editingItem as any).updatedByUser.firstName, (editingItem as any).updatedByUser.lastName].filter(Boolean).join(" ") || (editingItem as any).updatedByUser.email}</span></span>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-0">
          {/* ── Library Item Section ───────────────────────────────────── */}
          <div className="space-y-4 pb-5">
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
                <BookOpenCheck className="h-3.5 w-3.5" />
                {t("shared.dependencySheet.libraryItem")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {mode === "library" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="dep-title">{t("shared.dependencySheet.titleRequired")}</Label>
                  <Input
                    id="dep-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("shared.dependencySheet.enterTitle")}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t("shared.dependencySheet.category")}</Label>
                  <Select
                    value={categoryId || "_none"}
                    onValueChange={(v) => setCategoryId(v === "_none" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("shared.dependencySheet.selectCategory")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">{t("shared.dependencySheet.noneOption")}</SelectItem>
                      {categories.filter((c) => c.isActive).map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          <span className="flex items-center gap-2">
                            {c.icon && <DynamicIcon name={c.icon} className="h-4 w-4 shrink-0" />}
                            {c.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("shared.dependencySheet.solutionAlignment")}</Label>
                  <div className="border rounded-md p-3 space-y-2 max-h-48 overflow-y-auto">
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Checkbox
                        id="dep-sol-all"
                        checked={isAllSolutions}
                        onCheckedChange={(checked) => {
                          setIsAllSolutions(!!checked);
                          if (checked) setSelectedSolutionIds([]);
                        }}
                      />
                      <Label htmlFor="dep-sol-all" className="font-semibold cursor-pointer">
                        {t("shared.dependencySheet.allSolutions")}
                      </Label>
                    </div>
                    {products.map((p) => (
                      <div key={p.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dep-sol-${p.id}`}
                          checked={selectedSolutionIds.includes(p.id)}
                          disabled={isAllSolutions}
                          onCheckedChange={(checked) => toggleSolution(p.id, !!checked)}
                        />
                        <Label
                          htmlFor={`dep-sol-${p.id}`}
                          className={`flex items-center gap-1.5 cursor-pointer ${isAllSolutions ? "opacity-50" : ""}`}
                        >
                          <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-4 h-4 object-contain shrink-0" />
                          {p.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("shared.dependencySheet.selectSpecificSolutionsHint")}
                  </p>
                </div>

                {isAdmin && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/40">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("shared.dependencySheet.adminSettings")}
                    </p>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("shared.dependencySheet.active")}</Label>
                      <Switch checked={isActive} onCheckedChange={setIsActive} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">{t("shared.dependencySheet.systemItem")}</Label>
                      <Switch checked={isSystem} onCheckedChange={setIsSystem} />
                    </div>
                  </div>
                )}
              </>
            ) : isEditing ? (
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {t("shared.dependencySheet.linkedLibraryReadOnly")}
                </p>
                <p className="font-semibold text-sm">
                  {displayedLibItem?.title ?? (editingItem as ProjectDependencyRecord)?.title ?? "—"}
                </p>
                {displayedLibItem?.category && (
                  <p className="text-xs text-muted-foreground">
                    {t("shared.dependencySheet.categoryPrefix")} {displayedLibItem.category.name}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("shared.dependencySheet.selectFromLibrary")}</Label>
                <SearchableSelect
                  options={libraryOptions}
                  value={selectedLibraryId || "_none"}
                  onValueChange={(v) => setSelectedLibraryId(v === "_none" ? "" : v)}
                  placeholder={t("shared.dependencySheet.searchDependencies")}
                  searchPlaceholder={t("shared.dependencySheet.filterDependencies")}
                />
                {selectedLibraryItem && (
                  <div className="rounded-lg border bg-muted/40 p-3 space-y-1 mt-2">
                    <p className="font-semibold text-sm">{selectedLibraryItem.title}</p>
                    {selectedLibraryItem.category && (
                      <p className="text-xs text-muted-foreground">
                        {t("shared.dependencySheet.categoryPrefix")} {selectedLibraryItem.category.name}
                      </p>
                    )}
                    {selectedLibraryItem.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {selectedLibraryItem.description}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("shared.dependencySheet.pickExistingHint")}
                </p>
              </div>
            )}
          </div>

          {/* ── Project Instance / Description Section ───────────────── */}
          <div className="space-y-4 pt-1 pb-5">
            {mode === "project" && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1 flex items-center gap-1.5">
                    <FolderOpen className="h-3.5 w-3.5" />
                    {t("shared.dependencySheet.projectInstance")}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <p className="text-xs text-muted-foreground -mt-1">
                  {t("shared.dependencySheet.projectFieldsHint")}
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t("shared.dependencySheet.status")}</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as typeof status)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">
                          <span className="flex items-center gap-2">
                            <Circle className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" />
                            {t("shared.dependencySheet.statusOpen")}
                          </span>
                        </SelectItem>
                        <SelectItem value="in_review">
                          <span className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                            {t("shared.dependencySheet.statusInReview")}
                          </span>
                        </SelectItem>
                        <SelectItem value="resolved">
                          <span className="flex items-center gap-2">
                            <CircleCheckBig className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" />
                            {t("shared.dependencySheet.statusResolved")}
                          </span>
                        </SelectItem>
                        <SelectItem value="fail">
                          <span className="flex items-center gap-2">
                            <Siren className="h-3.5 w-3.5 text-red-500 dark:text-red-400 shrink-0" />
                            {t("shared.dependencySheet.statusFail")}
                          </span>
                        </SelectItem>
                        <SelectItem value="blocked">
                          <span className="flex items-center gap-2">
                            <OctagonX className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400 shrink-0" />
                            {t("shared.dependencySheet.statusBlocked")}
                          </span>
                        </SelectItem>
                        <SelectItem value="inconclusive">
                          <span className="flex items-center gap-2">
                            <Info className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 shrink-0" />
                            {t("shared.dependencySheet.statusInconclusive")}
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dep-due">{t("shared.dependencySheet.dueDate")}</Label>
                    <Input
                      id="dep-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t("shared.dependencySheet.assignTo")}</Label>

                  {/* Selected assignment badges */}
                  {(assignedUserIds.length > 0 || assignedCustomerEmails.length > 0 || assignedTeams.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {assignedUserIds.map((uid) => (
                        <Badge key={uid} variant="secondary" className="gap-1 pl-2 pr-1 text-xs">
                          <Users className="h-3 w-3 shrink-0" />
                          <span className="max-w-[120px] truncate">{getUserDisplayName(uid)}</span>
                          <button
                            type="button"
                            onClick={() => setAssignedUserIds((prev) => prev.filter((x) => x !== uid))}
                            className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {assignedCustomerEmails.map((email) => {
                        const cu = allUsers.find((u) => u.email === email);
                        const displayLabel = cu && (cu.firstName || cu.lastName)
                          ? `${cu.firstName ?? ""} ${cu.lastName ?? ""}`.trim()
                          : email;
                        return (
                          <Badge key={email} variant="secondary" className="gap-1 pl-2 pr-1 text-xs">
                            <Building2 className="h-3 w-3 shrink-0" />
                            <span className="max-w-[130px] truncate">{displayLabel}</span>
                            <button
                              type="button"
                              onClick={() => setAssignedCustomerEmails((prev) => prev.filter((x) => x !== email))}
                              className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      {assignedTeams.map((team) => (
                        <Badge key={team} variant="secondary" className="gap-1 pl-2 pr-1 text-xs">
                          <Building2 className="h-3 w-3 shrink-0 text-violet-500" />
                          <span className="max-w-[120px] truncate">{team}</span>
                          <button
                            type="button"
                            onClick={() => setAssignedTeams((prev) => prev.filter((x) => x !== team))}
                            className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Four-section picker */}
                  <div className="border rounded-md overflow-hidden divide-y">
                    {/* Internal section */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setInternalSectionOpen((o) => !o)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                          {t("shared.dependencySheet.internal")}
                        </span>
                        {internalSectionOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                      {internalSectionOpen && (internalMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">
                          {t("shared.dependencySheet.noInternalMembers")}
                        </p>
                      ) : (
                        <div className="px-3 py-2 space-y-1.5 max-h-36 overflow-y-auto">
                          {internalMembers.map((u) => {
                            const displayName =
                              u.firstName || u.lastName
                                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                                : u.email;
                            return (
                              <div key={u.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`assign-nw-${u.id}`}
                                  checked={assignedUserIds.includes(u.id)}
                                  onCheckedChange={(checked) =>
                                    setAssignedUserIds((prev) =>
                                      checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`assign-nw-${u.id}`}
                                  className="text-sm font-normal cursor-pointer flex items-center gap-1"
                                >
                                  {displayName}
                                  {u.role && (
                                    <span className="text-xs text-muted-foreground">· {u.role}</span>
                                  )}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Partner section */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setPartnerSectionOpen((o) => !o)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <Users className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400 shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                          {t("shared.dependencySheet.partner")}
                        </span>
                        {partnerSectionOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                      {partnerSectionOpen && (partnerMembers.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">
                          {t("shared.dependencySheet.noPartnerMembers")}
                        </p>
                      ) : (
                        <div className="px-3 py-2 space-y-1.5 max-h-36 overflow-y-auto">
                          {partnerMembers.map((u) => {
                            const displayName =
                              u.firstName || u.lastName
                                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim()
                                : u.email;
                            return (
                              <div key={u.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`assign-partner-${u.id}`}
                                  checked={assignedUserIds.includes(u.id)}
                                  onCheckedChange={(checked) =>
                                    setAssignedUserIds((prev) =>
                                      checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`assign-partner-${u.id}`}
                                  className="text-sm font-normal cursor-pointer flex items-center gap-1"
                                >
                                  {displayName}
                                  <span className="text-xs text-muted-foreground">· {t("shared.dependencySheet.rolePartner")}</span>
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Customer section */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setCustomerSectionOpen((o) => !o)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <Building2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                          {t("shared.dependencySheet.customer")}
                        </span>
                        {customerSectionOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                      {customerSectionOpen && (customerAccess.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-3 py-2">
                          {t("shared.dependencySheet.noCustomerUsers")}
                        </p>
                      ) : (
                        <div className="px-3 py-2 space-y-1.5 max-h-36 overflow-y-auto">
                          {customerAccess.map((ca) => {
                            const cu = allUsers.find((u) => u.email === ca.userEmail);
                            const fullName = cu && (cu.firstName || cu.lastName)
                              ? `${cu.firstName ?? ""} ${cu.lastName ?? ""}`.trim()
                              : null;
                            const stakeholderLabel = cu?.stakeholderTypes && cu.stakeholderTypes.length > 0
                              ? cu.stakeholderTypes.join(", ")
                              : null;
                            return (
                              <div key={ca.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`assign-customer-${ca.id}`}
                                  checked={assignedCustomerEmails.includes(ca.userEmail)}
                                  onCheckedChange={(checked) =>
                                    setAssignedCustomerEmails((prev) =>
                                      checked ? [...prev, ca.userEmail] : prev.filter((x) => x !== ca.userEmail)
                                    )
                                  }
                                />
                                <Label
                                  htmlFor={`assign-customer-${ca.id}`}
                                  className="text-sm font-normal cursor-pointer flex items-center gap-1"
                                >
                                  {fullName ?? ca.userEmail}
                                  {stakeholderLabel && (
                                    <span className="text-xs text-muted-foreground">· {stakeholderLabel}</span>
                                  )}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {/* Team Owned section */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setTeamOwnedSectionOpen((o) => !o)}
                        className="w-full flex items-center gap-1.5 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                      >
                        <Building2 className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400 shrink-0" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-1 text-left">
                          {t("shared.dependencySheet.teamOwned")}
                        </span>
                        {teamOwnedSectionOpen
                          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                      {teamOwnedSectionOpen && (
                        <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
                          {DEPARTMENTS.map((dept) => (
                            <div key={dept.value} className="flex items-center gap-2">
                              <Checkbox
                                id={`assign-team-${dept.value}`}
                                checked={assignedTeams.includes(dept.value)}
                                onCheckedChange={(checked) =>
                                  setAssignedTeams((prev) =>
                                    checked ? [...prev, dept.value] : prev.filter((x) => x !== dept.value)
                                  )
                                }
                              />
                              <Label
                                htmlFor={`assign-team-${dept.value}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {dept.label}
                              </Label>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("shared.dependencySheet.assignmentHint")}
                  </p>
                </div>

                {projectProducts.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>{t("shared.dependencySheet.solutionAlignment")}</Label>
                    <div className="border rounded-md p-3 space-y-2 max-h-40 overflow-y-auto">
                      <div className="flex items-center space-x-2 pb-2 border-b">
                        <Checkbox
                          id="dep-proj-sol-all"
                          checked={isAllSolutions}
                          onCheckedChange={(checked) => {
                            setIsAllSolutions(!!checked);
                            if (checked) setSelectedSolutionIds([]);
                          }}
                        />
                        <Label htmlFor="dep-proj-sol-all" className="font-semibold cursor-pointer">
                          {t("shared.dependencySheet.allSolutions")}
                        </Label>
                      </div>
                      {projectProducts.map((p) => (
                        <div key={p.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dep-proj-sol-${p.id}`}
                            checked={selectedSolutionIds.includes(p.id)}
                            disabled={isAllSolutions}
                            onCheckedChange={(checked) => toggleSolution(p.id, !!checked)}
                          />
                          <Label
                            htmlFor={`dep-proj-sol-${p.id}`}
                            className={`flex items-center gap-1.5 cursor-pointer ${isAllSolutions ? "opacity-50" : ""}`}
                          >
                            <SolutionGraphic graphic={p.solutionIcon} icon={p.solutionIconName} name={p.name} className="w-4 h-4 object-contain shrink-0" />
                            {p.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("shared.dependencySheet.tagSolutionsHint")}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="dep-desc">{t("shared.dependencySheet.description")}</Label>
              <Textarea
                id="dep-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === "project" ? t("shared.dependencySheet.descriptionPlaceholderProject") : t("shared.dependencySheet.descriptionPlaceholderLibrary")}
                rows={3}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dep-notes">{t("shared.dependencySheet.notes")}</Label>
              <Textarea
                id="dep-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={mode === "project" ? t("shared.dependencySheet.notesPlaceholderProject") : t("shared.dependencySheet.notesPlaceholderLibrary")}
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dep-validation">{t("shared.dependencySheet.validationCheck")}</Label>
              <Textarea
                id="dep-validation"
                value={validationCheck}
                onChange={(e) => setValidationCheck(e.target.value)}
                placeholder={mode === "project" ? t("shared.dependencySheet.validationPlaceholderProject") : t("shared.dependencySheet.validationPlaceholderLibrary")}
                rows={2}
              />
            </div>

            {mode === "project" && projectSuccessCriteria.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("shared.dependencySheet.linkToSuccessCriteria")}</Label>
                <CriteriaGroupedPicker
                  criteria={projectSuccessCriteria}
                  value={successCriteriaIds}
                  onValueChange={setSuccessCriteriaIds}
                />
              </div>
            )}
          </div>

          <SheetFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1.5" />
              {t("shared.dependencySheet.cancel")}
            </Button>
            <Button type="submit" disabled={isSaving || !canSave}>
              {isSaving ? (
                t("shared.dependencySheet.saving")
              ) : isEditing ? (
                <>
                  <Save className="h-4 w-4 mr-1.5" />
                  {mode === "library" ? t("shared.dependencySheet.update") : t("shared.dependencySheet.updateDependency")}
                </>
              ) : mode === "library" ? (
                <>
                  <Link2 className="h-4 w-4 mr-1.5" />
                  {t("shared.dependencySheet.createDependency")}
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-1.5" />
                  {t("shared.dependencySheet.addProjectDependency")}
                </>
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
