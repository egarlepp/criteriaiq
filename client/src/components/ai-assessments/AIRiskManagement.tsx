import { useState, useEffect, useMemo } from "react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SortableTable, SortableTableHeader, SortableTableHead, SortableTableBody, SortableTableRow, SortableTableCell } from "@/components/ui/sortable-table";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { RiskDistributionBar, type RiskLevel } from "@/components/dashboard-widgets/RiskDistributionBar";
import { RecentRunsFeed } from "@/components/dashboard-widgets/RecentRunsFeed";
import { 
  Brain, 
  AlertTriangle, 
  RefreshCw, 
  PlayCircle,
  BarChart3,
  Info,
  SquarePen,
  AlertCircle,
  Target,
  BrainCircuit,
  Search,
  History,
  FileText,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Cpu,
  ChevronRight,
  ChevronDown,
  Code,
  Eye,
  EyeOff,
  MessageSquareText,
  Copy,
  Layers,
  Users2,
  UserCheck,
  Settings2,
  Gauge,
  Activity,
  ShieldAlert,
  Package,
  Handshake,
  LayoutGrid,
  Wrench,
  ClipboardCheck,
  GraduationCap,
  BookOpen,
  Zap
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient"; // apiRequest might be unused if direct fetch is used
import { useSortState } from "@/lib/sorting";
import { RiskCriteriaForm } from "@/components/ai-assessments/risk-criteria-form";
import { AssessmentRulesetForm } from "@/components/ai-assessments/assessment-ruleset-form";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AI_PROVIDER_ICONS, AI_PROVIDER_COLORS } from "@/components/icons/ai-provider-icons";
import { Separator } from "@/components/ui/separator";
import type { RiskCriteria, ProjectRiskPrediction } from "@shared/schema";
import { createEnhancedErrorHandler, handleNetworkError } from '@/lib/error-utils'; // Import error handling utilities
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { DocsSourceManagement } from "@/components/ai-assessments/docs-source-management";
import { AssessmentJobsCard } from "@/components/ai-assessments/assessment-jobs-card";
import { ScheduleCreatorDialog } from "@/components/automation/ScheduleCreatorDialog";
export default function AIRisk() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { sortConfig, handleSort } = useSortState();
  
  // Pagination state for criteria table
  const [criteriaCurrentPage, setCriteriaCurrentPage] = useState(1);
  const criteriaItemsPerPage = 10;
  
  // Project selection dialog state
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [dialogProjectFilter, setDialogProjectFilter] = useState<"all" | "active" | "closed">("all");
  const [analyzeMode, setAnalyzeMode] = useState<'run_now' | 'schedule'>('run_now');
  const [scheduleCreatorOpen, setScheduleCreatorOpen] = useState(false);

  // URL and tab state management
  const [location] = useLocation();
  const [activeTab, setActiveTab] = useState("projects");

  // Risk distribution filter state
  const [riskLevelFilter, setRiskLevelFilter] = useState<RiskLevel | null>(null);
  
  // Assessment job filter state
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [jobProjectFilter, setJobProjectFilter] = useState<number[] | null>(null);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteCriteriaId, setPendingDeleteCriteriaId] = useState<number | null>(null);

  // Ruleset state
  const [selectedRulesetId, setSelectedRulesetId] = useState<number | null>(null);
  const [deleteRulesetConfirmOpen, setDeleteRulesetConfirmOpen] = useState(false);
  const [pendingDeleteRulesetId, setPendingDeleteRulesetId] = useState<number | null>(null);

  // Analysis ruleset selection state
  const [selectedAnalysisRulesetId, setSelectedAnalysisRulesetId] = useState<number | null>(null);

  // Audit drawer state
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  const [selectedAuditProjectId, setSelectedAuditProjectId] = useState<number | null>(null);
  const [selectedAuditProject, setSelectedAuditProject] = useState<any>(null);
  const [showRawPrompt, setShowRawPrompt] = useState(false);
  const [showRawResponse, setShowRawResponse] = useState(false);
  const [expandedHistoryRaw, setExpandedHistoryRaw] = useState<Record<number, 'prompt' | 'response' | null>>({});
  const [historyPage, setHistoryPage] = useState(0);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<number>>(new Set());
  const [selectedReportPredictionId, setSelectedReportPredictionId] = useState<number | null>(null);
  const historyPageSize = 5;

  // Extract tab from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['projects', 'criteria', 'docs'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [location]);

  // Listen for navigation from sidebar accordion
  useEffect(() => {
    const handleNavigation = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab');
      if (tabParam && ['projects', 'criteria', 'docs'].includes(tabParam)) {
        setActiveTab(tabParam);
      }
    };

    window.addEventListener('popstate', handleNavigation);
    return () => window.removeEventListener('popstate', handleNavigation);
  }, []);

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const newUrl = `/ai-risk-management?tab=${value}`;
    window.history.pushState(null, '', newUrl);
  };

  // Initialize risk criteria
  const initializeRiskMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/risk/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMessage = data.message || `HTTP ${response.status}: ${response.statusText}`;
        console.error('Risk Initialization Error:', {
          status: response.status,
          message: errorMessage,
          data: data
        });

        const enhancedError = new Error(errorMessage);
        (enhancedError as any).status = response.status;
        (enhancedError as any).details = data.details || {};
        throw enhancedError;
      }
      return data;
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment criteria initialized successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/risk/criteria'] });
    },
    onError: (error: any) => {
      console.error('Risk Initialization Failed:', error);

      let description = "Failed to initialize assessment criteria";
      if (error.status === 403) {
        description = "Administrator access required to initialize assessment criteria";
      } else if (error.message) {
        description = error.message;
      }

      showErrorToast("Error", description);
    }
  });


  // Fetch risk criteria with enhanced error handling
  const { 
    data: criteria = [], 
    isLoading: criteriaLoading, 
    error: criteriaError, 
    refetch: refetchCriteria,
    isError: criteriaIsError
  } = useQuery<RiskCriteria[]>({
    queryKey: ['/api/risk/criteria'],
    enabled: isAuthenticated,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 or 403 errors
      if (error?.status === 404 || error?.status === 403) return false;
      return failureCount < 2; // Retry up to 2 times for other errors
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff with max 30s
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Paginated criteria
  const paginatedCriteria = useMemo(() => {
    if (!criteria || criteria.length === 0) return [];
    const startIndex = (criteriaCurrentPage - 1) * criteriaItemsPerPage;
    const endIndex = startIndex + criteriaItemsPerPage;
    return criteria.slice(startIndex, endIndex);
  }, [criteria, criteriaCurrentPage, criteriaItemsPerPage]);

  // Clamp current page when data shrinks
  useEffect(() => {
    if (!criteria) return;
    const totalPages = Math.ceil(criteria.length / criteriaItemsPerPage);
    if (criteriaCurrentPage > totalPages && totalPages > 0) {
      setCriteriaCurrentPage(totalPages);
    }
  }, [criteria?.length, criteriaCurrentPage, criteriaItemsPerPage]);

  // Fetch projects with enhanced error handling
  const { 
    data: projects = [], 
    isLoading: projectsLoading, 
    error: projectsError, 
    refetch: refetchProjects,
    isError: projectsIsError
  } = useQuery({
    queryKey: ['/api/projects'],
    enabled: isAuthenticated,
    retry: (failureCount, error: any) => {
      // Don't retry on 404 or 403 errors
      if (error?.status === 404 || error?.status === 403) return false;
      return failureCount < 2; // Retry up to 2 times for other errors
    },
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff with max 30s
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  const { 
    data: rawRiskPredictions = [],
    isLoading: predictionsLoading,
  } = useQuery<ProjectRiskPrediction[]>({
    queryKey: ['/api/risk/predictions', selectedAuditProjectId],
    queryFn: async () => {
      const response = await fetch(`/api/risk/predictions/${selectedAuditProjectId}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch predictions');
      return response.json();
    },
    enabled: !!selectedAuditProjectId && auditDrawerOpen,
    staleTime: 30 * 1000,
  });

  const riskPredictions = useMemo(() => {
    return [...rawRiskPredictions].sort((a: any, b: any) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [rawRiskPredictions]);

  useEffect(() => {
    if (riskPredictions.length > 0) {
      const latestId = riskPredictions[0].id;
      setExpandedHistoryIds(new Set([latestId]));
      setSelectedReportPredictionId(latestId);
      setHistoryPage(0);
      setShowRawPrompt(false);
      setShowRawResponse(false);
      setExpandedHistoryRaw({});
    }
  }, [riskPredictions]);

  const selectedReportPrediction = useMemo(() => {
    if (selectedReportPredictionId === null) return null;
    return riskPredictions.find((p: any) => p.id === selectedReportPredictionId) || null;
  }, [selectedReportPredictionId, riskPredictions]);

  const totalHistoryPages = Math.max(1, Math.ceil(riskPredictions.length / historyPageSize));

  const clampedHistoryPage = Math.min(historyPage, totalHistoryPages - 1);

  const paginatedPredictions = useMemo(() => {
    const start = clampedHistoryPage * historyPageSize;
    return riskPredictions.slice(start, start + historyPageSize);
  }, [riskPredictions, clampedHistoryPage]);

  // Delete risk criteria mutation
  const deleteCriteriaMutation = useMutation({
    mutationFn: async (criteriaId: number) => {
      const response = await fetch(`/api/risk/criteria/${criteriaId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete assessment criteria');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment criteria deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/risk/criteria'] });
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete assessment criteria");
    }
  });

  // Fetch all rulesets
  const { data: rulesets = [], isLoading: rulesetsLoading } = useQuery({
    queryKey: ['/api/assessment/rulesets'],
    queryFn: async () => {
      const response = await fetch('/api/assessment/rulesets', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch rulesets');
      return response.json();
    },
    enabled: isAuthenticated,
  });

  const { data: projectStatusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/status-configs"],
    queryFn: async () => {
      const response = await fetch('/api/status-configs', { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch criteria for selected ruleset
  const { data: rulesetCriteria = [], isLoading: rulesetCriteriaLoading } = useQuery<RiskCriteria[]>({
    queryKey: ['/api/assessment/rulesets', selectedRulesetId, 'criteria'],
    queryFn: async () => {
      const response = await fetch(`/api/assessment/rulesets/${selectedRulesetId}/criteria`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch criteria');
      return response.json();
    },
    enabled: !!selectedRulesetId,
  });

  // Auto-select first ruleset when data loads
  useEffect(() => {
    if (rulesets.length > 0 && selectedRulesetId === null) {
      setSelectedRulesetId(rulesets[0].id);
    }
  }, [rulesets, selectedRulesetId]);

  // Paginated ruleset criteria
  const paginatedRulesetCriteria = useMemo(() => {
    if (!rulesetCriteria || rulesetCriteria.length === 0) return [];
    const startIndex = (criteriaCurrentPage - 1) * criteriaItemsPerPage;
    const endIndex = startIndex + criteriaItemsPerPage;
    return rulesetCriteria.slice(startIndex, endIndex);
  }, [rulesetCriteria, criteriaCurrentPage, criteriaItemsPerPage]);

  // Delete ruleset mutation
  const deleteRulesetMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/assessment/rulesets/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!response.ok) throw new Error('Failed to delete ruleset');
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment ruleset deleted successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
      setSelectedRulesetId(null);
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to delete assessment ruleset");
    }
  });

  // Clone ruleset mutation
  const cloneRulesetMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const response = await fetch(`/api/assessment/rulesets/${id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name })
      });
      if (!response.ok) throw new Error('Failed to clone ruleset');
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment ruleset cloned successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to clone assessment ruleset");
    }
  });

  const selectedRuleset = useMemo(() => {
    return rulesets.find((r: any) => r.id === selectedRulesetId) || null;
  }, [rulesets, selectedRulesetId]);

  const rulesetCategoryConfig: Record<string, { icon: React.FC<any>; color: string; badgeClass: string; label: string }> = {
    risk: { icon: ShieldAlert, color: "#ef4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: "Risk" },
    product: { icon: Package, color: "#3b82f6", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: "Product" },
    engagement: { icon: Handshake, color: "#22c55e", badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: "Engagement" },
    general: { icon: LayoutGrid, color: "#6b7280", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", label: "General" },
    technical: { icon: Wrench, color: "#8b5cf6", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", label: "Technical" },
    compliance: { icon: ClipboardCheck, color: "#f97316", badgeClass: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: "Compliance" },
    coachiq: { icon: GraduationCap, color: "#0ea5e9", badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", label: "CoachIQ" },
  };

  const getCategoryBadgeColor = (category: string) => {
    return rulesetCategoryConfig[category]?.badgeClass || 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const criteriaCategoryConfig: Record<string, { icon: React.FC<any>; color: string; badgeClass: string; label: string }> = {
    timeline: { icon: Clock, color: "#ef4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800", label: "Timeline Risk" },
    scheduling: { icon: Clock, color: "#ef4444", badgeClass: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800", label: "Timeline Risk" },
    technical: { icon: Cpu, color: "#8b5cf6", badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800", label: "Technical Complexity" },
    resource: { icon: Users2, color: "#3b82f6", badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800", label: "Resource Availability" },
    customer: { icon: UserCheck, color: "#22c55e", badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800", label: "Customer Engagement" },
    stakeholder: { icon: UserCheck, color: "#22c55e", badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800", label: "Customer Engagement" },
    success_criteria: { icon: Target, color: "#f59e0b", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800", label: "Success Criteria Definition" },
    requirements: { icon: Target, color: "#f59e0b", badgeClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800", label: "Success Criteria Definition" },
    performance: { icon: TrendingUp, color: "#06b6d4", badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800", label: "Past Performance" },
    historical: { icon: TrendingUp, color: "#06b6d4", badgeClass: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800", label: "Past Performance" },
    custom: { icon: Settings2, color: "#6b7280", badgeClass: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-800", label: "Custom Criteria" },
  };

  // Bulk analyze mutation with enhanced error handling
  const bulkAnalyzeMutation = useMutation({
    mutationFn: async (projectIds?: number[]) => {
      try {
        const response = await fetch('/api/risk/analyze-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            projectIds: projectIds && projectIds.length > 0 ? projectIds : undefined,
            rulesetId: selectedAnalysisRulesetId
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const error = new Error(errorData?.message || `HTTP ${response.status}: ${response.statusText}`);
          (error as any).status = response.status;
          (error as any).details = errorData?.details;
          (error as any).timestamp = errorData?.timestamp;
          throw error;
        }

        return response.json();
      } catch (error) {
        console.error('AI Assessment Analysis Failed:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assessment-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['/api/risk/recent-runs'] });
      const count = data?.projectsAnalyzed || data?.analyzed;
      showSuccessToast(
        "Success",
        `AI assessment analysis completed successfully. ${count !== undefined ? `${count} project${count !== 1 ? 's' : ''} analyzed.` : 'All projects were analyzed.'}`,
      );
      setAnalyzeDialogOpen(false);
      setSelectedProjectIds([]);
      setProjectSearchQuery("");
    },
    onError: createEnhancedErrorHandler({
      toast,
      context: 'AI Assessment Analysis',
      userId: user?.id,
      onRetry: () => bulkAnalyzeMutation.mutate(undefined), 
      fallbackAction: () => {
        refetchProjects();
      }
    }),
  });


  const closedStatuses = ['completed', 'cancelled', 'closed won', 'closed lost', 'archived'];

  const allProjects = useMemo(() => {
    return Array.isArray(projects) ? projects : [];
  }, [projects]);

  const activeProjects = useMemo(() => {
    return allProjects.filter((p: any) => {
      return p.status && !closedStatuses.includes(p.status.toLowerCase());
    });
  }, [allProjects]);

  const closedProjects = useMemo(() => {
    return allProjects.filter((p: any) => {
      return p.status && closedStatuses.includes(p.status.toLowerCase());
    });
  }, [allProjects]);

  const dialogVisibleProjects = useMemo(() => {
    if (dialogProjectFilter === "active") return activeProjects;
    if (dialogProjectFilter === "closed") return closedProjects;
    return allProjects;
  }, [dialogProjectFilter, allProjects, activeProjects, closedProjects]);

  const filteredDialogProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return dialogVisibleProjects;
    const query = projectSearchQuery.toLowerCase();
    return dialogVisibleProjects.filter((p: any) =>
      (p.customerName || '').toLowerCase().includes(query) ||
      (p.solutionName || '').toLowerCase().includes(query) ||
      (p.name || '').toLowerCase().includes(query) ||
      String(p.id).includes(query)
    );
  }, [dialogVisibleProjects, projectSearchQuery]);

  const allFilteredSelected = filteredDialogProjects.length > 0 && filteredDialogProjects.every((p: any) => selectedProjectIds.includes(p.id));

  const handleToggleProject = (projectId: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId]
    );
  };

  const handleToggleAll = () => {
    if (allFilteredSelected) {
      const filteredIds = filteredDialogProjects.map((p: any) => p.id);
      setSelectedProjectIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      const filteredIds = filteredDialogProjects.map((p: any) => p.id);
      setSelectedProjectIds(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  const handleToggleAllActive = () => {
    const activeIds = activeProjects.map((p: any) => p.id);
    const allActiveSelected = activeIds.length > 0 && activeIds.every(id => selectedProjectIds.includes(id));
    if (allActiveSelected) {
      setSelectedProjectIds(prev => prev.filter(id => !activeIds.includes(id)));
    } else {
      setSelectedProjectIds(prev => [...new Set([...prev, ...activeIds])]);
    }
  };

  const handleToggleAllClosed = () => {
    const closedIds = closedProjects.map((p: any) => p.id);
    const allClosedSelected = closedIds.length > 0 && closedIds.every(id => selectedProjectIds.includes(id));
    if (allClosedSelected) {
      setSelectedProjectIds(prev => prev.filter(id => !closedIds.includes(id)));
    } else {
      setSelectedProjectIds(prev => [...new Set([...prev, ...closedIds])]);
    }
  };

  const handleRunAnalysis = () => {
    if (selectedProjectIds.length === 0) return;
    const isAll = selectedProjectIds.length === allProjects.length;
    bulkAnalyzeMutation.mutate(isAll ? undefined : selectedProjectIds);
  };

  useEffect(() => {
    if (analyzeDialogOpen) {
      setProjectSearchQuery("");
      setDialogProjectFilter("all");
      if (selectedAnalysisRulesetId === null && rulesets.length > 0) {
        const defaultRuleset = rulesets.find((r: any) => r.isDefault);
        setSelectedAnalysisRulesetId(defaultRuleset ? defaultRuleset.id : rulesets[0].id);
      }
    }
  }, [analyzeDialogOpen, rulesets, selectedAnalysisRulesetId]);

  const handleOpenAuditLog = (project: any) => {
    setSelectedAuditProjectId(project.id);
    setSelectedAuditProject(project);
    setShowRawPrompt(false);
    setShowRawResponse(false);
    setExpandedHistoryRaw({});
    setAuditDrawerOpen(true);
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'critical': return 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'text-orange-700 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400';
      case 'medium': return 'text-yellow-700 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400';
      default: return 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400';
    }
  };

  const getRiskLevel = (score: number) => {
    if (score > 75) return 'critical';
    if (score > 50) return 'high';
    if (score > 25) return 'medium';
    return 'low';
  };

  const handleInitializeRisk = () => {
    initializeRiskMutation.mutate();
  };

  // Error Display Component - Enhanced to handle status and retries
  const ErrorDisplay = ({ error, title, onRetry }: { error: any; title: string; onRetry?: () => void }) => (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          <p>{error?.message || 'An unexpected error occurred'}</p>
          {error?.status && (
            <p className="text-xs text-gray-600">Status: {error.status}</p>
          )}
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-lg font-semibold mb-2">Authentication Required</h2>
              <p className="text-gray-600">Please log in to access AI Assessments.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isAdmin = user?.role?.toLowerCase() === 'admin';

  const safeProjects: any[] = Array.isArray(projects) ? projects : [];
  const projectsWithRisk = safeProjects.filter((p: any) => p.riskScore !== undefined && p.riskScore !== null) || [];

  const averageScore = useMemo(() => {
    if (projectsWithRisk.length === 0) return 0;
    const total = projectsWithRisk.reduce((sum: number, p: any) => sum + parseFloat(p.riskScore), 0);
    return Math.round(total / projectsWithRisk.length);
  }, [projectsWithRisk]);

  const averageScoreLevel = useMemo(() => {
    if (averageScore <= 25) return 'low';
    if (averageScore <= 50) return 'medium';
    if (averageScore <= 75) return 'high';
    return 'critical';
  }, [averageScore]);

  const scoreTrend = useMemo(() => {
    if (projectsWithRisk.length === 0) return { direction: 'neutral' as const, delta: 0 };
    let totalDelta = 0;
    let countWithPrevious = 0;
    projectsWithRisk.forEach((p: any) => {
      if (p.riskPredictionData?.previousScore != null) {
        totalDelta += parseFloat(p.riskScore) - p.riskPredictionData.previousScore;
        countWithPrevious++;
      }
    });
    if (countWithPrevious === 0) return { direction: 'neutral' as const, delta: 0 };
    const avgDelta = Math.round(totalDelta / countWithPrevious);
    return {
      direction: avgDelta > 0 ? 'up' as const : avgDelta < 0 ? 'down' as const : 'neutral' as const,
      delta: Math.abs(avgDelta),
    };
  }, [projectsWithRisk]);

  const analyzedThisWeek = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return projectsWithRisk.filter((p: any) => {
      if (!p.lastRiskAnalysis) return false;
      return new Date(p.lastRiskAnalysis) >= oneWeekAgo;
    }).length;
  }, [projectsWithRisk]);

  const activeRulesetsInfo = useMemo(() => {
    if (!rulesets || rulesets.length === 0) return { count: 0, topName: null };
    const activeOnes = rulesets.filter((r: any) => r.isActive !== false);
    const sorted = [...activeOnes].sort((a: any, b: any) => (b.runCount || 0) - (a.runCount || 0));
    return {
      count: activeOnes.length,
      topName: sorted[0]?.name || null,
    };
  }, [rulesets]);

  const filteredProjectsWithRisk = useMemo(() => {
    let filtered = projectsWithRisk;
    if (jobProjectFilter && jobProjectFilter.length > 0) {
      filtered = filtered.filter((p: any) => jobProjectFilter.includes(p.id));
    }
    if (riskLevelFilter) {
      filtered = filtered.filter((p: any) => {
        const score = parseFloat(p.riskScore);
        if (riskLevelFilter === 'low') return score <= 25;
        if (riskLevelFilter === 'medium') return score > 25 && score <= 50;
        if (riskLevelFilter === 'high') return score > 50 && score <= 75;
        return score > 75;
      });
    }
    return filtered;
  }, [projectsWithRisk, riskLevelFilter, jobProjectFilter]);

  // Check for critical errors that should show fallback UI (e.g., unauthorized access to critical data)
  const hasCriticalErrors = ((criteriaError as any)?.status === 401 || (projectsError as any)?.status === 401);

  // Custom buttons for AI Risk actions
  const customButtons = isAdmin ? (
    <div className="flex items-center space-x-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            onClick={handleInitializeRisk}
            disabled={initializeRiskMutation.isPending}
            style={{ backgroundColor: '#2d6ee6' }}
            className="hover:bg-[#1e40af] text-white border-0"
          >
            {initializeRiskMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin stroke-white fill-none stroke-2" />
            ) : (
              <PlayCircle className="w-4 h-4 mr-2 stroke-white fill-none stroke-2" />
            )}
            Initialize Assessment Criteria
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
          <p>Set up default assessment criteria for AI analysis</p>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            onClick={() => {
              setSelectedProjectIds([]);
              setProjectSearchQuery("");
              setAnalyzeDialogOpen(true);
            }}
            disabled={bulkAnalyzeMutation.isPending}
            style={{ backgroundColor: '#2d6ee6' }}
            className="hover:bg-[#1e40af] text-white border-0"
          >
            {bulkAnalyzeMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin stroke-white fill-none stroke-2" />
            ) : (
              <BarChart3 className="w-4 h-4 mr-2 stroke-white fill-none stroke-2" />
            )}
            Analyze Projects
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
          <p>Select and analyze projects with AI</p>
        </TooltipContent>
      </Tooltip>
    </div>
  ) : null;

  return (
    <TooltipProvider>
      <div data-testid="ai-risk-management">

        {/* Error Displays for Queries */}
        {criteriaError && (
          <ErrorDisplay 
            error={criteriaError} 
            title="Assessment Criteria Loading Error" 
            onRetry={refetchCriteria}
          />
        )}
        {projectsError && (
          <ErrorDisplay 
            error={projectsError} 
            title="Projects Data Loading Error" 
            onRetry={refetchProjects}
          />
        )}

        {/* Show critical error fallback if authentication failed for essential data */}
        {hasCriticalErrors ? (
          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Access Error</h2>
                <p className="text-gray-600 mb-4">
                  Unable to load AI Assessments data due to authentication issues or critical data unavailability.
                </p>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
        {/* Tab Navigation - PageTabNav Standard */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* The tab bar comes from the sidebar (PageLayout's SectionTabBar). */}

            {/* Metrics Row */}
            <Card className="relative overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800 rounded-xl p-2 group mb-4">
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
              <Brain
                className="absolute right-48 top-1/2 h-64 w-64 opacity-5 text-blue-600 pointer-events-none"
                style={{ transform: "translateY(-50%) rotate(-12deg)" }}
              />
              <CardHeader className="flex flex-row items-start justify-between space-y-0 relative z-10 pt-[8px] pb-[8px]">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Brain data-title-icon className="h-5 w-5" />
                    AI Assessments
                  </CardTitle>
                  <CardDescription>
                    AI-powered project assessment analysis dashboard and key metrics. AI assessment analysis is currently in beta. 
                  </CardDescription>
                </div>
                <Button 
                  size="sm"
                  onClick={() => {
                    setSelectedProjectIds([]);
                    setProjectSearchQuery("");
                    setAnalyzeDialogOpen(true);
                  }} 
                  style={{ backgroundColor: '#2d6ee6' }}
                  className="hover:bg-[#1e40af] text-white border-0"
                  disabled={bulkAnalyzeMutation.isPending}
                >
                  <BrainCircuit className="h-4 w-4 mr-2" />
                  {bulkAnalyzeMutation.isPending ? "Analyzing..." : "Analyze Projects"}
                </Button>
              </CardHeader>

              <CardContent className="p-6 pt-[8px] pb-[8px]">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Card 1: Total Analyzed */}
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200 dark:border-blue-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <BarChart3 className="h-32 w-32 opacity-10 text-blue-600" />
            </div>
            <CardContent className="relative p-6">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <BarChart3 className="w-5 h-5 text-blue-900 dark:text-blue-400" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Projects analyzed by AI</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Total Projects Analyzed</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {projectsLoading ? <Skeleton className="h-8 w-12" /> : projectsWithRisk.length}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {analyzedThisWeek > 0 ? (
                  <span className="flex items-center gap-1">
                    <span className="text-blue-600 dark:text-blue-400 font-medium">+{analyzedThisWeek}</span> this week
                  </span>
                ) : (
                  "Projects with AI assessment scores"
                )}
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Average Score */}
          <Card className={`relative overflow-hidden border ${
            averageScoreLevel === 'low' ? 'bg-green-50/80 dark:bg-green-950/75 border-green-200 dark:border-green-800' :
            averageScoreLevel === 'medium' ? 'bg-yellow-50/80 dark:bg-yellow-950/75 border-yellow-200 dark:border-yellow-800' :
            averageScoreLevel === 'high' ? 'bg-orange-50/80 dark:bg-orange-950/75 border-orange-200 dark:border-orange-800' :
            'bg-red-50/80 dark:bg-red-950/75 border-red-200 dark:border-red-800'
          }`}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Gauge className={`h-32 w-32 opacity-10 ${
                averageScoreLevel === 'low' ? 'text-green-600' :
                averageScoreLevel === 'medium' ? 'text-yellow-600' :
                averageScoreLevel === 'high' ? 'text-orange-600' :
                'text-red-600'
              }`} />
            </div>
            <CardContent className="relative p-6">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Gauge className={`w-5 h-5 ${
                      averageScoreLevel === 'low' ? 'text-green-900 dark:text-green-400' :
                      averageScoreLevel === 'medium' ? 'text-yellow-900 dark:text-yellow-400' :
                      averageScoreLevel === 'high' ? 'text-orange-900 dark:text-orange-400' :
                      'text-red-900 dark:text-red-400'
                    }`} />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Mean assessment index score across all projects</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Average Index Score</h3>
              </div>
              <div className={`text-2xl font-bold ${
                averageScoreLevel === 'low' ? 'text-green-600 dark:text-green-400' :
                averageScoreLevel === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                averageScoreLevel === 'high' ? 'text-orange-600 dark:text-orange-400' :
                'text-red-600 dark:text-red-400'
              }`}>
                {projectsLoading ? <Skeleton className="h-8 w-12" /> : `${averageScore}%`}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">
                {projectsWithRisk.length > 0 ? `${averageScoreLevel} risk level` : 'No data yet'}
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Score Trend */}
          <Card className={`relative overflow-hidden border ${
            scoreTrend.direction === 'down' ? 'bg-green-50/80 dark:bg-green-950/75 border-green-200 dark:border-green-800' :
            scoreTrend.direction === 'up' ? 'bg-red-50/80 dark:bg-red-950/75 border-red-200 dark:border-red-800' :
            'bg-gray-50/80 dark:bg-gray-900/75 border-gray-200 dark:border-gray-700'
          }`}>
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Activity className={`h-32 w-32 opacity-10 ${
                scoreTrend.direction === 'down' ? 'text-green-600' :
                scoreTrend.direction === 'up' ? 'text-red-600' :
                'text-gray-600'
              }`} />
            </div>
            <CardContent className="relative p-6">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Activity className={`w-5 h-5 ${
                      scoreTrend.direction === 'down' ? 'text-green-900 dark:text-green-400' :
                      scoreTrend.direction === 'up' ? 'text-red-900 dark:text-red-400' :
                      'text-gray-900 dark:text-gray-400'
                    }`} />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Average index score change since last analysis run</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Index Score Trend</h3>
              </div>
              <div className={`text-2xl font-bold flex items-center gap-1 ${
                scoreTrend.direction === 'down' ? 'text-green-600 dark:text-green-400' :
                scoreTrend.direction === 'up' ? 'text-red-600 dark:text-red-400' :
                'text-gray-600 dark:text-gray-400'
              }`}>
                {projectsLoading ? <Skeleton className="h-8 w-12" /> : (
                  <>
                    {scoreTrend.direction === 'up' && <TrendingUp className="h-5 w-5" />}
                    {scoreTrend.direction === 'down' && <TrendingDown className="h-5 w-5" />}
                    {scoreTrend.direction === 'neutral' && <Minus className="h-5 w-5" />}
                    {scoreTrend.direction === 'neutral' ? '—' : `${scoreTrend.direction === 'up' ? '+' : '-'}${scoreTrend.delta}%`}
                  </>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {scoreTrend.direction === 'down' ? 'Scores improving' :
                 scoreTrend.direction === 'up' ? 'Scores worsening' :
                 'No change detected'}
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Active Rulesets */}
          <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/75 border-purple-200 dark:border-purple-800">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Layers className="h-32 w-32 opacity-10 text-purple-600" />
            </div>
            <CardContent className="relative p-6">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Layers className="w-5 h-5 text-purple-900 dark:text-purple-400" />
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Assessment rulesets currently in use</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Active AI Rulesets</h3>
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {rulesetsLoading ? <Skeleton className="h-8 w-12" /> : activeRulesetsInfo.count}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                {activeRulesetsInfo.topName ? (
                  <span>Top: <span className="font-medium text-purple-600 dark:text-purple-400">{activeRulesetsInfo.topName}</span></span>
                ) : (
                  'No active rulesets'
                )}
              </p>
            </CardContent>
          </Card>
                </div>
              </CardContent>
            </Card>

          {/* Tab Content with standard spacing */}
          <div style={{ marginTop: '18px' }}>

          <TabsContent value="projects" className="space-y-4">
            {/* Risk Distribution & Recent Runs Widgets */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RiskDistributionBar
                projects={projectsWithRisk}
                activeFilter={riskLevelFilter}
                onFilterChange={setRiskLevelFilter}
              />
              <RecentRunsFeed
                onProjectClick={(projectId) => {
                  const project = projectsWithRisk.find((p: any) => p.id === projectId);
                  if (project) handleOpenAuditLog(project);
                }}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
            <AssessmentJobsCard
              selectedJobId={selectedJobId}
              onJobSelect={(jobId, projectIds) => {
                setSelectedJobId(jobId);
                setJobProjectFilter(projectIds);
              }}
            />
            <Card className="relative overflow-hidden">
              <DecorativeCardIcon icon={Target} />
              <CardHeader className="relative z-10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center text-2xl gap-2">
                      <Target data-title-icon className="h-5 w-5" />
                      Project Analysis Library
                    </CardTitle>
                    <CardDescription>
                      {jobProjectFilter
                        ? `Filtered by job: showing ${filteredProjectsWithRisk.length} project${filteredProjectsWithRisk.length !== 1 ? 's' : ''}`
                        : riskLevelFilter
                          ? `Showing ${filteredProjectsWithRisk.length} ${riskLevelFilter} risk project${filteredProjectsWithRisk.length !== 1 ? 's' : ''}`
                          : 'Detailed library of project analysis and AI assessments, capturing risk indices and assessment history'}
                    </CardDescription>
                  </div>
                  {(riskLevelFilter || jobProjectFilter) && (
                    <Button variant="outline" size="sm" onClick={() => { setRiskLevelFilter(null); setSelectedJobId(null); setJobProjectFilter(null); }} className="text-xs">
                      Clear Filter
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="relative z-10">
                {projectsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredProjectsWithRisk.length === 0 ? (
                      <Alert>
                        <Info className="w-4 h-4" />
                        <AlertTitle>{riskLevelFilter ? 'No Matching Projects' : 'No Projects Analyzed'}</AlertTitle>
                        <AlertDescription>
                          {riskLevelFilter
                            ? `No projects with ${riskLevelFilter} risk level. Try clearing the filter.`
                            : 'Start by analyzing your active projects to see assessment predictions here.'}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      filteredProjectsWithRisk.map((project: any) => {
                        const riskScore = parseFloat(project.riskScore);
                        let riskLevel = 'low';
                        let riskColor = 'text-green-700 bg-green-100 border-green-200';

                        if (riskScore > 75) {
                          riskLevel = 'critical';
                          riskColor = 'text-red-700 bg-red-100 border-red-200';
                        } else if (riskScore > 50) {
                          riskLevel = 'high';
                          riskColor = 'text-orange-700 bg-orange-100 border-orange-200';
                        } else if (riskScore > 25) {
                          riskLevel = 'medium';
                          riskColor = 'text-yellow-700 bg-yellow-100 border-yellow-200';
                        }

                        return (
                          <div key={project.id} className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                {(() => {
                                  const providerKey = project.riskPredictionData?.aiProvider;
                                  const ProviderIcon = providerKey ? AI_PROVIDER_ICONS[providerKey] : null;
                                  const providerColors = providerKey ? AI_PROVIDER_COLORS[providerKey] : null;
                                  if (ProviderIcon && providerColors) {
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <div className={`flex items-center justify-center h-9 w-9 rounded-lg ${providerColors.bgColor} border border-gray-200 dark:border-gray-700 shrink-0`}>
                                            <ProviderIcon className="h-4.5 w-4.5" style={{ color: providerColors.color }} />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="bg-white dark:bg-gray-800 text-black dark:text-white text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                                          <p className="capitalize">{providerKey.replace('_', ' ')}{project.riskPredictionData?.aiModel ? ` · ${project.riskPredictionData.aiModel}` : ''}</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  }
                                  return (
                                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shrink-0">
                                      <BrainCircuit className="h-4.5 w-4.5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                  );
                                })()}
                                <div>
                                  <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                    <span className="text-gray-500 dark:text-gray-400 mr-1 text-sm">#{project.id}</span>
                                    {project.name || project.customerName}
                                  </h4>
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {project.customerName} · {project.solutionName}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  className={`${riskColor} cursor-pointer hover:opacity-80 transition-opacity`}
                                  onClick={() => handleOpenAuditLog(project)}
                                >
                                  R-Index: {riskLevel.toUpperCase()} ({Math.round(riskScore)}%)
                                </Badge>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-8 px-2"
                                      onClick={() => handleOpenAuditLog(project)}
                                    >
                                      <FileText className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-white dark:bg-gray-800 text-black dark:text-white text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                                    <p>View AI Assessment Audit</p>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </div>
                            <Progress value={riskScore} className="h-2 mb-2" />
                            <div className="flex items-center justify-between">
                              {project.lastRiskAnalysis && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  Last analyzed: {new Date(project.lastRiskAnalysis).toLocaleString()}
                                </p>
                              )}
                              {project.riskPredictionData?.previousScore != null && (
                                <span className={`text-xs font-medium flex items-center gap-0.5 ${
                                  riskScore > project.riskPredictionData.previousScore ? 'text-red-600 dark:text-red-400' :
                                  riskScore < project.riskPredictionData.previousScore ? 'text-green-600 dark:text-green-400' :
                                  'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {riskScore > project.riskPredictionData.previousScore ? (
                                    <><TrendingUp className="h-3 w-3" /> +{Math.round(riskScore - project.riskPredictionData.previousScore)}</>
                                  ) : riskScore < project.riskPredictionData.previousScore ? (
                                    <><TrendingDown className="h-3 w-3" /> {Math.round(riskScore - project.riskPredictionData.previousScore)}</>
                                  ) : (
                                    <><Minus className="h-3 w-3" /> 0</>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </div>
          </TabsContent>

          <TabsContent value="criteria" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* LEFT CARD - Ruleset List */}
              <div className="lg:col-span-2">
                <Card className="relative overflow-hidden">
                  <DecorativeCardIcon icon={Layers} />
                  <CardHeader className="relative z-10">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center text-xl gap-2 text-2xl">
                          <Brain data-title-icon className="h-5 w-5" />
                          Assessment Rulesets
                        </CardTitle>
                        <CardDescription>
                          Manage assessment ruleset groups
                        </CardDescription>
                      </div>
                      {isAdmin && (
                        <AssessmentRulesetForm />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {rulesetsLoading ? (
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : !rulesets || rulesets.length === 0 ? (
                      <Alert>
                        <Info className="w-4 h-4" />
                        <AlertTitle>No Assessment Rulesets Found</AlertTitle>
                        <AlertDescription>
                          {isAdmin ? "Create a new assessment ruleset to group criteria for AI analysis." : "Contact your administrator to set up assessment rulesets."}
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="space-y-2">
                        {rulesets.map((ruleset: any) => {
                          const isSelected = selectedRulesetId === ruleset.id;
                          return (
                            <div
                              key={ruleset.id}
                              className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors border ${
                                isSelected
                                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-transparent'
                              }`}
                              onClick={() => {
                                setSelectedRulesetId(ruleset.id);
                                setCriteriaCurrentPage(1);
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-400 dark:text-gray-500">#{ruleset.id}</span>
                                  <span className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{ruleset.name}</span>
                                  {ruleset.isDefault && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Default</Badge>
                                  )}
                                  <Badge className={`text-[10px] px-1.5 py-0 ${ruleset.isActive !== false ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                                    {ruleset.isActive !== false ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  {(() => {
                                    const catCfg = rulesetCategoryConfig[ruleset.category] || rulesetCategoryConfig.general;
                                    const CatIcon = catCfg.icon;
                                    return (
                                      <Badge className={`text-[10px] px-1.5 py-0 capitalize flex items-center gap-1 ${catCfg.badgeClass}`}>
                                        <CatIcon className="h-3 w-3 shrink-0" style={{ color: catCfg.color }} />
                                        {catCfg.label}
                                      </Badge>
                                    );
                                  })()}
                                  <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                                    <PlayCircle className="h-3 w-3" />
                                    {ruleset.runCount || 0}
                                  </span>
                                  {ruleset.lastUsedAt && (
                                    <span className="text-xs text-gray-400 dark:text-gray-500">
                                      {new Date(ruleset.lastUsedAt).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isAdmin && (
                                <div className="flex items-center space-x-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <AssessmentRulesetForm
                                    ruleset={ruleset}
                                    trigger={
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                            <SquarePen className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                          <p>Edit ruleset</p>
                                        </TooltipContent>
                                      </Tooltip>
                                    }
                                  />
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => cloneRulesetMutation.mutate({ id: ruleset.id, name: `${ruleset.name} (Copy)` })}
                                        disabled={cloneRulesetMutation.isPending}
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                      <p>Clone ruleset</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <DangerIconButton
                                    className="h-7 w-7 p-0"
                                    data-icon-color="danger"
                                    onClick={() => {
                                      setPendingDeleteRulesetId(ruleset.id);
                                      setDeleteRulesetConfirmOpen(true);
                                    }}
                                    disabled={deleteRulesetMutation.isPending}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT CARD - Selected Ruleset's Criteria */}
              <div className="lg:col-span-3">
                <Card className="relative overflow-hidden">
                  <DecorativeCardIcon icon={Target} />
                  <CardHeader className="relative z-10">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center text-xl gap-2 text-2xl">
                          <Target data-title-icon className="h-5 w-5" />
                          {selectedRuleset ? `${selectedRuleset.name} - Criteria` : 'Assessment Criteria'}
                        </CardTitle>
                        <CardDescription>
                          {selectedRuleset ? `Criteria for the "${selectedRuleset.name}" ruleset` : 'Select a ruleset to view its criteria'}
                        </CardDescription>
                      </div>
                      {isAdmin && selectedRulesetId && (
                        <RiskCriteriaForm rulesetId={selectedRulesetId} />
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="relative z-10">
                    {!selectedRulesetId ? (
                      <div className="text-center py-12">
                        <Layers className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400">Select a ruleset to view its criteria</p>
                      </div>
                    ) : rulesetCriteriaLoading ? (
                      <div className="space-y-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {!rulesetCriteria || rulesetCriteria.length === 0 ? (
                          <Alert>
                            <Info className="w-4 h-4" />
                            <AlertTitle>No Criteria Found</AlertTitle>
                            <AlertDescription>
                              {isAdmin ? "Add criteria to this ruleset to define assessment parameters." : "No criteria have been configured for this ruleset yet."}
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <div className="overflow-x-auto">
                            <SortableTable>
                              <SortableTableHeader>
                                <SortableTableRow>
                                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Name</SortableTableHead>
                                  <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort}>Category</SortableTableHead>
                                  <SortableTableHead sortKey="weightFactor" sortConfig={sortConfig} onSort={handleSort}>Weight</SortableTableHead>
                                  <SortableTableHead sortKey="isActive" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                                  <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>Description</SortableTableHead>
                                  {isAdmin && <SortableTableHead sortKey="actions" sortConfig={sortConfig} onSort={handleSort} sortable={false} className="text-center">Actions</SortableTableHead>}
                                </SortableTableRow>
                              </SortableTableHeader>
                              <SortableTableBody>
                                {paginatedRulesetCriteria.map((c) => (
                                  <SortableTableRow key={c.id}>
                                    <SortableTableCell className="font-medium">{c.name}</SortableTableCell>
                                    <SortableTableCell>
                                      {(() => {
                                        const catConfig = criteriaCategoryConfig[c.category] || criteriaCategoryConfig.custom;
                                        const CatIcon = catConfig.icon;
                                        return (
                                          <Badge variant="outline" className={`text-xs ${catConfig.badgeClass}`}>
                                            <CatIcon className="h-3.5 w-3.5 mr-1 shrink-0" style={{ color: catConfig.color }} />
                                            {catConfig.label}
                                          </Badge>
                                        );
                                      })()}
                                    </SortableTableCell>
                                    <SortableTableCell>
                                      <div className="flex items-center space-x-2">
                                        <Progress value={(Number(c.weightFactor) || 0) * 100} className="w-16 h-2" />
                                        <span className="text-xs text-gray-500 min-w-[3rem]">
                                          {((Number(c.weightFactor) || 0) * 100).toFixed(0)}%
                                        </span>
                                      </div>
                                    </SortableTableCell>
                                    <SortableTableCell>
                                      <Badge
                                        className={c.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}
                                      >
                                        {c.isActive !== false ? 'Active' : 'Inactive'}
                                      </Badge>
                                    </SortableTableCell>
                                    <SortableTableCell className="max-w-xs">
                                      <p className="text-sm text-gray-600 line-clamp-2">
                                        {c.description}
                                      </p>
                                    </SortableTableCell>
                                    {isAdmin && (
                                      <SortableTableCell>
                                        <div className="flex items-center justify-center space-x-1">
                                          <RiskCriteriaForm
                                            criteria={c}
                                            rulesetId={selectedRulesetId || undefined}
                                            trigger={
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button variant="ghost" size="sm">
                                                    <SquarePen className="h-4 w-4" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                                                  <p>Edit criteria</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            }
                                          />
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <DangerIconButton
                                                data-icon-color="danger"
                                                onClick={() => {
                                                  setPendingDeleteCriteriaId(c.id);
                                                  setDeleteConfirmOpen(true);
                                                }}
                                                disabled={deleteCriteriaMutation.isPending}
                                              />
                                            </TooltipTrigger>
                                            <TooltipContent
                                              side="top"
                                              className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md"
                                            >
                                              <p>Delete criteria</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </div>
                                      </SortableTableCell>
                                    )}
                                  </SortableTableRow>
                                ))}
                              </SortableTableBody>
                            </SortableTable>
                            {rulesetCriteria && rulesetCriteria.length > 0 && (
                              <TablePaginationFooter
                                totalItems={rulesetCriteria.length}
                                pageSize={criteriaItemsPerPage}
                                currentPage={criteriaCurrentPage}
                                onPageChange={setCriteriaCurrentPage}
                                entityLabel="criteria"
                              />
                            )}
                          </div>
                        )}

                        {rulesetCriteria && rulesetCriteria.length > 0 && (
                          <div className="pt-4 border-t">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                              <div>
                                <p className="text-2xl font-bold text-blue-600">{rulesetCriteria.length}</p>
                                <p className="text-sm text-gray-500">Total Criteria</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-green-600">
                                  {rulesetCriteria.filter((c: any) => c.isActive !== false).length}
                                </p>
                                <p className="text-sm text-gray-500">Active</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-orange-600">
                                  {rulesetCriteria.filter((c: any) => c.isActive === false).length}
                                </p>
                                <p className="text-sm text-gray-500">Inactive</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-purple-600">
                                  {(rulesetCriteria.reduce((acc: number, c: any) => {
                                    const weight = Number(c.weightFactor || 0);
                                    return acc + weight;
                                  }, 0) || 0).toFixed(2)}
                                </p>
                                <p className="text-sm text-gray-500">Total Weight</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="docs" className="space-y-4">
            <DocsSourceManagement />
          </TabsContent>
          </div>
        </Tabs>
          </>
        )}
      </div>

      {/* Analyze Projects Selection Dialog */}
      <Dialog open={analyzeDialogOpen} onOpenChange={setAnalyzeDialogOpen}>
        <DialogContent className="max-w-[650px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-blue-600" />
              Analyze Projects
            </DialogTitle>
            <DialogDescription>
              Select which projects to run AI assessment analysis on.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={analyzeMode} onValueChange={(v) => setAnalyzeMode(v as 'run_now' | 'schedule')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="run_now" className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Run Now
              </TabsTrigger>
              <TabsTrigger value="schedule" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Schedule
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Assessment Ruleset</label>
              <Select
                value={selectedAnalysisRulesetId?.toString() || ""}
                onValueChange={(val) => setSelectedAnalysisRulesetId(Number(val))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a ruleset..." />
                </SelectTrigger>
                <SelectContent>
                  {rulesets.map((ruleset: any) => (
                    <SelectItem key={ruleset.id} value={ruleset.id.toString()}>
                      <div className="flex items-center gap-2">
                        <span className="truncate">{ruleset.name}</span>
                        {(() => {
                          const catCfg = rulesetCategoryConfig[ruleset.category] || rulesetCategoryConfig.general;
                          const CatIcon = catCfg.icon;
                          return (
                            <Badge className={`text-[10px] px-1.5 py-0 shrink-0 flex items-center gap-1 ${catCfg.badgeClass}`}>
                              <CatIcon className="h-3 w-3 shrink-0" style={{ color: catCfg.color }} />
                              {catCfg.label}
                            </Badge>
                          );
                        })()}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedAnalysisRulesetId && rulesets.find((r: any) => r.id === selectedAnalysisRulesetId)?.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 pl-1 line-clamp-2">
                  {rulesets.find((r: any) => r.id === selectedAnalysisRulesetId)?.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search projects..."
                  value={projectSearchQuery}
                  onChange={(e) => setProjectSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={dialogProjectFilter}
                onValueChange={(val) => setDialogProjectFilter(val as "all" | "active" | "closed")}
              >
                <SelectTrigger className="w-[155px] shrink-0 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Show All Projects</SelectItem>
                  <SelectItem value="active">Show Active</SelectItem>
                  <SelectItem value="closed">Show Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-4 px-1 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-1.5">
                <Checkbox
                  id="select-all"
                  checked={allFilteredSelected}
                  onCheckedChange={handleToggleAll}
                />
                <label htmlFor="select-all" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                  All Projects
                </label>
              </div>
              <div className="flex items-center space-x-1.5">
                <Checkbox
                  id="select-all-active"
                  checked={activeProjects.length > 0 && activeProjects.every((p: any) => selectedProjectIds.includes(p.id))}
                  onCheckedChange={handleToggleAllActive}
                />
                <label htmlFor="select-all-active" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                  All Active
                </label>
              </div>
              <div className="flex items-center space-x-1.5">
                <Checkbox
                  id="select-all-closed"
                  checked={closedProjects.length > 0 && closedProjects.every((p: any) => selectedProjectIds.includes(p.id))}
                  onCheckedChange={handleToggleAllClosed}
                />
                <label htmlFor="select-all-closed" className="text-xs font-medium cursor-pointer whitespace-nowrap">
                  All Closed
                </label>
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto whitespace-nowrap">
                {selectedProjectIds.length} of {allProjects.length} selected
              </span>
            </div>

            <ScrollArea className="h-[300px] pr-3">
              {projectsLoading ? (
                <div className="space-y-3 p-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filteredDialogProjects.length === 0 ? (
                <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                  {projectSearchQuery ? "No projects match your search." : "No projects found."}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredDialogProjects.map((project: any) => {
                    const isSelected = selectedProjectIds.includes(project.id);
                    const riskScore = project.riskScore ? parseFloat(project.riskScore) : null;
                    return (
                      <div
                        key={project.id}
                        className={`flex items-center space-x-3 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800' 
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                        }`}
                        onClick={() => handleToggleProject(project.id)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleToggleProject(project.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              <span className="text-gray-500 dark:text-gray-400 mr-1">#{project.id}</span>
                              {project.name || project.solutionName}
                            </p>
                            {project.status && (() => {
                              const statusConfig = projectStatusConfigs.find(
                                (c: any) => c.name.toLowerCase() === project.status.toLowerCase()
                              );
                              const statusColor = statusConfig?.color || '#6B7280';
                              const statusIcon = statusConfig?.icon;
                              const statusLabel = statusConfig?.name || project.status;
                              return (
                                <Badge
                                  className="text-[10px] px-1.5 py-0 shrink-0 flex items-center gap-1 border-0 text-white"
                                  style={{
                                    backgroundColor: statusColor,
                                  }}
                                >
                                  {statusIcon && (() => {
                                    const isImageFile = /\.(png|jpg|jpeg|gif|svg|webp|ico)$/i.test(statusIcon);
                                    const isFullPath = statusIcon.startsWith('/') || statusIcon.startsWith('http');
                                    if (isImageFile || isFullPath) {
                                      const imgSrc = isFullPath ? statusIcon : `/api/files/system/solution-icons/${statusIcon}`;
                                      return <img src={imgSrc} alt="" className="h-2.5 w-2.5 object-contain" />;
                                    }
                                    return <DynamicIcon name={statusIcon} className="h-2.5 w-2.5" />;
                                  })()}
                                  {statusLabel}
                                </Badge>
                              );
                            })()}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {project.customerName}
                            {project.solutionName ? ` · ${project.solutionName}` : ''}
                          </p>
                          {(project.startDate || project.endDate) && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                              {project.startDate ? new Date(project.startDate).toLocaleDateString() : ''}
                              {project.startDate && project.endDate ? ' – ' : ''}
                              {project.endDate ? new Date(project.endDate).toLocaleDateString() : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 shrink-0">
                          {riskScore !== null && (
                            <Badge className={`text-xs ${
                              riskScore > 75 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                              riskScore > 50 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                              riskScore > 25 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                              'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {Math.round(riskScore)}%
                            </Badge>
                          )}
                          {project.lastRiskAnalysis && (
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                              {new Date(project.lastRiskAnalysis).toLocaleDateString()} {new Date(project.lastRiskAnalysis).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>

          {analyzeMode === 'schedule' && (
            <div className="space-y-3 p-4 border rounded-lg bg-violet-50/50 dark:bg-violet-950/20">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-600" />
                Schedule Configuration
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Create a recurring schedule to automatically run AI assessment analysis. The schedule will use the ruleset and projects selected above.
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-violet-100/50 dark:bg-violet-900/20 rounded-md px-3 py-2">
                <BrainCircuit className="h-3.5 w-3.5 text-violet-500" />
                <span>
                  {selectedAnalysisRulesetId 
                    ? `Ruleset: ${rulesets.find((r: any) => r.id === selectedAnalysisRulesetId)?.name || 'Selected'}` 
                    : 'No ruleset selected'}
                  {' · '}
                  {selectedProjectIds.length} project{selectedProjectIds.length !== 1 ? 's' : ''} selected
                </span>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAnalyzeDialogOpen(false)} disabled={bulkAnalyzeMutation.isPending}>
              Cancel
            </Button>
            {analyzeMode === 'schedule' ? (
              <Button
                onClick={() => {
                  setAnalyzeDialogOpen(false);
                  setScheduleCreatorOpen(true);
                }}
                disabled={selectedProjectIds.length === 0 || !selectedAnalysisRulesetId}
                className="bg-violet-600 hover:bg-violet-700 text-white border-0"
              >
                <Clock className="h-4 w-4 mr-2" />
                Configure Schedule
              </Button>
            ) : (
              <Button
                onClick={handleRunAnalysis}
                disabled={selectedProjectIds.length === 0 || bulkAnalyzeMutation.isPending}
                style={{ backgroundColor: '#2d6ee6' }}
                className="hover:bg-[#1e40af] text-white border-0"
              >
                <BrainCircuit className="h-4 w-4 mr-2" />
                {bulkAnalyzeMutation.isPending 
                  ? "Analyzing..." 
                  : `Analyze ${selectedProjectIds.length === allProjects.length ? 'All' : selectedProjectIds.length} Project${selectedProjectIds.length !== 1 ? 's' : ''}`
                }
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduleCreatorDialog
        open={scheduleCreatorOpen}
        onOpenChange={setScheduleCreatorOpen}
        lockedActionType="ai_assessment_analysis"
        initialConfig={{
          rulesetId: selectedAnalysisRulesetId,
          rulesetName: rulesets?.find((r: any) => r.id === selectedAnalysisRulesetId)?.name || 'Unknown',
          projectIds: selectedProjectIds,
        }}
        metadata={{ createdFrom: 'ai_assessment_config' }}
        title="Create AI Assessment Schedule"
        description="Configure a recurring automation schedule to run AI assessment analysis on the selected projects."
        onScheduleCreated={() => {
          setScheduleCreatorOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/email-automation/schedules"] });
        }}
      />

      {/* Delete Assessment Criteria Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Assessment Criteria"
        description="Are you sure you want to delete this assessment criteria? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDeleteCriteriaId !== null) {
            deleteCriteriaMutation.mutate(pendingDeleteCriteriaId);
            setPendingDeleteCriteriaId(null);
          }
        }}
        onCancel={() => setPendingDeleteCriteriaId(null)}
        variant="destructive"
      />

      {/* Delete Assessment Ruleset Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteRulesetConfirmOpen}
        onOpenChange={setDeleteRulesetConfirmOpen}
        title="Delete Assessment Ruleset"
        description="Are you sure you want to delete this assessment ruleset? All associated criteria will be unlinked. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingDeleteRulesetId !== null) {
            deleteRulesetMutation.mutate(pendingDeleteRulesetId);
            setPendingDeleteRulesetId(null);
          }
        }}
        onCancel={() => setPendingDeleteRulesetId(null)}
        variant="destructive"
      />

      {/* Assessment Audit Log Drawer */}
      <Sheet open={auditDrawerOpen} onOpenChange={setAuditDrawerOpen}>
        <SheetContent className="w-full sm:max-w-[600px] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-blue-600" />
              Assessment Audit Log
            </SheetTitle>
            <SheetDescription>
              {selectedAuditProject && (
                <span>
                  {selectedAuditProject.name || selectedAuditProject.customerName} · {selectedAuditProject.solutionName}
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          {selectedAuditProject && (
            <div className="space-y-6 pb-6">
              {/* Analysis History Timeline - AT THE TOP */}
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <History className="h-4 w-4 text-indigo-600" />
                  Analysis History
                  {riskPredictions.length > 0 && (
                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                      ({riskPredictions.length} run{riskPredictions.length !== 1 ? 's' : ''})
                    </span>
                  )}
                </h4>
                {predictionsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : riskPredictions.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No analysis history available.</p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {paginatedPredictions.map((prediction: any) => {
                        const globalIndex = riskPredictions.findIndex((p: any) => p.id === prediction.id);
                        const score = parseFloat(prediction.overallRiskScore);
                        const prevPrediction = riskPredictions[globalIndex + 1];
                        const prevScore = prevPrediction ? parseFloat((prevPrediction as any).overallRiskScore) : null;
                        const delta = prevScore !== null ? score - prevScore : null;
                        const level = getRiskLevel(score);
                        const isExpanded = expandedHistoryIds.has(prediction.id);
                        const isSelectedReport = selectedReportPredictionId === prediction.id;

                        return (
                          <div
                            key={prediction.id}
                            className={`rounded-lg border transition-colors ${
                              isSelectedReport
                                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'
                            }`}
                          >
                            <button
                              onClick={() => {
                                setExpandedHistoryIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(prediction.id)) {
                                    next.delete(prediction.id);
                                  } else {
                                    next.add(prediction.id);
                                  }
                                  return next;
                                });
                              }}
                              className="w-full flex items-center gap-3 p-3 text-left"
                            >
                              <div className={`w-3 h-3 rounded-full shrink-0 ${
                                level === 'critical' ? 'bg-red-500' :
                                level === 'high' ? 'bg-orange-500' :
                                level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                              }`} />
                              <div className="flex-1 min-w-0 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-xs ${getRiskLevelColor(level)}`}>
                                    {level.toUpperCase()} ({Math.round(score)}%)
                                  </Badge>
                                  {delta !== null && delta !== 0 && (
                                    <span className={`text-xs font-medium flex items-center gap-0.5 ${
                                      delta > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                    }`}>
                                      {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                      {delta > 0 ? '+' : ''}{Math.round(delta)}
                                    </span>
                                  )}
                                  {globalIndex === 0 && (
                                    <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">Latest</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Confidence: {prediction.confidence ? `${Math.round(parseFloat(prediction.confidence) * 100)}%` : 'N/A'}
                                  </span>
                                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                </div>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="px-3 pb-3 pt-0 ml-6 border-t border-gray-100 dark:border-gray-700/50">
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2">
                                  <Clock className="h-3 w-3" />
                                  {prediction.createdAt ? new Date(prediction.createdAt).toLocaleString() : 'Unknown'}
                                  {prediction.aiProvider && (
                                    <>
                                      <span>·</span>
                                      <Cpu className="h-3 w-3" />
                                      {prediction.aiProvider}{prediction.aiModel ? ` (${prediction.aiModel})` : ''}
                                    </>
                                  )}
                                  {prediction.rulesetId && rulesets && (
                                    <>
                                      <span>·</span>
                                      <Layers className="h-3 w-3 text-purple-500" />
                                      <span className="text-purple-600 dark:text-purple-400">
                                        {rulesets.find((r: any) => r.id === prediction.rulesetId)?.name || `Ruleset #${prediction.rulesetId}`}
                                      </span>
                                    </>
                                  )}
                                </div>
                                {(prediction.analysisResults as any)?.summary && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 line-clamp-2">
                                    {(prediction.analysisResults as any).summary}
                                  </p>
                                )}
                                <div className="mt-2 flex items-center gap-1.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedReportPredictionId(prediction.id);
                                      setShowRawPrompt(false);
                                      setShowRawResponse(false);
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                      isSelectedReport
                                        ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                                  >
                                    <FileText className="h-2.5 w-2.5" />
                                    Complete Report
                                  </button>
                                  {prediction.rawPrompt && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedHistoryRaw(prev => ({
                                          ...prev,
                                          [prediction.id]: prev[prediction.id] === 'prompt' ? null : 'prompt'
                                        }));
                                      }}
                                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                        expandedHistoryRaw[prediction.id] === 'prompt'
                                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      <MessageSquareText className="h-2.5 w-2.5" />
                                      Prompt
                                    </button>
                                  )}
                                  {prediction.rawResponse && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedHistoryRaw(prev => ({
                                          ...prev,
                                          [prediction.id]: prev[prediction.id] === 'response' ? null : 'response'
                                        }));
                                      }}
                                      className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 transition-colors ${
                                        expandedHistoryRaw[prediction.id] === 'response'
                                          ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      <Code className="h-2.5 w-2.5" />
                                      Response
                                    </button>
                                  )}
                                </div>
                                {expandedHistoryRaw[prediction.id] === 'prompt' && prediction.rawPrompt && (
                                  <pre className="mt-1.5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-[200px] overflow-y-auto leading-relaxed">
                                    {prediction.rawPrompt}
                                  </pre>
                                )}
                                {expandedHistoryRaw[prediction.id] === 'response' && prediction.rawResponse && (
                                  <pre className="mt-1.5 text-[10px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded p-2 max-h-[200px] overflow-y-auto leading-relaxed">
                                    {(() => {
                                      try {
                                        return JSON.stringify(JSON.parse(prediction.rawResponse), null, 2);
                                      } catch {
                                        return prediction.rawResponse;
                                      }
                                    })()}
                                  </pre>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {totalHistoryPages > 1 && (
                      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                        <button
                          onClick={() => setHistoryPage(p => Math.max(0, p - 1))}
                          disabled={historyPage === 0}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Page {historyPage + 1} of {totalHistoryPages}
                        </span>
                        <button
                          onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))}
                          disabled={historyPage >= totalHistoryPages - 1}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <Separator />

              {/* Complete Report Section - shows selected prediction's data */}
              {(() => {
                const reportPrediction = selectedReportPrediction;
                const reportData = reportPrediction ? {
                  overallRiskScore: reportPrediction.overallRiskScore,
                  confidence: reportPrediction.confidence,
                  createdAt: reportPrediction.createdAt,
                  aiProvider: (reportPrediction as any).aiProvider,
                  aiModel: (reportPrediction as any).aiModel,
                  rulesetId: reportPrediction.rulesetId,
                  analysisResults: reportPrediction.analysisResults as any,
                  criteriaScores: (reportPrediction as any).criteriaScores || (reportPrediction.analysisResults as any)?.criteriaScores,
                  triggerReasons: (reportPrediction as any).triggerReasons || (reportPrediction.analysisResults as any)?.triggerReasons,
                  recommendations: (reportPrediction as any).recommendations || (reportPrediction.analysisResults as any)?.recommendations,
                  rawPrompt: reportPrediction.rawPrompt,
                  rawResponse: reportPrediction.rawResponse,
                } : null;

                if (!reportData) return null;

                const reportScore = parseFloat(reportData.overallRiskScore || '0');
                const reportLevel = getRiskLevel(reportScore);

                return (
                  <>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                          {selectedReportPredictionId === riskPredictions[0]?.id ? 'Current Risk Assessment' : 'Historical Risk Assessment'}
                        </h3>
                        <Badge className={getRiskLevelColor(reportLevel)}>
                          {reportLevel.toUpperCase()} ({Math.round(reportScore)}%)
                        </Badge>
                      </div>
                      <Progress value={reportScore} className="h-3 mb-3" />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Confidence:</span>
                          <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                            {reportData.confidence
                              ? `${Math.round(parseFloat(reportData.confidence) * 100)}%`
                              : 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Analyzed:</span>
                          <span className="ml-1 font-medium text-gray-900 dark:text-gray-100">
                            {reportData.createdAt
                              ? new Date(reportData.createdAt).toLocaleString()
                              : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {reportData.aiProvider && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span className="text-sm text-blue-700 dark:text-blue-300">
                          Analyzed by <span className="font-medium">{reportData.aiProvider}</span>
                          {reportData.aiModel && (
                            <> · <span className="font-medium">{reportData.aiModel}</span></>
                          )}
                        </span>
                      </div>
                    )}

                    {reportData.rulesetId && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                        <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <span className="text-sm text-purple-700 dark:text-purple-300">
                          Ruleset: <span className="font-medium">
                            {rulesets?.find((r: any) => r.id === reportData.rulesetId)?.name || `ID #${reportData.rulesetId}`}
                          </span>
                        </span>
                      </div>
                    )}

                    {reportData.analysisResults?.summary && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <Brain className="h-4 w-4 text-purple-600" />
                          Analysis Summary
                        </h4>
                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                          {reportData.analysisResults.summary}
                        </p>
                      </div>
                    )}

                    {reportData.criteriaScores && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-600" />
                          Criteria Scores
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">Each criterion has a weight factor that determines its influence on the overall risk score. The weight (shown as a decimal, e.g. 0.20) represents the proportion of the total score. Higher weights mean that criterion has more impact on the final risk assessment. All weights sum to 1.0 (100%).</p>
                            </TooltipContent>
                          </Tooltip>
                        </h4>
                        {reportData.rulesetId && rulesets && (
                          <div className="flex items-center gap-1.5 mb-3 text-xs text-gray-500 dark:text-gray-400">
                            <Layers className="h-3.5 w-3.5 text-purple-500" />
                            <span>Ruleset:</span>
                            <span className="font-medium text-purple-600 dark:text-purple-400">
                              {rulesets.find((r: any) => r.id === reportData.rulesetId)?.name || `Ruleset #${reportData.rulesetId}`}
                            </span>
                          </div>
                        )}
                        <div className="space-y-3">
                          {Object.entries(reportData.criteriaScores).map(([name, score]: [string, any]) => {
                            const numScore = typeof score === 'number' ? score : parseFloat(score) || 0;
                            const level = getRiskLevel(numScore);
                            const matchingCriteria = criteria?.find((c: RiskCriteria) => c.name === name);
                            const weight = matchingCriteria ? Number(matchingCriteria.weightFactor) : null;
                            const catConfig = matchingCriteria ? (criteriaCategoryConfig[matchingCriteria.category] || criteriaCategoryConfig.custom) : criteriaCategoryConfig.custom;
                            const CatIcon = catConfig.icon;
                            return (
                              <div key={name} className="space-y-1">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                                    <CatIcon className="h-4 w-4 shrink-0" style={{ color: catConfig.color }} />
                                    {name}
                                    {weight !== null && (
                                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/50 px-1 py-0.5 rounded">
                                        {weight.toFixed(2)}
                                      </span>
                                    )}
                                  </span>
                                  <Badge className={`text-xs ${getRiskLevelColor(level)}`}>
                                    {Math.round(numScore)}%
                                  </Badge>
                                </div>
                                <Progress value={numScore} className="h-1.5" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <Separator />

                    {reportData.analysisResults?.keyRisks?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-orange-600" />
                          Key Risks
                        </h4>
                        <ul className="space-y-1.5">
                          {reportData.analysisResults.keyRisks.map((risk: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {reportData.triggerReasons?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          Trigger Reasons
                        </h4>
                        <ul className="space-y-1.5">
                          {reportData.triggerReasons.map((reason: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {reportData.recommendations?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <BrainCircuit className="h-4 w-4 text-green-600" />
                          Recommendations
                        </h4>
                        <ul className="space-y-1.5">
                          {reportData.recommendations.map((rec: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {reportData.analysisResults?.mitigationStrategies?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <Target className="h-4 w-4 text-blue-600" />
                          Mitigation Strategies
                        </h4>
                        <ul className="space-y-1.5">
                          {reportData.analysisResults.mitigationStrategies.map((strategy: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                              {strategy}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {reportData.analysisResults?.confidenceFactors?.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                          <Info className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                          Confidence Factors
                        </h4>
                        <ul className="space-y-1.5">
                          {reportData.analysisResults.confidenceFactors.map((factor: string, i: number) => (
                            <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <ChevronRight className="h-4 w-4 text-gray-500 shrink-0 mt-0.5" />
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {(reportData.rawPrompt || reportData.rawResponse) && (
                      <div className="space-y-3">
                        <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Code className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          Raw AI Data
                        </h4>

                        {reportData.rawPrompt && (
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setShowRawPrompt(!showRawPrompt)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                            >
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <MessageSquareText className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                                Raw Prompt Sent to AI
                              </span>
                              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showRawPrompt ? 'rotate-180' : ''}`} />
                            </button>
                            {showRawPrompt && (
                              <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto leading-relaxed">
                                  {reportData.rawPrompt}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}

                        {reportData.rawResponse && (
                          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <button
                              onClick={() => setShowRawResponse(!showRawResponse)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
                            >
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <Code className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                                Raw AI Response (JSON)
                              </span>
                              <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showRawResponse ? 'rotate-180' : ''}`} />
                            </button>
                            {showRawResponse && (
                              <div className="p-3 bg-gray-50/50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700">
                                <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-y-auto leading-relaxed">
                                  {(() => {
                                    try {
                                      return JSON.stringify(JSON.parse(reportData.rawResponse), null, 2);
                                    } catch {
                                      return reportData.rawResponse;
                                    }
                                  })()}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}