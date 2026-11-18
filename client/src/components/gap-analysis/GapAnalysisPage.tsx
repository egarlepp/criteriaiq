import { SolutionGraphic } from "@/components/ui/solution-graphic";
import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SortableTable,
  SortableTableHead,
  SortableTableHeader,
  SortableTableBody,
  SortableTableRow,
  SortableTableCell,
} from "@/components/ui/sortable-table";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import {
  SearchFiltersSection,
  FilterLabel,
} from "@/components/ui/search-filters-section";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GapFormDialog } from "@/components/gap-analysis/GapFormDialog";
import { SolutionBadge } from "@/components/ui/solution-badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { format } from "date-fns";
import type { Gap } from "@shared/schema";
import { GapStatusEnum, GapCriticalityEnum } from "@shared/schema";
import { AlignVerticalSpaceAround, Plus, Edit, Trash2, Search, ExternalLink, Upload, Wrench, Route, Ban, CheckCircle2, Target, Building2, FlaskConical, Hammer } from "lucide-react";

// Helper function to get status icon component
function getStatusIcon(status: string, className: string = "h-3.5 w-3.5") {
  switch (status) {
    case "Submitted":
      return <Upload className={className} />;
    case "Being Researched":
      return <FlaskConical className={className} />;
    case "Working On":
      return <Hammer className={className} />;
    case "Workaround Available":
      return <Wrench className={className} />;
    case "Roadmap Candidate":
      return <Route className={className} />;
    case "Won't Do":
      return <Ban className={className} />;
    case "Implemented":
      return <CheckCircle2 className={className} />;
    default:
      return null;
  }
}
import { Link } from "wouter";

interface GapAnalysisPageProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  actionContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

