import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SortableTable, SortableTableHeader, SortableTableHead, SortableTableBody, SortableTableRow, SortableTableCell } from "@/components/ui/sortable-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChartNetwork, Plus, Search, Filter, Eye, Edit, Copy, Trash2, Users, Calendar, Clock, Target, ScanSearch, Waypoints, SquareChartGantt, ListTodo, FileJson2, Star, Folder, Building2, Lock, Globe, FolderHeart, FolderCog, FolderLock, FolderClock, ChevronDown } from "lucide-react";
import { ResponsiveTableActionsMenu, type TableAction } from "@/components/ui/table-actions-menu";
import { SearchFiltersSection, FilterLabel } from "@/components/ui/search-filters-section";
import { useSortState, makeComparator, stableSort } from "@/lib/sorting";
import { formatFullName } from "@/lib/nameUtils";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MapTemplateContentDisplay } from "@/components/map/MapTemplateContentDisplay";

// Extended type for MapTemplate with user information from JOIN
type MapTemplateWithUser = MapTemplate & {
  createdByUser?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
};
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { cn } from "@/lib/utils";
import MapTemplateSheet from "@/components/map/MapTemplateSheet";

// Helper function to get badge styling based on task status
const getStatusBadgeStyle = (status: string): string => {
  const normalizedStatus = status.toLowerCase().replace('_', ' ');
  
  switch (normalizedStatus) {
    case 'not started':
      return 'bg-gray-600 text-white hover:bg-gray-700';
    case 'in progress':
      return 'bg-blue-600 text-white hover:bg-blue-700';
    case 'blocked':
      return 'bg-red-600 text-white hover:bg-red-700';
    case 'complete':
      return 'bg-green-600 text-white hover:bg-green-700';
    case 'stalled':
      return 'bg-orange-600 text-white hover:bg-orange-700';
    case 'not needed':
      return 'bg-black text-white hover:bg-gray-900';
    default:
      return 'bg-gray-500 text-white hover:bg-gray-600';
  }
};

// Helper function to get badge styling based on step status
const getStepStatusBadgeStyle = (status: string): string => {
  const normalizedStatus = status.toLowerCase().replace('_', ' ');
  
  switch (normalizedStatus) {
    case 'not started':
      return 'bg-gray-600 text-white hover:bg-gray-700';
    case 'in progress':
      return 'bg-blue-600 text-white hover:bg-blue-700';
    case 'blocked':
      return 'bg-red-600 text-white hover:bg-red-700';
    case 'at risk':
      return 'bg-red-400 text-white hover:bg-red-500';
    case 'complete':
      return 'bg-green-600 text-white hover:bg-green-700';
    case 'stalled':
      return 'bg-orange-600 text-white hover:bg-orange-700';
    case 'deferred':
      return 'bg-black text-white hover:bg-gray-900';
    default:
      return 'bg-gray-600 text-white hover:bg-gray-700';
  }
};

// Helper function to determine phase border color based on step statuses
const getPhaseBorderColor = (steps: Array<{ id: number; name: string; description: string | null; orderIndex: number; tasks: any[]; }>): string => {
  // For now, all steps have "Not Started" status, but this logic will work when statuses are dynamic
  const stepStatuses = steps.map(() => 'Not Started'); // This would be replaced with actual step status from DB
  
  // Check for priority conditions
  const hasInProgress = stepStatuses.some(status => status.toLowerCase() === 'in progress');
  const hasAtRiskOrBlocked = stepStatuses.some(status => 
    status.toLowerCase() === 'at risk' || status.toLowerCase() === 'blocked'
  );
  const allComplete = stepStatuses.length > 0 && stepStatuses.every(status => status.toLowerCase() === 'complete');
  
  // Return border color based on priority
  if (hasAtRiskOrBlocked) {
    return '#DC2626'; // Red border
  } else if (hasInProgress) {
    return '#2563EB'; // Blue border  
  } else if (allComplete) {
    return '#16A34A'; // Green border
  } else {
    return '#E5E7EB'; // Default gray border
  }
};

