import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  ChartNetwork, 
  Save, 
  X, 
  Target,
  Boxes, 
  Users, 
  Building2, 
  Folder,
  ClipboardPenLine, 
  Globe,
  Lock,
  Eye,
  Star,
  Clock,
  Calendar,
  CheckSquare,
  PackageCheck,
  BadgeInfo,
  BarChart3,
  User as UserIcon,
  Waypoints
} from 'lucide-react';
import { cn } from '@/lib/utils';
import MapTemplateTreeEditor, {
  type MapTemplatePhaseWithChildren,
  type MapTemplateStepWithChildren,
} from './MapTemplateTreeEditor';
import { LucideIconPicker } from '@/components/ui/lucide-icon-picker';
import type {
  MapTemplate,
  MapTemplatePhase,
  MapTemplateStep,
  MapTemplateTask,
  User
} from '@shared/schema';

// Extended types for template with joined user data
interface MapTemplateWithUser extends Omit<MapTemplate, 'isActive' | 'isSystem'> {
  createdByUser?: User | null;
  updatedByUser?: User | null;
  isActive?: boolean;
  isSystem?: boolean;
}

interface Customer {
  id: number;
  accountName: string;
  industry: string;
}

interface Product {
  id: number;
  name: string;
  description: string;
}

interface MapTemplateSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: MapTemplateWithUser | null; // null for create, MapTemplateWithUser for edit
  onSave: () => void;
}

// Scope options with icons
const SCOPE_OPTIONS = [
  { value: 'default', label: 'Default', icon: Star, description: 'Base MAP (scope-agnostic)' },
  { value: 'project', label: 'Project', icon: Folder, description: 'General project scope' },
  { value: 'application', label: 'Application', icon: Target, description: 'Specific application/solution scope' },
  { value: 'customer', label: 'Customer', icon: Building2, description: 'Customer-specific scope' },
  { value: 'partner', label: 'Partner', icon: Users, description: 'Partner collaboration scope' }
];

// Visibility options with icons
const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', icon: Lock, description: 'Only visible to creator' },
  { value: 'internal', label: 'Internal', icon: Users, description: 'Visible to organization members' },
  { value: 'public', label: 'Public', icon: Globe, description: 'Visible to all users' }
];

