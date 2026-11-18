import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { showErrorToast } from "@/lib/toast-helper";
import { setupGlobalErrorHandling, setupMemoryMonitoring, createEnhancedErrorHandler } from '@/lib/error-utils';
import { installConsoleCapture, installGlobalClickBreadcrumbs } from '@/lib/breadcrumb-tracker';
import { useAuth } from '@/hooks/useAuth';

export function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    // Install breadcrumb + console-log capture (both guard against
    // double-install) so the trail is populated before any error fires.
    installConsoleCapture();
    installGlobalClickBreadcrumbs();
    // Setup global error handling
    setupGlobalErrorHandling(toast);
    // Initialize memory monitoring
    setupMemoryMonitoring();

    // Setup React Query global error handler
    queryClient.setQueryDefaults(['global'], {
      retry: (failureCount, error) => {
        // Don't retry on 4xx errors (client errors). React Query types
        // `error` as `Error`; HTTP failures we throw elsewhere may attach
        // a numeric `status`, so read it via a structural narrowing.
        const status = (error as { status?: number } | null)?.status;
        if (typeof status === 'number' && status >= 400 && status < 500) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });

    queryClient.setMutationDefaults(['global'], {
      retry: () => {
        // Don't retry mutations by default
        return false;
      },
      onError: createEnhancedErrorHandler({
        toast,
        context: 'API Mutation',
        userId: user?.id,
      }),
    });

    // Online/offline status handling
    const handleOnline = () => {
      toast({
        title: t('errors.global.online.title'),
        description: t('errors.global.online.description'),
        variant: "default",
      });
      // Invalidate all queries to refresh data
      queryClient.invalidateQueries();
    };

    const handleOffline = () => {
      showErrorToast(
        t('errors.global.offline.title'),
        t('errors.global.offline.description'),
      );
    };

    // Handle fetch errors globally
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        const response = await originalFetch(...args);

        // Log failed requests for debugging
        if (!response.ok) {
          console.error('Fetch Error:', {
            url: args[0],
            status: response.status,
            statusText: response.statusText,
            timestamp: new Date().toISOString()
          });
        }

        return response;
      } catch (error) {
        console.error('Network Error:', {
          url: args[0],
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [toast, queryClient, user?.id, t]);

  return <>{children}</>;
}