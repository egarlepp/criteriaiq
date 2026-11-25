// Work › Projects Workspace › {{record}} Requests: every evaluation request
// the viewer can see, across accounts. Admins see all; everyone else sees
// their own requests on accounts they can access (server-side scoping in
// GET /api/evaluation-requests). Rows open the same View / Edit dialog as
// the per-account Requests drawer. See docs/features/evaluation-requests.md.
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, Clock, Edit, Eye, Package, PackageCheck, Trash2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { showErrorToast, showSuccessToast } from '@/lib/toast-helper';
import { useAuth } from '@/hooks/useAuth';
import { useValidationRecordLabel } from '@/hooks/use-validation-record-label';
import { sortRows, useUrlSortState } from '@/lib/sorting';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table';
import { TablePaginationFooter } from '@/components/ui/table-pagination-footer';
import { ResponsiveTableActionsMenu } from '@/components/ui/table-actions-menu';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { SearchFiltersSection, FilterLabel } from '@/components/ui/search-filters-section';
import { MetricCard } from '@/components/shared/MetricCard';
import EvaluationRequestDialog from './EvaluationRequestDialog';
import {
  type EvaluationRequestDetail,
  REQUEST_STATUSES,
  formatRequestDay,
  formatRequestTimestamp,
  requestStatusBadgeClass,
} from './evaluation-request-utils';

const PAGE_SIZE = 25;

interface EvaluationRequestsSectionProps {
  filterContainerRef?: RefObject<HTMLDivElement | null>;
  actionContainerRef?: RefObject<HTMLDivElement | null>;
  onFilterStateChange?: (count: number, clearFn: () => void) => void;
}

type DialogState =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'existing'; id: number; mode: 'view' | 'edit' };