// Helper function to get scope icon
const getScopeIcon = (scope: string) => {
  const scopeLower = scope.toLowerCase();
  switch (scopeLower) {
    case 'default':
      return Star;
    case 'application':
      return Target;
    case 'customer':
      return Building2;
    case 'project':
      return Folder;
    case 'partner':
      return Users;
    default:
      return Star;
  }
};

// Helper function to get visibility icon
const getVisibilityIcon = (visibility: string) => {
  const visibilityLower = visibility.toLowerCase();
  switch (visibilityLower) {
    case 'public':
      return Globe;
    case 'internal':
      return Users;
    case 'private':
      return Lock;
    default:
      return Globe;
  }
};

// Structural shapes used by the template-summary helpers below. The MAP
// template content endpoint returns numeric `expectedHours`/`expectedDays`
// columns as strings (Drizzle decimals/integers serialized to JSON), and
// nested arrays of steps/tasks. We only declare the fields these helpers
// actually read.
interface TemplateTaskLike {
  expectedHours?: string | number | null;
}

interface TemplateStepLike {
  expectedDays?: string | number | null;
  tasks?: TemplateTaskLike[];
}

interface TemplatePhaseLike {
  steps?: TemplateStepLike[];
}

// Helper function to calculate total hours from tasks
const calculateTaskHours = (tasks: TemplateTaskLike[] | undefined): number => {
  if (!tasks || tasks.length === 0) return 0;

  return tasks.reduce((total, task) => {
    const numericHours = Number(task.expectedHours) || 0;
    return total + numericHours;
  }, 0);
};

// Helper function to calculate phase rollup totals
const calculatePhaseRollup = (steps: TemplateStepLike[] | undefined): { totalDays: number; totalHours: number } => {
  let totalDays = 0;
  let totalHours = 0;

  if (!steps || steps.length === 0) {
    return { totalDays, totalHours };
  }

  steps.forEach(step => {
    totalDays += Number(step.expectedDays) || 0;
    if (step.tasks && Array.isArray(step.tasks)) {
      totalHours += calculateTaskHours(step.tasks);
    }
  });

  return { totalDays, totalHours };
};

// Helper function to calculate template summary totals
const calculateTemplateSummary = (phases: TemplatePhaseLike[] | undefined): { phaseCount: number; stepCount: number; taskCount: number; totalDays: number; totalHours: number } => {
  let stepCount = 0;
  let taskCount = 0;
  let totalDays = 0;
  let totalHours = 0;

  if (!phases || phases.length === 0) {
    return { phaseCount: 0, stepCount, taskCount, totalDays, totalHours };
  }

  phases.forEach(phase => {
    if (phase.steps && Array.isArray(phase.steps)) {
      stepCount += phase.steps.length;

      phase.steps.forEach(step => {
        totalDays += Number(step.expectedDays) || 0;
        if (step.tasks && Array.isArray(step.tasks)) {
          taskCount += step.tasks.length;
          totalHours += calculateTaskHours(step.tasks);
        }
      });
    }
  });

  return { phaseCount: phases.length, stepCount, taskCount, totalDays, totalHours };
};

// Types for MAP templates
interface MapTemplate {
  id: number;
  name: string;
  description: string | null;
  icon?: string | null;
  scope: string;
  visibility: string;
  solutionIds?: any;
  customerId?: number | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  usageCount?: number;
  lastAppliedAt?: string | null;
}

