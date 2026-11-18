import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Save,
  RotateCcw,
  LayoutDashboard,
  Settings,
  Type,
  Grid3X3,
  Check,
  ToggleLeft,
  Plus,
  Trash2,
  X,
  BarChart3,
  LineChart,
  PieChart,
  Square,
  Layers,
  Hexagon,
  Disc,
  MessageSquare,
  Sliders,
  Users,
  MoreVertical,
  ArrowUpToLine,
  ArrowDownToLine,
  LayoutTemplate,
  Palette,
  Database,
  FunctionSquare,
  SquareAsterisk,
  SquareBottomDashedScissors,
  BookMarked,
  RectangleEllipsis,
  ChevronDown,
  ShieldCheck
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { LucideIconPicker } from "@/components/ui/lucide-icon-picker";
import { APP_PAGE_REGISTRY } from "@/config/app-pages";
import { ColorPicker } from "@/components/ui/color-picker";
import { LiveChartRenderer } from "@/components/dashboard-widgets/LiveChartRenderer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

import {
  DashboardSystemConfig,
  WidgetConfig,
  LayoutConfig,
  LayoutSection,
} from "@/types/dashboard-config";
import { defaultDashboardConfig } from "@/config/dashboard-data";
import { useTranslation } from "react-i18next";

// --- DND IMPORTS ---
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDraggable,
  DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableWidget } from "@/components/dashboard/sortable-widget";

// Prefix for in-memory "new blank" layouts that haven't been saved yet.
// The save mutation filters these out (unless they have content).
const BLANK_LAYOUT_ID_PREFIX = 'new-blank-';

function createBlankLayout(): LayoutConfig {
  return {
    id: `${BLANK_LAYOUT_ID_PREFIX}${Date.now()}`,
    name: 'New Dashboard',
    role: 'All',
    roles: ['all'],
    sections: [],
  };
}

// --- 1. STATIC LOGIC LIBRARY ---
const STATIC_LOGIC_LIBRARY = [
  { id: "count_active", label: "KPI: Active Projects", type: "scalar", desc: "Count of non-closed projects" },
  { id: "win_rate", label: "KPI: Global Win Rate", type: "scalar", desc: "% of Closed Won vs Total Closed" },
  { id: "avg_cycle", label: "KPI: Avg Cycle Time", type: "scalar", desc: "Avg days from Start to End" },
  { id: "count_due_soon", label: "KPI: Due Soon (7d)", type: "scalar", desc: "Projects ending in 7 days" },
  { id: "sparkline_active", label: "Trend: Active Projects", type: "series", desc: "12-week trend of active count" },
  { id: "sparkline_won", label: "Trend: Win Velocity", type: "series", desc: "12-week trend of won deals" },
  { id: "dist_status", label: "Dist: Project Status", type: "distribution", desc: "Count of projects by status" },
  { id: "dist_risk", label: "Dist: Risk Level", type: "distribution", desc: "Count of projects by risk" },
  { id: "fiscal_trends", label: "Complex: Fiscal Trends", type: "complex", desc: "Detailed fiscal quarter analysis" },
];

// --- WIDGET TEMPLATES ---
const WIDGET_TEMPLATES = [
  // Standard Widgets
  {
    type: "bar",
    title: "Bar Chart",
    icon: "BarChart3",
    span: 2,
    rowSpan: 1,
    desc: "Vertical bar comparison",
    isCustom: false,
    supportedLogic: ["distribution", "series"]
  },
  {
    type: "line",
    title: "Line Chart",
    icon: "LineChart",
    span: 2,
    rowSpan: 1,
    desc: "Trend over time",
    isCustom: false,
    supportedLogic: ["series"]
  },
  {
    type: "area",
    title: "Area Chart",
    icon: "AreaChart",
    span: 2,
    rowSpan: 1,
    desc: "Volume trend",
    isCustom: false,
    supportedLogic: ["series"]
  },
  {
    type: "pie",
    title: "Pie Chart",
    icon: "PieChart",
    span: 1,
    rowSpan: 1,
    desc: "Part-to-whole",
    isCustom: false,
    supportedLogic: ["distribution"]
  },
  {
    type: "donut",
    title: "Donut Chart",
    icon: "Circle",
    span: 1,
    rowSpan: 1,
    desc: "Ring chart",
    isCustom: false,
    supportedLogic: ["distribution"]
  },
  {
    type: "radar",
    title: "Radar Chart",
    icon: "Hexagon",
    span: 1,
    rowSpan: 1,
    desc: "Multi-variable comparison",
    isCustom: false,
    supportedLogic: ["distribution"]
  },
  {
    type: "radial",
    title: "Radial Chart",
    icon: "Disc",
    span: 1,
    rowSpan: 1,
    desc: "Circular progress",
    isCustom: false,
    supportedLogic: ["distribution", "scalar"]
  },
// --- CUSTOM WIDGETS (Updated List) ---
  {
    type: "kpi_strip",
    title: "Custom: KPI Metrics",
    icon: "LayoutList",
    span: 4,
    rowSpan: 1,
    desc: "Standard Performance KPIs",
    isCustom: true,
    supportedLogic: ["scalar"] 
  },
  {
    type: "map_kpi_component", // [NEW] Dedicated Type
    title: "Custom: MAP Progress",
    icon: "Waypoints", // Distinct icon
    span: 4,
    rowSpan: 1,
    desc: "MAP Execution & Risk Status",
    isCustom: true,
    supportedLogic: ["scalar"]
  },
  {
    type: "project_metrics_component",
    title: "Custom: Project Metrics",
    icon: "PieChart",
    span: 1,
    rowSpan: 2,
    desc: "Donuts & Status (Complex)",
    isCustom: true,
    supportedLogic: ["complex"]
  },
  {
    type: "fiscal_trends_component",
    title: "Custom: Fiscal Trends",
    icon: "TrendingUp",
    span: 2,
    rowSpan: 2,
    desc: "Revenue & Projects (Composed)",
    isCustom: true,
    supportedLogic: ["complex"]
  },
  {
    type: "support_metrics_component",
    title: "Custom: Support Metrics",
    icon: "Bolt",
    span: 1,
    rowSpan: 2,
    desc: "Ticket volume & status",
    isCustom: true,
    supportedLogic: ["complex"]
  },
  {
    type: "account_metrics_component",
    title: "Custom: Account Metrics",
    icon: "ChartColumn",
    span: 2,
    rowSpan: 2,
    desc: "Account performance & criteria",
    isCustom: true,
    supportedLogic: ["complex"]
  },
  {
    type: "project_schedules_component",
    title: "Custom: Project Schedules",
    icon: "Calendar",
    span: 2,
    rowSpan: 2,
    desc: "Calendar timeline view",
    isCustom: true,
    supportedLogic: ["complex"]
  },
  {
    type: "status_distribution_component",
    title: "Custom: Status Distribution",
    icon: "ChartPie",
    span: 1,
    rowSpan: 2,
    desc: "Status breakdown charts",
    isCustom: true,
    supportedLogic: ["complex"]
  },
];

const AVAILABLE_ROLES = [
  "All",
  "Admin",
  "Engineer",
  "Sales",
  "Manager",
  "Customer",
];

// --- HELPER: BACKWARD COMPATIBLE COLOR CONVERSION ---
const tailwindToHex: Record<string, string> = {
  "text-slate-600": "#475569",
  "text-blue-600": "#2563eb",
  "text-green-600": "#16a34a",
  "text-red-600": "#dc2626",
  "text-orange-600": "#ea580c",
  "text-purple-600": "#9333ea",
  "text-cyan-600": "#0891b2",
  "text-pink-600": "#db2777",
  "text-amber-600": "#d97706",
  "text-indigo-600": "#4f46e5",
};