export default function EvaluationRequestsSection({
  filterContainerRef,
  actionContainerRef,
  onFilterStateChange,
}: EvaluationRequestsSectionProps) {
  const { t } = useTranslation();
  const record = useValidationRecordLabel();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'Admin';

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, handleSort] = useUrlSortState('evalRequests');
  const [dialog, setDialog] = useState<DialogState>({ kind: 'closed' });
  const [pendingDelete, setPendingDelete] = useState<EvaluationRequestDetail | null>(null);

  // A link from another app (DemoIQ) opens one request: ?requestId=<id>.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get('requestId');
    if (raw && /^\d{1,9}$/.test(raw)) setDialog({ kind: 'existing', id: Number(raw), mode: 'view' });
  }, []);

  const { data: requests = [], isLoading, isError } = useQuery<EvaluationRequestDetail[]>({
    queryKey: ['/api/evaluation-requests', 'all'],
    queryFn: () => apiRequest('GET', '/api/evaluation-requests'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/evaluation-requests/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests/count'] });
      showSuccessToast('common.success', t('requests.toasts.deleted', { record }));
    },
    onError: (error: Error) => {
      showErrorToast('common.error', error?.message || t('requests.toasts.deleteFailed', { record }));
    },
  });

  // ── Filters ────────────────────────────────────────────────────────────────
  const accounts = useMemo(() => {
    const byId = new Map<number, string>();
    for (const r of requests) {
      byId.set(r.customerId, r.customerName || t('requests.drawer.customerFallback', { id: r.customerId }));
    }
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [requests, t]);

  const activeFilterCount =
    (searchTerm ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0) + (accountFilter !== 'all' ? 1 : 0);

  const clearFilters = useCallback(() => {
    setSearchTerm('');
    setStatusFilter('all');
    setAccountFilter('all');
  }, []);

  useEffect(() => {
    onFilterStateChange?.(activeFilterCount, clearFilters);
  }, [activeFilterCount, clearFilters, onFilterStateChange]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, accountFilter, sortConfig]);

  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status.toLowerCase() !== statusFilter) return false;
      if (accountFilter !== 'all' && String(r.customerId) !== accountFilter) return false;
      if (!needle) return true;
      return [r.customerName, r.requesterName, r.topReasons, r.compellingEvent, ...r.requestedSolutions, `#${r.id}`]
        .some((value) => value?.toLowerCase().includes(needle));
    });
  }, [requests, searchTerm, statusFilter, accountFilter]);

  // Default order is newest first (the API's order).
  const sorted = useMemo(
    () =>
      sortRows(filtered, sortConfig, {
        id: (r) => r.id,
        account: (r) => r.customerName ?? '',
        solutions: (r) => r.requestedSolutions.join(', '),
        startDate: (r) => (r.startDate ? new Date(r.startDate) : null),
        endDate: (r) => (r.endDate ? new Date(r.endDate) : null),
        requester: (r) => r.requesterName ?? '',
        status: (r) => t(`requests.status.${r.status.toLowerCase()}`, { defaultValue: r.status }),
        createdAt: (r) => (r.createdAt ? new Date(r.createdAt) : null),
      }),
    [filtered, sortConfig, t],
  );

  const pageRows = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const openCount = requests.filter((r) => r.status.toLowerCase() !== 'closed').length;
  const closedCount = requests.length - openCount;

  const filterContent = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5 flex-1 min-w-[200px]">
        <FilterLabel htmlFor="eval-requests-search">{t('common.search')}</FilterLabel>
        <Input
          id="eval-requests-search"
          placeholder={t('requests.page.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-9 text-sm"
        />
      </div>
      <div className="space-y-1.5 min-w-[160px]">
        <FilterLabel>{t('common.status')}</FilterLabel>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-sm" aria-label={t('common.status')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['all', ...REQUEST_STATUSES] as const).map((status) => (
              <SelectItem key={status} value={status}>
                {t(`requests.status.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5 min-w-[200px]">
        <FilterLabel>{t('requests.page.account')}</FilterLabel>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="h-9 text-sm" aria-label={t('requests.page.account')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('requests.page.allAccounts')}</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={String(account.id)}>
                {account.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  const newRequestButton = (
    <Button size="sm" onClick={() => setDialog({ kind: 'create' })} className="flex items-center gap-2">
      <Package className="h-4 w-4" />
      {t('requests.drawer.newRequest')}
    </Button>
  );

  return (
    <div className="space-y-4" data-testid="evaluation-requests-section">
      {filterContainerRef?.current ? (
        createPortal(filterContent, filterContainerRef.current)
      ) : (
        <SearchFiltersSection activeFilterCount={activeFilterCount} onClearFilters={clearFilters} actions={newRequestButton}>
          {filterContent}
        </SearchFiltersSection>
      )}
      {filterContainerRef?.current && actionContainerRef?.current && createPortal(newRequestButton, actionContainerRef.current)}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          title={t('requests.page.metricTotal', { record })}
          value={requests.length}
          sub={t('requests.page.metricTotalSub')}
          icon={<PackageCheck />}
          color="blue"
          loading={isLoading}
        />
        <MetricCard
          title={t('requests.page.metricOpen')}
          value={openCount}
          sub={t('requests.page.metricOpenSub')}
          icon={<Clock />}
          color="amber"
          loading={isLoading}
        />
        <MetricCard
          title={t('requests.page.metricClosed')}
          value={closedCount}
          sub={t('requests.page.metricClosedSub')}
          icon={<CheckCircle />}
          color="green"
          loading={isLoading}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isError ? (
            <p className="p-6 text-sm text-red-600 dark:text-red-400">{t('requests.drawer.loadError', { record })}</p>
          ) : isLoading ? (
            <div className="space-y-2 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('requests.drawer.emptyTitle')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {requests.length === 0 ? t('requests.drawer.emptyNone', { record }) : t('requests.drawer.emptyFiltered')}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="id" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.page.colId')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="account" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.page.account')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="solutions" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.dialog.solutions')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="startDate" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.dialog.startDate')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="endDate" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.dialog.endDate')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="requester" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.dialog.requester')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>
                      {t('common.status')}
                    </SortableTableHead>
                    <SortableTableHead sortKey="createdAt" sortConfig={sortConfig} onSort={handleSort}>
                      {t('requests.dialog.submittedOn')}
                    </SortableTableHead>
                    <SortableTableHead sortable={false} align="right">
                      {t('common.actions')}
                    </SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((request) => {
                    const canDelete = isAdmin || request.userId === user?.id;
                    return (
                      <TableRow key={request.id} data-testid={`evaluation-request-row-${request.id}`}>
                        <TableCell className="tabular-nums text-gray-600 dark:text-gray-400">#{request.id}</TableCell>
                        <TableCell className="font-medium">
                          <button
                            type="button"
                            className="text-left text-primary hover:underline"
                            onClick={() => setDialog({ kind: 'existing', id: request.id, mode: 'view' })}
                          >
                            {request.customerName || t('requests.drawer.customerFallback', { id: request.customerId })}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[260px]">
                            {request.requestedSolutions.map((name) => (
                              <Badge key={name} variant="secondary" className="text-xs">
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatRequestDay(request.startDate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{formatRequestDay(request.endDate)}</TableCell>
                        <TableCell className="text-sm">{request.requesterName || t('requests.dialog.unknownRequester')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={requestStatusBadgeClass(request.status)}>
                            {t(`requests.status.${request.status.toLowerCase()}`, { defaultValue: request.status }).toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                          {formatRequestTimestamp(request.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <ResponsiveTableActionsMenu
                            actions={[
                              {
                                id: 'view',
                                label: t('requests.drawer.view'),
                                icon: Eye,
                                onClick: () => setDialog({ kind: 'existing', id: request.id, mode: 'view' }),
                              },
                              {
                                id: 'edit',
                                label: t('common.edit'),
                                icon: Edit,
                                onClick: () => setDialog({ kind: 'existing', id: request.id, mode: 'edit' }),
                              },
                              {
                                id: 'delete',
                                label: t('common.delete'),
                                icon: Trash2,
                                variant: 'destructive',
                                hidden: !canDelete,
                                onClick: () => setPendingDelete(request),
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <TablePaginationFooter
                totalItems={sorted.length}
                pageSize={PAGE_SIZE}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                summary={t('requests.page.showing', {
                  from: (currentPage - 1) * PAGE_SIZE + 1,
                  to: Math.min(currentPage * PAGE_SIZE, sorted.length),
                  total: sorted.length,
                })}
                className="px-4 pb-4"
              />
            </>
          )}
        </CardContent>
      </Card>

      <EvaluationRequestDialog
        isOpen={dialog.kind !== 'closed'}
        onClose={() => setDialog({ kind: 'closed' })}
        requestId={dialog.kind === 'existing' ? dialog.id : null}
        initialMode={dialog.kind === 'existing' ? dialog.mode : 'view'}
      />

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t('requests.page.deleteTitle', { record })}
        description={t('requests.page.deleteBody', {
          id: pendingDelete?.id ?? '',
          account: pendingDelete?.customerName ?? '',
        })}
        confirmLabel={t('common.delete')}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
