import { SolutionGraphic } from "@/components/ui/solution-graphic";
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { showErrorToast, showSuccessToast } from "@/lib/toast-helper";
import { useValidationRecordLabel } from '@/hooks/use-validation-record-label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { X, Package, Save, AlertCircle } from 'lucide-react';
import { SolutionBadge } from '@/components/ui/solution-badge';
import { DatePickerInput } from '@/components/ui/date-picker-input';
import { apiRequest } from '@/lib/queryClient';
import EvaluationRequestDetails from './EvaluationRequestDetails';
import {
  type EvaluationRequestDetail,
  type EvaluationRequestDialogMode,
  REQUEST_STATUSES,
  toDateInputValue,
} from './evaluation-request-utils';

// Form validation schema; messages are translated by the caller. Field
// names match the evaluation_requests columns the API stores.
const buildEvaluationRequestSchema = (messages: {
  customerRequired: string;
  solutionsRequired: string;
  startDateRequired: string;
  endDateRequired: string;
  endBeforeStart: string;
  topReasonsRequired: string;
  compellingEventRequired: string;
}) =>
  z
    .object({
      customerId: z.string().min(1, messages.customerRequired),
      solutionIds: z.array(z.string()).min(1, messages.solutionsRequired),
      startDate: z.string().min(1, messages.startDateRequired),
      endDate: z.string().min(1, messages.endDateRequired),
      topReasons: z.string().trim().min(1, messages.topReasonsRequired).max(5000),
      compellingEvent: z.string().trim().min(1, messages.compellingEventRequired).max(5000),
      status: z.enum(REQUEST_STATUSES),
    })
    // yyyy-MM-dd strings compare correctly as text.
    .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
      message: messages.endBeforeStart,
      path: ['endDate'],
    });

type FormData = z.infer<ReturnType<typeof buildEvaluationRequestSchema>>;

const emptyFormValues = (customerId?: number): FormData => ({
  customerId: customerId?.toString() || '',
  solutionIds: [],
  startDate: '',
  endDate: '',
  topReasons: '',
  compellingEvent: '',
  status: 'open',
});

const formValuesFromRequest = (request: EvaluationRequestDetail): FormData => ({
  customerId: request.customerId.toString(),
  solutionIds: request.solutionIds.map((id) => id.toString()),
  startDate: toDateInputValue(request.startDate),
  endDate: toDateInputValue(request.endDate),
  topReasons: request.topReasons ?? '',
  compellingEvent: request.compellingEvent ?? '',
  status: request.status === 'closed' ? 'closed' : 'open',
});

interface Customer {
  id: number;
  accountName: string;
  region: string;
  isActive: boolean;
}

interface Product {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  solutionIcon?: string | null; solutionIconName?: string | null;
}

interface EvaluationRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomerId?: number;
  onRequestCreated?: () => void;
  /** Request to show or edit; leave out to submit a new one. */
  requestId?: number | null;
  /** Opening mode when requestId is set. View can switch to Edit. */
  initialMode?: Exclude<EvaluationRequestDialogMode, 'create'>;
}

