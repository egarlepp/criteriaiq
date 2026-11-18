import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { showSuccessToast, showErrorToast } from "@/lib/toast-helper";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Edit2, Layers, Brain, Save, X, ShieldAlert, Package, Handshake, LayoutGrid, Wrench, ClipboardCheck, GraduationCap, MessageSquareText, FileJson } from "lucide-react";
import { AI_PROVIDER_ICONS, AI_PROVIDER_COLORS } from "@/components/icons/ai-provider-icons";

interface AIProviderConfig {
  id: number;
  provider: string;
  displayName: string;
  isActive: boolean;
  defaultModel: string | null;
  availableModels: string[];
}

interface ProviderDefaults {
  displayName: string;
  models: string[];
  defaultModel: string;
}

const rulesetFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  category: z.enum(['risk', 'product', 'engagement', 'general', 'technical', 'compliance', 'coachiq']),
  description: z.string().optional().nullable(),
  defaultAiProvider: z.string().optional().nullable(),
  defaultAiModel: z.string().optional().nullable(),
  additionalInstructions: z.string().optional().nullable(),
  outputFormatTemplate: z.string().optional().nullable(),
  totalWeight: z.number().min(0).max(100),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

type RulesetFormData = z.infer<typeof rulesetFormSchema>;

const categoryConfig: Record<string, { label: string; icon: React.FC<any>; color: string }> = {
  risk: { label: "Risk Assessment", icon: ShieldAlert, color: "#ef4444" },
  product: { label: "Product Evaluation", icon: Package, color: "#3b82f6" },
  engagement: { label: "Engagement Analysis", icon: Handshake, color: "#22c55e" },
  general: { label: "General Assessment", icon: LayoutGrid, color: "#6b7280" },
  technical: { label: "Technical Review", icon: Wrench, color: "#8b5cf6" },
  compliance: { label: "Compliance Check", icon: ClipboardCheck, color: "#f97316" },
  coachiq: { label: "CoachIQ", icon: GraduationCap, color: "#0ea5e9" },
};

const categoryLabels: Record<string, string> = Object.fromEntries(
  Object.entries(categoryConfig).map(([k, v]) => [k, v.label])
);

