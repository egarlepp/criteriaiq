/**
 * Utility functions for handling and formatting errors throughout the application
 */
import { initGuard, preventMultipleInit } from './initialization-guard';
import { showErrorToast, showWarningToast } from './toast-helper';
import { getBreadcrumbs, getConsoleBuffer } from './breadcrumb-tracker';
import { redirectToSignIn } from "@/lib/sign-in-redirect";

export interface FormattedError {
  title: string;
  description: string;
  details?: any;
  code?: string;
  recoverable?: boolean;
  retryable?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: any;
  errorId?: string;
}

/**
 * Extracts and formats error information from various error types
 */
export function formatError(error: any, context?: string): FormattedError {
  let title = "Error";
  let description = "An unknown error occurred. Please try again.";

  // Add context to title if provided
  if (context) {
    title = `${context} Error`;
  }

  // Extract error message and details
  if (error?.message) {
    description = error.message;

    // Clean up common error prefixes that are redundant
    description = description.replace(/^(Error:|Failed:|Exception:)\s*/i, '');

    // If we have context, ensure the description doesn't redundantly repeat it
    if (context && !description.toLowerCase().includes(context.toLowerCase())) {
      description = `${context} failed: ${description}`;
    }
  }

  // Handle specific error types
  if (error?.status === 400) {
    title = "Validation Error";
    if (!error?.message || error.message === "Bad Request") {
      description = "The submitted data is invalid. Please check your inputs and try again.";
    }
  } else if (error?.status === 403) {
    title = "Permission Denied";
    description = "You don't have permission to perform this action.";
  } else if (error?.status === 404) {
    title = "Not Found";
    description = "The requested resource could not be found.";
  } else if (error?.status === 409) {
    title = "Conflict";
    description = "This action conflicts with existing data. Please check for duplicates.";
  } else if (error?.status === 422) {
    title = "Validation Error";
    description = "The submitted data failed validation. Please check your inputs.";
  } else if (error?.status >= 500) {
    title = "Server Error";
    description = "A server error occurred. Please try again later or contact support.";
  }

  return {
    title,
    description,
    details: error?.details || error
  };
}

/**
 * Checks if an error is an authentication/authorization error
 */
export function isAuthError(error: any): boolean {
  return error?.status === 401 || error?.status === 403 || 
         error?.message?.toLowerCase().includes('unauthorized') ||
         error?.message?.toLowerCase().includes('forbidden');
}

/**
 * Checks if an error is related to empty data that should be handled gracefully
 */
export function isEmptyDataError(error: any): boolean {
  return error?.message?.toLowerCase().includes('no data found') ||
         error?.message?.toLowerCase().includes('empty result') ||
         (Array.isArray(error) && error.length === 0);
}

/**
 * Handles API errors specifically for data fetching operations
 */
export function handleApiError(error: any, context: string, toast: any) {
  // Don't show error toast for empty data - this is often expected
  if (isEmptyDataError(error)) {
    console.log(`${context}: No data available`);
    return;
  }

  // Use existing error handling for other errors
  const formattedError = formatError(error, context);

  showErrorToast(formattedError.title, formattedError.description);

  logError(error, context);
}

/**
 * Formats validation errors into a readable string
 */
export function formatValidationErrors(errors: any[]): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "Validation failed";
  }

  return errors.map(err => {
    if (err.path && err.message) {
      const fieldName = Array.isArray(err.path) ? err.path.join('.') : err.path;
      return `${fieldName}: ${err.message}`;
    }
    return err.message || JSON.stringify(err);
  }).join(', ');
}

/**
 * Generates a unique error ID for tracking and reference
 */
export function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Logs errors with structured format for better debugging
 */
