import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Building, Calendar, Edit, Lock, LockOpen, User, X } from 'lucide-react';
import {
  type EvaluationRequestDetail,
  formatRequestDay,
  formatRequestTimestamp,
  requestStatusBadgeClass,
} from './evaluation-request-utils';

interface EvaluationRequestDetailsProps {
  request: EvaluationRequestDetail;
  onEdit: () => void;
  onClose: () => void;
  onToggleStatus: () => void;
  isUpdatingStatus: boolean;
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</div>
      <div className="text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
  );
}

/** Read-only view of one evaluation request, with Edit and Close/Reopen. */
export default function EvaluationRequestDetails({
  request,
  onEdit,
  onClose,
  onToggleStatus,
  isUpdatingStatus,
}: EvaluationRequestDetailsProps) {
  const { t } = useTranslation();
  const isClosed = request.status.toLowerCase() === 'closed';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
          <Building className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          {request.customerName || t('requests.drawer.customerFallback', { id: request.customerId })}
        </div>
        <Badge variant="outline" className={requestStatusBadgeClass(request.status)}>
          {t(`requests.status.${request.status.toLowerCase()}`, { defaultValue: request.status }).toUpperCase()}
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <DetailField label={t('requests.dialog.startDate')}>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            {formatRequestDay(request.startDate)}
          </span>
        </DetailField>
        <DetailField label={t('requests.dialog.endDate')}>
          <span className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            {formatRequestDay(request.endDate)}
          </span>
        </DetailField>
        <DetailField label={t('requests.dialog.requester')}>
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            {request.requesterName || t('requests.dialog.unknownRequester')}
          </span>
        </DetailField>
        <DetailField label={t('requests.dialog.submittedOn')}>
          {formatRequestTimestamp(request.createdAt)}
        </DetailField>
      </div>

      <DetailField label={t('requests.dialog.solutions')}>
        {request.requestedSolutions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {request.requestedSolutions.map((name) => (
              <Badge key={name} variant="secondary" className="text-xs">
                {name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">{t('requests.dialog.noSolutions')}</span>
        )}
      </DetailField>

      <DetailField label={t('requests.dialog.topReasons')}>
        <p className="whitespace-pre-wrap">{request.topReasons}</p>
      </DetailField>

      <DetailField label={t('requests.dialog.compellingEvent')}>
        <p className="whitespace-pre-wrap">{request.compellingEvent}</p>
      </DetailField>

      <Separator />

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          {t('common.close')}
        </Button>
        <Button type="button" variant="outline" onClick={onToggleStatus} disabled={isUpdatingStatus}>
          {isClosed ? <LockOpen className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
          {isClosed ? t('requests.dialog.reopenRequest') : t('requests.dialog.closeRequest')}
        </Button>
        <Button type="button" onClick={onEdit}>
          <Edit className="h-4 w-4 mr-2" />
          {t('common.edit')}
        </Button>
      </div>
    </div>
  );
}
