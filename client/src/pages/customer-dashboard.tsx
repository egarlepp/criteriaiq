import { SolutionGraphic } from "@/components/ui/solution-graphic";
import { useEffect, useState, useMemo, type ElementType } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast, showInfoToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { useCustomerStatusConfigRealtime } from "@/hooks/useConfigRealtime";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SortableTable,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
  SortableTableHead,
} from "@/components/ui/sortable-table";
import {
  SortConfig,
  useSortState,
  stableSort,
  makeComparator,
} from "@/lib/sorting";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ACCOUNT_PORTAL_SECTION, accountPortalAccess, normalizeLevel } from "@shared/permissions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Customer, Industry, User } from "@shared/schema";
import {
  formatDateForDisplay,
  getStartDateStatus,
  getDateStatus,
  parseProjectDate,
  getTodayInTimezone,
  calculateDaysDiff,
} from "@/lib/date-utils";
import { Header } from "@/components/layout/header";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { FolderOpen, Upload, Download, Trash2, Contact, X, MonitorCloud, type LucideIcon } from "lucide-react";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { format } from "date-fns";
import { UploadDocumentDialog } from "@/components/artifacts/UploadDocumentDialog";
import EvaluationRequestDialog from "@/components/requests/EvaluationRequestDialog";
import { PortalResourceCards } from "@/components/resource-content/PortalResourceCards";

interface UserPermission {
  id: number;
  userId: string;
  sectionName: string;
  accessLevel: string;
}

interface StatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
}

