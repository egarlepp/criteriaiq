import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import { Plus, Edit2, BrainCog, X, Clock, Cpu, Users2, UserCheck, Target, TrendingUp, Settings2, Database, ChevronDown, ChevronRight } from "lucide-react";
import { DocSectionPicker } from "@/components/ai-assessments/doc-section-picker";
import type { RiskCriteria } from "@shared/schema";

interface DataSourceGroup {
  key: string;
  label: string;
  description: string;
  fields: {
    key: string;
    label: string;
    description: string;
    group: string;
    fieldType: string;
  }[];
}

const riskCriteriaFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
  weight: z.number().min(0, 'Weight must be at least 0').max(1, 'Weight must be at most 1'),
  category: z.enum(['timeline', 'technical', 'resource', 'customer', 'success_criteria', 'performance', 'custom']),
  isActive: z.boolean(),
  dataSources: z.array(z.string()).optional(),
  docSections: z.array(z.string()).optional()
});

type RiskCriteriaFormData = z.infer<typeof riskCriteriaFormSchema>;

interface RiskCriteriaFormProps {
  criteria?: RiskCriteria;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
  rulesetId?: number;
}

const categoryLabels = {
  timeline: "Timeline Risk",
  technical: "Technical Complexity",
  resource: "Resource Availability",
  customer: "Customer Engagement",
  success_criteria: "Success Criteria Definition",
  performance: "Past Performance",
  custom: "Custom Criteria"
};

const categoryIcons: Record<string, { icon: React.FC<any>; color: string }> = {
  timeline: { icon: Clock, color: "#ef4444" },
  technical: { icon: Cpu, color: "#8b5cf6" },
  resource: { icon: Users2, color: "#3b82f6" },
  customer: { icon: UserCheck, color: "#22c55e" },
  success_criteria: { icon: Target, color: "#f59e0b" },
  performance: { icon: TrendingUp, color: "#06b6d4" },
  custom: { icon: Settings2, color: "#6b7280" },
};

