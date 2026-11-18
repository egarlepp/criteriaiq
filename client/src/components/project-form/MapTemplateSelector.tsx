import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { showErrorToast } from "@/lib/toast-helper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  FileText, 
  CheckCircle, 
  Clock, 
  Users,
  MapPin,
  ChevronRight,
  Loader2,
  ChartNetwork,
  Waypoints,
  Star,
  Target,
  Building2,
  Folder,
  Eye,
  ClipboardPenLine,
  Boxes,
  PackageCheck,
  SquareChartGantt,
  ListTodo,
  FileJson2,
  ChevronDown,
  Globe,
  Lock,
  ArrowBigLeft
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { MapTemplate, MapTemplateWithDetails } from "@/types/map";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { MapTemplateContentDisplay } from "@/components/map/MapTemplateContentDisplay";

// Interface for template content with tasks (matching MAP Library structure)
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
      defaultStatus: string;
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

interface MapTemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  onTemplateSelected: (template?: {
    id: number;
    name: string;
    description?: string;
    phaseCount?: number;
    stepCount?: number;
    taskCount?: number;
  }) => void;
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

// Helper function to capitalize scope text
const capitalizeScopeText = (scope: string) => {
  return scope.charAt(0).toUpperCase() + scope.slice(1).toLowerCase();
};

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
    case 'review':
      return 'bg-amber-600 text-white hover:bg-amber-700';
    case 'approved':
      return 'bg-emerald-600 text-white hover:bg-emerald-700';
    default:
      return 'bg-gray-600 text-white hover:bg-gray-500';
  }
};

