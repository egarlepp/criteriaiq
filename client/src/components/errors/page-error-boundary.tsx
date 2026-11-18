
import React, { useState, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { useBrandingSupportEmail } from "@/hooks/useBrandingAsset";
import { AlertCircle, RefreshCw, ArrowLeft, Copy, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLocation } from 'wouter';
import { showSuccessToast } from "@/lib/toast-helper";
import { SupportFeatureDialog } from '@/components/support/support-feature-dialog';
import { generateErrorId } from '@/lib/error-utils';
import ErrorBoundary from './error-boundary';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
  pageName?: string;
}

function PageErrorFallback({ error, pageName }: { error?: Error; pageName?: string }) {
  const { t } = useTranslation();
  const { email: supportEmail } = useBrandingSupportEmail();
  const [, setLocation] = useLocation();
  
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  
  // Generate unique error ID for this page error
  const errorId = useMemo(() => generateErrorId(), []);

  const handleGoBack = () => {
    window.history.back();
  };

  const handleGoHome = () => {
    setLocation('/');
  };

  const handleReload = () => {
    window.location.reload();
  };

  const copyErrorId = () => {
    navigator.clipboard.writeText(errorId);
    showSuccessToast(
      t('errors.page.copiedTitle'),
      t('errors.page.copiedDescription'),
    );
  };

  const handleReportError = () => {
    setShowSupportDialog(true);
  };

  const handleCloseSupportDialog = () => {
    setShowSupportDialog(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            {t('errors.page.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('errors.page.unableToLoad', { name: pageName || t('errors.page.thisPage') })}</AlertTitle>
            <AlertDescription>
              {t('errors.page.description')}
            </AlertDescription>
          </Alert>

          {/* Prominent Error ID Display */}
          <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
            <Bug className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertTitle className="text-yellow-800 dark:text-yellow-200">{t('errors.page.referenceTitle')}</AlertTitle>
            <AlertDescription className="text-yellow-700 dark:text-yellow-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm bg-yellow-100 dark:bg-yellow-900/40 px-2 py-1 rounded">
                  {errorId}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyErrorId}
                  className="h-6 w-6 p-0 text-yellow-600 dark:text-yellow-400 hover:text-yellow-800 dark:hover:text-yellow-200"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs">
                {t('errors.page.referenceHint')}
              </p>
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleReload} variant="default" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('errors.page.actions.reload')}
            </Button>
            <Button onClick={handleReportError} variant="outline" size="sm" className="text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/20">
              <Bug className="h-4 w-4 mr-2" />
              {t('errors.page.actions.report')}
            </Button>
            <Button onClick={handleGoBack} variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('errors.page.actions.goBack')}
            </Button>
            <Button onClick={handleGoHome} variant="outline" size="sm">
              {t('errors.page.actions.dashboard')}
            </Button>
          </div>

          {supportEmail && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            <p>
              <Trans
                i18nKey="errors.page.contactNotice"
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

      {/* Support Feature Dialog with pre-filled error information */}
      <SupportFeatureDialog
        open={showSupportDialog}
        onOpenChange={handleCloseSupportDialog}
        prefilledData={{
          type: "issue",
          title: `Page Error - ${pageName || 'Page Load Failure'} - ${errorId}`,
          description: `A page error occurred while trying to load "${pageName || 'a page'}"

Error ID: ${errorId}
Page: ${pageName || 'Unknown'}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Timestamp: ${new Date().toISOString()}

${error ? `Error Details:\n${error.message}${error.stack ? `\n\nStack Trace:\n${error.stack}` : ''}` : 'No specific error details available.'}

Please help resolve this page loading issue.`
        }}
        onSuccess={() => {
          handleCloseSupportDialog();
        }}
      />
    </div>
  );
}

export function PageErrorBoundary({ children, pageName }: PageErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={<PageErrorFallback pageName={pageName} />}
      showDetails={false}
    >
      {children}
    </ErrorBoundary>
  );
}

export default PageErrorBoundary;