const resolveIconColor = (colorValue: string | undefined): string => {
  if (!colorValue) return "#64748b";
  if (colorValue.startsWith("#")) return colorValue;
  if (colorValue.startsWith("text-")) {
    return tailwindToHex[colorValue] || "#64748b";
  }
  return "#64748b";
};

// --- HELPER: TITLE FONT SIZE CLASS ---
const getTitleFontSizeClass = (size?: string) => {
  switch (size) {
    case 'xs': return 'text-xs';
    case 'sm': return 'text-sm';
    case 'base': return 'text-base';
    case 'lg': return 'text-lg';
    case '2xl': return 'text-2xl';
    case 'xl':
    default: return 'text-xs'; // Default for widget card headers
  }
};

// --- HELPER: GET VARIANTS BY TYPE ---
const getChartVariants = (type: string) => {
  switch (type) {
    case "area":
      return [
        { value: "default", label: "Standard Area" },
        { value: "stacked", label: "Stacked Area" },
        { value: "percent", label: "Stacked Expanded (100%)" },
        { value: "gradient", label: "Gradient Fill" },
      ];
    case "bar":
      return [
        { value: "default", label: "Standard Bar" },
        { value: "multiple", label: "Multiple (Grouped)" },
        { value: "stacked", label: "Stacked Bar" },
        { value: "horizontal", label: "Horizontal Bar" },
        { value: "negative", label: "Negative Values" },
        { value: "mixed", label: "Mixed (Line + Bar)" },
      ];
    case "line":
      return [
        { value: "monotone", label: "Smooth (Curved)" },
        { value: "linear", label: "Linear (Straight)" },
        { value: "step", label: "Stepped Line" },
        { value: "multiple", label: "Multiple Lines" },
        { value: "dots", label: "Line with Dots" },
        { value: "colored_dots", label: "Active Dots (Colored)" },
      ];
    case "pie":
    case "donut":
      return [
        { value: "default", label: "Standard Pie" },
        { value: "donut", label: "Donut" },
        { value: "stacked", label: "Stacked" },
        { value: "interactive", label: "Interactive (Hover)" },
        { value: "text", label: "Donut with Text" },
      ];
    case "radar":
      return [
        { value: "default", label: "Standard Radar" },
        { value: "filled", label: "Filled Grid" },
        { value: "lines", label: "Lines Only" },
        { value: "dots", label: "Dots Only" },
      ];
    case "radial":
      return [
        { value: "default", label: "Standard Radial" },
        { value: "label", label: "Radial with Label" },
        { value: "stacked", label: "Stacked Radial" },
        { value: "semicircle", label: "Semi-Circle Gauge" },
      ];
    default:
      return [];
  }
};

