import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusConfig } from '@shared/schema';
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit, Trash2, Clock, AlertCircle, Lock, CalendarRange, X, Copy, RotateCcw } from 'lucide-react';
import { LucideIconPicker } from '@/components/ui/lucide-icon-picker';
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { ColorPicker } from '@/components/ui/color-picker';
import { normalizeColor } from '@/lib/color-utils';

interface EndDateFlag {
  id: number;
  name: string;
  description?: string;
  badgeText: string;
  badgeColor: string;
  icon?: string;
  triggerType: string;
  triggerValue: number;
  priority: number;
  projectStatuses?: string[];
  targetField: string;
  workingDays?: boolean;
  isActive: boolean;
  isSystem: boolean;
}

// Predefined list of date fields available for flag targeting (i18n keys, resolved at render time)
const TARGET_DATE_FIELD_KEYS: Array<{ value: string; labelKey: string }> = [
  { value: 'project.endDate',       labelKey: 'shared.endDateFlags.fieldProjectEndDate' },
  { value: 'project.startDate',     labelKey: 'shared.endDateFlags.fieldProjectStartDate' },
  { value: 'project.completedDate', labelKey: 'shared.endDateFlags.fieldProjectCompletedDate' },
  { value: 'dependency.dueDate',    labelKey: 'shared.endDateFlags.fieldDependencyDueDate' },
  { value: 'mapPhase.dueDate',      labelKey: 'shared.endDateFlags.fieldMapPhaseDueDate' },
  { value: 'mapStep.dueDate',       labelKey: 'shared.endDateFlags.fieldMapStepDueDate' },
  { value: 'mapTask.dueDate',       labelKey: 'shared.endDateFlags.fieldMapTaskDueDate' },
];

// Helper function to ensure color values are hex codes (fallback for legacy data)
// normalizeColor and contrastingTextColor imported from @/lib/color-utils

