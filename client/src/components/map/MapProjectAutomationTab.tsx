import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import {
  CheckCircle2,
  CheckCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  OctagonPause,
  Siren,
  XCircle,
  CircleArrowUp,
  Settings,
  Zap,
  ArrowUpRight,
  RotateCcw,
  BrainCircuit,
  Workflow,
  StepForward,
  FolderGit2,
  ChevronDown,
  ChevronUp,
  SeparatorHorizontal,
  Users,
  UserCircle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface MapAutomationConfig {
  id: number;
  projectId: number | null;
  autoCompleteStepsEnabled: boolean;
  autoCompleteStepsThreshold: number;
  autoCompletePhasesEnabled: boolean;
  autoCompletePhasesThreshold: number;
  cascadeBlockedEnabled: boolean;
  cascadeAtRiskEnabled: boolean;
  cascadeDeferredEnabled: boolean;
  cascadeStalledEnabled: boolean;
  cascadeCompleteEnabled: boolean;
  cascadeNotStartedEnabled: boolean;
  cascadeCancelledEnabled: boolean;
  autoInProgressEnabled: boolean;
  autoAtRiskEnabled: boolean;
  autoAtRiskThreshold: number;
  cascadeTeamOwnedEnabled: boolean;
  cascadeTeamOwnedBehavior: string;
  cascadeTeamOwnedPhasesToSteps: boolean;
  cascadeTeamOwnedStepsToTasks: boolean;
  cascadeCustomerUserEnabled: boolean;
  cascadeCustomerUserBehavior: string;
  cascadeCustomerUserPhasesToSteps: boolean;
  cascadeCustomerUserStepsToTasks: boolean;
  cascadeInternalUserEnabled: boolean;
  cascadeInternalUserBehavior: string;
  cascadeInternalUserPhasesToSteps: boolean;
  cascadeInternalUserStepsToTasks: boolean;
  cascadeAdditionalInternalEnabled: boolean;
  cascadeAdditionalInternalBehavior: string;
  cascadeAdditionalInternalPhasesToSteps: boolean;
  cascadeAdditionalInternalStepsToTasks: boolean;
  createdAt: string;
  updatedAt: string;
  _metadata?: {
    isProjectSpecific: boolean;
    source: 'project' | 'global';
  };
}

interface MapProjectAutomationTabProps {
  projectId: number;
  accessLevel: 'view' | 'edit';
}

export function MapProjectAutomationTab({ projectId, accessLevel }: MapProjectAutomationTabProps) {
  
  const queryClient = useQueryClient();
  
  const [useProjectSpecific, setUseProjectSpecific] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [formData, setFormData] = useState<Partial<MapAutomationConfig>>({});
  const [isAutoCompletionOpen, setIsAutoCompletionOpen] = useState(true);
  const [isCascadingOpen, setIsCascadingOpen] = useState(true);
  const [isCascadingAssignmentsOpen, setIsCascadingAssignmentsOpen] = useState(true);

  // Fetch project automation config
  const { data: config, isLoading } = useQuery<MapAutomationConfig>({
    queryKey: ['/api/projects', projectId, 'map-automation-config'],
    queryFn: async () => {
      const response = await fetch(`/api/projects/${projectId}/map-automation-config`);
      if (!response.ok) throw new Error('Failed to fetch automation config');
      return response.json();
    },
  });

  // Fetch global automation config for comparison
  const { data: globalConfig } = useQuery<MapAutomationConfig>({
    queryKey: ['/api/map-automation-config'],
  });

  // Initialize form data when config loads
  useEffect(() => {
    if (config) {
      setFormData(config);
      setUseProjectSpecific(config._metadata?.isProjectSpecific || false);
    }
  }, [config]);

  // Auto-disable Team Owned cascade when both direction flags are false
  useEffect(() => {
    if (formData.cascadeTeamOwnedEnabled && 
        !formData.cascadeTeamOwnedPhasesToSteps && 
        !formData.cascadeTeamOwnedStepsToTasks) {
      setFormData({ ...formData, cascadeTeamOwnedEnabled: false });
    }
  }, [formData.cascadeTeamOwnedPhasesToSteps, formData.cascadeTeamOwnedStepsToTasks]);

  // Auto-disable Customer User cascade when both direction flags are false
  useEffect(() => {
    if (formData.cascadeCustomerUserEnabled && 
        !formData.cascadeCustomerUserPhasesToSteps && 
        !formData.cascadeCustomerUserStepsToTasks) {
      setFormData({ ...formData, cascadeCustomerUserEnabled: false });
    }
  }, [formData.cascadeCustomerUserPhasesToSteps, formData.cascadeCustomerUserStepsToTasks]);

  // Auto-disable Internal User cascade when both direction flags are false
  useEffect(() => {
    if (formData.cascadeInternalUserEnabled && 
        !formData.cascadeInternalUserPhasesToSteps && 
        !formData.cascadeInternalUserStepsToTasks) {
      setFormData({ ...formData, cascadeInternalUserEnabled: false });
    }
  }, [formData.cascadeInternalUserPhasesToSteps, formData.cascadeInternalUserStepsToTasks]);

  // Auto-disable Additional Internal cascade when both direction flags are false
  useEffect(() => {
    if (formData.cascadeAdditionalInternalEnabled && 
        !formData.cascadeAdditionalInternalPhasesToSteps && 
        !formData.cascadeAdditionalInternalStepsToTasks) {
      setFormData({ ...formData, cascadeAdditionalInternalEnabled: false });
    }
  }, [formData.cascadeAdditionalInternalPhasesToSteps, formData.cascadeAdditionalInternalStepsToTasks]);

  // Track changes
  useEffect(() => {
    if (!config) return;
    
    const hasFormChanges = 
      formData.autoCompleteStepsEnabled !== config.autoCompleteStepsEnabled ||
      formData.autoCompleteStepsThreshold !== config.autoCompleteStepsThreshold ||
      formData.autoCompletePhasesEnabled !== config.autoCompletePhasesEnabled ||
      formData.autoCompletePhasesThreshold !== config.autoCompletePhasesThreshold ||
      formData.cascadeBlockedEnabled !== config.cascadeBlockedEnabled ||
      formData.cascadeAtRiskEnabled !== config.cascadeAtRiskEnabled ||
      formData.cascadeDeferredEnabled !== config.cascadeDeferredEnabled ||
      formData.cascadeStalledEnabled !== config.cascadeStalledEnabled ||
      formData.cascadeCompleteEnabled !== config.cascadeCompleteEnabled ||
      formData.cascadeNotStartedEnabled !== config.cascadeNotStartedEnabled ||
      formData.cascadeCancelledEnabled !== config.cascadeCancelledEnabled ||
      formData.autoInProgressEnabled !== config.autoInProgressEnabled ||
      formData.autoAtRiskEnabled !== config.autoAtRiskEnabled ||
      formData.autoAtRiskThreshold !== config.autoAtRiskThreshold ||
      formData.cascadeTeamOwnedEnabled !== config.cascadeTeamOwnedEnabled ||
      formData.cascadeTeamOwnedBehavior !== config.cascadeTeamOwnedBehavior ||
      formData.cascadeTeamOwnedPhasesToSteps !== config.cascadeTeamOwnedPhasesToSteps ||
      formData.cascadeTeamOwnedStepsToTasks !== config.cascadeTeamOwnedStepsToTasks ||
      formData.cascadeCustomerUserEnabled !== config.cascadeCustomerUserEnabled ||
      formData.cascadeCustomerUserBehavior !== config.cascadeCustomerUserBehavior ||
      formData.cascadeCustomerUserPhasesToSteps !== config.cascadeCustomerUserPhasesToSteps ||
      formData.cascadeCustomerUserStepsToTasks !== config.cascadeCustomerUserStepsToTasks ||
      formData.cascadeInternalUserEnabled !== config.cascadeInternalUserEnabled ||
      formData.cascadeInternalUserBehavior !== config.cascadeInternalUserBehavior ||
      formData.cascadeInternalUserPhasesToSteps !== config.cascadeInternalUserPhasesToSteps ||
      formData.cascadeInternalUserStepsToTasks !== config.cascadeInternalUserStepsToTasks ||
      formData.cascadeAdditionalInternalEnabled !== config.cascadeAdditionalInternalEnabled ||
      formData.cascadeAdditionalInternalBehavior !== config.cascadeAdditionalInternalBehavior ||
      formData.cascadeAdditionalInternalPhasesToSteps !== config.cascadeAdditionalInternalPhasesToSteps ||
      formData.cascadeAdditionalInternalStepsToTasks !== config.cascadeAdditionalInternalStepsToTasks;
    
    const hasToggleChange = useProjectSpecific !== (config._metadata?.isProjectSpecific || false);
    
    setHasChanges(hasFormChanges || hasToggleChange);
  }, [formData, useProjectSpecific, config]);

  // Helper function to check if a field is overridden
  const isFieldOverridden = (field: keyof MapAutomationConfig): boolean => {
    if (!globalConfig || !config || !config._metadata?.isProjectSpecific) return false;
    return config[field] !== globalConfig[field];
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (useProjectSpecific) {
        // Save project-specific config
        const response = await fetch(`/api/projects/${projectId}/map-automation-config`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            autoCompleteStepsEnabled: formData.autoCompleteStepsEnabled,
            autoCompleteStepsThreshold: formData.autoCompleteStepsThreshold,
            autoCompletePhasesEnabled: formData.autoCompletePhasesEnabled,
            autoCompletePhasesThreshold: formData.autoCompletePhasesThreshold,
            cascadeBlockedEnabled: formData.cascadeBlockedEnabled,
            cascadeAtRiskEnabled: formData.cascadeAtRiskEnabled,
            cascadeDeferredEnabled: formData.cascadeDeferredEnabled,
            cascadeStalledEnabled: formData.cascadeStalledEnabled,
            cascadeCompleteEnabled: formData.cascadeCompleteEnabled,
            cascadeNotStartedEnabled: formData.cascadeNotStartedEnabled,
            cascadeCancelledEnabled: formData.cascadeCancelledEnabled,
            autoInProgressEnabled: formData.autoInProgressEnabled,
            autoAtRiskEnabled: formData.autoAtRiskEnabled,
            autoAtRiskThreshold: formData.autoAtRiskThreshold,
            cascadeTeamOwnedEnabled: formData.cascadeTeamOwnedEnabled,
            cascadeTeamOwnedBehavior: formData.cascadeTeamOwnedBehavior,
            cascadeTeamOwnedPhasesToSteps: formData.cascadeTeamOwnedPhasesToSteps,
            cascadeTeamOwnedStepsToTasks: formData.cascadeTeamOwnedStepsToTasks,
            cascadeCustomerUserEnabled: formData.cascadeCustomerUserEnabled,
            cascadeCustomerUserBehavior: formData.cascadeCustomerUserBehavior,
            cascadeCustomerUserPhasesToSteps: formData.cascadeCustomerUserPhasesToSteps,
            cascadeCustomerUserStepsToTasks: formData.cascadeCustomerUserStepsToTasks,
            cascadeInternalUserEnabled: formData.cascadeInternalUserEnabled,
            cascadeInternalUserBehavior: formData.cascadeInternalUserBehavior,
            cascadeInternalUserPhasesToSteps: formData.cascadeInternalUserPhasesToSteps,
            cascadeInternalUserStepsToTasks: formData.cascadeInternalUserStepsToTasks,
            cascadeAdditionalInternalEnabled: formData.cascadeAdditionalInternalEnabled,
            cascadeAdditionalInternalBehavior: formData.cascadeAdditionalInternalBehavior,
            cascadeAdditionalInternalPhasesToSteps: formData.cascadeAdditionalInternalPhasesToSteps,
            cascadeAdditionalInternalStepsToTasks: formData.cascadeAdditionalInternalStepsToTasks,
          }),
        });
        if (!response.ok) throw new Error('Failed to save automation config');
        return response.json();
      } else {
        // Delete project-specific config (revert to global)
        const response = await fetch(`/api/projects/${projectId}/map-automation-config`, {
          method: 'DELETE',
        });
        if (!response.ok && response.status !== 404) throw new Error('Failed to reset to global config');
        
        // Fetch the global config
        const globalResponse = await fetch(`/api/projects/${projectId}/map-automation-config`);
        if (!globalResponse.ok) throw new Error('Failed to fetch global config');
        return globalResponse.json();
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/projects', projectId, 'map-automation-config'] });
      setFormData(data);
      setUseProjectSpecific(data._metadata?.isProjectSpecific || false);
      setHasChanges(false);
      showSuccessToast("Automation Settings Saved", useProjectSpecific 
          ? "Project-specific automation rules have been saved."
          : "Reverted to global automation defaults.");
    },
    onError: (error) => {
      showErrorToast("Save Failed", error instanceof Error ? error.message : "Failed to save automation settings");
    },
  });

  const handleCancel = () => {
    if (config) {
      setFormData(config);
      setUseProjectSpecific(config._metadata?.isProjectSpecific || false);
      setHasChanges(false);
    }
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const updateField = <K extends keyof MapAutomationConfig>(
    field: K,
    value: MapAutomationConfig[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">Loading automation settings...</div>
      </div>
    );
  }

  const isCustomized = config?._metadata?.isProjectSpecific || false;
  const canEdit = accessLevel === 'edit';
  const isDisabled = !canEdit || (!useProjectSpecific && !hasChanges);

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderGit2 className="h-5 w-5" />
              Automation Settings
            </CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30"
                    onClick={() => {
                      window.location.href = '/admin?tab=workflow-automation&subtab=map-automation';
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Go to Global Settings</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <CardDescription>
            Configure auto-completion and cascading rules for this project
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Status Indicator */}
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  {isCustomized ? (
                    <>
                      <Zap className="h-4 w-4 text-purple-600" />
                      <span className="font-medium">Using Project-Specific Rules</span>
                    </>
                  ) : (
                    <>
                      <ArrowUpRight className="h-4 w-4 text-blue-600" />
                      <span className="font-medium">Using Global Defaults</span>
                    </>
                  )}
                </div>
                <Badge 
                  variant="outline" 
                  className={isCustomized 
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                    : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                  }
                >
                  {isCustomized ? 'Custom' : 'Inherited'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Customize for this project</span>
                <Switch
                  checked={useProjectSpecific}
                  onCheckedChange={setUseProjectSpecific}
                  disabled={!canEdit}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </div>

            {/* Action Buttons */}
            {hasChanges && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={saveMutation.isPending}
                >
                  Cancel
                </Button>
                {!useProjectSpecific && isCustomized && (
                  <div className="flex items-center gap-2 text-sm text-amber-600">
                    <RotateCcw className="h-4 w-4" />
                    <span>Click Save to reset to global defaults</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Completion Rules */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Workflow className="h-5 w-5 text-green-600" />
                Auto-Completion Rules
              </CardTitle>
              <CardDescription>
                Automatically mark steps and phases as completed based on completion thresholds
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAutoCompletionOpen(!isAutoCompletionOpen)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {isAutoCompletionOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isAutoCompletionOpen && (
          <CardContent className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {/* Steps Auto-Completion */}
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-green-600" />
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Auto-Complete Steps</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically complete steps when task completion threshold is reached
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.autoCompleteStepsEnabled || false}
                onCheckedChange={(checked) => updateField('autoCompleteStepsEnabled', checked)}
                disabled={isDisabled}
                className={isFieldOverridden('autoCompleteStepsEnabled') 
                  ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                  : "shrink-0 data-[state=checked]:bg-primary"}
              />
            </div>
            {formData.autoCompleteStepsEnabled && (
              <div className="pl-4 space-y-2">
                <Label className="text-xs">Completion Threshold (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.autoCompleteStepsThreshold || 100}
                  onChange={(e) => updateField('autoCompleteStepsThreshold', parseInt(e.target.value))}
                  disabled={isDisabled}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Complete step when {formData.autoCompleteStepsThreshold}% of tasks are completed
                </p>
              </div>
            )}
          </div>


          {/* Phases Auto-Completion */}
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-4 w-4 text-green-600" />
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Auto-Complete Phases</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically complete phases when step completion threshold is reached
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.autoCompletePhasesEnabled || false}
                onCheckedChange={(checked) => updateField('autoCompletePhasesEnabled', checked)}
                disabled={isDisabled}
                className={isFieldOverridden('autoCompletePhasesEnabled') 
                  ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                  : "shrink-0 data-[state=checked]:bg-primary"}
              />
            </div>
            {formData.autoCompletePhasesEnabled && (
              <div className="pl-4 space-y-2">
                <Label className="text-xs">Completion Threshold (%)</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={formData.autoCompletePhasesThreshold || 100}
                  onChange={(e) => updateField('autoCompletePhasesThreshold', parseInt(e.target.value))}
                  disabled={isDisabled}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Complete phase when {formData.autoCompletePhasesThreshold}% of steps are completed
                </p>
              </div>
            )}
          </div>
          </CardContent>
        )}
      </Card>

      {/* Cascading Status Rules */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <StepForward className="h-5 w-5 text-blue-600" />
                Cascading Status Rules
              </CardTitle>
              <CardDescription>
                Automatically propagate status changes from parent to child entities
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCascadingOpen(!isCascadingOpen)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {isCascadingOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isCascadingOpen && (
          <CardContent className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {/* Blocked Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <XCircle className="h-4 w-4 text-red-600" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Blocked" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is blocked, mark all children as blocked
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeBlockedEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeBlockedEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeBlockedEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* At Risk Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <Siren className="h-4 w-4 text-orange-600" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "At Risk" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is at risk, mark all children as at risk
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeAtRiskEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeAtRiskEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeAtRiskEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* Deferred Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <CircleArrowUp className="h-4 w-4 text-yellow-600" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Deferred" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is deferred, mark all children as deferred
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeDeferredEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeDeferredEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeDeferredEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* Stalled Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <OctagonPause className="h-4 w-4 text-purple-600" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Stalled" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is stalled, mark all children as stalled
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeStalledEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeStalledEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeStalledEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* Complete Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Complete" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is complete, mark all children as complete
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeCompleteEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeCompleteEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeCompleteEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* Not Started Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Not Started" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is not started, mark all children as not started
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeNotStartedEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeNotStartedEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeNotStartedEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>


          {/* Cancelled Status Cascade */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
            <div className="flex items-center gap-3">
              <XCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
              <div className="space-y-1">
                <Label className="text-sm font-medium">Cascade "Cancelled" Status</Label>
                <p className="text-xs text-muted-foreground">
                  When a phase/step is cancelled, mark all children as cancelled
                </p>
              </div>
            </div>
            <Switch
              checked={formData.cascadeCancelledEnabled || false}
              onCheckedChange={(checked) => updateField('cascadeCancelledEnabled', checked)}
              disabled={isDisabled}
              className={isFieldOverridden('cascadeCancelledEnabled') 
                ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                : "shrink-0 data-[state=checked]:bg-primary"}
            />
          </div>
          </CardContent>
        )}
      </Card>

      {/* Cascading Assignment Rules */}
      <Card className="bg-white dark:bg-gray-900">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <SeparatorHorizontal className="h-5 w-5 text-indigo-600" />
                Cascading Assignment Rules
              </CardTitle>
              <CardDescription>
                Automatically propagate user and team assignments from parent entities to their children
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCascadingAssignmentsOpen(!isCascadingAssignmentsOpen)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {isCascadingAssignmentsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>
        {isCascadingAssignmentsOpen && (
          <CardContent className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
            {/* Team Owned Assignment */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                    <Users className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Cascade Team Owned</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Automatically assign team from Phases to Steps and Tasks</p>
                  </div>
                </div>
                <Switch
                  checked={formData.cascadeTeamOwnedEnabled || false}
                  onCheckedChange={(checked) => 
                    updateField('cascadeTeamOwnedEnabled', checked)
                  }
                  disabled={isDisabled}
                  className={isFieldOverridden('cascadeTeamOwnedEnabled') 
                    ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                    : "shrink-0 data-[state=checked]:bg-primary"}
                />
              </div>
              
              {formData.cascadeTeamOwnedEnabled && (
                <div className="pl-4 border-l-2 border-indigo-200 dark:border-indigo-800 space-y-3">
                  <Label className="text-sm font-medium">Cascade Behavior</Label>
                  <Select
                    value={formData.cascadeTeamOwnedBehavior || "only_empty"}
                    onValueChange={(value) => 
                      updateField('cascadeTeamOwnedBehavior', value)
                    }
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overwrite_all">Overwrite All - Replace all child assignments</SelectItem>
                      <SelectItem value="only_empty">Only Empty - Only assign if child has no assignment</SelectItem>
                      <SelectItem value="skip_assigned">Skip Assigned - Skip if manually assigned (override protection)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formData.cascadeTeamOwnedBehavior === "overwrite_all" && "All child teams will be updated to match parent, regardless of current value"}
                    {formData.cascadeTeamOwnedBehavior === "only_empty" && "Only children with no team assignment will inherit from parent"}
                    {formData.cascadeTeamOwnedBehavior === "skip_assigned" && "Children with manual assignments will keep their values (protected from cascading)"}
                  </p>
                  
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm font-medium">Cascade Direction</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeTeamOwnedPhasesToSteps"
                        checked={formData.cascadeTeamOwnedPhasesToSteps || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeTeamOwnedPhasesToSteps', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeTeamOwnedPhasesToSteps"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Phases to Steps
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeTeamOwnedStepsToTasks"
                        checked={formData.cascadeTeamOwnedStepsToTasks || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeTeamOwnedStepsToTasks', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeTeamOwnedStepsToTasks"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Steps to Tasks
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {/* Customer User Assignment */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <UserCircle className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Cascade Customer User</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Automatically assign customer user from Phases to Steps and Tasks</p>
                  </div>
                </div>
                <Switch
                  checked={formData.cascadeCustomerUserEnabled || false}
                  onCheckedChange={(checked) => 
                    updateField('cascadeCustomerUserEnabled', checked)
                  }
                  disabled={isDisabled}
                  className={isFieldOverridden('cascadeCustomerUserEnabled') 
                    ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                    : "shrink-0 data-[state=checked]:bg-primary"}
                />
              </div>
              
              {formData.cascadeCustomerUserEnabled && (
                <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-800 space-y-3">
                  <Label className="text-sm font-medium">Cascade Behavior</Label>
                  <Select
                    value={formData.cascadeCustomerUserBehavior || "only_empty"}
                    onValueChange={(value) => 
                      updateField('cascadeCustomerUserBehavior', value)
                    }
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overwrite_all">Overwrite All - Replace all child assignments</SelectItem>
                      <SelectItem value="only_empty">Only Empty - Only assign if child has no assignment</SelectItem>
                      <SelectItem value="skip_assigned">Skip Assigned - Skip if manually assigned (override protection)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formData.cascadeCustomerUserBehavior === "overwrite_all" && "All child customer users will be updated to match parent"}
                    {formData.cascadeCustomerUserBehavior === "only_empty" && "Only children with no customer user will inherit from parent"}
                    {formData.cascadeCustomerUserBehavior === "skip_assigned" && "Children with manual assignments will keep their values"}
                  </p>
                  
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm font-medium">Cascade Direction</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeCustomerUserPhasesToSteps"
                        checked={formData.cascadeCustomerUserPhasesToSteps || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeCustomerUserPhasesToSteps', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeCustomerUserPhasesToSteps"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Phases to Steps
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeCustomerUserStepsToTasks"
                        checked={formData.cascadeCustomerUserStepsToTasks || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeCustomerUserStepsToTasks', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeCustomerUserStepsToTasks"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Steps to Tasks
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {/* Internal User Assignment */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <UserCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Cascade Internal User</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Automatically assign primary Internal user from Phases to Steps and Tasks</p>
                  </div>
                </div>
                <Switch
                  checked={formData.cascadeInternalUserEnabled || false}
                  onCheckedChange={(checked) => 
                    updateField('cascadeInternalUserEnabled', checked)
                  }
                  disabled={isDisabled}
                  className={isFieldOverridden('cascadeInternalUserEnabled') 
                    ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                    : "shrink-0 data-[state=checked]:bg-primary"}
                />
              </div>
              
              {formData.cascadeInternalUserEnabled && (
                <div className="pl-4 border-l-2 border-green-200 dark:border-green-800 space-y-3">
                  <Label className="text-sm font-medium">Cascade Behavior</Label>
                  <Select
                    value={formData.cascadeInternalUserBehavior || "only_empty"}
                    onValueChange={(value) => 
                      updateField('cascadeInternalUserBehavior', value)
                    }
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overwrite_all">Overwrite All - Replace all child assignments</SelectItem>
                      <SelectItem value="only_empty">Only Empty - Only assign if child has no assignment</SelectItem>
                      <SelectItem value="skip_assigned">Skip Assigned - Skip if manually assigned (override protection)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formData.cascadeInternalUserBehavior === "overwrite_all" && "All child Internal users will be updated to match parent"}
                    {formData.cascadeInternalUserBehavior === "only_empty" && "Only children with no Internal user will inherit from parent"}
                    {formData.cascadeInternalUserBehavior === "skip_assigned" && "Children with manual assignments will keep their values"}
                  </p>
                  
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm font-medium">Cascade Direction</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeInternalUserPhasesToSteps"
                        checked={formData.cascadeInternalUserPhasesToSteps || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeInternalUserPhasesToSteps', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeInternalUserPhasesToSteps"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Phases to Steps
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeInternalUserStepsToTasks"
                        checked={formData.cascadeInternalUserStepsToTasks || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeInternalUserStepsToTasks', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeInternalUserStepsToTasks"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Steps to Tasks
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>


            {/* Additional Internal User Assignment */}
            <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/40">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <UserCircle className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <Label className="text-base font-medium">Cascade Additional Internal User</Label>
                    <p className="text-xs text-gray-600 dark:text-gray-400">Automatically assign additional Internal user from Phases to Steps and Tasks</p>
                  </div>
                </div>
                <Switch
                  checked={formData.cascadeAdditionalInternalEnabled || false}
                  onCheckedChange={(checked) => 
                    updateField('cascadeAdditionalInternalEnabled', checked)
                  }
                  disabled={isDisabled}
                  className={isFieldOverridden('cascadeAdditionalInternalEnabled') 
                    ? "shrink-0 data-[state=checked]:bg-orange-600 dark:data-[state=checked]:bg-orange-700" 
                    : "shrink-0 data-[state=checked]:bg-primary"}
                />
              </div>
              
              {formData.cascadeAdditionalInternalEnabled && (
                <div className="pl-4 border-l-2 border-purple-200 dark:border-purple-800 space-y-3">
                  <Label className="text-sm font-medium">Cascade Behavior</Label>
                  <Select
                    value={formData.cascadeAdditionalInternalBehavior || "only_empty"}
                    onValueChange={(value) => 
                      updateField('cascadeAdditionalInternalBehavior', value)
                    }
                    disabled={isDisabled}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overwrite_all">Overwrite All - Replace all child assignments</SelectItem>
                      <SelectItem value="only_empty">Only Empty - Only assign if child has no assignment</SelectItem>
                      <SelectItem value="skip_assigned">Skip Assigned - Skip if manually assigned (override protection)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formData.cascadeAdditionalInternalBehavior === "overwrite_all" && "All child additional Internal users will be updated to match parent"}
                    {formData.cascadeAdditionalInternalBehavior === "only_empty" && "Only children with no additional Internal user will inherit from parent"}
                    {formData.cascadeAdditionalInternalBehavior === "skip_assigned" && "Children with manual assignments will keep their values"}
                  </p>
                  
                  <div className="space-y-2 pt-2">
                    <Label className="text-sm font-medium">Cascade Direction</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeAdditionalInternalPhasesToSteps"
                        checked={formData.cascadeAdditionalInternalPhasesToSteps || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeAdditionalInternalPhasesToSteps', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeAdditionalInternalPhasesToSteps"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Phases to Steps
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="cascadeAdditionalInternalStepsToTasks"
                        checked={formData.cascadeAdditionalInternalStepsToTasks || false}
                        onCheckedChange={(checked) =>
                          updateField('cascadeAdditionalInternalStepsToTasks', !!checked)
                        }
                        disabled={isDisabled}
                      />
                      <Label
                        htmlFor="cascadeAdditionalInternalStepsToTasks"
                        className="text-sm font-normal cursor-pointer"
                      >
                        Cascade from Steps to Tasks
                      </Label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
