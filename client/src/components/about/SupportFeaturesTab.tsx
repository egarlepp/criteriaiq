import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  SortableTable, 
  SortableTableHeader, 
  SortableTableHead, 
  SortableTableBody, 
  SortableTableRow, 
  SortableTableCell 
} from "@/components/ui/sortable-table";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { SupportFeatureButton } from "@/components/support/support-feature-button";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { PocketKnife, Search, Clock, Target, Eye, CheckCircle2, CheckCircle, Rocket, XCircle, Loader2, AlertTriangle, Edit, Download, SquareTerminal, Sparkles, LayoutGrid, Lightbulb, Wrench, Bug, BarChart3, ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { formatDistanceToNow } from "date-fns";
import { SupportRequest, Filters, getPriorityBadge, getStatusBadge, getStatusIcon, getApplicationPageDisplayName } from "./types";
import { useAuth } from "@/hooks/useAuth";
import { ErrorAuditLogTab } from "./ErrorAuditLogTab";
import { ClientErrorsAnalytics } from "./ClientErrorsAnalytics";
import { extractErrorLogFacets, type ErrorLogFilters, type ErrorLogLike } from "./error-audit-log-utils";
import { SEVERITY_CONFIG, SEVERITY_ORDER, type SeverityLevel } from "@/lib/error-severity";

interface SupportFeaturesTabProps {
  supportRequests: SupportRequest[];
  supportRequestsLoading: boolean;
  supportRequestsError: any;
  customers: any[];
  users: any[];
  canAccessSupportFeatures: boolean;
  filters: Filters;
  setFilters: (filters: Filters) => void;
  handlePreviewRequest: (request: SupportRequest) => void;
  handleEditRequest: (request: SupportRequest) => void;
  handleDeleteRequest: (request: SupportRequest) => void;
  handleDownloadAttachment: (requestId: number, fileName: string) => void;
  handleSubmissionSuccess: () => void;
  subtab?: string;
  onSubtabChange?: (subtab: string) => void;
}

export const SupportFeaturesTab = ({
  supportRequests,
  supportRequestsLoading,
  supportRequestsError,
  customers,
  users,
  canAccessSupportFeatures,
  filters,
  setFilters,
  handlePreviewRequest,
  handleEditRequest,
  handleDeleteRequest,
  handleDownloadAttachment,
  handleSubmissionSuccess,
  subtab,
  onSubtabChange
}: SupportFeaturesTabProps) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const { sortConfig, handleSort } = useSortState({ key: "submittedAt", direction: "desc" });
  const [activeSubtab, setActiveSubtab] = useState<"requests" | "error-log">(
    (subtab === "error-log" && isAdmin ? "error-log" : "requests")
  );

  const handleSubtabChange = (id: string) => {
    setActiveSubtab(id as "requests" | "error-log");
    onSubtabChange?.(id);
  };

  useEffect(() => {
    if (subtab === "error-log" && isAdmin) {
      setActiveSubtab("error-log");
    } else if (subtab === "requests" || !subtab) {
      setActiveSubtab("requests");
    }
  }, [subtab, isAdmin]);

  const [errorSearchTerm, setErrorSearchTerm] = useState("");
  const [errorContextFilter, setErrorContextFilter] = useState("all");
  // Filter state for the additional dropdowns introduced in v0.7.52
  // (Version / URL / Severity / User / Date Range). All default to
  // "no filter" so the table behaves exactly like it did before
  // anyone touches the dropdowns.
  const [errorVersionFilter, setErrorVersionFilter] = useState<string>("all");
  const [errorUrlFilter, setErrorUrlFilter] = useState<string>("all");
  const [errorSeverityFilter, setErrorSeverityFilter] = useState<SeverityLevel | "all">("all");
  const [errorUserFilter, setErrorUserFilter] = useState<string>("all");
  const [errorDateFrom, setErrorDateFrom] = useState<string>("");
  const [errorDateTo, setErrorDateTo] = useState<string>("");
  // Raw, unfiltered log set — used to derive each dropdown's options
  // so admins only see filter values that actually exist in the data.
  const [errorRawLogs, setErrorRawLogs] = useState<ErrorLogLike[]>([]);
  const errorFacets = useMemo(() => extractErrorLogFacets(errorRawLogs), [errorRawLogs]);
  // The original errorUniqueContexts state is now derived from the same
  // facets so the existing Context dropdown keeps working without
  // separate plumbing through the audit log tab.
  const errorUniqueContexts = errorFacets.contexts;
  // Controls the expandable client-error analytics row below the metric
  // cards. The /api/error-logs fetch inside ClientErrorsAnalytics is
  // gated on this flag so the (rate-limited) endpoint is only hit when
  // the admin actually opens the panel.
  const [errorAnalyticsExpanded, setErrorAnalyticsExpanded] = useState(false);

  // Client-error count for the admin-only KPI tile in the header. We use the
  // dedicated /count endpoint instead of `.length`-ing the full /api/error-logs
  // payload — that endpoint returns up to 500 rows and is rate-limited at
  // 100/hour per user. Refetched on a slow 60s cadence so the tile reflects
  // newly captured errors without hammering the table.
  const { data: errorCountData, isLoading: errorCountLoading } = useQuery<{ count: number }>({
    queryKey: ["/api/error-logs/count"],
    queryFn: () => apiRequest("GET", "/api/error-logs/count"),
    enabled: isAdmin,
    refetchInterval: 60000,
    refetchOnWindowFocus: false,
  });
  const errorCount = errorCountData?.count ?? 0;

  const errorActiveFilterCount = useMemo(() => {
    let count = 0;
    if (errorSearchTerm) count++;
    if (errorContextFilter !== "all") count++;
    if (errorVersionFilter !== "all") count++;
    if (errorUrlFilter !== "all") count++;
    if (errorSeverityFilter !== "all") count++;
    if (errorUserFilter !== "all") count++;
    if (errorDateFrom) count++;
    if (errorDateTo) count++;
    return count;
  }, [errorSearchTerm, errorContextFilter, errorVersionFilter, errorUrlFilter, errorSeverityFilter, errorUserFilter, errorDateFrom, errorDateTo]);

  // Combined filter object — passed straight to the analytics panel so
  // it shares the exact same filter set. The audit-log tab receives
  // the same fields as individual props (legacy shape kept so existing
  // callers don't break).
  const errorFilters: ErrorLogFilters = useMemo(() => ({
    searchTerm: errorSearchTerm,
    contextFilter: errorContextFilter,
    versionFilter: errorVersionFilter,
    urlFilter: errorUrlFilter,
    severityFilter: errorSeverityFilter,
    userFilter: errorUserFilter,
    dateFrom: errorDateFrom,
    dateTo: errorDateTo,
  }), [errorSearchTerm, errorContextFilter, errorVersionFilter, errorUrlFilter, errorSeverityFilter, errorUserFilter, errorDateFrom, errorDateTo]);

  const clearErrorFilters = () => {
    setErrorSearchTerm("");
    setErrorContextFilter("all");
    setErrorVersionFilter("all");
    setErrorUrlFilter("all");
    setErrorSeverityFilter("all");
    setErrorUserFilter("all");
    setErrorDateFrom("");
    setErrorDateTo("");
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.type !== "all") count++;
    if (filters.priority !== "all") count++;
    if (filters.status !== "all") count++;
    if (filters.customer !== "all") count++;
    if (filters.assignedTo !== "all") count++;
    return count;
  }, [filters]);

  const clearAllFilters = () => {
    setFilters({
      search: "",
      type: "all",
      priority: "all",
      status: "all",
      customer: "all",
      assignedTo: "all"
    });
  };

  const filteredRequests = supportRequests.filter((request: SupportRequest) => {
    const matchesSearch = 
      (request.title || '').toLowerCase().includes(filters.search.toLowerCase()) ||
      (request.description || '').toLowerCase().includes(filters.search.toLowerCase()) ||
      (request.submittedBy || '').toLowerCase().includes(filters.search.toLowerCase());
    
    const matchesType = filters.type === "all" || request.type === filters.type;
    const matchesPriority = filters.priority === "all" || request.priority === filters.priority;
    const matchesStatus = filters.status === "all" || request.status === filters.status;
    const matchesCustomer = filters.customer === "all" || request.customerId?.toString() === filters.customer;
    const matchesAssignedTo = filters.assignedTo === "all" || 
      (request.assignedToUserId && request.assignedToUserId.toString() === filters.assignedTo);

    return matchesSearch && matchesType && matchesPriority && matchesStatus && matchesCustomer && matchesAssignedTo;
  });

  const sortedRequests = stableSort(filteredRequests, makeComparator(sortConfig));

  // Paginated requests
  const paginatedRequests = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedRequests.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedRequests, currentPage, itemsPerPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Clamp page when data shrinks
  useEffect(() => {
    const totalPages = Math.ceil(sortedRequests.length / itemsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [sortedRequests.length, currentPage, itemsPerPage]);

  const isStale = (submittedAt: string) => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    return new Date(submittedAt) < fiveDaysAgo;
  };

  const featureRequests = useMemo(() => supportRequests.filter(r => r.type === "feature"), [supportRequests]);
  const supportIssues = useMemo(() => supportRequests.filter(r => r.type === "issue"), [supportRequests]);

  const getTop3Pages = (requests: SupportRequest[]) => {
    const pageCounts: Record<string, number> = {};
    requests.forEach(r => {
      const page = r.applicationPage || 'Not specified';
      pageCounts[page] = (pageCounts[page] || 0) + 1;
    });
    return Object.entries(pageCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([page, count]) => ({ page: getApplicationPageDisplayName(page), count }));
  };

  const topFeaturePages = useMemo(() => getTop3Pages(featureRequests), [featureRequests]);
  const topSupportPages = useMemo(() => getTop3Pages(supportIssues), [supportIssues]);

  if (!canAccessSupportFeatures) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">

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
                <PocketKnife data-title-icon className="h-6 w-6" />
                Support & Feature Requests
              </CardTitle>
              <CardDescription>
                Manage support requests and feature requests from customers and team members
              </CardDescription>
            </CardHeader>

            {/* Decorative Background Icon */}
            <PocketKnife
              className="absolute right-24 top-1/2 h-32 w-32 text-blue-500/5 dark:text-white/5 pointer-events-none"
              style={{ transform: "translateY(-50%) rotate(-12deg)" }}
            />
          </div>

          {/* RIGHT SIDE: The "Floating Rail" */}
          <div className="w-20 bg-[#1e3a8a] dark:bg-blue-900 rounded-lg flex items-center justify-center shadow-md text-white shrink-0 relative overflow-hidden ml-2 group-hover:shadow-lg transition-all duration-300">
            {/* Glass Gloss Effect */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
            <SquareTerminal className="h-8 w-8 text-blue-100" />
          </div>
        </div>

        <CardContent className="p-6 pt-[8px] pb-[8px] relative z-10">
          <TooltipProvider>
            <div
              className={
                isAdmin
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6"
                  : "grid grid-cols-1 md:grid-cols-4 gap-6"
              }
            >
              <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/75 border-purple-200">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Lightbulb className="h-32 w-32 opacity-10 text-purple-600" />
                </div>
                <CardContent className="relative p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Lightbulb className="w-5 h-5 text-purple-900 dark:text-purple-300" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>Total feature requests submitted</p>
                      </TooltipContent>
                    </Tooltip>
                    <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Feature Requests</h3>
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    {supportRequestsLoading ? <Skeleton className="h-8 w-12" /> : featureRequests.length}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total feature requests</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden bg-indigo-50/80 dark:bg-indigo-950/75 border-indigo-200">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <LayoutGrid className="h-32 w-32 opacity-10 text-indigo-600" />
                </div>
                <CardContent className="relative p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <LayoutGrid className="w-5 h-5 text-indigo-900 dark:text-indigo-300" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>Top 3 pages with most feature requests</p>
                      </TooltipContent>
                    </Tooltip>
                    <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Top Feature Pages</h3>
                  </div>
                  <div className="space-y-1">
                    {supportRequestsLoading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : topFeaturePages.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No data yet</p>
                    ) : (
                      topFeaturePages.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300 truncate">{item.page}</span>
                          <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 ml-2">{item.count}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <Wrench className="h-32 w-32 opacity-10 text-blue-600" />
                </div>
                <CardContent className="relative p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Wrench className="w-5 h-5 text-blue-900 dark:text-blue-300" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>Total support requests submitted</p>
                      </TooltipContent>
                    </Tooltip>
                    <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Support Requests</h3>
                  </div>
                  <div className="text-2xl font-bold text-blue-600">
                    {supportRequestsLoading ? <Skeleton className="h-8 w-12" /> : supportIssues.length}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Total support requests</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden bg-cyan-50/80 dark:bg-cyan-950/75 border-cyan-200">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <LayoutGrid className="h-32 w-32 opacity-10 text-cyan-600" />
                </div>
                <CardContent className="relative p-6">
                  <div className="flex items-center space-x-2 mb-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <LayoutGrid className="w-5 h-5 text-cyan-900 dark:text-cyan-300" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                        <p>Top 3 pages with most support requests</p>
                      </TooltipContent>
                    </Tooltip>
                    <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Top Support Pages</h3>
                  </div>
                  <div className="space-y-1">
                    {supportRequestsLoading ? (
                      <Skeleton className="h-8 w-full" />
                    ) : topSupportPages.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No data yet</p>
                    ) : (
                      topSupportPages.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300 truncate">{item.page}</span>
                          <Badge className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200 ml-2">{item.count}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Admin-only Client Errors tile. Click to jump to the
                  Error Audit Log sub-tab below. Red accent matches the
                  bug icon in the audit log card itself. */}
              {isAdmin && (
                <Card
                  className="relative overflow-hidden bg-red-50/80 dark:bg-red-950/75 border-red-200 dark:border-red-900 cursor-pointer hover:bg-red-100/80 dark:hover:bg-red-950 transition-colors"
                  onClick={() => handleSubtabChange("error-log")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSubtabChange("error-log");
                    }
                  }}
                  data-testid="kpi-client-errors"
                  aria-label="Open Client Error Audit Log"
                >
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <Bug className="h-32 w-32 opacity-10 text-red-600" />
                  </div>
                  <CardContent className="relative p-6">
                    <div className="flex items-center space-x-2 mb-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Bug className="w-5 h-5 text-red-900 dark:text-red-300" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md">
                          <p>Total client-side errors captured. Click to open the Error Audit Log.</p>
                        </TooltipContent>
                      </Tooltip>
                      <h3 className="tracking-tight text-[19px] font-bold text-gray-900 dark:text-gray-100">Client Errors</h3>
                    </div>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {errorCountLoading ? <Skeleton className="h-8 w-12" /> : errorCount}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Captured client-side errors</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 h-7 text-xs bg-white/70 dark:bg-gray-900/40 border-red-200 dark:border-red-900 hover:bg-white dark:hover:bg-gray-900"
                      onClick={(e) => {
                        e.stopPropagation();
                        setErrorAnalyticsExpanded((prev) => !prev);
                      }}
                      data-testid="toggle-client-errors-analytics"
                      aria-expanded={errorAnalyticsExpanded}
                    >
                      <BarChart3 className="h-3.5 w-3.5 mr-1" />
                      {errorAnalyticsExpanded ? "Hide Analytics" : "View Analytics"}
                      {errorAnalyticsExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 ml-1" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 ml-1" />
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>
      {/* END Of Header */}

      {/* Expandable full-width client-error analytics row. Lives directly
          below the metric cards and is toggled by the "View Analytics"
          button on the Client Errors KPI tile. */}
      {isAdmin && errorAnalyticsExpanded && (
        <ClientErrorsAnalytics
          expanded={errorAnalyticsExpanded}
          filters={errorFilters}
        />
      )}

      {activeSubtab === "error-log" && isAdmin ? (
        <SearchFiltersSection
          activeFilterCount={errorActiveFilterCount}
          onClearFilters={clearErrorFilters}
        >
          {/* Row 1: structured dropdowns — Context / Version / URL /
              Severity / User. Options on each are derived from the
              actual rows present in the loaded log set so admins
              never see a value they can't reach. */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
            <div>
              <FilterLabel>Context</FilterLabel>
              <Select value={errorContextFilter} onValueChange={setErrorContextFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Contexts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Contexts</SelectItem>
                  {errorUniqueContexts.map(ctx => (
                    <SelectItem key={ctx} value={ctx}>{ctx}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Version</FilterLabel>
              <Select value={errorVersionFilter} onValueChange={setErrorVersionFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Versions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Versions</SelectItem>
                  {errorFacets.versions.map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>URL</FilterLabel>
              <Select value={errorUrlFilter} onValueChange={setErrorUrlFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All URLs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All URLs</SelectItem>
                  {errorFacets.urls.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Severity</FilterLabel>
              <Select
                value={errorSeverityFilter}
                onValueChange={v => setErrorSeverityFilter(v as SeverityLevel | "all")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  {SEVERITY_ORDER.map(level => (
                    <SelectItem key={level} value={level}>
                      {SEVERITY_CONFIG[level].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>User</FilterLabel>
              <Select value={errorUserFilter} onValueChange={setErrorUserFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {errorFacets.users.map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Row 2: free-text search + time-period range share a single
              row. Search grows to fill remaining space; date inputs
              hold a fixed width so the calendar pickers stay readable.
              Native <input type="date"> renders the browser's calendar
              on focus — no extra dependency needed and YYYY-MM-DD
              plumbs straight through the filter helper's inclusive
              end-of-day logic. */}
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <FilterLabel>Search</FilterLabel>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search errors..."
                  value={errorSearchTerm}
                  onChange={e => setErrorSearchTerm(e.target.value)}
                  className="pl-8 h-9"
                />
              </div>
            </div>
            <div className="w-full md:w-44">
              <FilterLabel>From Date</FilterLabel>
              <Input
                type="date"
                value={errorDateFrom}
                onChange={e => setErrorDateFrom(e.target.value)}
                className="h-9"
                aria-label="Filter errors captured on or after this date"
              />
            </div>
            <div className="w-full md:w-44">
              <FilterLabel>To Date</FilterLabel>
              <Input
                type="date"
                value={errorDateTo}
                onChange={e => setErrorDateTo(e.target.value)}
                className="h-9"
                aria-label="Filter errors captured on or before this date"
              />
            </div>
          </div>
        </SearchFiltersSection>
      ) : (
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <FilterLabel>Search Requests</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder="Search by title, description, or submitter..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <FilterLabel>Request Type</FilterLabel>
              <Select 
                value={filters.type} 
                onValueChange={(value) => setFilters({ ...filters, type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="support">Support Request</SelectItem>
                  <SelectItem value="feature">Feature Request</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Priority</FilterLabel>
              <Select 
                value={filters.priority} 
                onValueChange={(value) => setFilters({ ...filters, priority: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Status</FilterLabel>
              <Select 
                value={filters.status} 
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Not Started">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-600" />
                      <span>Not Started</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="In Progress">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-yellow-600" />
                      <span>In Progress</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Under Review">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4 text-blue-600" />
                      <span>Under Review</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Implemented">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>Implemented</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Completed">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Completed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Future Roadmap">
                    <div className="flex items-center gap-2">
                      <Rocket className="h-4 w-4 text-purple-600" />
                      <span>Future Roadmap</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="Rejected">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span>Rejected</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Customer</FilterLabel>
              <Select 
                value={filters.customer} 
                onValueChange={(value) => setFilters({ ...filters, customer: value })}
              >
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent className="w-64">
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((customer: any) => (
                    <SelectItem key={customer.id} value={customer.id.toString()}>
                      {customer.accountName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Assigned To</FilterLabel>
              <Select 
                value={filters.assignedTo} 
                onValueChange={(value) => setFilters({ ...filters, assignedTo: value })}
              >
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue placeholder="All Assignees" />
                </SelectTrigger>
                <SelectContent className="w-64">
                  <SelectItem value="all">All Assignees</SelectItem>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstName} {user.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>
      )}


      {activeSubtab === "error-log" && isAdmin ? (
        <ErrorAuditLogTab
          searchTerm={errorSearchTerm}
          setSearchTerm={setErrorSearchTerm}
          contextFilter={errorContextFilter}
          setContextFilter={setErrorContextFilter}
          versionFilter={errorVersionFilter}
          urlFilter={errorUrlFilter}
          severityFilter={errorSeverityFilter}
          userFilter={errorUserFilter}
          dateFrom={errorDateFrom}
          dateTo={errorDateTo}
          onLogsChange={setErrorRawLogs}
          onContextsChange={() => { /* contexts now derived from onLogsChange */ }}
        />
      ) : (
      <>
      {/* Support Requests Table */}
      <Card className="relative overflow-hidden">
        <DecorativeCardIcon icon={PocketKnife} />
        <CardHeader className="relative z-10">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <PocketKnife data-title-icon className="h-5 w-5" />
              <span>Support & Feature Requests ({filteredRequests.length})</span>
            </CardTitle>
            <SupportFeatureButton
              size="sm"
              text="New Support/Feature Request"
              variant="default"
              onSuccess={handleSubmissionSuccess}
            />
          </div>
        </CardHeader>
        <CardContent className="relative z-10">
          {supportRequestsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading requests...</span>
            </div>
          ) : supportRequestsError ? (
            <div className="flex items-center justify-center py-8">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <span className="ml-2 text-red-600">Failed to load requests</span>
            </div>
          ) : sortedRequests.length === 0 ? (
            <div className="text-center py-8">
              <PocketKnife className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 mb-4">
                {supportRequests.length === 0 
                  ? "No support or feature requests yet" 
                  : "No requests match your filters"
                }
              </p>
              {supportRequests.length === 0 && (
                <SupportFeatureButton 
                  text="Submit First Support/Feature Request"
                  variant="outline"
                  onSuccess={handleSubmissionSuccess}
                />
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <SortableTable>
                <SortableTableHeader>
                  <SortableTableRow>
                  <SortableTableHead
                    sortKey="id"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by request ID"
                  >
                    ID
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="type"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by request type"
                  >
                    Type
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="title"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by title"
                  >
                    Title
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="priority"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by priority"
                  >
                    Priority
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="status"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by status"
                  >
                    Status
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="submittedBy"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by submitter"
                  >
                    Submitted By
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="customerName"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by customer"
                  >
                    Customer
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="submittedAt"
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    tooltipText="Click to sort by submission date"
                  >
                    Submitted
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
                  {(paginatedRequests as SupportRequest[]).map((request: SupportRequest) => (
                    <SortableTableRow key={request.id}>
                      <SortableTableCell className="font-medium">
                        #{request.id}
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge 
                          variant={request.type === "issue" ? "default" : "secondary"}
                          className={request.type === "issue" ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"}
                        >
                          {request.type === "issue" ? "Support" : "Feature"}
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="max-w-xs">
                          <div 
                            className={`font-medium ${request.submittedAt && isStale(request.submittedAt) && (request.status === 'Not Started' || request.status === 'Under Review') ? 'text-red-600' : 'text-gray-900'}`}
                          >
                            {request.title}
                            {request.submittedAt && isStale(request.submittedAt) && (request.status === 'Not Started' || request.status === 'Under Review') && (
                              <Clock className="h-4 w-4 inline ml-1 text-red-500" />
                            )}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {request.description}
                          </div>
                        </div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge className={`${getPriorityBadge(request.priority)} px-2 py-1 text-xs font-medium`}>
                          {request.priority ? 
                            request.priority.charAt(0).toUpperCase() + request.priority.slice(1) : 
                            'Medium'
                          }
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        <Badge className={`${getStatusBadge(request.status)} px-2 py-1 text-xs font-medium`}>
                          <div className="flex items-center gap-1.5">
                            {(() => {
                              const StatusIcon = getStatusIcon(request.status);
                              return <StatusIcon className="h-3.5 w-3.5" />;
                            })()}
                            {request.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </div>
                        </Badge>
                      </SortableTableCell>
                      <SortableTableCell>
                        {request.submittedBy || request.submittedByName || 'Unknown'}
                      </SortableTableCell>
                      <SortableTableCell>
                        {request.customerName || 'None'}
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="text-sm">
                          {(request.submittedAt || request.submittedDate) ? 
                            formatDistanceToNow(new Date((request.submittedAt || request.submittedDate)!), { addSuffix: true }) : 
                            'Unknown'
                          }
                        </div>
                      </SortableTableCell>
                      <SortableTableCell>
                        <div className="flex items-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handlePreviewRequest(request)}
                            title="Preview request details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleEditRequest(request)}
                            title="Edit request"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DangerIconButton
                            onClick={() => handleDeleteRequest(request)}
                            title="Delete request"
                          />
                          {request.hasAttachment && request.attachmentFileName && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleDownloadAttachment(request.id, request.attachmentFileName!)}
                              title="Download attachment"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </SortableTableCell>
                    </SortableTableRow>
                  ))}
                </SortableTableBody>
              </SortableTable>
              {sortedRequests.length > 0 && (
                <TablePaginationFooter
                  totalItems={sortedRequests.length}
                  pageSize={itemsPerPage}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  entityLabel="requests"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </>
      )}
    </div>
  );
};