export function RiskCriteriaForm({ criteria, trigger, onSuccess, rulesetId }: RiskCriteriaFormProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();
  const isEdit = !!criteria;

  const { data: dataSourceGroups = [] } = useQuery<DataSourceGroup[]>({
    queryKey: ['/api/assessment/data-sources'],
    queryFn: async () => {
      const res = await fetch('/api/assessment/data-sources', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch data sources');
      return res.json();
    },
    enabled: open,
  });


  useEffect(() => {
    if (dataSourceGroups.length > 0 && criteria) {
      const selectedKeys: string[] = (criteria as any)?.dataSources || [];
      if (selectedKeys.length > 0) {
        const expanded: Record<string, boolean> = {};
        dataSourceGroups.forEach(group => {
          if (group.fields.some(f => selectedKeys.includes(f.key))) {
            expanded[group.key] = true;
          }
        });
        setExpandedGroups(prev => ({ ...prev, ...expanded }));
      }
    }
  }, [dataSourceGroups, criteria]);

  const form = useForm<RiskCriteriaFormData>({
    resolver: zodResolver(riskCriteriaFormSchema),
    defaultValues: criteria ? {
      name: criteria.name,
      description: criteria.description || '',
      weight: Number(criteria.weightFactor) || 0.1,
      category: mapCategoryFromDb(criteria.category) as any,
      isActive: criteria.isActive ?? true,
      dataSources: (criteria as any)?.dataSources || [],
      docSections: (criteria as any)?.docSections || []
    } : {
      name: '',
      description: '',
      weight: 0.1,
      category: 'custom',
      isActive: true,
      dataSources: [],
      docSections: []
    }
  });

  // Map database category to form category
  function mapCategoryFromDb(dbCategory: string): string {
    const categoryMap: Record<string, string> = {
      'scheduling': 'timeline',
      'timeline': 'timeline',
      'technical': 'technical',
      'resource': 'resource', 
      'stakeholder': 'customer',
      'customer': 'customer',
      'requirements': 'success_criteria',
      'success_criteria': 'success_criteria',
      'performance': 'performance',
      'historical': 'performance'
    };
    return categoryMap[dbCategory] || 'custom';
  }

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: RiskCriteriaFormData) => {
      const response = await fetch('/api/risk/criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...data, rulesetId: rulesetId || null })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create assessment criteria');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment criteria created successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/risk/criteria'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create assessment criteria");
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: RiskCriteriaFormData) => {
      const response = await fetch(`/api/risk/criteria/${criteria!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update assessment criteria');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment criteria updated successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/risk/criteria'] });
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update assessment criteria");
    }
  });

  const onSubmit = (data: RiskCriteriaFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const defaultTrigger = (
    <Button variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"}>
      {isEdit ? <Edit2 className="h-4 w-4" /> : <><BrainCog className="h-4 w-4 mr-2" />Add Criteria</>}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div onClick={(e) => e.stopPropagation()}>
          {trigger || defaultTrigger}
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BrainCog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {isEdit ? 'Edit Assessment Criteria' : 'Create Assessment Criteria'}
          </DialogTitle>
          <DialogDescription>
            {isEdit 
              ? 'Update the assessment criteria details below.' 
              : 'Create a new assessment criteria to enhance AI assessment analysis.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Timeline Risk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(categoryLabels).map(([value, label]) => {
                          const catInfo = categoryIcons[value] || categoryIcons.custom;
                          const CatIcon = catInfo.icon;
                          return (
                            <SelectItem key={value} value={value}>
                              <div className="flex items-center gap-2">
                                <CatIcon className="h-4 w-4 shrink-0" style={{ color: catInfo.color }} />
                                {label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe what this criteria evaluates and how it contributes to risk assessment..."
                      rows={3}
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dataSources"
              render={({ field }) => {
                const selectedKeys: string[] = field.value || [];
                const totalSelected = selectedKeys.length;

                const toggleField = (key: string) => {
                  const next = selectedKeys.includes(key)
                    ? selectedKeys.filter(k => k !== key)
                    : [...selectedKeys, key];
                  field.onChange(next);
                };

                const toggleGroup = (group: DataSourceGroup) => {
                  const groupKeys = group.fields.map(f => f.key);
                  const allSelected = groupKeys.every(k => selectedKeys.includes(k));
                  const next = allSelected
                    ? selectedKeys.filter(k => !groupKeys.includes(k))
                    : [...new Set([...selectedKeys, ...groupKeys])];
                  field.onChange(next);
                };

                const toggleGroupExpanded = (groupKey: string) => {
                  setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
                };

                return (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Data Sources
                      </FormLabel>
                      {totalSelected > 0 && (
                        <Badge variant="secondary">{totalSelected} selected</Badge>
                      )}
                    </div>
                    <FormDescription>
                      Select which project data the AI should access when evaluating this criterion
                    </FormDescription>
                    <ScrollArea className="h-[200px] rounded-md border border-border bg-background p-2">
                      <div className="space-y-1">
                        {dataSourceGroups.map((group) => {
                          const groupKeys = group.fields.map(f => f.key);
                          const allSelected = groupKeys.length > 0 && groupKeys.every(k => selectedKeys.includes(k));
                          const someSelected = groupKeys.some(k => selectedKeys.includes(k));
                          const isExpanded = expandedGroups[group.key] || false;

                          return (
                            <div key={group.key} className="rounded-md border border-border bg-muted/30 dark:bg-muted/10">
                              <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50 dark:hover:bg-muted/20" onClick={() => toggleGroupExpanded(group.key)}>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <Checkbox
                                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                  onCheckedChange={() => toggleGroup(group)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-sm font-medium text-foreground">{group.label}</span>
                                <span className="text-xs text-muted-foreground ml-auto">{group.fields.length} fields</span>
                              </div>
                              {isExpanded && (
                                <div className="px-3 pb-2 pl-10 space-y-1">
                                  {group.fields.map((f) => (
                                    <label key={f.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/40 dark:hover:bg-muted/15 rounded px-2">
                                      <Checkbox
                                        checked={selectedKeys.includes(f.key)}
                                        onCheckedChange={() => toggleField(f.key)}
                                      />
                                      <div className="flex flex-col">
                                        <span className="text-sm text-foreground">{f.label}</span>
                                        <span className="text-xs text-muted-foreground">{f.description}</span>
                                      </div>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="docSections"
              render={({ field }) => (
                <FormItem>
                  <DocSectionPicker
                    selectedKeys={field.value || []}
                    onChange={field.onChange}
                  />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="weight"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Weight Factor *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        placeholder="0.1"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Weight factor between 0 and 1 (higher = more impact on overall risk)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>
                        Whether this criteria is used in risk analysis
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                <BrainCog className="h-4 w-4 mr-2" />
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}