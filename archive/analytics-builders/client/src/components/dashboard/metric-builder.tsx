import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Save,
    Play,
    Plus,
    Trash2,
    Filter,
    Calculator,
    BarChart3,
    LineChart,
    Target,
    Database,
    ArrowRight,
    Info,
    LibraryBig,
    Hash,
    PieChart,
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    ClipboardPenLine,
    Trophy,
    Brain,
    Mail,
    Zap,
    Activity,
    Folder,
    LucideIcon,
    Percent,
} from "lucide-react";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { calculateSingleMetric } from "@/hooks/useMetricEngine";
import { PocWithRelations, DashboardMetric } from "@shared/schema";
import { useTranslation } from "react-i18next";

// --- HELPERS ---

// 1. Descriptions for Output Types
const METRIC_TYPE_INFO = {
    scalar: {
        label: "Scalar (Single Number)",
        desc: "Returns a single numeric value (e.g., 42, $1.5M).",
        compatible: "KPI Cards, Radial Gauges, Big Number displays.",
    },
    series: {
        label: "Series (Trend Line)",
        desc: "Returns data points over time (e.g., Daily Active Users).",
        compatible: "Line Charts, Area Charts, Sparklines.",
    },
    distribution: {
        label: "Distribution (Categories)",
        desc: "Returns data grouped by category (e.g., Projects by Status).",
        compatible: "Pie Charts, Donut Charts, Bar Charts, Radar Charts.",
    },
    complex: {
        label: "Complex (Multi-dim)",
        desc: "Returns advanced structures for specific widgets.",
        compatible: "Custom Widgets (Fiscal Trends, Project Health).",
    },
};

// 2. Metric Type Styling (icon, colors)
const getMetricTypeStyles = (type: string) => {
    switch (type) {
        case "scalar":
            return {
                icon: Hash,
                label: "Scalar",
                iconColor: "text-blue-500",
                badgeBg: "bg-blue-500",
                badgeText: "text-white",
                divBg: "bg-blue-50 dark:bg-blue-950/30",
                borderColor: "border-blue-300 dark:border-blue-700",
            };
        case "series":
            return {
                icon: LineChart,
                label: "Series",
                iconColor: "text-green-500",
                badgeBg: "bg-green-500",
                badgeText: "text-white",
                divBg: "bg-green-50 dark:bg-green-950/30",
                borderColor: "border-green-300 dark:border-green-700",
            };
        case "distribution":
            return {
                icon: PieChart,
                label: "Distribution",
                iconColor: "text-purple-500",
                badgeBg: "bg-purple-500",
                badgeText: "text-white",
                divBg: "bg-purple-50 dark:bg-purple-950/30",
                borderColor: "border-purple-300 dark:border-purple-700",
            };
        case "complex":
            return {
                icon: BarChart3,
                label: "Complex",
                iconColor: "text-amber-500",
                badgeBg: "bg-amber-500",
                badgeText: "text-white",
                divBg: "bg-amber-50 dark:bg-amber-950/30",
                borderColor: "border-amber-300 dark:border-amber-700",
            };
        default:
            return {
                icon: Hash,
                label: type.charAt(0).toUpperCase() + type.slice(1),
                iconColor: "text-gray-500",
                badgeBg: "bg-gray-500",
                badgeText: "text-white",
                divBg: "bg-gray-50 dark:bg-gray-950/30",
                borderColor: "border-gray-300 dark:border-gray-700",
            };
    }
};

// 3. Category Styling Configuration (icons and colors matching app pages)
interface CategoryConfig {
    icon: LucideIcon;
    label: string;
    iconColor: string;
    bgColor: string;
    borderColor: string;
    badgeBg: string;
    metricBg: string;
    metricBorder: string;
}

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
    "General": {
        icon: Folder,
        label: "General",
        iconColor: "text-gray-500",
        bgColor: "bg-gray-50 dark:bg-gray-900/30",
        borderColor: "border-gray-200 dark:border-gray-700",
        badgeBg: "bg-gray-100 dark:bg-gray-800",
        metricBg: "bg-gray-50/70 dark:bg-gray-950/20",
        metricBorder: "border-gray-100 dark:border-gray-800",
    },
    "MAP Management": {
        icon: ClipboardPenLine,
        label: "MAP Management",
        iconColor: "text-purple-500",
        bgColor: "bg-purple-50 dark:bg-purple-900/30",
        borderColor: "border-purple-200 dark:border-purple-700",
        badgeBg: "bg-purple-100 dark:bg-purple-800",
        metricBg: "bg-purple-50/70 dark:bg-purple-950/20",
        metricBorder: "border-purple-100 dark:border-purple-800",
    },
    "Outcome Intelligence": {
        icon: Trophy,
        label: "Outcome Intelligence",
        iconColor: "text-orange-500",
        bgColor: "bg-orange-50 dark:bg-orange-900/30",
        borderColor: "border-orange-200 dark:border-orange-700",
        badgeBg: "bg-orange-100 dark:bg-orange-800",
        metricBg: "bg-orange-50/70 dark:bg-orange-950/20",
        metricBorder: "border-orange-100 dark:border-orange-800",
    },
    "AI Risk": {
        icon: Brain,
        label: "AI Assessments",
        iconColor: "text-red-500",
        bgColor: "bg-red-50 dark:bg-red-900/30",
        borderColor: "border-red-200 dark:border-red-700",
        badgeBg: "bg-red-100 dark:bg-red-800",
        metricBg: "bg-red-50/70 dark:bg-red-950/20",
        metricBorder: "border-red-100 dark:border-red-800",
    },
    "Email Communications": {
        icon: Mail,
        label: "Email Communications",
        iconColor: "text-blue-500",
        bgColor: "bg-blue-50 dark:bg-blue-900/30",
        borderColor: "border-blue-200 dark:border-blue-700",
        badgeBg: "bg-blue-100 dark:bg-blue-800",
        metricBg: "bg-blue-50/70 dark:bg-blue-950/20",
        metricBorder: "border-blue-100 dark:border-blue-800",
    },
    "Workflow Automation": {
        icon: Zap,
        label: "Workflow Automation",
        iconColor: "text-yellow-500",
        bgColor: "bg-yellow-50 dark:bg-yellow-900/30",
        borderColor: "border-yellow-200 dark:border-yellow-700",
        badgeBg: "bg-yellow-100 dark:bg-yellow-800",
        metricBg: "bg-yellow-50/70 dark:bg-yellow-950/20",
        metricBorder: "border-yellow-100 dark:border-yellow-800",
    },
    "Automation Diagnostics": {
        icon: Activity,
        label: "Automation Diagnostics",
        iconColor: "text-green-500",
        bgColor: "bg-green-50 dark:bg-green-900/30",
        borderColor: "border-green-200 dark:border-green-700",
        badgeBg: "bg-green-100 dark:bg-green-800",
        metricBg: "bg-green-50/70 dark:bg-green-950/20",
        metricBorder: "border-green-100 dark:border-green-800",
    },
};

