// Dashboard Stats — mixin for DatabaseStorage (Phase 7 #26).
//
// Two large rollup queries that drive the home dashboard tiles:
//
//   getDashboardStats         (project counts by status, total customers,
//                              and the project-success-rate calculation)
//   getMapDashboardStats      (MAP-specific rollup — active map tasks per
//                              user, assignment balance, overdue tasks,
//                              recent activity counts; used by the
//                              MAP landing page tiles)
//
// Both queries read across all projects of the current mode: demo rows
// in a demo request, real rows otherwise (applyDemoFilter), so seeded
// demo projects never inflate the real dashboard and vice versa.
import { db } from "../db";
import { eq, and, or, count, ne, isNotNull, lt } from "drizzle-orm";
import { applyDemoFilter } from "../lib/demo-storage";
import {
  projects,
  customers,
  mapTasks,
  mapPhases,
  mapSteps,
} from "@shared/schema";
import { isMapItemComplete } from "@shared/map-status";

export class DashboardStatsStorageMixin {
  // Dashboard stats
  async getDashboardStats(userId: string): Promise<{
    active: number;
    completed: number;
    customers: number;
    successRate: number;
  }> {
    // Active projects: In Progress, On Hold
    const [activeCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(
        or(
          eq(projects.status, "in progress"),
          eq(projects.status, "on hold")
        ),
        applyDemoFilter(projects),
      ));

    // Technically Cleared To Close projects: TCC Stage
    const [completedCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.status, "TCC Stage"), applyDemoFilter(projects)));

    // For success rate calculation: only count projects that have definitive outcomes
    const [closedWonCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.status, "Closed Won"), applyDemoFilter(projects)));

    const [closedLostCount] = await db
      .select({ count: count() })
      .from(projects)
      .where(and(eq(projects.status, "Closed Lost"), applyDemoFilter(projects)));

    // Get actual customer count from Customer Portal
    const [customerCount] = await db
      .select({ count: count() })
      .from(customers)
      .where(and(eq(customers.isActive, true), applyDemoFilter(customers)));

    // Success rate calculation: (Closed Won # / (Closed Won # + Closed Lost #)) * 100
    const totalClosedDeals = closedWonCount.count + closedLostCount.count;
    const successRate = totalClosedDeals > 0
      ? Math.round((closedWonCount.count / totalClosedDeals) * 100)
      : 0;

    return {
      active: activeCount.count,
      completed: completedCount.count,
      customers: customerCount.count,
      successRate,
    };
  }

  async getMapDashboardStats(userId: string): Promise<{
    totalMapProjects: number;
    avgCompletionRate: number;
    activeMapTasks: number;
    assignmentBalance: number;
    overdueTasks: number;
    recentActivity: number;
  }> {
    try {
      // Count projects with MAP templates (have MAP data)
      const [mapProjectsCount] = await db
        .select({ count: count() })
        .from(projects)
        .where(and(isNotNull(projects.templateId), applyDemoFilter(projects)));

      // Get all MAP phases with steps and tasks for completion calculation
      const mapHierarchy = await db
        .select({
          phaseId: mapPhases.id,
          phaseStatus: mapPhases.status,
          stepId: mapSteps.id,
          stepStatus: mapSteps.status,
          taskId: mapTasks.id,
          taskStatus: mapTasks.status,
          projectId: mapPhases.projectId
        })
        .from(mapPhases)
        .leftJoin(mapSteps, eq(mapPhases.id, mapSteps.phaseId))
        .leftJoin(mapTasks, eq(mapSteps.id, mapTasks.stepId))
        .innerJoin(projects, eq(mapPhases.projectId, projects.id))
        .where(and(isNotNull(projects.templateId), applyDemoFilter(projects)));

      // Calculate completion statistics
      let totalElements = 0;
      let completedElements = 0;
      const projectCompletionRates: { [projectId: number]: number } = {};

      // Group by project for completion calculation
      const projectGroups: { [projectId: number]: typeof mapHierarchy } = {};
      mapHierarchy.forEach((item) => {
        if (!projectGroups[item.projectId]) {
          projectGroups[item.projectId] = [];
        }
        projectGroups[item.projectId].push(item);
      });

      // Calculate completion rate per project
      Object.entries(projectGroups).forEach(([projectId, items]) => {
        const projectId_ = parseInt(projectId);
        let projectTotal = 0;
        let projectCompleted = 0;

        items.forEach((item) => {
          // Count phases
          if (item.phaseId) {
            projectTotal++;
            if (isMapItemComplete(item.phaseStatus)) projectCompleted++;
          }
          // Count steps
          if (item.stepId) {
            projectTotal++;
            if (isMapItemComplete(item.stepStatus)) projectCompleted++;
          }
          // Count tasks
          if (item.taskId) {
            projectTotal++;
            if (isMapItemComplete(item.taskStatus)) projectCompleted++;
          }
        });

        totalElements += projectTotal;
        completedElements += projectCompleted;
        projectCompletionRates[projectId_] = projectTotal > 0 ? (projectCompleted / projectTotal) * 100 : 0;
      });

      // Calculate average completion rate across all projects
      const avgCompletionRate = mapProjectsCount.count > 0 
        ? Object.values(projectCompletionRates).reduce((sum, rate) => sum + rate, 0) / mapProjectsCount.count
        : 0;

      // Count active MAP tasks (in_progress status)
      const [activeTasksCount] = await db
        .select({ count: count() })
        .from(mapTasks)
        .innerJoin(projects, eq(mapTasks.projectId, projects.id))
        .where(and(eq(mapTasks.status, 'in_progress'), applyDemoFilter(projects)));

      // Count overdue tasks (with due dates in the past and not completed)
      const now = new Date();
      const [overdueTasksCount] = await db
        .select({ count: count() })
        .from(mapTasks)
        .innerJoin(projects, eq(mapTasks.projectId, projects.id))
        .where(
          and(
            applyDemoFilter(projects),
            isNotNull(mapTasks.dueDate),
            lt(mapTasks.dueDate, now),
            ne(mapTasks.status, 'complete')
          )
        );

      // Assignment analytics - disabled temporarily
      // NOTE: MAP assignments are stored directly in phase/step/task entities
      // (assignedToUserId, assignedToCustomerUserId, additionalInternalUserId, teamOwned)
      // A future enhancement could calculate balance based on these fields across entities
      const balanceScore = 0;
      const recentActivityCount = { count: 0 };

      return {
        totalMapProjects: mapProjectsCount.count,
        avgCompletionRate: Math.round(avgCompletionRate),
        activeMapTasks: activeTasksCount.count,
        assignmentBalance: Math.round(balanceScore),
        overdueTasks: overdueTasksCount.count,
        recentActivity: recentActivityCount.count,
      };
    } catch (error) {
      console.error("Error calculating MAP dashboard stats:", error);
      return {
        totalMapProjects: 0,
        avgCompletionRate: 0,
        activeMapTasks: 0,
        assignmentBalance: 0,
        overdueTasks: 0,
        recentActivity: 0,
      };
    }
  }
}