export default function EndDateFlagsSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const TARGET_DATE_FIELDS = TARGET_DATE_FIELD_KEYS.map(f => ({ value: f.value, label: t(f.labelKey) }));
  const getTargetFieldLabel = (value: string): string => TARGET_DATE_FIELDS.find(f => f.value === value)?.label ?? value;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<EndDateFlag | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  
  // Delete confirmation state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteFlag, setPendingDeleteFlag] = useState<EndDateFlag | null>(null);

  const isAdmin = user?.role === 'Admin';
  const [flagForm, setFlagForm] = useState({
    name: '',
    description: '',
    badgeText: '',
    badgeColor: '#DC2626',
    icon: '',
    triggerType: 'days_before',
    triggerValue: 5,
    priority: 1,
    projectStatuses: [] as string[],
    targetField: 'project.endDate',
    workingDays: true,
  });

  // Fetch End Date flags
  const { data: flags = [], isLoading } = useQuery<EndDateFlag[]>({
    queryKey: ['/api/end-date-flags'],
  });

  // Fetch status configurations for multi-select
  const { data: statusConfigs = [] } = useQuery<StatusConfig[]>({
    queryKey: ['/api/status-configs'],
  });

  // Create flag mutation
  const createFlagMutation = useMutation({
    mutationFn: async (flagData: any) => {
      return await apiRequest('POST', '/api/end-date-flags', flagData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags/active'] });
      showSuccessToast(t('shared.endDateFlags.toastSuccess'), t('shared.endDateFlags.toastCreated'));
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      showErrorToast(t('shared.endDateFlags.toastError'), error.message || t('shared.endDateFlags.toastCreateFailed'));
    },
  });

  // Update flag mutation
  const updateFlagMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return await apiRequest('PUT', `/api/end-date-flags/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags/active'] });
      showSuccessToast(t('shared.endDateFlags.toastSuccess'), t('shared.endDateFlags.toastUpdated'));
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      showErrorToast(t('shared.endDateFlags.toastError'), error.message || t('shared.endDateFlags.toastUpdateFailed'));
    },
  });

  // Delete flag mutation
  const deleteFlagMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest('DELETE', `/api/end-date-flags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags/active'] });
      showSuccessToast(t('shared.endDateFlags.toastSuccess'), t('shared.endDateFlags.toastDeleted'));
    },
    onError: (error: any) => {
      showErrorToast(t('shared.endDateFlags.toastError'), error.message || t('shared.endDateFlags.toastDeleteFailed'));
    },
  });

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const resetFlagsMutation = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/end-date-flags/reset-defaults'),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/end-date-flags/active'] });
      const s = data?.summary;
      const parts: string[] = [];
      if (s?.inserted) parts.push(t('shared.endDateFlags.toastResetReCreated', { count: s.inserted }));
      if (s?.updated) parts.push(t('shared.endDateFlags.toastResetRestored', { count: s.updated }));
      if (parts.length === 0) parts.push(t('shared.endDateFlags.toastResetNothing'));
      showSuccessToast(
        t('shared.endDateFlags.toastResetTitle'),
        t('shared.endDateFlags.toastResetSummary', { parts: parts.join(', '), total: s?.totalDefaults ?? 0 })
      );
    },
    onError: (error: any) =>
      showErrorToast(t('shared.endDateFlags.toastResetFailed'), error?.message || t('shared.endDateFlags.toastResetGenericError')),
  });

  const resetForm = () => {
    setFlagForm({
      name: '',
      description: '',
      badgeText: '',
      badgeColor: '#DC2626',
      icon: '',
      triggerType: 'days_before',
      triggerValue: 5,
      priority: 1,
      projectStatuses: [],
      targetField: 'project.endDate',
      workingDays: true,
    });
    setEditingFlag(null);
    setIsDuplicating(false);
  };

  const handleEdit = (flag: EndDateFlag) => {
    if (flag.isSystem && !isAdmin) {
      showWarningToast(t('shared.endDateFlags.toastAccessDenied'), t('shared.endDateFlags.toastAdminEditOnly'));
      return;
    }

    setIsDuplicating(false);
    setEditingFlag(flag);
    setFlagForm({
      name: flag.name,
      description: flag.description || '',
      badgeText: flag.badgeText,
      badgeColor: normalizeColor(flag.badgeColor),
      icon: flag.icon || '',
      triggerType: flag.triggerType,
      triggerValue: flag.triggerValue,
      priority: flag.priority,
      projectStatuses: flag.projectStatuses || [],
      targetField: flag.targetField || 'project.endDate',
      workingDays: flag.workingDays ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleDuplicate = (flag: EndDateFlag) => {
    setEditingFlag(null);
    setIsDuplicating(true);
    setFlagForm({
      name: '',
      description: flag.description || '',
      badgeText: flag.badgeText,
      badgeColor: normalizeColor(flag.badgeColor),
      icon: flag.icon || '',
      triggerType: flag.triggerType,
      triggerValue: flag.triggerValue,
      priority: flag.priority,
      projectStatuses: flag.projectStatuses || [],
      targetField: flag.targetField || 'project.endDate',
      workingDays: flag.workingDays ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!flagForm.name.trim() || !flagForm.badgeText.trim()) {
      showErrorToast(t('shared.endDateFlags.toastError'), t('shared.endDateFlags.toastNameRequired'));
      return;
    }

    // Check for identical rules on the same target field (same field + trigger type + trigger value)
    const conflictingFlag = flags.find(f => {
      if (editingFlag && f.id === editingFlag.id) return false;
      return (
        (f.targetField || 'project.endDate') === flagForm.targetField &&
        f.triggerType === flagForm.triggerType &&
        f.triggerValue === flagForm.triggerValue
      );
    });

    if (conflictingFlag) {
      showErrorToast(t('shared.endDateFlags.toastDuplicateRule'), t('shared.endDateFlags.toastDuplicateMsg', { field: getTargetFieldLabel(flagForm.targetField), name: conflictingFlag.name }));
      return;
    }

    // Only "days before" flags can count working days.
    const payload = { ...flagForm, workingDays: flagForm.triggerType === 'days_before' && flagForm.workingDays };
    if (editingFlag) {
      updateFlagMutation.mutate({ id: editingFlag.id, updates: payload });
    } else {
      createFlagMutation.mutate(payload);
    }
  };

  const handleDelete = (flag: EndDateFlag) => {
    if (flag.isSystem && !isAdmin) {
      showWarningToast(t('shared.endDateFlags.toastAccessDenied'), t('shared.endDateFlags.toastAdminDeleteOnly'));
      return;
    }

    setPendingDeleteFlag(flag);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteFlag = () => {
    if (pendingDeleteFlag) {
      deleteFlagMutation.mutate(pendingDeleteFlag.id);
      setPendingDeleteFlag(null);
    }
  };

  const getTriggerDescription = (flag: EndDateFlag) => {
    switch (flag.triggerType) {
      case 'days_before':
        if (flag.triggerValue === 0) return t('shared.endDateFlags.triggerOnDueDate');
        return flag.workingDays
          ? t('shared.endDateFlags.triggerWorkingDaysBeforeDue', { count: flag.triggerValue })
          : t('shared.endDateFlags.triggerDaysBeforeDue', { count: flag.triggerValue });
      case 'days_after':
        return t('shared.endDateFlags.triggerDaysAfterDue', { count: flag.triggerValue });
      case 'exact_date':
        return t('shared.endDateFlags.triggerExactDateMatch');
      default:
        return t('shared.endDateFlags.triggerUnknown');
    }
  };

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('shared.endDateFlags.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-sm font-medium">
            {t('shared.endDateFlags.flagsConfigured', { count: flags.length })}
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('shared.endDateFlags.appearsIn')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setResetConfirmOpen(true)}
              disabled={resetFlagsMutation.isPending}
              className="flex items-center gap-2"
              title={t('shared.endDateFlags.resetButtonTitle')}
              data-testid="button-reset-end-date-flags"
            >
              <RotateCcw className="h-4 w-4" />
              {t('shared.endDateFlags.resetButton')}
            </Button>
          )}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={resetForm}
              size="sm"
              className="flex items-center gap-2"
            >
              <CalendarRange className="h-4 w-4" />
              {t('shared.endDateFlags.addFlag')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarRange className="h-5 w-5 text-primary shrink-0" />
                {editingFlag ? t('shared.endDateFlags.editFlag') : isDuplicating ? t('shared.endDateFlags.duplicateFlag') : t('shared.endDateFlags.createFlag')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="flag-name">{t('shared.endDateFlags.name')}</Label>
                <Input
                  id="flag-name"
                  value={flagForm.name}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={isDuplicating ? t('shared.endDateFlags.namePlaceholderDuplicate') : t('shared.endDateFlags.namePlaceholder')}
                  autoFocus={isDuplicating}
                />
                {isDuplicating && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {t('shared.endDateFlags.duplicateNameHint')}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="flag-description">{t('shared.endDateFlags.descLabel')}</Label>
                <Textarea
                  id="flag-description"
                  value={flagForm.description}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('shared.endDateFlags.descPlaceholder')}
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="target-field">{t('shared.endDateFlags.targetField')}</Label>
                <Select
                  value={flagForm.targetField}
                  onValueChange={(value) => setFlagForm(prev => ({ ...prev, targetField: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('shared.endDateFlags.selectDateField')} />
                  </SelectTrigger>
                  <SelectContent>
                    {TARGET_DATE_FIELDS.map(field => (
                      <SelectItem key={field.value} value={field.value}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('shared.endDateFlags.targetFieldHint')}
                </p>
              </div>

              <div>
                <Label htmlFor="badge-text">{t('shared.endDateFlags.badgeText')}</Label>
                <Input
                  id="badge-text"
                  value={flagForm.badgeText}
                  onChange={(e) => setFlagForm(prev => ({ ...prev, badgeText: e.target.value }))}
                  placeholder={t('shared.endDateFlags.badgeTextPlaceholder')}
                />
              </div>

              <div>
                <LucideIconPicker
                  label={t('shared.endDateFlags.iconLabel')}
                  value={flagForm.icon}
                  onChange={(icon) => setFlagForm(prev => ({ ...prev, icon }))}
                />
              </div>

              <div className="space-y-2">
                <Label>{t('shared.endDateFlags.badgeColor')}</Label>
                <ColorPicker
                  value={flagForm.badgeColor}
                  onChange={(color) => setFlagForm(prev => ({ ...prev, badgeColor: color }))}
                  size="sm"
                />
              </div>

              <div>
                <Label htmlFor="trigger-type">{t('shared.endDateFlags.triggerType')}</Label>
                <Select
                  value={flagForm.triggerType}
                  onValueChange={(value) => setFlagForm(prev => ({ ...prev, triggerType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days_before">{t('shared.endDateFlags.triggerDaysBefore')}</SelectItem>
                    <SelectItem value="days_after">{t('shared.endDateFlags.triggerDaysAfter')}</SelectItem>
                    <SelectItem value="exact_date">{t('shared.endDateFlags.triggerExactDate')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="trigger-value">
                  {flagForm.triggerType === 'exact_date' ? t('shared.endDateFlags.daysOffset') : t('shared.endDateFlags.numberOfDays')}
                </Label>
                <Input
                  id="trigger-value"
                  type="number"
                  min="0"
                  value={flagForm.triggerValue}
                  onChange={(e) => setFlagForm(prev => ({
                    ...prev,
                    triggerValue: parseInt(e.target.value) || 0
                  }))}
                />
              </div>

              {flagForm.triggerType === 'days_before' && (
                <div className="flex items-start gap-2 rounded-md border border-gray-200 dark:border-gray-700 p-3">
                  <Checkbox
                    id="working-days"
                    checked={flagForm.workingDays}
                    onCheckedChange={(checked) => setFlagForm(prev => ({ ...prev, workingDays: checked === true }))}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="working-days" className="cursor-pointer">
                      {t('shared.endDateFlags.countWorkingDays')}
                    </Label>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('shared.endDateFlags.countWorkingDaysHelp')}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <Label htmlFor="priority">{t('shared.endDateFlags.priority')}</Label>
                <Input
                  id="priority"
                  type="number"
                  min="1"
                  value={flagForm.priority}
                  onChange={(e) => setFlagForm(prev => ({
                    ...prev,
                    priority: parseInt(e.target.value) || 1
                  }))}
                />
              </div>

              <div>
                <Label>{t('shared.endDateFlags.projectStatuses')}</Label>
                <div className="mt-2 space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                  {statusConfigs.map((status) => (
                    <div key={status.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`status-${status.id}`}
                        checked={flagForm.projectStatuses.includes(status.name)}
                        onCheckedChange={(checked) => {
                          setFlagForm(prev => ({
                            ...prev,
                            projectStatuses: checked
                              ? [...prev.projectStatuses, status.name]
                              : prev.projectStatuses.filter(s => s !== status.name)
                          }));
                        }}
                      />
                      <Label htmlFor={`status-${status.id}`} className="text-sm flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('shared.endDateFlags.noStatusesHint')}
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <DialogClose asChild>
                  <Button variant="outline" className="flex items-center gap-1.5">
                    <X className="h-4 w-4" />
                    {t('shared.endDateFlags.cancel')}
                  </Button>
                </DialogClose>
                <Button onClick={handleSubmit} className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" />
                  {editingFlag ? t('shared.endDateFlags.updateFlag') : t('shared.endDateFlags.createFlagBtn')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <ConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title={t('shared.endDateFlags.resetTitle')}
        description={t('shared.endDateFlags.resetDescription')}
        confirmLabel={t('shared.endDateFlags.resetConfirm')}
        cancelLabel={t('shared.endDateFlags.cancel')}
        onConfirm={() => resetFlagsMutation.mutate()}
        variant="destructive"
      />

      {flags.length > 0 ? (
        <div className="space-y-2">
          {flags.map((flag) => (
            <div key={flag.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <Badge
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-white"
                    style={{
                      backgroundColor: normalizeColor(flag.badgeColor)
                    }}
                  >
                    {flag.icon && <DynamicIcon name={flag.icon} className="h-3 w-3" />}
                    {flag.badgeText}
                  </Badge>
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      {flag.name}
                      {flag.isSystem && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          {t('shared.endDateFlags.system')}
                        </Badge>
                      )}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {t('shared.endDateFlags.appearsTrigger', { trigger: getTriggerDescription(flag), priority: flag.priority })}
                      </p>
                      <Badge
                        variant="secondary"
                        className="text-xs flex items-center gap-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 font-medium"
                      >
                        <CalendarRange className="h-3 w-3" />
                        {getTargetFieldLabel(flag.targetField || 'project.endDate')}
                      </Badge>
                    </div>
                    {flag.projectStatuses && flag.projectStatuses.length > 0 && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 block">
                        {t('shared.endDateFlags.showsForStatuses', { statuses: flag.projectStatuses.join(', ') })}
                      </span>
                    )}
                    {flag.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{flag.description}</p>
                    )}
                  </div>
                </div>
              </div>
              <ResponsiveTableActionsMenu
                actions={[
                  {
                    id: 'duplicate',
                    label: t('shared.endDateFlags.duplicateAction'),
                    icon: Copy,
                    onClick: () => handleDuplicate(flag),
                  },
                  {
                    id: 'edit',
                    label: flag.isSystem && !isAdmin ? t('shared.endDateFlags.editDisabledAdmin') : t('shared.endDateFlags.editAction'),
                    icon: Edit,
                    onClick: () => handleEdit(flag),
                    disabled: flag.isSystem && !isAdmin
                  },
                  {
                    id: 'delete',
                    label: flag.isSystem && !isAdmin ? t('shared.endDateFlags.deleteDisabledAdmin') : t('shared.endDateFlags.deleteAction'),
                    icon: Trash2,
                    onClick: () => handleDelete(flag),
                    variant: 'destructive',
                    disabled: flag.isSystem && !isAdmin
                  }
                ]}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
          <p>{t('shared.endDateFlags.noFlagsYet')}</p>
          <p className="text-sm">{t('shared.endDateFlags.addFirstFlag')}</p>
        </div>
      )}

      {/* Preview Section */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg">
        <h4 className="font-medium mb-3">{t('shared.endDateFlags.preview')}</h4>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {t('shared.endDateFlags.previewSubtitle')}
        </p>
        <div className="flex flex-wrap gap-2">
          {flags.filter(f => f.isActive).map((flag) => {
            // Always white text — mirrors EndDateBadge rendering so the preview
            // matches exactly what appears in the dashboard table.
            const normalizedColor = normalizeColor(flag.badgeColor);
            return (
              <div key={flag.id} className="flex flex-col items-center gap-1">
                <Badge
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
                  style={{ backgroundColor: normalizedColor, color: '#FFFFFF' }}
                >
                  {flag.icon && <DynamicIcon name={flag.icon} className="h-3 w-3" />}
                  {flag.badgeText}
                </Badge>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">{getTargetFieldLabel(flag.targetField || 'project.endDate')}</span>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmationDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('shared.endDateFlags.deleteTitle')}
        description={t('shared.endDateFlags.deleteDescription', { name: pendingDeleteFlag?.name ?? '' })}
        confirmLabel={t('shared.endDateFlags.deleteConfirm')}
        cancelLabel={t('shared.endDateFlags.cancel')}
        onConfirm={confirmDeleteFlag}
        onCancel={() => setPendingDeleteFlag(null)}
        variant="destructive"
      />
    </div>
  );
}
