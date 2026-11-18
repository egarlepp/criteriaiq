import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AssignmentAnalytics } from "@/types/map";

export function useMapAssignmentAnalytics(projectId: number, enabled: boolean = true) {
  return useQuery<AssignmentAnalytics>({
    queryKey: ['map-assignment-analytics', projectId],
    queryFn: async () => {
      return apiRequest('GET', `/api/projects/${projectId}/map/assignment-analytics`);
    },
    enabled: enabled && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}