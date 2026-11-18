import { db } from "../db";
import { metricSnapshots, projects, customers, mapPhases, mapSteps, mapTasks } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, like } from "drizzle-orm";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { format, startOfWeek, subWeeks, getISOWeek, getYear } from "date-fns";

export interface MetricDefinition {
  key: string;
  name: string;
  description: string;
  category: "kpi" | "map" | "support" | "custom";
  unit: "count" | "currency" | "percentage" | "days" | "hours";
  calculate: (context: CalculationContext) => Promise<number>;
}

export interface CalculationContext {
  projects: any[];
  customers: any[];
  mapPhases: any[];
  mapSteps: any[];
  mapTasks: any[];
  now: Date;
  weekStart: Date;
  weekEnd: Date;
}

const parseACV = (p: any): number => {
  const val = p.opportunityAcvValue;
  if (!val) return 0;
  if (typeof val === "number") return val;
  const cleaned = String(val).replace(/[$,]/g, "");
  return parseFloat(cleaned) || 0;
};

const isActiveProject = (p: any): boolean => {
  const status = (p.status || "").toLowerCase();
  const closedStatuses = ["closed", "completed", "won", "lost", "cancelled", "technical close confirmed", "tcc"];
  return !closedStatuses.some(s => status.includes(s));
};

const isCompletedStatus = (status: string): boolean => {
  const s = (status || "").toLowerCase();
  return s.includes("completed") || s.includes("technical close confirmed") || s === "tcc";
};

const isWonStatus = (status: string): boolean => {
  const s = (status || "").toLowerCase();
  return s.includes("won") || s === "closed won" || s === "closed - won";
};

const isLostStatus = (status: string): boolean => {
  const s = (status || "").toLowerCase();
  return s.includes("lost") || s === "closed lost" || s === "closed - lost";
};