export function logError(
  error: any,
  context?: string,
  userId?: string,
  extra?: { componentStack?: string },
) {
  const errorId = generateErrorId();

  // When an Error Boundary catches a render error, React hands us a
  // `componentStack` (the JSX component tree) that is completely separate from
  // the JS call stack. For render-loop errors ("Maximum update depth exceeded")
  // the raw JS stack is entirely inside library internals (react-dom, Radix),
  // so it never names the offending app component — but the component stack
  // does. Append it to the stored stack so the Error Log's Stack Trace panel
  // shows the actual component tree and these become diagnosable.
  const componentStack = extra?.componentStack?.trim();
  const combinedStack = componentStack
    ? `${error?.stack || ''}\n\n--- React component stack ---\n${componentStack}`
    : error?.stack;

  const errorLog = {
    id: errorId,
    timestamp: new Date().toISOString(),
    context: context || 'Unknown',
    userId: userId || 'Anonymous',
    message: error?.message || 'Unknown error',
    stack: combinedStack,
    status: error?.status,
    details: error?.details || error,
    url: window.location.href,
    userAgent: navigator.userAgent,
    // Recent user-action trail + captured console output, used by the Error
    // Audit Log viewer to reconstruct what led up to the failure. Both are
    // best-effort and never throw (see breadcrumb-tracker).
    breadcrumbs: getBreadcrumbs(),
    consoleLogs: getConsoleBuffer(),
  };

  console.error(`[ERROR ${errorId}]`, errorLog);

  // Store in localStorage for debugging with size management
  try {
    const storedErrors = JSON.parse(localStorage.getItem('app_errors') || '[]');
    storedErrors.unshift(errorLog);

    // Keep only last 10 errors and limit total size to 1MB
    const maxErrors = 10;
    const maxSizeBytes = 1024 * 1024; // 1MB

    while (storedErrors.length > maxErrors || 
           JSON.stringify(storedErrors).length > maxSizeBytes) {
      storedErrors.pop();
      if (storedErrors.length === 0) break;
    }

    localStorage.setItem('app_errors', JSON.stringify(storedErrors));
  } catch (e) {
    console.warn('Failed to store error log:', e);
    // Clear error logs if storage is full
    try {
      localStorage.removeItem('app_errors');
    } catch (clearError) {
      console.warn('Failed to clear error logs:', clearError);
    }
  }

  // Skip the server round-trip when we know it will fail and only generate
  // console noise:
  //   * /setup/* — the setup wizard runs in setup-only mode where the
  //     `/api/error-logs` route returns 503 and there is no logged-in
  //     session anyway. The wizard's own error-boundary kept POSTing
  //     every render, producing a tight loop of 503 responses in the
  //     browser console that obscured real errors.
  //   * /login, /password-reset, /accept-invite — pre-auth pages where
  //     the route also returns 503 (no session). Same noise pattern.
  // Production deployments and authenticated app pages still POST
  // normally so we keep server-side error tracking for real errors.
  const skipServerLog = (() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname || '';
    if (path.startsWith('/setup')) return true;
    const status = typeof error?.status === 'number' ? error.status : null;
    const url = typeof error?.url === 'string' ? error.url : '';
    // Don't recursively log a failed /api/error-logs response — both
    // 503 (setup-only mode rejecting the post) and 401 (anonymous user
    // hitting the route before login) would otherwise generate a tight
    // POST loop.
    if ((status === 503 || status === 401) && url.includes('/api/error-logs')) {
      return true;
    }
    // The /api/auth/user probe is the very first request the SPA makes
    // on every page load. Before the operator signs in, it always
    // returns 401, and during a Dokploy redeploy where the API is not
    // yet warm it can transiently return 503. Logging either to the
    // server is pure noise — the only consumer is the auth hook itself.
    if ((status === 401 || status === 503) && url.includes('/api/auth/user')) {
      return true;
    }
    return false;
  })();

  if (!skipServerLog) {
    fetch('/api/error-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(errorLog),
    }).catch(() => {});
  }

  return errorId;
}

/**
 * Enhanced error handler with retry logic and fallback options
 */
export function createEnhancedErrorHandler(options: {
  toast: any;
  context?: string;
  onUnauthorized?: () => void;
  onRetry?: () => void;
  fallbackAction?: () => void;
  userId?: string;
}) {
  return (error: any) => {
    const { toast, context, onUnauthorized, onRetry, fallbackAction, userId } = options;

    const errorId = logError(error, context, userId);

    // Handle authentication errors
    if (isAuthError(error)) {
      showErrorToast(
        "Authentication Required",
        "Your session has expired. Please log in again.",
      );

      if (onUnauthorized) {
        onUnauthorized();
      } else {
        setTimeout(() => {
          redirectToSignIn();
        }, 1000);
      }
      return;
    }

    const formattedError = formatError(error, context);

    // Show error with retry option if available
    toast({
      variant: "error",
      title: formattedError.title,
      description: `${formattedError.description}${onRetry ? ' Click to retry.' : ''}`,
      action: onRetry ? {
        altText: "Retry",
        onClick: onRetry,
        children: "Retry"
      } : undefined,
    });

    // Execute fallback action if provided
    if (fallbackAction) {
      setTimeout(fallbackAction, 100);
    }
  };
}

