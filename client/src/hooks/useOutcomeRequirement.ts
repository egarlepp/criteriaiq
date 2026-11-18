import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";

interface OutcomeRequirementResult {
  required: boolean;
  reason: string;
  acvValue?: number;
  acvThreshold?: number;
  logicMode?: string;
}

export type OutcomeTriggerSource = "status" | "crm" | "either";
export type OutcomeEnforcement = "optional" | "prompt" | "required";
export type OutcomeTypeRule = "rules" | "always" | "never";

export interface OutcomeConfig {
  id: number;
  enabled: boolean;
  acvThreshold: string | null;
  frequencyInterval: number | null;
  logicMode: string;
  closureCounter: number;
  triggerSource: OutcomeTriggerSource;
  enforcement: OutcomeEnforcement;
  wonRule: OutcomeTypeRule;
  lostRule: OutcomeTypeRule;
  cancelledRule: OutcomeTypeRule;
  wonStatuses: string[];
  lostStatuses: string[];
  cancelledStatuses: string[];
  graceDays: number;
  escalateAfterDays: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export function useOutcomeRequirement(projectId: number | null) {
  return useQuery<OutcomeRequirementResult>({
    queryKey: ["outcome-requirement", projectId],
    queryFn: async () => {
      if (!projectId) {
        return { required: false, reason: "No project specified" };
      }
      
      const response = await fetch(`/api/project-outcomes/check-required/${projectId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to check outcome requirement");
      }
      
      return response.json();
    },
    enabled: !!projectId,
    staleTime: 30000,
  });
}

export function useOutcomeConfig() {
  return useQuery<OutcomeConfig>({
    queryKey: ["outcome-config"],
    queryFn: async () => {
      const response = await fetch("/api/outcome-config", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch outcome config");
      }
      
      return response.json();
    },
    staleTime: 60000,
  });
}

export function useProjectOutcome(projectId: number | null) {
  return useQuery({
    queryKey: ["project-outcome", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      
      const response = await fetch(`/api/project-outcomes/${projectId}`, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch project outcome");
      }
      
      return response.json();
    },
    enabled: !!projectId,
  });
}

export function useAllProjectOutcomes(filters?: {
  outcomeType?: string;
  fromDate?: string;
  toDate?: string;
}) {
  return useQuery({
    queryKey: ["project-outcomes", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.outcomeType) params.append("outcomeType", filters.outcomeType);
      if (filters?.fromDate) params.append("fromDate", filters.fromDate);
      if (filters?.toDate) params.append("toDate", filters.toDate);
      
      const url = `/api/project-outcomes${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch project outcomes");
      }
      
      return response.json();
    },
  });
}

export function useOutcomeStatistics() {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ["outcome-statistics"],
    queryFn: async () => {
      const response = await fetch("/api/project-outcomes/statistics", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch outcome statistics");
      }
      
      return response.json();
    },
    enabled: isAuthenticated,
  });
}

export function useMissingOutcomes() {
  const { isAuthenticated } = useAuth();
  
  return useQuery({
    queryKey: ["missing-outcomes"],
    queryFn: async () => {
      const response = await fetch("/api/project-outcomes/missing", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error("Failed to fetch missing outcomes");
      }
      
      return response.json();
    },
    enabled: isAuthenticated,
  });
}
