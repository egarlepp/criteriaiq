import React from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Search, 
  Calendar, 
  Building, 
  Package, 
  Clock, 
  CheckCircle,
  AlertCircle,
  Eye,
  Edit,
  Plus 
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useValidationRecordLabel } from '@/hooks/use-validation-record-label';
import { useState } from 'react';
import {
  type EvaluationRequestDetail,
  REQUEST_STATUSES,
  formatRequestDay,
  formatRequestTimestamp,
  requestStatusBadgeClass,
} from './evaluation-request-utils';

const REQUEST_STATUS_FILTERS = ['all', ...REQUEST_STATUSES] as const;

interface RequestsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomerId?: number;
  selectedUserId?: string;
  onCreateRequest?: () => void;
  onViewRequest?: (requestId: number) => void;
  onEditRequest?: (requestId: number) => void;
}

const getStatusIcon = (status: string) =>
  status.toLowerCase() === 'closed' ? (
    <CheckCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" />
  ) : (
    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
  );

export default function RequestsDrawer({
  isOpen,
  onClose,
  selectedCustomerId,
  selectedUserId,
  onCreateRequest,
  onViewRequest,
  onEditRequest,
}: RequestsDrawerProps) {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Fetch evaluation requests
  const { data: requests = [], isLoading, error } = useQuery<EvaluationRequestDetail[]>({
    queryKey: ['/api/evaluation-requests', selectedCustomerId, selectedUserId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedCustomerId) params.append('customerId', selectedCustomerId.toString());
      if (selectedUserId) params.append('userId', selectedUserId);
      
      const queryString = params.toString();
      return apiRequest('GET', `/api/evaluation-requests${queryString ? `?${queryString}` : ''}`);
    },
    enabled: isOpen,
    staleTime: 30000, // 30 seconds
  });

  // Filter requests based on search and status
  const filteredRequests = requests.filter(request => {
    const needle = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      request.customerName?.toLowerCase().includes(needle) ||
      request.topReasons?.toLowerCase().includes(needle) ||
      request.compellingEvent?.toLowerCase().includes(needle) ||
      request.requesterName?.toLowerCase().includes(needle) ||
      request.requestedSolutions?.some(solution => solution.toLowerCase().includes(needle));

    const matchesStatus = statusFilter === 'all' || request.status.toLowerCase() === statusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent 
        side="right" 
        className="w-[90vw] sm:w-[60vw] md:w-[50vw] lg:w-[40vw] min-w-[320px] sm:min-w-[600px] max-w-[800px] p-0"
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center gap-4">
              <SheetTitle className="flex items-center gap-2 flex-1">
                <Package className="h-5 w-5" />
                {t('requests.drawer.title', { record })}
                {(selectedCustomerId || selectedUserId) && (
                  <Badge variant="outline" className="ml-2 bg-gray-700 text-white border-gray-700 dark:bg-gray-600 dark:border-gray-600">
                    {selectedCustomerId && selectedUserId ? t('requests.drawer.scopeAccountUser') :
                     selectedCustomerId ? t('requests.drawer.scopeAccount') :
                     t('requests.drawer.scopeUser')}
                  </Badge>
                )}
              </SheetTitle>
              {onCreateRequest && (
                <Button
                  size="sm"
                  onClick={onCreateRequest}
                  className="flex items-center gap-2 mr-8"
                >
                  <Package className="h-4 w-4" />
                  {t('requests.drawer.newRequest')}
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Filters */}
          <div className="px-6 py-4 border-b bg-gray-50 dark:bg-slate-900 dark:border-slate-800">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                <Input
                  placeholder={t('requests.drawer.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="flex gap-4">
                <div className="flex-1">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('requests.drawer.statusPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {REQUEST_STATUS_FILTERS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {t(`requests.status.${status}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  {t('requests.drawer.count', { shown: filteredRequests.length, total: requests.length })}
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-full">
              <div className="p-6">
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i} className="animate-pulse">
                        <CardHeader>
                          <div className="h-4 bg-gray-200 dark:bg-slate-700 rounded w-1/3"></div>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-1/2"></div>
                            <div className="h-3 bg-gray-200 dark:bg-slate-700 rounded w-3/4"></div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <AlertCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {t('requests.drawer.loadErrorTitle')}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {t('requests.drawer.loadError', { record })}
                    </p>
                  </div>
                ) : filteredRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {t('requests.drawer.emptyTitle')}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      {requests.length === 0
                        ? t('requests.drawer.emptyNone', { record })
                        : t('requests.drawer.emptyFiltered')
                      }
                    </p>
                    {onCreateRequest && (
                      <Button onClick={onCreateRequest} className="flex items-center gap-2">
                        <Package className="h-4 w-4" />
                        {t('requests.drawer.createFirst')}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredRequests.map((request) => (
                      <Card key={request.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Building className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              {request.customerName || t('requests.drawer.customerFallback', { id: request.customerId })}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(request.status)}
                              <Badge 
                                variant="outline" 
                                className={requestStatusBadgeClass(request.status)}
                              >
                                {t(`requests.status.${request.status.toLowerCase()}`, { defaultValue: request.status }).toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0">
                          <div className="space-y-3">
                            {/* Solutions */}
                            {request.requestedSolutions && request.requestedSolutions.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  {t('requests.drawer.requestedSolutions')}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {request.requestedSolutions.map((solution, index) => (
                                    <Badge key={index} variant="secondary" className="text-xs">
                                      {solution}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Top Reasons */}
                            {request.topReasons && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                  {t('requests.dialog.topReasons')}
                                </div>
                                <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2">
                                  {request.topReasons}
                                </p>
                              </div>
                            )}

                            {/* Requested dates */}
                            <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                              <Clock className="h-3 w-3" />
                              {t('requests.drawer.dateRange', {
                                start: formatRequestDay(request.startDate),
                                end: formatRequestDay(request.endDate),
                              })}
                            </div>

                            {/* Submitted */}
                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {request.requesterName
                                  ? t('requests.drawer.submittedBy', { date: formatRequestTimestamp(request.createdAt), name: request.requesterName })
                                  : t('requests.drawer.submitted', { date: formatRequestTimestamp(request.createdAt) })}
                              </div>
                              <div>
                                {t('requests.drawer.id', { id: request.id })}
                              </div>
                            </div>
                          </div>

                          {/* Actions */}
                          <Separator className="my-3" />
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex items-center gap-1"
                              onClick={() => onViewRequest?.(request.id)}
                            >
                              <Eye className="h-3 w-3" />
                              {t('requests.drawer.view')}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex items-center gap-1"
                              onClick={() => onEditRequest?.(request.id)}
                            >
                              <Edit className="h-3 w-3" />
                              {t('common.edit')}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}