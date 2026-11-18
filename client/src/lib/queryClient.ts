import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { logError } from './error-utils';
import { recordBreadcrumb } from './breadcrumb-tracker';
import { getPersonaActive } from "@/contexts/PersonaContext";
import { showErrorToast } from "@/lib/toast-helper";

export class ApiError extends Error {
  readonly status?: number;
  readonly details?: unknown;
  readonly references?: Record<string, string[]>;
  constructor(message: string, references?: Record<string, string[]>, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.references = references;
    this.status = status;
    this.details = details;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    let errorDetails = null;

    try {
      const text = await res.text();
      if (text) {
        // Try to parse as JSON to extract detailed error information
        try {
          const parsed = JSON.parse(text);
          if (parsed.message) {
            errorMessage = parsed.message;
          }

          // Include validation errors if present
          if (parsed.errors && Array.isArray(parsed.errors)) {
            const validationErrors = parsed.errors.map((err: any) => {
              if (err.path && err.message) {
                return `${err.path.join('.')}: ${err.message}`;
              }
              return err.message || JSON.stringify(err);
            }).join(', ');

            errorMessage += ` - Validation errors: ${validationErrors}`;
          }

          // Include any other error details
          if (parsed.details) {
            errorMessage += ` - Details: ${parsed.details}`;
          }

          errorDetails = parsed;
        } catch {
          // If not valid JSON, use the text as is
          errorMessage = text;
        }
      }
    } catch {
      // Fallback to status text if we can't read the response
      errorMessage = res.statusText || 'Unknown error occurred';
    }

    const error = new Error(errorMessage);
    (error as any).details = errorDetails;
    (error as any).status = res.status;
    throw error;
  }
}

// Centralized recognition of the 409 response the dashboard layout
// route returns when an admin (or a future flow / dev tool) tries to
// delete the seeded built-in Overview row (Task #555 / #561). The
// server pins a stable `code: "DASHBOARD_LAYOUT_PROTECTED"` so the
// client can render a calm, plain-language explanation instead of the
// generic "HTTP 409" failure string. Lives next to `apiRequest` so any
// mutation that flows through this helper picks it up automatically.
export const DASHBOARD_LAYOUT_PROTECTED_CODE = "DASHBOARD_LAYOUT_PROTECTED";
const DASHBOARD_LAYOUT_PROTECTED_FALLBACK_MESSAGE =
  "This is a built-in dashboard and cannot be deleted. You can edit its widgets and sections, but it must remain on the system.";

function isDashboardLayoutProtectedResponse(
  status: number,
  errorData: any,
): boolean {
  return (
    status === 409 &&
    !!errorData &&
    typeof errorData === "object" &&
    errorData.code === DASHBOARD_LAYOUT_PROTECTED_CODE
  );
}

/**
 * Parse a 2xx response body as JSON, but FIRST verify the response is
 * actually JSON. A 200 carrying an HTML body (the SPA `index.html`
 * served by the static catch-all for an unmatched route, or a
 * reverse-proxy error/placeholder page returned while the backend is
 * restarting mid-deploy) would otherwise hit `response.json()` and
 * throw the cryptic, unactionable `SyntaxError: Unexpected token '<',
 * "<!DOCTYPE "... is not valid JSON` — which then gets captured in the
 * Error Audit Log as a mysterious "Medium" client error.
 *
 * Instead we detect the non-JSON content-type and throw a clear,
 * RETRYABLE error (no `status` set, so React Query's retry predicate
 * treats it as transient and re-attempts with backoff — a mid-deploy
 * blip self-heals before the user ever sees it).
 *
 * Endpoints that intentionally return non-JSON (e.g. the `/api/docs/*`
 * markdown routes) do NOT go through this helper — they use a raw
 * `fetch().text()` — so this guard is safe to apply to every JSON API
 * consumer.
 */
