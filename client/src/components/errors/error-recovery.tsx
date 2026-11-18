
import React from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";
import { AlertCircle, RefreshCw, Home, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorRecoveryProps {
  error: any;
  title?: string;
  context?: string;
  onRetry?: () => void;
  onHome?: () => void;
  showDetails?: boolean;
  recoveryActions?: Array<{
    label: string;
    action: () => void;
    variant?: 'default' | 'outline' | 'destructive';
  }>;
}

export function ErrorRecovery({
  error,
  title,
  context,
  onRetry,
  onHome,
  showDetails = false,
  recoveryActions = []
}: ErrorRecoveryProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('errors.recovery.defaultTitle');
  const errorId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const handleHome = () => {
    if (onHome) {
      onHome();
    } else {
      window.location.href = '/';
    }
  };

  const { email: supportEmail } = useBrandingSupportEmail();

  const handleReportBug = () => {
    const errorInfo = {
      title: resolvedTitle,
      context,
      message: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      errorId
    };
    
    const subject = encodeURIComponent(`Bug Report: ${resolvedTitle}`);
    const body = encodeURIComponent(`Error Details:\n${JSON.stringify(errorInfo, null, 2)}`);
    if (supportEmail) window.open(`mailto:${supportEmail}?subject=${subject}&body=${body}`);
  };

  return (
    <div className="flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-6 w-6" />
            {resolvedTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>
              {context
                ? t('errors.recovery.contextError', { context })
                : t('errors.recovery.applicationError')}
            </AlertTitle>
            <AlertDescription>
              {error?.message || t('errors.recovery.fallbackDescription')}
            </AlertDescription>
          </Alert>

          {showDetails && error && (
            <Alert>
              <AlertTitle>{t('errors.recovery.technicalDetails')}</AlertTitle>
              <AlertDescription>
                <div className="mt-2 space-y-2">
                  <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded">
                    {error.message}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('errors.recovery.errorIdLabel')}: {errorId}
                  </p>
                  {error.status && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {t('errors.recovery.statusLabel')}: {error.status}
                    </p>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-3">
            {onRetry && (
              <Button onClick={onRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('errors.recovery.tryAgain')}
              </Button>
            )}

            <Button onClick={handleHome} variant="default">
              <Home className="h-4 w-4 mr-2" />
              {t('errors.recovery.goHome')}
            </Button>

            {supportEmail && (
            <Button onClick={handleReportBug} variant="outline">
              <Bug className="h-4 w-4 mr-2" />
              {t('errors.recovery.reportBug')}
            </Button>
            )}

            {recoveryActions.map((action, index) => (
              <Button
                key={index}
                onClick={action.action}
                variant={action.variant || 'outline'}
              >
                {action.label}
              </Button>
            ))}
          </div>

          {supportEmail && (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>
              <Trans
                i18nKey="errors.recovery.contactNotice"
                values={{ email: supportEmail }}
                components={{
                  contact: (
                    <a
                      href={`mailto:${supportEmail}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    />
                  ),
                }}
              />
            </p>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorRecovery;
