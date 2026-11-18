import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trans } from 'react-i18next';
import type { CrmProviderId } from '@shared/crm-provider';
import { useCrmViewTranslation } from '@/hooks/use-crm-view-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { apiRequest } from '@/lib/queryClient';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Plus,
  Trash2,
  Star,
  Check,
  ArrowRight,
  ArrowLeft,
  ArrowRightLeft,
  Loader2,
  Sparkles,
  AlertCircle,
  Info,
  ExternalLink,
  PlayCircle,
  CheckCircle,
  XCircle,
  Search,
  ChevronsUpDown,
  CaseSensitive,
  X,
} from 'lucide-react';
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";

interface ValueMap {
  id: number;
  cqiValue: string;
  sfValue: string;
  isDefault: boolean;
  isPrimaryOutbound: boolean;
}

interface FieldMapping {
  id: number;
  cqiEntity: string;
  cqiFieldKey: string;
  cqiFieldLabel: string;
  cqiFieldType: string;
  sfObjectApiName: string;
  sfObjectLabel: string | null;
  sfFieldApiName: string;
  sfFieldLabel: string | null;
  sfFieldType: string;
  direction: 'inbound' | 'outbound' | 'bidirectional';
  unmappedBehavior?: string;
  isCaseInsensitive?: boolean;
  valueMaps?: ValueMap[];
}

interface SfFieldOption {
  value: string;
  label: string;
  count?: number;
}

interface FuzzySuggestion {
  cqiValue: string;
  sfValue: string;
  confidence: number;
  matchType: 'exact' | 'case_insensitive' | 'normalized' | 'partial' | 'fuzzy';
}

interface ValueTranslationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mapping: FieldMapping | null;
  sfPicklistValues?: string[];
  /** The CRM the mapping belongs to; {{crm}} in the wording names it. */
  crm?: CrmProviderId;
}