export function MapTemplateSelector({ 
  open, 
  onOpenChange, 
  projectId, 
  onTemplateSelected 
}: MapTemplateSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedTemplateDetails, setSelectedTemplateDetails] = useState<MapTemplateWithDetails | null>(null);
  const [templateContent, setTemplateContent] = useState<MapTemplateContent | null>(null);
  const [isViewingDetails, setIsViewingDetails] = useState(false);
  type RightPanelTab = "overview" | "content" | "json";
  const [activeRightPanelTab, setActiveRightPanelTab] = useState<RightPanelTab>("overview");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

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

  // Fetch all templates
  const { data: templates = [], isLoading: isLoadingTemplates, error: templatesError } = useQuery<MapTemplate[]>({
    queryKey: ["/api/map/templates"],
    queryFn: () => {
      console.log('=== MAP TEMPLATES API CALL ===');
      return apiRequest("GET", "/api/map/templates");
    },
    enabled: open,
    staleTime: 300000, // 5 minutes
  });

  // Debug logging for templates
  useEffect(() => {
    if (templates && templates.length > 0) {
      console.log('=== MAP TEMPLATES SUCCESS ===');
      console.log('Templates received:', templates);
      console.log('Number of templates:', templates.length);
    }
    if (templatesError) {
      console.log('=== MAP TEMPLATES ERROR ===');
      console.error('Templates error:', templatesError);
    }
  }, [templates, templatesError]);

  // Fetch template details
  const { data: templateDetailsData, isLoading: isLoadingDetails } = useQuery<MapTemplateWithDetails>({
    queryKey: ["/api/map/templates", selectedTemplateId],
    queryFn: () => apiRequest("GET", `/api/map/templates/${selectedTemplateId}`),
    enabled: !!selectedTemplateId,
    staleTime: 0, // Always refetch to avoid stale data issues
  });

  // Fetch template content with tasks (matching MAP Library structure)
  const { data: templateContentData } = useQuery<MapTemplateContent>({
    queryKey: ["/api/map/templates", selectedTemplateId, "content"],
    queryFn: () => apiRequest("GET", `/api/map/templates/${selectedTemplateId}/content`),
    enabled: !!selectedTemplateId,
    staleTime: 0,
  });

  // Update selected template details when data changes
  useEffect(() => {
    if (templateDetailsData && isViewingDetails) {
      setSelectedTemplateDetails(templateDetailsData);
    }
  }, [templateDetailsData, isViewingDetails]);

  // Update template content when data changes
  useEffect(() => {
    if (templateContentData && isViewingDetails) {
      setTemplateContent(templateContentData);
    }
  }, [templateContentData, isViewingDetails]);

  // Create MAP from template mutation (only for existing projects)
  const createMapMutation = useMutation({
    mutationFn: async (templateId: number) => {
      if (projectId <= 0) {
        throw new Error("Invalid project ID");
      }
      return apiRequest("POST", `/api/projects/${projectId}/map/from-template`, {
        templateId: templateId
      });
    },
    onSuccess: () => {
      toast({
        title: "MAP Created Successfully",
        description: "Your Mutual Action Plan has been created from the selected template.",
      });
      
      // Invalidate the MAP query to refetch with template information
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/map`] });
      
      onTemplateSelected();
      handleClose();
    },
    onError: (error: any) => {
      console.error("Error creating MAP:", error);
      showErrorToast(t('common.error'), error.message || t('projects.mapTemplateSelector.createMapFailed'));
    },
  });

  const handleClose = () => {
    setSelectedTemplateId(null);
    setSelectedTemplateDetails(null);
    setIsViewingDetails(false);
    onOpenChange(false);
  };

  const handleTemplateSelect = (templateId: number) => {
    setSelectedTemplateId(templateId);
  };

  const handleViewDetails = async () => {
    if (selectedTemplateId) {
      setIsViewingDetails(true);
    }
  };

  const handleBackToSelection = () => {
    setIsViewingDetails(false);
    setSelectedTemplateDetails(null);
    // Keep selectedTemplateId to maintain selection but force query refetch
  };

  const handleCreateMap = () => {
    if (selectedTemplateId) {
      // Check if this is project creation mode (projectId <= 0)
      if (projectId <= 0) {
        // Project creation mode - just select template and return data
        const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
        if (selectedTemplate) {
          // Prefer templateContentData (has task-level detail) for accurate
          // counts, fall back to selectedTemplateDetails (phases + steps only)
          // when the content endpoint hasn't returned yet. Task counts are
          // only available from the richer `MapTemplateContent` shape.
          const detailPhases = selectedTemplateDetails?.phases ?? [];
          const contentPhases = templateContentData?.phases ?? [];
          const phases = contentPhases.length > 0 ? contentPhases : detailPhases;
          const phaseCount = phases.length;
          const stepCount = phases.reduce(
            (total, phase) => total + (phase.steps?.length ?? 0),
            0,
          );
          const taskCount = contentPhases.reduce(
            (total, phase) =>
              total +
              (phase.steps ?? []).reduce(
                (stepTotal, step) => stepTotal + (step.tasks?.length ?? 0),
                0,
              ),
            0,
          );

          console.log('Template counts computed:', { phaseCount, stepCount, taskCount });

          onTemplateSelected({
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            description: selectedTemplate.description ?? undefined,
            phaseCount,
            stepCount,
            taskCount,
          });
        }
        handleClose();
      } else {
        // Existing project mode - create MAP directly
        createMapMutation.mutate(selectedTemplateId);
      }
    }
  };

  const activeTemplates = templates; // Show all templates since isActive field doesn't exist in schema

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartNetwork className="h-5 w-5 text-blue-600" />
            {isViewingDetails ? "Template Details" : "Select MAP Template"}
          </DialogTitle>
          <DialogDescription>
            {isViewingDetails 
              ? "Review the template structure before creating your MAP"
              : "Choose a template from the MAP Template Library to create your Mutual Action Plan from"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {isLoadingTemplates ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t('projects.mapTemplateSelector.loadingTemplates')}</span>
              </div>
            </div>
          ) : isViewingDetails ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {isLoadingDetails ? (
                <div className="flex items-center justify-center h-64">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>{t('projects.mapTemplateSelector.loadingTemplateDetails')}</span>
                  </div>
                </div>
              ) : selectedTemplateDetails ? (
                <div className="flex h-full min-h-0 flex-col gap-6 pr-4">
                  {/* Template Header */}
                  <Card className="shrink-0">
                    <CardHeader className="pb-2 pt-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <DynamicIcon name={selectedTemplateDetails.icon || 'Waypoints'} className="h-5 w-5 text-blue-600" />
                            {selectedTemplateDetails.name}
                          </CardTitle>
                          {selectedTemplateDetails.description && (
                            <CardDescription className="mt-1">
                              {selectedTemplateDetails.description}
                            </CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{selectedTemplateDetails.category}</Badge>
                          {selectedTemplateDetails.isDefault && (
                            <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                              Default
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-2 pb-3">
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <ClipboardPenLine className="h-4 w-4" />
                          <span>{(templateContent?.phases ?? selectedTemplateDetails.phases ?? []).length} Phases</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Boxes className="h-4 w-4" />
                          <span>
                            {templateContent 
                              ? templateContent.phases.reduce((total, phase) => total + (phase.steps?.length ?? 0), 0)
                              : '—'
                            } Steps
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <PackageCheck className="h-4 w-4" />
                          <span>
                            {templateContent 
                              ? templateContent.phases.reduce((total, phase) => 
                                  total + (phase.steps ?? []).reduce((stepTotal, step) => 
                                    stepTotal + (step.tasks?.length ?? 0), 0), 0)
                              : '—'
                            } Tasks
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Template Details Tabs */}
                  <div className="flex-1 min-h-0 flex flex-col">
                    <Tabs value={activeRightPanelTab} onValueChange={(value) => setActiveRightPanelTab(value as RightPanelTab)} className="flex-1 min-h-0 flex flex-col">
                      <TabsList className="shrink-0 grid w-full grid-cols-3">
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

                      <TabsContent value="overview" className="flex-1 min-h-0 overflow-hidden mt-4">
                        <ScrollArea className="h-full">
                          <div className="space-y-4">
                          {/* Row 1: Description and Visibility (2 columns) */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-sm font-medium">{t('common.description')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedTemplateDetails.description || "No description provided"}
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.visibility')}</Label>
                              <div className="flex items-center gap-2 mt-1">
                                {(() => {
                                  const VisibilityIcon = selectedTemplateDetails.visibility === 'public' ? Globe : 
                                    selectedTemplateDetails.visibility === 'internal' ? Users : Lock;
                                  return <VisibilityIcon className="h-4 w-4 text-muted-foreground" />;
                                })()}
                                <p className="text-sm text-muted-foreground">
                                  {selectedTemplateDetails.visibility.charAt(0).toUpperCase() + selectedTemplateDetails.visibility.slice(1)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Row 2: Created By, Created, Updated (3 columns) */}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.createdBy')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedTemplateDetails.createdByUser 
                                  ? (selectedTemplateDetails.createdByUser.firstName && selectedTemplateDetails.createdByUser.lastName
                                      ? `${selectedTemplateDetails.createdByUser.firstName} ${selectedTemplateDetails.createdByUser.lastName}`
                                      : selectedTemplateDetails.createdByUser.email)
                                  : "Unknown User"}
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">{t('common.created')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {new Date(selectedTemplateDetails.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.updated')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedTemplateDetails.updatedAt ? new Date(selectedTemplateDetails.updatedAt).toLocaleDateString() : "Never"}
                              </p>
                            </div>
                          </div>

                          {/* Row 3: Usage Count, Last Applied, Template ID (3 columns) */}
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.usageCount')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                0
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.lastApplied')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                Never
                              </p>
                            </div>
                            <div>
                              <Label className="text-sm font-medium">{t('projects.mapTemplateSelector.templateId')}</Label>
                              <p className="text-sm text-muted-foreground mt-1">
                                #{selectedTemplateDetails.id}
                              </p>
                            </div>
                          </div>
                          </div>
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="content" className="flex-1 min-h-0 overflow-hidden mt-4">
                        <ScrollArea className="h-full">
                          <MapTemplateContentDisplay 
                            templateContent={templateContent} 
                            showSummary={true}
                          />
                        </ScrollArea>
                      </TabsContent>

                      <TabsContent value="json" className="flex-1 min-h-0 overflow-hidden mt-4">
                        <ScrollArea className="h-full">
                          <pre className="text-xs bg-muted p-4 rounded overflow-x-auto">
                            {JSON.stringify({ template: selectedTemplateDetails, phases: selectedTemplateDetails.phases }, null, 2)}
                          </pre>
                        </ScrollArea>
                      </TabsContent>
                    </Tabs>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-280px)] max-h-[600px]">
              <div className="space-y-4 pr-4 pt-2">
                {activeTemplates.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('projects.mapTemplateSelector.noTemplatesAvailable')}</h3>
                    <p className="text-gray-500 dark:text-gray-400">
                      No active MAP templates are available. Contact your administrator to create templates.
                    </p>
                  </div>
                ) : (
                  <RadioGroup value={selectedTemplateId?.toString() || ""} onValueChange={(value) => handleTemplateSelect(parseInt(value))}>
                    {activeTemplates.map((template) => (
                      <div key={template.id} className="flex items-start space-x-3">
                        <RadioGroupItem value={template.id.toString()} id={`template-${template.id}`} className="mt-1 !border-black data-[state=checked]:!border-black data-[state=unchecked]:!border-black focus:!border-black hover:!border-black" />
                        <Label htmlFor={`template-${template.id}`} className="flex-1 cursor-pointer">
                          <Card className={cn(
                            "transition-colors",
                            selectedTemplateId === template.id ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-800"
                          )}>
                            <CardHeader className="pt-3 pb-2">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <DynamicIcon name={template.icon || 'Waypoints'} className="h-4 w-4 text-blue-600" />
                                    {template.name}
                                    {template.isDefault && (
                                      <Badge variant="outline" className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 text-xs">
                                        Default
                                      </Badge>
                                    )}
                                  </CardTitle>
                                  {template.description && (
                                    <CardDescription className="mt-1 text-xs">
                                      {template.description}
                                    </CardDescription>
                                  )}
                                </div>
                                <Badge className={cn("text-xs flex items-center gap-1", getScopeBadgeClass(template.scope))}>
                                  {(() => {
                                    const IconComponent = getScopeIcon(template.scope);
                                    return <IconComponent className="h-3 w-3" />;
                                  })()}
                                  {capitalizeScopeText(template.scope)}
                                </Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pt-0 pb-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                  <span>Created {new Date(template.createdAt).toLocaleDateString()}</span>
                                  {template.updatedAt && (
                                    <span>Updated {new Date(template.updatedAt).toLocaleDateString()}</span>
                                  )}
                                  {template.createdByUser && (
                                    <span>
                                      Created By {template.createdByUser.firstName && template.createdByUser.lastName 
                                        ? `${template.createdByUser.firstName} ${template.createdByUser.lastName}`
                                        : template.createdByUser.email}
                                    </span>
                                  )}
                                </div>
                                {selectedTemplateId === template.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      handleViewDetails();
                                    }}
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-auto p-1"
                                  >
                                    View Details
                                    <ChevronRight className="h-3 w-3 ml-1" />
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="!flex !flex-row !items-center !justify-between !space-x-0">
          <div className="flex items-center">
            {isViewingDetails && (
              <Button onClick={handleBackToSelection}>
                <ArrowBigLeft className="h-4 w-4 mr-2" />
                Back to Templates List
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {!isViewingDetails ? (
              <Button
                onClick={handleViewDetails}
                disabled={!selectedTemplateId}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Button>
            ) : (
              <Button
                onClick={handleCreateMap}
                disabled={!selectedTemplateId || createMapMutation.isPending}
              >
                {createMapMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating MAP...
                  </>
                ) : projectId <= 0 ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Select Template
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Create MAP
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}