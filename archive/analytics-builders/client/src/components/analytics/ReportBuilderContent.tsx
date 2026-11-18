import React, { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Database,
  Download,
  Eye,
  Filter,
  Play,
  Save,
  Settings,
  Tag,
  Table as TableIcon,
  Trash2,
  X,
  ChartColumnStacked,
  ChevronDown,
  BrushCleaning,
  Search,
  Info,
  Pencil,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubNavPopover } from "@/components/ui/sub-nav-popover";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  REPORT_FILTER_OPERATORS,
  REPORT_FILTER_OPERATOR_LABELS,
  defaultOperatorForType,
  describeIncompatibility,
  getValueInputKind,
  isOperatorCompatible,
} from "./report-filter-helpers";
import { FilterChipsInput } from "./FilterChipsInput";
import { FilterSummaryList } from "./FilterSummaryList";
import { groupAccent } from "./report-builder-utils";
import ErrorBoundary from "@/components/errors/error-boundary";

/** Per-source metadata served by GET /api/report-builder/sources. */
interface ReportSourceMetadata {
  source: string;
  tableKey: string;
  oneToMany: boolean;
  filterExamples: Array<{
    label: string;
    field: string;
    operator: string;
    value?: string;
    valueResolver?: "today" | "startOfYear" | "thirtyDaysAgo";
  }>;
}

/**
 * Resolve a registry-declared filter example into the concrete value
 * sent to the server. Most examples carry a literal `value`; a small
 * set use a named resolver so "now"-relative values (today, start of
 * year, 30 days ago) stay correct at click time instead of baking in
 * the registry-load timestamp.
 */
function resolveExampleValue(
  example: ReportSourceMetadata["filterExamples"][number],
): string {
  if (typeof example.value === "string") return example.value;
  switch (example.valueResolver) {
    case "today":
      return new Date().toISOString().slice(0, 10);
    case "startOfYear":
      return `${new Date().getFullYear()}-01-01`;
    case "thirtyDaysAgo": {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    }
    default:
      return "";
  }
}
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";

export interface ReportField {
  field: string;
  label: string;
  type: string;
  source?: string;
  description?: string;
  example?: string | null;
}

export interface ReportFilter {
  field: string;
  operator: string;
  /**
   * Scalar operators (`equals`, `contains`, `greater_than`, ...) carry a
   * `string`. List operators (`in` / `not_in`) carry a real `string[]`
   * that's sent to the server as-is — the JSONB column accepts either
   * shape and the server's `coerceListValue` handles both, but the
   * Report Builder normalises to the operator-appropriate shape before
   * saving so newly-written reports always store an array.
   */
  value: string | string[];
}

export type OutputType = "table" | "table+chart" | "dashboard";
export type ChartType = "bar" | "line" | "pie";

export interface ReportBuilderEditableReport {
  id: number;
  name?: string;
  description?: string;
  selectedFields?: string[];
  filters?: ReportFilter[];
  reportType?: string;
  chartType?: ChartType;
  tags?: string[];
  updatedAt?: string | Date | null;
  configuration?: {
    fields?: string[];
    filters?: ReportFilter[];
    outputType?: OutputType;
    chartType?: ChartType;
  };
}

export interface ReportBuilderContentProps {
  /** When provided, populates the form with this report for editing. */
  editingReport?: ReportBuilderEditableReport | null;
  /** Called after a successful create or update. */
  onReportSaved?: () => void;
  /** Called when the user clicks "Cancel edit" to leave edit mode. */
  onCancelEdit?: () => void;
  /**
   * Called whenever the form's "dirty" state changes.
   * In edit mode, `true` means the form differs from the loaded report.
   * In create mode, `true` means the form has any user-entered content
   * (name, description, fields, filters, output/chart type, or tags).
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * When this number changes, the form is reset back to an empty draft.
   * Used by parents to clear a half-built create-mode draft (for example,
   * after the user confirms discarding unsaved changes).
   */
  formResetSignal?: number;
  /** Currently active sub-tab (controlled). If omitted, the component manages its own. */
  currentTab?: string;
  /** Called when the user changes the sub-tab (controlled mode). */
  onTabChange?: (tab: string) => void;
  /** Optional formatter for column headers in the inline preview table. */
  formatFieldName?: (field: string) => string;
  /** Optional handler for "Export PDF" buttons in preview displays. */
  onExportPDF?: (data: {
    name: string;
    data: any[];
    selectedFields: string[];
    metadata?: any;
  }) => void;
  /** When true (default), renders the floating-rail title card at the top. */
  showHeader?: boolean;
}

const SUB_TABS = ["general", "fields", "filters", "preview"] as const;

interface ReportFormSnapshot {
  reportName: string;
  reportDescription: string;
  selectedFields: string[];
  reportFilters: ReportFilter[];
  outputType: OutputType;
  chartType: ChartType;
  selectedTags: string[];
}

const EMPTY_FORM_SNAPSHOT: ReportFormSnapshot = {
  reportName: "",
  reportDescription: "",
  selectedFields: [],
  reportFilters: [],
  outputType: "table",
  chartType: "bar",
  selectedTags: [],
};

