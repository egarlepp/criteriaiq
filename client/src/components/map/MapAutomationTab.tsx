import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/lib/toast-helper";
import { 
  FolderGit2, 
  CheckCircle2, 
  CheckCircle,
  Clock,
  AlertTriangle,
  Save,
  RotateCcw,
  CircleArrowUp,
  XCircle,
  OctagonPause,
  Siren,
  Workflow,
  BrainCircuit,
  StepForward,
  SeparatorHorizontal,
  Users,
  UserCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  createdAt?: Date;
  updatedAt?: Date;
}

export function MapAutomationTab() {
  
  const queryClient = useQueryClient();

  // Fetch global automation config
  const { data: config, isLoading } = useQuery<MapAutomationConfig>({
    queryKey: ["/api/map-automation-config"],
  });

  // Local state for form
  const [formData, setFormData] = useState<Partial<MapAutomationConfig>>({});

  // Update form data when config loads
  useEffect(() => {
    if (config) {
      setFormData(config);
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: Partial<MapAutomationConfig>) => {
      const response = await fetch("/api/map-automation-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to update automation config");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/map-automation-config"] });
      showSuccessToast("Automation Settings Saved", "MAP automation rules have been updated successfully.");
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update automation settings");
    },
  });

  const handleSave = () => {
    // Exclude database-managed fields (id, timestamps, projectId)
    const { id, createdAt, updatedAt, projectId, ...updateData } = formData;
    updateMutation.mutate(updateData);
  };

  const handleReset = () => {
    if (config) {
      setFormData(config);
      showInfoToast("Changes Discarded", "Form has been reset to saved values.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading automation settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FolderGit2 className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-2xl">MAP Status Automation</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleReset} disabled={updateMutation.isPending}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-2" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
          <CardDescription>Configure global intelligent automation rules specifically for MAP workflows.</CardDescription>
        </CardHeader>
      </Card>

      {/* Auto-Completion Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-green-600" />
            <CardTitle className="text-2xl">Auto-Completion Rules</CardTitle>
          </div>
          <CardDescription>
            Automatically complete parent entities when child completion thresholds are met
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-complete Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-green-600" />
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Auto-complete Steps</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically mark Steps as "Complete" when task completion threshold is reached
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.autoCompleteStepsEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, autoCompleteStepsEnabled: checked })
                }
              />
            </div>
            
            {formData.autoCompleteStepsEnabled && (
              <div className="pl-4 border-l-2 border-green-200 dark:border-green-700 space-y-2">
                <Label className="text-sm font-medium">
                  Completion Threshold: {formData.autoCompleteStepsThreshold || 100}% of Tasks
                </Label>
                <Slider
                  value={[formData.autoCompleteStepsThreshold || 100]}
                  onValueChange={([value]) => 
                    setFormData({ ...formData, autoCompleteStepsThreshold: value })
                  }
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Step will be marked "Complete" when {formData.autoCompleteStepsThreshold || 100}% or more of its tasks are complete
                </p>
              </div>
            )}
          </div>

          <Separator />

          {/* Auto-complete Phases */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-green-600" />
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Auto-complete Phases</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically mark Phases as "Complete" when step completion threshold is reached
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.autoCompletePhasesEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, autoCompletePhasesEnabled: checked })
                }
              />
            </div>
            
            {formData.autoCompletePhasesEnabled && (
              <div className="pl-4 border-l-2 border-green-200 dark:border-green-700 space-y-2">
                <Label className="text-sm font-medium">
                  Completion Threshold: {formData.autoCompletePhasesThreshold || 100}% of Steps
                </Label>
                <Slider
                  value={[formData.autoCompletePhasesThreshold || 100]}
                  onValueChange={([value]) => 
                    setFormData({ ...formData, autoCompletePhasesThreshold: value })
                  }
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Phase will be marked "Complete" when {formData.autoCompletePhasesThreshold || 100}% or more of its steps are complete
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cascading Status Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <StepForward className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-2xl">Cascading Status Rules</CardTitle>
          </div>
          <CardDescription>
            Automatically propagate status changes from parent to child entities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Cascade Blocked */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Blocked"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is blocked</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeBlockedEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeBlockedEnabled: checked })
                }
              />
            </div>

            {/* Cascade At Risk */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Siren className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "At Risk"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is at risk</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeAtRiskEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeAtRiskEnabled: checked })
                }
              />
            </div>

            {/* Cascade Deferred */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <CircleArrowUp className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Deferred"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is deferred</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeDeferredEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeDeferredEnabled: checked })
                }
              />
            </div>

            {/* Cascade Stalled */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <OctagonPause className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Stalled"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is stalled</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeStalledEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeStalledEnabled: checked })
                }
              />
            </div>

            {/* Cascade Complete */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Complete"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is complete</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeCompleteEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeCompleteEnabled: checked })
                }
              />
            </div>

            {/* Cascade Not Started */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Not Started"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is not started</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeNotStartedEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeNotStartedEnabled: checked })
                }
              />
            </div>

            {/* Cascade Cancelled */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <XCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <Label className="font-medium">Cascade "Cancelled"</Label>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Update all children when parent is cancelled</p>
                </div>
              </div>
              <Switch
                checked={formData.cascadeCancelledEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, cascadeCancelledEnabled: checked })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Smart Triggers */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-yellow-600" />
            <CardTitle className="text-2xl">Smart Triggers</CardTitle>
          </div>
          <CardDescription>
            Intelligent automation based on entity state and progress
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto In Progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-yellow-600" />
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Auto "In Progress"</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automatically set parent to "In Progress" when first child entity starts
                </p>
              </div>
            </div>
            <Switch
              checked={formData.autoInProgressEnabled || false}
              onCheckedChange={(checked) => 
                setFormData({ ...formData, autoInProgressEnabled: checked })
              }
            />
          </div>

          <Separator />

          {/* Auto At Risk */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-yellow-600" />
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Auto "At Risk"</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically set parent to "At Risk" when blocked/stalled threshold is reached
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.autoAtRiskEnabled || false}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, autoAtRiskEnabled: checked })
                }
              />
            </div>
            
            {formData.autoAtRiskEnabled && (
              <div className="pl-4 border-l-2 border-purple-200 dark:border-purple-700 space-y-2">
                <Label className="text-sm font-medium">
                  Risk Threshold: {formData.autoAtRiskThreshold || 50}% Blocked/Stalled
                </Label>
                <Slider
                  value={[formData.autoAtRiskThreshold || 50]}
                  onValueChange={([value]) => 
                    setFormData({ ...formData, autoAtRiskThreshold: value })
                  }
                  min={0}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Parent will be marked "At Risk" when {formData.autoAtRiskThreshold || 50}% or more of children are blocked or stalled
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cascading Assignment Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <SeparatorHorizontal className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-2xl">Cascading Assignment Rules</CardTitle>
          </div>
          <CardDescription>
            Automatically propagate user and team assignments from parent entities to their children
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Team Owned Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
                  setFormData({ 
                    ...formData, 
                    cascadeTeamOwnedEnabled: checked,
                    cascadeTeamOwnedPhasesToSteps: checked ? true : formData.cascadeTeamOwnedPhasesToSteps,
                    cascadeTeamOwnedStepsToTasks: checked ? true : formData.cascadeTeamOwnedStepsToTasks
                  })
                }
              />
            </div>
            
            {formData.cascadeTeamOwnedEnabled && (
              <div className="pl-4 border-l-2 border-indigo-200 dark:border-indigo-700 space-y-3">
                <Label className="text-sm font-medium">Cascade Behavior</Label>
                <Select
                  value={formData.cascadeTeamOwnedBehavior || "only_empty"}
                  onValueChange={(value) => 
                    setFormData({ ...formData, cascadeTeamOwnedBehavior: value })
                  }
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
                        setFormData({ ...formData, cascadeTeamOwnedPhasesToSteps: !!checked })
                      }
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
                        setFormData({ ...formData, cascadeTeamOwnedStepsToTasks: !!checked })
                      }
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

          <Separator />

          {/* Customer User Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
                  setFormData({ 
                    ...formData, 
                    cascadeCustomerUserEnabled: checked,
                    cascadeCustomerUserPhasesToSteps: checked ? true : formData.cascadeCustomerUserPhasesToSteps,
                    cascadeCustomerUserStepsToTasks: checked ? true : formData.cascadeCustomerUserStepsToTasks
                  })
                }
              />
            </div>
            
            {formData.cascadeCustomerUserEnabled && (
              <div className="pl-4 border-l-2 border-blue-200 dark:border-blue-700 space-y-3">
                <Label className="text-sm font-medium">Cascade Behavior</Label>
                <Select
                  value={formData.cascadeCustomerUserBehavior || "only_empty"}
                  onValueChange={(value) => 
                    setFormData({ ...formData, cascadeCustomerUserBehavior: value })
                  }
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
                        setFormData({ ...formData, cascadeCustomerUserPhasesToSteps: !!checked })
                      }
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
                        setFormData({ ...formData, cascadeCustomerUserStepsToTasks: !!checked })
                      }
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

          <Separator />

          {/* Internal User Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
                  setFormData({ 
                    ...formData, 
                    cascadeInternalUserEnabled: checked,
                    cascadeInternalUserPhasesToSteps: checked ? true : formData.cascadeInternalUserPhasesToSteps,
                    cascadeInternalUserStepsToTasks: checked ? true : formData.cascadeInternalUserStepsToTasks
                  })
                }
              />
            </div>
            
            {formData.cascadeInternalUserEnabled && (
              <div className="pl-4 border-l-2 border-green-200 dark:border-green-700 space-y-3">
                <Label className="text-sm font-medium">Cascade Behavior</Label>
                <Select
                  value={formData.cascadeInternalUserBehavior || "only_empty"}
                  onValueChange={(value) => 
                    setFormData({ ...formData, cascadeInternalUserBehavior: value })
                  }
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
                        setFormData({ ...formData, cascadeInternalUserPhasesToSteps: !!checked })
                      }
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
                        setFormData({ ...formData, cascadeInternalUserStepsToTasks: !!checked })
                      }
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

          <Separator />

          {/* Additional Internal User Assignment */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
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
                  setFormData({ 
                    ...formData, 
                    cascadeAdditionalInternalEnabled: checked,
                    cascadeAdditionalInternalPhasesToSteps: checked ? true : formData.cascadeAdditionalInternalPhasesToSteps,
                    cascadeAdditionalInternalStepsToTasks: checked ? true : formData.cascadeAdditionalInternalStepsToTasks
                  })
                }
              />
            </div>
            
            {formData.cascadeAdditionalInternalEnabled && (
              <div className="pl-4 border-l-2 border-purple-200 dark:border-purple-700 space-y-3">
                <Label className="text-sm font-medium">Cascade Behavior</Label>
                <Select
                  value={formData.cascadeAdditionalInternalBehavior || "only_empty"}
                  onValueChange={(value) => 
                    setFormData({ ...formData, cascadeAdditionalInternalBehavior: value })
                  }
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
                        setFormData({ ...formData, cascadeAdditionalInternalPhasesToSteps: !!checked })
                      }
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
                        setFormData({ ...formData, cascadeAdditionalInternalStepsToTasks: !!checked })
                      }
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
      </Card>

      {/* Info Banner */}
      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
              <FolderGit2 className="h-4 w-4 text-blue-600" />
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">How Automation Works</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li><strong>Auto-Completion:</strong> When enabled, Steps/Phases automatically complete when their child completion percentage meets the threshold</li>
                <li><strong>Cascading Status:</strong> When enabled, changing a Phase or Step status will update all child entities to match</li>
                <li><strong>Cascading Assignments:</strong> When enabled, user and team assignments automatically flow from Phases to Steps to Tasks based on behavior settings</li>
                <li><strong>Manual Override Protection:</strong> "Skip Assigned" behavior protects manually-set child assignments from being overwritten by parent cascades</li>
                <li><strong>Smart Triggers:</strong> Intelligently update parent status based on child entity states and progress</li>
                <li><strong>Real-time Updates:</strong> All automation triggers broadcast via WebSocket for instant UI updates</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