/**
 * Standard error handler for React Query mutations
 */
export function createMutationErrorHandler(
  toast: any, 
  context?: string,
  onUnauthorized?: () => void
) {
  return createEnhancedErrorHandler({
    toast,
    context,
    onUnauthorized
  });
}

/**
 * Network error handler with retry logic
 */
export function handleNetworkError(error: any, options?: {
  toast?: any;
  onRetry?: () => void;
  maxRetries?: number;
  retryCount?: number;
}) {
  const { toast, onRetry, maxRetries = 3, retryCount = 0 } = options || {};

  if (!navigator.onLine) {
    showWarningToast(
      "Network Error",
      "You appear to be offline. Please check your internet connection.",
    );
    return;
  }

  if (retryCount < maxRetries && onRetry) {
    setTimeout(() => {
      console.log(`Retrying operation (attempt ${retryCount + 1}/${maxRetries})`);
      onRetry();
    }, 1000 * Math.pow(2, retryCount)); // Exponential backoff
  } else {
    const formattedError = formatError(error, "Network");
    showErrorToast(
      formattedError.title,
      "Network request failed. Please try again later.",
    );
  }
}

/**
 * Monitors and cleans up memory usage from error logs
 */
export function monitorErrorLogMemory(): {
  errorLogSize: number;
  totalLocalStorageSize: number;
  cleanup: () => void;
} {
  const errorLogs = localStorage.getItem('app_errors') || '[]';
  const errorLogSize = new Blob([errorLogs]).size;

  // Calculate total localStorage usage
  let totalSize = 0;
  for (let key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      totalSize += localStorage[key].length + key.length;
    }
  }

  const cleanup = () => {
    try {
      // Keep only the 3 most recent errors if memory is high
      const errors = JSON.parse(errorLogs);
      if (errors.length > 3) {
        const recentErrors = errors.slice(0, 3);
        localStorage.setItem('app_errors', JSON.stringify(recentErrors));
        console.log('Cleaned up error logs - kept', recentErrors.length, 'most recent errors');
      }
    } catch (e) {
      console.warn('Failed to cleanup error logs:', e);
      localStorage.removeItem('app_errors');
    }
  };

  return {
    errorLogSize,
    totalLocalStorageSize: totalSize,
    cleanup
  };
}

/**
 * Enhanced memory monitoring with EventEmitter leak detection
 */
let memoryMonitoringStarted = false;
export function setupMemoryMonitoring() {
  if (memoryMonitoringStarted) return;
  memoryMonitoringStarted = true;

  // Monitor memory usage every 5 minutes
  const intervalId = setInterval(() => {
    const memory = monitorErrorLogMemory();

    // Clean up if memory usage is high
    if (memory.errorLogSize > 250 * 1024) { // 250KB threshold
      console.log('Memory cleanup triggered - error logs size:', memory.errorLogSize);
      memory.cleanup();
    }

    // Browser environment - check for high listener counts
    if (typeof window !== 'undefined') {
      const eventTypes = ['error', 'unhandledrejection', 'beforeunload', 'visibilitychange'];
      eventTypes.forEach(eventType => {
        const listeners = (window as any)._events?.[eventType]?.length || 0;
        if (listeners > 10) {
          console.warn(`High number of ${eventType} listeners:`, listeners);
        }
      });
    }
  }, 5 * 60 * 1000); // 5 minutes

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
    memoryMonitoringStarted = false;
  };
}

/**
 * Auto-cleanup function that runs periodically
 */
let autoCleanupStarted = false;
export function setupErrorLogAutoCleanup() {
  if (autoCleanupStarted) return;
  autoCleanupStarted = true;

  // Clean up error logs every 10 minutes
  const intervalId = setInterval(() => {
    const monitor = monitorErrorLogMemory();

    // If error logs are taking more than 500KB, clean up
    if (monitor.errorLogSize > 500 * 1024) {
      console.log('Auto-cleaning error logs due to size:', monitor.errorLogSize);
      monitor.cleanup();
    }
  }, 10 * 60 * 1000); // 10 minutes

  return () => {
    clearInterval(intervalId);
    autoCleanupStarted = false;
  };
}