export const METRIC_REGISTRY: MetricDefinition[] = [
  {
    key: "kpi.total_completed_count",
    name: "Clear to Close (TCC)",
    description: "Number of projects with Technical Close Confirmed status",
    category: "kpi",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.projects.filter(p => isCompletedStatus(p.status)).length;
    },
  },
  {
    key: "kpi.avg_days_to_close",
    name: "Average Days to Close",
    description: "Average duration from start to close for completed projects",
    category: "kpi",
    unit: "days",
    calculate: async (ctx) => {
      const completed = ctx.projects.filter(p => isCompletedStatus(p.status) && p.startDate && p.endDate);
      if (completed.length === 0) return 0;
      const totalDays = completed.reduce((sum, p) => {
        return sum + Math.ceil((new Date(p.endDate).getTime() - new Date(p.startDate).getTime()) / 86400000);
      }, 0);
      return Math.round(totalDays / completed.length);
    },
  },
  {
    key: "kpi.active_pipeline_acv",
    name: "Active Pipeline Value",
    description: "Total ACV value of all active projects",
    category: "kpi",
    unit: "currency",
    calculate: async (ctx) => {
      const activeProjects = ctx.projects.filter(isActiveProject);
      return activeProjects.reduce((sum, p) => sum + parseACV(p), 0);
    },
  },
  {
    key: "kpi.new_pipeline_this_week",
    name: "New Pipeline This Week",
    description: "ACV value of projects created this week",
    category: "kpi",
    unit: "currency",
    calculate: async (ctx) => {
      const newThisWeek = ctx.projects.filter(p => {
        if (!p.createdAt) return false;
        const created = new Date(p.createdAt);
        return created >= ctx.weekStart && created <= ctx.weekEnd && isActiveProject(p);
      });
      return newThisWeek.reduce((sum, p) => sum + parseACV(p), 0);
    },
  },
  {
    key: "kpi.success_rate",
    name: "Success Rate",
    description: "Percentage of closed projects that were won",
    category: "kpi",
    unit: "percentage",
    calculate: async (ctx) => {
      const won = ctx.projects.filter(p => isWonStatus(p.status)).length;
      const lost = ctx.projects.filter(p => isLostStatus(p.status)).length;
      const totalClosed = won + lost;
      return totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;
    },
  },
  {
    key: "kpi.completing_soon_count",
    name: "Completing Soon",
    description: "Number of projects ending within 5 days",
    category: "kpi",
    unit: "count",
    calculate: async (ctx) => {
      const future5 = new Date(ctx.now);
      future5.setDate(ctx.now.getDate() + 5);
      return ctx.projects.filter(p => {
        if (!p.endDate) return false;
        const end = new Date(p.endDate);
        return isActiveProject(p) && end >= ctx.now && end <= future5;
      }).length;
    },
  },
  {
    key: "kpi.started_this_week_count",
    name: "Started This Week",
    description: "Number of projects started this week",
    category: "kpi",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.projects.filter(p => {
        if (!p.startDate) return false;
        const start = new Date(p.startDate);
        return start >= ctx.weekStart && start <= ctx.weekEnd;
      }).length;
    },
  },
  {
    key: "kpi.at_risk_count",
    name: "At Risk Projects",
    description: "Number of projects marked as high or critical risk",
    category: "kpi",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.projects.filter(p => {
        const risk = (p.risk || "").toLowerCase();
        return isActiveProject(p) && (risk === "high" || risk === "critical" || risk === "red");
      }).length;
    },
  },
  {
    key: "kpi.won_acv",
    name: "Won ACV",
    description: "Total ACV value of won projects",
    category: "kpi",
    unit: "currency",
    calculate: async (ctx) => {
      return ctx.projects.filter(p => isWonStatus(p.status)).reduce((sum, p) => sum + parseACV(p), 0);
    },
  },
  {
    key: "kpi.lost_acv",
    name: "Lost ACV",
    description: "Total ACV value of lost projects",
    category: "kpi",
    unit: "currency",
    calculate: async (ctx) => {
      return ctx.projects.filter(p => isLostStatus(p.status)).reduce((sum, p) => sum + parseACV(p), 0);
    },
  },
  {
    key: "kpi.customer_count",
    name: "Total Customers",
    description: "Total number of customers in the system",
    category: "kpi",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.customers.length;
    },
  },
  {
    key: "map.phases_completed",
    name: "MAP Phases Completed",
    description: "Total number of completed MAP phases",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapPhases.filter(p => p.isComplete).length;
    },
  },
  {
    key: "map.phases_total",
    name: "MAP Phases Total",
    description: "Total number of MAP phases",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapPhases.length;
    },
  },
  {
    key: "map.steps_completed",
    name: "MAP Steps Completed",
    description: "Total number of completed MAP steps",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapSteps.filter(s => s.isComplete).length;
    },
  },
  {
    key: "map.steps_total",
    name: "MAP Steps Total",
    description: "Total number of MAP steps",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapSteps.length;
    },
  },
  {
    key: "map.tasks_completed",
    name: "MAP Tasks Completed",
    description: "Total number of completed MAP tasks",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapTasks.filter(t => t.isComplete).length;
    },
  },
  {
    key: "map.tasks_total",
    name: "MAP Tasks Total",
    description: "Total number of MAP tasks",
    category: "map",
    unit: "count",
    calculate: async (ctx) => {
      return ctx.mapTasks.length;
    },
  },
  {
    key: "map.overall_completion",
    name: "MAP Overall Completion %",
    description: "Overall MAP completion percentage across all projects",
    category: "map",
    unit: "percentage",
    calculate: async (ctx) => {
      const totalTasks = ctx.mapTasks.length;
      if (totalTasks === 0) return 0;
      const completedTasks = ctx.mapTasks.filter(t => t.isComplete).length;
      return Math.round((completedTasks / totalTasks) * 100);
    },
  },
];

export function getISOWeekString(date: Date): string {
  const week = getISOWeek(date);
  const year = getYear(date);
  return `${year}-W${week.toString().padStart(2, "0")}`;
}

/**
 * Demo Mode keeps its own sparkline history under this key prefix, written
 * by the demo seed and removed by the wipe; the real history never mixes
 * with it.
 */
export const DEMO_METRIC_PREFIX = "demo:";