export default function MapTemplateSheet({ open, onOpenChange, template, onSave }: MapTemplateSheetProps) {
  const { user } = useAuth();
  
  
  const isAdmin = user?.role === 'Admin';

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'Waypoints',
    scope: 'project',
    visibility: 'private',
    solutionIds: [] as number[],
    customerId: undefined as number | undefined,
    isActive: true,
    isSystem: false,
  });
  
  // Tree editor state
  const [phases, setPhases] = useState<MapTemplatePhaseWithChildren[]>([]);
  const [hasTreeValidationErrors, setHasTreeValidationErrors] = useState(false);
  
  // External data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load external data
  useEffect(() => {
    if (open) {
      loadExternalData();
    }
  }, [open]);

  // Load template data for editing
  useEffect(() => {
    if (template && open) {
      setFormData({
        name: template.name,
        description: template.description || '',
        icon: template.icon || 'Waypoints',
        scope: template.scope,
        visibility: template.visibility,
        solutionIds: (template.solutionIds as number[]) || [],
        customerId: template.customerId || undefined,
        isActive: template.isActive !== false,
        isSystem: template.isSystem === true,
      });
      loadTemplateContent(template.id);
    } else if (!template && open) {
      // Reset for create mode
      setFormData({
        name: '',
        description: '',
        icon: 'Waypoints',
        scope: 'project',
        visibility: 'private',
        solutionIds: [],
        customerId: undefined,
        isActive: true,
        isSystem: false,
      });
      setPhases([]);
    }
  }, [template, open]);

  // Load customers and products
  const loadExternalData = async () => {
    try {
      setLoading(true);
      const [customersResponse, productsResponse] = await Promise.all([
        fetch('/api/customers'),
        fetch('/api/products')
      ]);

      if (customersResponse.ok) {
        const customersData = await customersResponse.json();
        setCustomers(customersData);
      }

      if (productsResponse.ok) {
        const productsData = await productsResponse.json();
        setProducts(productsData);
      }
    } catch (error) {
      console.error('Error loading external data:', error);
      showErrorToast("Error", "Failed to load required data");
    } finally {
      setLoading(false);
    }
  };

  // Load template content for editing
  const loadTemplateContent = async (templateId: number) => {
    try {
      const response = await fetch(`/api/map/templates/${templateId}/content`);
      if (response.ok) {
        const content = await response.json();
        // Normalize loaded data with deep array defaults
        const normalizedPhases = (content.phases || []).map((phase: any) => ({
          ...phase,
          steps: (phase.steps || []).map((step: any) => ({
            ...step,
            tasks: step.tasks || [],
            phaseLocalKey: step.phaseLocalKey || `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }))
        }));
        setPhases(normalizedPhases);
      }
    } catch (error) {
      console.error('Error loading template content:', error);
      showErrorToast("Error", "Failed to load template content");
    }
  };

  // Handle form field changes
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle solution selection for Application scope
  const handleSolutionToggle = (productId: number) => {
    setFormData(prev => ({
      ...prev,
      solutionIds: prev.solutionIds.includes(productId)
        ? prev.solutionIds.filter(id => id !== productId)
        : [...prev.solutionIds, productId]
    }));
  };

  // Helper function to format hours consistently as 00.00h
  const formatHours = (hours: number): string => {
    return `${hours.toFixed(2)}h`;
  };

  // Calculate totals
  const calculateTotals = () => {
    const totalPhases = phases.length;
    const totalSteps = phases.reduce((sum, phase) => sum + phase.steps.length, 0);
    const totalTasks = phases.reduce((sum, phase) => 
      sum + phase.steps.reduce((stepSum, step) => stepSum + step.tasks.length, 0), 0
    );
    const totalHours = phases.reduce((sum, phase) => 
      sum + phase.steps.reduce((stepSum, step) => 
        stepSum + step.tasks.reduce((taskSum, task) => taskSum + (Number(task.expectedHours) || 0), 0), 0
      ), 0
    );
    const totalDays = phases.reduce((sum, phase) => sum + (phase.expectedDays || 0), 0);
    
    return { totalPhases, totalSteps, totalTasks, totalHours, totalDays };
  };

  // Handle save
  const handleSave = async () => {
    // Basic template validation
    if (!formData.name.trim()) {
      showWarningToast("Validation Error", "Template name is required");
      return;
    }

    if (formData.scope === 'application' && formData.solutionIds.length === 0) {
      showWarningToast("Validation Error", "At least one solution must be selected for Application scope");
      return;
    }

    if (formData.scope === 'customer' && !formData.customerId) {
      showWarningToast("Validation Error", "A customer must be selected for Customer scope");
      return;
    }

    // Tree validation
    if (hasTreeValidationErrors) {
      showWarningToast("Validation Error", "Please fix all tree validation errors before saving");
      return;
    }

    try {
      setSaving(true);
      
      // Step 1: Save template basics (name, description, scope, visibility, etc.)
      const templateBasics = {
        name: formData.name,
        description: formData.description,
        icon: formData.icon,
        scope: formData.scope,
        visibility: formData.visibility,
        solutionIds: formData.solutionIds,
        customerId: formData.customerId,
        isActive: formData.isActive,
        isSystem: formData.isSystem,
      };

      const url = template ? `/api/map/templates/${template.id}` : '/api/map/templates';
      const method = template ? 'PUT' : 'POST';

      const templateResponse = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templateBasics)
      });

      if (!templateResponse.ok) {
        const error = await templateResponse.json();
        throw new Error(error.message || "Failed to save template basics");
      }

      // Get the template ID (either from response for new template or existing template)
      let templateId = template?.id;
      if (!template) {
        const newTemplate = await templateResponse.json();
        templateId = newTemplate.id;
      }

      // Step 2: Save template content (phases, steps, tasks) - always save to allow clearing
      if (templateId) {
        // Apply rollup calculations and strip editor-only fields before saving
        const phasesWithRollups = phases.map(phase => {
          const stepsWithRollups = phase.steps.map(step => {
            // Calculate step rollup from tasks
            const totalTaskHours = step.tasks.reduce((sum, task) => sum + (Number(task.expectedHours) || 0), 0);
            const calculatedStepDays = Math.max(step.expectedDays || 0, Math.ceil(totalTaskHours / 8));
            
            // Strip editor-only fields (phaseLocalKey) before sending to server
            const { phaseLocalKey, ...stepForServer } = step;
            return {
              ...stepForServer,
              expectedDays: calculatedStepDays,
              expectedHours: totalTaskHours
            };
          });
          
          // Calculate phase rollup from steps
          const totalStepDays = stepsWithRollups.reduce((sum, step) => sum + (step.expectedDays || 0), 0);
          const totalPhaseHours = stepsWithRollups.reduce((sum, step) => sum + (step.expectedHours || 0), 0);
          const calculatedPhaseDays = Math.max(phase.expectedDays || 0, totalStepDays);
          
          return {
            ...phase,
            steps: stepsWithRollups,
            expectedDays: calculatedPhaseDays,
            expectedHours: totalPhaseHours
          };
        });

        const contentResponse = await fetch(`/api/map/templates/${templateId}/content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phases: phasesWithRollups })
        });

        if (!contentResponse.ok) {
          const error = await contentResponse.json();
          // Template was saved but content failed - show warning
          showWarningToast("Partial Success", "Template basics saved, but content save failed: " + (error.message || "Unknown error"));
          onSave();
          onOpenChange(false);
          return;
        }
      }

      showSuccessToast("Success", template ? "Template updated successfully" : "Template created successfully");
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving template:', error);
      showErrorToast("Error", error instanceof Error ? error.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  // Get scope icon and description
  const getScopeConfig = (scope: string) => {
    return SCOPE_OPTIONS.find(option => option.value === scope) || SCOPE_OPTIONS[0];
  };

  // Get visibility icon and description
  const getVisibilityConfig = (visibility: string) => {
    return VISIBILITY_OPTIONS.find(option => option.value === visibility) || VISIBILITY_OPTIONS[0];
  };

  const totals = calculateTotals();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[1200px] sm:max-w-[1200px] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center gap-2">
              <ChartNetwork className="h-5 w-5 text-blue-600" />
              <div>
                <SheetTitle>
                  {template ? 'Edit MAP Template' : 'Create MAP Template'}
                </SheetTitle>
                <SheetDescription>
                  {template ? 'Modify the template structure and settings' : 'Create a new MAP template with custom phases, steps, and tasks'}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* Content */}
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BadgeInfo className="h-5 w-5" />
                    Basic Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="template-name">Template Name *</Label>
                    <Input
                      id="template-name"
                      value={formData.name}
                      onChange={(e) => handleFormChange('name', e.target.value)}
                      placeholder="Enter template name..."
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="template-description">Description</Label>
                    <Textarea
                      id="template-description"
                      value={formData.description}
                      onChange={(e) => handleFormChange('description', e.target.value)}
                      placeholder="Describe this template's purpose and usage..."
                      className="mt-1"
                      rows={3}
                    />
                  </div>

                  <div>
                    <LucideIconPicker
                      label="Icon"
                      value={formData.icon}
                      onChange={(iconName) => handleFormChange('icon', iconName)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Scope *</Label>
                      <Select value={formData.scope} onValueChange={(value) => handleFormChange('scope', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select scope..." />
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map(option => {
                            const Icon = option.icon;
                            return (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Visibility *</Label>
                      <Select value={formData.visibility} onValueChange={(value) => handleFormChange('visibility', value)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VISIBILITY_OPTIONS.map(option => {
                            const Icon = option.icon;
                            return (
                              <SelectItem key={option.value} value={option.value}>
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4" />
                                  <span>{option.label}</span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* System / Active toggles */}
                  <div className="flex items-center gap-6 pt-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 accent-blue-600"
                        checked={formData.isActive}
                        onChange={(e) => handleFormChange('isActive', e.target.checked)}
                        disabled={!isAdmin}
                      />
                      <span className={!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}>Active</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 dark:border-gray-700 accent-blue-600"
                        checked={formData.isSystem}
                        onChange={(e) => handleFormChange('isSystem', e.target.checked)}
                        disabled={!isAdmin}
                      />
                      <span className={!isAdmin ? "text-gray-400" : "text-gray-700 dark:text-gray-300"}>System Template</span>
                    </label>
                  </div>
                </CardContent>
              </Card>

              {/* Scope-Specific Settings */}
              {formData.scope === 'application' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Application Scope Settings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label>Select Solutions *</Label>
                    <div className="mt-2 grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
                      {products.map(product => (
                        <div
                          key={product.id}
                          className={cn(
                            "flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors",
                            formData.solutionIds.includes(product.id)
                              ? "border-primary bg-primary/5 dark:bg-primary/10"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          )}
                          onClick={() => handleSolutionToggle(product.id)}
                        >
                          <div>
                            <div className="font-medium">{product.name}</div>
                            {product.description && (
                              <div className="text-sm text-gray-600 dark:text-gray-400">{product.description}</div>
                            )}
                          </div>
                          <div className={cn(
                            "w-4 h-4 border-2 rounded",
                            formData.solutionIds.includes(product.id)
                              ? "bg-primary border-primary"
                              : "border-gray-300 dark:border-gray-700"
                          )} />
                        </div>
                      ))}
                    </div>
                    {formData.solutionIds.length > 0 && (
                      <div className="mt-2">
                        <Badge variant="outline">
                          {formData.solutionIds.length} solution{formData.solutionIds.length !== 1 ? 's' : ''} selected
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {formData.scope === 'customer' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Customer Scope Settings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Label>Select Customer *</Label>
                    <Select 
                      value={formData.customerId?.toString() || ""} 
                      onValueChange={(value) => handleFormChange('customerId', parseInt(value))}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Choose a customer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {customers.map(customer => (
                          <SelectItem key={customer.id} value={customer.id.toString()}>
                            <div>
                              <div className="font-medium">{customer.accountName}</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400">{customer.industry}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>
              )}

              {/* Template Structure Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Template Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Structure Stats */}
                    <div className="grid grid-cols-5 gap-4 text-center">
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <ClipboardPenLine className="h-4 w-4 text-purple-600" />
                          <div className="text-2xl font-bold text-purple-600">{totals.totalPhases}</div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Phases</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Boxes className="h-4 w-4 text-blue-600" />
                          <div className="text-2xl font-bold text-blue-600">{totals.totalSteps}</div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Steps</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <PackageCheck className="h-4 w-4 text-green-600" />
                          <div className="text-2xl font-bold text-green-600">{totals.totalTasks}</div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Tasks</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Clock className="h-4 w-4 text-orange-600" />
                          <div className="text-2xl font-bold text-orange-600">{formatHours(totals.totalHours)}</div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Hours</div>
                      </div>
                      <div>
                        <div className="flex items-center justify-center gap-1 mb-1">
                          <Calendar className="h-4 w-4 text-indigo-600" />
                          <div className="text-2xl font-bold text-indigo-600">{totals.totalDays}</div>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">Total Days</div>
                      </div>
                    </div>
                    
                    {/* Template Metadata */}
                    {template && (
                      <div className="border-t pt-4">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <BarChart3 className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                              <div className="font-semibold text-gray-700 dark:text-gray-300">0</div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Usage</div>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <UserIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                              <div className="font-semibold text-gray-700 dark:text-gray-300 text-xs">
                                {template.createdByUser 
                                  ? `${template.createdByUser.firstName || ''} ${template.createdByUser.lastName || ''}`.trim() || template.createdByUser.email || 'Unknown'
                                  : 'Unknown'
                                }
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Created By</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-700 dark:text-gray-300 text-xs">{template.createdAt ? new Date(template.createdAt).toLocaleDateString() : 'N/A'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Created</div>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                              <UserIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                              <div className="font-semibold text-gray-700 dark:text-gray-300 text-xs">
                                {template.updatedByUser
                                  ? `${template.updatedByUser.firstName || ''} ${template.updatedByUser.lastName || ''}`.trim() || template.updatedByUser.email || 'Unknown'
                                  : 'Unknown'
                                }
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Last Modified By</div>
                          </div>
                          <div className="text-center">
                            <div className="font-semibold text-gray-700 dark:text-gray-300 text-xs">{template.updatedAt ? new Date(template.updatedAt).toLocaleDateString() : 'N/A'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">Updated Date</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Separator />

              {/* Tree Editor */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Template Structure</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="p-4">
                    <MapTemplateTreeEditor
                      phases={phases}
                      onPhasesChange={setPhases}
                      readonly={false}
                      onValidationChange={setHasTreeValidationErrors}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="border-t px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {totals.totalPhases} phases, {totals.totalSteps} steps, {totals.totalTasks} tasks, {formatHours(totals.totalHours)}
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button 
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : template ? 'Update Template' : 'Create Template'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}