interface MapTemplateWithStats extends MapTemplate {
  usageCount: number;
  lastAppliedAt: string | null;
  isActive?: boolean;
  isSystem?: boolean;
  createdByUser?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  updatedByUser?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

interface MapTemplateUsageStats {
  usageCount: number;
  lastAppliedAt: string | null;
  usedBy: Array<{
    projectId: number;
    projectName: string;
    appliedAt: string;
    mode: string;
  }>;
}

interface MapTemplateContent {
  phases: Array<{
    id: number;
    name: string;
    description: string | null;
    orderIndex: number;
    steps: Array<{
      id: number;
      name: string;
      description: string | null;
      orderIndex: number;
      tasks: Array<{
        id: number;
        name: string;
        description: string | null;
        defaultStatus: string;
        defaultDueOffsetDays: number | null;
        orderIndex: number;
      }>;
    }>;
  }>;
}

// Helper function to get scope badge styling
const getScopeBadgeClass = (scope: string) => {
  const scopeLower = scope.toLowerCase();
  switch (scopeLower) {
    case 'default':
      return 'bg-gray-700 text-white hover:bg-gray-600';
    case 'application':
      return 'bg-orange-600 text-white hover:bg-orange-500';
    case 'customer':
      return 'bg-red-600 text-white hover:bg-red-500';
    case 'project':
      return 'bg-blue-600 text-white hover:bg-blue-500';
    case 'partner':
      return 'bg-green-600 text-white hover:bg-green-500';
    default:
      return 'bg-gray-600 text-white hover:bg-gray-500';
  }
};

// Helper function to capitalize first letter
const capitalizeScopeText = (scope: string) => {
  return scope.charAt(0).toUpperCase() + scope.slice(1).toLowerCase();
};

// Helper function to capitalize first letter for visibility
const capitalizeText = (text: string) => {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

interface MapLibrarySectionProps {
  searchTerm?: string;
  selectedSolution?: string;
  selectedScope?: string;
  selectedVisibility?: string;
  hideFilters?: boolean;
}

export default function MapLibrarySection({
  searchTerm: externalSearchTerm,
  selectedSolution: externalSolution,
  selectedScope: externalScope,
  selectedVisibility: externalVisibility,
  hideFilters = false
}: MapLibrarySectionProps = {}) {
  const { user } = useAuth();
  
  const { canEdit: permCanEdit } = usePermissions();
  const isAdmin = user?.role === 'Admin';
  const hasTemplateEditPermission = permCanEdit('template_management.map-library');
  const [templates, setTemplates] = useState<MapTemplateWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalSearchTerm, setInternalSearchTerm] = useState("");
  const [internalScopeFilter, setInternalScopeFilter] = useState<string>("all");
  const [internalVisibilityFilter, setInternalVisibilityFilter] = useState<string>("all");

  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearchTerm;
  const setSearchTerm = setInternalSearchTerm;
  const scopeFilter = externalScope !== undefined ? externalScope : internalScopeFilter;
  const setScopeFilter = setInternalScopeFilter;
  const visibilityFilter = externalVisibility !== undefined ? externalVisibility : internalVisibilityFilter;
  const setVisibilityFilter = setInternalVisibilityFilter;
  const [selectedTemplate, setSelectedTemplate] = useState<MapTemplateWithStats | null>(null);
  const [templateContent, setTemplateContent] = useState<MapTemplateContent | null>(null);
  const [templateStats, setTemplateStats] = useState<MapTemplateUsageStats | null>(null);
  const [showTemplateSheet, setShowTemplateSheet] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MapTemplateWithUser | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<number | null>(null);
  const [deleteRequiresForce, setDeleteRequiresForce] = useState(false);
  type RightPanelTab = "overview" | "content" | "json";
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<RightPanelTab>("overview");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const [myMapsExpanded, setMyMapsExpanded] = useState(true);
  const [customMapsExpanded, setCustomMapsExpanded] = useState(true);
  const [systemMapsExpanded, setSystemMapsExpanded] = useState(true);
  const [inactiveMapsExpanded, setInactiveMapsExpanded] = useState(false);
  
  // Toggle function for step task accordion
  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };
  