function arraysEqualUnordered(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

function isListOperator(operator: string): boolean {
  return operator === "in" || operator === "not_in";
}

/**
 * Coerces a filter value into the shape its operator expects.
 *
 * - List operators (`in` / `not_in`) want a real `string[]`. An array
 *   passes through trimmed (blanks dropped). A scalar string is wrapped
 *   as a single-element array — commas are kept literal because chips
 *   are now allowed to contain commas. The one place we DO split a
 *   scalar string on commas is when loading a legacy saved report; see
 *   `normaliseLoadedFilters` for that path.
 * - Scalar operators want a `string`. An array is collapsed back to a
 *   `", "`-separated string so a quick `in -> equals` toggle still
 *   shows the user the values they typed.
 */
function normaliseFilterValueForOperator(
  value: ReportFilter["value"],
  operator: string,
): ReportFilter["value"] {
  if (isListOperator(operator)) {
    if (Array.isArray(value)) {
      return value
        .map((part) => (typeof part === "string" ? part.trim() : String(part).trim()))
        .filter((part) => part.length > 0);
    }
    if (typeof value !== "string") return [];
    const trimmed = value.trim();
    return trimmed.length === 0 ? [] : [trimmed];
  }
  if (Array.isArray(value)) return value.join(", ");
  return value ?? "";
}

/**
 * Migrates legacy saved-report filter values into their operator-
 * appropriate shape so newly-edited reports always store a real array
 * for list operators. Reports written before this change held a
 * comma-separated string in the JSONB column; the server still accepts
 * either shape, but normalising on load means dirty-tracking and the
 * outgoing payload don't keep dragging the legacy form around.
 *
 * This is the ONE place where a scalar string for a list operator gets
 * split on commas — the operator-toggle path in `updateFilter` keeps
 * commas literal, since the user's chip might legitimately contain one.
 */
function normaliseLoadedFilters(filters: ReportFilter[]): ReportFilter[] {
  return filters.map((filter) => {
    if (isListOperator(filter.operator) && typeof filter.value === "string") {
      const split = filter.value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      return { ...filter, value: split };
    }
    return {
      ...filter,
      value: normaliseFilterValueForOperator(filter.value, filter.operator),
    };
  });
}

function filterValuesEqual(
  a: ReportFilter["value"],
  b: ReportFilter["value"],
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  // Cross-shape comparisons (string vs array) are never equal: a saved
  // legacy `"a, b"` and a freshly-edited `["a", "b"]` mean the same to
  // the server but the form is now considered dirty so the user can
  // explicitly re-save and migrate the row to the array shape.
  return a === b;
}

function filtersEqual(a: ReportFilter[], b: ReportFilter[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].field !== b[i].field ||
      a[i].operator !== b[i].operator ||
      !filterValuesEqual(a[i].value, b[i].value)
    ) {
      return false;
    }
  }
  return true;
}

function snapshotsEqual(a: ReportFormSnapshot, b: ReportFormSnapshot): boolean {
  return (
    a.reportName === b.reportName &&
    a.reportDescription === b.reportDescription &&
    a.outputType === b.outputType &&
    a.chartType === b.chartType &&
    arraysEqualUnordered(a.selectedFields, b.selectedFields) &&
    arraysEqualUnordered(a.selectedTags, b.selectedTags) &&
    filtersEqual(a.reportFilters, b.reportFilters)
  );
}

const defaultFormatFieldName = (field: string) =>
  field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();

const EXPANDED_FIELD_CATEGORIES_STORAGE_KEY =
  "reportBuilder.expandedFieldCategories";

function loadStoredExpandedFieldCategories(): {
  value: Set<string>;
  hasStoredValue: boolean;
} {
  if (typeof window === "undefined") {
    return { value: new Set(), hasStoredValue: false };
  }
  try {
    const raw = window.localStorage.getItem(
      EXPANDED_FIELD_CATEGORIES_STORAGE_KEY,
    );
    if (raw === null) return { value: new Set(), hasStoredValue: false };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        value: new Set(
          parsed.filter((s): s is string => typeof s === "string"),
        ),
        hasStoredValue: true,
      };
    }
  } catch {
    // ignore corrupt storage values and fall back to default
  }
  return { value: new Set(), hasStoredValue: false };
}

function saveStoredExpandedFieldCategories(values: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      EXPANDED_FIELD_CATEGORIES_STORAGE_KEY,
      JSON.stringify(Array.from(values)),
    );
  } catch {
    // localStorage may be unavailable (private mode, quota); silently ignore
  }
}