async function parseJsonResponse(response: Response, url: string): Promise<any> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  const bodyPreview = await response.text().catch(() => "");
  const snippet = bodyPreview.slice(0, 120).replace(/\s+/g, " ").trim();
  const err = new Error(
    `Expected JSON from ${url} but received ${contentType || "a non-JSON response"} ` +
      `(HTTP ${response.status}). The server may be restarting or the endpoint is ` +
      `temporarily unavailable — retrying.` +
      (snippet ? ` Response began: "${snippet}…"` : ""),
  );
  // Deliberately leave `status` unset so React Query retries (the
  // retry predicate only short-circuits on 4xx). Flagged for callers
  // that want to special-case it.
  (err as any).nonJsonResponse = true;
  throw err;
}

export async function apiRequest(method: string, url: string, data?: any): Promise<any> {
  // View As is read only; the server refuses the write too (403
  // VIEW_AS_READ_ONLY). Saying so here spares a confusing error.
  if (method.toUpperCase() !== 'GET' && getPersonaActive()) {
    showErrorToast("layout.personaBanner.blockedTitle", "layout.personaBanner.blockedDescription");
    const err = new Error("View As is read only — changes are turned off.");
    (err as any).personaBlocked = true;
    throw err;
  }

  // CSRF header echo (double-submit cookie pattern). The global
  // fetch interceptor installed by `installCsrfFetchInterceptor()`
  // in main.tsx already attaches the header for same-origin /api/*
  // mutations, so this `apiRequest` path inherits the protection
  // automatically — no extra plumbing here. See client/src/lib/csrf.ts
  // and server/lib/csrf.ts for the full pattern.
  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
  };

  if (
    data &&
    (method === 'POST' ||
      method === 'PUT' ||
      method === 'PATCH' ||
      method === 'DELETE')
  ) {
    config.body = JSON.stringify(data);
  }

  const response = await fetch(url, config);

  // Short-circuit "no body" success responses BEFORE the `!response.ok`
  // check. Fetch's `response.ok` is only true for 200–299, so 304 Not
  // Modified (which the browser HTTP cache can emit transparently using
  // stored `ETag`/`Last-Modified` from a prior response, even when we
  // didn't add conditional request headers) would otherwise fall into
  // the error branch below and surface as the unhelpful message
  // `HTTP 304: ` (statusText is empty for 304s). 204 No Content is
  // included for symmetry — it has no body to parse either. (Task #766)
  if (response.status === 204 || response.status === 304) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.message || `HTTP ${response.status}: ${response.statusText}`;
    recordBreadcrumb("fetch-error", `${method} ${url} → ${response.status}`);
    console.error(`Query Error: ${url}`, errorMessage, errorData);

    // Log detailed error information
    const errorDetails = {
      id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      context: `Query Error: ${url}`,
      userId: 'Anonymous', // You might want to get this from auth context
      message: errorMessage,
      stack: new Error(errorMessage).stack,
      status: response.status,
      details: errorData,
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    console.error(`[ERROR ${errorDetails.id}]`, errorDetails);

    // Centralized friendly toast for the seeded built-in Overview
    // dashboard's protected-row 409 (Task #561). Recognized here so
    // every current and future caller of `apiRequest` (the dashboard
    // builder's "Delete Current" menu, future bulk-cleanup flows,
    // direct dev-tool DELETEs) surfaces the same calm message
    // instead of a generic "HTTP 409" string.
    if (isDashboardLayoutProtectedResponse(response.status, errorData)) {
      const friendly =
        (typeof errorData.message === "string" && errorData.message) ||
        DASHBOARD_LAYOUT_PROTECTED_FALLBACK_MESSAGE;
      showErrorToast("Built-in dashboard", friendly);
    }

    const references = errorData.references as Record<string, string[]> | undefined;
    throw new ApiError(errorMessage, references, response.status, errorData);
  }

  // 204 / 304 are handled above the `!response.ok` check (Task #766);
  // any 2xx response that reaches this point has a body to parse.
  // Guard against a 200-with-HTML body (SPA fallback / proxy page) so
  // we throw a clear, retryable error instead of a cryptic JSON
  // SyntaxError.
  return await parseJsonResponse(response, url);
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await parseJsonResponse(res, queryKey[0] as string);
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error: any) => {
        // Don't retry on 4xx errors (client errors)
        if (error instanceof Error && 'status' in error &&
            typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      queryFn: async ({ queryKey }) => {
        const [url, ...params] = queryKey as [string, ...unknown[]];

        let fullUrl = url;
        if (params.length > 0) {
          const queryParams = new URLSearchParams();
          params.forEach((param, index) => {
            if (typeof param === 'object' && param !== null) {
              Object.entries(param as Record<string, any>).forEach(([key, value]) => {
                if (Array.isArray(value)) {
                  value.forEach(v => queryParams.append(key, String(v)));
                } else {
                  queryParams.append(key, String(value));
                }
              });
            } else {
              queryParams.append(`param${index}`, String(param));
            }
          });
          if (queryParams.toString()) {
            fullUrl += `?${queryParams.toString()}`;
          }
        }

        const response = await fetch(fullUrl);
        if (!response.ok) {
          // Enhanced error handling to match throwIfResNotOk logic
          let errorMessage = response.statusText;
          let errorDetails = null;

          try {
            const text = await response.text();
            if (text) {
              try {
                const parsed = JSON.parse(text);
                if (parsed.message) {
                  errorMessage = parsed.message;
                }
                if (parsed.errors && Array.isArray(parsed.errors)) {
                  const validationErrors = parsed.errors.map((err: any) => {
                    if (err.path && err.message) {
                      return `${err.path.join('.')}: ${err.message}`;
                    }
                    return err.message || JSON.stringify(err);
                  }).join(', ');
                  errorMessage += ` - Validation errors: ${validationErrors}`;
                }
                if (parsed.details) {
                  errorMessage += ` - Details: ${parsed.details}`;
                }
                errorDetails = parsed;
              } catch {
                errorMessage = text;
              }
            }
          } catch {
            errorMessage = response.statusText || 'Unknown error occurred';
          }

          const error = new Error(errorMessage);
          (error as any).details = errorDetails;
          (error as any).status = response.status;
          throw error;
        }
        // Guard against a 200-with-HTML body (SPA fallback / proxy page
        // served mid-deploy) — the cause of the cryptic "Unexpected
        // token '<'" error on pages like /create. parseJsonResponse
        // throws a clear, retryable error so the query auto-recovers
        // once the backend is back instead of surfacing a raw
        // JSON SyntaxError.
        return parseJsonResponse(response, fullUrl);
      },
    },
    mutations: {
      retry: false, // Don't retry mutations by default
      onError: (error: any, variables: any, context: any) => {
        // Log all mutation errors
        if (typeof logError === 'function') {
          logError(error, 'Mutation Error', context?.userId);
        } else {
          console.error('Mutation Error:', error);
        }
      },
    },
  },
});

// Add error handling for query cache
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'observerResultsUpdated') {
    const query = event.query;
    if (query.state.error) {
      if (typeof logError === 'function') {
        logError(query.state.error, `Query Error: ${query.queryKey.join(', ')}`);
      } else {
        console.error('Query Error:', query.state.error);
      }
    }
  }
});

// Add error handling for mutation cache
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === 'updated') {
    const mutation = event.mutation;
    if (mutation.state.error) {
      recordBreadcrumb(
        "mutation",
        `failed: ${mutation.options.mutationKey?.join(', ') || 'Unknown'}`,
      );
      if (typeof logError === 'function') {
        logError(mutation.state.error, `Mutation Error: ${mutation.options.mutationKey?.join(', ') || 'Unknown'}`);
      } else {
        console.error('Mutation Error:', mutation.state.error);
      }
    }
  }
});