interface CustomerStatusConfig {
  id: number;
  name: string;
  color: string;
  icon?: string;
}
import { AccountAccessDrawer } from "@/components/customer-workspace/AccountAccessDrawer";
import { PortalProjectCardsGrid } from "@/components/customer-workspace/PortalProjectCardsGrid";
import { CUSTOMER_STATUS_NEUTRAL_FALLBACK } from "@/lib/customerStatusUtils";
import {
  Building2,
  Briefcase,
  MapPin,
  Globe,
  Eye,
  Edit,
  Search,
  Calendar,
  ExternalLink,
  Users,
  ChartColumn,
  ScanSearch,
  Target,
  TrendingUp,
  HelpCircle,
  MessageSquare,
  MonitorCog,
  AppWindow,
  EarthLock,
  Waypoints,
  CalendarHeart,
  CalendarClock,
  CalendarX2,
  Package,
  UserSearch,
  FileText,
  Mail,
  LayoutGrid,
  Settings,
  BookOpen,
  GraduationCap,
  Headphones,
  ClipboardCheck,
  Video,
  FileDown,
  ChevronDown,
  ChevronRight,
  BookMarked,
  File,
  PlayCircle,
  Cloud,
  Link as LinkIcon,
  FileArchive,
  Star,
  Code,
  Terminal,
  Braces,
  Database,
  FileCode,
  Copy,
  Handshake,
  Timer,
  CheckCircle2,
  ArrowRight,
  Swords,
  LineChart,
  FileSpreadsheet,
  StickyNote,
  Trophy,
  MonitorPlay,
  FolderKanban,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import {
  LabelWithHelp,
  SectionHeaderWithHelp,
} from "@/components/shared/contextual-help";
import RequestsActionButton from "@/components/requests/RequestsActionButton";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import {
  SearchFiltersSection,
  FilterLabel,
  FilterMultiSelectButton,
} from "@/components/ui/search-filters-section";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import type { DateClickData } from "@/components/dashboard-widgets/ProjectSchedulesWidget";
import { ProjectCard } from "@/components/shared/ProjectCard";
import { cn } from "@/lib/utils";
import { ACCOUNT_PORTAL_LINKS_KEY } from "@/components/configuration/AccountPortalSettingsSection";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { AccountPortalHero } from "@/components/accounts/AccountPortalHero";
import { HERO_TAB_CLASS, HERO_TABS_LIST_CLASS } from "@/components/project-detail/ProjectHero";
import { PortalWorkspaceHome } from "@/components/customer-workspace/PortalWorkspaceHome";
import { isClosedProjectStatus } from "@/components/customer-workspace/workspace-utils";
import type { CustomerActionRow } from "@/lib/customer-actions";
import { CUSTOMER_ACTIONS_MAX_PROJECTS } from "@shared/customer-actions";

interface ProjectData {
  id: number;
  name?: string;
  customerName: string;
  businessProblem: string;
  solutionName: string;
  status: string;
  customerStatus?: string;
  startDate: string;
  endDate: string;
  progress?: number;
  updatedAt?: string;
  tags?: string[] | null;
  statusConfig?: { name: string; color: string; icon?: string };
  primaryEngineerId?: string;
  primarySe?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  specialistEngineerId?: string;
  specialistSe?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;
  supportingEngineers?: string[];
  additionalAccess?: Array<{
    userId?: string;
    userEmail?: string;
    permission?: "edit" | "view" | "read" | "none";
  }>;
  successCriteria?: Array<{
    id: number;
    status?: string;
    isActive?: boolean;
  }>;
  customerObjective?: string;
  policyConsiderations?: string;
}

// --- NEW HELPER FUNCTIONS FOR DARK MODE ---
const getLighterBg = (hexColor: string) => {
  if (!hexColor) hexColor = "#6b7280"; // Fallback color
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const lighter = (val: number) => Math.round(val + (255 - val) * 0.95); // 95% lighter
  return `rgb(${lighter(r)}, ${lighter(g)}, ${lighter(b)})`;
};

const getDarkerBg = (hexColor: string) => {
  if (!hexColor) hexColor = "#6b7280"; // Fallback color
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Blend with gray-800 (31, 41, 55)
  const darkR = Math.round(r * 0.1 + 31 * 0.9);
  const darkG = Math.round(g * 0.1 + 41 * 0.9);
  const darkB = Math.round(b * 0.1 + 55 * 0.9);
  return `rgb(${darkR}, ${darkG}, ${darkB})`;
};

const getDarkerText = (hexColor: string) => {
  if (!hexColor) hexColor = "#6b7280"; // Fallback color
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // 60% darker
  const darkR = Math.round(r * 0.4);
  const darkG = Math.round(g * 0.4);
  const darkB = Math.round(b * 0.4);
  return `rgb(${darkR}, ${darkG}, ${darkB})`;
};

const isColorLight = (hexColor: string) => {
  if (!hexColor) return false;
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Standard luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};
// --- END HELPER FUNCTIONS ---

// ─── LiveProjectCard ────────────────────────────────────────────────────────
interface LiveProjectCardProps {
  project: ProjectData;
  salesRep: any | null;
  statusConfig: { name: string; color: string; icon?: string } | undefined;
  customerStatusConfig: { name: string; color: string; icon?: string } | undefined;
  getProductInfo: (name: string) => { name: string; icon?: string | null; iconName?: string | null };
  formatDate: (d: string) => string;
  getProjectAccessLevel: (project: any) => "edit" | "view" | "read" | "none";
  user: any;
  showInternalStatus: boolean;
  onOpenPlan: (projectId: number, accessLevel: string) => void;
  onViewDetails: (projectId: number) => void;
  onOpenMessages: (projectId: number) => void;
  unreadMessages: number;
  onOpenAccess: (projectId: number) => void;
}

function LiveProjectCard({
  project,
  salesRep: _salesRep,
  statusConfig,
  customerStatusConfig,
  getProductInfo,
  formatDate: _formatDate,
  getProjectAccessLevel,
  user: _user,
  showInternalStatus,
  onOpenPlan,
  onViewDetails,
  onOpenMessages,
  unreadMessages,
  onOpenAccess,
}: LiveProjectCardProps) {
  const { t } = useTranslation();

  const progressValue = (() => {
    if (project.progress != null) return project.progress;
    const s = (project.status || "").toLowerCase();
    if (s.includes("planning")) return 10;
    if (s.includes("progress")) return 40;
    if (s.includes("tcc")) return 75;
    if (s.includes("complete")) return 90;
    return 25;
  })();

  const accessLevel = getProjectAccessLevel(project);
  const criteriaForCard = project.successCriteria?.map((c) => ({
    isActive: c.isActive,
    status: c.status,
  })) ?? [];

  return (
    <ProjectCard
      project={{
        id: project.id,
        name: project.name,
        businessProblem: project.businessProblem,
        customerObjective: project.customerObjective ?? null,
        policyConsiderations: project.policyConsiderations ?? null,
        customerName: project.customerName,
        solutionName: project.solutionName,
        status: project.status,
        customerStatus: project.customerStatus,
        endDate: project.endDate,
        progress: progressValue,
        successCriteria: criteriaForCard,
        tags: project.tags ?? null,
      }}
      statusConfig={statusConfig}
      customerStatusConfig={customerStatusConfig}
      onViewProject={onViewDetails}
      onViewPlan={accessLevel !== "none" ? (id) => onOpenPlan(id, accessLevel) : undefined}
      planLabel={t("accountPortal.viewMAP")}
      planDisabled={accessLevel === "none"}
      onOpenMessages={onOpenMessages}
      unreadMessages={unreadMessages}
      onOpenAccess={onOpenAccess}
      accessLabel={t("accountPortal.access.cardButton")}
      eyebrow="name"
      getSolutionMark={(name) => { const info = getProductInfo(name); return { graphic: info.icon, icon: info.iconName }; }}
      showInternalStatus={showInternalStatus}
    />
  );
}
// ─── End LiveProjectCard ─────────────────────────────────────────────────────

// Account Portal FAQ: two columns; text lives under accountPortal.faq.<id>.
const CUSTOMER_FAQ_COLUMNS: ReadonlyArray<ReadonlyArray<{ id: string; icon: LucideIcon; iconClass: string }>> = [
  [
    { id: "gettingStarted", icon: HelpCircle, iconClass: "text-blue-500" },
    { id: "endDate", icon: Calendar, iconClass: "text-green-500" },
    { id: "teamMembers", icon: Users, iconClass: "text-purple-500" },
  ],
  [
    { id: "documentation", icon: FileText, iconClass: "text-orange-500" },
    { id: "contactEngineer", icon: MessageSquare, iconClass: "text-cyan-500" },
    { id: "validationCriteria", icon: ClipboardCheck, iconClass: "text-emerald-500" },
  ],
];

const PORTAL_TABS = ["overview", "projects-table", "resources", "cloudlabs"] as const;
type PortalTab = (typeof PORTAL_TABS)[number];

export default function CustomerDashboard() {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const validationRecordName = useValidationRecordLabel();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  // Customer, Partner and Guest never see Internal Project Status or
  // internal-only links (server/lib/internal-access.ts EXTERNAL_ROLES).
  const isExternalViewer = ["customer", "partner", "guest"].includes(user?.role?.toLowerCase() ?? "");
  const { data: portalLinks } = useQuery<{ internalPortalUrl: string }>({
    queryKey: ACCOUNT_PORTAL_LINKS_KEY,
    enabled: !!user && !isExternalViewer,
  });
  const internalPortalUrl = !isExternalViewer ? portalLinks?.internalPortalUrl ?? "" : "";
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Listen for real-time customer status config updates
  useCustomerStatusConfigRealtime();

  // State for customer selection and project filtering
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [customerStatusFilter, setCustomerStatusFilter] = useState("all");
  const [internalStatusFilter, setInternalStatusFilter] = useState("all");
  const [criteriaStatusFilter, setCriteriaStatusFilter] = useState("all");
  const [solutionFilter, setSolutionFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateClickData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showComplianceDialog, setShowComplianceDialog] = useState(false);
  const itemsPerPage = 10;

  // State for evaluation requests slide panel
  const [isEvaluationDialogOpen, setIsEvaluationDialogOpen] = useState(false);
  const [isAccountAccessDrawerOpen, setIsAccountAccessDrawerOpen] = useState(false);
  // Set when a project card's Account Users button opened the drawer.
  const [accessProjectId, setAccessProjectId] = useState<number | null>(null);
  
  // State for account overview tabbed card. `?tab=` opens a tab directly
  // (the customer workspace menu links Resources and Lab environments here).
  const search = useSearch();
  const tabFromUrl = useMemo(() => {
    const tab = new URLSearchParams(search).get("tab");
    return tab && PORTAL_TABS.includes(tab as PortalTab) ? (tab as PortalTab) : null;
  }, [search]);
  const [accountOverviewTab, setAccountOverviewTab] = useState<string>(tabFromUrl ?? "overview");
  useEffect(() => {
    if (tabFromUrl) setAccountOverviewTab(tabFromUrl);
  }, [tabFromUrl]);


  // State for the MAP drawer
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );
  const [selectedProjectAccessLevel, setSelectedProjectAccessLevel] = useState<
    "edit" | "view" | "read" | "none"
  >("edit");

  // State for document delete confirmation
  const [documentToDelete, setDocumentToDelete] = useState<{ id: number; name: string } | null>(null);

  // Delete document mutation
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete document");
      }
    },
    onSuccess: () => {
      toast({
        title: "Document deleted",
        description: "The document has been removed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      // Also invalidate customer-specific documents query used in the dashboard
      if (selectedCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", selectedCustomerId, "documents"] });
      }
      setDocumentToDelete(null);
    },
    onError: (error: Error) => {
      showErrorToast("Delete failed", error.message);
    },
  });

  // Sorting state
  const { sortConfig, handleSort } = useSortState({
    key: "id",
    direction: "desc",
  });

  // Calculate active filter count for SearchFiltersSection
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (customerStatusFilter !== "all") count++;
    if (internalStatusFilter !== "all") count++;
    if (criteriaStatusFilter !== "all") count++;
    if (solutionFilter.length > 0) count++;
    if (dateFilter) count++;
    return count;
  }, [searchTerm, customerStatusFilter, internalStatusFilter, criteriaStatusFilter, solutionFilter, dateFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setCustomerStatusFilter("all");
    setInternalStatusFilter("all");
    setCriteriaStatusFilter("all");
    setSolutionFilter([]);
    setDateFilter(null);
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      showWarningToast("Access Required", "Please log in to view your customer portal.");
      setTimeout(() => {
        setLocation("/");
      }, 500);
      return;
    }
  }, [isAuthenticated, authLoading, toast, setLocation]);

  // Fetch all customers to find user's assigned customer
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: isAuthenticated,
  });

  // Fetch projects that user has access to
  const { data: projects = [] } = useQuery<ProjectData[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  // Fetch industries for display
  const { data: industries = [] } = useQuery<Industry[]>({
    queryKey: ["/api/industries"],
    enabled: isAuthenticated,
  });

  // Fetch status configurations
  const { data: statusConfigs = [] } = useQuery<StatusConfig[]>({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
  });

  // Fetch customer status configurations for color mapping
  const { data: customerStatusConfigs = [] } = useQuery<CustomerStatusConfig[]>(
    {
      queryKey: ["/api/customer-status-configs"],
      enabled: isAuthenticated,
    },
  );

  // Fetch user permissions to determine customer portal access level
  const { data: userPermissions = [] } = useQuery<any[]>({
    queryKey: ["/api/user-permissions"],
    enabled: isAuthenticated,
  });

  // Fetch all users for Account Access display
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Fetch products for solution badge icons
  const { data: allProducts = [] } = useQuery<
    Array<{
      id: number;
      name: string;
      isActive: boolean;
      solutionIcon?: string; solutionIconName?: string | null;
    }>
  >({
    queryKey: ["/api/products"],
    staleTime: 0,
  });

  // Helper function to get product info (name and icon) from products database
  const getProductInfo = (solutionName: string) => {
    // Try exact match first
    let product = allProducts.find((p) => p.name === solutionName);

    // If no exact match, try case-insensitive match
    if (!product) {
      product = allProducts.find(
        (p) => p.name.toLowerCase() === solutionName.toLowerCase(),
      );
    }

    // If still no match, try partial matching (e.g., "Acme Auditor" matches "Auditor")
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = allProducts.find((p) => {
        const lowerProduct = p.name.toLowerCase();
        // Check if solution name contains product name or vice versa
        return (
          lowerSolution.includes(lowerProduct) ||
          lowerProduct.includes(lowerSolution)
        );
      });
    }

    // Return the current product name and icon from database, or fallback to template name
    return {
      name: product?.name || solutionName,
      icon: product?.solutionIcon,
      iconName: product?.solutionIconName ?? null,
    };
  };

  // Fetch compliance regulations data
  const { data: complianceRegulations = [] } = useQuery({
    queryKey: ["/api/compliance"],
    enabled: isAuthenticated,
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  // Fetch links for Resources tab
  const { data: allLinks = [] } = useQuery<any[]>({
    queryKey: ["/api/links"],
    enabled: isAuthenticated,
    staleTime: 300000,
  });

  // Fetch all documents for Resources tab
  const { data: allDocuments = [] } = useQuery<any[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    staleTime: 300000,
  });

  // Fetch all code scripts for Resources tab
  const { data: allCodeScripts = [] } = useQuery<any[]>({
    queryKey: ["/api/code-scripts"],
    enabled: isAuthenticated,
    staleTime: 300000,
  });

  // Link type icons mapping (matching links-section.tsx) with gradient backgrounds
  const linkTypeIcons: Record<string, { icon: ElementType; color: string; bgGradient: string; bgIconColor: string }> = {
    "Documentation": { icon: FileText, color: "text-cyan-500", bgGradient: "from-cyan-50/80 to-cyan-100/40 dark:from-cyan-950/40 dark:to-cyan-900/20", bgIconColor: "text-cyan-200 dark:text-cyan-800" },
    "Tutorial": { icon: GraduationCap, color: "text-indigo-500", bgGradient: "from-indigo-50/80 to-indigo-100/40 dark:from-indigo-950/40 dark:to-indigo-900/20", bgIconColor: "text-indigo-200 dark:text-indigo-800" },
    "Reference": { icon: BookMarked, color: "text-green-500", bgGradient: "from-green-50/80 to-green-100/40 dark:from-green-950/40 dark:to-green-900/20", bgIconColor: "text-green-200 dark:text-green-800" },
    "Product Info": { icon: Package, color: "text-purple-500", bgGradient: "from-purple-50/80 to-purple-100/40 dark:from-purple-950/40 dark:to-purple-900/20", bgIconColor: "text-purple-200 dark:text-purple-800" },
    "Support": { icon: Headphones, color: "text-pink-500", bgGradient: "from-pink-50/80 to-pink-100/40 dark:from-pink-950/40 dark:to-pink-900/20", bgIconColor: "text-pink-200 dark:text-pink-800" },
    "Demo": { icon: PlayCircle, color: "text-amber-500", bgGradient: "from-amber-50/80 to-amber-100/40 dark:from-amber-950/40 dark:to-amber-900/20", bgIconColor: "text-amber-200 dark:text-amber-800" },
    "Video": { icon: Video, color: "text-red-500", bgGradient: "from-red-50/80 to-red-100/40 dark:from-red-950/40 dark:to-red-900/20", bgIconColor: "text-red-200 dark:text-red-800" },
    "Download": { icon: Download, color: "text-teal-500", bgGradient: "from-teal-50/80 to-teal-100/40 dark:from-teal-950/40 dark:to-teal-900/20", bgIconColor: "text-teal-200 dark:text-teal-800" },
    "Architecture": { icon: Building2, color: "text-blue-500", bgGradient: "from-blue-50/80 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20", bgIconColor: "text-blue-200 dark:text-blue-800" },
    "CloudLAB": { icon: Cloud, color: "text-sky-500", bgGradient: "from-sky-50/80 to-sky-100/40 dark:from-sky-950/40 dark:to-sky-900/20", bgIconColor: "text-sky-200 dark:text-sky-800" },
    "Portal": { icon: Globe, color: "text-emerald-500", bgGradient: "from-emerald-50/80 to-emerald-100/40 dark:from-emerald-950/40 dark:to-emerald-900/20", bgIconColor: "text-emerald-200 dark:text-emerald-800" },
    "Battlecard": { icon: Swords, color: "text-orange-500", bgGradient: "from-orange-50/80 to-orange-100/40 dark:from-orange-950/40 dark:to-orange-900/20", bgIconColor: "text-orange-200 dark:text-orange-800" },
    "Analyst": { icon: LineChart, color: "text-teal-500", bgGradient: "from-teal-50/80 to-teal-100/40 dark:from-teal-950/40 dark:to-teal-900/20", bgIconColor: "text-teal-200 dark:text-teal-800" },
    "Website": { icon: Globe, color: "text-blue-500", bgGradient: "from-blue-50/80 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20", bgIconColor: "text-blue-200 dark:text-blue-800" },
    "Other": { icon: File, color: "text-slate-500", bgGradient: "from-slate-50/80 to-slate-100/40 dark:from-slate-950/40 dark:to-slate-900/20", bgIconColor: "text-slate-200 dark:text-slate-800" }
  };

  // Document type icons mapping with gradient backgrounds
  const documentTypeIcons: Record<string, { icon: ElementType; color: string; bgGradient: string; bgIconColor: string }> = {
    "Architecture": { icon: Building2, color: "text-blue-500", bgGradient: "from-blue-50/80 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20", bgIconColor: "text-blue-200 dark:text-blue-800" },
    "Product Info": { icon: Package, color: "text-purple-500", bgGradient: "from-purple-50/80 to-purple-100/40 dark:from-purple-950/40 dark:to-purple-900/20", bgIconColor: "text-purple-200 dark:text-purple-800" },
    "Visio": { icon: Waypoints, color: "text-orange-500", bgGradient: "from-orange-50/80 to-orange-100/40 dark:from-orange-950/40 dark:to-orange-900/20", bgIconColor: "text-orange-200 dark:text-orange-800" },
    "Reference": { icon: BookMarked, color: "text-green-500", bgGradient: "from-green-50/80 to-green-100/40 dark:from-green-950/40 dark:to-green-900/20", bgIconColor: "text-green-200 dark:text-green-800" },
    "Documentation": { icon: FileText, color: "text-cyan-500", bgGradient: "from-cyan-50/80 to-cyan-100/40 dark:from-cyan-950/40 dark:to-cyan-900/20", bgIconColor: "text-cyan-200 dark:text-cyan-800" },
    "Battlecard": { icon: Swords, color: "text-orange-500", bgGradient: "from-orange-50/80 to-orange-100/40 dark:from-orange-950/40 dark:to-orange-900/20", bgIconColor: "text-orange-200 dark:text-orange-800" },
    "Datasheet": { icon: FileSpreadsheet, color: "text-blue-500", bgGradient: "from-blue-50/80 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20", bgIconColor: "text-blue-200 dark:text-blue-800" },
    "Internal Notes": { icon: StickyNote, color: "text-yellow-500", bgGradient: "from-yellow-50/80 to-yellow-100/40 dark:from-yellow-950/40 dark:to-yellow-900/20", bgIconColor: "text-yellow-200 dark:text-yellow-800" },
    "Win/Loss Info": { icon: Trophy, color: "text-emerald-500", bgGradient: "from-emerald-50/80 to-emerald-100/40 dark:from-emerald-950/40 dark:to-emerald-900/20", bgIconColor: "text-emerald-200 dark:text-emerald-800" },
    "Demo Notes": { icon: MonitorPlay, color: "text-purple-500", bgGradient: "from-purple-50/80 to-purple-100/40 dark:from-purple-950/40 dark:to-purple-900/20", bgIconColor: "text-purple-200 dark:text-purple-800" },
    "Other": { icon: File, color: "text-slate-500", bgGradient: "from-slate-50/80 to-slate-100/40 dark:from-slate-950/40 dark:to-slate-900/20", bgIconColor: "text-slate-200 dark:text-slate-800" }
  };

  // Script type icons mapping with language-based colors
  const scriptTypeIcons: Record<string, { icon: ElementType; color: string; bgGradient: string; bgIconColor: string }> = {
    "PowerShell": { icon: Terminal, color: "text-blue-600", bgGradient: "from-blue-50/80 to-blue-100/40 dark:from-blue-950/40 dark:to-blue-900/20", bgIconColor: "text-blue-200 dark:text-blue-800" },
    "JavaScript": { icon: Braces, color: "text-yellow-500", bgGradient: "from-yellow-50/80 to-yellow-100/40 dark:from-yellow-950/40 dark:to-yellow-900/20", bgIconColor: "text-yellow-200 dark:text-yellow-800" },
    "Python": { icon: Code, color: "text-green-600", bgGradient: "from-green-50/80 to-green-100/40 dark:from-green-950/40 dark:to-green-900/20", bgIconColor: "text-green-200 dark:text-green-800" },
    "SQL": { icon: Database, color: "text-orange-500", bgGradient: "from-orange-50/80 to-orange-100/40 dark:from-orange-950/40 dark:to-orange-900/20", bgIconColor: "text-orange-200 dark:text-orange-800" },
    "JSON": { icon: Braces, color: "text-purple-500", bgGradient: "from-purple-50/80 to-purple-100/40 dark:from-purple-950/40 dark:to-purple-900/20", bgIconColor: "text-purple-200 dark:text-purple-800" },
    "Shell": { icon: Terminal, color: "text-slate-600", bgGradient: "from-slate-50/80 to-slate-100/40 dark:from-slate-950/40 dark:to-slate-900/20", bgIconColor: "text-slate-200 dark:text-slate-800" },
    "XML": { icon: FileCode, color: "text-cyan-500", bgGradient: "from-cyan-50/80 to-cyan-100/40 dark:from-cyan-950/40 dark:to-cyan-900/20", bgIconColor: "text-cyan-200 dark:text-cyan-800" },
    "YAML": { icon: FileCode, color: "text-pink-500", bgGradient: "from-pink-50/80 to-pink-100/40 dark:from-pink-950/40 dark:to-pink-900/20", bgIconColor: "text-pink-200 dark:text-pink-800" },
    "Other": { icon: Code, color: "text-slate-500", bgGradient: "from-slate-50/80 to-slate-100/40 dark:from-slate-950/40 dark:to-slate-900/20", bgIconColor: "text-slate-200 dark:text-slate-800" }
  };

  // State for Documents & Links section
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [documentsExpanded, setDocumentsExpanded] = useState(false);
  const [scriptsExpanded, setScriptsExpanded] = useState(false);
  const [flippedCards, setFlippedCards] = useState<Set<string>>(new Set());

  const toggleCardFlip = (cardId: string) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  // Handle card click - only flip if not clicking on an interactive element
  const handleCardClick = (e: React.MouseEvent, cardId: string) => {
    const target = e.target as HTMLElement;
    // Check if click originated from a button, link, or element marked as interactive
    if (target.closest('button, a, [data-interactive="true"]')) {
      return; // Don't flip the card
    }
    toggleCardFlip(cardId);
  };

  // Format file size for display
  const formatFileSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Get unique solutions from projects for filtering - parse JSON arrays and comma-delimited strings
  const availableSolutions = useMemo(() => {
    if (!projects.length || !allProducts.length) return [];

    // Use Map to deduplicate by normalized product name (after mapping)
    const solutionMap = new Map<string, { name: string; icon?: string; iconName?: string | null }>();

    projects.forEach((project) => {
      if (!project.solutionName) return;

      // Parse solutionName - handle JSON arrays, comma-delimited strings, or single strings
      let solutions: string[] = [];
      try {
        const parsed =
          typeof project.solutionName === "string"
            ? JSON.parse(project.solutionName)
            : project.solutionName;
        solutions = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        // If JSON parse fails, try comma-delimited string
        solutions =
          typeof project.solutionName === "string"
            ? project.solutionName.split(",")
            : [project.solutionName];
      }

      // Normalize and map each solution to its product info
      solutions
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((rawSolution) => {
          const productInfo = getProductInfo(rawSolution);
          // Deduplicate by final normalized name
          if (!solutionMap.has(productInfo.name)) {
            solutionMap.set(productInfo.name, {
              name: productInfo.name,
              icon: productInfo.icon,
              iconName: productInfo.iconName,
            });
          }
        });
    });

    // Convert Map values to sorted array
    return Array.from(solutionMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [projects, allProducts]);

  // Fetch criteria counts for projects
  const { data: criteriaCounts = {} } = useQuery<Record<number, number>>({
    queryKey: ["/api/criteria/counts"],
    enabled: isAuthenticated,
  });

  // Get user's customer portal access level
  const customerPortalAccess = useMemo(() => {
    if (!user) {
      return "none";
    }

    // Admin role gets full access (case insensitive) - bypass all permission checks
    if (user.role?.toLowerCase() === "admin") {
      return "admin";
    }

    // Check user-specific permissions first
    if (userPermissions.length > 0) {
      const permission = userPermissions.find(
        (p: any) => p.userId === user?.id && p.section === "customer",
      );

      if (permission) {
        return normalizeLevel(ACCOUNT_PORTAL_SECTION, permission.permission);
      }
    }

    // Legacy role-based fallbacks for external roles
    if (
      user.role === "Customer" ||
      user.role === "Guest" ||
      user.role === "Partner"
    ) {
      return "view-assigned"; // These roles get view-assigned access by default
    }

    // Fallback to none if no permissions found
    return "none";
  }, [user, userPermissions, customers.length]);

  // Get customers user can access based on permissions
  const accessibleCustomers = useMemo(() => {
    if (!user) return [];

    if (customerPortalAccess === "none") return [];

    // The Admin role, View All and Edit All see every account; View
    // Assigned and Edit Assigned see the accounts they are assigned to.
    const scope = customerPortalAccess === "admin" ? "all" : accountPortalAccess(customerPortalAccess).scope;
    if (scope === "all") {
      console.log(
        "Admin user accessing customers:",
        customers.length,
        "customers found",
      );
      return customers; // Can see all customers
    }

    if (scope === "assigned") {
      // Can only see customers they're assigned to via Customer Access & Permissions
      const assignedCustomers = customers.filter((customer) =>
        customer.contactUsers?.some(
          (contact: any) =>
            contact.userId === user?.id ||
            // Also check by email for backwards compatibility
            contact.userEmail === user?.email,
        ),
      );
      console.log(
        "View-assigned user accessing customers:",
        assignedCustomers.length,
        "customers found",
      );
      return assignedCustomers;
    }

    console.log("No customer access for user");
    return [];
  }, [user, customers, customerPortalAccess]);

  // Get the currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId && accessibleCustomers.length > 0) {
      // Auto-select first accessible customer if none selected
      const firstCustomer = accessibleCustomers[0];
      setSelectedCustomerId(firstCustomer.id);
      return firstCustomer;
    }

    return accessibleCustomers.find((c) => c.id === selectedCustomerId) || null;
  }, [selectedCustomerId, accessibleCustomers]);

  // Open MAP tasks on the customer side across every project of the account
  // (unfiltered by the table's search and filters), for the Projects tab.
  const accountProjectIds = useMemo(
    () =>
      selectedCustomer
        ? projects
            .filter((project) => project.customerName === selectedCustomer.accountName)
            .map((project) => project.id)
            .sort((a, b) => a - b)
            .slice(0, CUSTOMER_ACTIONS_MAX_PROJECTS)
        : [],
    [projects, selectedCustomer],
  );
  const { data: accountCustomerActions = [], isLoading: accountCustomerActionsLoading } = useQuery<CustomerActionRow[]>({
    queryKey: ["/api/customer-actions", accountProjectIds.join(",")],
    queryFn: async () => {
      const response = await fetch(`/api/customer-actions?projectIds=${accountProjectIds.join(",")}`);
      if (!response.ok) throw new Error("Failed to fetch customer actions");
      return response.json();
    },
    enabled: accountProjectIds.length > 0,
  });

  // Filter projects to show only those belonging to selected customer
  const customerProjects = useMemo(() => {
    if (!selectedCustomer || !projects.length) return [];

    let filtered = projects.filter(
      (project) => project.customerName === selectedCustomer.accountName,
    );

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (project) =>
          project.businessProblem
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          project.solutionName
            ?.toLowerCase()
            .includes(searchTerm.toLowerCase()) ||
          project.status?.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    }

    // Apply solution filter - parse and normalize each project's solutions
    if (solutionFilter.length > 0) {
      filtered = filtered.filter((project) => {
        if (!project.solutionName) return false;

        // Parse solutionName - handle JSON arrays, comma-delimited strings, or single strings
        let projectSolutions: string[] = [];
        try {
          const parsed =
            typeof project.solutionName === "string"
              ? JSON.parse(project.solutionName)
              : project.solutionName;
          projectSolutions = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          // If JSON parse fails, try comma-delimited string
          projectSolutions =
            typeof project.solutionName === "string"
              ? project.solutionName.split(",")
              : [project.solutionName];
        }

        // Normalize solutions and check if any match the filter
        const normalizedSolutions = projectSolutions
          .map((s) => s.trim())
          .filter(Boolean)
          .map((rawSolution) => getProductInfo(rawSolution).name);

        return solutionFilter.some((filterSolution) =>
          normalizedSolutions.includes(filterSolution),
        );
      });
    }

    if (customerStatusFilter !== "all") {
      filtered = filtered.filter(
        (project) => project.customerStatus === customerStatusFilter,
      );
    }

    if (internalStatusFilter !== "all") {
      filtered = filtered.filter(
        (project) => project.status?.toLowerCase() === internalStatusFilter.toLowerCase(),
      );
    }

    if (criteriaStatusFilter !== "all") {
      filtered = filtered.filter((project) => {
        if (!project.successCriteria || project.successCriteria.length === 0) return false;
        return project.successCriteria.some(
          (criteria) => criteria.status?.toLowerCase() === criteriaStatusFilter.toLowerCase()
        );
      });
    }

    // Apply sorting
    return stableSort(filtered, makeComparator(sortConfig));
  }, [
    selectedCustomer,
    projects,
    searchTerm,
    solutionFilter,
    customerStatusFilter,
    internalStatusFilter,
    criteriaStatusFilter,
    sortConfig,
  ]);

  // Get solution IDs from customer's projects for filtering resources
  const customerSolutionIds = useMemo(() => {
    const solutionIds = new Set<number>();
    customerProjects.forEach((project) => {
      if (!project.solutionName) return;
      let solutions: string[] = [];
      try {
        const parsed = typeof project.solutionName === "string" ? JSON.parse(project.solutionName) : project.solutionName;
        solutions = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        solutions = typeof project.solutionName === "string" ? project.solutionName.split(",") : [project.solutionName];
      }
      solutions.map(s => s.trim()).filter(Boolean).forEach(rawSolution => {
        const product = allProducts.find(p => 
          p.name === rawSolution || 
          p.name.toLowerCase() === rawSolution.toLowerCase() ||
          rawSolution.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(rawSolution.toLowerCase())
        );
        if (product) solutionIds.add(product.id);
      });
    });
    return solutionIds;
  }, [customerProjects, allProducts]);

  // Filter links for Video Tutorials (type = Video, matches customer solutions or "All Solutions")
  const videoLinks = useMemo(() => {
    return allLinks.filter(link => {
      if (!link.isActive || link.linkType !== "Video") return false;
      if (!link.solutionIds || link.solutionIds.length === 0) return true;
      return link.solutionIds.some((id: number) => customerSolutionIds.has(id));
    });
  }, [allLinks, customerSolutionIds]);

  // Filter links for Documents section (type != Video, matches customer solutions or "All Solutions")
  const documentLinks = useMemo(() => {
    return allLinks.filter(link => {
      if (!link.isActive || link.linkType === "Video") return false;
      if (!link.solutionIds || link.solutionIds.length === 0) return true;
      return link.solutionIds.some((id: number) => customerSolutionIds.has(id));
    });
  }, [allLinks, customerSolutionIds]);

  // Filter actual documents (files) by customer solutions
  const customerDocuments = useMemo(() => {
    return allDocuments.filter((doc: any) => {
      if (!doc.isActive) return false;
      if (!doc.solutionIds || doc.solutionIds.length === 0) return true;
      return doc.solutionIds.some((id: number) => customerSolutionIds.has(id));
    });
  }, [allDocuments, customerSolutionIds]);

  // Filter code scripts by customer solutions (matches "All Solutions" if no solutionIds or matches customer solutions)
  const customerScripts = useMemo(() => {
    return allCodeScripts.filter((script: any) => {
      if (!script.isActive) return false;
      if (!script.solutionIds || script.solutionIds.length === 0) return true;
      return script.solutionIds.some((id: number) => customerSolutionIds.has(id));
    });
  }, [allCodeScripts, customerSolutionIds]);

  // Calculate due date counts for CardDescription (timezone-aware)
  const getDueDateCounts = useMemo(() => {
    const userTimezone = user?.timezone || "America/New_York";

    let dueToday = 0;
    let dueThisWeek = 0;
    let overdue = 0;

    customerProjects.forEach((project) => {
      if (!project.endDate) return;

      // Use timezone-aware calculation
      const daysDiff = calculateDaysDiff(project.endDate, userTimezone);

      if (daysDiff === 0) {
        dueToday++;
      } else if (daysDiff > 0 && daysDiff <= 7) {
        dueThisWeek++;
      } else if (daysDiff < 0) {
        // Exclude closed/cancelled projects from overdue count
        const status = project.status?.toLowerCase();
        const isClosedOrCancelled = [
          "closed won",
          "closed lost",
          "cancelled",
        ].includes(status || "");
        if (!isClosedOrCancelled) {
          overdue++;
        }
      }
    });

    return { dueToday, dueThisWeek, overdue };
  }, [customerProjects, user?.timezone]);
  const heroKpis = useMemo(() => {
    const totalProjects = customerProjects.length;

    const activeProjects = customerProjects.filter((p) => {
      const status = (p.status || "").toLowerCase();
      // treat "closed", "won/lost", "completed/done", "cancelled" as not-active
      const isClosed =
        status.includes("closed") ||
        status.includes("won") ||
        status.includes("lost") ||
        status.includes("complete") ||
        status.includes("done") ||
        status.includes("cancel");
      return !isClosed;
    }).length;

    const uniqueSolutions = (() => {
      const set = new Set<string>();
      customerProjects.forEach((p) => {
        const raw = p.solutionName;
        if (!raw) return;

        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) parsed.forEach((s) => set.add(String(s)));
          else set.add(String(parsed));
        } catch {
          set.add(String(raw));
        }
      });
      return set.size;
    })();

    const avgCycleDays = (() => {
      const durations = customerProjects
        .map((p) => {
          if (!p.startDate || !p.endDate) return null;
          const start = new Date(p.startDate).getTime();
          const end = new Date(p.endDate).getTime();
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
          return Math.round((end - start) / (1000 * 60 * 60 * 24));
        })
        .filter((v): v is number => typeof v === "number");
      if (!durations.length) return 0;
      return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    })();

    return {
      totalProjects,
      activeProjects,
      dueToday: getDueDateCounts.dueToday,
      dueThisWeek: getDueDateCounts.dueThisWeek,
      overdue: getDueDateCounts.overdue,
      uniqueSolutions,
      avgCycleDays,
    };
  }, [customerProjects, getDueDateCounts]);

  // Filter projects by date if dateFilter is set
  const dateFilteredProjects = useMemo(() => {
    if (!dateFilter) return customerProjects;
    return customerProjects.filter((project) => dateFilter.projectIds.includes(project.id));
  }, [customerProjects, dateFilter]);

  // Pagination calculations for projects
  const totalPages = Math.ceil(dateFilteredProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = dateFilteredProjects.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, solutionFilter, customerStatusFilter, internalStatusFilter, criteriaStatusFilter, dateFilter]);

  // Get status color from configuration
  const getStatusColor = (status: string) => {
    const config = statusConfigs.find(
      (s) => s.name.toLowerCase() === status.toLowerCase(),
    );
    return config?.color || "#64748B";
  };

  // Get full status config from status name
  const getStatusConfig = (status: string) => {
    return statusConfigs.find(
      (s) => s.name.toLowerCase() === status.toLowerCase(),
    );
  };

  // Get customer status config from status name
  const getCustomerStatusConfig = (status: string) => {
    return customerStatusConfigs.find(
      (s) => s.name.toLowerCase() === status.toLowerCase(),
    );
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return "Not set";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (error) {
      return "Invalid date";
    }
  };

  // Helper function to get region abbreviation
  const getRegionAbbreviation = (region: string | null | undefined): string => {
    if (!region) return "GL"; // Default to Global
    const regionLower = region.toLowerCase();
    if (
      regionLower.includes("north america") ||
      regionLower.includes("north-america")
    )
      return "NA";
    if (
      regionLower.includes("south america") ||
      regionLower.includes("south-america")
    )
      return "SA";
    if (regionLower.includes("europe")) return "EU";
    if (
      regionLower.includes("asia pacific") ||
      regionLower.includes("asia-pacific")
    )
      return "AP";
    if (regionLower.includes("middle east") || regionLower.includes("africa"))
      return "MA";
    if (regionLower.includes("global")) return "GL";
    return "GL"; // Default fallback
  };

  // Helper function to get circle color based on project status
  const getCustomerCircleColor = (customerId: number): string => {
    const customerProjects = projects.filter(
      (project) =>
        project.customerName ===
        customers.find((c) => c.id === customerId)?.accountName,
    );

    // Check if customer has any projects with "In Progress" status
    const hasInProgressProjects = customerProjects.some(
      (project) =>
        project.status?.toLowerCase() === "in progress" ||
        project.status?.toLowerCase() === "active",
    );

    return hasInProgressProjects ? "#3b82f6" : "#f97316"; // Blue if in progress, Orange if not
  };

  // Get industry name
  const getIndustryName = (industryId: number | null | undefined) => {
    if (!industryId) return "Unknown Industry";
    const industry = industries.find((i) => i.id === industryId);
    return industry?.name || "Unknown Industry";
  };

  // Get industry object
  const getIndustry = (industryId: number | null | undefined) => {
    if (!industryId) return null;
    return industries.find((i) => i.id === industryId);
  };

  // Memoized regulation lookup for efficient name mapping
  const regById = useMemo(() => {
    const map = new Map();
    (complianceRegulations as any[]).forEach((reg: any) =>
      map.set(reg.id, reg.name),
    );
    return map;
  }, [complianceRegulations]);

  // Get compliance regulations for an industry
  const getIndustryComplianceRegulations = (
    industryId?: number | null | undefined,
  ) => {
    if (!industryId || !Array.isArray(industries)) return [];
    const industry = industries.find((ind: any) => ind.id === industryId);
    if (!industry) return [];

    if ((industry as any).allRegulationsApply) {
      return [{ name: "All Regulations Apply", searchUrl: null }];
    }

    const complianceRegulations = (industry as any).complianceRegulations;
    if (!complianceRegulations || !Array.isArray(complianceRegulations)) {
      return [];
    }

    return complianceRegulations.map((regId: number) => {
      const regName = regById.get(regId) || `Regulation ${regId}`;
      const searchTerm = encodeURIComponent(
        `${regName} +compliance+regulation`,
      );
      return {
        name: regName,
        searchUrl: `https://www.google.com/search?q=${searchTerm}`,
      };
    });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading Account Portal...
          </p>
        </div>
      </div>
    );
  }

  if (customerPortalAccess === "none") {
    return (
      <div className="h-full">
        <div className="max-w-full mx-auto h-full">
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                No Account Portal Access
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                You don't have access to the Account Portal. Please contact
                your administrator for access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (accessibleCustomers.length === 0) {
    return (
      <div className="h-full">
        <div className="max-w-full mx-auto h-full">
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {user?.role?.toLowerCase() === "admin" ||
                customerPortalAccess === "admin"
                  ? "No Accounts Found"
                  : "No Account Access"}
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                {user?.role?.toLowerCase() === "admin" ||
                customerPortalAccess === "admin"
                  ? customers.length === 0
                    ? "No accounts have been created yet. Go to Accounts to create your first account."
                    : "No accounts match your current access permissions."
                  : "You don't have access to any accounts. Please contact your administrator for access."}
              </p>
              {(user?.role?.toLowerCase() === "admin" ||
                customerPortalAccess === "admin") &&
                customers.length === 0 && (
                  <button
                    onClick={() => setLocation("/project?tab=customers&subtab=accounts")}
                    className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    Go to Accounts
                  </button>
                )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!selectedCustomer) {
    return (
      <div className="h-full">
        <div className="max-w-full mx-auto h-full">
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Loading Customer Data
              </h2>
              <p className="text-gray-600 dark:text-gray-400">
                Please wait while we load your customer information...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Helper function to determine access level for a project
  const getProjectAccessLevel = (
    project: any,
  ): "edit" | "view" | "read" | "none" => {
    if (!user) return "none";

    const userRole = user.role?.toLowerCase();
    const restrictedRoles = ["customer", "partner", "guest"];

    // If user is not in restricted roles, give edit access
    if (!userRole || !restrictedRoles.includes(userRole)) {
      return "edit";
    }

    // For restricted roles, check project permissions
    const userId = user.id;
    const userEmail = user.email;

    // Check customerUsers array
    if (project.customerUsers && Array.isArray(project.customerUsers)) {
      const customerAccess = project.customerUsers.find(
        (access: any) =>
          access.userEmail === userEmail || access.userId === userId,
      );
      if (customerAccess?.permission) {
        const permission = customerAccess.permission.toLowerCase();
        // Return exact permission value
        if (permission === "edit") return "edit";
        if (permission === "view") return "view";
        if (permission === "read") return "read";
        if (permission === "none") return "none";
      }
    }

    // Check additionalAccess array
    if (project.additionalAccess && Array.isArray(project.additionalAccess)) {
      const additionalAccessItem = project.additionalAccess.find(
        (access: any) =>
          access.userId === userId || access.userEmail === userEmail,
      );
      if (additionalAccessItem?.permission) {
        const permission = additionalAccessItem.permission.toLowerCase();
        // Return exact permission value
        if (permission === "edit") return "edit";
        if (permission === "view") return "view";
        if (permission === "read") return "read";
        if (permission === "none") return "none";
      }
    }

    // Default to none if no permission found for restricted roles
    return "none";
  };

  return (
    <div className="h-full">
      <div className="max-w-full mx-auto h-full">
        <Tabs value={accountOverviewTab} onValueChange={setAccountOverviewTab} className="w-full">
        <AccountPortalHero
          accountName={selectedCustomer.accountName}
          logoUrl={selectedCustomer.logoUrl}
          region={selectedCustomer.region}
          industryName={industries.find((i: any) => i.id === selectedCustomer.industryId)?.name ?? null}
          accountRep={users.find((u: any) => u.id === selectedCustomer.accountRepresentativeId) ?? null}
          accountEngineer={users.find((u: any) => u.id === selectedCustomer.accountEngineerId) ?? null}
          solutions={(selectedCustomer.productInterests ?? []).map((solution) => {
            const productInfo = getProductInfo(solution);
            return { name: productInfo.name, icon: productInfo.icon ?? null, iconName: productInfo.iconName };
          })}
          actions={
            <div className="flex flex-wrap items-center gap-1">
              {/* Account picker — hidden for Customer/Guest (single-account users) and when only one account is accessible */}
              {!["customer", "guest"].includes((user?.role ?? "").toLowerCase()) && accessibleCustomers.length > 1 && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="rounded-md p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          aria-label={t("accountPortal.hero.pickerLegendLabel")}
                        >
                          <HelpCircle className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm space-y-2 p-3 text-xs">
                        <div>
                          <p className="mb-1 text-sm font-semibold">{t("accountPortal.hero.regionLegendTitle")}</p>
                          <p>{t("accountPortal.hero.regionLegend")}</p>
                        </div>
                        <div>
                          <p className="mb-1 text-sm font-semibold">{t("accountPortal.hero.circleLegendTitle")}</p>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-blue-500" />
                            <span>{t("accountPortal.hero.circleInProgress")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-3 w-3 rounded-full bg-orange-500" />
                            <span>{t("accountPortal.hero.circleNoneInProgress")}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Select
                    value={selectedCustomerId?.toString() || ""}
                    onValueChange={(value) =>
                      setSelectedCustomerId(parseInt(value))
                    }
                  >
                    <SelectTrigger className="h-9 w-auto min-w-56 border-slate-200 bg-background dark:border-slate-700 text-foreground dark:bg-slate-800 dark:text-slate-200" aria-label={t("accountPortal.hero.selectAccount")}>
                      <SelectValue placeholder={t("accountPortal.hero.chooseAccount")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accessibleCustomers.map((customer) => (
                        <SelectItem
                          key={customer.id}
                          value={customer.id.toString()}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 min-w-9 rounded-full flex items-center justify-center text-white font-medium shrink-0"
                              style={{
                                backgroundColor: getCustomerCircleColor(
                                  customer.id,
                                ),
                              }}
                            >
                              <span className="text-xs font-bold">
                                {getRegionAbbreviation(customer.region)}
                              </span>
                            </div>
                            <span className="flex-1">
                              {customer.accountName}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <TooltipProvider>
                {/* Internal users only, and only once an admin sets the link
                    (Admin › Workplace › Terminology › Account Portal). */}
                {internalPortalUrl && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-slate-600 dark:text-slate-300"
                        onClick={() => window.open(internalPortalUrl, "_blank", "noopener,noreferrer")}
                        aria-label={t("accountPortal.internalPortalLink")}
                      >
                        <Handshake className="h-5 w-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("accountPortal.internalPortalLink")}</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-slate-600 dark:text-slate-300"
                      onClick={() => {
                        setAccessProjectId(null);
                        setIsAccountAccessDrawerOpen(true);
                      }}
                      aria-label={t("accountPortal.hero.accountUsers")}
                    >
                      <UserSearch className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t("accountPortal.hero.accountUsers")}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <RequestsActionButton
                customerId={selectedCustomerId ?? undefined}
                variant="ghost"
                size="icon"
                className="text-slate-600 dark:text-slate-300"
                title={t("requests.button.tooltipAccountNamed", { record: validationRecordName, account: selectedCustomer.accountName })}
                icon="monitor-cog"
              />
            </div>
          }
          tabs={
            <TabsList className={HERO_TABS_LIST_CLASS}>
              <TabsTrigger value="overview" data-tab-value="overview" className={HERO_TAB_CLASS}>
                <LayoutGrid className="h-4 w-4" />
                {t("accountPortal.tabs.projects")}
              </TabsTrigger>
              <TabsTrigger value="projects-table" data-tab-value="projects-table" className={HERO_TAB_CLASS}>
                <Building2 className="h-4 w-4" />
                {t("accountPortal.tabs.allProjects", { count: customerProjects.length })}
              </TabsTrigger>
              <TabsTrigger value="resources" data-tab-value="resources" className={HERO_TAB_CLASS}>
                <BookOpen className="h-4 w-4" />
                {t("accountPortal.tabs.resources")}
              </TabsTrigger>
              <TabsTrigger value="cloudlabs" data-tab-value="cloudlabs" className={HERO_TAB_CLASS}>
                <MonitorCloud className="h-4 w-4" />
                {t("accountPortal.tabs.cloudlabs")}
              </TabsTrigger>
            </TabsList>
          }
        />

        <div className="mb-4">
              <div>
                <div>
              {/* Customer workspace home: tiles, roadmap, project cards, to-dos and calendar */}
              {accountOverviewTab === "overview" && (() => {
                const liveProjects = customerProjects.filter((p) => !isClosedProjectStatus(p.status));
                const acctSalesRep = users.find((u: any) => u.id === selectedCustomer.accountRepresentativeId) ?? null;
                return (
                  <PortalWorkspaceHome
                    viewerFirstName={user?.firstName ?? null}
                    accountName={selectedCustomer.accountName}
                    projects={customerProjects}
                    actions={accountCustomerActions}
                    actionsLoading={accountCustomerActionsLoading}
                    isExternalViewer={isExternalViewer}
                    onOpenProject={(pid) => setLocation(`/project/${pid}?source=customer-portal`)}
                    projectHref={(pid) => `/project/${pid}?source=customer-portal`}
                    timezone={user?.timezone || "America/New_York"}
                    customerStatusConfigs={customerStatusConfigs}
                    projectCards={(messages) =>
                      liveProjects.length > 0 ? (
                        <section className="@container flex flex-col gap-3" data-testid="portal-project-cards">
                          <h2 className="inline-flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
                            <FolderKanban className="h-4 w-4 text-primary" aria-hidden="true" />
                            {t("workspace.portal.yourActiveProjects", { count: liveProjects.length })}
                          </h2>
                          {/* Up to three across, never narrower than the journey stages need. */}
                          <PortalProjectCardsGrid projectIds={liveProjects.map((p) => p.id)}>
                        {liveProjects.map((project) => {
                          const sc = statusConfigs.find(
                            (s) => s.name.toLowerCase() === (project.status || "").toLowerCase(),
                          );
                          const csc = project.customerStatus
                            ? customerStatusConfigs.find(
                                (s) => s.name.toLowerCase() === (project.customerStatus ?? "").toLowerCase(),
                              )
                            : undefined;
                          return (
                            <LiveProjectCard
                              key={project.id}
                              project={project}
                              salesRep={acctSalesRep}
                              statusConfig={sc}
                              customerStatusConfig={csc}
                              getProductInfo={getProductInfo}
                              formatDate={formatDate}
                              getProjectAccessLevel={getProjectAccessLevel}
                              user={user}
                              showInternalStatus={!isExternalViewer}
                              onViewDetails={(pid) =>
                                setLocation(`/project/${pid}?source=customer-portal`)
                              }
                              onOpenMessages={messages.open}
                              unreadMessages={messages.unread.get(project.id) ?? 0}
                              onOpenAccess={(pid) => {
                                setAccessProjectId(pid);
                                setIsAccountAccessDrawerOpen(true);
                              }}
                              onOpenPlan={(pid, al) => {
                                setSelectedProjectId(pid);
                                setSelectedProjectAccessLevel(al as any);
                                setIsMapDrawerOpen(true);
                              }}
                            />
                          );
                        })}
                          </PortalProjectCardsGrid>
                        </section>
                      ) : null
                    }
                  />
                );
              })()}

              {/* Tabbed Account Overview Card */}
                  <>
                    {/*className="rounded-xl border border-slate-200/70 dark:border-slate-800/70 backdrop-blur-sm p-1"> */}
                    
                <div className="flex">
                  {/* Content Area */}
                  <div className="flex-1">
                    <TabsContent value="resources" className="m-0 h-full">
                      <div className="space-y-4">
                        {/* Row 1: 4 columns (25% each) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          {/* Cols 1-2: Learning & Documentation, Support & Community (Resource Content) */}
                          <PortalResourceCards isExternalViewer={isExternalViewer} />

                          {/* Col 3: Video Tutorials */}
                          <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-4 flex flex-col">
                            <div className="flex items-center gap-2 mb-3">
                              <Video className="h-4 w-4 text-red-500" />
                              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                Video Tutorials
                              </p>
                            </div>
                            <div className="flex-1 overflow-auto space-y-2">
                              {videoLinks.length > 0 ? (
                                videoLinks.slice(0, 5).map((link) => (
                                  <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <Video className="h-3.5 w-3.5 text-red-400 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 truncate">{link.name}</p>
                                      {link.description && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{link.description}</p>}
                                    </div>
                                  </a>
                                ))
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                                  <div className="text-center py-4">
                                    <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs">No videos available</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Col 4: Documents & Links */}
                          <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-4 flex flex-col">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 mb-3">
                                <FileDown className="h-4 w-4 text-emerald-500" />
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Artifacts: Document & Links</p>
                              </div>
                              <TooltipProvider>
                                <Tooltip>
                                  <UploadDocumentDialog
                                    customerId={selectedCustomer.id}
                                    onUploadSuccess={() => {
                                      queryClient.invalidateQueries({
                                        queryKey: ["/api/customers", selectedCustomer.id, "documents"],
                                      });
                                    }}
                                    trigger={
                                      <TooltipTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 px-2">
                                          <Upload className="h-3.5 w-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                    }
                                  />
                                  <TooltipContent side="bottom">
                                    Upload Document
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                              {(documentLinks.length > 0 || customerDocuments.length > 0 || customerScripts.length > 0) ? (
                                <>
                                  {/* Links Category */}
                                  {documentLinks.length > 0 && (
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => setLinksExpanded(!linksExpanded)}
                                        className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition-colors"
                                      >
                                        {linksExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                        )}
                                        <LinkIcon className="h-3.5 w-3.5 text-blue-500" />
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                          Links ({documentLinks.length})
                                        </span>
                                      </button>
                                      {linksExpanded && (
                                        <TooltipProvider>
                                          <div className="pl-5 space-y-1">
                                            {documentLinks.map((link) => {
                                              const cardId = `link-${link.id}`;
                                              const isFlipped = flippedCards.has(cardId);
                                              const typeInfo = linkTypeIcons[link.linkType] || linkTypeIcons["Other"];
                                              const IconComponent = typeInfo.icon;
                                              
                                              return (
                                                <div
                                                  key={link.id}
                                                  className="relative h-[48px]"
                                                  style={{ perspective: "1000px" }}
                                                >
                                                  {/* Invisible flip trigger overlay */}
                                                  <button
                                                    type="button"
                                                    className="absolute inset-0 z-30 cursor-pointer bg-transparent border-0 rounded-lg"
                                                    style={{ pointerEvents: isFlipped ? 'none' : 'auto' }}
                                                    onClick={() => toggleCardFlip(cardId)}
                                                    aria-label={`Flip card for ${link.name}`}
                                                  />
                                                  <div
                                                    className="relative w-full h-full"
                                                    style={{
                                                      transformStyle: "preserve-3d",
                                                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                                                      transition: "transform 0.5s ease",
                                                    }}
                                                  >
                                                    {/* Front of card */}
                                                    <div
                                                      className={`absolute inset-0 px-2 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden flex items-center justify-between pointer-events-none`}
                                                      style={{ backfaceVisibility: "hidden" }}
                                                    >
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40`} />
                                                      <div className="flex items-center gap-2 relative z-10 min-w-0 flex-1">
                                                        <IconComponent className={`h-3.5 w-3.5 shrink-0 ${typeInfo.color}`} />
                                                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{link.name}</p>
                                                      </div>
                                                      <div className="flex items-center gap-0.5 shrink-0 relative z-10">
                                                        {(!link.solutionIds || link.solutionIds.length === 0) ? (
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">All Solutions</TooltipContent>
                                                          </Tooltip>
                                                        ) : (
                                                          link.solutionIds.map((solutionId: number) => {
                                                            const solution = allProducts.find((p: any) => p.id === solutionId);
                                                            if (!solution) return null;
                                                            return (
                                                              <Tooltip key={solutionId}>
                                                                <TooltipTrigger asChild>
                                                                  {solution.solutionIcon || solution.solutionIconName ? (
<SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={solution.name} className="h-3.5 w-3.5" />
) : (
                                                                    <div className="h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                                  )}
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">{solution.name}</TooltipContent>
                                                              </Tooltip>
                                                            );
                                                          })
                                                        )}
                                                      </div>
                                                    </div>
                                                    {/* Back of card */}
                                                    <div
                                                      className={`absolute inset-0 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden`}
                                                      style={{
                                                        backfaceVisibility: "hidden",
                                                        transform: "rotateY(180deg)",
                                                        pointerEvents: isFlipped ? 'auto' : 'none',
                                                      }}
                                                    >
                                                      {/* Flip-back overlay - lowest layer, behind content */}
                                                      <button
                                                        type="button"
                                                        className="absolute inset-0 z-0 cursor-pointer bg-transparent border-0"
                                                        onClick={() => toggleCardFlip(cardId)}
                                                        aria-label="Flip card back"
                                                      />
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40 pointer-events-none`} />
                                                      <div className="flex items-center justify-between w-full h-full gap-2 relative z-10 px-2 py-1.5 pointer-events-none">
                                                        <div className="min-w-0 flex-1 pointer-events-auto">
                                                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{link.linkType}</p>
                                                          {link.description && (
                                                            <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate cursor-help">{link.description}</p>
                                                              </TooltipTrigger>
                                                              <TooltipContent side="top">
                                                                {link.description}
                                                              </TooltipContent>
                                                            </Tooltip>
                                                          )}
                                                        </div>
                                                        <div className="shrink-0 pointer-events-auto">
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <a
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1"
                                                              >
                                                                <ExternalLink className="h-2.5 w-2.5" />
                                                                Open
                                                              </a>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">Open link in new tab</TooltipContent>
                                                          </Tooltip>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  )}

                                  {/* Documents Category */}
                                  {customerDocuments.length > 0 && (
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => setDocumentsExpanded(!documentsExpanded)}
                                        className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition-colors"
                                      >
                                        {documentsExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                        )}
                                        <FileArchive className="h-3.5 w-3.5 text-emerald-500" />
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                          Documents ({customerDocuments.length})
                                        </span>
                                      </button>
                                      {documentsExpanded && (
                                        <TooltipProvider>
                                          <div className="pl-5 space-y-1">
                                            {customerDocuments.map((doc: any) => {
                                              const cardId = `doc-${doc.id}`;
                                              const isFlipped = flippedCards.has(cardId);
                                              const typeInfo = documentTypeIcons[doc.documentType] || documentTypeIcons["Other"];
                                              const IconComponent = typeInfo.icon;
                                              
                                              return (
                                                <div
                                                  key={doc.id}
                                                  className="relative h-[48px]"
                                                  style={{ perspective: "1000px" }}
                                                >
                                                  {/* Invisible flip trigger overlay */}
                                                  <button
                                                    type="button"
                                                    className="absolute inset-0 z-30 cursor-pointer bg-transparent border-0 rounded-lg"
                                                    style={{ pointerEvents: isFlipped ? 'none' : 'auto' }}
                                                    onClick={() => toggleCardFlip(cardId)}
                                                    aria-label={`Flip card for ${doc.givenName || doc.fileName}`}
                                                  />
                                                  <div
                                                    className="relative w-full h-full"
                                                    style={{
                                                      transformStyle: "preserve-3d",
                                                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                                                      transition: "transform 0.5s ease",
                                                    }}
                                                  >
                                                    {/* Front of card */}
                                                    <div
                                                      className={`absolute inset-0 px-2 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden flex items-center justify-between pointer-events-none`}
                                                      style={{ backfaceVisibility: "hidden" }}
                                                    >
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40`} />
                                                      <div className="flex items-center gap-2 relative z-10 min-w-0 flex-1">
                                                        <IconComponent className={`h-3.5 w-3.5 shrink-0 ${typeInfo.color}`} />
                                                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{doc.givenName || doc.fileName}</p>
                                                      </div>
                                                      <div className="flex items-center gap-0.5 shrink-0 relative z-10">
                                                        {(!doc.solutionIds || doc.solutionIds.length === 0) ? (
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">All Solutions</TooltipContent>
                                                          </Tooltip>
                                                        ) : (
                                                          doc.solutionIds.map((solutionId: number) => {
                                                            const solution = allProducts.find((p: any) => p.id === solutionId);
                                                            if (!solution) return null;
                                                            return (
                                                              <Tooltip key={solutionId}>
                                                                <TooltipTrigger asChild>
                                                                  {solution.solutionIcon || solution.solutionIconName ? (
<SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={solution.name} className="h-3.5 w-3.5" />
) : (
                                                                    <div className="h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                                  )}
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">{solution.name}</TooltipContent>
                                                              </Tooltip>
                                                            );
                                                          })
                                                        )}
                                                      </div>
                                                    </div>
                                                    {/* Back of card */}
                                                    <div
                                                      className={`absolute inset-0 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden`}
                                                      style={{
                                                        backfaceVisibility: "hidden",
                                                        transform: "rotateY(180deg)",
                                                        pointerEvents: isFlipped ? 'auto' : 'none',
                                                      }}
                                                    >
                                                      {/* Flip-back overlay - lowest layer, behind content */}
                                                      <button
                                                        type="button"
                                                        className="absolute inset-0 z-0 cursor-pointer bg-transparent border-0"
                                                        onClick={() => toggleCardFlip(cardId)}
                                                        aria-label="Flip card back"
                                                      />
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40 pointer-events-none`} />
                                                      <div className="flex items-center justify-between w-full h-full gap-2 relative z-10 px-2 py-1.5 pointer-events-none">
                                                        <div className="min-w-0 flex-1 pointer-events-auto">
                                                          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                                                            <span>{doc.documentType}</span>
                                                            <span>•</span>
                                                            <span>{formatFileSize(doc.fileSize)}</span>
                                                          </div>
                                                          {doc.description && (
                                                            <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate cursor-help">{doc.description}</p>
                                                              </TooltipTrigger>
                                                              <TooltipContent side="top">
                                                                {doc.description}
                                                              </TooltipContent>
                                                            </Tooltip>
                                                          )}
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0 pointer-events-auto">
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <button
                                                                className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1"
                                                                onClick={() => window.open(`/api/documents/${doc.id}/download`, "_blank")}
                                                              >
                                                                <Download className="h-2.5 w-2.5" />
                                                                Download
                                                              </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">Download file</TooltipContent>
                                                          </Tooltip>
                                                          {doc.uploadedByUserId === user?.id && (
                                                            <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                <button
                                                                  className="p-0.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                                                  onClick={() => setDocumentToDelete({ id: doc.id, name: doc.givenName })}
                                                                >
                                                                  <Trash2 className="h-2.5 w-2.5 text-red-500 hover:text-red-600" />
                                                                </button>
                                                              </TooltipTrigger>
                                                              <TooltipContent side="top">Delete document</TooltipContent>
                                                            </Tooltip>
                                                          )}
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  )}

                                  {/* Code & Scripts Category */}
                                  {customerScripts.length > 0 && (
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => setScriptsExpanded(!scriptsExpanded)}
                                        className="flex items-center gap-1.5 w-full text-left py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded transition-colors"
                                      >
                                        {scriptsExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                        )}
                                        <Code className="h-3.5 w-3.5 text-violet-500" />
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                          Code & Scripts ({customerScripts.length})
                                        </span>
                                      </button>
                                      {scriptsExpanded && (
                                        <TooltipProvider>
                                          <div className="pl-5 space-y-1">
                                            {customerScripts.map((script: any) => {
                                              const cardId = `script-${script.id}`;
                                              const isFlipped = flippedCards.has(cardId);
                                              const typeInfo = scriptTypeIcons[script.scriptType] || scriptTypeIcons["Other"];
                                              const IconComponent = typeInfo.icon;
                                              
                                              return (
                                                <div
                                                  key={script.id}
                                                  className="relative h-[48px]"
                                                  style={{ perspective: "1000px" }}
                                                >
                                                  {/* Invisible flip trigger overlay */}
                                                  <button
                                                    type="button"
                                                    className="absolute inset-0 z-30 cursor-pointer bg-transparent border-0 rounded-lg"
                                                    style={{ pointerEvents: isFlipped ? 'none' : 'auto' }}
                                                    onClick={() => toggleCardFlip(cardId)}
                                                    aria-label={`Flip card for ${script.name}`}
                                                  />
                                                  <div
                                                    className="relative w-full h-full"
                                                    style={{
                                                      transformStyle: "preserve-3d",
                                                      transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                                                      transition: "transform 0.5s ease",
                                                    }}
                                                  >
                                                    {/* Front of card */}
                                                    <div
                                                      className={`absolute inset-0 px-2 py-1.5 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden flex items-center justify-between pointer-events-none`}
                                                      style={{ backfaceVisibility: "hidden" }}
                                                    >
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40`} />
                                                      <div className="flex items-center gap-2 relative z-10 min-w-0 flex-1">
                                                        <IconComponent className={`h-3.5 w-3.5 shrink-0 ${typeInfo.color}`} />
                                                        <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{script.name}</p>
                                                      </div>
                                                      <div className="flex items-center gap-0.5 shrink-0 relative z-10">
                                                        {(!script.solutionIds || script.solutionIds.length === 0) ? (
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">All Solutions</TooltipContent>
                                                          </Tooltip>
                                                        ) : (
                                                          script.solutionIds.map((solutionId: number) => {
                                                            const solution = allProducts.find((p: any) => p.id === solutionId);
                                                            if (!solution) return null;
                                                            return (
                                                              <Tooltip key={solutionId}>
                                                                <TooltipTrigger asChild>
                                                                  {solution.solutionIcon || solution.solutionIconName ? (
<SolutionGraphic graphic={solution.solutionIcon} icon={solution.solutionIconName} name={solution.name} className="h-3.5 w-3.5" />
) : (
                                                                    <div className="h-3.5 w-3.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                                                                  )}
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top">{solution.name}</TooltipContent>
                                                              </Tooltip>
                                                            );
                                                          })
                                                        )}
                                                      </div>
                                                    </div>
                                                    {/* Back of card */}
                                                    <div
                                                      className={`absolute inset-0 rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-gradient-to-br ${typeInfo.bgGradient} overflow-hidden`}
                                                      style={{
                                                        backfaceVisibility: "hidden",
                                                        transform: "rotateY(180deg)",
                                                        pointerEvents: isFlipped ? 'auto' : 'none',
                                                      }}
                                                    >
                                                      {/* Flip-back overlay - lowest layer, behind content */}
                                                      <button
                                                        type="button"
                                                        className="absolute inset-0 z-0 cursor-pointer bg-transparent border-0"
                                                        onClick={() => toggleCardFlip(cardId)}
                                                        aria-label="Flip card back"
                                                      />
                                                      <IconComponent aria-hidden="true" className={`absolute -right-1 -bottom-1 h-8 w-8 ${typeInfo.bgIconColor} opacity-40 pointer-events-none`} />
                                                      <div className="flex items-center justify-between w-full h-full gap-2 relative z-10 px-2 py-1.5 pointer-events-none">
                                                        <div className="min-w-0 flex-1 pointer-events-auto">
                                                          <p className="text-[10px] text-slate-500 dark:text-slate-400">{script.scriptType}</p>
                                                          {script.description && (
                                                            <Tooltip>
                                                              <TooltipTrigger asChild>
                                                                <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate cursor-help">{script.description}</p>
                                                              </TooltipTrigger>
                                                              <TooltipContent side="top">
                                                                {script.description}
                                                              </TooltipContent>
                                                            </Tooltip>
                                                          )}
                                                        </div>
                                                        <div className="shrink-0 pointer-events-auto">
                                                          <Tooltip>
                                                            <TooltipTrigger asChild>
                                                              <button
                                                                className="text-[10px] text-blue-500 hover:text-blue-600 flex items-center gap-1"
                                                                onClick={() => {
                                                                  navigator.clipboard.writeText(script.content || "");
                                                                }}
                                                              >
                                                                <Copy className="h-2.5 w-2.5" />
                                                                Copy
                                                              </button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="top">Copy code to clipboard</TooltipContent>
                                                          </Tooltip>
                                                        </div>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </TooltipProvider>
                                      )}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-500">
                                  <div className="text-center py-4">
                                    <FileDown className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs">No resources available</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Row 2: FAQ (spans 2 columns internally) */}
                        <div className="rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 bg-card text-card-foreground p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <HelpCircle className="h-4 w-4 text-amber-500" />
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                              {t("accountPortal.faq.title")}
                            </p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {CUSTOMER_FAQ_COLUMNS.map((column, columnIndex) => (
                              <Accordion key={columnIndex} type="single" collapsible className="space-y-2">
                                {column.map(({ id, icon: FaqIcon, iconClass }) => (
                                  <AccordionItem key={id} value={id} className="border border-slate-200/70 dark:border-slate-800/70 rounded-lg px-3">
                                    <AccordionTrigger className="text-xs font-medium text-slate-900 dark:text-slate-100 hover:no-underline py-3">
                                      <div className="flex items-center gap-2">
                                        <FaqIcon className={`h-3.5 w-3.5 ${iconClass} shrink-0`} />
                                        {t(`accountPortal.faq.${id}.question`)}
                                      </div>
                                    </AccordionTrigger>
                                    <AccordionContent className="text-xs text-slate-600 dark:text-slate-400 pb-3">
                                      {t(`accountPortal.faq.${id}.answer`)}
                                    </AccordionContent>
                                  </AccordionItem>
                                ))}
                              </Accordion>
                            ))}
                          </div>
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent value="cloudlabs" className="m-0 h-full">
                      <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">
                        <div className="text-center">
                          <MonitorCloud className="h-12 w-12 mx-auto mb-3 text-slate-400 dark:text-slate-500" />
                          <p className="text-sm font-medium">Account and Project CloudLAB Workspace Coming Soon</p>
                          <p className="text-xs mt-1">All Project related CloudLABs and Environments and will appear and be managed here</p>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </div>
              </>
              </div>
              </div>

          {/* Account Access drawer: the whole account from the header button,
              or one project from a project card's Account Users button. */}
          <AccountAccessDrawer
            open={isAccountAccessDrawerOpen}
            onOpenChange={(open) => {
              setIsAccountAccessDrawerOpen(open);
              if (!open) setAccessProjectId(null);
            }}
            accountName={selectedCustomer.accountName}
            contacts={selectedCustomer.contactUsers ?? []}
            users={users}
            projects={customerProjects}
            project={accessProjectId != null ? (customerProjects.find((p) => p.id === accessProjectId) ?? null) : null}
            viewerId={user?.id ?? null}
          />
        </div>
        {/* Project Validation Projects Section — the "All projects" tab */}
        <TabsContent value="projects-table" className="mt-0">
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Building2} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Building2 data-title className="h-5 w-5" />
                Your Validation Projects ({customerProjects.length})
              </CardTitle>
              <Button 
                size="sm"
                onClick={() => setIsEvaluationDialogOpen(true)}
                style={{ backgroundColor: '#2d6ee6' }}
                className="hover:bg-[#1e40af] text-white border-0"
              >
                <Package className="h-4 w-4 mr-2 stroke-white fill-none stroke-2" />
                {t("requests.button.requestNew", { record: validationRecordName })}
              </Button>
            </div>
            <CardDescription className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <CalendarHeart className="h-4 w-4 text-green-600" />
                <span className="text-gray-600 dark:text-gray-400">
                  Due Today:
                </span>
                <span className="font-bold text-green-600">
                  {getDueDateCounts.dueToday}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarClock className="h-4 w-4 text-orange-600" />
                <span className="text-gray-600 dark:text-gray-400">
                  Due This Week:
                </span>
                <span className="font-bold text-orange-600">
                  {getDueDateCounts.dueThisWeek}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CalendarX2 className="h-4 w-4 text-red-600" />
                <span className="text-gray-600 dark:text-gray-400">
                  Overdue:
                </span>
                <span className="font-bold text-red-600">
                  {getDueDateCounts.overdue}
                </span>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
            {/* Search and Filters */}
            <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <FilterLabel>Search</FilterLabel>
                  <div className="relative">
                    <Search
                      className="absolute left-2 top-2.5 text-gray-400 dark:text-gray-500"
                      size={14}
                    />
                    <Input
                      placeholder="Search projects..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <FilterLabel>Solutions</FilterLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FilterMultiSelectButton className="h-9 text-sm">
                        Solutions{" "}
                        {solutionFilter.length > 0 &&
                          `(${solutionFilter.length})`}
                      </FilterMultiSelectButton>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-3">
                      <div className="space-y-2">
                        <h4 className="font-medium">Select Solutions</h4>
                        <div className="grid gap-2 max-h-60 overflow-y-auto">
                          {availableSolutions.map((solution) => (
                            <div
                              key={solution.name}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`solution-${solution.name}`}
                                checked={solutionFilter.includes(solution.name)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSolutionFilter((prev) => [
                                      ...prev,
                                      solution.name,
                                    ]);
                                  } else {
                                    setSolutionFilter((prev) =>
                                      prev.filter((s) => s !== solution.name),
                                    );
                                  }
                                }}
                              />
                              <label
                                htmlFor={`solution-${solution.name}`}
                                className="text-sm flex items-center gap-2"
                              >
                                <SolutionGraphic graphic={solution.icon} icon={solution.iconName} name={solution.name} className="w-4 h-4" />
                                {solution.name}
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <FilterLabel>Account Status</FilterLabel>
                  <Select
                    value={customerStatusFilter}
                    onValueChange={setCustomerStatusFilter}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="All Account Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Account Status</SelectItem>
                      {(customerStatusConfigs as any[])
                        .filter((config: any) => config.isActive)
                        .map((config: any) => (
                          <SelectItem key={config.id} value={config.name}>
                            <div className="flex items-center gap-2">
                              {config.icon && (
                                <DynamicIcon
                                  name={config.icon}
                                  className="h-4 w-4"
                                  style={{ color: config.color }}
                                />
                              )}
                              {config.name}
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SearchFiltersSection>

            {/* Date Filter Indicator */}
            {dateFilter && (
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>
                    Showing {dateFilter.type === "start" ? "starting" : dateFilter.type === "end" ? "ending" : "starting/ending"} on{" "}
                    <strong>{format(new Date(dateFilter.date), "MMM d, yyyy")}</strong>
                  </span>
                  <span className="text-muted-foreground">({dateFilteredProjects.length} project{dateFilteredProjects.length !== 1 ? "s" : ""})</span>
                  <button
                    onClick={() => setDateFilter(null)}
                    className="ml-1 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    aria-label="Clear date filter"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              </div>
            )}

            {/* Projects Table */}
            {dateFilteredProjects.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-gray-400 dark:text-gray-600 mb-4">
                  <svg
                    className="mx-auto h-16 w-16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                  No Projects Found
                </h3>
                <p className="text-gray-500 dark:text-gray-400">
                  {searchTerm ||
                  solutionFilter.length > 0 ||
                  customerStatusFilter !== "all" ||
                  internalStatusFilter !== "all" ||
                  criteriaStatusFilter !== "all" ||
                  dateFilter
                    ? "No projects match your current filters."
                    : "No projects are currently assigned to your account."}
                </p>
              </div>
            ) : (
              <>
                <TooltipProvider>
                  <SortableTable>
                    <SortableTableHeader>
                      <SortableTableRow>
                        <SortableTableHead
                          sortKey="id"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          ID
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="businessProblem"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          Business Problem
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="solutionName"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          Solution
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="customerStatus"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          Account Status
                        </SortableTableHead>
                        {!isExternalViewer && (
                        <SortableTableHead
                          sortKey="status"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          {t("projects.internalProjectStatus")}
                        </SortableTableHead>
                        )}
                        <SortableTableHead
                          sortKey="updatedAt"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          Last Updated
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey=""
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          sortable={false}
                        >
                          Primary Engineer
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="startDate"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          Start Date
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="endDate"
                          sortConfig={sortConfig}
                          onSort={handleSort}
                        >
                          End Date
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey=""
                          sortConfig={sortConfig}
                          onSort={handleSort}
                          sortable={false}
                        >
                          Actions
                        </SortableTableHead>
                      </SortableTableRow>
                    </SortableTableHeader>
                    <SortableTableBody>
                      {paginatedProjects.map((project) => (
                        <SortableTableRow key={project.id}>
                          <SortableTableCell className="font-medium">
                            #{project.id}
                          </SortableTableCell>
                          <SortableTableCell className="max-w-xs">
                            <div
                              className="truncate"
                              title={project.businessProblem}
                            >
                              {project.businessProblem || "Not specified"}
                            </div>
                          </SortableTableCell>
                          <SortableTableCell>
                            {(() => {
                              if (!project.solutionName) {
                                return (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    Not specified
                                  </span>
                                );
                              }

                              // Parse solutionName - handle JSON arrays, comma-delimited strings, or single strings
                              let solutions: string[] = [];
                              try {
                                const parsed =
                                  typeof project.solutionName === "string"
                                    ? JSON.parse(project.solutionName)
                                    : project.solutionName;
                                solutions = Array.isArray(parsed)
                                  ? parsed
                                  : [parsed];
                              } catch {
                                // If JSON parse fails, try comma-delimited string
                                solutions =
                                  typeof project.solutionName === "string"
                                    ? project.solutionName.split(",")
                                    : [project.solutionName];
                              }

                              // Normalize: trim and filter empty strings
                              solutions = solutions
                                .map((s) => s.trim())
                                .filter(Boolean);

                              // If no valid solutions after parsing, show fallback
                              if (solutions.length === 0) {
                                return (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    Not specified
                                  </span>
                                );
                              }

                              return (
                                <div className="flex flex-wrap gap-1">
                                  {solutions.map((solution, idx) => {
                                    const productInfo =
                                      getProductInfo(solution);
                                    return (
                                      <SolutionBadge
                                        key={`${project.id}-${idx}`}
                                        solutionName={productInfo.name}
                                        solutionIcon={productInfo.icon} solutionIconName={productInfo.iconName}
                                      />
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </SortableTableCell>
                          <SortableTableCell>
                            {project.customerStatus ? (
                              <StatusBadge
                                config={getCustomerStatusConfig(project.customerStatus)}
                                label={project.customerStatus}
                                fallbackColor={CUSTOMER_STATUS_NEUTRAL_FALLBACK.color}
                              />
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">
                                Not set
                              </span>
                            )}
                          </SortableTableCell>
                          {!isExternalViewer && (
                          <SortableTableCell>
                            {(() => {
                              const cfg = project.status ? getStatusConfig(project.status) : null;
                              // Merge: prefer the live /api/status-configs row, but fall back to
                              // the backend-attached snapshot if the live row was deleted.
                              const merged = {
                                name: cfg?.name ?? project.status ?? null,
                                color: cfg?.color ?? project.statusConfig?.color ?? null,
                                icon: cfg?.icon ?? project.statusConfig?.icon ?? null,
                              };
                              return (
                                <StatusBadge
                                  config={merged}
                                  label={merged.name ?? "Not set"}
                                />
                              );
                            })()}
                          </SortableTableCell>
                          )}
                          <SortableTableCell>
                            {project.updatedAt
                              ? formatDateForDisplay(
                                  project.updatedAt,
                                  user?.timezone || "America/New_York",
                                )
                              : "N/A"}
                          </SortableTableCell>
                          <SortableTableCell>
                            {project.primarySe ? (
                              <a
                                href={`mailto:${project.primarySe.email || ''}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                              >
                                {[project.primarySe.firstName, project.primarySe.lastName].filter(Boolean).join(' ') || 'N/A'}
                              </a>
                            ) : (
                              <span className="text-gray-400 dark:text-gray-500">Not assigned</span>
                            )}
                          </SortableTableCell>
                          <SortableTableCell>
                            {formatDateForDisplay(
                              project.startDate,
                              user?.timezone || "America/New_York",
                            )}
                          </SortableTableCell>
                          <SortableTableCell>
                            <div className="flex flex-col items-start">
                              <div className="flex items-center gap-1">
                                <span className="text-sm">
                                  {formatDateForDisplay(
                                    project.endDate,
                                    user?.timezone ?? undefined,
                                  )}
                                </span>
                                <EndDateBadge
                                  endDate={project.endDate}
                                  projectStatus={project.status}
                                  targetField="project.endDate"
                                />
                              </div>
                              {(() => {
                                // Check if project has a closed status first
                                const isClosedStatus =
                                  project.status &&
                                  [
                                    "closed lost",
                                    "closed won",
                                    "cancelled",
                                  ].includes(project.status.toLowerCase());

                                if (
                                  isClosedStatus &&
                                  project.startDate &&
                                  project.endDate
                                ) {
                                  // Calculate and show project duration for closed projects
                                  const startDate = new Date(project.startDate);
                                  const endDate = new Date(project.endDate);
                                  const timeDiff =
                                    endDate.getTime() - startDate.getTime();
                                  const daysDuration = Math.ceil(
                                    timeDiff / (1000 * 3600 * 24),
                                  );

                                  return (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                      {daysDuration}{" "}
                                      {daysDuration === 1 ? "day" : "days"}{" "}
                                      duration
                                    </span>
                                  );
                                } else {
                                  // Check if start date is in the future first for active projects
                                  const userTimezone =
                                    user?.timezone || "America/New_York";
                                  const startStatus = project.startDate
                                    ? getStartDateStatus(
                                        project.startDate,
                                        userTimezone,
                                      )
                                    : null;

                                  if (startStatus) {
                                    // Show "Starts in X Days" if start date is in the future
                                    return (
                                      <span
                                        className={`text-xs ${startStatus.statusClass}`}
                                      >
                                        {startStatus.statusText}
                                      </span>
                                    );
                                  } else {
                                    // Show normal end date status if start date is not in the future
                                    const status = getDateStatus(
                                      project.endDate,
                                      userTimezone,
                                    );
                                    return (
                                      <span
                                        className={`text-xs ${status.statusClass}`}
                                      >
                                        {status.statusText}
                                      </span>
                                    );
                                  }
                                }
                              })()}
                            </div>
                          </SortableTableCell>
                          <SortableTableCell>
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div
                                    className="icon-button icon-button-ghost"
                                    onClick={() =>
                                      setLocation(
                                        `/project/${project.id}?source=customer-portal`,
                                      )
                                    }
                                  >
                                    <Eye className="h-4 w-4" />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-900 dark:text-white dark:border-gray-700"
                                >
                                  View Project ID#{project.id}'s details
                                </TooltipContent>
                              </Tooltip>
                              {(() => {
                                // Every project's plan is a MAP.
                                const PlanIcon = Waypoints;
                                const planLabel = "MAP";

                                // Get status config for color
                                const statusConfig = project.status
                                  ? getStatusConfig(project.status)
                                  : null;
                                const statusColor =
                                  statusConfig?.color || "#10b981"; // Default to green
                                const statusName =
                                  statusConfig?.name ||
                                  project.status ||
                                  "Unknown";

                                // Convert hex to RGBA with 15% opacity for hover
                                const hexToRgba = (
                                  hex: string,
                                  alpha: number,
                                ) => {
                                  // Remove # if present
                                  let cleanHex = hex.startsWith("#")
                                    ? hex.slice(1)
                                    : hex;

                                  // Expand 3-digit hex to 6-digit
                                  if (cleanHex.length === 3) {
                                    cleanHex = cleanHex
                                      .split("")
                                      .map((char) => char + char)
                                      .join("");
                                  }

                                  // Validate hex format
                                  if (!/^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
                                    // Fallback to a safe default (light green)
                                    return `rgba(16, 185, 129, ${alpha})`;
                                  }

                                  const r = parseInt(cleanHex.slice(0, 2), 16);
                                  const g = parseInt(cleanHex.slice(2, 4), 16);
                                  const b = parseInt(cleanHex.slice(4, 6), 16);
                                  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                                };
                                const hoverBgColor = hexToRgba(
                                  statusColor,
                                  0.15,
                                );

                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        onClick={() => {
                                          const accessLevel =
                                            getProjectAccessLevel(project);

                                          // Block access if permission is 'none'
                                          if (accessLevel === "none") {
                                            showErrorToast("Access Denied", `You don't have permission to view the ${planLabel} for this project.`);
                                            return;
                                          }

                                          setSelectedProjectId(project.id);
                                          setSelectedProjectAccessLevel(
                                            accessLevel,
                                          );

                                          setIsMapDrawerOpen(true);
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
                                        style={{
                                          color: statusColor,
                                          backgroundColor: "transparent",
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            hoverBgColor;
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.backgroundColor =
                                            "transparent";
                                        }}
                                      >
                                        <PlanIcon className="h-4 w-4" />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent
                                      side="top"
                                      className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-900 dark:text-white dark:border-gray-700"
                                    >
                                      {isExternalViewer
                                        ? t("accountPortal.showPlan", { plan: planLabel })
                                        : t("accountPortal.showPlanWithStatus", { status: statusName, plan: planLabel })}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                            </div>
                          </SortableTableCell>
                        </SortableTableRow>
                      ))}
                    </SortableTableBody>
                  </SortableTable>
                </TooltipProvider>

                {/* Pagination */}
                <TablePaginationFooter
                  totalItems={customerProjects.length}
                  pageSize={itemsPerPage}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  entityLabel="projects"
                  className="mt-4"
                />
              </>
            )}
          </CardContent>
        </Card>
        </TabsContent>
        </Tabs>

        {/* MAP Drawer */}
        {selectedProjectId && (
          <MapDrawer
            open={isMapDrawerOpen}
            onOpenChange={(open) => {
              setIsMapDrawerOpen(open);
              if (!open) {
                setSelectedProjectId(null);
              }
            }}
            projectId={selectedProjectId}
            accessLevel={selectedProjectAccessLevel}
          />
        )}

        {/* Evaluation Request Dialog */}
        <EvaluationRequestDialog
          isOpen={isEvaluationDialogOpen}
          onClose={() => setIsEvaluationDialogOpen(false)}
          selectedCustomerId={selectedCustomer?.id}
          onRequestCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests'] });
            setIsEvaluationDialogOpen(false);
          }}
        />

        {/* Delete Document Confirmation Dialog (for customer-uploaded documents) */}
        <ConfirmationDialog
          open={documentToDelete !== null}
          onOpenChange={(open) => !open && setDocumentToDelete(null)}
          title="Delete Document"
          description={`Are you sure you want to delete "${documentToDelete?.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          onConfirm={() => {
            if (documentToDelete) {
              deleteDocumentMutation.mutate(documentToDelete.id);
            }
          }}
        />
      </div>
    </div>
  );
}

// Condensed Artifacts List Component for the overview grid
function CondensedArtifactsList({ customerId }: { customerId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{ id: number; name: string } | null>(null);
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());

  const toggleFlip = (docId: number) => {
    setFlippedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(docId)) {
        newSet.delete(docId);
      } else {
        newSet.add(docId);
      }
      return newSet;
    });
  };

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ["/api/customers", customerId, "documents"],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${customerId}/documents?limit=10&offset=0`);
      if (!response.ok) {
        throw new Error("Failed to fetch customer documents");
      }
      return response.json();
    },
    enabled: !!customerId,
  });

  const { data: products } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      return response.json();
    },
  });

  const { data: users } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const response = await fetch("/api/users");
      if (!response.ok) throw new Error("Failed to fetch users");
      return response.json();
    },
  });

  const documents = documentsData?.items || [];

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getUploaderName = (uploadedById: number | null) => {
    if (!uploadedById || !users) return "Unknown";
    const user = users.find((u: any) => u.id === uploadedById);
    if (!user) return "Unknown";
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Unknown";
  };

  const handleDownload = (doc: any) => {
    try {
      const downloadUrl = `/api/documents/${doc.id}/download`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = doc.fileName || doc.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      showErrorToast("Error downloading file");
    }
  };

  const handleDelete = (doc: any) => {
    setPendingDeleteDoc({ id: doc.id, name: doc.givenName });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteDoc) return;
    try {
      const response = await fetch(`/api/documents/${pendingDeleteDoc.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to delete document");
      showSuccessToast("Document deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "documents"] });
    } catch (error) {
      showErrorToast("Error deleting document");
    } finally {
      setPendingDeleteDoc(null);
    }
  };

  const getFileExtension = (fileName: string) => {
    const ext = fileName?.split(".").pop()?.toUpperCase() || "FILE";
    return ext.length > 4 ? ext.slice(0, 4) : ext;
  };

  const getAccentColor = (fileName: string) => {
    const ext = fileName?.split(".").pop()?.toLowerCase() || "";
    switch (ext) {
      case "xls":
      case "xlsx":
        return "border-l-green-500";
      case "doc":
      case "docx":
        return "border-l-blue-500";
      case "pdf":
        return "border-l-red-500";
      case "zip":
      case "rar":
      case "7z":
        return "border-l-black";
      case "csv":
        return "border-l-orange-500";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
      case "webp":
      case "svg":
      case "bmp":
      case "ico":
        return "border-l-purple-500";
      default:
        return "border-l-slate-400";
    }
  };

  const getProductName = (productId: number) => {
    const product = products?.find((p: any) => p.id === productId);
    return product?.name || null;
  };

  if (isLoading) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">Loading...</p>;
  }

  if (documents.length === 0) {
    return <p className="text-xs text-slate-500 dark:text-slate-400 italic">No artifacts uploaded</p>;
  }

  return (
    <TooltipProvider delayDuration={200}>
      {documents.slice(0, 5).map((doc: any) => {
        const ext = getFileExtension(doc.fileName || doc.originalName);
        const accentColor = getAccentColor(doc.fileName || doc.originalName);
        const displayName = doc.givenName || doc.originalName;
        const isFlipped = flippedCards.has(doc.id);
        const fileName = doc.fileName || doc.originalName;
        const fileSize = formatSize(doc.fileSize || 0);
        const uploadDate = doc.uploadedAt || doc.createdAt 
          ? new Date(doc.uploadedAt || doc.createdAt).toLocaleDateString() 
          : "Unknown";
        const uploader = getUploaderName(doc.uploadedById);
        
        return (
          <Tooltip key={doc.id}>
            <TooltipTrigger asChild>
              <div
                className="h-[36px] cursor-pointer"
                style={{ perspective: "1000px" }}
                onClick={() => toggleFlip(doc.id)}
              >
                <div
                  className="relative w-full h-full transition-transform duration-500"
                  style={{
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                  }}
                >
                  {/* Front Face */}
                  <div
                    className={`absolute inset-0 flex items-center gap-2 px-2 py-1.5 rounded-lg border-l-4 ${accentColor} bg-slate-100/80 dark:bg-slate-800/50 shadow-sm`}
                    style={{ backfaceVisibility: "hidden" }}
                  >
                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase shrink-0">
                      {ext}:
                    </span>
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate flex-1 min-w-0">
                      {displayName}
                    </p>
                    {doc.documentType && (
                      <Badge className="text-[9px] px-1.5 py-0 h-4 shrink-0 bg-gray-700 text-white border-gray-700 dark:bg-gray-600 dark:border-gray-600">
                        {doc.documentType}
                      </Badge>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => { e.stopPropagation(); handleDownload(doc); }}
                          >
                            <Download className="h-3 w-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Download</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">Delete</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
              
                  {/* Back Face */}
                  <div
                    className={`absolute inset-0 flex items-center gap-3 px-2 py-1.5 rounded-lg border-l-4 ${accentColor} bg-slate-100/80 dark:bg-slate-800/50 shadow-sm`}
                    style={{ 
                      backfaceVisibility: "hidden",
                      transform: "rotateY(180deg)",
                    }}
                  >
                    <p className="text-[10px] text-slate-700 dark:text-slate-300 truncate flex-1 min-w-0" title={fileName}>
                      {fileName}
                    </p>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">
                      {fileSize}
                    </span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0">
                      {uploadDate}
                    </span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 shrink-0 truncate max-w-[60px]" title={uploader}>
                      {uploader}
                    </span>
                  </div>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Click to See Full File Details
            </TooltipContent>
          </Tooltip>
        );
      })}
      
      {documents.length > 5 && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
          +{documents.length - 5} more artifacts
        </p>
      )}

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Document"
        description={`Are you sure you want to delete "${pendingDeleteDoc?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </TooltipProvider>
  );
}

// Customer Artifacts Table Component
function CustomerArtifactsTable({ customerId }: { customerId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{ id: number; name: string } | null>(null);

  const limit = 10;
  const offset = (currentPage - 1) * limit;

  // Sorting configuration
  const { sortConfig, handleSort } = useSortState();

  const { data: documentsData, isLoading } = useQuery({
    queryKey: ["/api/customers", customerId, "documents", { limit, offset }],
    queryFn: async () => {
      const response = await fetch(
        `/api/customers/${customerId}/documents?limit=${limit}&offset=${offset}`,
      );
      if (!response.ok) {
        throw new Error("Failed to fetch customer documents");
      }
      return response.json();
    },
    enabled: !!customerId,
  });

  // Fetch customer details to get the customer folder name
  const { data: customer } = useQuery({
    queryKey: ["/api/customers", customerId],
    queryFn: async () => {
      const response = await fetch(`/api/customers/${customerId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch customer details");
      }
      return response.json();
    },
    enabled: !!customerId,
  });

  const documents = documentsData?.items || [];
  const totalDocuments = documentsData?.total || 0;
  const totalPages = Math.ceil(totalDocuments / limit);

  // Filter documents to only show those from the specific customer's folder
  const customerSpecificDocuments = documents.filter((doc: any) => {
    if (!customer?.businessName) return false;
    // Check if the document's customerFolder matches this customer's folder
    const expectedFolderName = customer.businessName
      .replace(/[^a-zA-Z0-9]/g, "_")
      .toLowerCase();
    return (
      doc.customerFolder === expectedFolderName ||
      doc.customerFolder === customer.businessName
    );
  });

  // Apply sorting
  const sortedDocuments = sortConfig
    ? stableSort(customerSpecificDocuments, makeComparator(sortConfig))
    : customerSpecificDocuments;

  const handleDownload = (doc: any) => {
    try {
      const downloadUrl = `/api/documents/${doc.id}/download`;
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = doc.fileName || doc.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      showErrorToast("Error downloading file");
    }
  };

  const handleEdit = (doc: any) => {
    // TODO: Implement edit functionality
    showInfoToast("Edit functionality coming soon");
  };

  const handleDelete = (doc: any) => {
    setPendingDeleteDoc({ id: doc.id, name: doc.givenName });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteDoc) return;

    try {
      const response = await fetch(`/api/documents/${pendingDeleteDoc.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete document");
      }

      showSuccessToast("Document deleted successfully");
      queryClient.invalidateQueries({
        queryKey: ["/api/customers", customerId, "documents"],
      });
    } catch (error) {
      showErrorToast("Error deleting document");
    } finally {
      setPendingDeleteDoc(null);
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-4 dark:text-gray-300">
        Loading documents...
      </div>
    );
  }

  if (sortedDocuments.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No customer-specific documents uploaded yet</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <SortableTable>
            <SortableTableHeader>
              <SortableTableRow>
                <SortableTableHead
                  sortKey="givenName"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  tooltipText="Click to sort by document name"
                  className="text-left p-3"
                >
                  Name
                </SortableTableHead>
                <SortableTableHead
                  sortKey="documentType"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  tooltipText="Click to sort by document type"
                  className="text-left p-3"
                >
                  Type
                </SortableTableHead>
                <SortableTableHead
                  sortKey="fileSize"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  tooltipText="Click to sort by file size"
                  className="text-left p-3"
                >
                  Size
                </SortableTableHead>
                <SortableTableHead
                  sortKey="uploadedAt"
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  tooltipText="Click to sort by upload date"
                  className="text-left p-3"
                >
                  Uploaded
                </SortableTableHead>
                <SortableTableHead
                  sortKey=""
                  sortConfig={sortConfig}
                  onSort={handleSort}
                  className="text-right p-3"
                  sortable={false}
                >
                  Actions
                </SortableTableHead>
              </SortableTableRow>
            </SortableTableHeader>
            <SortableTableBody>
              {sortedDocuments.map((doc: any) => (
                <SortableTableRow
                  key={doc.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <SortableTableCell className="p-3">
                    <div>
                      <div className="font-medium">{doc.givenName}</div>
                      {doc.description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {doc.description}
                        </div>
                      )}
                    </div>
                  </SortableTableCell>
                  <SortableTableCell className="p-3">
                    <Badge
                      variant="outline"
                      className="text-xs dark:border-gray-700 dark:text-gray-300"
                    >
                      {doc.documentType || "Other"}
                    </Badge>
                  </SortableTableCell>
                  <SortableTableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">
                    {formatFileSize(doc.fileSize)}
                  </SortableTableCell>
                  <SortableTableCell className="p-3 text-sm text-gray-600 dark:text-gray-400">
                    {new Date(
                      doc.uploadedAt || doc.createdAt,
                    ).toLocaleDateString()}
                  </SortableTableCell>
                  <SortableTableCell className="p-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="icon-button icon-button-ghost"
                            onClick={() => handleDownload(doc)}
                          >
                            <Download className="h-4 w-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-900 dark:text-white dark:border-gray-700"
                        >
                          <p>Download document</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="icon-button icon-button-ghost"
                            onClick={() => handleEdit(doc)}
                          >
                            <Edit className="h-4 w-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-900 dark:text-white dark:border-gray-700"
                        >
                          <p>Edit document</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="icon-button icon-button-danger"
                            onClick={() => handleDelete(doc)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-900 dark:text-white dark:border-gray-700"
                        >
                          <p>Delete document</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </SortableTableCell>
                </SortableTableRow>
              ))}
            </SortableTableBody>
          </SortableTable>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {offset + 1}-{Math.min(offset + limit, totalDocuments)} of{" "}
              {totalDocuments} documents
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => prev - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => prev + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
        {/* Delete Document Confirmation Dialog */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Document"
          description={`Are you sure you want to delete "${pendingDeleteDoc?.name}"?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDeleteDoc(null)}
          variant="destructive"
        />
      </div>
    </TooltipProvider>
  );
}

// Helper functions
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function downloadDocument(document: any) {
  if (document.fileData) {
    // Base64 download
    try {
      const byteCharacters = atob(document.fileData.split(",")[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        document.originalName || document.fileName || document.givenName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  } else {
    // File download endpoint
    window.open(`/api/documents/${document.id}/download`, "_blank");
  }
}
