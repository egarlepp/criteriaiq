/**
 * Task #723 — useDemoStatus hook.
 *
 * Polls /api/demo/status every 30 seconds so the persistent banner
 * picks up app-wide / per-user toggles flipped from another browser
 * window without forcing a manual refresh. The query is intentionally
 * cheap (one users-row lookup + one system_settings lookup, both
 * indexed) so the polling cadence is safe even on small instances.
 *
 * NOTE: there is no `excluded` field on the response. Whether the
 * current page is on the excluded-routes list is computed *client-side*
 * from the current location (see `isExcludedClientRoute()`), because
 * the request path of /api/demo/status is itself always excluded — the
 * server cannot tell which UI route the user is currently looking at.
 */
import { useQuery } from "@tanstack/react-query";

export type DemoSource =
  | "none"
  | "session"
  | "user"
  | "app_wide"
  | "session+user"
  | "session+app_wide"
  | "user+app_wide"
  | "session+user+app_wide";

export interface DemoForcedUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface DemoStatus {
  active: boolean;
  source: DemoSource;
  sessionFlag: boolean;
  userFlag: boolean;
  appWideFlag: boolean;
  role: string | null;
  isAdmin: boolean;
  forcedUsers: DemoForcedUser[];
}

export function useDemoStatus() {
  return useQuery<DemoStatus>({
    queryKey: ["/api/demo/status"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });
}
