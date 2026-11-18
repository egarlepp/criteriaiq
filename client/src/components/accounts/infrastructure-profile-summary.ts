import { useMemo } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";

/**
 * Per-account Infrastructure Discovery summary from
 * GET /api/infrastructure-profiles/summary: only accounts with at least one
 * profile are listed. Drives the bold Infrastructure Discovery icon and its
 * "Default profile" hover text.
 */
export interface InfrastructureProfileSummary {
  customerId: number;
  profileCount: number;
  /** The account's default profile, else its first one by name. */
  defaultProfileId: number;
  defaultProfileName: string;
}

export const INFRASTRUCTURE_PROFILE_SUMMARY_KEY = ["/api/infrastructure-profiles/summary"] as const;

export function infrastructureProfilesKey(customerId: number) {
  return [`/api/customers/${customerId}/infrastructure-profiles`] as const;
}

/** Refetch everything that shows an account's profiles after one changes. */
export function invalidateInfrastructureProfiles(queryClient: QueryClient, customerId: number) {
  void queryClient.invalidateQueries({ queryKey: infrastructureProfilesKey(customerId) });
  void queryClient.invalidateQueries({ queryKey: INFRASTRUCTURE_PROFILE_SUMMARY_KEY });
}

export function useInfrastructureProfileSummaries(): Map<number, InfrastructureProfileSummary> {
  const { data } = useQuery<InfrastructureProfileSummary[]>({
    queryKey: INFRASTRUCTURE_PROFILE_SUMMARY_KEY,
    staleTime: 60_000,
  });
  return useMemo(() => new Map((data ?? []).map((row) => [row.customerId, row])), [data]);
}

export function useInfrastructureProfileSummary(
  customerId: number | null | undefined,
): InfrastructureProfileSummary | undefined {
  const summaries = useInfrastructureProfileSummaries();
  return customerId ? summaries.get(customerId) : undefined;
}
