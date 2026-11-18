import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCustomerStatusConfigRealtime } from "@/hooks/useConfigRealtime";
import { usePermissions } from "@/hooks/usePermissions";
import { apiRequest } from "@/lib/queryClient";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { formatDateForDisplay, getDateStatus, getStartDateStatus, parseProjectDate, getTodayInTimezone, calculateDaysDiff } from "@/lib/date-utils";
import { EndDateBadge } from "@/components/shared/end-date-badge";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SortableTable,
  SortableTableHead,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { Plus, Eye, Edit, Paperclip, ExternalLink, Trash2, Search, History, Target, Waypoints, CalendarHeart, CalendarClock, CalendarX2, FileCog, CalendarArrowUp, CalendarArrowDown, CalendarX, ClipboardClock, CircleCheckBig, BadgeHelp, ClockAlert, Hourglass, MessageCircleWarning, Users, Binoculars, Pin, FolderOpenDot, ChartNetwork, Building, Calendar, FolderOpen, Server, ServerCog, ServerCrash, SquareKanban, Orbit, CheckCircle2, XCircle } from "lucide-react";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { SearchFiltersSection, FilterLabel, FilterMultiSelectButton } from "@/components/ui/search-filters-section";
import { Link } from "wouter";
import { CUSTOMER_STATUS_NEUTRAL_FALLBACK } from "@/lib/customerStatusUtils";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import { TAPDrawer } from "@/components/project-detail/TAPDrawer";
import { GapDrawer } from "@/components/gap-analysis/GapDrawer";
import { AuditHistoryDrawer } from "@/components/project-detail/audit-history-drawer";
import { AlignVerticalSpaceAround } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import ProjectsSection from "@/components/projects/ProjectsSection";
import ArtifactsSection from "@/components/artifacts/ArtifactsSection";
import { ResourceContentSection } from "@/components/resource-content/ResourceContentSection";
import { ComplianceSection } from "@/components/configuration/ComplianceSection";
import { AccountsSection } from "@/components/accounts";
import { redirectToSignIn } from "@/lib/sign-in-redirect";


interface Project {
  id: number;
  customerName: string;
  solutionName: string;
  status: string;
  customerStatus?: string;
  risk: string;
  ranking: string;
  type?: string;
  environment?: string;
  industry?: string;
  customerLogo?: string;
  auditCount?: string;
  primarySe?: {
    id: number;
    name: string;
  };
  specialistSe?: {
    id: number;
    name: string;
  };
  supportingSalesEngineers?: Array<{
    id: number;
    name: string;
  }>;
  products?: Array<{
    id: number;
    name: string;
  }>;
  successCriteria?: Array<{
    id: number;
    criterion: string;
    productName?: string;
  }>;
  attachments?: Array<{
    id: number;
    filename: string;
  }>;
  endDate?: string;
  startDate?: string;
  // TAP (Technical Activity Plan) fields
  salesStage?: string | null;
  forecastCategory?: string | null;
  mgmtNotes?: string | null;
  currentSituation?: string | null;
  engineerNotes?: string | null;
  tapTccApproved?: boolean | null;
}