export class MetricSnapshotService {
  /**
   * Inputs for the metric calculations. Real rows by default; `demo` reads
   * the demo projects instead and `asOf` rewinds to a past week (projects
   * created after it are left out), for the demo seed's history.
   */
  async getCalculationContext(opts: { demo?: boolean; asOf?: Date } = {}): Promise<CalculationContext> {
    const demo = opts.demo === true;
    const now = opts.asOf ?? new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 });
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Snapshots are the real trend history, so Demo Mode rows never count,
    // even when a demo session triggers a snapshot. MAP rows added to a demo
    // project during a demo aren't flagged is_demo themselves, so they are
    // dropped by their project instead.
    const [allProjects, allCustomers, allMapPhases, allMapSteps, allMapTasks] = await Promise.all([
      db.select().from(projects).where(and(eq(projects.isDemo, demo), lte(projects.createdAt, now))),
      db.select().from(customers).where(and(eq(customers.isDemo, demo), lte(customers.createdAt, now))),
      db.select().from(mapPhases),
      db.select().from(mapSteps),
      db.select().from(mapTasks),
    ]);
    const realProjectIds = new Set(allProjects.map((p) => p.id));
    const onRealProject = (row: { projectId: number | null }) =>
      row.projectId !== null && realProjectIds.has(row.projectId);

    return {
      projects: allProjects,
      customers: allCustomers,
      mapPhases: allMapPhases.filter(onRealProject),
      mapSteps: allMapSteps.filter(onRealProject),
      mapTasks: allMapTasks.filter(onRealProject),
      now,
      weekStart,
      weekEnd,
    };
  }

  async calculateMetric(metricKey: string): Promise<number | null> {
    const definition = METRIC_REGISTRY.find(m => m.key === metricKey);
    if (!definition) {
      console.warn(`Metric definition not found for key: ${metricKey}`);
      return null;
    }

    const context = await this.getCalculationContext();
    return definition.calculate(context);
  }

  async saveSnapshot(metricKey: string, value: number, snapshotDate?: Date): Promise<void> {
    const date = snapshotDate || new Date();
    const weekString = getISOWeekString(date);

    await db.insert(metricSnapshots).values({
      metricKey,
      value: value.toString(),
      snapshotDate: date,
      snapshotWeek: weekString,
      metadata: {},
    });
  }

  async captureAllMetrics(): Promise<{ key: string; value: number }[]> {
    const context = await this.getCalculationContext();
    const results: { key: string; value: number }[] = [];
    const now = new Date();
    const weekString = getISOWeekString(now);

    for (const metric of METRIC_REGISTRY) {
      try {
        const value = await metric.calculate(context);
        await db.insert(metricSnapshots).values({
          metricKey: metric.key,
          value: value.toString(),
          snapshotDate: now,
          snapshotWeek: weekString,
          metadata: {},
        });
        results.push({ key: metric.key, value });
      } catch (error) {
        console.error(`Error calculating metric ${metric.key}:`, error);
      }
    }

    return results;
  }

  async getHistory(metricKey: string, limit: number = 6): Promise<{ date: string; week: string; value: number }[]> {
    const storedKey = isCurrentRequestDemo() ? `${DEMO_METRIC_PREFIX}${metricKey}` : metricKey;
    const snapshots = await db
      .select()
      .from(metricSnapshots)
      .where(eq(metricSnapshots.metricKey, storedKey))
      .orderBy(desc(metricSnapshots.snapshotDate))
      .limit(limit);

    return snapshots.reverse().map(s => ({
      date: format(new Date(s.snapshotDate), "MMM d"),
      week: s.snapshotWeek || "",
      value: parseFloat(s.value),
    }));
  }

  async getMultipleHistory(metricKeys: string[], limit: number = 6): Promise<Record<string, { date: string; week: string; value: number }[]>> {
    const result: Record<string, { date: string; week: string; value: number }[]> = {};

    await Promise.all(
      metricKeys.map(async (key) => {
        result[key] = await this.getHistory(key, limit);
      })
    );

    return result;
  }

  getMetricDefinition(metricKey: string): MetricDefinition | undefined {
    return METRIC_REGISTRY.find(m => m.key === metricKey);
  }

  getAllMetricDefinitions(): MetricDefinition[] {
    return METRIC_REGISTRY;
  }
}

export const metricSnapshotService = new MetricSnapshotService();

/**
 * Writes `weeks` weekly history points for every metric from the demo
 * projects as they stood each week, under DEMO_METRIC_PREFIX. Replaces
 * any earlier demo history. Returns the number of points written.
 */
export async function seedDemoMetricHistory(weeks = 12): Promise<number> {
  await removeDemoMetricHistory();
  let written = 0;
  for (let w = weeks - 1; w >= 0; w--) {
    const asOf = subWeeks(new Date(), w);
    const context = await metricSnapshotService.getCalculationContext({ demo: true, asOf });
    const rows: Array<typeof metricSnapshots.$inferInsert> = [];
    for (const metric of METRIC_REGISTRY) {
      const value = await metric.calculate(context);
      if (!Number.isFinite(value)) continue;
      rows.push({
        metricKey: `${DEMO_METRIC_PREFIX}${metric.key}`,
        value: value.toString(),
        snapshotDate: asOf,
        snapshotWeek: getISOWeekString(asOf),
        metadata: { demo: true },
      });
    }
    if (rows.length > 0) {
      await db.insert(metricSnapshots).values(rows);
      written += rows.length;
    }
  }
  return written;
}

/** Removes the demo sparkline history. Returns the number of points removed. */
export async function removeDemoMetricHistory(): Promise<number> {
  const removed = await db.delete(metricSnapshots)
    .where(like(metricSnapshots.metricKey, `${DEMO_METRIC_PREFIX}%`))
    .returning({ id: metricSnapshots.id });
  return removed.length;
}
