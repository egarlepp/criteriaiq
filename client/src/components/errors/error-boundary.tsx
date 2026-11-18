
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, Bug, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { logError, ErrorBoundaryState } from '@/lib/error-utils';
import { SupportFeatureDialog } from '@/components/support/support-feature-dialog';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { withTranslation, WithTranslation, useTranslation } from 'react-i18next';
import { useBrandingSupportEmail } from '@/hooks/useBrandingAsset';

// Contact line shown under the error card. Uses the admin-configured
// support email (Configuration → System Settings → Media); renders nothing
// when none is configured. The boundary sits above the app's
// QueryClientProvider, so the caller wraps this in its own provider.
function SupportContactNotice() {
  const { t } = useTranslation();
  const { email } = useBrandingSupportEmail();
  if (!email) return null;
  return (
    <div className="text-sm text-gray-600 dark:text-gray-400">
      <p>
        {t('errors.boundary.supportNoticePrefix')}
        <a href={`mailto:${email}`} className="text-blue-600 dark:text-blue-400 hover:underline">
          {email}
        </a>
        {t('errors.boundary.supportNoticeSuffix')}
      </p>
    </div>
  );
}

interface ErrorBoundaryOwnProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

type ErrorBoundaryProps = ErrorBoundaryOwnProps & WithTranslation;

interface ErrorBoundaryStateWithDialog extends ErrorBoundaryState {
  showSupportDialog?: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryStateWithDialog> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, showSupportDialog: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorId: `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Pass React's componentStack so the logged Stack Trace names the actual
    // app component tree — essential for render-loop errors whose JS stack is
    // entirely library-internal.
    const errorId = logError(error, 'React Error Boundary', undefined, {
      componentStack: errorInfo.componentStack ?? undefined,
    });

    this.setState({
      errorInfo,
      errorId,
    });

    // Check if this is an API-related error and log additional context
    if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('API')) {
      console.error('API Error Context:', {
        url: window.location.href,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        errorId,
        componentStack: errorInfo.componentStack
      });
    }

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, showSupportDialog: false });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleReportError = () => {
    this.setState({ showSupportDialog: true });
  };

  handleCloseSupportDialog = () => {
    this.setState({ showSupportDialog: false });
  };

  handleCopyErrorId = () => {
    if (this.state.errorId) {
      navigator.clipboard.writeText(this.state.errorId);
    }
  };

  render() {
    const { t } = this.props;
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 p-4 relative">
          {/* Page background logo */}
          <div className="page-background-logo"></div>

          <Card className="w-full max-w-2xl relative z-10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
                <AlertCircle className="h-6 w-6" />
                {t('errors.boundary.somethingWentWrong')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('errors.boundary.applicationErrorTitle')}</AlertTitle>
                <AlertDescription>
                  {t('errors.boundary.applicationErrorDescription')}
                </AlertDescription>
              </Alert>

              {/* Always display error ID prominently */}
              {this.state.errorId && (
                <Alert>
                  <Bug className="h-4 w-4" />
                  <AlertTitle>{t('errors.boundary.errorReferenceId')}</AlertTitle>
                  <AlertDescription>
                    <div className="flex items-center justify-between mt-2">
                      <code className="text-sm font-mono bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded">
                        {this.state.errorId}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={this.handleCopyErrorId}
                        className="ml-2"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                      {t('errors.boundary.referenceHint')}
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {this.props.showDetails && this.state.error && (
                <Alert>
                  <AlertTitle>{t('errors.boundary.errorDetails')}</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-mono bg-gray-100 dark:bg-slate-800 p-2 rounded">
                        {this.state.error.message}
                      </p>
                      {this.state.errorId && (
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {t('errors.boundary.errorIdLabel')} {this.state.errorId}
                        </p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={this.handleRetry} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {t('errors.boundary.tryAgain')}
                </Button>
                <Button onClick={this.handleGoHome} variant="default">
                  <Home className="h-4 w-4 mr-2" />
                  {t('errors.boundary.goToDashboard')}
                </Button>
                <Button onClick={this.handleReportError} variant="secondary">
                  <Bug className="h-4 w-4 mr-2" />
                  {t('errors.boundary.reportError')}
                </Button>
              </div>

              <QueryClientProvider client={queryClient}>
                <SupportContactNotice />
              </QueryClientProvider>
            </CardContent>
          </Card>

          {/* Support Feature Dialog with pre-filled error information */}
          <QueryClientProvider client={queryClient}>
            <SupportFeatureDialog
              open={this.state.showSupportDialog || false}
              onOpenChange={this.handleCloseSupportDialog}
              prefilledData={{
                type: "issue",
                title: `${t('errors.boundary.applicationErrorTitlePrefix')} ${this.state.errorId || 'Unknown'}`,
                description: `An application error occurred${this.state.error ? `: ${this.state.error.message}` : ''}

Error ID: ${this.state.errorId || 'Not available'}
User Agent: ${navigator.userAgent}
URL: ${window.location.href}
Timestamp: ${new Date().toISOString()}

${this.state.error?.stack ? `Stack Trace:\n${this.state.error.stack}` : ''}`
              }}
              onSuccess={() => {
                this.handleCloseSupportDialog();
              }}
            />
          </QueryClientProvider>
        </div>
      );
    }

    return this.props.children;
  }
}

const TranslatedErrorBoundary = withTranslation()(ErrorBoundary);
export default TranslatedErrorBoundary;

// Hook version for functional components
export function useErrorHandler() {
  return (error: Error, errorInfo?: any) => {
    const errorId = logError(error, 'Component Error');
    console.error('Component error caught:', { error, errorInfo, errorId });
  };
}

// Higher-order component wrapper
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryOwnProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <TranslatedErrorBoundary {...errorBoundaryProps}>
        <Component {...props} />
      </TranslatedErrorBoundary>
    );
  };
}
