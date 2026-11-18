import { useQuery } from "@tanstack/react-query";

export interface MetricHistoryPoint {
  date: string;
  week: string;
  value: number;
}

export interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  category: "kpi" | "map" | "support" | "custom";
  unit: "count" | "currency" | "percentage" | "days" | "hours";
}

export function useMetricHistory(metricKey: string, limit: number = 6) {
  return useQuery<MetricHistoryPoint[]>({
    queryKey: ["/api/metrics/history", metricKey, limit],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/history/${encodeURIComponent(metricKey)}?limit=${limit}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch metric history");
      return res.json();
    },
    staleTime: 60000,
    enabled: !!metricKey,
  });
}

export function useMultipleMetricHistory(metricKeys: string[], limit: number = 6) {
  return useQuery<Record<string, MetricHistoryPoint[]>>({
    queryKey: ["/api/metrics/history/batch", metricKeys.sort().join(","), limit],
    queryFn: async () => {
      const res = await fetch("/api/metrics/history/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keys: metricKeys, limit }),
      });
      if (!res.ok) throw new Error("Failed to fetch metric history");
      return res.json();
    },
    staleTime: 60000,
    enabled: metricKeys.length > 0,
  });
}

export function useMetricDefinitions() {
  return useQuery<MetricDefinition[]>({
    queryKey: ["/api/metrics/definitions"],
    queryFn: async () => {
      const res = await fetch("/api/metrics/definitions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch metric definitions");
      return res.json();
    },
    staleTime: 300000,
  });
}

export function useCurrentMetricValue(metricKey: string) {
  return useQuery<{ key: string; value: number; name: string; unit: string }>({
    queryKey: ["/api/metrics/current", metricKey],
    queryFn: async () => {
      const res = await fetch(`/api/metrics/current/${encodeURIComponent(metricKey)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch current metric value");
      return res.json();
    },
    staleTime: 30000,
    enabled: !!metricKey,
  });
}