export default function EvaluationRequestDialog({
  isOpen,
  onClose,
  selectedCustomerId,
  onRequestCreated,
  requestId,
  initialMode = 'view',
}: EvaluationRequestDialogProps) {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<EvaluationRequestDialogMode>(requestId ? initialMode : 'create');
  const isExisting = mode !== 'create';

  const schema = useMemo(
    () =>
      buildEvaluationRequestSchema({
        customerRequired: t('requests.dialog.customerRequired'),
        solutionsRequired: t('requests.dialog.solutionsRequired'),
        startDateRequired: t('requests.dialog.startDateRequired'),
        endDateRequired: t('requests.dialog.endDateRequired'),
        endBeforeStart: t('requests.dialog.endBeforeStart'),
        topReasonsRequired: t('requests.dialog.topReasonsRequired'),
        compellingEventRequired: t('requests.dialog.compellingEventRequired'),
      }),
    [t],
  );

  // Form setup
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: emptyFormValues(selectedCustomerId),
  });

  // Fetch the request being viewed or edited
  const {
    data: existingRequest,
    isLoading: isLoadingRequest,
    error: requestError,
  } = useQuery<EvaluationRequestDetail>({
    queryKey: ['/api/evaluation-requests', 'detail', requestId],
    queryFn: () => apiRequest('GET', `/api/evaluation-requests/${requestId}`),
    enabled: isOpen && !!requestId,
  });

  // Pick the mode each time the dialog opens
  useEffect(() => {
    if (isOpen) {
      setMode(requestId ? initialMode : 'create');
    }
  }, [isOpen, requestId, initialMode]);

  // Reset the form when the dialog opens, the mode changes or the request loads
  useEffect(() => {
    if (!isOpen) return;
    if (mode === 'create') {
      form.reset(emptyFormValues(selectedCustomerId));
    } else if (existingRequest) {
      form.reset(formValuesFromRequest(existingRequest));
    }
  }, [isOpen, mode, existingRequest, selectedCustomerId, form]);

  // Fetch customers
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    queryFn: () => apiRequest('GET', '/api/customers'),
    enabled: isOpen,
  });

  // Fetch products/solutions
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/public/products'],
    queryFn: () => apiRequest('GET', '/api/public/products'),
    enabled: isOpen,
  });

  // Filter active customers and products
  const activeCustomers = customers.filter(customer => customer.isActive);
  const activeProducts = products.filter(product => product.isActive);

  // Watch selected solutions from form
  const selectedSolutions = form.watch('solutionIds') || [];

  const invalidateRequests = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests'] });
    queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests/count'] });
  };

  // Create evaluation request mutation
  const createEvaluationRequestMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const requestData = {
        customerId: parseInt(data.customerId),
        solutionIds: data.solutionIds.map(id => parseInt(id)),
        startDate: data.startDate,
        endDate: data.endDate,
        topReasons: data.topReasons,
        compellingEvent: data.compellingEvent,
      };

      return await apiRequest('POST', '/api/evaluation-requests', requestData);
    },
    onSuccess: () => {
      invalidateRequests();
      showSuccessToast('common.success', t('requests.toasts.submitted', { record }));
      onClose();
      if (onRequestCreated) {
        onRequestCreated();
      }
    },
    onError: (error: any) => {
      showErrorToast('common.error', error?.message || t('requests.toasts.submitFailed', { record }));
    },
  });

  // Update evaluation request mutation (edit form and Close/Reopen)
  const updateEvaluationRequestMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) =>
      apiRequest('PATCH', `/api/evaluation-requests/${requestId}`, updates),
    onSuccess: () => {
      invalidateRequests();
      showSuccessToast('common.success', t('requests.toasts.updated', { record }));
      setMode('view');
    },
    onError: (error: any) => {
      showErrorToast('common.error', error?.message || t('requests.toasts.updateFailed', { record }));
    },
  });

  const isSaving = createEvaluationRequestMutation.isPending || updateEvaluationRequestMutation.isPending;

  // Add a solution to the selection
  const addSolution = (solutionId: string) => {
    const currentSolutions = form.getValues('solutionIds');
    if (!currentSolutions.includes(solutionId)) {
      form.setValue('solutionIds', [...currentSolutions, solutionId]);
    }
  };

  // Remove a solution from the selection
  const removeSolution = (solutionId: string) => {
    const currentSolutions = form.getValues('solutionIds');
    form.setValue('solutionIds', currentSolutions.filter(id => id !== solutionId));
  };

  const onSubmit = (data: FormData) => {
    if (mode === 'edit') {
      updateEvaluationRequestMutation.mutate({
        solutionIds: data.solutionIds.map(id => parseInt(id)),
        startDate: data.startDate,
        endDate: data.endDate,
        topReasons: data.topReasons,
        compellingEvent: data.compellingEvent,
        status: data.status,
      });
      return;
    }
    createEvaluationRequestMutation.mutate(data);
  };

  const handleCancel = () => {
    // Cancelling an edit opened from View goes back to View.
    if (mode === 'edit' && initialMode === 'view') {
      setMode('view');
      return;
    }
    onClose();
  };

  const dialogTitle =
    mode === 'view'
      ? t('requests.dialog.titleView', { record, id: requestId })
      : mode === 'edit'
        ? t('requests.dialog.titleEdit', { record })
        : t('requests.dialog.title', { record });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" />{dialogTitle}</DialogTitle>
        </DialogHeader>

        {isExisting && isLoadingRequest ? (
          <div className="space-y-3 animate-pulse" aria-busy="true">
            <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2" />
            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-3/4" />
          </div>
        ) : isExisting && (requestError || !existingRequest) ? (
          <div className="text-center py-6">
            <AlertCircle className="mx-auto h-10 w-10 text-red-400 dark:text-red-500 mb-3" />
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('requests.dialog.loadError', { record })}</p>
          </div>
        ) : mode === 'view' && existingRequest ? (
          <EvaluationRequestDetails
            request={existingRequest}
            onClose={onClose}
            onEdit={() => setMode('edit')}
            isUpdatingStatus={updateEvaluationRequestMutation.isPending}
            onToggleStatus={() =>
              updateEvaluationRequestMutation.mutate({
                status: existingRequest.status === 'closed' ? 'open' : 'closed',
              })
            }
          />
        ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Customer Selection */}
            <FormField
              control={form.control}
              name="customerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('requests.dialog.customer')} *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={!!selectedCustomerId || isExisting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('requests.dialog.selectCustomer')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {activeCustomers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id.toString()}>
                          {customer.accountName} ({customer.region})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Solutions Selection */}
            <FormField
              control={form.control}
              name="solutionIds"
              render={() => (
                <FormItem>
                  <FormLabel>{t('requests.dialog.solutions')} *</FormLabel>
                  <FormDescription>
                    {t('requests.dialog.solutionsHelp', { record })}
                  </FormDescription>

                  {/* Dropdown */}
                  <Select
                    value=""
                    onValueChange={(value) => addSolution(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={selectedSolutions.length > 0 ? t('requests.dialog.addMoreSolutions') : t('requests.dialog.selectSolutions')} />
                    </SelectTrigger>
                    <SelectContent>
                      {activeProducts.map((product) => (
                        <SelectItem
                          key={product.id}
                          value={product.id.toString()}
                          disabled={selectedSolutions.includes(product.id.toString())}
                        >
                          <div className="flex items-center gap-2">
                            <SolutionGraphic graphic={product.solutionIcon} icon={product.solutionIconName} name={product.name} className="w-5 h-5 object-contain shrink-0" />
                            <span>{product.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Selected solution badges */}
                  {selectedSolutions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedSolutions.map((id) => {
                        const product = activeProducts.find(p => p.id.toString() === id);
                        if (!product) return null;
                        return (
                          <div key={id} className="flex items-center gap-0.5">
                            <SolutionBadge
                              solutionName={product.name}
                              solutionIcon={product.solutionIcon} solutionIconName={product.solutionIconName}
                            />
                            <button
                              type="button"
                              onClick={() => removeSolution(id)}
                              aria-label={t('requests.dialog.removeSolution', { name: product.name })}
                              className="text-gray-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400 rounded-full w-4 h-4 flex items-center justify-center text-xs"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Start and End Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('requests.dialog.startDate')} *</FormLabel>
                    <FormControl>
                      <DatePickerInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('requests.dialog.datePlaceholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('requests.dialog.endDate')} *</FormLabel>
                    <FormControl>
                      <DatePickerInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('requests.dialog.datePlaceholder')}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Top Reasons */}
            <FormField
              control={form.control}
              name="topReasons"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('requests.dialog.topReasons')} *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('requests.dialog.topReasonsPlaceholder', { record })}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('requests.dialog.topReasonsHelp')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Compelling Event */}
            <FormField
              control={form.control}
              name="compellingEvent"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('requests.dialog.compellingEvent')} *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('requests.dialog.compellingEventPlaceholder')}
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    {t('requests.dialog.compellingEventHelp', { record })}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Status (edit only) */}
            {mode === 'edit' && (
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('requests.dialog.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REQUEST_STATUSES.map((status) => (
                          <SelectItem key={status} value={status}>
                            {t(`requests.status.${status}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSaving}
              >
                <X className="h-4 w-4 mr-2" />
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
              >
                {mode === 'edit' ? (
                  updateEvaluationRequestMutation.isPending ? (
                    t('common.saving')
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {t('common.saveChanges')}
                    </>
                  )
                ) : createEvaluationRequestMutation.isPending ? (
                  t('requests.dialog.submitting')
                ) : (
                  <>
                    <Package className="h-4 w-4 mr-2" />
                    {t('requests.dialog.submit')}
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}