function getCriticalityColor(criticality: string) {
  switch (criticality) {
    case "Blocker":
      return "bg-red-600 text-white dark:bg-red-700 dark:text-white";
    case "Must Have":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "Should Have":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "Nice to Have":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "Submitted":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
    case "Being Researched":
      return "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200";
    case "Working On":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
    case "Workaround Available":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "Roadmap Candidate":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
    case "Won't Do":
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
    case "Implemented":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
}

export default function GapAnalysisPage({ filterContainerRef, actionContainerRef, onFilterStateChange }: GapAnalysisPageProps = {}) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [solutionFilter, setSolutionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [criticalityFilter, setCriticalityFilter] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [gapToEdit, setGapToEdit] = useState<Gap | null>(null);
  const [gapToDelete, setGapToDelete] = useState<Gap | null>(null);
  const [selectedDrawerGap, setSelectedDrawerGap] = useState<(Gap & { projectName?: string; customerName?: string; reportedByName?: string }) | null>(null);
  const [selectedAccountDrawerGap, setSelectedAccountDrawerGap] = useState<(Gap & { customerName?: string }) | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'id', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const { data: gaps = [], isLoading } = useQuery<(Gap & { projectName?: string; customerName?: string; reportedByName?: string })[]>({
    queryKey: ["/api/gaps"],
    enabled: isAuthenticated,
  });

  const { data: customers = [] } = useQuery<{ id: number; accountName: string }[]>({
    queryKey: ["/api/customers"],
    enabled: isAuthenticated,
  });

  const { data: products = [] } = useQuery<{ id: number; name: string; solutionIcon?: string | null; solutionIconName?: string | null }[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated,
  });

  const { data: allProjects = [] } = useQuery<any[]>({
    queryKey: ["/api/projects"],
    enabled: isAuthenticated,
  });

  const associatedProjects = useMemo(() => {
    if (!selectedDrawerGap) return [];
    const projectIds = new Set(
      gaps
        .filter((g) => g.gapName === selectedDrawerGap.gapName && g.projectId)
        .map((g) => g.projectId)
    );
    return allProjects.filter((p) => projectIds.has(p.id));
  }, [selectedDrawerGap, gaps, allProjects]);

  const gapNameAccountCountMap = useMemo(() => {
    const setsMap = new Map<string, Set<number>>();
    gaps.forEach((g) => {
      if (!g.customerId) return;
      if (!setsMap.has(g.gapName)) setsMap.set(g.gapName, new Set());
      setsMap.get(g.gapName)!.add(g.customerId);
    });
    const countMap = new Map<string, number>();
    setsMap.forEach((set, key) => countMap.set(key, set.size));
    return countMap;
  }, [gaps]);

  const impactedAccounts = useMemo(() => {
    if (!selectedAccountDrawerGap) return [];
    const seen = new Map<number, string>();
    gaps
      .filter((g) => g.gapName === selectedAccountDrawerGap.gapName && g.customerId && g.customerName)
      .forEach((g) => { if (!seen.has(g.customerId!)) seen.set(g.customerId!, (g as any).customerName!); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [selectedAccountDrawerGap, gaps]);

  const discoveredFirstAccountId = useMemo(() => {
    if (!selectedAccountDrawerGap) return null;
    const relevant = gaps
      .filter((g) => g.gapName === selectedAccountDrawerGap.gapName && g.customerId && g.createdAt)
      .sort((a, b) => {
        const diff = new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
        return diff !== 0 ? diff : a.id - b.id;
      });
    return relevant[0]?.customerId ?? null;
  }, [selectedAccountDrawerGap, gaps]);

  const gapNameProjectCountMap = useMemo(() => {
    const setsMap = new Map<string, Set<number>>();
    gaps.forEach((g) => {
      if (!g.projectId) return;
      if (!setsMap.has(g.gapName)) setsMap.set(g.gapName, new Set());
      setsMap.get(g.gapName)!.add(g.projectId);
    });
    const countMap = new Map<string, number>();
    setsMap.forEach((set, key) => countMap.set(key, set.size));
    return countMap;
  }, [gaps]);

  const gapNameAcvSumMap = useMemo(() => {
    const projectIdsByGapName = new Map<string, Set<number>>();
    gaps.forEach((g) => {
      if (!g.projectId) return;
      if (!projectIdsByGapName.has(g.gapName)) projectIdsByGapName.set(g.gapName, new Set());
      projectIdsByGapName.get(g.gapName)!.add(g.projectId);
    });
    const acvByProjectId = new Map<number, number>();
    allProjects.forEach((p: any) => {
      const acv = parseFloat((p.opportunityAcvValue || '').replace(/[^0-9.-]/g, '') || '0');
      acvByProjectId.set(p.id, acv);
    });
    const sumMap = new Map<string, number>();
    projectIdsByGapName.forEach((projectIds, gapName) => {
      let total = 0;
      projectIds.forEach((id) => { total += acvByProjectId.get(id) ?? 0; });
      sumMap.set(gapName, total);
    });
    return sumMap;
  }, [gaps, allProjects]);

  const discoveredFirstProjectId = useMemo(() => {
    if (!selectedDrawerGap) return null;
    const relevant = gaps
      .filter((g) => g.gapName === selectedDrawerGap.gapName && g.projectId && g.createdAt)
      .sort((a, b) => {
        const diff = new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime();
        return diff !== 0 ? diff : a.id - b.id;
      });
    return relevant[0]?.projectId ?? null;
  }, [selectedDrawerGap, gaps]);

  const deleteMutation = useMutation({
    mutationFn: async (gapId: number) => {
      return apiRequest("DELETE", `/api/gaps/${gapId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gaps"] });
      showSuccessToast("Gap deleted successfully");
      setGapToDelete(null);
    },
    onError: (error: any) => {
      showErrorToast("Error deleting gap", error.message);
    },
  });

  const handleEdit = (gap: Gap) => {
    setGapToEdit(gap);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setGapToEdit(null);
  };

  const uniqueSolutions = [...new Set(gaps.map((g) => g.impactedSolution))];
  const uniqueCustomers = [...new Set(gaps.filter((g) => g.customerName).map((g) => g.customerName))];

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (customerFilter !== "all") count++;
    if (solutionFilter !== "all") count++;
    if (statusFilter !== "all") count++;
    if (criticalityFilter !== "all") count++;
    return count;
  }, [searchTerm, customerFilter, solutionFilter, statusFilter, criticalityFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setCustomerFilter("all");
    setSolutionFilter("all");
    setStatusFilter("all");
    setCriticalityFilter("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, customerFilter, solutionFilter, statusFilter, criticalityFilter]);

  // Clamp currentPage when data shrinks (e.g., after deletion)
  const totalFilteredCount = gaps.filter((gap) => {
    const matchesSearch =
      searchTerm === "" ||
      gap.gapName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gap.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gap.impactedSolution.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (gap.customerName && gap.customerName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCustomer = customerFilter === "all" || gap.customerName === customerFilter;
    const matchesSolution = solutionFilter === "all" || gap.impactedSolution === solutionFilter;
    const matchesStatus = statusFilter === "all" || gap.status === statusFilter;
    const matchesCriticality = criticalityFilter === "all" || gap.criticality === criticalityFilter;
    return matchesSearch && matchesCustomer && matchesSolution && matchesStatus && matchesCriticality;
  }).length;

  useEffect(() => {
    if (totalFilteredCount === 0) {
      setCurrentPage(1);
    } else {
      const totalPages = Math.ceil(totalFilteredCount / itemsPerPage);
      if (currentPage > totalPages) {
        setCurrentPage(totalPages);
      }
    }
  }, [totalFilteredCount, currentPage, itemsPerPage]);

  const filteredGaps = gaps.filter((gap) => {
    const matchesSearch =
      searchTerm === "" ||
      gap.gapName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gap.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      gap.impactedSolution.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (gap.customerName && gap.customerName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCustomer =
      customerFilter === "all" || gap.customerName === customerFilter;

    const matchesSolution =
      solutionFilter === "all" || gap.impactedSolution === solutionFilter;

    const matchesStatus = statusFilter === "all" || gap.status === statusFilter;

    const matchesCriticality =
      criticalityFilter === "all" || gap.criticality === criticalityFilter;

    return matchesSearch && matchesCustomer && matchesSolution && matchesStatus && matchesCriticality;
  });

  const sortedGaps = [...filteredGaps].sort((a, b) => {
    const aValue = (a as any)[sortConfig.key] ?? '';
    const bValue = (b as any)[sortConfig.key] ?? '';
    
    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  // Pagination
  const paginatedGaps = sortedGaps.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please log in to access Gap Analysis.</p>
      </div>
    );
  }

  const filterContent = (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <div>
        <FilterLabel>Search</FilterLabel>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search gaps..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
      </div>
      <div>
        <FilterLabel>Account</FilterLabel>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Accounts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {uniqueCustomers.map((customer) => (
              <SelectItem key={customer} value={customer!}>
                {customer}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Solution</FilterLabel>
        <Select value={solutionFilter} onValueChange={setSolutionFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Solutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Solutions</SelectItem>
            {uniqueSolutions.map((solution) => {
              const product = products.find((p: any) => p.name === solution);
              return (
                <SelectItem key={solution} value={solution}>
                  <span className="flex items-center gap-2">
                    <SolutionGraphic graphic={product?.solutionIcon} icon={product?.solutionIconName} name="" className="w-4 h-4 object-contain shrink-0" />
                    {solution}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Status</FilterLabel>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {GapStatusEnum.options.map((status) => (
              <SelectItem key={status} value={status}>
                <span className="flex items-center gap-2">
                  {getStatusIcon(status, "h-4 w-4")}
                  {status}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <FilterLabel>Criticality</FilterLabel>
        <Select value={criticalityFilter} onValueChange={setCriticalityFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {GapCriticalityEnum.options.map((crit) => (
              <SelectItem key={crit} value={crit}>
                {crit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const actionButton = (
    <Button onClick={() => setIsFormOpen(true)} data-create-gap="true" size="sm">
      <AlignVerticalSpaceAround className="h-4 w-4 mr-2" />
      Log Global Solution Gap
    </Button>
  );

  return (
    <>
      {filterContainerRef?.current && createPortal(filterContent, filterContainerRef.current)}
      {actionContainerRef?.current && createPortal(actionButton, actionContainerRef.current)}
      
      <div className="space-y-4">
        {!filterContainerRef?.current && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlignVerticalSpaceAround className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  Gap Analysis
                </CardTitle>
                <CardDescription>
                  Track solution limitations and workarounds across all projects
                </CardDescription>
              </div>
              {actionButton}
            </CardHeader>
            <CardContent>
              <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
                {filterContent}
              </SearchFiltersSection>
            </CardContent>
          </Card>
        )}
        
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={AlignVerticalSpaceAround} />
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <AlignVerticalSpaceAround className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Solution Gaps Registry ({sortedGaps.length})
            </CardTitle>
            <CardDescription>
              Comprehensive view of all identified solution limitations, workarounds, and roadmap candidates
            </CardDescription>
          </CardHeader>
          <CardContent className="relative z-10">
        {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <SortableTable>
                <SortableTableHeader>
                  <SortableTableRow>
                    <SortableTableHead sortKey="gapName" sortConfig={sortConfig} onSort={handleSort}>Gap Name</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} sortable={false}>Impact</SortableTableHead>
                    <SortableTableHead sortKey="criticality" sortConfig={sortConfig} onSort={handleSort}>Criticality</SortableTableHead>
                    <SortableTableHead sortKey="impactedSolution" sortConfig={sortConfig} onSort={handleSort}>Impacted Solution</SortableTableHead>
                    <SortableTableHead sortKey="gapType" sortConfig={sortConfig} onSort={handleSort}>Gap Type</SortableTableHead>
                    <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                    <SortableTableHead sortKey="customerName" sortConfig={sortConfig} onSort={handleSort}>Account</SortableTableHead>
                    <SortableTableHead sortKey="projectName" sortConfig={sortConfig} onSort={handleSort}>Project</SortableTableHead>
                    <SortableTableHead sortKey="reportedByName" sortConfig={sortConfig} onSort={handleSort}>Reported By</SortableTableHead>
                    <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort}>Submitted</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} sortable={false} className="w-[80px]">Actions</SortableTableHead>
                  </SortableTableRow>
                </SortableTableHeader>
                <SortableTableBody>
                  {paginatedGaps.length === 0 ? (
                    <SortableTableRow>
                      <SortableTableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No gaps found
                      </SortableTableCell>
                    </SortableTableRow>
                  ) : (
                    paginatedGaps.map((gap) => (
                      <SortableTableRow key={gap.id}>
                        <SortableTableCell className="font-medium">
                          {gap.gapName}
                        </SortableTableCell>
                        <SortableTableCell>
                          {(() => {
                            const total = gapNameAcvSumMap.get(gap.gapName) ?? 0;
                            return total > 0
                              ? <span className="text-sm font-medium">${total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                              : <span className="text-muted-foreground text-sm">—</span>;
                          })()}
                        </SortableTableCell>
                        <SortableTableCell>
                          <Badge className={getCriticalityColor(gap.criticality)}>
                            {gap.criticality}
                          </Badge>
                        </SortableTableCell>
                        <SortableTableCell>
                          <TooltipProvider>
                            <SolutionBadge 
                              solutionName={gap.impactedSolution} 
                              solutionIcon={products.find((p: any) => p.name === gap.impactedSolution)?.solutionIcon}
                              solutionIconName={products.find((p: any) => p.name === gap.impactedSolution)?.solutionIconName}
                            />
                          </TooltipProvider>
                        </SortableTableCell>
                        <SortableTableCell>{gap.gapType}</SortableTableCell>
                        <SortableTableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className={`inline-flex items-center gap-1.5 cursor-default ${getStatusColor(gap.status)}`}>
                                  {getStatusIcon(gap.status)}
                                  {gap.status}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-white text-black text-xs px-2 py-1 border border-gray-200 shadow-md dark:bg-gray-800 dark:text-white dark:border-gray-700">
                                Last Modified: {gap.updatedAt ? format(new Date(gap.updatedAt), "MMM d, yyyy") : "—"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </SortableTableCell>
                        <SortableTableCell>
                          {gap.customerName ? (
                            <span className="text-sm">{gap.customerName}</span>
                          ) : (
                            (() => {
                              const count = gapNameAccountCountMap.get(gap.gapName) ?? 0;
                              return count > 0 ? (
                                <span className="text-sm text-muted-foreground">
                                  {count} {count === 1 ? "account" : "accounts"}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">N/A</span>
                              );
                            })()
                          )}
                        </SortableTableCell>
                        <SortableTableCell>
                          {gap.projectId ? (
                            <Link
                              href={`/project/${gap.projectId}`}
                              className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                            >
                              {gap.projectName || `Project #${gap.projectId}`}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            (() => {
                              const count = gapNameProjectCountMap.get(gap.gapName) ?? 0;
                              return count > 0 ? (
                                <span className="text-sm text-muted-foreground">
                                  {count} {count === 1 ? "project" : "projects"}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">Global</span>
                              );
                            })()
                          )}
                        </SortableTableCell>
                        <SortableTableCell>
                          {gap.reportedByName || "Unknown"}
                        </SortableTableCell>
                        <SortableTableCell>
                          {gap.createdAt ? format(new Date(gap.createdAt), "MMM d, yyyy") : "—"}
                        </SortableTableCell>
                        <SortableTableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/30 flex items-center gap-1.5"
                              onClick={() => setSelectedDrawerGap(gap)}
                              title="View associated projects"
                            >
                              <Target className="h-4 w-4" />
                              {(gapNameProjectCountMap.get(gap.gapName) ?? 0) > 0 && (
                                <span className="text-xs font-semibold tabular-nums">
                                  {gapNameProjectCountMap.get(gap.gapName)}
                                </span>
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-amber-600 hover:text-amber-800 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30 flex items-center gap-1.5"
                              onClick={() => setSelectedAccountDrawerGap(gap)}
                              title="View impacted accounts"
                            >
                              <Building2 className="h-4 w-4" />
                              {(gapNameAccountCountMap.get(gap.gapName) ?? 0) > 0 && (
                                <span className="text-xs font-semibold tabular-nums">
                                  {gapNameAccountCountMap.get(gap.gapName)}
                                </span>
                              )}
                            </Button>
                            <ResponsiveTableActionsMenu
                              actions={[
                                {
                                  id: "edit",
                                  label: "Edit",
                                  icon: Edit,
                                  onClick: () => handleEdit(gap),
                                },
                                {
                                  id: "delete",
                                  label: "Delete",
                                  icon: Trash2,
                                  variant: "destructive",
                                  onClick: () => setGapToDelete(gap),
                                },
                              ]}
                            />
                          </div>
                        </SortableTableCell>
                      </SortableTableRow>
                    ))
                  )}
                </SortableTableBody>
              </SortableTable>
            )}

            <TablePaginationFooter
              totalItems={sortedGaps.length}
              pageSize={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
              entityLabel="gaps"
            />
          </CardContent>
        </Card>
      </div>

      <GapFormDialog
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        gapToEdit={gapToEdit}
        availableProducts={products.map((p: any) => ({ id: p.id, name: p.name, solutionIcon: p?.solutionIcon, solutionIconName: p?.solutionIconName ?? null }))}
      />

      <AlertDialog open={!!gapToDelete} onOpenChange={() => setGapToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Gap?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this gap? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => gapToDelete && deleteMutation.mutate(gapToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!selectedDrawerGap} onOpenChange={(open) => !open && setSelectedDrawerGap(null)}>
        <SheetContent side="right" className="w-[480px] sm:w-[580px] overflow-hidden flex flex-col">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-purple-600" />
              Associated Projects
            </SheetTitle>
            <SheetDescription>
              Projects associated with{" "}
              <span className="font-semibold text-foreground">
                {selectedDrawerGap?.gapName}
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pt-4 space-y-4">
            {associatedProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Target className="h-8 w-8 opacity-30" />
                <p className="text-sm">No projects linked to this solution gap.</p>
              </div>
            ) : (() => {
              const firstProject = associatedProjects.find((p) => p.id === discoveredFirstProjectId);
              const otherProjects = associatedProjects.filter((p) => p.id !== discoveredFirstProjectId);

              const ProjectCard = ({ project, accent }: { project: any; accent?: boolean }) => (
                <div
                  className={
                    accent
                      ? "rounded-lg border-2 border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/40 p-4"
                      : "rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          #{project.id}
                        </span>
                        <span className="text-sm font-semibold truncate">
                          {project.name || project.customerName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {(project.internalStatus || project.status) && (
                          <Badge variant="secondary" className="text-xs">
                            {project.internalStatus || project.status}
                          </Badge>
                        )}
                        {project.opportunityAcvValue && (
                          <span className="text-xs text-muted-foreground font-medium">
                            ACV: {project.opportunityAcvValue}
                          </span>
                        )}
                      </div>
                    </div>
                    <Link
                      href={`/project/${project.id}`}
                      className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 shrink-0 flex items-center gap-1 text-xs font-medium"
                      onClick={() => setSelectedDrawerGap(null)}
                    >
                      Details <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );

              return (
                <>
                  {firstProject && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mb-2 flex items-center gap-1.5">
                        <Target className="h-3.5 w-3.5" />
                        Discovered First:
                      </p>
                      <ProjectCard project={firstProject} accent />
                    </div>
                  )}

                  {otherProjects.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Also Affected ({otherProjects.length})
                      </p>
                      {otherProjects.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!selectedAccountDrawerGap} onOpenChange={(open) => !open && setSelectedAccountDrawerGap(null)}>
        <SheetContent side="right" className="w-[480px] sm:w-[580px] overflow-hidden flex flex-col">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Building2 className="h-5 w-5 text-amber-600" />
              Impacted Accounts
            </SheetTitle>
            <SheetDescription>
              Accounts impacted by{" "}
              <span className="font-semibold text-foreground">
                {selectedAccountDrawerGap?.gapName}
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto pt-4 space-y-4">
            {impactedAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <Building2 className="h-8 w-8 opacity-30" />
                <p className="text-sm">No accounts linked to this gap.</p>
              </div>
            ) : (() => {
              const firstAccount = impactedAccounts.find((a) => a.id === discoveredFirstAccountId);
              const otherAccounts = impactedAccounts.filter((a) => a.id !== discoveredFirstAccountId);

              const AccountCard = ({ account, accent }: { account: { id: number; name: string }; accent?: boolean }) => (
                <div className={accent
                  ? "rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/40 p-4"
                  : "rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
                }>
                  <div className="flex items-center gap-3">
                    <Building2 className={`h-4 w-4 shrink-0 ${accent ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold truncate">{account.name}</span>
                  </div>
                </div>
              );

              return (
                <>
                  {firstAccount && (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5" />
                        Identified First:
                      </p>
                      <AccountCard account={firstAccount} accent />
                    </div>
                  )}
                  {otherAccounts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Also Impacted ({otherAccounts.length})
                      </p>
                      {otherAccounts.map((account) => (
                        <AccountCard key={account.id} account={account} />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
