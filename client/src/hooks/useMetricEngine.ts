import { useMemo } from "react";
import { MetricFunctions } from "@/lib/metrics-engine";
import { PocWithRelations } from "@shared/schema";

// Shape of a single filter clause stored inside a saved metric's
// `logic.filters` / `logic.denominatorFilters` array. Filters are
// authored by users in the metric builder, so all fields are
// optional and string-typed at the boundary.
export interface MetricFilter {
  field?: string;
  value?: string | number;
  operator?: string;
}

// Shape of a metric's `logic` blob persisted in the database. Only
// the fields the engine reads at runtime are declared here; the
// builder may carry additional UI-only fields that we ignore.
export interface MetricLogic {
  operation?: string;
  targetField?: string;
  filters?: MetricFilter[];
  denominatorType?: "custom" | string;
  denominatorFilters?: MetricFilter[];
}

// Shape of a row returned from `/api/dashboard-metrics`.
export interface SavedMetric {
  id: number | string;
  name?: string;
  logic?: MetricLogic;
}

// --- HELPER: Deep Path Resolver (The Secret Sauce) ---
// Allows accessing "customer.name" or "primarySe.firstName" safely
const resolvePath = (obj: unknown, path: string): unknown => {
  if (!path || obj == null) return undefined;
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
};

// --- 1. SINGLE METRIC CALCULATOR ---
export function useMetricCalculation(
  projects: PocWithRelations[],
  metricConfig: MetricLogic | undefined,
  allProjects?: PocWithRelations[],
) {
  return useMemo(() => {
    return calculateSingleMetric(projects, metricConfig, allProjects || projects);
  }, [projects, metricConfig, allProjects]);
}

// --- 2. BATCH RUNTIME ---
export function useDashboardRuntime(
  projects: PocWithRelations[],
  savedMetrics: SavedMetric[],
) {
  return useMemo(() => {
    if (!projects || projects.length === 0 || !savedMetrics) return {};

    const results: Record<string, unknown> = {};

    savedMetrics.forEach((metric) => {
      try {
        // A. SCOPE: Apply filters
        let scopedProjects = projects;

        const filters = metric.logic?.filters;
        if (filters && Array.isArray(filters)) {
          scopedProjects = projects.filter((p) => {
            return filters.every((f) => {
              if (!f.field || f.value === undefined || f.value === null || f.value === "") return true;

              // [UPDATE] Use resolvePath instead of direct access
              const val = String(resolvePath(p, f.field) ?? "").toLowerCase();
              const check = String(f.value).toLowerCase();

              if (f.operator === "equals") return val === check;
              if (f.operator === "contains") return val.includes(check);
              if (f.operator === "not") return val !== check;
              if (f.operator === "gt") return parseFloat(val) > parseFloat(check);
              if (f.operator === "lt") return parseFloat(val) < parseFloat(check);

              return true;
            });
          });
        }

        // B. CALCULATE
        results[String(metric.id)] = calculateSingleMetric(scopedProjects, metric.logic, projects);

        if (metric.name) results[metric.name] = results[String(metric.id)];

      } catch (e) {
        console.error(`Error calculating metric ${metric.name}:`, e);
        results[String(metric.id)] = null;
      }
    });

    return results;
  }, [projects, savedMetrics]);
}

// --- 3. EXPORTED HELPER ---
export function calculateSingleMetric(projects: PocWithRelations[], logic: MetricLogic | undefined, allProjects?: PocWithRelations[]): unknown {
  if (!projects || !logic) return 0;

  const operation = logic.operation;

  switch (operation) {
    case "count":
      return projects.length;

    case "count_active": 
      return MetricFunctions.countActive(projects);

    case "sum":
      // [UPDATE] Use resolvePath for sums too (e.g. sum of custom numeric fields)
      if (logic.targetField) {
         const field = logic.targetField;
         // Special handling for the known currency string field
         if (field === 'opportunityAcvValue') return MetricFunctions.calcTotalACV(projects);

         // Generic sum for other numbers
         return projects.reduce((sum, p) => {
             const val = parseFloat(String(resolvePath(p, field) || '0'));
             return sum + (isNaN(val) ? 0 : val);
         }, 0);
      }
      return 0; 

    case "avg":
      if (logic.targetField === 'days') return MetricFunctions.calcAvgCycleTime(projects);
      return 0;

    case "ratio":
    case "percentage": {
      const numerator = projects.length;
      let denominator = 1;

      if (logic.denominatorType === "custom" && logic.denominatorFilters && allProjects) {
        const denomFilters = logic.denominatorFilters;
        // Apply custom filters to get denominator count (matching scope filter logic)
        const denominatorProjects = allProjects.filter((p) => {
          return denomFilters.every((f) => {
            if (!f.field || f.value === undefined || f.value === null || f.value === "") return true;
            const val = String(resolvePath(p, f.field) ?? "").toLowerCase();
            const check = String(f.value).toLowerCase();
            const valNum = parseFloat(val) || 0;
            const checkNum = parseFloat(check) || 0;

            if (f.operator === "equals") return val === check;
            if (f.operator === "not") return val !== check;
            if (f.operator === "contains") return val.includes(check);
            if (f.operator === "gt") return valNum > checkNum;
            if (f.operator === "lt") return valNum < checkNum;
            return true;
          });
        });
        denominator = denominatorProjects.length || 1;
      } else if (allProjects) {
        // Default: all records in source
        denominator = allProjects.length || 1;
      }

      const ratio = numerator / denominator;
      
      if (operation === "percentage") {
        return Math.round(ratio * 100 * 10) / 10; // One decimal place
      }
      return Math.round(ratio * 100) / 100; // Two decimal places for ratio
    }

    case "win_rate": return MetricFunctions.calcWinRate(projects);
    case "avg_cycle": return MetricFunctions.calcAvgCycleTime(projects);
    case "sparkline_active": return MetricFunctions.generateSparkline(projects, "active");
    case "sparkline_won": return MetricFunctions.generateSparkline(projects, "won");
    case "dist_status": return MetricFunctions.groupByStatus(projects);
    case "dist_risk": return MetricFunctions.groupByRisk(projects);
    case "fiscal_trends": return []; 

    default: return 0;
  }
}