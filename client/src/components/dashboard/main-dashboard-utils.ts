import { CUSTOMER_STATUS_NEUTRAL_FALLBACK } from "@/lib/customerStatusUtils";
import { Activity, Clock, Trophy, History } from "lucide-react";
import type { DashboardDataContext } from "./dashboard-renderer";

// Minimal structural shapes used by these helpers. They intentionally
// mirror only the fields these helpers read so they are usable from
// either the Drizzle row type or the JSON payload.
interface StatusConfigLike {
  id?: number;
  name: string;
  color?: string | null;
  icon?: string | null;
}

interface CustomerStatusConfigLike extends StatusConfigLike {
  isActive?: boolean | null;
}

export function getCustomerStatusConfig(
  customerStatusConfigs: CustomerStatusConfigLike[] | undefined,
  name: string,
) {
  return (
    customerStatusConfigs?.find((c) => c.name === name) ||
    CUSTOMER_STATUS_NEUTRAL_FALLBACK
  );
}

export function getStatusConfig(statusConfigs: StatusConfigLike[] | undefined, name: string) {
  return statusConfigs?.find(
    (c) => c.name.toLowerCase() === name.toLowerCase(),
  );
}

export function getNormalizedStatusValue(
  statusConfigs: StatusConfigLike[] | undefined,
  status: string | undefined,
): string {
  if (!status) return "all-statuses";
  const matchingConfig = statusConfigs?.find(
    (c) => c.name.toLowerCase() === status.toLowerCase(),
  );
  return matchingConfig?.name || status;
}

/**
 * Build the standard `dataContext` shape consumed by `DashboardRenderer`
 * smart widgets (kpi_strip, account_metrics, project_metrics,
 * status_distribution, fiscal_trends, project_schedules, support_metrics).
 *
 * Mirrors the calculations in `MainDashboard` so the protected built-in
 * dashboards seeded for `account_portal`, `project_validation`, and
 * `support` populate the same way they do on the Overview page.
 */
export function buildDashboardDataContext(
  projects: any[],
  dynamicData: Record<string, any> = {},
): DashboardDataContext {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const total = safeProjects.length;
  const active = safeProjects.filter(
    (p) =>
      !["closed won", "closed lost", "cancelled"].includes(
        (p.status ?? "").toLowerCase(),
      ),
  ).length;
  const closedWon = safeProjects.filter(
    (p) => (p.status ?? "").toLowerCase() === "closed won",
  ).length;

  const now = Date.now();
  let totalAge = 0;
  let totalCycle = 0;
  let closedCount = 0;
  safeProjects.forEach((p) => {
    const start = p.startDate
      ? new Date(p.startDate).getTime()
      : new Date(p.createdAt ?? now).getTime();
    const end = p.endDate ? new Date(p.endDate).getTime() : now;
    totalAge += now - start;
    if (["closed won", "closed lost"].includes((p.status ?? "").toLowerCase())) {
      closedCount++;
      totalCycle += end - start;
    }
  });
  const avgAgeDays =
    total > 0 ? Math.round(totalAge / total / (1000 * 60 * 60 * 24)) : 0;
  const avgCycleDays =
    closedCount > 0
      ? Math.round(totalCycle / closedCount / (1000 * 60 * 60 * 24))
      : 0;

  const statusCounts: Record<string, number> = {};
  safeProjects.forEach((p) => {
    const s = p.status || "Unknown";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  });

  return {
    projects: safeProjects,
    dynamicData,
    kpiItems: [
      {
        label: "Active Projects",
        value: active,
        change: 0,
        trend: "neutral",
        icon: Activity,
      },
      {
        label: "Avg Age (Days)",
        value: avgAgeDays,
        change: 0,
        trend: "neutral",
        icon: Clock,
      },
      {
        label: "Win Rate",
        value: total > 0 ? `${Math.round((closedWon / total) * 100)}%` : "0%",
        change: 0,
        trend: "up",
        icon: Trophy,
      },
      {
        label: "Avg Cycle (Days)",
        value: avgCycleDays,
        change: 0,
        trend: "down",
        icon: History,
      },
    ],
    projectMetrics: {
      statusData: Object.entries(statusCounts).map(([name, value]) => ({
        name,
        value,
      })),
      closedData: [],
      metrics: { avgAge: avgAgeDays, avgCycle: avgCycleDays },
    },
  };
}