export default function Project() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Listen for real-time customer status config updates
  useCustomerStatusConfigRealtime();
  const { canView: canViewSection } = usePermissions();

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
  const [sortField, setSortField] = useState<string>("id");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);

  // State for MAP drawer
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  
  // State for TAP drawer - use projectId pattern so drawer fetches fresh data
  const [isTAPDrawerOpen, setIsTAPDrawerOpen] = useState(false);
  const [tapProjectId, setTapProjectId] = useState<number | null>(null);
  const [isGapDrawerOpen, setIsGapDrawerOpen] = useState(false);
  const [gapProjectId, setGapProjectId] = useState<number | null>(null);
  const [gapProjectName, setGapProjectName] = useState<string>("");
  const [gapProjectSolutions, setGapProjectSolutions] = useState<string[]>([]);
  
  // Delete project confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<{ id: number; name: string } | null>(null);

  // Audit history drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [auditProjectId, setAuditProjectId] = useState<number | null>(null);
  const [auditProjectName] = useState<string>("");

  // Valid top-level tabs (legacy project-board, calendar, map, gap-analysis, outcome-intelligence are now handled within ProjectsSection).
  // Login Management moved to Admin › Team & People (admin-redirects.ts).
  const baseTabs = ['validation', 'users', 'customers', 'templates', 'map-library', 'artifacts', 'resource-content', 'compliance'];
  const validTopLevelTabs = baseTabs;
  
  // Legacy tabs that should redirect to validation (now handled as subtabs within ProjectsSection)
  const legacySubtabs = ['project-board', 'calendar', 'map', 'gap-analysis', 'outcome-intelligence'];

  // Compute initial tab from URL
  const getInitialTab = () => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    return tabParam && baseTabs.includes(tabParam) ? tabParam : 'validation';
  };

  // State for tab navigation - initialized with URL-aware logic (safe defaults)
  const [activeTab, setActiveTab] = useState(getInitialTab);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');

    if (tabParam) {
      if (validTopLevelTabs.includes(tabParam)) {
        setActiveTab(tabParam);
      } else if (legacySubtabs.includes(tabParam)) {
        // Redirect legacy top-level tabs to validation with proper subtab
        setActiveTab('validation');
        const newParams = new URLSearchParams();
        newParams.set('tab', 'validation');
        newParams.set('subtab', tabParam);
        const existingSubtab2 = urlParams.get('subtab');
        if (existingSubtab2) newParams.set('subtab2', existingSubtab2);
        window.history.replaceState(null, '', `/project?${newParams.toString()}`);
      }
    }
  }, [location, user, validTopLevelTabs]);

  // Listen for navigation from sidebar accordion
  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam) {
        if (validTopLevelTabs.includes(tabParam)) {
          setActiveTab(tabParam);
        } else if (legacySubtabs.includes(tabParam)) {
          // Redirect legacy top-level tabs to validation with proper subtab
          setActiveTab('validation');
          const newParams = new URLSearchParams();
          newParams.set('tab', 'validation');
          newParams.set('subtab', tabParam);
          // Preserve subtab2 if present (for Outcome Intelligence deep links)
          const existingSubtab2 = urlParams.get('subtab');
          if (existingSubtab2) newParams.set('subtab2', existingSubtab2);
          window.history.replaceState(null, '', `/project?${newParams.toString()}`);
        }
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, [user?.role, validTopLevelTabs]);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const newUrl = `/project?tab=${value}`;
    window.history.pushState(null, '', newUrl);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  // Fetch Projects
  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  // Fetch status configs for color mapping
  const { data: statusConfigs = [] } = useQuery({
    queryKey: ["/api/status-configs"],
    enabled: isAuthenticated,
  });

  // Fetch customer status configurations for color mapping
  const { data: customerStatusConfigs = [] } = useQuery({
    queryKey: ["/api/customer-status-configs"],
    enabled: isAuthenticated,
  });

  // Create lookup map for customer status configs
  const customerStatusConfigMap = useMemo(() => {
    const map = new Map();
    (customerStatusConfigs as any[]).forEach((config: any) => {
      map.set(config.name, { icon: config.icon, color: config.color });
    });
    return map;
  }, [customerStatusConfigs]);

  // Get customer status config by name
  const getCustomerStatusConfig = (statusName: string) => {
    return customerStatusConfigMap.get(statusName) || CUSTOMER_STATUS_NEUTRAL_FALLBACK;
  };

  // Fetch industries for filtering
  const { data: industries = [] } = useQuery({
    queryKey: ["/api/industries"],
    enabled: isAuthenticated,
  });

  // Fetch products for filtering
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  // Fetch customers for modal display
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
    enabled: isAuthenticated,
  });

  // Fetch users for engineer filtering
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    enabled: isAuthenticated,
  });

  // Helper function to get product info (name and icon) from products database
  const getProductInfo = (solutionName: string) => {
    // Return null for empty strings (defensive check)
    if (!solutionName || !solutionName.trim()) {
      return null;
    }
    
    // Try exact match first
    let product = (products as any[])?.find((p: any) => p.name === solutionName);
    
    // If no exact match, try case-insensitive match
    if (!product) {
      product = (products as any[])?.find((p: any) => p.name.toLowerCase() === solutionName.toLowerCase());
    }
    
    // If still no match, try partial matching (e.g., "Acme Auditor" matches "Auditor")
    if (!product) {
      const lowerSolution = solutionName.toLowerCase();
      product = (products as any[])?.find((p: any) => {
        const lowerProduct = p.name.toLowerCase();
        // Check if solution name contains product name or vice versa (but not empty strings)
        return lowerProduct.length > 0 && (lowerSolution.includes(lowerProduct) || lowerProduct.includes(lowerSolution));
      });
    }
    
    // Return the current product name and icon from database, or fallback to template name
    return {
      name: product?.name || solutionName,
      icon: product?.solutionIcon,
      iconName: product?.solutionIconName ?? null,
    };
  };

  // Get status config (name, icon, color) from config
  const getStatusConfig = (status: string) => {
    return (statusConfigs as any[]).find((s: any) => s.name.toLowerCase() === status.toLowerCase()) || {
      name: status,
      icon: null,
      color: "#64748B"
    };
  };

  // Get risk color
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "Red": return "#ef4444";
      case "Yellow": return "#eab308";
      case "None": return "#22c55e"; // Green color for None
      default: return "#22c55e";
    }
  };

  // Get risk icon and color
  const getRiskIcon = (risk: string) => {
    switch (risk) {
      case "Red":
        return { icon: ServerCrash, color: "text-red-500" };
      case "Yellow":
        return { icon: ServerCog, color: "text-yellow-500" };
      case "None":
        return { icon: Server, color: "text-green-500" };
      default:
        return { icon: Server, color: "text-green-500" };
    }
  };

  // Get ranking icon and color
  const getRankingIcon = (ranking: string) => {
    switch (ranking) {
      case "In Quarter":
        return { icon: CalendarHeart, color: "text-green-600" };
      case "Upside":
        return { icon: CalendarArrowUp, color: "text-blue-600" };
      case "Stretch":
        return { icon: CalendarArrowDown, color: "text-yellow-600" };
      case "Out Quarter":
        return { icon: CalendarClock, color: "text-orange-600" };
      case "Burn it Down":
        return { icon: CalendarX, color: "text-red-600" };
      default:
        return { icon: CalendarHeart, color: "text-green-600" };
    }
  };

  // Update Project mutation
  const updateProjectMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PUT", `/api/projects/${id}`, updates);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update project",
        variant: "error",
        icon: XCircle,
      });
    },
  });

  // Handle field updates with optimistic updates
  const handleFieldUpdate = (projectId: number, field: string, value: string) => {
    // Optimistically update the cache before the mutation
    queryClient.setQueryData(["/api/projects"], (oldData: any[]) => {
      if (!oldData) return oldData;
      return oldData.map((project: any) => 
        project.id === projectId 
          ? { ...project, [field]: value }
          : project
      );
    });

    updateProjectMutation.mutate({
      id: projectId,
      updates: { [field]: value },
    }, {
      onSuccess: (data) => {
        // Update the cache with the successful response to ensure consistency
        queryClient.setQueryData(["/api/projects"], (oldData: any[]) => {
          if (!oldData) return oldData;
          return oldData.map((project: any) => 
            project.id === projectId 
              ? { ...project, ...data }
              : project
          );
        });
      },
      onError: () => {
        // Revert the optimistic update on error by invalidating the query
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
    });
  };

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      redirectToSignIn();
      return;
    }
  }, [isAuthenticated, authLoading, toast]);

  // Sorting function
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort Projects
  const filteredAndSortedProjects = useMemo(() => {
    let filtered = (projects as any[]).filter((project: any) => {
      const matchesSearch = !searchTerm || 
        project.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.solutionName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || (project.status && project.status.toLowerCase() === statusFilter.toLowerCase());
      const matchesCustomerStatus = customerStatusFilter === "all" || (project.customerStatus && project.customerStatus.toLowerCase() === customerStatusFilter.toLowerCase());
      const matchesCustomer = customerFilter === "all" || project.customerName === customerFilter;
      const matchesRisk = riskFilter === "all" || project.risk === riskFilter;
      const matchesRanking = rankingFilter === "all" || project.ranking === rankingFilter;
      const matchesEnvironment = environmentFilter === "all" || project.environment === environmentFilter;

      // Check if project solutions match the selected solutions from Success Criteria
      const matchesProduct = productFilter.length === 0 || 
        (project.successCriteria && project.successCriteria.some((criteria: any) => 
          productFilter.includes(criteria.productName)
        ));

      // Check primary engineer filter
      const matchesPrimaryEngineer = primaryEngineerFilter.length === 0 || 
        (project.primarySe && primaryEngineerFilter.includes(project.primarySe.id?.toString()));

      // Check specialist engineer filter  
      const matchesSpecialistEngineer = specialistEngineerFilter.length === 0 || 
        (project.specialistSe && specialistEngineerFilter.includes(project.specialistSe.id?.toString()));

      return matchesSearch && matchesStatus && matchesCustomerStatus && matchesCustomer && matchesRisk && matchesRanking && matchesEnvironment && matchesProduct && matchesPrimaryEngineer && matchesSpecialistEngineer;
    });

    // Sort the filtered results
    filtered.sort((a: any, b: any) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      // Handle special cases for sorting
      if (sortField === "primarySe") {
        aValue = a.primarySe?.name || "";
        bValue = b.primarySe?.name || "";
      } else if (sortField === "products") {
        aValue = a.products?.length || 0;
        bValue = b.products?.length || 0;
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
        bValue = bValue.toLowerCase();
      }

      if (sortDirection === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [projects, searchTerm, statusFilter, customerStatusFilter, customerFilter, riskFilter, rankingFilter, environmentFilter, productFilter, primaryEngineerFilter, specialistEngineerFilter, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredAndSortedProjects.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProjects = filteredAndSortedProjects.slice(startIndex, endIndex);

  // Calculate due date counts for CardDescription (timezone-aware)
  const getDueDateCounts = useMemo(() => {
    const userTimezone = user?.timezone || 'America/New_York';

    let dueToday = 0;
    let dueThisWeek = 0;
    let overdue = 0;

    filteredAndSortedProjects.forEach(project => {
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
        const isClosedOrCancelled = ['closed won', 'closed lost', 'cancelled'].includes(status || '');
        if (!isClosedOrCancelled) {
          overdue++;
        }
      }
    });

    return { dueToday, dueThisWeek, overdue };
  }, [filteredAndSortedProjects, user?.timezone]);

  // Reset to page 1 when filters change
  const allProjectTabs = [
    { id: "validation", section: "project.validation" },
    // Account Management: Account Directory and Account Users have their own permissions.
    { id: "customers", section: ["project.customers", "project.team-users"] },
    { id: "artifacts", section: "project.artifacts" },
    { id: "resource-content", section: "project.resource-content" },
    // Compliance keeps the permission it had on the Configuration page.
    { id: "compliance", section: "config.compliance" },
  ];

  const visibleProjectTabs = allProjectTabs.filter((tab) =>
    (typeof tab.section === "string" ? [tab.section] : tab.section).some((section) => canViewSection(section)),
  );

  useEffect(() => {
    if (visibleProjectTabs.length > 0 && !visibleProjectTabs.some(tab => tab.id === activeTab)) {
      handleTabChange(visibleProjectTabs[0].id);
    }
  }, [visibleProjectTabs.map(t => t.id).join(","), activeTab]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, customerStatusFilter, customerFilter, riskFilter, rankingFilter, environmentFilter, productFilter, primaryEngineerFilter, specialistEngineerFilter]);

  // Compute derived data
  const uniqueCustomers = [...new Set((projects as any[]).map((project: any) => project.customerName))];

  // Get unique solutions from Success Criteria
  const uniqueSolutions = [...new Set(
    (projects as any[]).flatMap((project: any) => 
      project.successCriteria?.map((criteria: any) => criteria.productName) || []
    )
  )].filter(Boolean);

  // Get engineers for filtering (only Engineer role)
  const engineers = (users as any[]).filter((user: any) => user.role === 'Engineer');

  // Helper function to format solution name properly
  const formatSolutionName = (solutionName: any) => {
    if (!solutionName) return 'No solution selected';

    if (Array.isArray(solutionName)) {
      return solutionName.join(', ');
    }

    if (typeof solutionName === 'string') {
      if (solutionName.startsWith('{')) {
        try {
          // Handle nested JSON strings
          let parsed = JSON.parse(solutionName);
          while (typeof parsed === 'string' && parsed.startsWith('{')) {
            parsed = JSON.parse(parsed);
          }
          if (Array.isArray(parsed)) {
            return parsed.join(', ');
          }
          // Extract readable values using regex if complex nested JSON
          const matches = solutionName.match(/([A-Za-z\s]+(?:Classification|Auditor|Manager|Protection|Analytics))/g);
          return matches ? matches.join(', ') : 'Multiple Solutions';
        } catch (e) {
          // Extract readable values using regex if JSON parsing fails
          const matches = solutionName.match(/([A-Za-z\s]+(?:Classification|Auditor|Manager|Protection|Analytics))/g);
          return matches ? matches.join(', ') : solutionName;
        }
      }
      return solutionName;
    }

    return String(solutionName);
  };


  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading Projects...</p>
        </div>
      </div>
    );
  }

  if (visibleProjectTabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Target className="h-12 w-12 text-gray-300 dark:text-gray-600 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Access Restricted</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You don't have permission to view any project sections.</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

          {/* Validation Project Management Tab - Uses unified component with dynamic search/filters */}
          <TabsContent value="validation" className="mt-0 space-y-6">
            <ProjectsSection />
          </TabsContent>

          {/* Accounts Tab - Account Directory and Account Users */}
          <TabsContent value="customers" className="mt-0 space-y-6">
            <AccountsSection />
          </TabsContent>

          {/* Artifacts Tab */}
          <TabsContent value="artifacts" className="mt-0 space-y-6">
            <ArtifactsSection />
          </TabsContent>

          {/* Resource Content Tab (Knowledge): the Account Portal's Resources links */}
          <TabsContent value="resource-content" className="mt-0 space-y-6">
            <ResourceContentSection />
          </TabsContent>

          {/* Compliance Tab (Knowledge) */}
          <TabsContent value="compliance" className="mt-0 space-y-6">
            <ComplianceSection />
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
            accessLevel="view"
          />
        )}
        
        {/* TAP Drawer */}
        {tapProjectId && (
          <TAPDrawer
            open={isTAPDrawerOpen}
            onOpenChange={(open) => {
              setIsTAPDrawerOpen(open);
              if (!open) {
                setTapProjectId(null);
              }
            }}
            projectId={tapProjectId}
            onUpdate={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
            }}
          />
        )}
        
        {/* Gap Drawer */}
        {gapProjectId && (
          <GapDrawer
            open={isGapDrawerOpen}
            onOpenChange={(open) => {
              setIsGapDrawerOpen(open);
              if (!open) {
                setGapProjectId(null);
                setGapProjectName("");
                setGapProjectSolutions([]);
              }
            }}
            projectId={gapProjectId}
            projectName={gapProjectName}
            projectSolutions={gapProjectSolutions}
          />
        )}

        {/* Delete Project Confirmation Dialog */}
        <ConfirmationDialog
          open={deleteConfirmOpen}
          onOpenChange={setDeleteConfirmOpen}
          title="Delete Project"
          description={`Are you sure you want to delete the project "${pendingDeleteProject?.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={async () => {
            if (!pendingDeleteProject) return;
            try {
              await apiRequest("DELETE", `/api/projects/${pendingDeleteProject.id}`);
              queryClient.setQueryData(["/api/projects"], (oldData: any) => {
                if (!oldData) return oldData;
                return oldData.filter((project: any) => project.id !== pendingDeleteProject.id);
              });
              queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
              toast({
                title: "Success",
                description: "Project deleted successfully",
                variant: "success",
                icon: CheckCircle2,
              });
            } catch (error: any) {
              toast({
                title: "Error",
                description: error.message || "Failed to delete project",
                variant: "error",
                icon: XCircle,
              });
            }
            setPendingDeleteProject(null);
          }}
          onCancel={() => setPendingDeleteProject(null)}
          variant="destructive"
        />

        {/* Audit History Drawer */}
        {auditProjectId !== null && (
          <AuditHistoryDrawer
            key={`audit-${auditProjectId}`}
            open={auditDrawerOpen}
            onOpenChange={setAuditDrawerOpen}
            projectId={auditProjectId}
            customerName={auditProjectName}
          />
        )}
      </div>
    </TooltipProvider>
  );
}