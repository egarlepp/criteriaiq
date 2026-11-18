import React from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorDisplayProps {
  error: any;
  title?: string;
  onRetry?: () => void;
  showDetails?: boolean;
}

export function ErrorDisplay({ error, title, onRetry, showDetails = false }: ErrorDisplayProps) {
  const { t } = useTranslation();
  const resolvedTitle = title ?? t('errors.display.defaultTitle');

  // Helper function to format error information
  const formatError = (error: unknown) => {
    const baseError = {
      title: resolvedTitle,
      description: t('errors.display.unexpectedDescription'),
      details: null,
    };

    if (typeof error === 'string') {
      return { ...baseError, description: error };
    }

    if (error instanceof Error) {
      return {
        title: error.message || resolvedTitle,
        description: error.message || baseError.description,
        details: error,
      };
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return {
        title: (error as any).message || resolvedTitle,
        description: (error as any).message || baseError.description,
        details: error,
      };
    }

    if (error && typeof error === 'object' && 'error' in error && typeof (error as any).error === 'string') {
      return {
        title: (error as any).error || resolvedTitle,
        description: (error as any).error || baseError.description,
        details: error,
      };
    }

    if (error && typeof error === 'object' && 'errors' in error) {
      const errorMessages = Object.values((error as any).errors).join(", ");
      return {
        title: resolvedTitle,
        description: errorMessages || baseError.description,
        details: error,
      };
    }

    return baseError;
  };

  const formattedError = formatError(error);

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center relative"
      style={{
        background: 'linear-gradient(to right, #000000, #404040, #808080, #ffffff)'
      }}
    >
      {/* Background logo with low opacity */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none logo-background"
        style={{
          opacity: 0.08,
          width: '80%',
          height: '80%',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)'
        }}
      />

      {/* Error content with higher z-index */}
      <div className="relative z-10 max-w-2xl mx-auto p-6">
        <Alert variant="destructive" className="my-4 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm border-red-200 dark:border-red-800 shadow-lg">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle className="flex items-center justify-between">
            {formattedError.title}
            {onRetry && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRetry}
                className="ml-2"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                {t('errors.display.retry')}
              </Button>
            )}
          </AlertTitle>
          <AlertDescription>
            <p>{formattedError.description}</p>
            {showDetails && formattedError.details && (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium">
                  {t('errors.display.detailsSummary')}
                </summary>
                <pre className="mt-1 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-auto">
                  {JSON.stringify(formattedError.details, null, 2)}
                </pre>
              </details>
            )}
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

export default ErrorDisplay;