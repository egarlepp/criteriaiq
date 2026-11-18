import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { MapAnalytics } from "@/types/map";

export function useMapAnalytics(projectId: number, enabled: boolean = true) {
  return useQuery<MapAnalytics>({
    queryKey: ['map-analytics', projectId],
    queryFn: async () => {
      return apiRequest('GET', `/api/projects/${projectId}/map/analytics`);
    },
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}