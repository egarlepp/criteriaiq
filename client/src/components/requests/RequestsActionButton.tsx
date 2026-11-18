import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Package, MonitorCog } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useValidationRecordLabel } from '@/hooks/use-validation-record-label';
import RequestsDrawer from './RequestsDrawer';
import EvaluationRequestDialog from './EvaluationRequestDialog';

interface RequestsActionButtonProps {
  customerId?: number;
  userId?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showText?: boolean;
  title?: string;
  icon?: 'package' | 'monitor-cog';
}

export default function RequestsActionButton({
  customerId,
  userId,
  variant = 'ghost',
  size = 'sm',
  className = '',
  showText = false,
  title,
  icon = 'package',
}: RequestsActionButtonProps) {
  const { t } = useTranslation();
  // Admin-chosen name for the validation record (Evaluation, POC, POV, ...).
  const record = useValidationRecordLabel();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Request opened from the drawer's View / Edit buttons (null = new request).
  const [activeRequest, setActiveRequest] = useState<{ id: number; mode: 'view' | 'edit' } | null>(null);
  const queryClient = useQueryClient();

  // Fetch evaluation requests count for notification dot
  const { data: countResponse = { count: 0 }, error: countError } = useQuery<{ count: number }>({
    queryKey: ['/api/evaluation-requests/count', customerId, userId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (customerId) params.append('customerId', customerId.toString());
      if (userId) params.append('userId', userId);
      
      const queryString = params.toString();
      const response = await apiRequest('GET', `/api/evaluation-requests/count${queryString ? `?${queryString}` : ''}`);
      
      // Handle both {count: number} and direct number responses
      if (typeof response === 'number') {
        return { count: response };
      }
      return response;
    },
    staleTime: 60000, // 1 minute
    refetchInterval: 300000, // 5 minutes
    retry: 3,
    retryDelay: 1000,
  });

  // Extract count with fallback to 0 on error or invalid response
  const requestsCount = countError ? 0 : (countResponse?.count ?? 0);

  const handleButtonClick = () => {
    setIsDrawerOpen(true);
  };

  const handleCreateRequest = () => {
    setActiveRequest(null);
    setIsDrawerOpen(false);
    setIsDialogOpen(true);
  };

  const openExistingRequest = (id: number, mode: 'view' | 'edit') => {
    setActiveRequest({ id, mode });
    setIsDrawerOpen(false);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    // Back to the list the request was opened from.
    if (activeRequest) {
      setActiveRequest(null);
      setIsDrawerOpen(true);
    }
  };

  const handleRequestCreated = () => {
    // Invalidate queries to refresh counts and lists
    queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests/count'] });
    queryClient.invalidateQueries({ queryKey: ['/api/evaluation-requests'] });
    setIsDialogOpen(false);
  };

  const buttonText = showText ? t('requests.button.text') : undefined;
  const tooltipTitle = title || (customerId
    ? t('requests.button.tooltipAccount', { record })
    : userId
    ? t('requests.button.tooltipUser', { record })
    : t('requests.button.tooltip', { record })
  );

  const IconComponent = icon === 'monitor-cog' ? MonitorCog : Package;

  return (
    <>
      <Tooltip>
        <div className="relative inline-block">
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={icon === 'monitor-cog' ? 'icon' : size}
              onClick={handleButtonClick}
              // monitor-cog (Account Portal header) matches the header's other icon buttons: 36px, 20px icon.
              className={`${icon === 'monitor-cog' ? 'h-9 w-9 [&>svg]:!h-5 [&>svg]:!w-5' : 'h-8 w-8 [&>svg]:!h-4 [&>svg]:!w-4 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40'} p-0 rounded-lg ${className}`}
            >
              <IconComponent className="shrink-0" />
              {buttonText}
              
              {/* Notification dot/badge */}
              {requestsCount > 0 && (
                <>
                  {requestsCount <= 99 ? (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs font-medium min-w-[20px]"
                    >
                      {requestsCount}
                    </Badge>
                  ) : (
                    <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-5 w-6 rounded-full p-0 flex items-center justify-center text-xs font-medium"
                    >
                      99+
                    </Badge>
                  )}
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {tooltipTitle}
          </TooltipContent>
        </div>
      </Tooltip>
      {/* Requests Drawer */}
      <RequestsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        selectedCustomerId={customerId}
        selectedUserId={userId}
        onCreateRequest={handleCreateRequest}
        onViewRequest={(requestId) => openExistingRequest(requestId, 'view')}
        onEditRequest={(requestId) => openExistingRequest(requestId, 'edit')}
      />
      {/* Evaluation Request Dialog */}
      <EvaluationRequestDialog
        isOpen={isDialogOpen}
        onClose={handleDialogClose}
        selectedCustomerId={customerId}
        onRequestCreated={handleRequestCreated}
        requestId={activeRequest?.id ?? null}
        initialMode={activeRequest?.mode ?? 'view'}
      />
    </>
  );
}