export function ValueTranslationsDialog({
  open,
  onOpenChange,
  mapping: initialMapping,
  sfPicklistValues = [],
  crm = 'salesforce',
}: ValueTranslationsDialogProps) {
  const { t: tc } = useCrmViewTranslation(crm);
  const queryClient = useQueryClient();
  const [newCqiValue, setNewCqiValue] = useState('');
  const [newSfValue, setNewSfValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const [simulatorValue, setSimulatorValue] = useState('');
  const [simulatorDirection, setSimulatorDirection] = useState<'inbound' | 'outbound'>('outbound');
  const [simulatorResult, setSimulatorResult] = useState<{
    success: boolean;
    inputValue: string;
    outputValue: string | null;
    source: 'exact_match' | 'primary_outbound' | 'default' | 'passthrough' | 'error';
    sourceDetails?: string;
    error?: string;
  } | null>(null);

  const [sfFieldOptions, setSfFieldOptions] = useState<SfFieldOption[]>([]);
  const [sfComboboxOpen, setSfComboboxOpen] = useState(false);

  const { data: mappingsData } = useQuery({
    queryKey: ['/api/admin/salesforce/mappings'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/admin/salesforce/mappings');
    },
    enabled: open && !!initialMapping?.id,
  });

  const mapping = useMemo(() => {
    if (!initialMapping?.id) return initialMapping;
    const freshMapping = mappingsData?.mappings?.find((m: FieldMapping) => m.id === initialMapping.id);
    return freshMapping || initialMapping;
  }, [initialMapping, mappingsData]);

  const valueMaps = mapping?.valueMaps || [];

  const { data: cqiPicklistData } = useQuery({
    queryKey: ['/api/admin/salesforce/cqi-picklist-values', mapping?.cqiEntity, mapping?.cqiFieldKey],
    queryFn: async () => {
      if (!mapping?.cqiEntity || !mapping?.cqiFieldKey) return { values: [] };
      const res = await apiRequest('GET', `/api/admin/salesforce/cqi-picklist-values/${mapping.cqiEntity}/${mapping.cqiFieldKey}`);
      return res;
    },
    enabled: open && !!mapping?.cqiEntity && !!mapping?.cqiFieldKey && mapping?.cqiFieldType === 'picklist',
  });

  const cqiPicklistValues = cqiPicklistData?.values || [];

  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['/api/admin/salesforce/mappings', mapping?.id, 'suggest-translations'],
    queryFn: async () => {
      if (!mapping?.id) return { suggestions: [] };
      const res = await apiRequest('POST', `/api/admin/salesforce/mappings/${mapping.id}/suggest-translations`, {
        cqiValues: cqiPicklistValues,
        sfPicklistValues,
      });
      return res;
    },
    enabled: open && !!mapping?.id && cqiPicklistValues.length > 0 && sfPicklistValues.length > 0,
  });

  const suggestions = suggestionsData?.suggestions || [];
  const unmappedCqiValues = useMemo(() => {
    const mappedCqi = new Set(valueMaps.map((vm: ValueMap) => vm.cqiValue));
    return cqiPicklistValues.filter((v: string) => !mappedCqi.has(v));
  }, [cqiPicklistValues, valueMaps]);

  const unmappedSfValues = useMemo(() => {
    const mappedSf = new Set(valueMaps.map((vm: ValueMap) => vm.sfValue));
    return sfPicklistValues.filter(v => !mappedSf.has(v));
  }, [sfPicklistValues, valueMaps]);

  const cqiValueGroups = useMemo(() => {
    const groups: Record<string, ValueMap[]> = {};
    for (const vm of valueMaps as ValueMap[]) {
      if (!groups[vm.cqiValue]) {
        groups[vm.cqiValue] = [];
      }
      groups[vm.cqiValue].push(vm);
    }
    return groups;
  }, [valueMaps]);

  const addValueMapMutation = useMutation({
    mutationFn: async (data: { cqiValue: string; sfValue: string; isDefault?: boolean; isPrimaryOutbound?: boolean }) => {
      return await apiRequest('POST', `/api/admin/salesforce/mappings/${mapping?.id}/value-maps`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      setNewCqiValue('');
      setNewSfValue('');
      showSuccessToast('Success', 'Value translation added');
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || 'Failed to add translation');
    },
  });

  const updateValueMapMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<{ isDefault: boolean; isPrimaryOutbound: boolean }> }) => {
      return await apiRequest('PUT', `/api/admin/salesforce/value-maps/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      showSuccessToast('Success', 'Value translation updated');
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || 'Failed to update translation');
    },
  });

  const deleteValueMapMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/admin/salesforce/value-maps/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      showSuccessToast('Success', 'Value translation deleted');
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || 'Failed to delete translation');
    },
  });

  const applySuggestionMutation = useMutation({
    mutationFn: async (suggestion: FuzzySuggestion) => {
      const existingForCqi = cqiValueGroups[suggestion.cqiValue] || [];
      const isPrimaryOutbound = existingForCqi.length === 0;
      return await apiRequest('POST', `/api/admin/salesforce/mappings/${mapping?.id}/value-maps`, {
        cqiValue: suggestion.cqiValue,
        sfValue: suggestion.sfValue,
        isDefault: false,
        isPrimaryOutbound,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings', mapping?.id, 'suggest-translations'] });
      showSuccessToast('Success', 'Suggestion applied');
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || 'Failed to apply suggestion');
    },
  });

  const testTranslationMutation = useMutation({
    mutationFn: async ({ value, direction }: { value: string; direction: 'inbound' | 'outbound' }) => {
      return await apiRequest('POST', `/api/admin/salesforce/mappings/${mapping?.id}/test-translation`, {
        value,
        direction,
      });
    },
    onSuccess: (data) => {
      setSimulatorResult(data);
    },
    onError: (error: any) => {
      setSimulatorResult({
        success: false,
        inputValue: simulatorValue,
        outputValue: null,
        source: 'error',
        error: error.message || 'Failed to test translation',
      });
    },
  });

  const updateMappingMutation = useMutation({
    mutationFn: async (data: { isCaseInsensitive?: boolean }) => {
      return await apiRequest('PUT', `/api/admin/salesforce/mappings/${mapping?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/salesforce/mappings'] });
      showSuccessToast('Success', 'Mapping settings updated');
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || 'Failed to update mapping');
    },
  });

  const fetchSfFieldOptionsMutation = useMutation({
    mutationFn: async () => {
      if (!mapping?.sfObjectApiName || !mapping?.sfFieldApiName) {
        throw new Error(tc('crmSync.values.missingField'));
      }
      const params = new URLSearchParams({
        object: mapping.sfObjectApiName,
        field: mapping.sfFieldApiName,
        ...(mapping.sfFieldType && { fieldType: mapping.sfFieldType }),
      });
      return await apiRequest('GET', `/api/admin/salesforce/metadata/sf/field-options?${params}`);
    },
    onSuccess: (data) => {
      const options: SfFieldOption[] = data.options?.map((opt: { value: string; label: string; count?: number }) => ({
        value: opt.value,
        label: opt.label || opt.value,
        count: opt.count,
      })) || [];
      setSfFieldOptions(options);
      showSuccessToast('Success', tc('crmSync.values.fetched', { count: options.length }));
    },
    onError: (error: any) => {
      showErrorToast('Error', error.message || tc('crmSync.values.fetchFailed'));
    },
  });

  const handleAddTranslation = () => {
    if (!newCqiValue || !newSfValue) return;
    const existingForCqi = cqiValueGroups[newCqiValue] || [];
    const isPrimaryOutbound = existingForCqi.length === 0;
    addValueMapMutation.mutate({
      cqiValue: newCqiValue,
      sfValue: newSfValue,
      isPrimaryOutbound,
    });
  };

  const getConfidenceBadge = (confidence: number, matchType: string) => {
    if (confidence >= 0.9) {
      return <Badge className="bg-green-100 text-green-700 border-green-200">High ({Math.round(confidence * 100)}%)</Badge>;
    } else if (confidence >= 0.7) {
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Medium ({Math.round(confidence * 100)}%)</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Low ({Math.round(confidence * 100)}%)</Badge>;
  };

  if (!mapping) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5" />
            Value Translations: {mapping.cqiFieldLabel}
          </DialogTitle>
          <DialogDescription>
            {tc('crmSync.values.description', { cqiField: mapping.cqiFieldLabel, crmField: mapping.sfFieldLabel || mapping.sfFieldApiName })}
            {tc('crmSync.values.oneToMany')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-[calc(90vh-220px)]">
            <div className="space-y-6 px-1 pr-4">
              <div className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="space-y-2 text-sm">
                    <h4 className="font-medium text-amber-800 dark:text-amber-300">Understanding Translation Settings</h4>
                    <div className="space-y-3 text-amber-700 dark:text-amber-400">
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          <Star className="h-3.5 w-3.5 text-yellow-500" />
                          <span>Default</span>
                        </div>
                        <p className="text-xs mt-0.5 ml-5">
                          <Trans t={tc} i18nKey="crmSync.values.defaultHelp" components={{ b: <strong /> }} />
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 font-medium">
                          <ExternalLink className="h-3.5 w-3.5 text-blue-500" />
                          <span>Primary Outbound</span>
                        </div>
                        <p className="text-xs mt-0.5 ml-5">
                          <Trans t={tc} i18nKey="crmSync.values.primaryHelp" components={{ b: <strong /> }} />
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matching Settings */}
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-slate-900">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CaseSensitive className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    <div>
                      <h4 className="font-medium text-sm">Case Insensitive Matching</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        When enabled, value matching ignores case differences (e.g., "Active" matches "ACTIVE")
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={mapping.isCaseInsensitive || false}
                    onCheckedChange={(checked) => {
                      updateMappingMutation.mutate({ isCaseInsensitive: checked });
                    }}
                    disabled={updateMappingMutation.isPending}
                  />
                </div>
              </div>

              {suggestions.length > 0 && (
                <div className="border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-sm">Suggested Matches</span>
                      <Badge variant="outline" className="ml-1">{suggestions.length}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowSuggestions(!showSuggestions)}
                    >
                      {showSuggestions ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  {showSuggestions && (
                    <div className="space-y-2">
                      {suggestions.map((suggestion: FuzzySuggestion, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 rounded border">
                          <div className="flex items-center gap-4">
                            <span className="font-mono text-sm">{suggestion.cqiValue}</span>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm">{suggestion.sfValue}</span>
                            {getConfidenceBadge(suggestion.confidence, suggestion.matchType)}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applySuggestionMutation.mutate(suggestion)}
                            disabled={applySuggestionMutation.isPending}
                          >
                            {applySuggestionMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            <span className="ml-1">Apply</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Current Translations</h4>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-yellow-500" />
                            <span>Default</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Fallback value when no match is found (inbound sync)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="mx-1">|</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-1">
                            <ExternalLink className="h-3 w-3 text-blue-500" />
                            <span>Primary</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{tc('crmSync.values.primaryShortTip')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {valueMaps.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-lg">
                    <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No value translations configured</p>
                    <p className="text-sm">Add translations below or apply suggestions above</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CriteriaIQ Value</TableHead>
                        <TableHead></TableHead>
                        <TableHead>{tc('crmSync.values.crmValue')}</TableHead>
                        <TableHead className="w-[100px] text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex items-center gap-1 justify-center cursor-help">
                                <Star className="h-3 w-3 text-yellow-500" />
                                <span>Default</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium mb-1">Inbound Fallback</p>
                                <p className="text-xs">{tc('crmSync.values.defaultTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="w-[100px] text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex items-center gap-1 justify-center cursor-help">
                                <ExternalLink className="h-3 w-3 text-blue-500" />
                                <span>Primary</span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="font-medium mb-1">Outbound Primary</p>
                                <p className="text-xs">{tc('crmSync.values.primaryTip')}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {valueMaps.map((vm: ValueMap) => {
                        const hasMultipleSfValues = (cqiValueGroups[vm.cqiValue]?.length || 0) > 1;
                        return (
                          <TableRow key={vm.id}>
                            <TableCell className="font-mono text-sm">{vm.cqiValue}</TableCell>
                            <TableCell className="text-center">
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{vm.sfValue}</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={vm.isDefault}
                                onCheckedChange={(checked) =>
                                  updateValueMapMutation.mutate({ id: vm.id, data: { isDefault: checked } })
                                }
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              {hasMultipleSfValues ? (
                                <Switch
                                  checked={vm.isPrimaryOutbound}
                                  onCheckedChange={(checked) =>
                                    updateValueMapMutation.mutate({ id: vm.id, data: { isPrimaryOutbound: checked } })
                                  }
                                />
                              ) : (
                                <Badge className="bg-blue-100 text-blue-900 border border-blue-700 text-xs">Auto</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <ResponsiveTableActionsMenu
                                actions={[
                                  {
                                    id: 'delete',
                                    label: 'Delete Translation',
                                    icon: Trash2,
                                    onClick: () => deleteValueMapMutation.mutate(vm.id),
                                    variant: 'destructive',
                                    disabled: deleteValueMapMutation.isPending
                                  }
                                ]}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>

              <Separator />

              <div className="overflow-visible">
                <h4 className="font-medium mb-3">Add New Translation</h4>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor="cqi-value" className="text-sm">CriteriaIQ Value</Label>
                    {unmappedCqiValues.length > 0 ? (
                      <Select value={newCqiValue} onValueChange={setNewCqiValue}>
                        <SelectTrigger id="cqi-value">
                          <SelectValue placeholder="Select CriteriaIQ value" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="z-[100] max-h-[200px]">
                          {unmappedCqiValues.map((value: string) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="cqi-value"
                        value={newCqiValue}
                        onChange={(e) => setNewCqiValue(e.target.value)}
                        placeholder="Enter CriteriaIQ value"
                      />
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <Label htmlFor="sf-value" className="text-sm">{tc('crmSync.values.crmValue')}</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => fetchSfFieldOptionsMutation.mutate()}
                        disabled={fetchSfFieldOptionsMutation.isPending}
                      >
                        {fetchSfFieldOptionsMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Search className="h-3 w-3 mr-1" />
                        )}
                        {tc('crmSync.values.fetchButton')}
                      </Button>
                    </div>
                    {sfFieldOptions.length > 0 || unmappedSfValues.length > 0 ? (
                      <Popover open={sfComboboxOpen} onOpenChange={setSfComboboxOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={sfComboboxOpen}
                            className="w-full justify-between font-normal"
                          >
                            {newSfValue || tc('crmSync.values.selectPlaceholder')}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[300px] p-0 z-[100]" align="start">
                          <Command>
                            <CommandInput 
                              placeholder="Search or enter value..." 
                              value={newSfValue}
                              onValueChange={setNewSfValue}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {newSfValue ? (
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start"
                                    onClick={() => {
                                      setSfComboboxOpen(false);
                                    }}
                                  >
                                    Use "{newSfValue}"
                                  </Button>
                                ) : (
                                  "No values found"
                                )}
                              </CommandEmpty>
                              {sfFieldOptions.length > 0 && (
                                <CommandGroup heading={tc('crmSync.values.discovered')}>
                                  {sfFieldOptions.map((option) => (
                                    <CommandItem
                                      key={option.value}
                                      value={option.value}
                                      onSelect={(value) => {
                                        setNewSfValue(value);
                                        setSfComboboxOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          newSfValue === option.value ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      <span>{option.label}</span>
                                      {option.count !== undefined && (
                                        <span className="ml-auto text-xs text-muted-foreground">
                                          ({option.count})
                                        </span>
                                      )}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {unmappedSfValues.length > 0 && (
                                <CommandGroup heading="Unmapped from Props">
                                  {unmappedSfValues.map((value) => (
                                    <CommandItem
                                      key={value}
                                      value={value}
                                      onSelect={(selectedValue) => {
                                        setNewSfValue(selectedValue);
                                        setSfComboboxOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={`mr-2 h-4 w-4 ${
                                          newSfValue === value ? "opacity-100" : "opacity-0"
                                        }`}
                                      />
                                      {value}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Input
                        id="sf-value"
                        value={newSfValue}
                        onChange={(e) => setNewSfValue(e.target.value)}
                        placeholder={tc('crmSync.values.enterPlaceholder')}
                      />
                    )}
                  </div>
                  <Button
                    onClick={handleAddTranslation}
                    disabled={!newCqiValue || !newSfValue || addValueMapMutation.isPending}
                  >
                    {addValueMapMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Add
                  </Button>
                </div>
              </div>

              {(unmappedCqiValues.length > 0 || unmappedSfValues.length > 0) && (
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {unmappedCqiValues.length > 0 && (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{unmappedCqiValues.length} unmapped CriteriaIQ values</span>
                    </div>
                  )}
                  {unmappedSfValues.length > 0 && (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      <span>{tc('crmSync.values.unmapped', { count: unmappedSfValues.length })}</span>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              <div className="border rounded-lg p-4 bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 mb-3">
                  <PlayCircle className="h-4 w-4 text-indigo-600" />
                  <h4 className="font-medium">Translation Simulator</h4>
                  <Badge variant="outline" className="text-xs">Test your mappings</Badge>
                  {mapping.isCaseInsensitive && (
                    <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">
                      <CaseSensitive className="h-3 w-3 mr-1" />
                      Case Insensitive
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Enter a value to test how it will be translated during sync. This uses your configured translations above.
                  {mapping.isCaseInsensitive && ' Matching will ignore case differences (e.g., "Active" matches "ACTIVE").'}
                </p>
                <div className="flex items-end gap-4">
                  <div className="flex-1">
                    <Label htmlFor="simulator-value" className="text-sm">Input Value</Label>
                    <Input
                      id="simulator-value"
                      value={simulatorValue}
                      onChange={(e) => {
                        setSimulatorValue(e.target.value);
                        setSimulatorResult(null);
                      }}
                      placeholder={simulatorDirection === 'outbound' ? 'Enter CriteriaIQ value' : tc('crmSync.values.enterPlaceholder')}
                    />
                  </div>
                  <div className="w-[180px]">
                    <Label className="text-sm">Direction</Label>
                    <Select 
                      value={simulatorDirection} 
                      onValueChange={(value: 'inbound' | 'outbound') => {
                        setSimulatorDirection(value);
                        setSimulatorResult(null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">
                          <div className="flex items-center gap-2">
                            <ArrowRight className="h-3 w-3" />
                            {tc('crmSync.values.simOutbound')}
                          </div>
                        </SelectItem>
                        <SelectItem value="inbound">
                          <div className="flex items-center gap-2">
                            <ArrowLeft className="h-3 w-3" />
                            {tc('crmSync.values.simInbound')}
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => {
                      if (simulatorValue.trim()) {
                        testTranslationMutation.mutate({ value: simulatorValue.trim(), direction: simulatorDirection });
                      }
                    }}
                    disabled={!simulatorValue.trim() || testTranslationMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {testTranslationMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <PlayCircle className="h-4 w-4 mr-1" />
                    )}
                    Test
                  </Button>
                </div>

                {simulatorResult && (
                  <div className={`mt-4 p-3 rounded-lg border ${
                    simulatorResult.success 
                      ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' 
                      : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {simulatorResult.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className={`font-medium text-sm ${simulatorResult.success ? 'text-green-700' : 'text-red-700'}`}>
                        {simulatorResult.success ? 'Translation Result' : 'Translation Failed'}
                      </span>
                      <Badge variant="outline" className={`text-xs ${
                        simulatorResult.source === 'exact_match' ? 'bg-green-100 text-green-700 border-green-200' :
                        simulatorResult.source === 'primary_outbound' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        simulatorResult.source === 'default' ? 'bg-yellow-100 text-yellow-700 border-yellow-200' :
                        simulatorResult.source === 'passthrough' ? 'bg-gray-100 text-gray-700 border-gray-200' :
                        'bg-red-100 text-red-700 border-red-200'
                      }`}>
                        {simulatorResult.source === 'exact_match' ? 'Exact Match' :
                         simulatorResult.source === 'primary_outbound' ? 'Primary Outbound' :
                         simulatorResult.source === 'default' ? 'Default' :
                         simulatorResult.source === 'passthrough' ? 'Passthrough' :
                         'Error'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 font-mono text-sm">
                      <span className="text-muted-foreground">{simulatorResult.inputValue}</span>
                      {simulatorDirection === 'outbound' ? (
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className={simulatorResult.success ? 'text-green-700 dark:text-green-400 font-semibold' : 'text-red-700 dark:text-red-400'}>
                        {simulatorResult.outputValue || '(no value)'}
                      </span>
                    </div>
                    {simulatorResult.sourceDetails && (
                      <p className="text-xs text-muted-foreground mt-2">{simulatorResult.sourceDetails}</p>
                    )}
                    {simulatorResult.error && (
                      <p className="text-xs text-red-600 mt-2">{simulatorResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4 mr-2" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