const getCategoryConfig = (category: string): CategoryConfig => {
    return CATEGORY_CONFIG[category] || CATEGORY_CONFIG["General"];
};

// 4. Currency Cleaner (e.g. "$150,000" -> 150000)
const parseNumericValue = (val: string | number): number => {
    if (typeof val === "number") return val;
    if (!val) return 0;
    const clean = val.toString().replace(/[$,\s]/g, "");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
};

// --- TYPES ---
interface SchemaField {
    value: string;
    label: string;
    type: string;
}

interface SchemaTable {
    id: string;
    label: string;
    fields: SchemaField[];
}

interface FilterCondition {
    tableId?: string;
    field: string;
    operator: string;
    value: string;
}

interface MetricConfig {
    id?: number;
    name: string;
    description: string;
    type: "scalar" | "series" | "distribution" | "complex";
    category: string;
    logic: {
        source: string;
        filters: FilterCondition[];
        operation: "count" | "sum" | "avg" | "min" | "max" | "ratio" | "percentage";
        targetField?: string;
        groupByField?: string;
        dateField?: string;
        interval?: "day" | "week" | "month" | "quarter";
        denominatorType?: "all" | "custom";
        denominatorFilters?: FilterCondition[];
    };
}

const DEFAULT_METRIC: MetricConfig = {
    name: "",
    description: "",
    type: "scalar",
    category: "General",
    logic: {
        source: "projects",
        filters: [],
        operation: "count",
    },
};

export interface MetricBuilderProps {
    /**
     * Called whenever the builder's "dirty" state changes. `true` means the
     * current metric form differs from the last loaded/saved snapshot. Used
     * by parents (e.g. the Analytics page) to warn the user before they
     * navigate away from the builder with unsaved changes.
     */
    onDirtyChange?: (dirty: boolean) => void;
}

