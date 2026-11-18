import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DecorativeCardIcon } from "@/components/ui/decorative-card-icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { SortableTable, SortableTableHeader, SortableTableHead, SortableTableBody, SortableTableRow, SortableTableCell } from "@/components/ui/sortable-table";
import { TablePaginationFooter } from "@/components/ui/table-pagination-footer";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { 
  Waypoints, 
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  TrendingUp,
  AlertCircle,
  SquarePen,
  LayoutList,
  Sparkles,
  Info,
  Target,
  Zap,
  Siren,
  FolderHeart,
  FolderCog,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { format, differenceInDays, isAfter, isBefore, parseISO } from "date-fns";
import { formatFullName } from "@/lib/nameUtils";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MapDrawer } from "@/components/project-form/MapDrawer";
import { FilterLabel } from "@/components/ui/search-filters-section";
import { useAuth } from "@/hooks/useAuth";
import { DynamicIcon } from "@/components/ui/dynamic-icon";

// Extended Project with MAP data interface
interface ProjectWithMap {
  id: number;
  name: string;
  mapName?: string;
  projectName: string;
  customerName: string;
  solutionName?: string;
  primaryEngineerId: string;
  primaryEngineerName?: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  mapId: number | null;
  phasesCount: number;
  stepsCount: number;
  tasksCount: number;
  // New fields for enhanced analytics
  phasesCompleted: number;
  stepsCompleted: number;
  tasksCompleted: number;
  overdueTasks: number;
  tasksWithDueDates: number;
  progressPercent: number;
  healthScore: number; // 0-100 scale
  daysRemaining: number | null;
  isOverdue: boolean;
}

// Status filter options
type StatusFilter = 'all' | 'planning' | 'in_progress' | 'at_risk' | 'completed';