export default function ReportBuilderContent({
  editingReport,
  onReportSaved,
  onCancelEdit,
  onDirtyChange,
  formResetSignal,
  currentTab,
  onTabChange,
  formatFieldName = defaultFormatFieldName,
  onExportPDF,
  showHeader = true,
}: ReportBuilderContentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ----- Form state -----
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [reportFilters, setReportFilters] = useState<ReportFilter[]>([]);
  const [outputType, setOutputType] = useState<OutputType>("table");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingReportId, setEditingReportId] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<ReportFormSnapshot>(
    EMPTY_FORM_SNAPSHOT,
  );
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const initialExpandedFieldCategories = useMemo(
    () => loadStoredExpandedFieldCategories(),
    [],
  );
  const [expandedFieldCategories, setExpandedFieldCategories] = useState<Set<string>>(
    initialExpandedFieldCategories.value,
  );
  const hasUserExpansionPrefRef = useRef<boolean>(
    initialExpandedFieldCategories.hasStoredValue,
  );
  const [fieldSearchQuery, setFieldSearchQuery] = useState("");

  // ----- Sub-tab control (controlled or internal) -----
  const [internalTab, setInternalTab] = useState<string>("general");
  const activeTab = currentTab ?? internalTab;
  const handleTabChange = (next: string) => {
    if (onTabChange) {
      onTabChange(next);
    } else {
      setInternalTab(next);
    }
  };

  // ----- Data queries -----
  const { data: availableFields } = useQuery<Record<string, ReportField[]>>({
    queryKey: ["/api/report-builder/fields"],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: sourceMetadata } = useQuery<ReportSourceMetadata[]>({
    queryKey: ["/api/report-builder/sources"],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Look up metadata for a source by name (used by both the Fields
  // tab — to surface the one-to-many fan-out warning — and the
  // Filters tab — to render per-source example chips with matching
  // accent color).
  const metadataBySource = useMemo(() => {
    const map = new Map<string, ReportSourceMetadata>();
    for (const meta of sourceMetadata ?? []) {
      map.set(meta.source, meta);
    }
    return map;
  }, [sourceMetadata]);

  const { data: availableTags } = useQuery<any[]>({
    queryKey: ["/api/tags"],
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: currentUser } = useQuery<any>({
    queryKey: ["/api/auth/user"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ----- Derived state -----
  const fieldsBySource = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ReportField[]>();
    Object.values((availableFields ?? {}) as Record<string, ReportField[]>).forEach((arr) => {
      if (!Array.isArray(arr)) return;
      for (const field of arr) {
        if (!field) continue;
        const source = field.source ?? "Other";
        if (!map.has(source)) {
          map.set(source, []);
          order.push(source);
        }
        map.get(source)!.push(field);
      }
    });
    return order.map((source) => ({ source, fields: map.get(source)! }));
  }, [availableFields]);

  const allFields: ReportField[] = useMemo(
    () => fieldsBySource.flatMap((g) => g.fields),
    [fieldsBySource],
  );

  const isSaveEnabled = reportName.trim().length > 0 && selectedFields.length > 0;

  // ----- Effects -----
  // Expand all source groups by default once fields load, unless the user
  // has a saved expansion preference from a previous session.
  useEffect(() => {
    if (fieldsBySource.length === 0) return;
    if (hasUserExpansionPrefRef.current) return;
    setExpandedFieldCategories((prev) => {
      if (prev.size > 0) return prev;
      const next = new Set<string>();
      fieldsBySource.forEach(({ source }) => next.add(source));
      return next;
    });
  }, [fieldsBySource]);

  // Persist expansion state to localStorage so it survives navigation/reload.
  useEffect(() => {
    if (!hasUserExpansionPrefRef.current) return;
    saveStoredExpandedFieldCategories(expandedFieldCategories);
  }, [expandedFieldCategories]);

  // Filter source groups and field rows based on the search query
  const filteredFieldsBySource = useMemo(() => {
    const query = fieldSearchQuery.trim().toLowerCase();
    if (!query) return fieldsBySource;
    return fieldsBySource
      .map(({ source, fields }) => {
        const sourceMatches = source.toLowerCase().includes(query);
        const matchedFields = sourceMatches
          ? fields
          : fields.filter((f) => f.label.toLowerCase().includes(query));
        return { source, fields: matchedFields };
      })
      .filter(({ fields }) => fields.length > 0);
  }, [fieldsBySource, fieldSearchQuery]);

  // Auto-expand any group that matches an active search so results are visible
  useEffect(() => {
    if (fieldSearchQuery.trim() === "") return;
    setExpandedFieldCategories((prev) => {
      const next = new Set(prev);
      let changed = false;
      filteredFieldsBySource.forEach(({ source }) => {
        if (!next.has(source)) {
          next.add(source);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [fieldSearchQuery, filteredFieldsBySource]);

  const getGroupSelectionState = (
    groupFields: ReportField[],
  ): boolean | "indeterminate" => {
    if (groupFields.length === 0) return false;
    const selectedCount = groupFields.filter((f) =>
      selectedFields.includes(f.field),
    ).length;
    if (selectedCount === 0) return false;
    if (selectedCount === groupFields.length) return true;
    return "indeterminate";
  };

  const toggleGroupSelection = (groupFields: ReportField[]) => {
    const groupNames = groupFields.map((f) => f.field);
    const allSelected = groupNames.every((f) => selectedFields.includes(f));
    if (allSelected) {
      setSelectedFields(selectedFields.filter((f) => !groupNames.includes(f)));
    } else {
      const merged = [...selectedFields];
      for (const name of groupNames) {
        if (!merged.includes(name)) merged.push(name);
      }
      setSelectedFields(merged);
    }
  };

  // Load editingReport into the form when it changes
  useEffect(() => {
    if (!editingReport) {
      setIsEditMode(false);
      setEditingReportId(null);
      setInitialSnapshot(EMPTY_FORM_SNAPSHOT);
      return;
    }

    const loadedName = editingReport.name ?? "";
    const loadedDescription = editingReport.description ?? "";
    const loadedFields =
      editingReport.selectedFields ?? editingReport.configuration?.fields ?? [];
    const loadedFilters = normaliseLoadedFilters(
      editingReport.filters ?? editingReport.configuration?.filters ?? [],
    );

    const reportTypeRaw =
      editingReport.reportType ?? editingReport.configuration?.outputType;
    let loadedOutput: OutputType;
    if (reportTypeRaw === "chart") {
      loadedOutput = "table+chart";
    } else if (
      reportTypeRaw === "table" ||
      reportTypeRaw === "table+chart" ||
      reportTypeRaw === "dashboard"
    ) {
      loadedOutput = reportTypeRaw;
    } else {
      loadedOutput = "table";
    }

    const loadedChart =
      editingReport.chartType ?? editingReport.configuration?.chartType ?? "bar";
    const loadedTags = editingReport.tags ?? [];

    setIsEditMode(true);
    setEditingReportId(editingReport.id);
    setReportName(loadedName);
    setReportDescription(loadedDescription);
    setSelectedFields(loadedFields);
    setReportFilters(loadedFilters);
    setOutputType(loadedOutput);
    setChartType(loadedChart);
    setSelectedTags(loadedTags);
    setPreviewData(null);
    setInitialSnapshot({
      reportName: loadedName,
      reportDescription: loadedDescription,
      selectedFields: loadedFields,
      reportFilters: loadedFilters,
      outputType: loadedOutput,
      chartType: loadedChart,
      selectedTags: loadedTags,
    });
  }, [editingReport]);

  // ----- Dirty tracking -----
  // In edit mode, compare against the loaded report's snapshot.
  // In create mode, compare against an empty form so that any user-entered
  // name/description/field/filter/tag/output choice marks the form dirty.
  const hasUnsavedChanges = useMemo(() => {
    const current: ReportFormSnapshot = {
      reportName,
      reportDescription,
      selectedFields,
      reportFilters,
      outputType,
      chartType,
      selectedTags,
    };
    const baseline = isEditMode ? initialSnapshot : EMPTY_FORM_SNAPSHOT;
    return !snapshotsEqual(current, baseline);
  }, [
    isEditMode,
    reportName,
    reportDescription,
    selectedFields,
    reportFilters,
    outputType,
    chartType,
    selectedTags,
    initialSnapshot,
  ]);

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  // ----- Mutations -----
  const resetForm = () => {
    setReportName("");
    setReportDescription("");
    setSelectedFields([]);
    setReportFilters([]);
    setOutputType("table");
    setChartType("bar");
    setSelectedTags([]);
    setPreviewData(null);
    setIsEditMode(false);
    setEditingReportId(null);
    setInitialSnapshot(EMPTY_FORM_SNAPSHOT);
  };

  // Allow the parent to clear a half-built create-mode draft by bumping
  // `formResetSignal`. We skip the very first render so the form isn't
  // wiped on mount.
  const lastResetSignalRef = useRef<number | undefined>(formResetSignal);
  useEffect(() => {
    if (formResetSignal === undefined) return;
    if (lastResetSignalRef.current === formResetSignal) return;
    lastResetSignalRef.current = formResetSignal;
    resetForm();
  }, [formResetSignal]);

  const performCancelEdit = () => {
    resetForm();
    onCancelEdit?.();
    toast({ title: "Edit cancelled" });
  };

  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      setConfirmDiscardOpen(true);
      return;
    }
    performCancelEdit();
  };

  const buildReportPayload = () => ({
    name: reportName,
    description: reportDescription,
    reportType: outputType === "table+chart" ? "chart" : outputType,
    chartType: outputType !== "table" ? chartType : null,
    dataSource: "projects",
    selectedFields,
    filters: reportFilters,
    tags: selectedTags,
    createdBy: currentUser?.id || "unknown",
    isShared: false,
  });

  const createReportMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/custom-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to save report");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report created successfully",
        description: `${reportName} has been saved.`,
      });
      const savedName = reportName;
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/custom-reports"] });
      onReportSaved?.();
      // Toast already used savedName above; this assignment is just to silence lint
      void savedName;
    },
    onError: () => {
      showErrorToast("Failed to create report");
    },
  });

  const updateReportMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch(`/api/custom-reports/${editingReportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error("Failed to update report");
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Report updated successfully",
        description: `${reportName} has been updated.`,
      });
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["/api/custom-reports"] });
      onReportSaved?.();
    },
    onError: () => {
      showErrorToast("Failed to update report");
    },
  });

  const previewReportMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await fetch("/api/custom-reports/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Preview response error:", errorText);
        throw new Error("Failed to preview report");
      }
      return response.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      handleTabChange("preview");
      toast({ title: "Preview generated successfully" });
    },
    onError: (error) => {
      console.error("Preview report error:", error);
      showErrorToast("Failed to generate preview");
    },
  });

  // ----- Handlers -----
  const addFilter = () => {
    setReportFilters([
      ...reportFilters,
      { field: "", operator: "equals", value: "" },
    ]);
  };

  const updateFilter = (index: number, updates: Partial<ReportFilter>) => {
    setReportFilters(
      reportFilters.map((filter, i) => {
        if (i !== index) return filter;
        const merged: ReportFilter = { ...filter, ...updates };
        // When the field changes, reset the operator to one the new field's
        // type actually supports so the row never starts in an invalid
        // server-rejected state (e.g. `contains` on a number field).
        if (updates.field !== undefined && updates.field !== filter.field) {
          const newType = allFields.find((f) => f.field === updates.field)?.type;
          if (!isOperatorCompatible(newType, merged.operator)) {
            merged.operator = defaultOperatorForType(newType);
          }
          // Clear the previous value: it almost certainly doesn't make sense
          // for the new field's type (e.g. a date string for a boolean field).
          merged.value = isListOperator(merged.operator) ? [] : "";
          return merged;
        }
        // When the operator changes between scalar (`equals`, `contains`,
        // ...) and list (`in` / `not_in`), normalise the value to the
        // shape the new value control expects. We carry the user's
        // existing chips/text across the boundary so a quick toggle
        // doesn't silently wipe what they typed.
        if (
          updates.operator !== undefined &&
          updates.operator !== filter.operator
        ) {
          merged.value = normaliseFilterValueForOperator(
            filter.value,
            merged.operator,
          );
        }
        return merged;
      }),
    );
  };

  const removeFilter = (index: number) => {
    setReportFilters(reportFilters.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    if (!reportName.trim()) {
      showErrorToast("Please enter a report name");
      return;
    }
    if (selectedFields.length === 0) {
      showErrorToast("Please select at least one field");
      return;
    }

    const payload = buildReportPayload();
    if (isEditMode && editingReportId) {
      updateReportMutation.mutate(payload);
    } else {
      createReportMutation.mutate(payload);
    }
  };

  const handlePreview = () => {
    if (selectedFields.length === 0) {
      showErrorToast("Please select at least one field");
      return;
    }
    previewReportMutation.mutate({
      selectedFields,
      filters: reportFilters,
      outputType,
      chartType,
    });
  };

  const handleExportPreview = () => {
    if (!previewData?.data) return;
    if (onExportPDF) {
      onExportPDF({
        name: reportName || "Preview Report",
        data: previewData.data,
        selectedFields,
        metadata: previewData.metadata,
      });
    } else {
      toast({ title: "PDF export functionality coming soon" });
    }
  };

  const errorFallback = (
    <Card>
      <CardContent className="p-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-red-600 mb-2">Report Builder Error</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Something went wrong with the report builder.
          </p>
          <Button onClick={() => window.location.reload()} variant="outline">
            Reset Report Builder
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const isSavingOrUpdating = isEditMode
    ? updateReportMutation.isPending
    : createReportMutation.isPending;

  const [lastUpdatedTick, setLastUpdatedTick] = useState(0);

  useEffect(() => {
    if (!isEditMode || !editingReport?.updatedAt) return;
    const intervalId = window.setInterval(() => {
      setLastUpdatedTick((tick) => tick + 1);
    }, 60_000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [isEditMode, editingReport?.updatedAt]);

  const lastUpdatedLabel = useMemo(() => {
    const raw = editingReport?.updatedAt;
    if (!raw) return null;
    const date = raw instanceof Date ? raw : new Date(raw);
    if (Number.isNaN(date.getTime())) return null;
    return `Last updated ${formatDistanceToNow(date, { addSuffix: true })}`;
  }, [editingReport?.updatedAt, lastUpdatedTick]);

  return (
    <ErrorBoundary fallback={errorFallback}>
      <div className="space-y-4">
        {showHeader && (
          <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
            <div
              className="dark:hidden absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(59,130,246,0.15) 60%, rgba(59,130,246,0.25) 100%)",
              }}
            />
            <div
              className="hidden dark:block absolute inset-0 pointer-events-none"
              style={{
                background:
                  "linear-gradient(to right, rgba(31,41,55,1) 0%, rgba(30,58,138,0.4) 70%, rgba(30,58,138,0.6) 100%)",
              }}
            />
            <div className="flex items-stretch h-24 relative z-10">
              <div className="flex-1 flex flex-col justify-center px-4">
                <CardHeader className="relative z-10">
                  <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                    <ChartColumnStacked data-title-icon className="h-6 w-6" />
                    Report Builder
                  </CardTitle>
                  <CardDescription>
                    Build custom reports with dynamic data and visualizations
                  </CardDescription>
                </CardHeader>
                <ChartColumnStacked
                  className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
                  style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                />
              </div>
              <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
                <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                <BarChart3 className="h-8 w-8 text-blue-100" />
              </div>
            </div>
          </Card>
        )}

        {isEditMode && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/40"
            role="status"
            aria-live="polite"
            data-testid="banner-editing-report"
          >
            <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200 min-w-0">
              <Pencil className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="min-w-0 flex flex-col">
                <span className="text-sm truncate">
                  Editing:{" "}
                  <span className="font-semibold" data-testid="text-editing-report-name">
                    {reportName.trim() || "(unnamed report)"}
                  </span>
                </span>
                {lastUpdatedLabel && (
                  <span
                    className="text-xs text-amber-800/80 dark:text-amber-200/80 truncate"
                    data-testid="text-editing-report-last-updated"
                  >
                    {lastUpdatedLabel}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEdit}
              className="border-amber-400 text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/40"
              data-testid="button-cancel-edit"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel edit
            </Button>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-2">
          <SubNavPopover
            items={[
              { id: "general", label: "General", icon: Settings },
              { id: "fields", label: "Fields", icon: Database },
              { id: "filters", label: "Filters", icon: Filter },
              { id: "preview", label: "Preview", icon: Eye },
            ]}
            activeId={activeTab}
            title="Report Builder Navigation"
            onSelect={handleTabChange}
          />

          {/* GENERAL TAB */}
          <TabsContent value="general" className="mt-0 space-y-4">
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="reportName">Report Name</Label>
                    <Input
                      id="reportName"
                      type="text"
                      value={reportName}
                      onChange={(e) => setReportName(e.target.value)}
                      placeholder="Enter report name"
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="reportDescription">Description (Optional)</Label>
                    <Input
                      id="reportDescription"
                      type="text"
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="Enter report description (optional)"
                      autoComplete="off"
                    />
                  </div>
                </div>

                {/* Tags */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Tag data-title-icon className="h-5 w-5" />
                    Tags
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Select tags</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="w-full justify-between"
                          >
                            Select Tags
                            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <div className="max-h-64 overflow-y-auto">
                            <div className="p-2 space-y-1">
                              {availableTags?.map((tag: any) => (
                                <div
                                  key={tag.id}
                                  className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
                                  onClick={() => {
                                    if (selectedTags.includes(tag.name)) {
                                      setSelectedTags(
                                        selectedTags.filter((t) => t !== tag.name),
                                      );
                                    } else {
                                      setSelectedTags([...selectedTags, tag.name]);
                                    }
                                  }}
                                >
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: tag.color }}
                                  ></div>
                                  <span className="text-sm">{tag.name}</span>
                                  {selectedTags.includes(tag.name) && (
                                    <span className="ml-auto text-xs">✓</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {selectedTags.length > 0 && (
                      <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <Label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                          Selected tags:
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedTags.map((tagName, index) => {
                            const getTagColor = (name: string) => {
                              const dbTag = availableTags?.find(
                                (tag: any) => tag.name === name,
                              );
                              return dbTag?.color || "#6B7280";
                            };
                            return (
                              <div
                                key={index}
                                className="px-3 py-1 rounded-full text-sm text-white flex items-center gap-1"
                                style={{ backgroundColor: getTagColor(tagName) }}
                              >
                                {tagName}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedTags(
                                      selectedTags.filter((t) => t !== tagName),
                                    )
                                  }
                                  className="ml-1 hover:bg-black/20 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Output Configuration */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-medium mb-4">Output Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="outputType">Output Type</Label>
                      <Select
                        value={outputType}
                        onValueChange={(value) => setOutputType(value as OutputType)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="table">Table Only</SelectItem>
                          <SelectItem value="table+chart">Table + Chart</SelectItem>
                          <SelectItem value="dashboard">Dashboard View</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {(outputType === "table+chart" || outputType === "dashboard") && (
                      <div>
                        <Label htmlFor="chartType">Chart Type</Label>
                        <Select
                          value={chartType}
                          onValueChange={(value) => setChartType(value as ChartType)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bar">Bar Chart</SelectItem>
                            <SelectItem value="line">Line Chart</SelectItem>
                            <SelectItem value="pie">Pie Chart</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Preview Display for General Tab */}
                {previewData &&
                  previewData.data &&
                  Array.isArray(previewData.data) &&
                  previewData.data.length > 0 && (
                    <div className="mt-6 border rounded-lg bg-gray-50 dark:bg-gray-800">
                      <div className="p-6 border-b bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-medium flex items-center gap-2">
                            <Eye data-title-icon className="h-5 w-5" />
                            Report Preview - {previewData.data.length} Records
                          </h4>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={handleExportPreview}>
                              <Download className="h-4 w-4 mr-2" />
                              Export PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPreviewData(null)}
                            >
                              <X className="h-4 w-4 mr-2" />
                              Clear Preview
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 pt-0">
                        <div className="max-h-64 overflow-auto border border-gray-200 dark:border-gray-700 rounded">
                          <table className="w-full table-auto border-collapse border border-gray-300 dark:border-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-800">
                              <tr>
                                {Object.keys(previewData.data[0] || {}).map((field, index) => (
                                  <th
                                    key={index}
                                    className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300"
                                  >
                                    {formatFieldName(field)}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {previewData.data.slice(0, 5).map((row: any, rowIndex: number) => (
                                <tr
                                  key={rowIndex}
                                  className={rowIndex % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"}
                                >
                                  {Object.keys(row).map((field, cellIndex) => (
                                    <td
                                      key={cellIndex}
                                      className="border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-900 dark:text-gray-100"
                                    >
                                      {String(row[field] || "")}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {previewData.data.length > 5 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                              Showing first 5 of {previewData.data.length} records
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* FIELDS TAB */}
          <TabsContent value="fields" className="mt-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <TableIcon data-title-icon className="h-5 w-5" />
                  Select Fields
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Choose fields for your report organized by source table
                </p>
              </CardHeader>
              <CardContent
                className="p-4 space-y-4 overflow-y-auto"
                style={{
                  height: "calc(75vh - 150px)",
                  minHeight: "400px",
                  maxHeight: "600px",
                }}
              >
                {/* Selected Fields at Top */}
                {selectedFields.length > 0 && (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h5 className="font-medium text-blue-900 dark:text-blue-100">
                          Selected Fields ({selectedFields.length}):
                        </h5>
                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                          Order Below Will Be Order of Columns in Table
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setSelectedFields([])}>
                        <BrushCleaning className="h-4 w-4 mr-2" />
                        Clear All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedFields.map((field, index) => {
                        const fieldInfo = allFields.find((f) => f?.field === field);
                        const displayName = fieldInfo?.label || field;
                        return (
                          <div
                            key={index}
                            className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm flex items-center gap-3 cursor-move"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", index.toString());
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const draggedIndex = parseInt(
                                e.dataTransfer.getData("text/plain"),
                              );
                              const newFields = [...selectedFields];
                              const draggedField = newFields[draggedIndex];
                              newFields.splice(draggedIndex, 1);
                              newFields.splice(index, 0, draggedField);
                              setSelectedFields(newFields);
                            }}
                          >
                            <span className="text-gray-400 text-xs">⋮⋮</span>
                            <span>{displayName}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedFields(selectedFields.filter((f) => f !== field))
                              }
                              className="hover:bg-blue-200 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Search input filters groups and field rows by name */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                  <Input
                    type="search"
                    value={fieldSearchQuery}
                    onChange={(e) => setFieldSearchQuery(e.target.value)}
                    placeholder="Search fields or tables..."
                    className="pl-9"
                    data-testid="input-field-search"
                  />
                </div>

                <div className="space-y-4">
                  {filteredFieldsBySource.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400 border border-dashed rounded-lg dark:border-gray-700">
                      No fields match "{fieldSearchQuery}".
                    </div>
                  ) : filteredFieldsBySource.map(({ source, fields }) => {
                    const isExpanded = expandedFieldCategories.has(source);
                    const groupState = getGroupSelectionState(fields);
                    const accent = groupAccent(source);
                    return (
                      <div
                        key={source}
                        className={cn(
                          "border rounded-lg",
                          accent.container,
                          accent.border,
                        )}
                      >
                        <div
                          className={cn(
                            "w-full flex items-center gap-2 p-3 rounded-t-lg transition-colors",
                            accent.headerHover,
                          )}
                        >
                          <Checkbox
                            checked={groupState}
                            onCheckedChange={() => toggleGroupSelection(fields)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select all ${source} fields`}
                            data-testid={`checkbox-group-${source}`}
                            className="border-gray-400 dark:border-gray-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const newSet = new Set(expandedFieldCategories);
                              if (newSet.has(source)) {
                                newSet.delete(source);
                              } else {
                                newSet.add(source);
                              }
                              hasUserExpansionPrefRef.current = true;
                              setExpandedFieldCategories(newSet);
                            }}
                            className="flex-1 flex items-center justify-between"
                          >
                            <h4
                              className={cn(
                                "font-medium flex items-center gap-2 flex-wrap",
                                accent.headerText,
                              )}
                            >
                              <Database className="h-4 w-4" />
                              {source}
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {fields.length}
                              </Badge>
                              {metadataBySource.get(source)?.oneToMany && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase tracking-wide border-current opacity-80"
                                  title="Picking a field from this source returns one row per child — parent project columns repeat."
                                >
                                  one row per {source.toLowerCase().replace(/s$/, "")}
                                </Badge>
                              )}
                            </h4>
                            <ChevronDown
                              className={cn(
                                "h-5 w-5 transition-transform duration-200",
                                accent.chevron,
                                isExpanded ? "rotate-0" : "-rotate-90",
                              )}
                            />
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-3 pt-0">
                            {fields.map((field: ReportField) => (
                              <div
                                key={field.field}
                                className="flex items-start space-x-2 p-2 bg-white dark:bg-gray-900/40 rounded border border-gray-200 dark:border-gray-700"
                                data-testid={`field-row-${field.field}`}
                              >
                                <Checkbox
                                  id={`field-${field.field}`}
                                  checked={selectedFields.includes(field.field)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedFields([...selectedFields, field.field]);
                                    } else {
                                      setSelectedFields(
                                        selectedFields.filter((f) => f !== field.field),
                                      );
                                    }
                                  }}
                                  className="mt-0.5 border-gray-400 dark:border-gray-500"
                                />
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <label
                                    htmlFor={`field-${field.field}`}
                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2 flex-wrap"
                                  >
                                    <span>{field.label}</span>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {field.type}
                                    </Badge>
                                    {field.example ? (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            onClick={(e) => e.preventDefault()}
                                            className="text-blue-500/70 hover:text-blue-700 dark:text-blue-300/70 dark:hover:text-blue-200"
                                            aria-label={`Example value for ${field.label}`}
                                            data-testid={`example-trigger-${field.field}`}
                                          >
                                            <Info className="h-3.5 w-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="top"
                                          className="max-w-xs"
                                          data-testid={`example-tooltip-${field.field}`}
                                        >
                                          <div className="space-y-1">
                                            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                              Example value
                                            </div>
                                            <div className="text-xs break-words whitespace-pre-wrap">
                                              {field.example}
                                            </div>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    ) : null}
                                  </label>
                                  {field.description ? (
                                    <p
                                      className="text-xs text-gray-600 dark:text-gray-300 leading-snug"
                                      data-testid={`field-description-${field.field}`}
                                    >
                                      {field.description}
                                    </p>
                                  ) : null}
                                  {field.example ? (
                                    <p
                                      className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug truncate"
                                      title={field.example}
                                      data-testid={`field-example-${field.field}`}
                                    >
                                      <span className="font-medium text-gray-600 dark:text-gray-300">
                                        e.g.
                                      </span>{" "}
                                      {field.example}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FILTERS TAB */}
          <TabsContent value="filters" className="mt-0 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl">
                  <Filter data-title-icon className="h-5 w-5" />
                  Filters
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Add conditions to filter your data
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Example Filters */}
                <div className="p-4 bg-gray-50 dark:bg-slate-800/60 rounded-lg border border-gray-200 dark:border-slate-700">
                  <h4 className="font-medium mb-1 text-gray-900 dark:text-gray-100">
                    Common Filter Examples
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Click to add these commonly used filters to your report:
                  </p>
                  {(() => {
                    // Group examples by source so each group renders in
                    // its own accent color (matching the Fields tab) and
                    // reads as a coherent set of presets per data source.
                    const groups = (sourceMetadata ?? []).filter(
                      (meta) => meta.filterExamples.length > 0,
                    );
                    if (groups.length === 0) {
                      return (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                          No example filters configured yet.
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {groups.map((meta) => {
                          const accent = groupAccent(meta.source);
                          return (
                            <div key={meta.tableKey} className="space-y-1.5">
                              <div
                                className={cn(
                                  "text-[11px] font-semibold uppercase tracking-wide",
                                  accent.headerText,
                                )}
                              >
                                {meta.source}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                {meta.filterExamples.map((example, index) => (
                                  <Button
                                    key={`${meta.tableKey}-${index}`}
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "text-left justify-start h-auto py-2 text-xs gap-1.5 bg-white dark:bg-slate-900",
                                      accent.border,
                                      accent.headerText,
                                      accent.headerHover,
                                    )}
                                    onClick={() => {
                                      setReportFilters([
                                        ...reportFilters,
                                        {
                                          field: example.field,
                                          operator: example.operator,
                                          value: resolveExampleValue(example),
                                        },
                                      ]);
                                    }}
                                    data-testid={`button-filter-example-${meta.tableKey}-${index}`}
                                  >
                                    <Plus className="h-3 w-3 flex-shrink-0" />
                                    <span className="truncate">{example.label}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Custom Filters */}
                <div>
                  <h4 className="font-medium mb-3">Custom Filters</h4>
                  {reportFilters.map((filter, index) => {
                    const fieldInfo = allFields.find((f) => f.field === filter.field);
                    const fieldType = fieldInfo?.type;
                    const incompatibilityMessage = describeIncompatibility(
                      fieldType,
                      filter.operator,
                    );
                    const valueInputKind = getValueInputKind(fieldType, filter.operator);
                    // Scalar inputs (text/number/date/boolean) only know
                    // how to render strings; if a row is briefly carrying
                    // an array (e.g. mid-toggle from `in` -> `equals`
                    // before `updateFilter` normalises) collapse it for
                    // display so React doesn't get an array as `value`.
                    const scalarValue = Array.isArray(filter.value)
                      ? filter.value.join(", ")
                      : filter.value;

                    let valueInput: React.ReactNode;
                    if (valueInputKind === "boolean") {
                      valueInput = (
                        <Select
                          value={scalarValue}
                          onValueChange={(value) => updateFilter(index, { value })}
                        >
                          <SelectTrigger
                            className="flex-1"
                            data-testid={`select-filter-value-${index}`}
                          >
                            <SelectValue placeholder="Select true/false" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">True</SelectItem>
                            <SelectItem value="false">False</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    } else if (valueInputKind === "date") {
                      valueInput = (
                        <div className="flex-1">
                          <DatePickerInput
                            value={scalarValue}
                            onChange={(value) => updateFilter(index, { value })}
                            placeholder="Pick a date"
                          />
                        </div>
                      );
                    } else if (valueInputKind === "number") {
                      valueInput = (
                        <Input
                          type="number"
                          value={scalarValue}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder="Enter a number"
                          className="flex-1"
                          data-testid={`input-filter-value-${index}`}
                        />
                      );
                    } else if (valueInputKind === "list") {
                      valueInput = (
                        <FilterChipsInput
                          value={filter.value}
                          onChange={(value) => updateFilter(index, { value })}
                          fieldType={fieldType}
                          testIdPrefix={`input-filter-value-${index}`}
                        />
                      );
                    } else {
                      valueInput = (
                        <Input
                          value={scalarValue}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder="Filter value"
                          className="flex-1"
                          data-testid={`input-filter-value-${index}`}
                        />
                      );
                    }

                    return (
                      <div
                        key={index}
                        className="flex flex-col gap-2 p-4 border dark:border-gray-700 rounded-lg mb-3 bg-white dark:bg-gray-900/40"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,200px)_minmax(0,160px)_minmax(0,1fr)_auto] gap-3 items-center">
                          <Select
                            value={filter.field}
                            onValueChange={(value) => updateFilter(index, { field: value })}
                          >
                            <SelectTrigger
                              className="w-full"
                              data-testid={`select-filter-field-${index}`}
                            >
                              <SelectValue placeholder="Select field" />
                            </SelectTrigger>
                            <SelectContent>
                              {allFields.map((field) => (
                                <SelectItem key={field.field} value={field.field}>
                                  {field.label} ({field.type})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={filter.operator}
                            onValueChange={(value) => updateFilter(index, { operator: value })}
                          >
                            <SelectTrigger
                              className={cn(
                                "w-full",
                                incompatibilityMessage &&
                                  "border-amber-500 text-amber-700 dark:text-amber-400",
                              )}
                              data-testid={`select-filter-operator-${index}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {REPORT_FILTER_OPERATORS.map((op) => {
                                const compatible = isOperatorCompatible(fieldType, op);
                                return (
                                  <SelectItem
                                    key={op}
                                    value={op}
                                    disabled={!compatible && op !== filter.operator}
                                  >
                                    {REPORT_FILTER_OPERATOR_LABELS[op]}
                                    {!compatible ? " (n/a)" : ""}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>

                          {valueInput}

                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => removeFilter(index)}
                            data-testid={`button-remove-filter-${index}`}
                            aria-label="Remove filter"
                          >
                            <Trash2 className="h-4 w-4 p-0 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20" />
                          </Button>
                        </div>

                        {incompatibilityMessage && (
                          <div
                            className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
                            data-testid={`text-filter-warning-${index}`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <span>{incompatibilityMessage} Pick a different operator or field.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <Button
                    onClick={addFilter}
                    variant="outline"
                    className="w-full border-dashed border-2 hover:border-solid text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Custom Filter
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* PREVIEW TAB */}
          <TabsContent value="preview" className="mt-0 space-y-4">
            <Card>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="flex items-center gap-2">
                    <Eye data-title-icon className="h-5 w-5" />
                    <h2 className="text-2xl font-bold">Report Preview</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Report Configuration:</h3>
                      <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                        <p>
                          <strong>Name:</strong> {reportName || "Untitled Report"}
                        </p>
                        <p>
                          <strong>Fields:</strong> {selectedFields.length} selected
                        </p>
                        <p>
                          <strong>Filters:</strong> {reportFilters.length} active
                        </p>
                        <p>
                          <strong>Output:</strong> {outputType}
                        </p>
                        {outputType !== "table" && (
                          <p>
                            <strong>Chart:</strong> {chartType}
                          </p>
                        )}
                      </div>
                      {reportFilters.length > 0 && (
                        <div className="mt-3">
                          <FilterSummaryList
                            filters={reportFilters}
                            fields={allFields}
                            readOnly
                            testIdPrefix="preview-filter-summary"
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSave}
                        disabled={!isSaveEnabled || isSavingOrUpdating}
                      >
                        <Save className="h-4 w-4 mr-2 text-white" />
                        {isEditMode
                          ? updateReportMutation.isPending
                            ? "Updating..."
                            : "Update Report"
                          : createReportMutation.isPending
                            ? "Saving..."
                            : "Save Report"}
                      </Button>

                      <Button
                        onClick={handlePreview}
                        disabled={
                          previewReportMutation.isPending || selectedFields.length === 0
                        }
                      >
                        <Play className="h-4 w-4 mr-2 text-white" />
                        {previewReportMutation.isPending ? "Loading..." : "Preview Report"}
                      </Button>
                    </div>

                    {(!previewData || !previewData.data) && (
                      <div className="mt-6 p-6 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
                        <Eye className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                          No Preview Available
                        </h3>
                        <p className="text-gray-500 dark:text-gray-400 mb-4">
                          Click "Preview Report" above to generate a preview of your report.
                        </p>
                      </div>
                    )}

                    {previewData && previewData.data && (
                      <div className="mt-6 p-6 border dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-lg font-medium flex items-center gap-2">
                            <Eye data-title-icon className="h-5 w-5" />
                            Report Preview -{" "}
                            {Array.isArray(previewData.data) ? previewData.data.length : 0}{" "}
                            Records
                          </h4>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleExportPreview}>
                              <Download className="h-4 w-4 mr-2 text-white" />
                              Export PDF
                            </Button>
                            <Button size="sm" onClick={() => setPreviewData(null)}>
                              <BrushCleaning className="h-4 w-4 mr-2 text-white" />
                              Clear Preview
                            </Button>
                          </div>
                        </div>
                        {Array.isArray(previewData.data) && previewData.data.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                              <thead className="bg-gray-100 dark:bg-gray-900">
                                <tr>
                                  {selectedFields.map((field) => (
                                    <th
                                      key={field}
                                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                    >
                                      {field}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {previewData.data
                                  .slice(0, 10)
                                  .map((row: any, index: number) => (
                                    <tr key={index}>
                                      {selectedFields.map((field, cellIndex) => (
                                        <td
                                          key={cellIndex}
                                          className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                                        >
                                          {String(row[field] || row.projects?.[field] || "")}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                            {previewData.data.length > 10 && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                Showing 10 of {previewData.data.length} results
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                            <p>No data found matching your current filters</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Sticky action bar — always visible while form is on screen */}
        <div
          className="sticky bottom-0 z-20 -mx-1 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-4px_8px_-4px_rgba(0,0,0,0.08)] backdrop-blur dark:border-gray-700 dark:bg-gray-900/95"
          data-testid="bar-report-builder-actions"
        >
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 min-w-0">
            {isEditMode ? (
              <>
                <Pencil className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="truncate">
                  Editing:{" "}
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {reportName.trim() || "(unnamed report)"}
                  </span>
                </span>
              </>
            ) : (
              <span>Creating new report</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelEdit}
                data-testid="button-cancel-edit-sticky"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel edit
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!isSaveEnabled || isSavingOrUpdating}
              data-testid="button-save-sticky"
            >
              <Save className="h-4 w-4 mr-2 text-white" />
              {isEditMode
                ? updateReportMutation.isPending
                  ? "Updating..."
                  : "Update Report"
                : createReportMutation.isPending
                  ? "Saving..."
                  : "Save Report"}
            </Button>
          </div>
        </div>

        <ConfirmationDialog
          open={confirmDiscardOpen}
          onOpenChange={setConfirmDiscardOpen}
          title="Discard unsaved changes?"
          description="You have unsaved changes to this report. Cancelling will discard them."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={performCancelEdit}
          variant="warning"
        />
      </div>
    </ErrorBoundary>
  );
}