export default function MetricBuilder({ onDirtyChange }: MetricBuilderProps = {}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState("general");
    const [metric, setMetric] = useState<MetricConfig>(DEFAULT_METRIC);
    // Snapshot of the last loaded/saved metric (serialized for cheap equality).
    // The form is considered dirty when the current metric no longer matches
    // this snapshot.
    const [initialMetricJson, setInitialMetricJson] = useState<string>(() =>
        JSON.stringify(DEFAULT_METRIC),
    );
    const isDirty = useMemo(
        () => JSON.stringify(metric) !== initialMetricJson,
        [metric, initialMetricJson],
    );
    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);
    const [previewResult, setPreviewResult] = useState<any>(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [useRawMode, setUseRawMode] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
        "General": false,
        "MAP Management": false,
        "Outcome Intelligence": false,
        "AI Risk": false,
        "Email Communications": false,
        "Workflow Automation": false,
        "Automation Diagnostics": false,
    });

    const toggleCategory = (category: string) => {
        setExpandedCategories(prev => ({
            ...prev,
            [category]: !prev[category],
        }));
    };

    // --- QUERIES ---
    const { data: schema = [] } = useQuery<SchemaTable[]>({
        queryKey: ["/api/schema-context", useRawMode],
        queryFn: async () => {
            const res = await fetch(
                `/api/schema-context?mode=${useRawMode ? "raw" : "curated"}`,
            );
            if (!res.ok) throw new Error("Failed to fetch schema");
            return res.json();
        },
    });

    const { data: projects = [] } = useQuery<PocWithRelations[]>({
        queryKey: ["/api/projects", {}],
    });

    const { data: savedMetrics } = useQuery<DashboardMetric[]>({
        queryKey: ["/api/dashboard-metrics"],
    });

    // --- MUTATIONS ---

    // Save / Update (Handles PUT vs POST)
    const saveMutation = useMutation({
        mutationFn: async (data: MetricConfig) => {
            const isUpdate = !!data.id;
            const url = isUpdate
                ? `/api/dashboard-metrics/${data.id}`
                : "/api/dashboard-metrics";
            const method = isUpdate ? "PUT" : "POST";

            const res = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.message || "Failed to save metric");
            }
            return res.json();
        },
        onSuccess: (savedData) => {
            const next = { ...metric, id: savedData.id };
            setMetric(next);
            // The form now matches what was just persisted - reset the
            // baseline so the dirty indicator clears.
            setInitialMetricJson(JSON.stringify(next));
            showSuccessToast(t("common.success"), metric.id ? t("dashboard.metricBuilder.metricUpdated") : t("dashboard.metricBuilder.metricCreated"));
            queryClient.invalidateQueries({
                queryKey: ["/api/dashboard-metrics"],
            });
        },
        onError: (err) => {
            showErrorToast(t("dashboard.metricBuilder.errorSaving"), err.message);
        },
    });

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/dashboard-metrics/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete metric");
        },
        onSuccess: () => {
            showSuccessToast(t("dashboard.metricBuilder.deleted"), t("dashboard.metricBuilder.deletedDescription"));
            queryClient.invalidateQueries({
                queryKey: ["/api/dashboard-metrics"],
            });
            // If we deleted the active one, reset to default
            if (metric.id) {
                const fresh = JSON.parse(JSON.stringify(DEFAULT_METRIC));
                setMetric(fresh);
                setInitialMetricJson(JSON.stringify(fresh));
            }
        },
        onError: (err) => {
            showErrorToast(t("dashboard.metricBuilder.deleteFailed"), err.message);
        },
    });

    // --- HANDLERS ---
    const getFieldsForTable = (tableId: string | undefined) => {
        if (!tableId) return [];
        return schema.find((t) => t.id === tableId)?.fields || [];
    };

    const handleNewMetric = () => {
        const fresh = JSON.parse(JSON.stringify(DEFAULT_METRIC));
        setMetric(fresh);
        setInitialMetricJson(JSON.stringify(fresh));
        setActiveTab("general");
        setPreviewResult(null);
        showInfoToast(t("dashboard.metricBuilder.newMetricCreated"), t("dashboard.metricBuilder.newMetricDescription"));
    };

    const updateMetric = (updates: Partial<MetricConfig>) => {
        setMetric((prev) => ({ ...prev, ...updates }));
    };

    const updateLogic = (updates: Partial<MetricConfig["logic"]>) => {
        setMetric((prev) => ({
            ...prev,
            logic: { ...prev.logic, ...updates },
        }));
    };

    const addFilter = () => {
        const currentFilters = metric.logic?.filters || [];
        const defaultTable = schema.length > 0 ? schema[0].id : "";
        updateLogic({
            filters: [
                ...currentFilters,
                {
                    tableId: defaultTable,
                    field: "",
                    operator: "equals",
                    value: "",
                },
            ],
        });
    };

    const updateFilter = (index: number, updates: Partial<FilterCondition>) => {
        const newFilters = [...(metric.logic?.filters || [])];
        newFilters[index] = { ...newFilters[index], ...updates };
        if (updates.tableId) newFilters[index].field = "";
        updateLogic({ filters: newFilters });
    };

    const removeFilter = (index: number) => {
        updateLogic({
            filters: (metric.logic?.filters || []).filter(
                (_, i) => i !== index,
            ),
        });
    };

    const handleRunPreview = () => {
        if (!projects || projects.length === 0) {
            showErrorToast(t("dashboard.metricBuilder.noData"), t("dashboard.metricBuilder.noProjectsFound"));
            return;
        }
        setIsCalculating(true);
        setTimeout(() => {
            try {
                let scopedProjects = projects;
                if (
                    metric.logic?.filters &&
                    Array.isArray(metric.logic.filters)
                ) {
                    scopedProjects = projects.filter((p) => {
                        return metric.logic.filters.every((f) => {
                            if (!f.field || !f.value) return true;

                            // Safe Value Access
                            const rawVal = String(
                                p[f.field as keyof typeof p] || "",
                            );

                            // Clean values for Math comparison
                            const valNum = parseNumericValue(rawVal);
                            const checkNum = parseNumericValue(f.value);

                            const valStr = rawVal.toLowerCase();
                            const checkStr = String(f.value).toLowerCase();

                            if (f.operator === "equals")
                                return valStr === checkStr;
                            if (f.operator === "contains")
                                return valStr.includes(checkStr);
                            if (f.operator === "not")
                                return valStr !== checkStr;

                            // Math Comparisons
                            if (f.operator === "gt") return valNum > checkNum;
                            if (f.operator === "lt") return valNum < checkNum;

                            return true;
                        });
                    });
                }
                const result = calculateSingleMetric(
                    scopedProjects,
                    metric.logic,
                    projects, // Pass all projects for ratio/percentage denominator calculations
                );
                setPreviewResult(result);
                showSuccessToast(t("dashboard.metricBuilder.calculationComplete"), t("dashboard.metricBuilder.scopeMatched", { count: scopedProjects.length }));
            } catch (err) {
                console.error(err);
                showErrorToast(t("dashboard.metricBuilder.calcFailed"), t("dashboard.metricBuilder.checkConfig"));
            } finally {
                setIsCalculating(false);
            }
        }, 500);
    };

    return (
        <div className="space-y-4">

              {/* Header - "Floating Rail" with Global Gradient */}
              <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group">
                {/* 1. GLOBAL BACKGROUND GRADIENT */}
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

                {/* 2. FLEX CONTAINER (Z-Index ensures it sits ON TOP of gradient) */}
                <div className="flex items-stretch h-24 relative z-10">
                  {/* LEFT SIDE: Content */}
                  <div className="flex-1 flex flex-col justify-center px-4">
                    <CardHeader className="relative z-10">
                      <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                        <Calculator data-title-icon className="h-6 w-6" />
                          {t("dashboard.metricBuilder.title")}
                      </CardTitle>
                      <CardDescription>
                          {t("dashboard.metricBuilder.description")}
                      </CardDescription>
                    </CardHeader>

                    {/* Decorative Background Icon */}
                    <Calculator
                      className="absolute right-72 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
                      style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                    />
                  </div>
                    <div className="flex items-center justify-between gap-2">
                        <Button onClick={handleNewMetric}>
                            <Calculator className="mr-2 h-4 w-4" /> {t("dashboard.metricBuilder.newMetric")}
                        </Button>
                        <Button
                            onClick={() => saveMutation.mutate(metric)}
                            disabled={saveMutation.isPending}
                        >
                            <Save className="mr-2 h-4 w-4" />
                            {saveMutation.isPending
                                ? t("common.saving")
                                : metric.id
                                  ? t("dashboard.metricBuilder.updateMetric")
                                  : t("dashboard.metricBuilder.saveToLibrary")}
                        </Button>
                    </div>
                </div>
              </Card>
              {/* END Of Header */}
            <Card>
                <CardContent className="p-4">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LIBRARY SIDEBAR */}
                        <div className="lg:col-span-3">
                            <CardHeader className="px-0 pt-0 pb-3">
                                <CardTitle className="text-md font-bold flex items-center gap-2">
                                    <LibraryBig data-title-icon className="h-4 w-4" />
                                    {t("dashboard.metricBuilder.library")}
                                </CardTitle>
                            </CardHeader>
                                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                                    {(!savedMetrics ||
                                        savedMetrics.length === 0) && (
                                        <div className="text-xs text-gray-400 italic p-2">
                                            {t("dashboard.metricBuilder.noMetricsSaved")}
                                        </div>
                                    )}
                                    {savedMetrics && savedMetrics.length > 0 && (() => {
                                        // Group metrics by category
                                        const groupedMetrics = savedMetrics.reduce((acc, m) => {
                                            const cat = m.category || "General";
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(m);
                                            return acc;
                                        }, {} as Record<string, typeof savedMetrics>);

                                        // Define category order
                                        const categoryOrder = [
                                            "MAP Management",
                                            "Outcome Intelligence", 
                                            "AI Risk",
                                            "Email Communications",
                                            "Workflow Automation",
                                            "Automation Diagnostics",
                                            "General",
                                        ];

                                        return categoryOrder
                                            .filter(cat => groupedMetrics[cat] && groupedMetrics[cat].length > 0)
                                            .map(category => {
                                                const metrics = groupedMetrics[category];
                                                const catConfig = getCategoryConfig(category);
                                                const CatIcon = catConfig.icon;
                                                const isExpanded = expandedCategories[category] ?? true;

                                                return (
                                                    <div key={category} className="mb-2">
                                                        {/* Category Header */}
                                                        <button
                                                            onClick={() => toggleCategory(category)}
                                                            className={`w-full flex items-center justify-between p-2 rounded-lg border transition-colors ${catConfig.bgColor} ${catConfig.borderColor} hover:opacity-90`}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {isExpanded ? (
                                                                    <ChevronDown className={`h-4 w-4 ${catConfig.iconColor}`} />
                                                                ) : (
                                                                    <ChevronRight className={`h-4 w-4 ${catConfig.iconColor}`} />
                                                                )}
                                                                <CatIcon className={`h-4 w-4 ${catConfig.iconColor}`} />
                                                                <span className="text-sm font-semibold truncate">{category}</span>
                                                            </div>
                                                            <Badge className={`text-[10px] ${catConfig.badgeBg} border-0`}>
                                                                {metrics.length}
                                                            </Badge>
                                                        </button>

                                                        {/* Metrics List */}
                                                        {isExpanded && (
                                                            <div className="mt-1 ml-2 space-y-1">
                                                                {metrics.map((m) => {
                                                                    const typeStyles = getMetricTypeStyles(m.type);
                                                                    const TypeIcon = typeStyles.icon;
                                                                    return (
                                                                        <div
                                                                            key={m.id}
                                                                            className={`group relative p-2 border rounded-md cursor-pointer transition-colors ${catConfig.metricBg} ${catConfig.metricBorder} hover:opacity-90`}
                                                                            onClick={() => {
                                                                                const config = m.config as any;
                                                                                const sourceTable = config?.source || "projects";
                                                                                const filtersWithTableId = (config?.filters || []).map((f: any) => ({
                                                                                    ...f,
                                                                                    tableId: f.tableId || sourceTable,
                                                                                }));
                                                                                const loadedMetric: MetricConfig = {
                                                                                    id: m.id,
                                                                                    name: m.name,
                                                                                    description: m.description || "",
                                                                                    type: m.type as any,
                                                                                    category: m.category || "General",
                                                                                    logic: config ? {
                                                                                        ...config,
                                                                                        filters: filtersWithTableId,
                                                                                    } : DEFAULT_METRIC.logic,
                                                                                };
                                                                                setMetric(loadedMetric);
                                                                                setInitialMetricJson(JSON.stringify(loadedMetric));
                                                                                showInfoToast(t("dashboard.metricBuilder.loadedMetric"), t("dashboard.metricBuilder.loadedMetricDescription", { name: m.name }));
                                                                            }}
                                                                        >
                                                                            <div className="flex items-center justify-between pr-5">
                                                                                <span className="font-medium text-xs truncate flex-1">
                                                                                    {m.name}
                                                                                </span>
                                                                                <Badge
                                                                                    className={`text-[9px] flex items-center gap-0.5 ${typeStyles.badgeBg} ${typeStyles.badgeText} border-0 ml-1`}
                                                                                >
                                                                                    <TypeIcon className="h-2.5 w-2.5" />
                                                                                </Badge>
                                                                            </div>

                                                                            {/* DELETE BUTTON */}
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="icon"
                                                                                className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (confirm(t("dashboard.metricBuilder.confirmDelete")))
                                                                                        deleteMutation.mutate(m.id);
                                                                                }}
                                                                            >
                                                                                <Trash2 className="h-2.5 w-2.5" />
                                                                            </Button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            });
                                    })()}
                                </div>
                            </div>

                        {/* BUILDER TABS */}
                        <div className="lg:col-span-6 space-y-6">
                                <Tabs
                                    value={activeTab}
                                    onValueChange={setActiveTab}
                                    className="w-full"
                                >
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="general">
                                            {t("dashboard.metricBuilder.tab1")}
                                        </TabsTrigger>
                                        <TabsTrigger value="scope">
                                            {t("dashboard.metricBuilder.tab2")}
                                        </TabsTrigger>
                                        <TabsTrigger value="logic">
                                            {t("dashboard.metricBuilder.tab3")}
                                        </TabsTrigger>
                                    </TabsList>

                                    {/* TAB 1: GENERAL */}
                                    <TabsContent value="general">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-2xl">
                                                    <Calculator data-title-icon className="h-5 w-5" />
                                                    {t("dashboard.metricBuilder.metricIdentity")}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label>{t("dashboard.metricBuilder.metricName")}</Label>
                                                    <Input
                                                        value={metric.name}
                                                        onChange={(e) =>
                                                            updateMetric({
                                                                name: e.target
                                                                    .value,
                                                            })
                                                        }
                                                        placeholder={t("dashboard.metricBuilder.metricNamePlaceholder")}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>{t("dashboard.metricBuilder.descriptionLabel")}</Label>
                                                    <Input
                                                        value={
                                                            metric.description
                                                        }
                                                        onChange={(e) =>
                                                            updateMetric({
                                                                description:
                                                                    e.target
                                                                        .value,
                                                            })
                                                        }
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label>{t("dashboard.metricBuilder.category")}</Label>
                                                        <Select
                                                            value={
                                                                metric.category
                                                            }
                                                            onValueChange={(
                                                                val,
                                                            ) =>
                                                                updateMetric({
                                                                    category:
                                                                        val,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {Object.entries(CATEGORY_CONFIG).map(([catName, catConfig]) => {
                                                                    const CatIcon = catConfig.icon;
                                                                    return (
                                                                        <SelectItem key={catName} value={catName}>
                                                                            <div className="flex items-center gap-2">
                                                                                <CatIcon className={`h-4 w-4 ${catConfig.iconColor}`} />
                                                                                {catName}
                                                                            </div>
                                                                        </SelectItem>
                                                                    );
                                                                })}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    {/* OUTPUT TYPE */}
                                                    <div className="space-y-2">
                                                        <Label>
                                                            {t("dashboard.metricBuilder.outputType")}
                                                        </Label>
                                                        <Select
                                                            value={metric.type}
                                                            onValueChange={(
                                                                val,
                                                            ) =>
                                                                updateMetric({
                                                                    type: val as any,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger>
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="scalar">
                                                                    <div className="flex items-center gap-2">
                                                                        <Hash className="h-4 w-4 text-blue-500" />
                                                                        {t("dashboard.metricBuilder.typeScalar")}
                                                                    </div>
                                                                </SelectItem>
                                                                <SelectItem value="series">
                                                                    <div className="flex items-center gap-2">
                                                                        <LineChart className="h-4 w-4 text-green-500" />
                                                                        {t("dashboard.metricBuilder.typeSeries")}
                                                                    </div>
                                                                </SelectItem>
                                                                <SelectItem value="distribution">
                                                                    <div className="flex items-center gap-2">
                                                                        <PieChart className="h-4 w-4 text-purple-500" />
                                                                        {t("dashboard.metricBuilder.typeDistribution")}
                                                                    </div>
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* INFO BOX: Contextual Help */}
                                                <div className="mt-2 p-3 bg-blue-50/50 dark:bg-blue-950/80 rounded-lg border border-blue-100 dark:border-blue-800 flex gap-3 text-sm text-blue-900 dark:text-blue-200">
                                                    <Info className="h-5 w-5 text-blue-500 dark:text-blue-400 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="font-semibold mb-1">
                                                            {
                                                                METRIC_TYPE_INFO[
                                                                    metric.type
                                                                ]?.label
                                                            }
                                                        </p>
                                                        <p className="text-xs opacity-80 mb-2">
                                                            {
                                                                METRIC_TYPE_INFO[
                                                                    metric.type
                                                                ]?.desc
                                                            }
                                                        </p>
                                                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/50 px-2 py-1 rounded inline-block">
                                                            {t("dashboard.metricBuilder.worksWith")}{" "}
                                                            {
                                                                METRIC_TYPE_INFO[
                                                                    metric.type
                                                                ]?.compatible
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                        <div className="mt-4 flex justify-end">
                                            <Button
                                                onClick={() =>
                                                    setActiveTab("scope")
                                                }
                                            >
                                                {t("dashboard.metricBuilder.nextDefineScope")}{" "}
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    {/* TAB 2: SCOPE */}
                                    <TabsContent value="scope">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-2xl">
                                                    <Filter className="h-5 w-5 text-blue-600" />{" "}
                                                    {t("dashboard.metricBuilder.dataScope")}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                                {/* Metric Name Field - Synced */}
                                                <div className="space-y-2">
                                                    <Label>{t("dashboard.metricBuilder.metricName")}</Label>
                                                    <Input
                                                        value={metric.name}
                                                        onChange={(e) =>
                                                            updateMetric({
                                                                name: e.target.value,
                                                            })
                                                        }
                                                        placeholder={t("dashboard.metricBuilder.metricNamePlaceholder")}
                                                    />
                                                </div>
                                                {/* Source Table Summary */}
                                                <div className="p-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Database className="h-4 w-4 text-blue-600" />
                                                        <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">{t("dashboard.metricBuilder.sourceTable")}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                                        <div>
                                                            <span className="text-xs text-blue-600 dark:text-blue-400">{t("dashboard.metricBuilder.tableLabel")}</span>
                                                            <div className="font-medium text-blue-900 dark:text-blue-100">
                                                                {schema.find(t => t.id === metric.logic?.source)?.label || metric.logic?.source || t("common.notSet")}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-xs text-blue-600 dark:text-blue-400">{t("dashboard.metricBuilder.operationLabel")}</span>
                                                            <div className="font-medium text-blue-900 dark:text-blue-100">
                                                                {(metric.logic?.operation as string) === "count_distinct" 
                                                                    ? `Count Distinct (${metric.logic?.targetField || "id"})`
                                                                    : metric.logic?.operation?.charAt(0).toUpperCase() + (metric.logic?.operation?.slice(1) || "")}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between mb-4 bg-slate-100 dark:bg-slate-800/80 p-2 rounded-md">
                                                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                                        {useRawMode
                                                            ? t("dashboard.metricBuilder.rawMode")
                                                            : t("dashboard.metricBuilder.curatedMode")}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <Label
                                                            htmlFor="raw-mode"
                                                            className="text-xs"
                                                        >
                                                            {t("dashboard.metricBuilder.advancedFields")}
                                                        </Label>
                                                        <Switch
                                                            id="raw-mode"
                                                            checked={useRawMode}
                                                            onCheckedChange={
                                                                setUseRawMode
                                                            }
                                                        />
                                                    </div>
                                                </div>

                                                {/* Filter Conditions */}
                                                {metric.logic &&
                                                    metric.logic.filters &&
                                                    metric.logic.filters.map(
                                                        (filter, index) => (
                                                            <div
                                                                key={index}
                                                                className="flex flex-col gap-2 p-3 border rounded-lg bg-slate-50 dark:bg-slate-800/80 dark:border-slate-700"
                                                            >
                                                                <div className="flex gap-2 items-center">
                                                                    <Select
                                                                        value={
                                                                            filter.tableId ||
                                                                            (schema.length >
                                                                            0
                                                                                ? schema[0]
                                                                                      .id
                                                                                : "")
                                                                        }
                                                                        onValueChange={(
                                                                            val,
                                                                        ) =>
                                                                            updateFilter(
                                                                                index,
                                                                                {
                                                                                    tableId:
                                                                                        val,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800">
                                                                            <SelectValue placeholder={t("dashboard.metricBuilder.filterTable")} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {schema.map(
                                                                                (
                                                                                    t,
                                                                                ) => (
                                                                                    <SelectItem
                                                                                        key={
                                                                                            t.id
                                                                                        }
                                                                                        value={
                                                                                            t.id
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            t.label
                                                                                        }
                                                                                    </SelectItem>
                                                                                ),
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <Select
                                                                        value={
                                                                            filter.field
                                                                        }
                                                                        onValueChange={(
                                                                            val,
                                                                        ) =>
                                                                            updateFilter(
                                                                                index,
                                                                                {
                                                                                    field: val,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="flex-1 bg-white dark:bg-gray-800">
                                                                            <SelectValue placeholder={t("dashboard.metricBuilder.filterField")} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            {getFieldsForTable(
                                                                                filter.tableId ||
                                                                                    (schema.length >
                                                                                    0
                                                                                        ? schema[0]
                                                                                              .id
                                                                                        : ""),
                                                                            ).map(
                                                                                (
                                                                                    f,
                                                                                ) => (
                                                                                    <SelectItem
                                                                                        key={
                                                                                            f.value
                                                                                        }
                                                                                        value={
                                                                                            f.value
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            f.label
                                                                                        }
                                                                                    </SelectItem>
                                                                                ),
                                                                            )}
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        onClick={() =>
                                                                            removeFilter(
                                                                                index,
                                                                            )
                                                                        }
                                                                        className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </Button>
                                                                </div>
                                                                <div className="flex gap-2">
                                                                    <Select
                                                                        value={
                                                                            filter.operator
                                                                        }
                                                                        onValueChange={(
                                                                            val,
                                                                        ) =>
                                                                            updateFilter(
                                                                                index,
                                                                                {
                                                                                    operator:
                                                                                        val,
                                                                                },
                                                                            )
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="w-[140px] bg-white dark:bg-gray-800">
                                                                            <SelectValue placeholder={t("dashboard.metricBuilder.filterOperator")} />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="equals">
                                                                                {t("dashboard.metricBuilder.opEquals")}
                                                                            </SelectItem>
                                                                            <SelectItem value="contains">
                                                                                {t("dashboard.metricBuilder.opContains")}
                                                                            </SelectItem>
                                                                            <SelectItem value="gt">
                                                                                {t("dashboard.metricBuilder.opGreaterThan")}
                                                                            </SelectItem>
                                                                            <SelectItem value="lt">
                                                                                {t("dashboard.metricBuilder.opLessThan")}
                                                                            </SelectItem>
                                                                            <SelectItem value="not">
                                                                                {t("dashboard.metricBuilder.opNotEquals")}
                                                                            </SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                    <Input
                                                                        value={
                                                                            filter.value
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            updateFilter(
                                                                                index,
                                                                                {
                                                                                    value: e
                                                                                        .target
                                                                                        .value,
                                                                                },
                                                                            )
                                                                        }
                                                                        placeholder={t("dashboard.metricBuilder.filterValue")}
                                                                        className="flex-1 bg-white dark:bg-gray-800"
                                                                    />
                                                                </div>
                                                            </div>
                                                        ),
                                                    )}
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={addFilter}
                                                    className="w-full border-dashed"
                                                >
                                                    <Plus className="mr-2 h-4 w-4" />{" "}
                                                    {t("dashboard.metricBuilder.addScopeCondition")}
                                                </Button>
                                            </CardContent>
                                        </Card>
                                        <div className="mt-2 flex justify-between">
                                            <Button
                                                onClick={() =>
                                                    setActiveTab("general")
                                                }
                                            >
                                                <ArrowLeft className="h-4 w-4" />
                                                {t("common.back")}
                                            </Button>
                                            <Button
                                                onClick={() =>
                                                    setActiveTab("logic")
                                                }
                                            >
                                                {t("dashboard.metricBuilder.nextDefineLogic")}{" "}
                                                <ArrowRight className="ml-2 h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TabsContent>

                                    {/* TAB 3: LOGIC */}
                                    <TabsContent value="logic">
                                        <Card>
                                            <CardHeader>
                                                <CardTitle className="flex items-center gap-2 text-2xl">
                                                    <Target className="h-5 w-5 text-blue-600" />{" "}
                                                    {t("dashboard.metricBuilder.aggregationLogic")}
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-6">
                                                {/* Metric Name Field - Synced */}
                                                <div className="space-y-2">
                                                    <Label>{t("dashboard.metricBuilder.metricName")}</Label>
                                                    <Input
                                                        value={metric.name}
                                                        onChange={(e) =>
                                                            updateMetric({
                                                                name: e.target.value,
                                                            })
                                                        }
                                                        placeholder={t("dashboard.metricBuilder.metricNamePlaceholder")}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>{t("dashboard.metricBuilder.operation")}</Label>
                                                    <Select
                                                        value={
                                                            metric.logic
                                                                ?.operation ||
                                                            "count"
                                                        }
                                                        onValueChange={(val) =>
                                                            updateLogic({
                                                                operation:
                                                                    val as any,
                                                            })
                                                        }
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="count">
                                                                {t("dashboard.metricBuilder.opCount")}
                                                            </SelectItem>
                                                            <SelectItem value="sum">
                                                                {t("dashboard.metricBuilder.opSum")}
                                                            </SelectItem>
                                                            <SelectItem value="avg">
                                                                {t("dashboard.metricBuilder.opAverage")}
                                                            </SelectItem>
                                                            <SelectItem value="ratio">
                                                                {t("dashboard.metricBuilder.opRatio")}
                                                            </SelectItem>
                                                            <SelectItem value="percentage">
                                                                {t("dashboard.metricBuilder.opPercentage")}
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {(metric.logic?.operation ===
                                                    "sum" ||
                                                    metric.logic?.operation ===
                                                        "avg") && (
                                                    <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/80 rounded-lg border dark:border-slate-700">
                                                        <Label className="text-blue-600 dark:text-blue-400">
                                                            {t("dashboard.metricBuilder.targetField")}
                                                        </Label>
                                                        <Select
                                                            value={
                                                                metric.logic
                                                                    .targetField
                                                            }
                                                            onValueChange={(
                                                                val,
                                                            ) =>
                                                                updateLogic({
                                                                    targetField:
                                                                        val,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-white dark:bg-gray-800">
                                                                <SelectValue placeholder={t("dashboard.metricBuilder.selectNumericField")} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {schema.flatMap(
                                                                    (t) =>
                                                                        t.fields
                                                                            .filter(
                                                                                (
                                                                                    f,
                                                                                ) =>
                                                                                    f.type ===
                                                                                    "number",
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    f,
                                                                                ) => (
                                                                                    <SelectItem
                                                                                        key={
                                                                                            f.value
                                                                                        }
                                                                                        value={
                                                                                            f.value
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            t.label
                                                                                        }
                                                                                        :{" "}
                                                                                        {
                                                                                            f.label
                                                                                        }
                                                                                    </SelectItem>
                                                                                ),
                                                                            ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                {metric.type ===
                                                    "distribution" && (
                                                    <div className="space-y-2 p-4 bg-purple-50 dark:bg-purple-950/80 rounded-lg border border-purple-100 dark:border-purple-800">
                                                        <Label className="text-purple-700 dark:text-purple-300">
                                                            {t("dashboard.metricBuilder.groupBy")}
                                                        </Label>
                                                        <Select
                                                            value={
                                                                metric.logic
                                                                    ?.groupByField
                                                            }
                                                            onValueChange={(
                                                                val,
                                                            ) =>
                                                                updateLogic({
                                                                    groupByField:
                                                                        val,
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-white dark:bg-gray-800">
                                                                <SelectValue placeholder={t("dashboard.metricBuilder.selectCategory")} />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {schema.flatMap(
                                                                    (t) =>
                                                                        t.fields
                                                                            .filter(
                                                                                (
                                                                                    f,
                                                                                ) =>
                                                                                    f.type ===
                                                                                    "text",
                                                                            )
                                                                            .map(
                                                                                (
                                                                                    f,
                                                                                ) => (
                                                                                    <SelectItem
                                                                                        key={
                                                                                            f.value
                                                                                        }
                                                                                        value={
                                                                                            f.value
                                                                                        }
                                                                                    >
                                                                                        {
                                                                                            t.label
                                                                                        }
                                                                                        :{" "}
                                                                                        {
                                                                                            f.label
                                                                                        }
                                                                                    </SelectItem>
                                                                                ),
                                                                            ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}

                                                {/* Denominator Config for Ratio/Percentage */}
                                                {(metric.logic?.operation === "ratio" ||
                                                    metric.logic?.operation === "percentage") && (
                                                    <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <Percent className="h-4 w-4 text-amber-600" />
                                                            <span className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                                                                {metric.logic?.operation === "percentage" ? t("dashboard.metricBuilder.opPercentage") : t("dashboard.metricBuilder.opRatio")} {t("dashboard.metricBuilder.denominator")}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                                                            {t("dashboard.metricBuilder.denominatorHint")}
                                                        </p>
                                                        <Select
                                                            value={metric.logic?.denominatorType || "all"}
                                                            onValueChange={(val) =>
                                                                updateLogic({
                                                                    denominatorType: val as "all" | "custom",
                                                                })
                                                            }
                                                        >
                                                            <SelectTrigger className="bg-white dark:bg-gray-800">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="all">
                                                                    <div className="flex items-center gap-2">
                                                                        <Database className="h-4 w-4 text-amber-500" />
                                                                        {t("dashboard.metricBuilder.denominatorAll")}
                                                                    </div>
                                                                </SelectItem>
                                                                <SelectItem value="custom">
                                                                    <div className="flex items-center gap-2">
                                                                        <Filter className="h-4 w-4 text-amber-500" />
                                                                        {t("dashboard.metricBuilder.denominatorCustom")}
                                                                    </div>
                                                                </SelectItem>
                                                            </SelectContent>
                                                        </Select>

                                                        {metric.logic?.denominatorType === "custom" && (
                                                            <div className="mt-3 space-y-2 p-3 bg-white dark:bg-gray-800 rounded-lg border border-amber-300 dark:border-amber-700">
                                                                <Label className="text-xs text-amber-600 dark:text-amber-400">
                                                                    {t("dashboard.metricBuilder.denominatorFilters")}
                                                                </Label>
                                                                {(metric.logic?.denominatorFilters || []).map((filter, index) => (
                                                                    <div key={index} className="flex gap-2 items-center">
                                                                        <Select
                                                                            value={filter.field || ""}
                                                                            onValueChange={(val) => {
                                                                                const newFilters = [...(metric.logic?.denominatorFilters || [])];
                                                                                newFilters[index] = { ...newFilters[index], field: val };
                                                                                updateLogic({ denominatorFilters: newFilters });
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="w-[140px]">
                                                                                <SelectValue placeholder={t("dashboard.metricBuilder.filterField")} />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {schema.flatMap((t) =>
                                                                                    t.fields.map((f) => (
                                                                                        <SelectItem key={f.value} value={f.value}>
                                                                                            {f.label}
                                                                                        </SelectItem>
                                                                                    ))
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <Select
                                                                            value={filter.operator || "equals"}
                                                                            onValueChange={(val) => {
                                                                                const newFilters = [...(metric.logic?.denominatorFilters || [])];
                                                                                newFilters[index] = { ...newFilters[index], operator: val };
                                                                                updateLogic({ denominatorFilters: newFilters });
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="w-[100px]">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="equals">{t("dashboard.metricBuilder.opEquals")}</SelectItem>
                                                                                <SelectItem value="contains">{t("dashboard.metricBuilder.opContains")}</SelectItem>
                                                                                <SelectItem value="gt">{t("dashboard.metricBuilder.opGreaterThan")}</SelectItem>
                                                                                <SelectItem value="lt">{t("dashboard.metricBuilder.opLessThan")}</SelectItem>
                                                                                <SelectItem value="not">{t("dashboard.metricBuilder.opNotEquals")}</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <Input
                                                                            value={filter.value || ""}
                                                                            onChange={(e) => {
                                                                                const newFilters = [...(metric.logic?.denominatorFilters || [])];
                                                                                newFilters[index] = { ...newFilters[index], value: e.target.value };
                                                                                updateLogic({ denominatorFilters: newFilters });
                                                                            }}
                                                                            placeholder={t("dashboard.metricBuilder.filterValue")}
                                                                            className="flex-1"
                                                                        />
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            className="h-8 w-8 text-red-500 hover:text-red-700"
                                                                            onClick={() => {
                                                                                const newFilters = (metric.logic?.denominatorFilters || []).filter((_, i) => i !== index);
                                                                                updateLogic({ denominatorFilters: newFilters });
                                                                            }}
                                                                        >
                                                                            <Trash2 className="h-4 w-4" />
                                                                        </Button>
                                                                    </div>
                                                                ))}
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    className="w-full border-dashed border-amber-400"
                                                                    onClick={() => {
                                                                        const newFilters = [...(metric.logic?.denominatorFilters || []), { tableId: metric.logic?.source, field: "", operator: "equals", value: "" }];
                                                                        updateLogic({ denominatorFilters: newFilters });
                                                                    }}
                                                                >
                                                                    <Plus className="mr-2 h-4 w-4" /> {t("dashboard.metricBuilder.addDenominatorFilter")}
                                                                </Button>
                                                            </div>
                                                        )}

                                                        <div className="mt-3 p-2 bg-amber-100 dark:bg-amber-900/50 rounded text-xs text-amber-800 dark:text-amber-200">
                                                            <strong>{t("dashboard.metricBuilder.formulaLabel")}</strong>{" "}
                                                            {metric.logic?.operation === "percentage"
                                                                ? t("dashboard.metricBuilder.formulaPercentage")
                                                                : t("dashboard.metricBuilder.formulaRatio")}
                                                        </div>
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                        <div className="mt-2 flex justify-between gap-2">
                                            <Button

                                                onClick={() =>
                                                    setActiveTab("scope")
                                                }
                                            >
                                            <ArrowLeft className="h-4 w-4" />
                                                {t("common.back")}
                                            </Button>
                                            <Button
                                                onClick={handleRunPreview}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                <Play className="mr-2 h-4 w-4" />{" "}
                                                {t("dashboard.metricBuilder.runPreview")}
                                            </Button>
                                            <Button
                                                onClick={() => saveMutation.mutate(metric)}
                                                disabled={saveMutation.isPending}
                                            >
                                                <Save className="mr-2 h-4 w-4" />
                                                {saveMutation.isPending
                                                    ? t("common.saving")
                                                    : metric.id
                                                      ? t("dashboard.metricBuilder.updateMetric")
                                                      : t("dashboard.metricBuilder.saveToLibrary")}
                                            </Button>
                                        </div>
                                    </TabsContent>
                                </Tabs>
                        </div>

                        {/* LIVE PREVIEW */}
                        <div className="lg:col-span-3">
                            <div className="h-full border border-blue-100 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/50 rounded-lg p-4">
                                <div className="text-med font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2 mb-4">
                                    <Database className="h-4 w-4" /> {t("dashboard.metricBuilder.livePreview")}
                                </div>
                                {isCalculating ? (
                                    <div className="flex items-center justify-center h-32 text-blue-500 animate-pulse">
                                        {t("dashboard.metricBuilder.calculating")}
                                    </div>
                                ) : previewResult !== null ? (
                                    <div className="space-y-4">
                                        <div className="text-center p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700">
                                            <div className="text-xs text-gray-400 mb-1">
                                                {t("dashboard.metricBuilder.result")}
                                            </div>
                                            {metric.type === "scalar" && (
                                                <>
                                                    <div className="text-4xl font-black text-slate-800 dark:text-slate-200">
                                                        {previewResult}
                                                    </div>
                                                    {metric.name && (
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                            {metric.name}
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            {(metric.type === "series" ||
                                                metric.type === "distribution") && (
                                                <div className="flex flex-col items-center justify-center h-32 text-gray-300">
                                                    <BarChart3 className="h-12 w-12" />
                                                    <span className="text-xs mt-2">
                                                        {Array.isArray(
                                                            previewResult,
                                                        )
                                                            ? `${previewResult.length} items`
                                                            : ""}
                                                    </span>
                                                    {metric.name && (
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                                            {metric.name}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-3 bg-slate-900 text-slate-50 rounded-lg text-xs font-mono overflow-hidden">
                                            <div className="mb-2 text-slate-400 border-b border-slate-700 pb-1">
                                                {t("dashboard.metricBuilder.jsonOutput")}
                                            </div>
                                            <pre>
                                                {JSON.stringify(
                                                    previewResult,
                                                    null,
                                                    2,
                                                )}
                                            </pre>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="relative text-center text-sm text-gray-400 py-8">
                                        <Play className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 text-gray-200 dark:text-gray-700" />
                                        <span className="relative z-10">{t("dashboard.metricBuilder.runPreviewHint")}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}