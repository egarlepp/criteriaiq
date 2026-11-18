import { Shield, ShieldAlert, ShieldQuestion, ShieldX } from "lucide-react";
import {
  SEVERITY_LEVELS,
  classifyErrorSeverity,
  type SeverityLevel,
  type ErrorClassification,
} from "@shared/error-severity";

/**
 * UI layer over the SHARED, pure severity classifier.
 *
 * The pure classification heuristic (`classifyErrorSeverity`) now lives in
 * `shared/error-severity.ts` so the Node server can import it too (it has
 * no `lucide-react`/React dependency). This module re-exports that public
 * API unchanged and layers on the browser-only `SEVERITY_CONFIG`
 * (icons + chart colors). Existing importers
 * (`ErrorAuditLogTab.tsx`, `ClientErrorsAnalytics.tsx`) keep importing
 * `classifyErrorSeverity`, `SeverityLevel`, `SEVERITY_CONFIG`,
 * `ErrorClassification`, and `SEVERITY_ORDER` from `@/lib/error-severity`
 * with no changes.
 *
 * Keeping the classifier shared guarantees the analytics pie chart (now
 * computed server-side from the full uncapped row set) and the audit-log
 * table always agree — there is a single source of truth for the
 * heuristic.
 */

// Re-export the shared, pure classifier surface so existing client
// importers are untouched.
export { classifyErrorSeverity };
export type { SeverityLevel, ErrorClassification };

/**
 * Render order / sort order for severities (most severe first). Useful
 * for ordering legends, axes, and pie slices consistently. Aliased to the
 * shared `SEVERITY_LEVELS` so there is a single source of truth.
 */
export const SEVERITY_ORDER: SeverityLevel[] = SEVERITY_LEVELS;

export interface SeverityConfigEntry {
  label: string;
  /** Tailwind badge classes (light + dark). */
  badgeClass: string;
  icon: typeof ShieldAlert;
  /** Maps to the support-request priority field when filing an error. */
  priorityMap: "critical" | "high" | "medium" | "low";
  /** Solid hex color for charts (light mode). */
  chartColor: string;
  /** Solid hex color for charts (dark mode). */
  chartColorDark: string;
}

export const SEVERITY_CONFIG: Record<SeverityLevel, SeverityConfigEntry> = {
  critical: {
    label: "Critical",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800",
    icon: ShieldX,
    priorityMap: "critical",
    chartColor: "#dc2626", // red-600
    chartColorDark: "#f87171", // red-400
  },
  high: {
    label: "High",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-300 dark:border-orange-800",
    icon: ShieldAlert,
    priorityMap: "high",
    chartColor: "#ea580c", // orange-600
    chartColorDark: "#fb923c", // orange-400
  },
  medium: {
    label: "Medium",
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800",
    icon: ShieldQuestion,
    priorityMap: "medium",
    chartColor: "#ca8a04", // yellow-600
    chartColorDark: "#facc15", // yellow-400
  },
  low: {
    label: "Low",
    badgeClass: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-300 dark:border-gray-700",
    icon: Shield,
    priorityMap: "low",
    chartColor: "#6b7280", // gray-500
    chartColorDark: "#9ca3af", // gray-400
  },
};