/**
 * Global unhandled error handler with EventEmitter leak prevention
 */
export const setupGlobalErrorHandling = preventMultipleInit('errorHandling', (toast: any) => {
  try {
    // Initialize error log auto-cleanup
    setupErrorLogAutoCleanup();

    // Initialize memory monitoring
    setupMemoryMonitoring();

    // Filter out certain non-critical errors to reduce noise
    const shouldIgnoreError = (error: any): boolean => {
      // Handle WebSocket Event objects (which have type property, not message)
      if (error && typeof error === 'object' && error.isTrusted === true && error.type === 'error') {
        return true; // This is a WebSocket Event object
      }

      // Ignore errors originating from Vite's HMR client (dev-only internal code)
      const errorStack = (error?.stack || '').toLowerCase();
      if (errorStack.includes('@vite/client') || errorStack.includes('/@vite/')) {
        return true;
      }

      // Handle string-based error messages
      const errorMessage = (error?.message || error?.reason?.message || '').toLowerCase();
      const ignoredErrors = [
        'non-error promise rejection captured',
        'script error',
        'network error',
        'loading chunk',
        'loading css chunk',
        'failed to fetch',
        'authentication timeout',
        'websocket closed without opened',
        'websocket is closed before the connection is established',
      ];
      
      return ignoredErrors.some(ignored => errorMessage.includes(ignored));
    };

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (event: PromiseRejectionEvent) => {
      // Filter out WebSocket and other development-only errors
      if (shouldIgnoreError(event.reason)) {
        event.preventDefault(); // Suppress browser console noise too
        return;
      }
      
      console.error('Unhandled promise rejection:', event.reason);
      console.error('Promise rejection stack:', event.reason?.stack);
      console.error('Current URL:', window.location.href);
      console.error('User agent:', navigator.userAgent);

      // Try to extract more context from the error
      const errorContext = {
        reason: event.reason,
        type: typeof event.reason,
        message: event.reason?.message || 'Unknown error',
        stack: event.reason?.stack,
        promise: event.promise,
        timestamp: new Date().toISOString(),
        url: window.location.href
      };

      console.error('Full rejection context:', errorContext);
      logError(event.reason, 'Unhandled Promise Rejection');

      // Only show toast for non-network related errors to avoid spam
      if (!event.reason?.message?.includes('fetch') && !event.reason?.message?.includes('network')) {
        showErrorToast(
          "Unexpected Error",
          "An unexpected error occurred. The error has been logged.",
        );
      }

      // Prevent default browser behavior
      event.preventDefault();
    };

    // Handle JavaScript errors
    const errorHandler = (event: ErrorEvent) => {
      // Filter out WebSocket and other development-only errors
      if (shouldIgnoreError(event.error)) {
        return;
      }
      
      console.error('JavaScript error:', event.error);
      logError(event.error, 'JavaScript Error');

      showErrorToast(
        "Script Error",
        "A script error occurred. Please refresh the page if problems persist.",
      );
    };

    window.addEventListener('unhandledrejection', unhandledRejectionHandler);
    window.addEventListener('error', errorHandler);

    // Handle browser-specific EventEmitter warnings (Next.js environment)
    if (typeof window !== 'undefined' && (window as any).process?.on) {
      const warningHandler = (warning: any) => {
        if (warning.name === 'MaxListenersExceededWarning') {
          console.warn('EventEmitter memory leak detected:', warning.message);
          logError(warning, 'EventEmitter Warning');
        }
      };
      (window as any).process.on('warning', warningHandler);
    }

    // Return cleanup function
    return () => {
      initGuard.reset('errorHandling');
      window.removeEventListener('unhandledrejection', unhandledRejectionHandler);
      window.removeEventListener('error', errorHandler);
    };
  } catch (error) {
    console.error("Failed to set up global error handling:", error);
    // Attempt to log the setup error itself if possible
    logError(error, "Global Error Handling Setup Failure");
    // Optionally, re-throw or return a no-op cleanup function
    return () => {};
  }
});