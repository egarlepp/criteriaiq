import { useQuery } from "@tanstack/react-query";
import type { MyOutlookConnection } from "@shared/outlook";

export const MY_OUTLOOK_CONNECTION_KEY = ["/api/outlook/me"] as const;

/**
 * The signed-in user's own Outlook calendar link (with a "reconnect needed"
 * check). Read by Profile Settings › Integrations and the sidebar footer icon.
 */
export function useMyOutlookConnection(enabled = true) {
  return useQuery<MyOutlookConnection>({
    queryKey: MY_OUTLOOK_CONNECTION_KEY,
    staleTime: 60_000,
    enabled,
  });
}
