import { PocWithRelations } from "@shared/schema";
import {
  differenceInDays,
  startOfWeek,
  endOfWeek,
  subMonths,
  startOfMonth,
  endOfMonth,
} from "date-fns";

// --- 1. CORE UTILITIES (Extracted from OLD dashboard) ---

const parseACV = (value: string | null | undefined): number => {
  if (!value) return 0;
  return parseFloat(value.replace(/[$,]/g, "")) || 0;
};

const getProjectDuration = (p: PocWithRelations): number => {
  if (!p.startDate || !p.endDate) return 0;
  return Math.max(
    0,
    differenceInDays(new Date(p.endDate), new Date(p.startDate)),
  );
};

const isClosed = (status?: string | null) =>
  ["closed won", "closed lost", "cancelled"].includes((status ?? "").toLowerCase());
const isWon = (status?: string | null) => (status ?? "").toLowerCase() === "closed won";
const isLost = (status?: string | null) => (status ?? "").toLowerCase() === "closed lost";

// --- 2. ATOMIC LOGIC LINES (The Reusable Functions) ---

export const MetricFunctions = {
  // --- SCALAR METRICS (Single Numbers) ---

  countActive: (projects: PocWithRelations[]) =>
    projects.filter((p) => !isClosed(p.status)).length,

  countCompleted: (projects: PocWithRelations[]) =>
    projects.filter((p) => p.status?.toLowerCase() === "completed").length,

  calcWinRate: (projects: PocWithRelations[]) => {
    const won = projects.filter((p) => isWon(p.status)).length;
    const lost = projects.filter((p) => isLost(p.status)).length;
    const total = won + lost;
    return total > 0 ? Math.round((won / total) * 100) : 0;
  },

  calcAvgCycleTime: (projects: PocWithRelations[]) => {
    const closedProjects = projects.filter(
      (p) => isClosed(p.status) && p.startDate && p.endDate,
    );
    if (closedProjects.length === 0) return 0;

    const totalDays = closedProjects.reduce(
      (sum, p) => sum + getProjectDuration(p),
      0,
    );
    return Math.round(totalDays / closedProjects.length);
  },

  calcTotalACV: (projects: PocWithRelations[]) => {
    return projects.reduce(
      (sum, p) => sum + parseACV(p.opportunityAcvValue),
      0,
    );
  },

  countDueSoon: (projects: PocWithRelations[], days = 5) => {
    const now = new Date();
    const future = new Date();
    future.setDate(now.getDate() + days);

    return projects.filter((p) => {
      if (!p.endDate) return false;
      const end = new Date(p.endDate);
      return end >= now && end <= future && !isClosed(p.status);
    }).length;
  },

  // --- SERIES METRICS (Sparklines / Trends) ---

  // Replaces 'generateRealKpiData' from OLD file
  generateSparkline: (
    projects: PocWithRelations[],
    type: "active" | "completed" | "won",
    weeks = 12,
  ) => {
    const data: number[] = [];
    const now = new Date();

    for (let i = 0; i < weeks; i++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (weeks - i - 1) * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      let value = 0;
      // Filter scope to this specific week
      const weeklyScope = projects.filter((p) => {
        const date = new Date((p.updatedAt || p.createdAt) ?? 0);
        return date <= weekEnd; // Cumulative count snapshot
      });

      switch (type) {
        case "active":
          value = weeklyScope.filter((p) => !isClosed(p.status)).length;
          break;
        case "completed":
          // For events (completed), we only count if it happened IN that week
          value = projects.filter((p) => {
            const d = new Date((p.updatedAt || p.createdAt) ?? 0);
            return p.status === "completed" && d >= weekStart && d <= weekEnd;
          }).length;
          break;
        case "won":
          value = projects.filter(
            (p) =>
              isWon(p.status) &&
              new Date(p.updatedAt!) >= weekStart &&
              new Date(p.updatedAt!) <= weekEnd,
          ).length;
          break;
      }
      data.push(value);
    }
    return data;
  },

  // --- DISTRIBUTION METRICS (Pie/Bar Charts) ---

  groupByStatus: (projects: PocWithRelations[]) => {
    const counts: Record<string, number> = {};
    projects.forEach((p) => {
      const s = p.status || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  },

  groupByRisk: (projects: PocWithRelations[]) => {
    const counts: Record<string, number> = { Red: 0, Yellow: 0, None: 0 };
    projects.forEach((p) => {
      const r = p.risk || "None";
      if (counts[r] !== undefined) counts[r]++;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  },
};