function DraggableLibraryItem({
  template,
}: {
  template: (typeof WIDGET_TEMPLATES)[0];
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `template-${template.type}`,
    data: { type: "template", template },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="p-2 mb-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm cursor-grab hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all flex items-center gap-2"
    >
      <div
        className={`h-7 w-7 rounded shrink-0 flex items-center justify-center ${template.isCustom ? "bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400" : "bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400"}`}
      >
        <DynamicIcon name={template.icon} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
          {template.title}
        </div>
        <div className="text-[10px] text-slate-400">{template.desc}</div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT: DROP TARGET SECTION ---
function DashboardSection({
  section,
  activeLayout,
  localConfig,
  selectedWidgetId,
  onSelectWidget,
  onUpdateSection,
  onDeleteSection,
  onDeleteWidget,
  logicLibrary // Pass merged library
}: {
  section: LayoutSection;
  activeLayout: any;
  localConfig: DashboardSystemConfig;
  selectedWidgetId: string | null;
  onSelectWidget: (id: string) => void;
  onUpdateSection: (id: string, updates: Partial<LayoutSection>) => void;
  onDeleteSection: (id: string) => void;
  onDeleteWidget: (id: string) => void;
  logicLibrary: any[];
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({
    id: section.id,
    data: { type: "section", sectionId: section.id },
  });

  return (
    <div
      ref={setNodeRef}
      className="group relative border border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-2 hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-slate-50/50 dark:bg-slate-800/50"
    >
      <div className="absolute -top-3 left-4 bg-white dark:bg-gray-800 px-2 text-xs font-medium text-slate-400 flex items-center gap-2 border dark:border-gray-700 rounded-full shadow-sm">
        <LayoutTemplate className="h-3 w-3" /> {t("dashboard.builder.sectionLabel", { columns: section.columns })}
        <Separator orientation="vertical" className="h-3" />
        <DropdownMenu>
          <DropdownMenuTrigger className="hover:text-blue-600 cursor-pointer">
            {t("common.edit")}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{t("dashboard.builder.columns")}</DropdownMenuLabel>
            {[1, 2, 3, 4, 5, 6].map((cols) => (
              <DropdownMenuItem
                key={cols}
                onClick={() =>
                  onUpdateSection(section.id, { columns: cols as any })
                }
              >
                {t("dashboard.builder.nColumns", { count: cols })}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteSection(section.id)}
              className="text-red-600"
            >
              {t("dashboard.builder.deleteSection")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <SortableContext items={section.widgetIds} strategy={rectSortingStrategy}>
        <div
          className={`grid gap-4 min-h-[120px] p-4 rounded-lg ${section.widgetIds.length === 0 ? "bg-slate-100/50 dark:bg-slate-800/50" : ""} grid-cols-${section.columns} auto-rows-auto`}
          style={{
            gridTemplateColumns: `repeat(${section.columns}, minmax(0, 1fr))`,
          }}
        >
          {section.widgetIds.map((widgetId) => {
            const widget = localConfig.widgets[widgetId];
            if (!widget) return null;
            const span = Math.min(widget.gridColSpan || 1, section.columns);
            const rowSpan = widget.gridRowSpan || 1;
            const iconColor = resolveIconColor(
              widget.settings?.colorScheme?.[0],
            );

            // Find logic label
            const activeLogic = logicLibrary.find(l => l.id === widget.dataSource);
            
            // Title customization
            const titleFontSize = getTitleFontSizeClass(widget.settings?.titleFontSize);
            const titleColor = widget.settings?.titleColor;
            const isTitleHex = titleColor?.startsWith("#");

            return (
              <div
                key={widgetId}
                style={{
                  gridColumn: `span ${span}`,
                  gridRow: `span ${rowSpan}`,
                }}
              >
                <SortableWidget
                  id={widgetId}
                  isSelected={selectedWidgetId === widgetId}
                  onClick={() => onSelectWidget(widgetId)}
                >
                  <div
                    className={`relative group/widget rounded-xl border h-full flex flex-col bg-white dark:bg-gray-800 overflow-hidden transition-all ${selectedWidgetId === widgetId ? "ring-2 ring-blue-500 shadow-md" : "hover:shadow-md border-slate-200 dark:border-gray-700"}`}
                  >
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 rounded-full opacity-0 group-hover/widget:opacity-100 transition-opacity z-50 shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteWidget(widgetId);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>

                    <div className="p-3 border-b dark:border-gray-700 bg-slate-50/50 dark:bg-gray-900/50 flex items-center justify-between">
                      <span 
                        className={`font-semibold ${titleFontSize} truncate flex items-center gap-2 ${!isTitleHex ? (titleColor || 'text-slate-700 dark:text-slate-200') : ''}`}
                        style={isTitleHex ? { color: titleColor } : undefined}
                      >
                        {widget.iconName && (
                          <DynamicIcon
                            name={widget.iconName}
                            className="h-3 w-3"
                            style={{ color: iconColor }}
                          />
                        )}
                        {widget.title}
                      </span>
                      {/* SHOW CONNECTED LOGIC BADGE */}
                      {widget.dataSource && (
                        <Badge variant="outline" className="text-[10px] h-5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                          {activeLogic ? activeLogic.label : 'Linked'}
                        </Badge>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 p-2 relative">
                      <LiveChartRenderer widget={widget} />
                    </div>
                  </div>
                </SortableWidget>
              </div>
            );
          })}
          {section.widgetIds.length === 0 && (
            <div className="col-span-full h-full flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg">
              {t("dashboard.builder.dropWidgetsHere")}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export interface AdminDashboardBuilderProps {
  /**
   * Called whenever the builder's "dirty" state changes. `true` means the
   * current dashboard layout has unsaved changes relative to the last
   * server-loaded version. Used by parents (e.g. the Analytics page) to
   * warn the user before they navigate away from the builder.
   */
  onDirtyChange?: (dirty: boolean) => void;
}

export default function AdminDashboardBuilder({
  onDirtyChange,
}: AdminDashboardBuilderProps = {}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // --- FETCH DYNAMIC METRICS FOR DROPDOWN ---
  const { data: dynamicMetrics = [] } = useQuery({
    queryKey: ["/api/dashboard-metrics"],
  });

  // --- FETCH ROLES FROM CONFIGURATION ---
  interface Role {
    id: number;
    name: string;
    color: string;
    icon: string;
  }
  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/roles"],
    queryFn: async () => {
      const res = await fetch("/api/roles");
      if (!res.ok) throw new Error("Failed to fetch roles");
      return res.json();
    },
  });

  // --- MERGE LOGIC LIBRARY ---
  const mergedLogicLibrary = useMemo(() => {
    const dynamicItems = Array.isArray(dynamicMetrics) ? dynamicMetrics.map((m: any) => ({
      id: m.id.toString(), // Ensure ID matches format
      label: m.name,
      type: m.type,
      desc: m.description || "User defined metric"
    })) : [];

    return [...STATIC_LOGIC_LIBRARY, ...dynamicItems];
  }, [dynamicMetrics]);

  const [targetPageKey, setTargetPageKey] = useState(APP_PAGE_REGISTRY[0].key);
  const groupedPages = APP_PAGE_REGISTRY.reduce(
    (acc, page) => {
      if (!acc[page.category]) acc[page.category] = [];
      acc[page.category].push(page);
      return acc;
    },
    {} as Record<string, typeof APP_PAGE_REGISTRY>,
  );

  const [localConfig, setLocalConfig] = useState<DashboardSystemConfig | null>(
    null,
  );
  const [activeLayoutId, setActiveLayoutId] = useState<string>("default");
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [activeDragItem, setActiveDragItem] = useState<any>(null);

  // Surface dirty state to the parent so it can warn the user before they
  // navigate away from this builder with unsaved changes.
  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);
  const pendingNormalizationRef = useRef(false); // Track if normalization needs to run after db load
  const isSavingRef = useRef(false); // True after a save, so the re-triggered useEffect doesn't reset to blank
  const loadGenerationRef = useRef(0); // Generation ID to track which load we're processing
  const [loadCounter, setLoadCounter] = useState(0); // Increment on every server load to trigger normalization

  const [isNewLayoutDialogOpen, setIsNewLayoutDialogOpen] = useState(false);
  const [newLayoutName, setNewLayoutName] = useState("");
  const [newLayoutRole, setNewLayoutRole] = useState("all");
  const [isRolePopoverOpen, setIsRolePopoverOpen] = useState(false);
  const [newLayoutTargetPage, setNewLayoutTargetPage] = useState("standalone");

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isDeleteSectionDialogOpen, setIsDeleteSectionDialogOpen] =
    useState(false);
  const [sectionToDelete, setSectionToDelete] = useState<string | null>(null);
  const [widgetLibraryFilter, setWidgetLibraryFilter] = useState<"default" | "custom">("default");
  const [isRolesPopoverOpen, setIsRolesPopoverOpen] = useState(false);

  const { data: layoutData, isLoading } = useQuery({
    queryKey: ["/api/dashboard-layout", targetPageKey],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard-layout?page=${targetPageKey}&role=All`);
      if (!res.ok) throw new Error("Failed to fetch layout");
      return res.json();
    },
  });

  const dbConfig = layoutData?.config || null;
  // True for the seeded built-in "Analytics - Dashboard Builder" Overview
  // row (Task #555). Used to surface a "Built-in" badge in the header
  // and to lock the "Delete Current" menu item so admins can't try to
  // delete a row the server will reject with a 409. If a future flow
  // ever does fire `DELETE /api/dashboard-layout/:id` against this row,
  // the centralized handler in `client/src/lib/queryClient.ts`
  // (`isDashboardLayoutProtectedResponse` /
  // `DASHBOARD_LAYOUT_PROTECTED_CODE`, Task #561) recognizes the 409
  // and surfaces a calm, plain-language toast automatically.
  const isProtectedLayout = !!layoutData?.isProtected;

  useEffect(() => {
    if (isSavingRef.current) {
      // Post-save reload: sync from DB but stay on a fresh blank layout
      isSavingRef.current = false;
      if (dbConfig && Array.isArray(dbConfig.layouts)) {
        pendingNormalizationRef.current = true;
        loadGenerationRef.current += 1;
        const blankLayout = createBlankLayout();
        setLocalConfig({ ...dbConfig, layouts: [blankLayout, ...dbConfig.layouts] });
        setLoadCounter(c => c + 1);
        setActiveLayoutId(blankLayout.id);
        // hasUnsavedChanges already cleared by onSuccess
      }
      return;
    }

    if (dbConfig && Array.isArray(dbConfig.layouts)) {
      // Existing saved layout(s): prepend a fresh blank layout and start on it.
      // The saved layouts remain accessible via the Layout dropdown.
      pendingNormalizationRef.current = true;
      loadGenerationRef.current += 1;
      setHasUnsavedChanges(false);
      const blankLayout = createBlankLayout();
      setLocalConfig({ ...dbConfig, layouts: [blankLayout, ...dbConfig.layouts] });
      setLoadCounter(c => c + 1);
      setActiveLayoutId(blankLayout.id);
    } else if (!isLoading) {
      // Fresh install / no saved layout: start with a single blank canvas.
      pendingNormalizationRef.current = true;
      loadGenerationRef.current += 1;
      setHasUnsavedChanges(false);
      const blankLayout = createBlankLayout();
      setLocalConfig({ layouts: [blankLayout], widgets: {} });
      setLoadCounter(c => c + 1);
      setActiveLayoutId(blankLayout.id);
    }
  }, [dbConfig, isLoading, targetPageKey]);

  const saveMutation = useMutation({
    mutationFn: async (config: DashboardSystemConfig) => {
      // Safety net: normalize role identifiers before save to ensure only IDs are persisted
      const normalizedConfig = {
        ...config,
        layouts: config.layouts.map(layout => {
          const rawRoles = layout.roles || 
            (layout.role === "All" ? ["all"] : layout.role ? [layout.role] : ["all"]);
          // Convert any role names to IDs
          const normalizedRoles = [...new Set(rawRoles.map((r: string) => {
            if (r === "all" || r === "All") return "all";
            if (!isNaN(Number(r))) return r; // Already an ID
            const role = roles.find(role => role.name === r);
            return role ? String(role.id) : r;
          }))];
          return { ...layout, roles: normalizedRoles };
        })
      };

      // Strip blank placeholder layouts that are still empty — only persist them
      // if the user actually added sections/widgets to the "New Dashboard" tab.
      const layoutsToSave = normalizedConfig.layouts.filter(
        l => !l.id.startsWith(BLANK_LAYOUT_ID_PREFIX) || (Array.isArray(l.sections) && l.sections.length > 0)
      );
      const configToSave = { ...normalizedConfig, layouts: layoutsToSave };

      const payload = {
        name: `Layout for ${targetPageKey}`,
        description: "Created via Admin Builder",
        pageKey: targetPageKey,
        role: "All",
        isDefault: true,
        layoutConfig: configToSave
      };

      const res = await fetch("/api/dashboard-layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to save layout");
      }
      return res.json();
    },

    onSuccess: () => {
      isSavingRef.current = true; // Signal: next useEffect run is post-save, not a fresh open
      showSuccessToast(t("common.success"), t("dashboard.builder.layoutSavedDescription", { pageKey: targetPageKey }));
      setHasUnsavedChanges(false);
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard-layout"] });
    },
    onError: () => {
      showErrorToast(t("dashboard.builder.saveFailed"), t("dashboard.builder.saveFailedDescription"));
    },
  });

  const handleReset = () => {
    setIsResetDialogOpen(true);
  };

  const confirmReset = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard-layout", targetPageKey] });
    setHasUnsavedChanges(false);
    queryClient.refetchQueries({ queryKey: ["/api/dashboard-layout", targetPageKey] });
    showSuccessToast(t("dashboard.builder.layoutResetTitle"), t("dashboard.builder.layoutResetDescription"));
  };

  const handleAddSection = () => {
    if (!localConfig) return;

    setLocalConfig((prev) => {
      if (!prev) return null;
      const layoutIndex = prev.layouts.findIndex(
        (l) => l.id === activeLayoutId,
      );

      if (layoutIndex === -1) {
        console.warn("Cannot add section: Active layout not found in config.");
        return prev;
      }

      const newLayouts = [...prev.layouts];
      const targetLayout = newLayouts[layoutIndex];

      if (!Array.isArray(targetLayout.sections)) {
        targetLayout.sections = [];
      }

      targetLayout.sections.push({
        id: `section-${Date.now()}`,
        columns: 4,
        widgetIds: [],
      });

      return { ...prev, layouts: newLayouts };
    });

    setHasUnsavedChanges(true);
  };

  const handleUpdateSection = (
    sectionId: string,
    updates: Partial<LayoutSection>,
  ) => {
    if (!localConfig) return;
    setLocalConfig((prev) => {
      if (!prev) return null;
      const layoutIndex = prev.layouts.findIndex(
        (l) => l.id === activeLayoutId,
      );
      const newLayouts = [...prev.layouts];
      const sections = newLayouts[layoutIndex].sections || [];
      const secIndex = sections.findIndex(
        (s) => s.id === sectionId,
      );
      if (secIndex >= 0) {
        sections[secIndex] = {
          ...sections[secIndex],
          ...updates,
        };
        newLayouts[layoutIndex].sections = sections;
      }
      return { ...prev, layouts: newLayouts };
    });
    setHasUnsavedChanges(true);
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!localConfig) return;
    setSectionToDelete(sectionId);
    setIsDeleteSectionDialogOpen(true);
  };

  const confirmDeleteSection = () => {
    if (!localConfig || !sectionToDelete) return;
    setLocalConfig((prev) => {
      if (!prev) return null;
      const layoutIndex = prev.layouts.findIndex(
        (l) => l.id === activeLayoutId,
      );
      const newLayouts = [...prev.layouts];
      const sections = newLayouts[layoutIndex].sections || [];
      const section = sections.find(
        (s) => s.id === sectionToDelete,
      );

      const newWidgets = { ...prev.widgets };
      section?.widgetIds.forEach((wid) => delete newWidgets[wid]);

      newLayouts[layoutIndex].sections = sections.filter((s) => s.id !== sectionToDelete);
      return { ...prev, layouts: newLayouts, widgets: newWidgets };
    });
    setHasUnsavedChanges(true);
    setSectionToDelete(null);
  };

  const handleDeleteWidget = (widgetId: string) => {
    if (!localConfig) return;
    if (selectedWidgetId === widgetId) setSelectedWidgetId(null);

    setLocalConfig((prev) => {
      if (!prev) return null;
      const layoutIndex = prev.layouts.findIndex(
        (l) => l.id === activeLayoutId,
      );
      const newLayouts = [...prev.layouts];
      const sections = newLayouts[layoutIndex].sections || [];

      sections.forEach((s) => {
        s.widgetIds = s.widgetIds.filter((id) => id !== widgetId);
      });
      newLayouts[layoutIndex].sections = sections;

      const newWidgets = { ...prev.widgets };
      delete newWidgets[widgetId];

      return { ...prev, layouts: newLayouts, widgets: newWidgets };
    });
    setHasUnsavedChanges(true);
  };

  // --- ROLE MULTI-SELECT HANDLERS ---
  // Stores role IDs (as strings) for persistence, displays names for UI
  const currentLayoutForRoles = localConfig?.layouts.find((l) => l.id === activeLayoutId);
  
  // Helper to get role by ID or name (for backward compatibility)
  const getRoleById = (roleId: string) => roles.find((r) => String(r.id) === roleId || r.name === roleId);
  
  // Normalize layout roles: convert legacy names to IDs
  const normalizeRoleId = (roleValue: string): string => {
    if (roleValue === "all" || roleValue === "All") return "all";
    // If it's already a numeric ID, keep it
    if (!isNaN(Number(roleValue))) return roleValue;
    // If it's a name, find the role and return its ID
    const role = roles.find((r) => r.name === roleValue);
    return role ? String(role.id) : roleValue;
  };
  
  // Get normalized layout roles (converts legacy names to IDs when roles are loaded)
  const rawLayoutRoles = currentLayoutForRoles?.roles || 
    (currentLayoutForRoles?.role === "All" ? ["all"] : 
     currentLayoutForRoles?.role ? [currentLayoutForRoles.role] : ["all"]);
  
  const layoutRoles = useMemo(() => {
    if (roles.length === 0) return rawLayoutRoles; // Keep raw if roles not loaded yet
    return [...new Set(rawLayoutRoles.map(normalizeRoleId))]; // Normalize and dedupe
  }, [rawLayoutRoles, roles]);
  
  // Normalization effect: convert legacy role names to IDs when roles are loaded
  // Uses loadCounter to ensure every server load triggers the effect, even with identical role keys
  const configRolesKey = useMemo(() => {
    if (!localConfig) return "";
    return localConfig.layouts.map(l => `${l.id}:${JSON.stringify(l.roles || l.role || "")}`).join("|");
  }, [localConfig]);
  
  useEffect(() => {
    if (roles.length === 0 || !localConfig) return;
    
    // Clear the pending flag - load effect already cleared unsaved badge
    pendingNormalizationRef.current = false;
    
    let needsUpdate = false;
    const normalizedLayouts = localConfig.layouts.map((layout) => {
      const rawRoles = layout.roles || 
        (layout.role === "All" ? ["all"] : layout.role ? [layout.role] : ["all"]);
      const normalizedRoles = [...new Set(rawRoles.map(normalizeRoleId))];
      
      // Check if normalization changed anything
      if (JSON.stringify(rawRoles) !== JSON.stringify(normalizedRoles)) {
        needsUpdate = true;
        return { ...layout, roles: normalizedRoles };
      }
      return layout;
    });
    
    if (needsUpdate) {
      setLocalConfig((prev) => prev ? { ...prev, layouts: normalizedLayouts } : null);
      // Mark as unsaved so user can persist the normalized role IDs
      setHasUnsavedChanges(true);
    }
    // Note: hasUnsavedChanges already cleared by load effect, no need to clear here
  }, [roles, configRolesKey, loadCounter]);

  const handleRoleToggle = (roleId: string) => {
    if (!localConfig) return;
    setLocalConfig((prev) => {
      if (!prev) return null;
      const layoutIndex = prev.layouts.findIndex((l) => l.id === activeLayoutId);
      if (layoutIndex === -1) return prev;
      
      const newLayouts = [...prev.layouts];
      // Normalize existing roles first (convert names to IDs, dedupe)
      const currentRoles = (newLayouts[layoutIndex].roles || [])
        .map(normalizeRoleId)
        .filter((r, i, arr) => arr.indexOf(r) === i);
      
      let updatedRoles: string[];
      if (roleId === "all") {
        updatedRoles = ["all"];
      } else {
        const filtered = currentRoles.filter((r) => r !== "all");
        if (filtered.includes(roleId)) {
          const updated = filtered.filter((r) => r !== roleId);
          updatedRoles = updated.length > 0 ? updated : ["all"];
        } else {
          updatedRoles = [...filtered, roleId];
        }
      }
      
      newLayouts[layoutIndex].roles = updatedRoles;
      return { ...prev, layouts: newLayouts };
    });
    setHasUnsavedChanges(true);
  };

  const isRoleSelected = (roleId: string) => {
    const normalizedId = normalizeRoleId(roleId);
    if (normalizedId === "all") return layoutRoles.includes("all");
    return layoutRoles.includes(normalizedId) && !layoutRoles.includes("all");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = (event: DragStartEvent) =>
    setActiveDragItem(event.active);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);
    if (!over || !localConfig) return;

    const layoutIndex = localConfig.layouts.findIndex(
      (l) => l.id === activeLayoutId,
    );
    if (layoutIndex === -1) return;

    const activeLayout = localConfig.layouts[layoutIndex];
    const activeSections = activeLayout.sections || [];
    const findSection = (id: string) =>
      activeSections.find(
        (s) => s.id === id || s.widgetIds.includes(id),
      );

    const destSection = findSection(over.id as string);
    if (!destSection) return;

    if (active.data.current?.type === "template") {
      const template = active.data.current.template;
      const newId = `widget-${Date.now()}`;

      const newWidget: WidgetConfig = {
        id: newId,
        title: `New ${template.title.replace("Custom: ", "")}`,
        type: template.type,
        dataSource: "fiscal_trends",
        iconName: template.icon,
        gridColSpan:
          template.span > destSection.columns
            ? destSection.columns
            : template.span,
        gridRowSpan: template.rowSpan || 1,
        settings: { showLegend: true },
        chartConfig: {
          tooltip: { indicator: "default", showLabel: true },
          variant: "default",
        },
      };

      setLocalConfig((prev) => {
        if (!prev) return null;
        const newLayouts = [...prev.layouts];
        const sections = newLayouts[layoutIndex].sections || [];
        const targetSec = sections.find(
          (s) => s.id === destSection.id,
        );
        if (targetSec) {
          if (over.id === destSection.id) {
            targetSec.widgetIds.push(newId);
          } else {
            const overIndex = targetSec.widgetIds.indexOf(over.id as string);
            const newIndex =
              overIndex >= 0 ? overIndex : targetSec.widgetIds.length;
            targetSec.widgetIds.splice(newIndex, 0, newId);
          }
        }
        newLayouts[layoutIndex].sections = sections;
        return {
          ...prev,
          widgets: { ...prev.widgets, [newId]: newWidget },
          layouts: newLayouts,
        };
      });
      setSelectedWidgetId(newId);
      setHasUnsavedChanges(true);
      return;
    }

    const sourceSection = findSection(active.id as string);
    if (!sourceSection) return;

    if (sourceSection.id === destSection.id) {
      const oldIndex = sourceSection.widgetIds.indexOf(active.id as string);
      const newIndex =
        over.id === destSection.id
          ? destSection.widgetIds.length
          : destSection.widgetIds.indexOf(over.id as string);

      if (oldIndex !== newIndex && newIndex !== -1) {
        setLocalConfig((prev) => {
          if (!prev) return null;
          const newLayouts = [...prev.layouts];
          const sections = newLayouts[layoutIndex].sections || [];
          const sec = sections.find(
            (s) => s.id === sourceSection.id,
          );
          if (sec) sec.widgetIds = arrayMove(sec.widgetIds, oldIndex, newIndex);
          newLayouts[layoutIndex].sections = sections;
          return { ...prev, layouts: newLayouts };
        });
        setHasUnsavedChanges(true);
      }
    } else {
      setLocalConfig((prev) => {
        if (!prev) return null;
        const newLayouts = [...prev.layouts];
        const sections = newLayouts[layoutIndex].sections || [];
        const srcSec = sections.find(
          (s) => s.id === sourceSection.id,
        );
        const dstSec = sections.find(
          (s) => s.id === destSection.id,
        );

        if (srcSec && dstSec) {
          srcSec.widgetIds = srcSec.widgetIds.filter((id) => id !== active.id);

          if (over.id === dstSec.id) {
            dstSec.widgetIds.push(active.id as string);
          } else {
            const overIndex = dstSec.widgetIds.indexOf(over.id as string);
            const newIndex =
              overIndex >= 0 ? overIndex : dstSec.widgetIds.length;
            dstSec.widgetIds.splice(newIndex, 0, active.id as string);
          }
        }
        newLayouts[layoutIndex].sections = sections;
        return { ...prev, layouts: newLayouts };
      });
      setHasUnsavedChanges(true);
    }
  };

  const handleWidgetUpdate = (
    widgetId: string,
    updates: Partial<WidgetConfig>,
  ) => {
    if (!localConfig) return;
    setLocalConfig((prev) => {
      if (!prev) return null;
      const currentWidget = prev.widgets[widgetId];
      const updatedWidget = { ...currentWidget, ...updates };

      if (updates.settings && currentWidget.settings) {
        updatedWidget.settings = {
          ...currentWidget.settings,
          ...updates.settings,
        };
      }

      if (updates.chartConfig && currentWidget.chartConfig) {
        updatedWidget.chartConfig = {
          ...currentWidget.chartConfig,
          ...updates.chartConfig,
          ...(updates.chartConfig.tooltip
            ? {
                tooltip: {
                  ...currentWidget.chartConfig.tooltip,
                  ...updates.chartConfig.tooltip,
                },
              }
            : {}),
        };
      } else if (updates.chartConfig) {
        updatedWidget.chartConfig = updates.chartConfig;
      }
      return {
        ...prev,
        widgets: { ...prev.widgets, [widgetId]: updatedWidget },
      };
    });
    setHasUnsavedChanges(true);
  };

  // --- SAFE LAYOUT ACCESS ---
  const validLayouts = Array.isArray(localConfig?.layouts) ? localConfig.layouts : [];
  const rawActiveLayout = validLayouts.find((l) => l.id === activeLayoutId) || validLayouts[0];
  const activeLayout = rawActiveLayout
    ? {
        ...rawActiveLayout,
        sections: Array.isArray(rawActiveLayout.sections)
          ? rawActiveLayout.sections
          : [],
      }
    : undefined;

  const selectedWidget =
    selectedWidgetId && localConfig && localConfig.widgets
      ? localConfig.widgets[selectedWidgetId]
      : null;

  const variants = selectedWidget ? getChartVariants(selectedWidget.type) : [];
  const parentSection = activeLayout?.sections.find((s) => s.widgetIds.includes(selectedWidgetId || ""));
  const maxCols = parentSection?.columns || 4;

  // --- LOGIC FILTERING HELPER (Now uses merged list) ---
  const getCompatibleLogic = (widgetType: string) => {
      const template = WIDGET_TEMPLATES.find(t => t.type === widgetType);
      if (!template || !template.supportedLogic) return mergedLogicLibrary; 
      return mergedLogicLibrary.filter(logic => template.supportedLogic.includes(logic.type));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* Header Card */}
        <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl group">
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
          <CardHeader className="relative z-10 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-blue-600" />
                  {t("dashboard.builder.title")}
                </CardTitle>
                {hasUnsavedChanges && (
                  <Badge
                    variant="destructive"
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    {t("dashboard.builder.unsaved")}
                  </Badge>
                )}
                {isProtectedLayout && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="flex items-center gap-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                          data-testid="badge-protected-layout"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {t("dashboard.builder.builtIn")}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("dashboard.builder.builtInTooltip")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        disabled={!hasUnsavedChanges}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" /> {t("dashboard.builder.reset")}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t("dashboard.builder.discardChanges")}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  size="sm"
                  onClick={() => saveMutation.mutate(localConfig!)}
                  disabled={!hasUnsavedChanges}
                >
                  <Save className="mr-2 h-4 w-4" /> {t("common.save")}
                </Button>
                {/* Decorative Background Icon */}
                <LayoutDashboard
                  className="absolute right-60 top-1/2 h-36 w-36 text-blue-500/5 dark:text-white/5 pointer-events-none"
                  style={{ transform: "translateY(-50%) rotate(-12deg)" }}
                />
                </div>
            </div>
            <CardDescription>
              {t("dashboard.builder.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 pb-2 relative z-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-md border dark:border-slate-700">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 ml-2 whitespace-nowrap shrink-0">
                  {t("dashboard.builder.layoutLabel")}
                </span>
                <Select
                  value={activeLayoutId}
                  onValueChange={setActiveLayoutId}
                >
                  <SelectTrigger className="h-8 border-none bg-white dark:bg-gray-800 shadow-sm font-semibold w-[180px]">
                    <SelectValue placeholder={t("dashboard.builder.selectLayout")} />
                  </SelectTrigger>
                  <SelectContent>
                    {localConfig?.layouts.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <DropdownMenu>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("dashboard.builder.layoutActions")}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>{t("dashboard.builder.layoutActions")}</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => setIsNewLayoutDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" /> {t("dashboard.builder.newDashboardLayout")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {}}
                      disabled
                      className="text-red-600"
                      data-testid="menu-delete-current-layout"
                      title={
                        isProtectedLayout
                          ? t("dashboard.builder.builtInCannotDelete")
                          : undefined
                      }
                    >
                      {t("dashboard.builder.deleteCurrent")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-md border dark:border-slate-700">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 ml-2 whitespace-nowrap shrink-0">
                  {t("dashboard.builder.rolesLabel")}
                </span>
                <Popover open={isRolesPopoverOpen} onOpenChange={setIsRolesPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-8 border-none bg-white dark:bg-gray-800 shadow-sm font-medium w-[200px] justify-between"
                    >
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {layoutRoles.includes("all") ? (
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                            {t("dashboard.builder.allRoles")}
                          </span>
                        ) : roles.length === 0 ? (
                          <span className="text-slate-400 text-sm">
                            {t("dashboard.builder.rolesSelected", { count: layoutRoles.length })}
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 overflow-hidden">
                            {layoutRoles.slice(0, 2).map((roleId) => {
                              const role = getRoleById(roleId);
                              return role ? (
                                <Badge
                                  key={roleId}
                                  className="h-5 px-1.5 text-[10px] flex items-center gap-1"
                                  style={{ backgroundColor: role.color, color: "white" }}
                                >
                                  {role.icon && <DynamicIcon name={role.icon} className="h-2.5 w-2.5" />}
                                  {role.name}
                                </Badge>
                              ) : (
                                <Badge key={roleId} variant="outline" className="h-5 px-1.5 text-[10px]">
                                  {roleId}
                                </Badge>
                              );
                            })}
                            {layoutRoles.length > 2 && (
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                                +{layoutRoles.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-2" align="start">
                    <div className="space-y-1">
                      <div
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          layoutRoles.includes("all") ? "bg-blue-50 dark:bg-blue-950" : ""
                        }`}
                        onClick={() => handleRoleToggle("all")}
                      >
                        <Checkbox checked={layoutRoles.includes("all")} />
                        <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        <span className="text-sm font-medium">{t("dashboard.builder.allRoles")}</span>
                      </div>
                      <Separator className="my-2" />
                      {roles.map((role) => {
                        const roleIdStr = String(role.id);
                        return (
                          <div
                            key={role.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                              isRoleSelected(roleIdStr) || isRoleSelected(role.name) ? "bg-blue-50 dark:bg-blue-950" : ""
                            }`}
                            onClick={() => handleRoleToggle(roleIdStr)}
                          >
                            <Checkbox checked={isRoleSelected(roleIdStr) || isRoleSelected(role.name)} />
                            <div
                              className="h-5 w-5 rounded flex items-center justify-center"
                              style={{ backgroundColor: role.color }}
                            >
                              {role.icon && <DynamicIcon name={role.icon} className="h-3 w-3 text-white" />}
                            </div>
                            <span className="text-sm">{role.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-md border dark:border-slate-700">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 ml-2 whitespace-nowrap shrink-0">
                  {t("dashboard.builder.targetPageLabel")}
                </span>
                <Select value={targetPageKey} onValueChange={setTargetPageKey}>
                  <SelectTrigger className="h-8 border-none bg-white dark:bg-gray-800 shadow-sm font-medium w-[200px]">
                    <SelectValue placeholder={t("dashboard.builder.selectTargetPage")} />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(groupedPages).map(([category, pages]) => (
                      <div key={category}>
                        <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                          {category}
                        </div>
                        {pages.map((page) => (
                          <SelectItem
                            key={page.key}
                            value={page.key}
                            className="pl-9 pr-2 cursor-pointer"
                          >
                            {page.label}
                          </SelectItem>
                        ))}
                        <DropdownMenuSeparator />
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Builder Workspace */}
        <div className="flex h-[calc(100vh-320px)] min-h-[500px] border dark:border-gray-800 rounded-lg overflow-hidden bg-slate-50 dark:bg-gray-900 shadow-sm">
          {/* Widget Library Sidebar */}
          <Card className="w-72 rounded-none rounded-l-lg border-0 border-r flex flex-col">
            <CardHeader className="p-4 pb-0 space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BookMarked className="h-4 w-4" /> {t("dashboard.builder.widgetLibrary")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-3 flex-1 flex flex-col">
              <div className="flex gap-1 mb-3">
                <Button
                  variant={widgetLibraryFilter === "default" ? "default" : "ghost"}
                  size="sm"
                  className={`flex-1 h-8 text-xs ${widgetLibraryFilter === "default" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  onClick={() => setWidgetLibraryFilter("default")}
                >
                  <SquareAsterisk className="h-3.5 w-3.5 mr-1.5" />
                  {t("dashboard.builder.filterDefault")}
                </Button>
                <Button
                  variant={widgetLibraryFilter === "custom" ? "default" : "ghost"}
                  size="sm"
                  className={`flex-1 h-8 text-xs ${widgetLibraryFilter === "custom" ? "bg-purple-600 hover:bg-purple-700" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  onClick={() => setWidgetLibraryFilter("custom")}
                >
                  <SquareBottomDashedScissors className="h-3.5 w-3.5 mr-1.5" />
                  {t("dashboard.builder.filterCustom")}
                </Button>
              </div>
              <ScrollArea className="flex-1 -mx-2 px-2">
                {WIDGET_TEMPLATES
                  .filter((t) => widgetLibraryFilter === "default" ? !t.isCustom : t.isCustom)
                  .map((t) => (
                    <DraggableLibraryItem key={t.type} template={t} />
                  ))}
              </ScrollArea>
            </CardContent>
          </Card>

          <main className="flex-1 overflow-auto p-8 bg-slate-100/50 dark:bg-gray-900/50">
            <div className="mx-auto max-w-[1400px] space-y-4">
              {activeLayout?.sections.map((section) => (
                <DashboardSection
                  key={section.id}
                  section={section}
                  activeLayout={activeLayout}
                  localConfig={localConfig!}
                  selectedWidgetId={selectedWidgetId}
                  onSelectWidget={setSelectedWidgetId}
                  onUpdateSection={handleUpdateSection}
                  onDeleteSection={handleDeleteSection}
                  onDeleteWidget={handleDeleteWidget}
                  logicLibrary={mergedLogicLibrary} 
                />
              ))}
              <Button
                variant="outline"
                className="w-full border-dashed py-8 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                onClick={handleAddSection}
              >
                <Plus className="h-5 w-5 mr-2" /> {t("dashboard.builder.addNewSectionRow")}
              </Button>
            </div>
          </main>

          {/* Widget Properties Sidebar */}
          <Card className="w-72 rounded-none rounded-r-lg border-0 border-l flex flex-col">
            <CardHeader className="p-4 pb-0 space-y-0">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <RectangleEllipsis className="h-4 w-4" /> {t("dashboard.builder.widgetProperties")}
              </CardTitle>
            </CardHeader>
            {selectedWidget ? (
              <CardContent className="p-4 pt-3 flex-1 overflow-hidden">
                <ScrollArea className="h-full -mx-1 px-1">
                  <div className="space-y-6 w-full max-w-full px-1">
                  {/* IDENTITY */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <Type className="h-3 w-3" /> {t("dashboard.builder.identity")}
                    </div>
                    {/* Title */}
                    <div className="space-y-2">
                      <Label className="text-xs">{t("dashboard.builder.widgetTitle")}</Label>
                      <Input
                        value={selectedWidget.title}
                        onChange={(e) =>
                          handleWidgetUpdate(selectedWidget.id, {
                            title: e.target.value,
                          })
                        }
                        className="h-8"
                      />
                    </div>

                    {/* Title Font Size & Weight - Side by Side */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">{t("dashboard.builder.fontSize")}</Label>
                        <Select
                          value={selectedWidget.settings?.titleFontSize || "xl"}
                          onValueChange={(val) =>
                            handleWidgetUpdate(selectedWidget.id, {
                              settings: {
                                ...selectedWidget.settings,
                                titleFontSize: val as any,
                              },
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="xs">XS</SelectItem>
                            <SelectItem value="sm">SM</SelectItem>
                            <SelectItem value="base">Base</SelectItem>
                            <SelectItem value="lg">LG</SelectItem>
                            <SelectItem value="xl">XL</SelectItem>
                            <SelectItem value="2xl">2XL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("dashboard.builder.fontWeight")}</Label>
                        <Select
                          value={selectedWidget.settings?.titleFontWeight || "bold"}
                          onValueChange={(val) =>
                            handleWidgetUpdate(selectedWidget.id, {
                              settings: {
                                ...selectedWidget.settings,
                                titleFontWeight: val as any,
                              },
                            })
                          }
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="thin">{t("dashboard.builder.fontWeightThin")}</SelectItem>
                            <SelectItem value="extralight">{t("dashboard.builder.fontWeightExtraLight")}</SelectItem>
                            <SelectItem value="light">{t("dashboard.builder.fontWeightLight")}</SelectItem>
                            <SelectItem value="normal">{t("dashboard.builder.fontWeightNormal")}</SelectItem>
                            <SelectItem value="medium">{t("dashboard.builder.fontWeightMedium")}</SelectItem>
                            <SelectItem value="semibold">{t("dashboard.builder.fontWeightSemibold")}</SelectItem>
                            <SelectItem value="bold">{t("dashboard.builder.fontWeightBold")}</SelectItem>
                            <SelectItem value="extrabold">{t("dashboard.builder.fontWeightExtraBold")}</SelectItem>
                            <SelectItem value="black">{t("dashboard.builder.fontWeightBlack")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Title Color */}
                    <ColorPicker
                      label={t("dashboard.builder.titleColor")}
                      value={selectedWidget.settings?.titleColor || "#1e293b"}
                      onChange={(color) =>
                        handleWidgetUpdate(selectedWidget.id, {
                          settings: {
                            ...selectedWidget.settings,
                            titleColor: color,
                          },
                        })
                      }
                    />

                    {/* Icon */}
                    <div className="space-y-2">
                      <Label className="text-xs">{t("dashboard.builder.icon")}</Label>
                      <LucideIconPicker
                        value={selectedWidget.iconName || ""}
                        onChange={(iconName) =>
                          handleWidgetUpdate(selectedWidget.id, { iconName })
                        }
                      />
                    </div>

                    {/* Icon Color */}
                    <ColorPicker
                      label={t("dashboard.builder.iconColor")}
                      value={resolveIconColor(
                        selectedWidget.settings?.colorScheme?.[0],
                      )}
                      onChange={(color) =>
                        handleWidgetUpdate(selectedWidget.id, {
                          settings: {
                            ...selectedWidget.settings,
                            colorScheme: [color],
                          },
                        })
                      }
                    />
                  </div>
                  <Separator />

                  {/* DATA LOGIC (NEW SECTION) */}
                  <div className="space-y-3 bg-blue-50/50 dark:bg-blue-950/80 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
                     <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                        <Database className="h-3 w-3" /> {t("dashboard.builder.dataLogic")}
                     </div>
                     <div className="space-y-2">
                        <Label className="text-xs">{t("dashboard.builder.connectLogicLine")}</Label>
                        <Select 
                           value={selectedWidget.dataSource || ""} 
                           onValueChange={(val) => handleWidgetUpdate(selectedWidget.id, { dataSource: val })}
                        >
                           <SelectTrigger className="h-8 bg-white dark:bg-gray-800"><SelectValue placeholder={t("dashboard.builder.selectMetric")} /></SelectTrigger>
                           <SelectContent>
                              {getCompatibleLogic(selectedWidget.type).map(logic => (
                                 <SelectItem key={logic.id} value={logic.id}>
                                    <div className="flex flex-col">
                                       <span className="font-medium">{logic.label}</span>
                                       <span className="text-[10px] text-slate-400">{logic.desc}</span>
                                    </div>
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  </div>
                  <Separator />

                  {/* LAYOUT */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <Grid3X3 className="h-3 w-3" /> {t("dashboard.builder.layout")}
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {t("dashboard.builder.widthCols", { maxCols })}
                      </Label>
                      <Select
                        value={String(
                          Math.min(selectedWidget.gridColSpan || 1, maxCols),
                        )}
                        onValueChange={(val) =>
                          handleWidgetUpdate(selectedWidget.id, {
                            gridColSpan: parseInt(val) as any,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: maxCols }, (_, i) => i + 1).map(
                            (size) => (
                              <SelectItem key={size} value={String(size)}>
                                {t("dashboard.builder.widthUnit", { size, pct: Math.round((size / maxCols) * 100) })}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">{t("dashboard.builder.height")}</Label>
                      <Select
                        value={String(selectedWidget.gridRowSpan || 1)}
                        onValueChange={(val) =>
                          handleWidgetUpdate(selectedWidget.id, {
                            gridRowSpan: parseInt(val) as any,
                          })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{t("dashboard.builder.heightStandard")}</SelectItem>
                          <SelectItem value="2">{t("dashboard.builder.heightTall")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Separator />

                  {/* CHART OPTIONS */}
                  {selectedWidget.type !== "kpi_strip" && (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <Sliders className="h-3 w-3" /> {t("dashboard.builder.chartOptions")}
                        </div>
                        {variants.length > 0 ? (
                          <div className="space-y-2">
                            <Label className="text-xs">{t("dashboard.builder.subType")}</Label>
                            <Select
                              value={
                                selectedWidget.chartConfig?.variant || "default"
                              }
                              onValueChange={(val) =>
                                handleWidgetUpdate(selectedWidget.id, {
                                  chartConfig: {
                                    ...selectedWidget.chartConfig,
                                    variant: val,
                                  },
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {variants.map((v) => (
                                  <SelectItem key={v.value} value={v.value}>
                                    {v.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 dark:text-slate-500 italic">
                            {t("dashboard.builder.noVariants")}
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label className="text-xs">{t("dashboard.builder.tooltipStyle")}</Label>
                          <Select
                            value={
                              selectedWidget.chartConfig?.tooltip?.indicator ||
                              "default"
                            }
                            onValueChange={(val) =>
                              handleWidgetUpdate(selectedWidget.id, {
                                chartConfig: {
                                  ...selectedWidget.chartConfig,
                                  tooltip: {
                                    ...selectedWidget.chartConfig?.tooltip,
                                    indicator: val as any,
                                  },
                                },
                              })
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">{t("dashboard.builder.tooltipDefault")}</SelectItem>
                              <SelectItem value="line">{t("dashboard.builder.tooltipLine")}</SelectItem>
                              <SelectItem value="dashed">{t("dashboard.builder.tooltipDashed")}</SelectItem>
                              <SelectItem value="none">{t("dashboard.builder.tooltipHidden")}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}

                  {/* DISPLAY SETTINGS */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <Settings className="h-3 w-3" /> {t("dashboard.builder.display")}
                    </div>
                    <div className="flex items-center justify-between">
                      <Label
                        className="text-xs cursor-pointer"
                        htmlFor="show-legend"
                      >
                        {t("dashboard.builder.showLegend")}
                      </Label>
                      <Switch
                        id="show-legend"
                        checked={selectedWidget.settings?.showLegend || false}
                        onCheckedChange={(checked) =>
                          handleWidgetUpdate(selectedWidget.id, {
                            settings: {
                              ...selectedWidget.settings,
                              showLegend: checked,
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  </div>
                </ScrollArea>
              </CardContent>
            ) : (
              <CardContent className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs relative">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <LayoutDashboard className="h-[120px] w-[120px] text-slate-200 dark:text-slate-700 opacity-40" />
                </div>
                <span className="relative z-10">{t("dashboard.builder.selectWidgetToEdit")}</span>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
      <DragOverlay>
        {activeDragItem && (
          <div className="p-3 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-xl opacity-90 w-48 flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-50 dark:bg-blue-950 rounded flex items-center justify-center text-blue-600 dark:text-blue-400">
              <DynamicIcon name="Box" className="h-5 w-5" />
            </div>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {t("dashboard.builder.movingWidget")}
            </span>
          </div>
        )}
      </DragOverlay>
      <Dialog
        open={isNewLayoutDialogOpen}
        onOpenChange={setIsNewLayoutDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5" />
              {t("dashboard.builder.createNewLayout")}
            </DialogTitle>
            <DialogDescription>{t("dashboard.builder.createNewLayoutDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("dashboard.builder.layoutName")}</Label>
              <Input
                placeholder={t("dashboard.builder.layoutNamePlaceholder")}
                value={newLayoutName}
                onChange={(e) => setNewLayoutName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("common.role")}</Label>
              <Popover open={isRolePopoverOpen} onOpenChange={setIsRolePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-10 font-normal"
                  >
                    {newLayoutRole === "all" ? (
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-slate-500" />
                        <span>{t("dashboard.builder.allRoles")}</span>
                      </div>
                    ) : (
                      (() => {
                        const selectedRole = roles.find(r => String(r.id) === newLayoutRole);
                        return selectedRole ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="h-5 w-5 rounded flex items-center justify-center"
                              style={{ backgroundColor: selectedRole.color }}
                            >
                              {selectedRole.icon && <DynamicIcon name={selectedRole.icon} className="h-3 w-3 text-white" />}
                            </div>
                            <span>{selectedRole.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t("dashboard.builder.selectRole")}</span>
                        );
                      })()
                    )}
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-2" align="start">
                  <div className="space-y-1">
                    <div
                      className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                        newLayoutRole === "all" ? "bg-blue-50 dark:bg-blue-950" : ""
                      }`}
                      onClick={() => { setNewLayoutRole("all"); setIsRolePopoverOpen(false); }}
                    >
                      <ShieldCheck className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                      <span className="text-sm font-medium">{t("dashboard.builder.allRoles")}</span>
                    </div>
                    <Separator className="my-2" />
                    {roles.map((role) => (
                      <div
                        key={role.id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          newLayoutRole === String(role.id) ? "bg-blue-50 dark:bg-blue-950" : ""
                        }`}
                        onClick={() => { setNewLayoutRole(String(role.id)); setIsRolePopoverOpen(false); }}
                      >
                        <div
                          className="h-5 w-5 rounded flex items-center justify-center"
                          style={{ backgroundColor: role.color }}
                        >
                          {role.icon && <DynamicIcon name={role.icon} className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-sm">{role.name}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.builder.targetPage")}</Label>
              <Select value={newLayoutTargetPage} onValueChange={setNewLayoutTargetPage}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={t("dashboard.builder.selectTargetPage")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="standalone" className="pl-4 pr-2 cursor-pointer font-medium">
                    {t("dashboard.builder.noTargetPage")}
                  </SelectItem>
                  <DropdownMenuSeparator />
                  {Object.entries(groupedPages).map(([category, pages]) => (
                    <div key={category}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        {category}
                      </div>
                      {pages.map((page) => (
                        <SelectItem
                          key={page.key}
                          value={page.key}
                          className="pl-9 pr-2 cursor-pointer"
                        >
                          {page.label}
                        </SelectItem>
                      ))}
                      <DropdownMenuSeparator />
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsNewLayoutDialogOpen(false)}
            >
              <X className="h-4 w-4 mr-2" />
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!localConfig || !newLayoutName.trim()) return;

                const newLayoutId = `layout-${Date.now()}`;
                const newLayout = {
                  id: newLayoutId,
                  name: newLayoutName.trim(),
                  role: newLayoutRole === "all" ? "All" : newLayoutRole,
                  roles: newLayoutRole === "all" ? ["all"] : [newLayoutRole],
                  targetPage: newLayoutTargetPage,
                  sections: []
                };

                setLocalConfig(prev => prev ? {
                  ...prev,
                  layouts: [...prev.layouts, newLayout]
                } : null);

                setActiveLayoutId(newLayoutId);
                setHasUnsavedChanges(true);
                setIsNewLayoutDialogOpen(false);

                setNewLayoutName("");
                setNewLayoutRole("all");
                setNewLayoutTargetPage("standalone");

                showSuccessToast(t("dashboard.builder.layoutCreatedTitle"), t("dashboard.builder.layoutCreatedDescription", { name: newLayout.name }));
              }}
              disabled={!newLayoutName}
            >
              <LayoutDashboard className="h-4 w-4 mr-2" />
              {t("dashboard.builder.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        title={t("dashboard.builder.resetTitle")}
        description={t("dashboard.builder.resetDescription")}
        confirmLabel={t("dashboard.builder.reset")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmReset}
        variant="default"
      />
      <ConfirmationDialog
        open={isDeleteSectionDialogOpen}
        onOpenChange={setIsDeleteSectionDialogOpen}
        title={t("dashboard.builder.deleteSectionTitle")}
        description={t("dashboard.builder.deleteSectionDescription")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDeleteSection}
        variant="destructive"
      />
    </DndContext>
  );
}