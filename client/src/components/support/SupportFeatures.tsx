import React, { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SupportFeatureButton } from "@/components/support/support-feature-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { 
  SortableTable, 
  SortableTableHeader, 
  SortableTableHead, 
  SortableTableBody, 
  SortableTableRow, 
  SortableTableCell 
} from "@/components/ui/sortable-table";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { 
  PocketKnife, 
  ScanSearch, 
  Search, 
  Download, 
  Eye, 
  Clock,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Target,
  Rocket
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { DashboardRenderer } from "@/components/dashboard/dashboard-renderer";
import { buildDashboardDataContext } from "@/components/dashboard/main-dashboard-utils";
import { useDashboardRuntime, type SavedMetric } from "@/hooks/useMetricEngine";

interface SupportRequest {
  id: number;
  type: "support" | "feature";
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "Implemented" | "Completed" | "Rejected" | "Under Review" | "In Progress" | "Not Started" | "Future Roadmap";
  submittedBy: string;
  submittedAt: string;
  customerId?: number;
  customerName?: string;
  projectId?: number;
  projectName?: string;
  hasAttachment: boolean;
  attachmentFileName?: string;
  assignedToUserId?: number; // Fixed: Backend uses assignedToUserId
  resolvedAt?: string;
  internalNotes?: string;
}

interface Filters {
  search: string;
  type: string;
  priority: string;
  status: string;
  customer: string;
  assignedTo: string;
}

export default function SupportFeaturesPage() {
  const { user } = useAuth();
  const { userRole } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // RBAC - Only internal users can access this page
  const canAccessPage = ['admin', 'engineer', 'proserv', 'support'].includes((userRole || '').toLowerCase());
  
  const [filters, setFilters] = useState<Filters>({
    search: "",
    type: "all",
    priority: "all",
    status: "all",
    customer: "all",
    assignedTo: "all"
  });

  // Sorting state
  const { sortConfig, handleSort } = useSortState({ key: "submittedAt", direction: "desc" });

  // Fetch support requests
  const { data: supportRequests = [], isLoading, error } = useQuery({
    queryKey: ["/api/support-requests"],
    queryFn: () => apiRequest("GET", "/api/support-requests"),
    staleTime: 30 * 1000, // 30 seconds
    enabled: canAccessPage,
  });

  // Fetch customers for filter dropdown
  const { data: customers = [] } = useQuery({
    queryKey: ["/api/customers"],
    queryFn: () => apiRequest("GET", "/api/customers"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: canAccessPage,
  });

  // Fetch users for assignment filter
  const { data: users = [] } = useQuery({
    queryKey: ["/api/users"],
    queryFn: () => apiRequest("GET", "/api/users"),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: canAccessPage,
  });

  // Data needed by the protected `support` dashboard widgets
  // (kpi_strip + support_metrics). The support_metrics widget self-fetches
  // analytics from `/api/support-requests/analytics`; the KPI strip
  // computes from the project list.
  const { data: dashboardProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    queryFn: () => apiRequest("GET", "/api/projects"),
    staleTime: 60 * 1000,
    enabled: canAccessPage,
  });

  const { data: savedMetrics = [] } = useQuery<SavedMetric[]>({
    queryKey: ["/api/dashboard-metrics"],
    queryFn: () => apiRequest("GET", "/api/dashboard-metrics"),
    staleTime: 5 * 60 * 1000,
    enabled: canAccessPage,
  });

  const dynamicResults = useDashboardRuntime(dashboardProjects, savedMetrics ?? []);

  const supportDashboardContext = useMemo(
    () => buildDashboardDataContext(dashboardProjects, dynamicResults),
    [dashboardProjects, dynamicResults],
  );

  // Filter and sort data
  const filteredRequests = supportRequests.filter((request: SupportRequest) => {
    const matchesSearch = 
      request.title.toLowerCase().includes(filters.search.toLowerCase()) ||
      request.description.toLowerCase().includes(filters.search.toLowerCase()) ||
      request.submittedBy.toLowerCase().includes(filters.search.toLowerCase());
    
    const matchesType = filters.type === "all" || request.type === filters.type;
    const matchesPriority = filters.priority === "all" || request.priority === filters.priority;
    const matchesStatus = filters.status === "all" || request.status === filters.status;
    const matchesCustomer = filters.customer === "all" || request.customerId?.toString() === filters.customer;
    // Fixed: Compare assignedToUserId properly with backend field
    const matchesAssignedTo = filters.assignedTo === "all" || 
      (request.assignedToUserId && request.assignedToUserId.toString() === filters.assignedTo);

    return matchesSearch && matchesType && matchesPriority && matchesStatus && matchesCustomer && matchesAssignedTo;
  });

  const sortedRequests = stableSort(filteredRequests, makeComparator(sortConfig));

  // Calculate active filter count
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

  // Clear all filters
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

  // Priority styling
  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    };
    return variants[priority as keyof typeof variants] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  };

  // Status styling
  const getStatusBadge = (status: string) => {
    const variants = {
      "Not Started": "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
      "In Progress": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      "Under Review": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      "Implemented": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      "Completed": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      "Future Roadmap": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      "Rejected": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
    };
    return variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'not started':
        return Clock;
      case 'in progress':
        return Target;
      case 'under review':
        return Eye;
      case 'implemented':
        return CheckCircle2;
      case 'completed':
        return CheckCircle;
      case 'future roadmap':
        return Rocket;
      case 'rejected':
        return XCircle;
      default:
        return Clock;
    }
  };

  // Check if request is stale (5+ days old)
  const isStale = (submittedAt: string) => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    return new Date(submittedAt) < fiveDaysAgo;
  };

  // Download attachment with proper error handling
  const handleDownloadAttachment = async (requestId: number, fileName: string) => {
    try {
      const response = await fetch(`/api/support-requests/${requestId}/download`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Download started",
        description: `Downloading ${fileName}`,
      });
    } catch (error) {
      console.error('Download failed:', error);
      showErrorToast("Download failed", "Unable to download the file. Please try again.");
    }
  };

  // Handle successful submission with proper query invalidation
  const handleSubmissionSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/support-requests"] });
  };

  if (!canAccessPage) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Access Denied</h2>
          <p className="text-gray-600 dark:text-gray-400">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <PocketKnife className="h-6 w-6 text-blue-600" />
              Support & Features
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Manage support requests and feature requests from customers and team members
            </p>
          </div>
          <SupportFeatureButton 
            text="New Request"
            variant="default"
            onSuccess={handleSubmissionSuccess}
          />
        </div>

        {/* Search and Filters */}
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <FilterLabel>Search Requests</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
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
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
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

        {/* Built-in Support dashboard (kpi_strip + support_metrics) */}
        <div className="mb-4">
          <DashboardRenderer
            pageKey="support"
            dataContext={supportDashboardContext}
          />
        </div>

        {/* Support Requests Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Support & Feature Requests ({filteredRequests.length})</span>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {supportRequests.length > 0 && `${filteredRequests.length} of ${supportRequests.length} requests`}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600 dark:text-gray-400">Loading requests...</span>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-8">
                <AlertTriangle className="h-8 w-8 text-red-500" />
                <span className="ml-2 text-red-600">Failed to load requests</span>
              </div>
            ) : sortedRequests.length === 0 ? (
              <div className="text-center py-8">
                <PocketKnife className="h-12 w-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
                <p className="text-gray-500 dark:text-gray-400 mb-4">
                  {supportRequests.length === 0 
                    ? "No support requests yet" 
                    : "No requests match your filters"
                  }
                </p>
                {supportRequests.length === 0 && (
                  <SupportFeatureButton 
                    text="Submit First Request"
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
                    {(sortedRequests as SupportRequest[]).map((request: SupportRequest) => (
                      <SortableTableRow key={request.id}>
                        <SortableTableCell className="font-medium">
                          #{request.id}
                        </SortableTableCell>
                        <SortableTableCell>
                          <Badge 
                            variant={request.type === "support" ? "default" : "secondary"}
                            className={request.type === "support" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"}
                          >
                            {request.type === "support" ? "Support" : "Feature"}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="max-w-xs">
                            <div 
                              className={`font-medium ${isStale(request.submittedAt) && (request.status === 'Not Started' || request.status === 'Under Review') ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                            >
                              {request.title}
                              {isStale(request.submittedAt) && (request.status === 'Not Started' || request.status === 'Under Review') && (
                                <Clock className="h-4 w-4 inline ml-1 text-red-500" />
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              {request.description}
                            </div>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell>
                          <Badge className={getPriorityBadge(request.priority)}>
                            {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell>
                          <Badge className={getStatusBadge(request.status)}>
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
                          {request.submittedBy}
                        </SortableTableCell>
                        <SortableTableCell>
                          {request.customerName || '-'}
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="text-sm">
                            {formatDistanceToNow(new Date(request.submittedAt), { addSuffix: true })}
                          </div>
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                            {request.hasAttachment && request.attachmentFileName && (
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleDownloadAttachment(request.id, request.attachmentFileName!)}
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}