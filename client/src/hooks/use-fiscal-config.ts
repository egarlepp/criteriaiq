import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FiscalConfig } from "@shared/schema";
import {
  DEFAULT_FISCAL_CONFIG,
  getFiscalYearForDate,
  getFiscalQuarterForDate,
  getCurrentFiscalYear,
  getCurrentFiscalQuarter,
  formatFiscalPeriod,
  getQuarterDateRange,
  getFiscalYearDateRange,
  getExampleDates,
  MONTH_NAMES,
} from "@shared/fiscal-utils";

async function fetchFiscalConfig(): Promise<FiscalConfig> {
  const response = await fetch("/api/fiscal-config", {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch fiscal configuration");
  }
  return response.json();
}

async function updateFiscalConfig(config: Partial<FiscalConfig>): Promise<FiscalConfig> {
  const response = await fetch("/api/fiscal-config", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to update fiscal configuration");
  }
  return response.json();
}

export function useFiscalConfig() {
  const queryClient = useQueryClient();

  const { data: config, isLoading, error } = useQuery<FiscalConfig>({
    queryKey: ["fiscal-config"],
    queryFn: fetchFiscalConfig,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const mutation = useMutation({
    mutationFn: updateFiscalConfig,
    onSuccess: (newConfig) => {
      queryClient.setQueryData(["fiscal-config"], newConfig);
    },
  });

  const effectiveConfig = config ?? DEFAULT_FISCAL_CONFIG;

  return {
    config: effectiveConfig,
    isLoading,
    error,
    updateConfig: mutation.mutate,
    isUpdating: mutation.isPending,
    updateError: mutation.error,
    
    currentYear: getCurrentFiscalYear(effectiveConfig),
    currentQuarter: getCurrentFiscalQuarter(effectiveConfig),
    
    getYearForDate: (date: Date) => getFiscalYearForDate(date, effectiveConfig),
    getQuarterForDate: (date: Date) => getFiscalQuarterForDate(date, effectiveConfig),
    formatPeriod: (date: Date) => formatFiscalPeriod(date, effectiveConfig),
    getQuarterRange: (year: number, quarter: number) => getQuarterDateRange(year, quarter, effectiveConfig),
    getYearRange: (year: number) => getFiscalYearDateRange(year, effectiveConfig),
    getExamples: () => getExampleDates(effectiveConfig),
    
    isFiscalMode: effectiveConfig.displayMode === "fiscal",
    isCalendarMode: effectiveConfig.displayMode === "calendar",
    
    monthNames: MONTH_NAMES,
    startMonthName: MONTH_NAMES[effectiveConfig.fiscalYearStartMonth - 1],
  };
}
