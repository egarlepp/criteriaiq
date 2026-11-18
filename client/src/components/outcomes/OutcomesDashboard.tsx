import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSearch } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  BrainCircuit, 
  Trophy, 
  KeyboardOff, 
  CalendarX, 
  TrendingUp, 
  AlertTriangle, 
  ChevronRight,
  BookCheck,
  Binary,
  AlignHorizontalJustifyStart,
  StepForward,
  X
} from "lucide-react";
import { useAllProjectOutcomes, useOutcomeStatistics, useMissingOutcomes } from "@/hooks/useOutcomeRequirement";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, BarChart, Bar, PieChart, Pie } from "recharts";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProjectOutcomeDialog } from "@/components/outcomes/ProjectOutcomeDialog";

interface OutcomesDashboardProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  actionContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

export default function OutcomesDashboard({ filterContainerRef, actionContainerRef, onFilterStateChange }: OutcomesDashboardProps = {}) {
  const { t } = useTranslation();
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  
  // Support both standalone (/outcomes-dashboard?tab=x) and embedded (/project?tab=validation&subtab=outcome-intelligence&subtab2=x) modes
  const isEmbedded = urlParams.get("subtab") === "outcome-intelligence" || !!filterContainerRef?.current;
  const tabFromUrl = isEmbedded 
    ? (urlParams.get("subtab2") || "quadrant")
    : (urlParams.get("tab") || "quadrant");
  
  const activeTab = tabFromUrl;
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [recordDialogOpen, setRecordDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<{ id: number; name: string } | null>(null);
  const [selectedOutcomeType, setSelectedOutcomeType] = useState<"won" | "lost" | "cancelled">("won");
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  
  // Pagination and sorting state for Missing Outcomes table
  const [missingCurrentPage, setMissingCurrentPage] = useState(1);
  const [missingSortConfig, setMissingSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'customerName', direction: 'asc' });
  const itemsPerPage = 10;
  
  // Pagination and sorting state for All Outcomes table
  const [outcomesCurrentPage, setOutcomesCurrentPage] = useState(1);
  const [outcomesSortConfig, setOutcomesSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  
  // Sort handlers
  const handleMissingSort = (key: string) => {
    setMissingSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  const handleOutcomesSort = (key: string) => {
    setOutcomesSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  
  // Fetch all projects for the Record Outcome dropdown
  const { data: allProjects = [] } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", { credentials: "include" });
      if (!response.ok) return [];
      const data = await response.json();
      return data.projects || data || [];
    },
  });
  
  // Fetch products for solution abbreviation lookup
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const response = await fetch("/api/products", { credentials: "include" });
      if (!response.ok) return [];
      const data = await response.json();
      return data.products || data || [];
    },
  });
  
  // Create a lookup map for solution name to abbreviation
  const solutionAbbreviationMap = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((product: any) => {
      if (product.name && product.abbreviation) {
        // Store both exact name and lowercase for flexible matching
        map.set(product.name.toLowerCase(), product.abbreviation);
      }
    });
    return map;
  }, [products]);
  
  // Helper to get solution abbreviations from various solution formats
  const getSolutionAbbreviations = (solutionInput: any): string => {
    if (!solutionInput) return "";
    
    let solutions: string[] = [];
    
    // Handle different input formats
    if (Array.isArray(solutionInput)) {
      // Array of solution names
      solutions = solutionInput.map(s => String(s).trim());
    } else if (typeof solutionInput === 'string') {
      // Try parsing as JSON first (for ["Solution1", "Solution2"] format)
      try {
        const parsed = JSON.parse(solutionInput);
        if (Array.isArray(parsed)) {
          solutions = parsed.map(s => String(s).trim());
        } else {
          solutions = solutionInput.split(",").map(s => s.trim());
        }
      } catch {
        // Not JSON, treat as comma-separated string
        solutions = solutionInput.split(",").map(s => s.trim());
      }
    }
    
    // Map each solution to its abbreviation
    const abbreviations = solutions.map(solution => {
      if (!solution) return "";
      
      const normalized = solution.toLowerCase();
      const abbr = solutionAbbreviationMap.get(normalized);
      if (abbr) return abbr;
      
      // Fallback to original (but shortened if too long)
      return solution.length > 20 ? solution.substring(0, 17) + "..." : solution;
    }).filter(Boolean);
    
    return abbreviations.join(", ");
  };
  
  // Helper to capitalize first letter of each word
  const toTitleCase = (str: string): string => {
    if (!str) return "";
    return str.replace(/\b\w/g, char => char.toUpperCase());
  };
  
  // Format project display name: Customer #ID - Abbreviations - Status/Sales Stage
  const formatProjectDisplay = (project: any): string => {
    const customer = project.customerName || project.customer?.name || "Unknown";
    const id = project.id;
    const solutionField = project.solutionName || project.solution || "";
    const abbreviations = getSolutionAbbreviations(solutionField);
    const status = project.status || project.stage || "";
    const salesStage = project.salesStage || "";
    
    // Build display string, handling empty values gracefully
    const abbrevPart = abbreviations || solutionField || "N/A";
    const statusPart = toTitleCase(status) || "N/A";
    const stagePart = salesStage || "-";
    
    return `${customer} #${id} - ${abbrevPart} - ${statusPart}/${stagePart}`;
  };
  
  // Format date tooltip for project
  const getProjectDateTooltip = (project: any): string => {
    const formatDate = (date: string | null) => {
      if (!date) return "Not set";
      return new Date(date).toLocaleDateString();
    };
    return `Start: ${formatDate(project.startDate)} | End: ${formatDate(project.endDate)}`;
  };
  
  const { data: outcomes = [], isLoading: outcomesLoading } = useAllProjectOutcomes(
    outcomeFilter !== "all" ? { outcomeType: outcomeFilter } : undefined
  );
  const { data: statistics, isLoading: statsLoading } = useOutcomeStatistics();
  const { data: missingOutcomes = [], isLoading: missingLoading } = useMissingOutcomes();
  
  // Helper function to infer expected outcome type from project status/salesStage
  // Uses startsWith/includes to handle Salesforce variants like "Cancelled - Customer", "Closed Won - Expansion"
  const getInferredOutcomeType = (project: any): string => {
    const statusLower = (project.status || "").toLowerCase().trim();
    const salesStageLower = (project.salesStage || "").toLowerCase().trim();
    
    // Check status first for cancelled (handles "Cancelled", "Cancelled - Customer", etc.)
    if (statusLower.startsWith("cancelled") || statusLower.includes("cancel")) return "cancelled";
    
    // Check salesStage for won/lost (handles "Closed Won", "Closed Won - Expansion", etc.)
    if (salesStageLower.startsWith("closed lost") || salesStageLower.includes("closed lost")) return "lost";
    if (salesStageLower.startsWith("closed won") || salesStageLower.includes("closed won")) return "won";
    
    // Fallback: check status for won/lost as well
    if (statusLower.startsWith("closed lost") || statusLower.includes("closed lost")) return "lost";
    if (statusLower.startsWith("closed won") || statusLower.includes("closed won")) return "won";
    
    return "unknown";
  };
  
  // Filter missing outcomes by search term and outcome type filter
  const filteredMissingOutcomes = useMemo(() => {
    let filtered = missingOutcomes;
    
    // Apply outcome type filter first (infer from status/salesStage)
    if (outcomeFilter !== "all") {
      filtered = filtered.filter((project: any) => {
        const inferredType = getInferredOutcomeType(project);
        return inferredType === outcomeFilter;
      });
    }
    
    // Then apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((project: any) => {
        const customerName = (project.customerName || "").toLowerCase();
        const status = (project.status || "").toLowerCase();
        const salesStage = (project.salesStage || "").toLowerCase();
        const solutionName = (project.solutionName || "").toLowerCase();
        const projectId = String(project.projectId || "");
        return customerName.includes(term) || 
               status.includes(term) || 
               salesStage.includes(term) ||
               solutionName.includes(term) ||
               projectId.includes(term);
      });
    }
    
    return filtered;
  }, [missingOutcomes, searchTerm, outcomeFilter]);
  
  // Filter all outcomes by search term and outcome type filter
  // Note: outcomeFilter is also passed to API, but we apply client-side for immediate feedback
  const filteredOutcomes = useMemo(() => {
    let filtered = outcomes;
    
    // Apply outcome type filter (client-side backup for API filter)
    if (outcomeFilter !== "all") {
      filtered = filtered.filter((outcome: any) => 
        outcome.outcomeType === outcomeFilter
      );
    }
    
    // Then apply search term filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((outcome: any) => {
        const reasonCode = (outcome.primaryReasonCode || "").toLowerCase();
        const outcomeTypeStr = (outcome.outcomeType || "").toLowerCase();
        const projectId = String(outcome.projectId || "");
        return reasonCode.includes(term) || 
               outcomeTypeStr.includes(term) || 
               projectId.includes(term);
      });
    }
    
    return filtered;
  }, [outcomes, searchTerm, outcomeFilter]);
  
  // Sort and paginate missing outcomes
  const sortedMissingOutcomes = useMemo(() => {
    return [...filteredMissingOutcomes].sort((a: any, b: any) => {
      let aValue = a[missingSortConfig.key] ?? '';
      let bValue = b[missingSortConfig.key] ?? '';
      
      // Handle date sorting
      if (missingSortConfig.key === 'endDate' || missingSortConfig.key === 'completedDate') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }
      
      if (aValue < bValue) return missingSortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return missingSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredMissingOutcomes, missingSortConfig]);
  
  const paginatedMissingOutcomes = useMemo(() => {
    return sortedMissingOutcomes.slice(
      (missingCurrentPage - 1) * itemsPerPage,
      missingCurrentPage * itemsPerPage
    );
  }, [sortedMissingOutcomes, missingCurrentPage, itemsPerPage]);
  
  // Sort and paginate all outcomes
  const sortedOutcomes = useMemo(() => {
    return [...filteredOutcomes].sort((a: any, b: any) => {
      let aValue = a[outcomesSortConfig.key] ?? '';
      let bValue = b[outcomesSortConfig.key] ?? '';
      
      // Handle date sorting
      if (outcomesSortConfig.key === 'createdAt') {
        aValue = aValue ? new Date(aValue).getTime() : 0;
        bValue = bValue ? new Date(bValue).getTime() : 0;
      }
      
      if (aValue < bValue) return outcomesSortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return outcomesSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredOutcomes, outcomesSortConfig]);
  
  const paginatedOutcomes = useMemo(() => {
    return sortedOutcomes.slice(
      (outcomesCurrentPage - 1) * itemsPerPage,
      outcomesCurrentPage * itemsPerPage
    );
  }, [sortedOutcomes, outcomesCurrentPage, itemsPerPage]);
  
  // Reset pagination when filters change
  useEffect(() => {
    setMissingCurrentPage(1);
    setOutcomesCurrentPage(1);
  }, [searchTerm, outcomeFilter]);
  
  // Clamp page when data shrinks
  useEffect(() => {
    if (sortedMissingOutcomes.length === 0) {
      setMissingCurrentPage(1);
    } else {
      const totalPages = Math.ceil(sortedMissingOutcomes.length / itemsPerPage);
      if (missingCurrentPage > totalPages) {
        setMissingCurrentPage(totalPages);
      }
    }
  }, [sortedMissingOutcomes.length, missingCurrentPage, itemsPerPage]);
  
  useEffect(() => {
    if (sortedOutcomes.length === 0) {
      setOutcomesCurrentPage(1);
    } else {
      const totalPages = Math.ceil(sortedOutcomes.length / itemsPerPage);
      if (outcomesCurrentPage > totalPages) {
        setOutcomesCurrentPage(totalPages);
      }
    }
  }, [sortedOutcomes.length, outcomesCurrentPage, itemsPerPage]);
  
  const handleRecordOutcome = () => {
    if (selectedProject) {
      setRecordDialogOpen(false);
      setOutcomeDialogOpen(true);
    }
  };

  const quadrantData = filteredOutcomes.map((outcome: any) => ({
    id: outcome.id,
    projectId: outcome.projectId,
    technicalFit: outcome.technicalFitScore || 50,
    politicalAlignment: outcome.politicalAlignmentScore || 50,
    painRating: outcome.painRating || 5,
    type: outcome.outcomeType,
    reason: outcome.primaryReasonCode,
  }));

  const painDistribution = outcomes.reduce((acc: any[], outcome: any) => {
    const rating = outcome.painRating || 5;
    const existing = acc.find((item) => item.rating === rating);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ rating, count: 1 });
    }
    return acc;
  }, []).sort((a: { rating: number; count: number }, b: { rating: number; count: number }) => a.rating - b.rating);

  const outcomeTypeData = [
    { name: "Won", value: statistics?.wonCount || 0, color: "#22c55e" },
    { name: "Lost", value: statistics?.lostCount || 0, color: "#ef4444" },
    { name: "Cancelled", value: statistics?.cancelledCount || 0, color: "#f59e0b" },
  ];

  const getQuadrantColor = (type: string) => {
    switch (type) {
      case "won": return "#22c55e";
      case "lost": return "#ef4444";
      case "cancelled": return "#f59e0b";
      default: return "#64748b";
    }
  };

  const getOutcomeIcon = (type: string) => {
    switch (type) {
      case "won": return <Trophy className="h-4 w-4 text-green-500" />;
      case "lost": return <KeyboardOff className="h-4 w-4 text-red-500" />;
      case "cancelled": return <CalendarX className="h-4 w-4 text-amber-500" />;
      default: return null;
    }
  };

  const filterContent = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <FilterLabel>Search</FilterLabel>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search outcomes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-9 text-sm"
          />
        </div>
      </div>
      <div>
        <FilterLabel>Outcome Type</FilterLabel>
        <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="All Outcomes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="won">Won</SelectItem>
            <SelectItem value="lost">Lost</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  // The four KPI cards sit in the Search and Filters card, on every view.
  const kpiCards = (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
        <Card className="relative overflow-hidden bg-gradient-to-br from-slate-50 to-white dark:from-slate-950/80 dark:to-background">
          <AlignHorizontalJustifyStart className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 text-slate-500 opacity-[0.04]" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Outcomes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <AlignHorizontalJustifyStart className="h-5 w-5 text-muted-foreground" />
            <div className="text-3xl font-bold">{statistics?.totalOutcomes || 0}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-green-50 to-white dark:from-green-950/80 dark:to-background">
          <Trophy className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 text-green-500 opacity-[0.04]" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-600">
              Won
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-500" />
            <div className="text-3xl font-bold text-green-600">{statistics?.wonCount || 0}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-red-50 to-white dark:from-red-950/80 dark:to-background">
          <KeyboardOff className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 text-red-500 opacity-[0.04]" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600">
              Lost
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <KeyboardOff className="h-5 w-5 text-red-500" />
            <div className="text-3xl font-bold text-red-600">{statistics?.lostCount || 0}</div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/80 dark:to-background">
          <CalendarX className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 text-amber-500 opacity-[0.04]" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-600">
              Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <CalendarX className="h-5 w-5 text-amber-500" />
            <div className="text-3xl font-bold text-amber-600">{statistics?.cancelledCount || 0}</div>
          </CardContent>
        </Card>
      </div>
  );

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (outcomeFilter !== "all") count++;
    return count;
  }, [searchTerm, outcomeFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setOutcomeFilter("all");
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  const actionButton = (
    <Button onClick={() => setRecordDialogOpen(true)} className="flex items-center gap-2" data-record-outcome="true" size="sm">
      <BookCheck className="h-4 w-4" />
      Record Outcome
    </Button>
  );

  const dashboardContent = (
    <div className="space-y-6">
      {filterContainerRef?.current && createPortal(<>{filterContent}{kpiCards}</>, filterContainerRef.current)}
      {actionContainerRef?.current && createPortal(actionButton, actionContainerRef.current)}
      
      {!filterContainerRef?.current && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                Outcome Intelligence
              </CardTitle>
              <CardDescription>
                Analyze project closure patterns and capture technical intelligence
              </CardDescription>
            </div>
            {actionButton}
          </CardHeader>
          <CardContent>
            <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
              {filterContent}
              {kpiCards}
            </SearchFiltersSection>
          </CardContent>
        </Card>
      )}
      
      {/* The view is chosen from the sidebar / top tab bar via ?subtab2=. */}
      <Tabs value={activeTab} className="pt-0">
        <TabsContent value="quadrant" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Technical Fit vs Political Alignment</CardTitle>
              <CardDescription>
                2D analysis of project outcomes plotted by solution fit and stakeholder buy-in
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quadrantData.length > 0 ? (
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="technicalFit"
                        name="Technical Fit"
                        domain={[0, 100]}
                        label={{ value: "Technical Fit (%)", position: "bottom", offset: 40 }}
                      />
                      <YAxis
                        type="number"
                        dataKey="politicalAlignment"
                        name="Political Alignment"
                        domain={[0, 100]}
                        label={{ value: "Political Alignment (%)", angle: -90, position: "left", offset: 40 }}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-popover border rounded-lg p-3 shadow-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  {getOutcomeIcon(data.type)}
                                  <span className="font-medium capitalize">{data.type}</span>
                                </div>
                                <div className="text-sm text-muted-foreground space-y-1">
                                  <div>Technical Fit: {data.technicalFit}%</div>
                                  <div>Political Alignment: {data.politicalAlignment}%</div>
                                  <div>Pain Rating: {data.painRating}/10</div>
                                  <div>Reason: {data.reason}</div>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                      <Scatter name="Outcomes" data={quadrantData}>
                        {quadrantData.map((entry: any, index: number) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={getQuadrantColor(entry.type)}
                            r={Math.max(6, entry.painRating)}
                          />
                        ))}
                      </Scatter>
                      <line x1="50%" y1="0" x2="50%" y2="100%" stroke="#e2e8f0" strokeDasharray="5 5" />
                      <line x1="0" y1="50%" x2="100%" y2="50%" stroke="#e2e8f0" strokeDasharray="5 5" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                  <BrainCircuit className="h-12 w-12 mb-4 opacity-50" />
                  <p>No outcome data available yet</p>
                  <p className="text-sm">Capture project outcomes to see quadrant analysis</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pain Index Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {painDistribution.length > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={painDistribution}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="rating" label={{ value: "Pain Rating", position: "bottom", offset: 0 }} />
                        <YAxis label={{ value: "Count", angle: -90, position: "left" }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No pain data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Outcome Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {(statistics?.totalOutcomes || 0) > 0 ? (
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={outcomeTypeData.filter((d) => d.value > 0)}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {outcomeTypeData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No outcome data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reasons" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Binary className="h-5 w-5" />
                Top Reason Codes
              </CardTitle>
              <CardDescription>Most common reasons for project outcomes</CardDescription>
            </CardHeader>
            <CardContent>
              {statistics?.topReasonCodes && statistics.topReasonCodes.length > 0 ? (
                <div className="space-y-3">
                  {statistics.topReasonCodes.map((item: any, index: number) => (
                    <div key={item.code} className="flex items-center gap-4">
                      <span className="text-muted-foreground w-6">{index + 1}.</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{item.code}</span>
                          <Badge variant="secondary">{item.count}</Badge>
                        </div>
                        <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{
                              width: `${(item.count / statistics.topReasonCodes[0].count) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No reason codes recorded yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="missing" className="mt-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Projects Missing Outcomes
              </CardTitle>
              <CardDescription>
                Closed projects that need outcome intelligence captured
              </CardDescription>
            </CardHeader>
            <CardContent>
              {missingLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : sortedMissingOutcomes.length > 0 ? (
                <>
                <SortableTable>
                  <SortableTableHeader>
                    <SortableTableRow>
                      <SortableTableHead sortKey="customerName" sortConfig={missingSortConfig} onSort={handleMissingSort}>Project</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={missingSortConfig} onSort={handleMissingSort}>Internal Status</SortableTableHead>
                      <SortableTableHead sortKey="salesStage" sortConfig={missingSortConfig} onSort={handleMissingSort}>Sales Stage</SortableTableHead>
                      <SortableTableHead sortKey="acv" sortConfig={missingSortConfig} onSort={handleMissingSort}>ACV</SortableTableHead>
                      <SortableTableHead sortKey="endDate" sortConfig={missingSortConfig} onSort={handleMissingSort}>End Date</SortableTableHead>
                      <SortableTableHead sortKey="completedDate" sortConfig={missingSortConfig} onSort={handleMissingSort}>Closure Date</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={missingSortConfig} onSort={() => {}} sortable={false} className="text-right">Action</SortableTableHead>
                    </SortableTableRow>
                  </SortableTableHeader>
                  <SortableTableBody>
                    {paginatedMissingOutcomes.map((project: any) => {
                      const formattedProject = formatProjectDisplay({
                        id: project.projectId,
                        customerName: project.customerName,
                        solutionName: project.solutionName,
                        status: project.status,
                        salesStage: project.salesStage
                      });
                      const salesStageLower = (project.salesStage || "").toLowerCase();
                      const statusLower = (project.status || "").toLowerCase();
                      
                      const getSalesStageBadgeClass = () => {
                        if (salesStageLower === "closed won") return "bg-green-500 text-white border-green-500";
                        if (salesStageLower === "closed lost") return "bg-red-500 text-white border-red-500";
                        return "";
                      };
                      
                      const getInternalStatusBadgeClass = () => {
                        if (statusLower === "cancelled") return "bg-gray-900 text-white border-gray-900 dark:bg-black dark:border-black";
                        if (statusLower === "closed won") return "bg-green-500 text-white border-green-500";
                        if (statusLower === "closed lost") return "bg-red-500 text-white border-red-500";
                        return "";
                      };
                      
                      return (
                        <SortableTableRow key={project.projectId}>
                          <SortableTableCell className="font-medium">{formattedProject}</SortableTableCell>
                          <SortableTableCell>
                            <Badge variant="outline" className={getInternalStatusBadgeClass()}>
                              {toTitleCase(project.status) || "N/A"}
                            </Badge>
                          </SortableTableCell>
                          <SortableTableCell>
                            <Badge variant="outline" className={getSalesStageBadgeClass()}>
                              {project.salesStage || "N/A"}
                            </Badge>
                          </SortableTableCell>
                          <SortableTableCell>{project.acv || "N/A"}</SortableTableCell>
                          <SortableTableCell className="text-muted-foreground">
                            {project.endDate ? new Date(project.endDate).toLocaleDateString() : "N/A"}
                          </SortableTableCell>
                          <SortableTableCell className="text-muted-foreground">
                            {project.completedDate ? new Date(project.completedDate).toLocaleDateString() : "N/A"}
                          </SortableTableCell>
                          <SortableTableCell className="text-right">
                            <div className="flex justify-end">
                              <Button 
                                variant="default" 
                                size="sm"
                                onClick={() => {
                                  // Recorded by the server when the project closed.
                                  const outcomeType: "won" | "lost" | "cancelled" = project.outcomeType;
                                  setSelectedProject({ 
                                    id: project.projectId, 
                                    name: project.customerName || `Project #${project.projectId}` 
                                  });
                                  setSelectedOutcomeType(outcomeType);
                                  setOutcomeDialogOpen(true);
                                }}
                                className="flex items-center gap-1"
                              >
                                <BookCheck className="h-4 w-4" />
                                Capture
                              </Button>
                            </div>
                          </SortableTableCell>
                        </SortableTableRow>
                      );
                    })}
                  </SortableTableBody>
                </SortableTable>
                
                <TablePaginationFooter
                  totalItems={sortedMissingOutcomes.length}
                  pageSize={itemsPerPage}
                  currentPage={missingCurrentPage}
                  onPageChange={setMissingCurrentPage}
                  entityLabel="projects"
                />
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{searchTerm || outcomeFilter !== "all" ? "No projects match your filters" : "All closed projects have outcomes captured!"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-0 space-y-4">
          <Card className="relative overflow-hidden">
            <DecorativeCardIcon icon={AlignHorizontalJustifyStart} />
            <CardHeader className="relative z-10">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <AlignHorizontalJustifyStart className="h-5 w-5" />
                All Captured Outcomes
              </CardTitle>
              <CardDescription>Complete list of project outcome records</CardDescription>
            </CardHeader>
            <CardContent className="relative z-10">
              {outcomesLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : sortedOutcomes.length > 0 ? (
                <>
                <SortableTable>
                  <SortableTableHeader>
                    <SortableTableRow>
                      <SortableTableHead sortKey="outcomeType" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Type</SortableTableHead>
                      <SortableTableHead sortKey="projectId" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Project ID</SortableTableHead>
                      <SortableTableHead sortKey="primaryReasonCode" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Primary Reason</SortableTableHead>
                      <SortableTableHead sortKey="technicalFitScore" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Tech Fit</SortableTableHead>
                      <SortableTableHead sortKey="politicalAlignmentScore" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Political</SortableTableHead>
                      <SortableTableHead sortKey="painRating" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Pain</SortableTableHead>
                      <SortableTableHead sortKey="createdAt" sortConfig={outcomesSortConfig} onSort={handleOutcomesSort}>Date</SortableTableHead>
                    </SortableTableRow>
                  </SortableTableHeader>
                  <SortableTableBody>
                    {paginatedOutcomes.map((outcome: any) => (
                      <SortableTableRow key={outcome.id}>
                        <SortableTableCell>
                          <div className="flex items-center gap-2">
                            {getOutcomeIcon(outcome.outcomeType)}
                            <span className="capitalize">{outcome.outcomeType}</span>
                          </div>
                        </SortableTableCell>
                        <SortableTableCell>
                          <Button variant="link" className="p-0 h-auto" asChild>
                            <Link href={`/projects/${outcome.projectId}`}>
                              #{outcome.projectId}
                            </Link>
                          </Button>
                        </SortableTableCell>
                        <SortableTableCell>{outcome.primaryReasonCode}</SortableTableCell>
                        <SortableTableCell>
                          {outcome.technicalFitScore ? `${outcome.technicalFitScore}%` : "-"}
                        </SortableTableCell>
                        <SortableTableCell>
                          {outcome.politicalAlignmentScore ? `${outcome.politicalAlignmentScore}%` : "-"}
                        </SortableTableCell>
                        <SortableTableCell>
                          {outcome.painRating ? `${outcome.painRating}/10` : "-"}
                        </SortableTableCell>
                        <SortableTableCell className="text-muted-foreground">
                          {outcome.createdAt
                            ? new Date(outcome.createdAt).toLocaleDateString()
                            : "-"}
                        </SortableTableCell>
                      </SortableTableRow>
                    ))}
                  </SortableTableBody>
                </SortableTable>
                
                <TablePaginationFooter
                  totalItems={sortedOutcomes.length}
                  pageSize={itemsPerPage}
                  currentPage={outcomesCurrentPage}
                  onPageChange={setOutcomesCurrentPage}
                  entityLabel="outcomes"
                />
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BrainCircuit className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{searchTerm || outcomeFilter !== "all" ? "No outcomes match your filters" : "No outcomes captured yet"}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Record Outcome Selection Dialog */}
      <Dialog open={recordDialogOpen} onOpenChange={setRecordDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              Record Project Outcome
            </DialogTitle>
            <DialogDescription>
              Select a project and outcome type to record its closure intelligence.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project">Project</Label>
              <Select
                value={selectedProject?.id?.toString() || ""}
                onValueChange={(value) => {
                  const project = allProjects.find((p: any) => p.id.toString() === value);
                  if (project) {
                    // Use customerName for the dialog, not the formatted display
                    setSelectedProject({ 
                      id: project.id, 
                      name: project.customerName || project.projectTitle || project.name || `Project #${project.id}`
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {allProjects.map((project: any) => (
                    <SelectItem 
                      key={project.id} 
                      value={project.id.toString()}
                      title={getProjectDateTooltip(project)}
                    >
                      {formatProjectDisplay(project)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="outcome-type">Outcome Type</Label>
              <Select
                value={selectedOutcomeType}
                onValueChange={(value) => setSelectedOutcomeType(value as "won" | "lost" | "cancelled")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="won">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4 text-green-500" />
                      Won
                    </div>
                  </SelectItem>
                  <SelectItem value="lost">
                    <div className="flex items-center gap-2">
                      <KeyboardOff className="h-4 w-4 text-red-500" />
                      Lost
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div className="flex items-center gap-2">
                      <CalendarX className="h-4 w-4 text-amber-500" />
                      Cancelled
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordDialogOpen(false)} className="flex items-center gap-2">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleRecordOutcome} disabled={!selectedProject} className="flex items-center gap-2">
              <StepForward className="h-4 w-4" />
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Project Outcome Dialog */}
      {selectedProject && (
        <ProjectOutcomeDialog
          open={outcomeDialogOpen}
          onOpenChange={(open) => {
            setOutcomeDialogOpen(open);
            if (!open) {
              setSelectedProject(null);
            }
          }}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          outcomeType={selectedOutcomeType}
        />
      )}
    </div>
  );

  // The page chrome (header, tab bar) comes from App.tsx's shared PageLayout.
  return dashboardContent;
}