interface MapManagementSectionProps {
  filterContainerRef?: React.RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

// Health score calculation based on progress vs timeline and overdue tasks
function calculateHealthScore(
  progressPercent: number,
  startDate: string | null,
  endDate: string | null,
  overdueTasks: number,
  totalTasks: number
): number {
  const now = new Date();
  let score = 100;

  // Factor 1: Overdue tasks penalty (up to -40 points)
  if (totalTasks > 0) {
    const overdueRatio = overdueTasks / totalTasks;
    score -= overdueRatio * 40;
  }

  // Factor 2: Timeline progress comparison (up to -40 points)
  if (startDate && endDate) {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const totalDays = differenceInDays(end, start);
    const elapsedDays = differenceInDays(now, start);
    
    if (totalDays > 0 && elapsedDays > 0) {
      const expectedProgress = Math.min((elapsedDays / totalDays) * 100, 100);
      const progressGap = expectedProgress - progressPercent;
      
      // If behind schedule, penalize
      if (progressGap > 0) {
        score -= Math.min(progressGap * 0.8, 40);
      }
    }
    
    // Past deadline penalty
    if (isAfter(now, end) && progressPercent < 100) {
      score -= 20;
    }
  }

  // Factor 3: Low progress penalty for active projects
  if (progressPercent < 10 && startDate) {
    const daysSinceStart = differenceInDays(now, parseISO(startDate));
    if (daysSinceStart > 7) {
      score -= 10;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Get health score color and label
function getHealthIndicator(score: number): { color: string; bgColor: string; label: string; icon: typeof CheckCircle2 } {
  if (score >= 80) {
    return { color: 'text-green-700', bgColor: 'bg-green-100 dark:bg-green-900 dark:text-green-500', label: 'Healthy', icon: CheckCircle2 };
  } else if (score >= 60) {
    return { color: 'text-yellow-700', bgColor: 'bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-500', label: 'At Risk', icon: AlertTriangle };
  } else if (score >= 40) {
    return { color: 'text-orange-700', bgColor: 'bg-orange-100 dark:bg-orange-900 dark:text-orange-500', label: 'Warning', icon: AlertCircle };
  } else {
    return { color: 'text-red-700', bgColor: 'bg-red-100 dark:bg-red-900 dark:text-red-500', label: 'Critical', icon: Siren };
  }
}

// Get progress bar color (Option 2 dark-mode pairing — saturated fill
// in light mode, one stop darker in dark mode).
function getProgressColor(percent: number, isOverdue: boolean): string {
  if (isOverdue) return 'bg-red-500 dark:bg-red-600';
  if (percent >= 80) return 'bg-green-500 dark:bg-green-600';
  if (percent >= 50) return 'bg-blue-500 dark:bg-blue-600';
  if (percent >= 25) return 'bg-yellow-500 dark:bg-yellow-600';
  return 'bg-gray-400 dark:bg-gray-600';
}

interface MapCollapsibleSectionProps {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  headerBgClass: string;
  projects: ProjectWithMap[];
  expanded: boolean;
  onToggle: () => void;
  currentPage: number;
  onPageChange: (p: number) => void;
  itemsPerPage: number;
}

/**
 * Projects store their Internal Status as configured ("In Progress"); the
 * KPI cards and status filter compare against keys like "in_progress".
 */
function mapStatusKey(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export default function MapManagementSection({ filterContainerRef, onFilterStateChange }: MapManagementSectionProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  // State management
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const itemsPerPage = 10;
  
  // Section expand state
  const [myExpanded, setMyExpanded] = useState(true);
  const [otherExpanded, setOtherExpanded] = useState(true);
  
  // Per-section pagination
  const [myCurrentPage, setMyCurrentPage] = useState(1);
  const [otherCurrentPage, setOtherCurrentPage] = useState(1);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'overdue' | 'this_week' | 'this_month'>('all');
  const [internalStatusFilter, setInternalStatusFilter] = useState<string>('all');
  
  // MapDrawer state
  const [isMapDrawerOpen, setIsMapDrawerOpen] = useState(false);
  
  // Sorting state
  const { sortConfig, handleSort } = useSortState();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (statusFilter !== 'all') count++;
    if (dateRangeFilter !== 'all') count++;
    if (internalStatusFilter !== 'all') count++;
    return count;
  }, [searchTerm, statusFilter, dateRangeFilter, internalStatusFilter]);

  const clearAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setInternalStatusFilter('all');
    setDateRangeFilter('all');
    setMyCurrentPage(1);
    setOtherCurrentPage(1);
  };

  useEffect(() => {
    if (onFilterStateChange) {
      onFilterStateChange(activeFilterCount, clearAllFilters);
    }
  }, [activeFilterCount, onFilterStateChange]);

  // WebSocket real-time sync for MAP updates
  const { lastMessage } = useWebSocket();
  
  useEffect(() => {
    if (!lastMessage) return;
    
    // Handle MAP-related updates
    if (lastMessage.type === 'map_update' || lastMessage.type === 'map_phase_update' || 
        lastMessage.type === 'map_step_update' || lastMessage.type === 'map_task_update') {
      
      // Invalidate and refetch MAP data for the affected project
      const projectId = lastMessage.projectId || selectedProjectId;
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/map`] });
      }
      
      // Also invalidate the projects summary to update counts and table
      queryClient.invalidateQueries({ queryKey: ['/api/map/projects-summary'] });
    }
  }, [lastMessage, selectedProjectId, queryClient]);

  // Fetch products for abbreviations
  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    queryFn: () => apiRequest('GET', '/api/products')
  });

  // Fetch status configurations for consistent badge styling
  const { data: statusConfigs = [] } = useQuery<any[]>({
    queryKey: ["/api/status-configs"],
  });

  // Get status config matching ValidationProjectsPage pattern
  const getStatusConfig = (status: string) => {
    return statusConfigs.find((s: any) => s.name?.toLowerCase() === status?.toLowerCase()) || {
      name: status,
      icon: null,
      color: "#64748B"
    };
  };

  // Helper function to get solution abbreviations
  const getSolutionAbbreviations = (solutionName: string) => {
    if (!solutionName || !products) return '';
    
    const solutionNames = solutionName.split(',').map(s => s.trim());
    const abbreviations = solutionNames
      .map(name => {
        const product = (products as any[]).find((p: any) => 
          p.name.toLowerCase() === name.toLowerCase() || 
          p.name.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(p.name.toLowerCase())
        );
        return product?.abbreviation || '';
      })
      .filter(abbr => abbr !== '');
    
    return abbreviations.join('-');
  };

  // Helper function to format project name
  const formatProjectName = (project: any) => {
    const abbreviations = getSolutionAbbreviations(project.solutionName);
    return `${project.customerName}-ID${project.id}${abbreviations ? `-${abbreviations}` : ''}`;
  };

  // Fetch all projects with MAP data including enhanced analytics
  const { data: projectsData = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['/api/map/projects-summary'],
    queryFn: async () => {
      // Get all projects
      const projects = await apiRequest('GET', '/api/projects');
      
      // Every project's plan is a MAP; projects that have no plan yet are
      // left out below (no phases).
      const mapProjects = projects;
      
      const projectsWithAnalytics = await Promise.all(
        mapProjects.map(async (project: any) => {
          try {
            const [analytics, mapData] = await Promise.all([
              apiRequest('GET', `/api/projects/${project.id}/map/analytics`),
              apiRequest('GET', `/api/projects/${project.id}/map`)
            ]);
            
            const mapName = mapData?.metadata?.mapName || 'Unnamed MAP';
            const now = new Date();
            
            // Extract completion data
            const phasesTotal = analytics.completion?.phases?.total || 0;
            const phasesCompleted = analytics.completion?.phases?.completed || 0;
            const stepsTotal = analytics.completion?.steps?.total || 0;
            const stepsCompleted = analytics.completion?.steps?.completed || 0;
            const tasksTotal = analytics.completion?.tasks?.total || 0;
            const tasksCompleted = analytics.completion?.tasks?.completed || 0;
            const overdueTasks = analytics.timeline?.overdueTasks || 0;
            const tasksWithDueDates = analytics.timeline?.tasksWithDueDates || 0;
            
            // Calculate progress percentage (weighted)
            const progressPercent = analytics.overallProgress || 0;
            
            // Calculate days remaining
            let daysRemaining: number | null = null;
            let isOverdue = false;
            if (project.endDate) {
              const endDate = parseISO(project.endDate);
              daysRemaining = differenceInDays(endDate, now);
              isOverdue = daysRemaining < 0 && progressPercent < 100;
            }
            
            // Calculate health score
            const healthScore = calculateHealthScore(
              progressPercent,
              project.startDate,
              project.endDate,
              overdueTasks,
              tasksTotal
            );
            
            return {
              id: project.id,
              name: mapName,
              mapName,
              projectName: '',
              customerName: project.customerName,
              solutionName: project.solutionName,
              primaryEngineerId: project.primaryEngineerId,
              primaryEngineerName: project.primarySe 
                ? formatFullName(project.primarySe.firstName, project.primarySe.lastName) 
                : 'Unassigned',
              status: project.status || 'planning',
              startDate: project.startDate,
              endDate: project.endDate,
              mapId: project.id,
              phasesCount: phasesTotal,
              stepsCount: stepsTotal,
              tasksCount: tasksTotal,
              phasesCompleted,
              stepsCompleted,
              tasksCompleted,
              overdueTasks,
              tasksWithDueDates,
              progressPercent,
              healthScore,
              daysRemaining,
              isOverdue,
            };
          } catch (error) {
            console.error(`Error fetching data for project ${project.id}:`, error);
            
            return {
              id: project.id,
              name: 'Unnamed MAP',
              mapName: 'Unnamed MAP',
              projectName: '',
              customerName: project.customerName,
              solutionName: project.solutionName,
              primaryEngineerId: project.primaryEngineerId,
              primaryEngineerName: project.primarySe 
                ? formatFullName(project.primarySe.firstName, project.primarySe.lastName) 
                : 'Unassigned',
              status: project.status || 'planning',
              startDate: project.startDate,
              endDate: project.endDate,
              mapId: project.id,
              phasesCount: 0,
              stepsCount: 0,
              tasksCount: 0,
              phasesCompleted: 0,
              stepsCompleted: 0,
              tasksCompleted: 0,
              overdueTasks: 0,
              tasksWithDueDates: 0,
              progressPercent: 0,
              healthScore: 50,
              daysRemaining: null,
              isOverdue: false,
            };
          }
        })
      );

      return projectsWithAnalytics.filter((project) => project.phasesCount > 0);
    }
  });


  // Compute project names with abbreviations at render time (after products are loaded)
  const projectsWithFormattedNames = useMemo(() => {
    return projectsData.map((project: ProjectWithMap) => ({
      ...project,
      projectName: formatProjectName(project)
    }));
  }, [projectsData, products]);

  // Filter and sort projects
  const filteredProjects = useMemo(() => {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    let filtered = projectsWithFormattedNames.filter((project: ProjectWithMap) => {
      // Search filter
      if (searchTerm && 
          !project.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
          !project.customerName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      
      // Status filter
      if (statusFilter !== 'all') {
        const status = mapStatusKey(project.status);
        if (statusFilter === 'at_risk' && project.healthScore >= 60) return false;
        if (statusFilter === 'in_progress' && status !== 'in_progress' && status !== 'active') return false;
        if (statusFilter === 'planning' && status !== 'planning') return false;
        if (statusFilter === 'completed' && status !== 'completed' && project.progressPercent !== 100) return false;
      }
      
      // Date range filter
      if (dateRangeFilter !== 'all') {
        if (dateRangeFilter === 'overdue' && !project.isOverdue) return false;
        if (dateRangeFilter === 'this_week' && project.endDate) {
          const endDate = parseISO(project.endDate);
          if (!isBefore(endDate, weekFromNow) || isBefore(endDate, now)) return false;
        }
        if (dateRangeFilter === 'this_month' && project.endDate) {
          const endDate = parseISO(project.endDate);
          if (!isBefore(endDate, monthFromNow) || isBefore(endDate, now)) return false;
        }
      }
      
      // Internal Status filter
      if (internalStatusFilter !== 'all') {
        if (project.status?.toLowerCase() !== internalStatusFilter.toLowerCase()) return false;
      }
      
      return true;
    });

    // Apply sorting
    const comparator = makeComparator(sortConfig);
    return stableSort(filtered, comparator);
  }, [projectsWithFormattedNames, searchTerm, statusFilter, dateRangeFilter, internalStatusFilter, sortConfig, user]);

  // Calculate summary stats from filtered projects (so filters affect KPI cards)
  const summaryStats = useMemo(() => {
    const total = filteredProjects.length;
    const inProgress = filteredProjects.filter((p: ProjectWithMap) => {
      const status = mapStatusKey(p.status);
      return status === 'in_progress' || status === 'active';
    }).length;
    const atRisk = filteredProjects.filter((p: ProjectWithMap) => 
      p.healthScore < 60 && mapStatusKey(p.status) !== 'completed'
    ).length;
    const overdue = filteredProjects.filter((p: ProjectWithMap) => p.isOverdue).length;
    const completed = filteredProjects.filter((p: ProjectWithMap) => 
      mapStatusKey(p.status) === 'completed' || p.progressPercent === 100
    ).length;
    
    return { total, inProgress, atRisk, overdue, completed };
  }, [filteredProjects]);

  // Split filtered projects into My MAPs and Other MAPs
  const myMaps = useMemo(
    () => filteredProjects.filter((p: ProjectWithMap) => p.primaryEngineerId === user?.id),
    [filteredProjects, user]
  );
  const otherMaps = useMemo(
    () => filteredProjects.filter((p: ProjectWithMap) => p.primaryEngineerId !== user?.id),
    [filteredProjects, user]
  );

  // Handle project selection - opens MapDrawer
  const handleProjectSelect = (projectId: number) => {
    setSelectedProjectId(projectId);
    setIsMapDrawerOpen(true);
  };

  // Status filter button component
  const StatusFilterButton = ({ value, label, count }: { value: StatusFilter; label: string; count?: number }) => (
    <Button
      variant={statusFilter === value ? "default" : "outline"}
      size="sm"
      onClick={() => {
        setStatusFilter(value);
        setMyCurrentPage(1);
        setOtherCurrentPage(1);
      }}
      className={cn(
        "h-8 text-xs",
        statusFilter === value && "bg-primary text-primary-foreground hover:bg-primary/90"
      )}
    >
      {label}
      {count !== undefined && (
        <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">
          {count}
        </Badge>
      )}
    </Button>
  );

  const filterContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div>
          <FilterLabel>Search</FilterLabel>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 text-gray-400" size={14} />
            <Input
              placeholder="Search MAP projects..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setMyCurrentPage(1);
                setOtherCurrentPage(1);
              }}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
        
        {/* Date Range Filter */}
        <div>
          <FilterLabel>Due Date</FilterLabel>
          <div className="flex gap-1">
            <Button
              variant={dateRangeFilter === 'all' ? "default" : "outline"}
              size="sm"
              onClick={() => { setDateRangeFilter('all'); setMyCurrentPage(1); setOtherCurrentPage(1); }}
              className="h-9 text-xs flex-1"
            >
              All
            </Button>
            <Button
              variant={dateRangeFilter === 'overdue' ? "default" : "outline"}
              size="sm"
              onClick={() => { setDateRangeFilter('overdue'); setMyCurrentPage(1); setOtherCurrentPage(1); }}
              className={cn(
                "h-9 text-xs flex-1",
                dateRangeFilter === 'overdue' && "bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-800"
              )}
            >
              Overdue
            </Button>
            <Button
              variant={dateRangeFilter === 'this_week' ? "default" : "outline"}
              size="sm"
              onClick={() => { setDateRangeFilter('this_week'); setMyCurrentPage(1); setOtherCurrentPage(1); }}
              className="h-9 text-xs flex-1"
            >
              This Week
            </Button>
          </div>
        </div>
        
        {/* Status Pills */}
        <div>
          <FilterLabel>Status</FilterLabel>
          <div className="flex gap-1 flex-wrap">
            <StatusFilterButton value="all" label="All" />
            <StatusFilterButton value="in_progress" label="Active" />
            <StatusFilterButton value="at_risk" label="At Risk" count={summaryStats.atRisk} />
          </div>
        </div>

        {/* Internal Status Dropdown */}
        <div>
          <FilterLabel>Internal Status</FilterLabel>
          <Select
            value={internalStatusFilter}
            onValueChange={(value) => {
              setInternalStatusFilter(value);
              setMyCurrentPage(1);
              setOtherCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-9 text-sm w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-400" />
                  All Statuses
                </span>
              </SelectItem>
              {statusConfigs
                .filter((config: any) => config.name && config.name.trim() !== '')
                .map((config: any) => (
                  <SelectItem key={config.id || config.name} value={config.name.toLowerCase()}>
                    <span className="flex items-center gap-2">
                      {config.icon ? (
                        <DynamicIcon 
                          name={config.icon} 
                          className="h-3.5 w-3.5" 
                          style={{ color: config.color || '#64748B' }}
                        />
                      ) : (
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: config.color || '#64748B' }}
                        />
                      )}
                      {config.name}
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // Project row renderer (closure over component state)
  const renderProjectRow = (project: ProjectWithMap) => {
    const healthIndicator = getHealthIndicator(project.healthScore);
    const HealthIcon = healthIndicator.icon;
    return (
      <SortableTableRow 
        key={project.id} 
        className={cn(
          "cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800",
          project.isOverdue && "bg-red-50/50 dark:bg-red-950/20"
        )}
        onClick={() => handleProjectSelect(project.id)}
      >
        {/* MAP / Project Name */}
        <SortableTableCell>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {project.mapName || project.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{project.projectName}</div>
          </div>
        </SortableTableCell>
        {/* Account */}
        <SortableTableCell>
          {project.customerName}
        </SortableTableCell>
        {/* Progress */}
        <SortableTableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="w-24">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{project.progressPercent}%</span>
                </div>
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      "h-full rounded-full transition-all",
                      getProgressColor(project.progressPercent, project.isOverdue)
                    )}
                    style={{ width: `${project.progressPercent}%` }}
                  />
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <div className="text-xs space-y-2">
                <div className="font-medium border-b border-gray-200 dark:border-gray-600 pb-1 mb-1">
                  Progress Measurement
                </div>
                <p className="text-muted-foreground">
                  Weighted average: Phases (40%) + Steps (35%) + Tasks (25%)
                </p>
                <div className="space-y-1 pl-2">
                  <p className="flex items-center gap-1">
                    <span className="text-purple-600 dark:text-purple-400">Phases:</span> {project.phasesCompleted}/{project.phasesCount}
                  </p>
                  <p className="flex items-center gap-1">
                    <span className="text-blue-600 dark:text-blue-400">Steps:</span> {project.stepsCompleted}/{project.stepsCount}
                  </p>
                  <p className="flex items-center gap-1">
                    <span className="text-green-600 dark:text-green-400">Tasks:</span> {project.tasksCompleted}/{project.tasksCount}
                  </p>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-1 mt-1">
                  <p className="text-muted-foreground">
                    Progress increases when items are marked as "completed" status. Mark tasks, steps, and phases complete to advance overall progress.
                  </p>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </SortableTableCell>
        {/* Health Score */}
        <SortableTableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                healthIndicator.bgColor,
                healthIndicator.color
              )}>
                <HealthIcon className="h-3 w-3" />
                <span>{project.healthScore}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs">
                <p className="font-medium">{healthIndicator.label}</p>
                <p className="text-muted-foreground flex items-center gap-1 mt-1">
                  <Sparkles className="h-3 w-3" />
                  AI-powered insights coming soon
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </SortableTableCell>
        {/* Timeline */}
        <SortableTableCell>
          {project.startDate && project.endDate ? (
            <div className="flex flex-col">
              <div className="text-xs text-gray-700 dark:text-gray-300">
                {(() => {
                  const start = parseISO(project.startDate);
                  const end = parseISO(project.endDate);
                  const duration = differenceInDays(end, start) + 1;
                  const formatDate = (d: Date) => format(d, 'MM/dd/yy');
                  return `${formatDate(start)}-${formatDate(end)}(${duration}d)`;
                })()}
              </div>
              {project.isOverdue && (
                <div className="inline-flex items-center gap-1 text-xs text-red-600 font-medium mt-0.5">
                  <AlertCircle className="h-3 w-3" />
                  {Math.abs(project.daysRemaining!)}d overdue
                </div>
              )}
            </div>
          ) : project.endDate ? (
            <div className="flex flex-col">
              <div className="text-xs text-gray-700 dark:text-gray-300">
                Due: {format(parseISO(project.endDate), 'MM/dd/yy')}
              </div>
              {project.isOverdue && (
                <div className="inline-flex items-center gap-1 text-xs text-red-600 font-medium mt-0.5">
                  <AlertCircle className="h-3 w-3" />
                  {Math.abs(project.daysRemaining!)}d overdue
                </div>
              )}
            </div>
          ) : (
            <span className="text-gray-400 text-xs">No dates set</span>
          )}
        </SortableTableCell>
        {/* Overdue Tasks */}
        <SortableTableCell>
          {project.tasksWithDueDates === 0 ? (
            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
              No Due Dates
            </Badge>
          ) : project.overdueTasks > 0 ? (
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800">
              {project.overdueTasks} overdue
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-100 dark:border-green-800">
              On track
            </Badge>
          )}
        </SortableTableCell>
        {/* Internal Status */}
        <SortableTableCell>
          {(() => {
            const statusConfig = getStatusConfig(project.status);
            return (
              <Badge 
                variant="secondary"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-white"
                style={{ backgroundColor: statusConfig.color }}
              >
                {statusConfig.icon && <DynamicIcon name={statusConfig.icon} className="h-3.5 w-3.5" />}
                <span>{statusConfig.name}</span>
              </Badge>
            );
          })()}
        </SortableTableCell>
        {/* Owner */}
        <SortableTableCell>
          <span className="text-sm">{project.primaryEngineerName}</span>
        </SortableTableCell>
        {/* Actions */}
        <SortableTableCell onClick={(e) => e.stopPropagation()}>
          <ResponsiveTableActionsMenu
            actions={[
              {
                id: "edit-details",
                label: "Edit Details",
                icon: SquarePen,
                onClick: () => handleProjectSelect(project.id)
              }
            ]}
          />
        </SortableTableCell>
      </SortableTableRow>
    );
  };

  // Collapsible MAP section component (closure over sortConfig, handleSort, projectsLoading)
  const MapCollapsibleSection = ({
    label,
    Icon,
    iconColorClass,
    headerBgClass,
    projects,
    expanded,
    onToggle,
    currentPage,
    onPageChange,
    itemsPerPage: sectionItemsPerPage,
  }: MapCollapsibleSectionProps) => {
    const paginated = projects.slice((currentPage - 1) * sectionItemsPerPage, currentPage * sectionItemsPerPage);
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-4">
        {/* Section header */}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
            headerBgClass
          )}
        >
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", iconColorClass)} />
            <span className="font-semibold text-sm text-gray-800 dark:text-gray-100">{label}</span>
            <Badge variant="secondary" className="ml-1 px-2 py-0 text-xs h-5">
              {projects.length}
            </Badge>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform duration-200",
              !expanded && "-rotate-90"
            )}
          />
        </button>
        {/* Collapsible table */}
        {expanded && (
          <>
            <SortableTable>
              <SortableTableHeader>
                <SortableTableRow>
                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                    MAP / Project Name
                  </SortableTableHead>
                  <SortableTableHead sortKey="customerName" sortConfig={sortConfig} onSort={handleSort}>
                    Account
                  </SortableTableHead>
                  <SortableTableHead sortKey="progressPercent" sortConfig={sortConfig} onSort={handleSort}>
                    Progress
                  </SortableTableHead>
                  <SortableTableHead sortKey="healthScore" sortConfig={sortConfig} onSort={handleSort}>
                    Health
                  </SortableTableHead>
                  <SortableTableHead sortKey="daysRemaining" sortConfig={sortConfig} onSort={handleSort}>
                    Timeline
                  </SortableTableHead>
                  <SortableTableHead sortKey="overdueTasks" sortConfig={sortConfig} onSort={handleSort}>
                    Overdue Tasks
                  </SortableTableHead>
                  <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                    Internal Status
                  </SortableTableHead>
                  <SortableTableHead sortKey="primaryEngineerName" sortConfig={sortConfig} onSort={handleSort}>
                    Owner
                  </SortableTableHead>
                  <SortableTableHead sortKey="actions" sortConfig={sortConfig} onSort={handleSort} className="w-[80px]" sortable={false}>
                    Actions
                  </SortableTableHead>
                </SortableTableRow>
              </SortableTableHeader>
              <SortableTableBody>
                {projectsLoading ? (
                  <SortableTableRow>
                    <SortableTableCell colSpan={9} className="text-center py-8">
                      Loading MAP projects...
                    </SortableTableCell>
                  </SortableTableRow>
                ) : paginated.length === 0 ? (
                  <SortableTableRow>
                    <SortableTableCell colSpan={9} className="text-center py-8 text-gray-400">
                      No projects in this group
                    </SortableTableCell>
                  </SortableTableRow>
                ) : (
                  paginated.map(renderProjectRow)
                )}
              </SortableTableBody>
            </SortableTable>
            <TablePaginationFooter
              totalItems={projects.length}
              pageSize={sectionItemsPerPage}
              currentPage={currentPage}
              onPageChange={onPageChange}
              entityLabel="projects"
            />
          </>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {filterContainerRef?.current && createPortal(filterContent, filterContainerRef.current)}
        
        {/* Summary Stats Row - AI Assessments Overview Style */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Total MAPs Card */}
          <Card className="relative overflow-hidden bg-blue-50/80 dark:bg-blue-950/75 border-blue-200">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <LayoutList className="h-24 w-24 opacity-10 text-blue-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <LayoutList className="w-5 h-5 text-blue-900 dark:text-blue-300" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                    <p>Total MAP projects tracked</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Total MAPs</h3>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {summaryStats.total}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Projects with action plans</p>
            </CardContent>
          </Card>
          
          {/* In Progress Card */}
          <Card className="relative overflow-hidden bg-green-50/80 dark:bg-green-950/75 border-green-200">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Activity className="h-24 w-24 opacity-10 text-green-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Activity className="w-5 h-5 text-green-900 dark:text-green-300" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                    <p>Projects currently being executed</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">In Progress</h3>
              </div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {summaryStats.inProgress}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Active project execution</p>
            </CardContent>
          </Card>
          
          {/* At Risk Card */}
          <Card className="relative overflow-hidden bg-yellow-50/80 dark:bg-yellow-950/75 border-yellow-200">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <AlertTriangle className="h-24 w-24 opacity-10 text-yellow-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangle className="w-5 h-5 text-yellow-900 dark:text-yellow-300" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                    <p>Projects with health score below 60%</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">At Risk</h3>
              </div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {summaryStats.atRisk}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Projects needing attention</p>
            </CardContent>
          </Card>
          
          {/* Overdue Card */}
          <Card className="relative overflow-hidden bg-red-50/80 dark:bg-red-950/75 border-red-200">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <Clock className="h-24 w-24 opacity-10 text-red-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Clock className="w-5 h-5 text-red-900 dark:text-red-300" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                    <p>Projects past their deadline</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Overdue</h3>
              </div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {summaryStats.overdue}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Projects past deadline</p>
            </CardContent>
          </Card>
          
          {/* Completed Card */}
          <Card className="relative overflow-hidden bg-purple-50/80 dark:bg-purple-950/75 border-purple-200">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <CheckCircle2 className="h-24 w-24 opacity-10 text-purple-600" />
            </div>
            <CardContent className="relative p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <CheckCircle2 className="w-5 h-5 text-purple-900 dark:text-purple-300" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-white dark:bg-gray-900 text-black dark:text-gray-100 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 shadow-md">
                    <p>Successfully completed projects</p>
                  </TooltipContent>
                </Tooltip>
                <h3 className="tracking-tight text-sm font-bold text-gray-900 dark:text-gray-100">Completed</h3>
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {summaryStats.completed}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Projects finished successfully</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Top Card - Projects Table */}
        <Card className="relative overflow-hidden">
          <DecorativeCardIcon icon={Waypoints} />
          <CardHeader className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Waypoints className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-2xl">MAP Projects ({filteredProjects.length})</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            {/* Search - only show when not using portal */}
            {!filterContainerRef?.current && (
              <div className="mb-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by project or customer name..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setMyCurrentPage(1);
                      setOtherCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            {/* Grouped collapsible sections */}
            <MapCollapsibleSection
              label="My Project MAPs"
              Icon={FolderHeart}
              iconColorClass="text-rose-500"
              headerBgClass="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              projects={myMaps}
              expanded={myExpanded}
              onToggle={() => setMyExpanded(v => !v)}
              currentPage={myCurrentPage}
              onPageChange={setMyCurrentPage}
              itemsPerPage={itemsPerPage}
            />
            <MapCollapsibleSection
              label="Other Project MAPs"
              Icon={FolderCog}
              iconColorClass="text-amber-500"
              headerBgClass="bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
              projects={otherMaps}
              expanded={otherExpanded}
              onToggle={() => setOtherExpanded(v => !v)}
              currentPage={otherCurrentPage}
              onPageChange={setOtherCurrentPage}
              itemsPerPage={itemsPerPage}
            />

            {/* Health Score Callout */}
            <div className="mt-6 p-4 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="space-y-3 text-sm">
                  <div>
                    <h4 className="font-bold text-lg text-blue-900 dark:text-blue-100 mb-2">Understanding Health Scores</h4>
                    
                    {/* Color Legend */}
                    <div className="flex flex-wrap gap-3 mb-3">
                      <div className="inline-flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-gray-700 dark:text-gray-300">80-100: <span className="font-medium text-green-700 dark:text-green-400">Healthy</span></span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-gray-700 dark:text-gray-300">60-79: <span className="font-medium text-yellow-700 dark:text-yellow-400">At Risk</span></span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-orange-500" />
                        <span className="text-gray-700 dark:text-gray-300">40-59: <span className="font-medium text-orange-700 dark:text-orange-400">Warning</span></span>
                      </div>
                      <div className="inline-flex items-center gap-1.5">
                        <Siren className="h-4 w-4 text-red-500" />
                        <span className="text-gray-700 dark:text-gray-300">0-39: <span className="font-medium text-red-700 dark:text-red-400">Critical</span></span>
                      </div>
                    </div>
                  </div>

                  {/* How it's calculated */}
                  <div className="border-t border-blue-200 dark:border-blue-700 pt-3">
                    <p className="text-gray-700 dark:text-gray-300 mb-2">
                      <span className="font-medium">How is the score calculated?</span> The health score starts at 100 and is reduced by up to 4 factors:
                    </p>
                    <ul className="space-y-1 text-gray-600 dark:text-gray-400 pl-4">
                      <li className="flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        <span><strong>Overdue Tasks</strong> (up to -40 pts): Penalty based on the ratio of overdue tasks to total tasks</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <TrendingUp className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                        <span><strong>Timeline Gap</strong> (up to -40 pts): Compares expected progress (based on elapsed time) vs actual progress</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Clock className="h-3.5 w-3.5 text-orange-500 mt-0.5 shrink-0" />
                        <span><strong>Past Deadline</strong> (-20 pts): Applied when the project end date has passed and progress is not 100%</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Activity className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                        <span><strong>Slow Start</strong> (-10 pts): Applied when progress is below 10% after 7+ days since project start</span>
                      </li>
                    </ul>
                  </div>

                  {/* Improvement actions */}
                  <div className="border-t border-blue-200 dark:border-blue-700 pt-3">
                    <p className="text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                      <Target className="h-4 w-4 text-purple-500" />
                      <span className="font-medium">How to improve scores below 80 (At Risk threshold):</span>
                    </p>
                    <ul className="space-y-1 text-gray-600 dark:text-gray-400 pl-4">
                      <li className="flex items-start gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span>Complete or reschedule overdue tasks to reduce the overdue ratio</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span>Mark completed tasks, steps, and phases to close the gap between expected and actual progress</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span>Adjust project timeline dates if the original schedule was unrealistic</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <span>Review blocked tasks and resolve dependencies to unblock progress</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* MapDrawer - Project MAP sliding drawer */}
        {selectedProjectId && (
          <MapDrawer
            projectId={selectedProjectId}
            open={isMapDrawerOpen}
            onOpenChange={setIsMapDrawerOpen}
            accessLevel="edit"
          />
        )}
      </div>
    </TooltipProvider>
  );
}