  // Sorting state
  const { sortConfig, handleSort } = useSortState({ key: 'name', direction: 'asc' });

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchTerm) count++;
    if (scopeFilter !== "all") count++;
    if (visibilityFilter !== "all") count++;
    return count;
  }, [searchTerm, scopeFilter, visibilityFilter]);

  // Clear all filters
  const clearAllFilters = () => {
    setSearchTerm("");
    setScopeFilter("all");
    setVisibilityFilter("all");
  };

  // Load templates with stats
  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/map/templates?include=stats');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      } else {
        showErrorToast("Error", "Failed to load MAP templates");
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      showErrorToast("Error", "Failed to load MAP templates");
    } finally {
      setLoading(false);
    }
  };

  // Load template content for right panel
  const loadTemplateDetails = async (templateId: number) => {
    try {
      const [contentResponse, statsResponse] = await Promise.all([
        fetch(`/api/map/templates/${templateId}/content?t=${Date.now()}`),
        fetch(`/api/map/templates/${templateId}/stats`)
      ]);

      if (contentResponse.ok) {
        const content = await contentResponse.json();
        setTemplateContent(content);
      }

      if (statsResponse.ok) {
        const stats = await statsResponse.json();
        setTemplateStats(stats);
      }
    } catch (error) {
      console.error('Error loading template details:', error);
      showErrorToast("Error", "Failed to load template details");
    }
  };

  // Filter and sort templates based on search and filters
  const filteredTemplates = useMemo(() => {
    const filtered = templates.filter(template => {
      const matchesSearch = !searchTerm || 
        template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (template.description && template.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesScope = scopeFilter === "all" || template.scope === scopeFilter;
      const matchesVisibility = visibilityFilter === "all" || template.visibility === visibilityFilter;
      
      return matchesSearch && matchesScope && matchesVisibility;
    });

    // Apply sorting if sortConfig is available
    if (sortConfig) {
      return stableSort(filtered, makeComparator(sortConfig));
    }

    return filtered;
  }, [templates, searchTerm, scopeFilter, visibilityFilter, sortConfig]);

  // Category split: My / Custom / System
  // System = isSystem !== false; My = isSystem===false && creator; Custom = isSystem===false && !creator
  const myMapTemplates = filteredTemplates.filter(t => t.isSystem === false && t.createdByUserId === user?.id && t.isActive !== false);
  const customMapTemplates = filteredTemplates.filter(t => t.isSystem === false && t.createdByUserId !== user?.id && t.isActive !== false);
  const systemMapTemplates = filteredTemplates.filter(t => t.isSystem !== false && t.isActive !== false);
  const inactiveMapTemplates = filteredTemplates.filter(t => t.isActive === false);

  // Handle template selection
  const handleTemplateSelect = (template: MapTemplateWithStats) => {
    setSelectedTemplate(template);
    setActiveRightPanelTab("overview");
    loadTemplateDetails(template.id);
  };

  // Inline toggle isActive / isSystem for admin only
  const handleInlineToggle = async (templateId: number, field: 'isActive' | 'isSystem', value: boolean) => {
    try {
      const response = await fetch(`/api/map/templates/${templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (response.ok) {
        setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, [field]: value } : t));
        if (selectedTemplate?.id === templateId) {
          setSelectedTemplate(prev => prev ? { ...prev, [field]: value } : prev);
        }
        showSuccessToast("Updated", `Template ${field === 'isActive' ? 'active status' : 'system flag'} updated.`);
      }
    } catch (error) {
      showErrorToast("Error", "Failed to update template status");
    }
  };

  // Handle template sheet save callback
  const handleTemplateSave = () => {
    const editedTemplateId = editingTemplate?.id;
    setEditingTemplate(null);
    loadTemplates();
    
    // Reload template content if the edited template is currently selected
    if (editedTemplateId && selectedTemplate?.id === editedTemplateId) {
      loadTemplateDetails(editedTemplateId);
    }
  };

  // Handle duplicate template
  const handleDuplicate = async (templateId: number) => {
    try {
      const response = await fetch(`/api/map/templates/${templateId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      if (response.ok) {
        showSuccessToast("Success", "Template duplicated successfully");
        loadTemplates();
      } else {
        const error = await response.json();
        showErrorToast("Error", error.message || "Failed to duplicate template");
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
      showErrorToast("Error", "Failed to duplicate template");
    }
  };

  // Handle delete template
  const handleDelete = async (force = false) => {
    if (!deleteTemplateId) return;

    try {
      const url = force ? `/api/map/templates/${deleteTemplateId}?force=true` : `/api/map/templates/${deleteTemplateId}`;
      const response = await fetch(url, { method: 'DELETE' });

      if (response.ok) {
        showSuccessToast("Success", "Template deleted successfully");
        setShowDeleteDialog(false);
        setDeleteTemplateId(null);
        setDeleteRequiresForce(false);
        if (selectedTemplate?.id === deleteTemplateId) {
          setSelectedTemplate(null);
          setTemplateContent(null);
          setTemplateStats(null);
        }
        loadTemplates();
      } else {
        const error = await response.json();
        if (error.requiresForce) {
          setDeleteRequiresForce(true);
          return; // Keep dialog open and show force option
        }
        showErrorToast("Error", error.message || "Failed to delete template");
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      showErrorToast("Error", "Failed to delete template");
    }
  };

  // Format dates
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  // Load templates on mount
  useEffect(() => {
    loadTemplates();
  }, []);

  return (
    <div className="space-y-2">

      {!hideFilters && (
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearAllFilters}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <FilterLabel htmlFor="search">Search</FilterLabel>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search templates by name or description..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-9 text-sm"
                />
              </div>
            </div>
            <div>
              <FilterLabel>Scope</FilterLabel>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All scopes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Default
                    </div>
                  </SelectItem>
                  <SelectItem value="application">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Application
                    </div>
                  </SelectItem>
                  <SelectItem value="customer">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Customer
                    </div>
                  </SelectItem>
                  <SelectItem value="project">
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4" />
                      Project
                    </div>
                  </SelectItem>
                  <SelectItem value="partner">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Partner
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <FilterLabel>Visibility</FilterLabel>
              <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Visibility</SelectItem>
                  <SelectItem value="public">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Public
                    </div>
                  </SelectItem>
                  <SelectItem value="internal">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Internal
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      Private
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </SearchFiltersSection>
      )}

      {/* Hidden button for programmatic triggering */}
      {(isAdmin || hasTemplateEditPermission) && (
        <Button
          onClick={() => {
            setEditingTemplate(null);
            setShowTemplateSheet(true);
          }}
          data-create-map-template="true"
          style={{position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'auto'}}
        >
          <ChartNetwork size={16} className="mr-2" />
          Create MAP Template
        </Button>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Templates List */}
        <div className="space-y-4">

          {/* Templates Table — categorized */}
          <div>
            {loading ? (
              <div className="text-center py-8">Loading templates...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {templates.length === 0 ? "No templates found" : "No templates match your filters"}
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { key: 'my', label: 'My Templates', icon: FolderHeart, iconColor: 'text-rose-500', sectionTemplates: myMapTemplates, expanded: myMapsExpanded, toggle: setMyMapsExpanded },
                  { key: 'custom', label: 'Other Templates', icon: FolderCog, iconColor: 'text-amber-600', sectionTemplates: customMapTemplates, expanded: customMapsExpanded, toggle: setCustomMapsExpanded },
                  { key: 'system', label: 'System Templates', icon: FolderLock, iconColor: 'text-blue-600', sectionTemplates: systemMapTemplates, expanded: systemMapsExpanded, toggle: setSystemMapsExpanded },
                  { key: 'inactive', label: 'Inactive Templates', icon: FolderClock, iconColor: 'text-gray-400', sectionTemplates: inactiveMapTemplates, expanded: inactiveMapsExpanded, toggle: setInactiveMapsExpanded },
                ].map(({ key, label, icon: SectionIcon, iconColor, sectionTemplates, expanded, toggle }) => {
                  return (
                    <div key={key} className="border rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggle(!expanded)}
                        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-left"
                      >
                        <SectionIcon className={`h-5 w-5 shrink-0 ${iconColor}`} />
                        <span className="font-semibold text-sm">{label}</span>
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">{sectionTemplates.length}</Badge>
                        <ChevronDown className={`h-4 w-4 ml-auto text-gray-400 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`} />
                      </button>
                      {expanded && (
                        sectionTemplates.length > 0 ? (
                          <div className="overflow-x-auto">
                            <SortableTable>
                              <SortableTableHeader>
                                <SortableTableRow>
                                  <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={handleSort} tooltipText="Click to sort by ID" className="w-[80px]">ID</SortableTableHead>
                                  <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort} tooltipText="Click to sort by name">Name</SortableTableHead>
                                  <SortableTableHead sortKey="scope" sortConfig={sortConfig} onSort={handleSort} tooltipText="Click to sort by scope">Scope</SortableTableHead>
                                  <SortableTableHead sortKey="usageCount" sortConfig={sortConfig} onSort={handleSort} tooltipText="Click to sort by usage count">Usage</SortableTableHead>
                                  <SortableTableHead sortKey="lastAppliedAt" sortConfig={sortConfig} onSort={handleSort} tooltipText="Click to sort by last used date">Last Used</SortableTableHead>
                                  <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} sortable={false} className="w-[120px]">Actions</SortableTableHead>
                                </SortableTableRow>
                              </SortableTableHeader>
                              <SortableTableBody>
                                {sectionTemplates.map((template) => {
                                  const canEdit = isAdmin || (hasTemplateEditPermission && template.createdByUserId === user?.id);
                                  return (
                                    <SortableTableRow
                                      key={template.id}
                                      className={cn(
                                        "cursor-pointer hover:bg-muted/50",
                                        selectedTemplate?.id === template.id && "bg-muted",
                                        template.isActive === false && "opacity-70"
                                      )}
                                      onClick={() => handleTemplateSelect(template)}
                                    >
                                      <SortableTableCell>
                                        <div className="text-sm font-mono text-muted-foreground">
                                          #{template.id}
                                        </div>
                                      </SortableTableCell>
                                      <SortableTableCell>
                                        <div>
                                          <div className="font-medium flex items-center gap-2">
                                            <DynamicIcon name={template.icon || 'Waypoints'} className={`h-4 w-4 ${template.isActive === false ? 'text-gray-400' : 'text-blue-600'}`} />
                                            {template.name}
                                          </div>
                                          {template.description && (
                                            <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                                              {template.description}
                                            </div>
                                          )}
                                          {template.isActive === false && (
                                            <div className="flex items-center gap-2 mt-1">
                                              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-gray-500 border-gray-300 bg-gray-50">Inactive</Badge>
                                            </div>
                                          )}
                                        </div>
                                      </SortableTableCell>
                                      <SortableTableCell>
                                        <Badge className={cn("flex items-center gap-1 w-[85px] px-2", getScopeBadgeClass(template.scope))}>
                                          {(() => {
                                            const ScopeIcon = getScopeIcon(template.scope);
                                            return <ScopeIcon className="h-3 w-3" />;
                                          })()}
                                          {capitalizeScopeText(template.scope)}
                                        </Badge>
                                      </SortableTableCell>
                                      <SortableTableCell>
                                        <div className="flex items-center gap-1">
                                          <Users className="h-3 w-3" />
                                          {template.usageCount || 0}
                                        </div>
                                      </SortableTableCell>
                                      <SortableTableCell>
                                        <div className="flex items-center gap-1">
                                          <Calendar className="h-3 w-3" />
                                          {formatDate(template.lastAppliedAt)}
                                        </div>
                                      </SortableTableCell>
                                      <SortableTableCell>
                                        <ResponsiveTableActionsMenu
                                          actions={[
                                            {
                                              id: "view",
                                              label: "View Details",
                                              icon: Eye,
                                              onClick: () => handleTemplateSelect(template),
                                            },
                                            {
                                              id: "edit",
                                              label: "Edit Template",
                                              icon: Edit,
                                              onClick: () => {
                                                setEditingTemplate(template);
                                                setShowTemplateSheet(true);
                                              },
                                              hidden: !canEdit,
                                            },
                                            {
                                              id: "duplicate",
                                              label: "Duplicate Template",
                                              icon: Copy,
                                              onClick: () => handleDuplicate(template.id),
                                              hidden: !canEdit,
                                            },
                                            {
                                              id: "delete",
                                              label: "Delete Template",
                                              icon: Trash2,
                                              onClick: () => {
                                                setDeleteTemplateId(template.id);
                                                setShowDeleteDialog(true);
                                                setDeleteRequiresForce(false);
                                              },
                                              variant: "destructive",
                                              hidden: !canEdit,
                                              separator: true,
                                            },
                                          ]}
                                        />
                                      </SortableTableCell>
                                    </SortableTableRow>
                                  );
                                })}
                              </SortableTableBody>
                            </SortableTable>
                          </div>
                        ) : (
                          <div className="p-4 text-center text-sm text-gray-400">No {label.toLowerCase()} found.</div>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Template Details */}
        <div className="space-y-4">
          {selectedTemplate ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DynamicIcon name={selectedTemplate.icon || 'Waypoints'} className="h-5 w-5 text-blue-600" />
                    {selectedTemplate.name}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={cn("flex items-center gap-1 w-[85px] px-2", getScopeBadgeClass(selectedTemplate.scope))}>
                      {(() => {
                        const ScopeIcon = getScopeIcon(selectedTemplate.scope);
                        return <ScopeIcon className="h-3 w-3" />;
                      })()}
                      {capitalizeScopeText(selectedTemplate.scope)}
                    </Badge>
                    <Badge className="flex items-center gap-1 px-2 bg-gray-100 text-gray-700 border border-gray-300">
                      {(() => {
                        const VisibilityIcon = getVisibilityIcon(selectedTemplate.visibility);
                        return <VisibilityIcon className="h-3 w-3" />;
                      })()}
                      {selectedTemplate.visibility.charAt(0).toUpperCase() + selectedTemplate.visibility.slice(1)}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs value={activeRightPanelTab} onValueChange={(value) => setActiveRightPanelTab(value as RightPanelTab)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="overview">
                      <SquareChartGantt className="h-4 w-4 mr-2" />
                      Overview
                    </TabsTrigger>
                    <TabsTrigger value="content">
                      <ListTodo className="h-4 w-4 mr-2" />
                      Content
                    </TabsTrigger>
                    <TabsTrigger value="json">
                      <FileJson2 className="h-4 w-4 mr-2" />
                      JSON
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="mt-4 space-y-4">
                    <div className="space-y-4">
                      {/* Row 1: Description, Visibility + Active/System toggles */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Description</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedTemplate.description || "No description provided"}
                          </p>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <Label className="text-sm font-medium">Visibility</Label>
                            <div className="flex items-center gap-2 mt-1">
                              {(() => {
                                const VisibilityIcon = getVisibilityIcon(selectedTemplate.visibility);
                                return <VisibilityIcon className="h-4 w-4 text-muted-foreground" />;
                              })()}
                              <p className="text-sm text-muted-foreground">{capitalizeText(selectedTemplate.visibility)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <div className="flex items-center gap-2">
                              <Switch
                                id="map-detail-active"
                                checked={selectedTemplate.isActive !== false}
                                onCheckedChange={(checked) => handleInlineToggle(selectedTemplate.id, 'isActive', checked)}
                                disabled={!isAdmin}
                              />
                              <Label htmlFor="map-detail-active" className={`text-sm ${!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>Active</Label>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                id="map-detail-system"
                                checked={selectedTemplate.isSystem === true}
                                onCheckedChange={(checked) => handleInlineToggle(selectedTemplate.id, 'isSystem', checked)}
                                disabled={!isAdmin}
                              />
                              <Label htmlFor="map-detail-system" className={`text-sm ${!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}`}>System Template</Label>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Row 2: Created By, Created, Last Modified By, Updated (4 columns) */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Created By</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedTemplate.createdByUser 
                              ? formatFullName(selectedTemplate.createdByUser.firstName, selectedTemplate.createdByUser.lastName) || selectedTemplate.createdByUser.email || "Unknown User"
                              : selectedTemplate.createdByUserId || "Unknown User"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Created</Label>
                          <p className="text-sm text-muted-foreground mt-1">{formatDate(selectedTemplate.createdAt)}</p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Last Modified By</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selectedTemplate.updatedByUser
                              ? formatFullName(selectedTemplate.updatedByUser.firstName, selectedTemplate.updatedByUser.lastName) || selectedTemplate.updatedByUser.email || "Unknown User"
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Updated</Label>
                          <p className="text-sm text-muted-foreground mt-1">{formatDate(selectedTemplate.updatedAt)}</p>
                        </div>
                      </div>

                      {/* Row 3: Usage Count, Last Applied, Template ID (3 columns) */}
                      {templateStats && (
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-sm font-medium">Usage Count</Label>
                            <p className="text-sm text-muted-foreground mt-1">{templateStats.usageCount}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Last Applied</Label>
                            <p className="text-sm text-muted-foreground mt-1">{formatDate(templateStats.lastAppliedAt)}</p>
                          </div>
                          <div>
                            <Label className="text-sm font-medium">Template ID</Label>
                            <p className="text-sm text-muted-foreground mt-1">#{selectedTemplate.id}</p>
                          </div>
                        </div>
                      )}

                      {/* Recent Usage Section */}
                      {templateStats && templateStats.usedBy.length > 0 && (
                        <div className="mt-6">
                          <Label className="text-sm font-medium">Recent Usage</Label>
                          <div className="mt-2 space-y-1">
                            {templateStats.usedBy.slice(0, 3).map((usage, index) => (
                              <div key={index} className="text-xs text-muted-foreground bg-muted p-2 rounded">
                                <span className="font-medium">{usage.projectName}</span> - {formatDate(usage.appliedAt)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="content" className="mt-4">
                    <ScrollArea className="h-[800px]">
                      <MapTemplateContentDisplay 
                        templateContent={templateContent} 
                        showSummary={true}
                      />
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="json" className="mt-4">
                    <ScrollArea className="h-[800px]">
                      <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                        {JSON.stringify({ template: selectedTemplate, content: templateContent }, null, 2)}
                      </pre>
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[800px] text-muted-foreground">
                <div className="text-center">
                  <ChartNetwork className="h-24 w-24 mx-auto mb-4 opacity-50" />
                  <p>Select a template to view details</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRequiresForce ? (
                <div className="space-y-2">
                  <p>This template is currently in use and cannot be deleted normally.</p>
                  <p className="font-medium text-destructive">
                    Force deletion will permanently remove the template even though it's being used by projects.
                  </p>
                  <p>Are you sure you want to force delete this template?</p>
                </div>
              ) : (
                "Are you sure you want to delete this template? This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowDeleteDialog(false);
              setDeleteTemplateId(null);
              setDeleteRequiresForce(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDelete(deleteRequiresForce)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRequiresForce ? "Force Delete" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* MAP Template Sheet */}
      <MapTemplateSheet
        open={showTemplateSheet}
        onOpenChange={setShowTemplateSheet}
        // Documented boundary cast: this file declares its own local
        // `MapTemplate`/`MapTemplateWithUser` shapes (dates as serialized
        // ISO strings) because the data arrives over JSON, while
        // `MapTemplateSheet` types its `template` prop against the
        // Drizzle-generated shared schema (Date objects, stricter optional
        // fields). The runtime values are identical; bridge the structural
        // mismatch through `unknown`.
        template={
          (editingTemplate ?? undefined) as unknown as React.ComponentProps<
            typeof MapTemplateSheet
          >["template"]
        }
        onSave={handleTemplateSave}
      />
    </div>
  );
}