interface AssessmentRulesetFormProps {
  ruleset?: any;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

export function AssessmentRulesetForm({ ruleset, trigger, onSuccess }: AssessmentRulesetFormProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const isEdit = !!ruleset;

  const { data: configsData } = useQuery<{ configs: AIProviderConfig[] }>({
    queryKey: ['/api/admin/ai-providers'],
    enabled: open,
  });

  const { data: defaultsData } = useQuery<{ defaults: Record<string, ProviderDefaults> }>({
    queryKey: ['/api/admin/ai-providers/defaults'],
    enabled: open,
  });

  const form = useForm<RulesetFormData>({
    resolver: zodResolver(rulesetFormSchema),
    defaultValues: ruleset ? {
      name: ruleset.name || '',
      category: ruleset.category || 'general',
      description: ruleset.description || '',
      defaultAiProvider: ruleset.defaultAiProvider || '',
      defaultAiModel: ruleset.defaultAiModel || '',
      additionalInstructions: ruleset.additionalInstructions || '',
      outputFormatTemplate: ruleset.outputFormatTemplate || '',
      totalWeight: parseFloat(ruleset.totalWeight) || 1.0,
      isActive: ruleset.isActive ?? true,
      isDefault: ruleset.isDefault ?? false,
    } : {
      name: '',
      category: 'general',
      description: '',
      defaultAiProvider: '',
      defaultAiModel: '',
      additionalInstructions: '',
      outputFormatTemplate: '',
      totalWeight: 1.0,
      isActive: true,
      isDefault: false,
    }
  });

  const totalWeight = form.watch('totalWeight');
  const selectedProvider = form.watch('defaultAiProvider');
  const weightPercentage = Math.min((totalWeight / 1.0) * 100, 100);
  const isWeightValid = Math.abs(totalWeight - 1.0) < 0.001;

  const activeProviders = useMemo(() => {
    return configsData?.configs?.filter(c => c.isActive) || [];
  }, [configsData]);

  const availableModels = useMemo(() => {
    if (!selectedProvider) return [];

    const providerConfig = activeProviders.find(p => p.provider === selectedProvider);
    if (providerConfig?.availableModels?.length) {
      return providerConfig.availableModels;
    }

    const providerDefaults = defaultsData?.defaults?.[selectedProvider];
    if (providerDefaults?.models?.length) {
      return providerDefaults.models;
    }

    return [];
  }, [selectedProvider, activeProviders, defaultsData]);

  const createMutation = useMutation({
    mutationFn: async (data: RulesetFormData) => {
      const response = await fetch('/api/assessment/rulesets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          totalWeight: String(data.totalWeight),
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create assessment ruleset');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment ruleset created successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to create assessment ruleset");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: RulesetFormData) => {
      const response = await fetch(`/api/assessment/rulesets/${ruleset!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          totalWeight: String(data.totalWeight),
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update assessment ruleset');
      }
      return response.json();
    },
    onSuccess: () => {
      showSuccessToast("Success", "Assessment ruleset updated successfully");
      queryClient.invalidateQueries({ queryKey: ['/api/assessment/rulesets'] });
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      showErrorToast("Error", error.message || "Failed to update assessment ruleset");
    }
  });

  const onSubmit = (data: RulesetFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const defaultTrigger = (
    <Button variant={isEdit ? "ghost" : "default"} size={isEdit ? "sm" : "default"}>
      {isEdit ? <Edit2 className="h-4 w-4" /> : <><Layers className="h-4 w-4 mr-2" />Create Ruleset</>}
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
            <Brain className="h-5 w-5 text-blue-600" />
            {isEdit ? 'Edit Assessment Ruleset' : 'Create Assessment Ruleset'}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the assessment ruleset details below.'
              : 'Create a new assessment ruleset to group criteria for AI analysis.'
            }
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[75vh] pr-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-1 pt-1 pb-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Risk Assessment v2" {...field} />
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
                        {Object.entries(categoryConfig).map(([value, config]) => {
                          const CatIcon = config.icon;
                          return (
                            <SelectItem key={value} value={value}>
                              <div className="flex items-center gap-2">
                                <CatIcon className="h-4 w-4 shrink-0" style={{ color: config.color }} />
                                {config.label}
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the purpose and scope of this assessment ruleset..."
                      rows={3}
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="defaultAiProvider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default AI Provider</FormLabel>
                    {activeProviders.length > 0 ? (
                      <Select
                        value={field.value || ""}
                        onValueChange={(val) => {
                          field.onChange(val);
                          form.setValue('defaultAiModel', '');
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {activeProviders.map((provider) => {
                            const ProviderIcon = AI_PROVIDER_ICONS[provider.provider] || Brain;
                            const iconColor = AI_PROVIDER_COLORS[provider.provider]?.color || '#6B7280';
                            return (
                              <SelectItem key={provider.id} value={provider.provider}>
                                <div className="flex items-center gap-2">
                                  <ProviderIcon className="h-4 w-4 shrink-0" style={{ color: iconColor }} />
                                  {provider.displayName || provider.provider}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="e.g. openai"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                    )}
                    <FormDescription>
                      AI provider to use for this ruleset
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultAiModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Default AI Model</FormLabel>
                    {availableModels.length > 0 ? (
                      <Select
                        value={field.value || ""}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableModels.map((model) => (
                            <SelectItem key={model} value={model}>
                              {model}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input
                          placeholder="e.g. gpt-4o"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                    )}
                    <FormDescription>
                      AI model to use for this ruleset
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="totalWeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total Weight</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="1.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <div className="mt-2 space-y-1">
                    <Progress
                      value={weightPercentage}
                      className={`h-2 ${isWeightValid ? '[&>div]:bg-green-500' : '[&>div]:bg-yellow-500'}`}
                    />
                    <p className={`text-xs ${isWeightValid ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                      Weight: {totalWeight?.toFixed(2) || '0.00'} {isWeightValid ? '✓' : '(target: 1.00)'}
                    </p>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="additionalInstructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <MessageSquareText className="h-4 w-4" />
                    Additional Instructions
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Focus on enterprise deployment readiness. Weight security concerns more heavily for financial services customers..."
                      rows={4}
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Extra guidance or context for the AI when using this ruleset (e.g., 'Focus on enterprise readiness' or 'Be conservative with scoring')
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="outputFormatTemplate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    Output Format Template
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      className="font-mono text-sm"
                      placeholder={'{\n  "summary": "...",\n  "recommendations": ["..."],\n  "score": 0\n}'}
                      rows={4}
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional custom output format for AI responses. Useful for coaching-style rulesets that need a different response structure.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        Whether this ruleset is available for use
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Default</FormLabel>
                      <FormDescription>
                        Make this the default ruleset for its category
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
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (
                  isEdit ? <><Save className="h-4 w-4 mr-1" />Update</> : <><Plus className="h-4 w-4 mr-1" />Create</>
                )}
              </Button>
            </div>
          </form>
        </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
