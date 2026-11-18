/**
 * Registry of every protected built-in dashboard the application
 * seeds on first install (Task #555 + Task #562).
 *
 * Task #555 introduced the `is_protected` column on
 * `dashboard_layouts`, the partial unique index on
 * `(page_key, role) WHERE is_protected`, and the seed-once-then-stamp
 * helper for the Overview dashboard. That plumbing is generic — the
 * same machinery happily seeds a built-in default for any other page
 * without further schema work. This module is the canonical list of
 * those (name, pageKey, role, description, layoutConfig) tuples and
 * is consumed by `seedProtectedDashboardLayouts`.
 *
 * Adding a new built-in dashboard:
 *   1. Define a `DEFAULT_*_LAYOUT_NAME`, `DEFAULT_*_PAGE_KEY`,
 *      `DEFAULT_*_ROLE`, and `DEFAULT_*_LAYOUT_CONFIG` constant
 *      (mirroring the Overview shape so the renderer's `sections`
 *      contract is satisfied).
 *   2. Append a `PROTECTED_DASHBOARD_SEEDS` entry pointing at those
 *      constants. The seeder iterates the array, so no further
 *      wiring is required.
 *   3. Make sure the page key is registered in
 *      `client/src/config/app-pages.ts` so admins can select it in
 *      the Dashboard Builder and see the "Built-in" badge surface.
 */
import {
  DEFAULT_OVERVIEW_LAYOUT_NAME,
  DEFAULT_OVERVIEW_PAGE_KEY,
  DEFAULT_OVERVIEW_ROLE,
  DEFAULT_OVERVIEW_LAYOUT_CONFIG,
} from "./default-overview-dashboard";

// ---------------------------------------------------------------------------
// Account Portal — Customer / account-centric overview. Surfaces the
// account-metrics smart widget (customer counts, status breakdown)
// alongside the standard KPI strip so the page boots with meaningful
// content for CSMs and account leads.
// ---------------------------------------------------------------------------
export const DEFAULT_ACCOUNT_PORTAL_LAYOUT_NAME = "Account Portal - Dashboard Builder";
export const DEFAULT_ACCOUNT_PORTAL_PAGE_KEY = "account_portal";
export const DEFAULT_ACCOUNT_PORTAL_ROLE = "All";

export const DEFAULT_ACCOUNT_PORTAL_LAYOUT_CONFIG = {
  layouts: [
    {
      id: "default_layout",
      name: "Standard Account Portal",
      role: "All",
      roles: ["all"],
      isDefault: true,
      sections: [
        {
          id: "section-account-kpis",
          columns: 3,
          widgetIds: ["kpi_main"],
        },
        {
          id: "section-account-detail",
          columns: 2,
          widgetIds: ["account_metrics", "project_metrics"],
        },
      ],
    },
  ],
  widgets: {
    kpi_main: {
      id: "kpi_main",
      type: "kpi_strip",
      title: "Key Performance Indicators",
      iconName: "BarChart3",
      dataSource: "kpi_main_data",
      gridColSpan: 3,
      gridRowSpan: 1,
      settings: { colorScheme: ["#1E40AF"] },
    },
    account_metrics: {
      id: "account_metrics",
      type: "account_metrics_component",
      title: "Account Metrics",
      iconName: "Users",
      dataSource: "account_metrics_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: true, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
    project_metrics: {
      id: "project_metrics",
      type: "project_metrics_component",
      title: "Project Metrics",
      iconName: "PieChart",
      dataSource: "project_metrics_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: false, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Projects Workspace — landing tab of the Projects area. Surfaces the
// status distribution, project metrics donut, project schedules, and
// fiscal trends so engineers/PMs see project health at a glance.
// We seed the `project_validation` page key (the canonical Projects
// landing in `client/src/config/app-pages.ts`).
// ---------------------------------------------------------------------------
export const DEFAULT_PROJECTS_LAYOUT_NAME = "Projects - Dashboard Builder";
export const DEFAULT_PROJECTS_PAGE_KEY = "project_validation";
export const DEFAULT_PROJECTS_ROLE = "All";

export const DEFAULT_PROJECTS_LAYOUT_CONFIG = {
  layouts: [
    {
      id: "default_layout",
      name: "Standard Projects Workspace",
      role: "All",
      roles: ["all"],
      isDefault: true,
      sections: [
        {
          id: "section-projects-kpis",
          columns: 3,
          widgetIds: ["kpi_main"],
        },
        {
          id: "section-projects-detail",
          columns: 3,
          widgetIds: ["status_distribution", "project_metrics", "fiscal_trends"],
        },
        {
          id: "section-projects-schedules",
          columns: 1,
          widgetIds: ["project_schedules"],
        },
      ],
    },
  ],
  widgets: {
    kpi_main: {
      id: "kpi_main",
      type: "kpi_strip",
      title: "Key Performance Indicators",
      iconName: "BarChart3",
      dataSource: "kpi_main_data",
      gridColSpan: 3,
      gridRowSpan: 1,
      settings: { colorScheme: ["#1E40AF"] },
    },
    status_distribution: {
      id: "status_distribution",
      type: "status_distribution_component",
      title: "Status Distribution",
      iconName: "PieChart",
      dataSource: "status_distribution_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: true, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
    project_metrics: {
      id: "project_metrics",
      type: "project_metrics_component",
      title: "Project Metrics",
      iconName: "ChartArea",
      dataSource: "project_metrics_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: false, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
    fiscal_trends: {
      id: "fiscal_trends",
      type: "fiscal_trends_component",
      title: "Fiscal Trends",
      iconName: "TrendingUp",
      dataSource: "fiscal_trends_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: true, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
    project_schedules: {
      id: "project_schedules",
      type: "project_schedules_component",
      title: "Project Schedules",
      iconName: "Calendar",
      dataSource: "project_schedules_data",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: false, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Support — surfaces the support-metrics smart widget alongside the
// standard KPI strip so support managers see ticket health without
// configuring anything on a fresh install.
// ---------------------------------------------------------------------------
export const DEFAULT_SUPPORT_LAYOUT_NAME = "Support - Dashboard Builder";
export const DEFAULT_SUPPORT_PAGE_KEY = "support";
export const DEFAULT_SUPPORT_ROLE = "All";

export const DEFAULT_SUPPORT_LAYOUT_CONFIG = {
  layouts: [
    {
      id: "default_layout",
      name: "Standard Support Dashboard",
      role: "All",
      roles: ["all"],
      isDefault: true,
      sections: [
        {
          id: "section-support-kpis",
          columns: 3,
          widgetIds: ["kpi_main"],
        },
        {
          id: "section-support-detail",
          columns: 1,
          widgetIds: ["support_metrics"],
        },
      ],
    },
  ],
  widgets: {
    kpi_main: {
      id: "kpi_main",
      type: "kpi_strip",
      title: "Key Performance Indicators",
      iconName: "BarChart3",
      dataSource: "kpi_main_data",
      gridColSpan: 3,
      gridRowSpan: 1,
      settings: { colorScheme: ["#1E40AF"] },
    },
    support_metrics: {
      id: "support_metrics",
      type: "support_metrics_component",
      title: "Support Metrics",
      iconName: "Bolt",
      dataSource: "support_analytics",
      gridColSpan: 1,
      gridRowSpan: 2,
      settings: { showLegend: true, colorScheme: ["#1E40AF"] },
      chartConfig: {
        variant: "default",
        tooltip: { indicator: "default", showLabel: true },
      },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// Canonical list of every protected dashboard. The seeder iterates
// this array on every boot — append new entries here, no other
// changes required.
// ---------------------------------------------------------------------------
export interface ProtectedDashboardSeed {
  name: string;
  pageKey: string;
  role: string;
  description: string;
  layoutConfig: Record<string, unknown>;
}

export const PROTECTED_DASHBOARD_SEEDS: readonly ProtectedDashboardSeed[] = [
  {
    name: DEFAULT_OVERVIEW_LAYOUT_NAME,
    pageKey: DEFAULT_OVERVIEW_PAGE_KEY,
    role: DEFAULT_OVERVIEW_ROLE,
    description: "Built-in Overview dashboard seeded on first install (Task #555).",
    layoutConfig: DEFAULT_OVERVIEW_LAYOUT_CONFIG as unknown as Record<string, unknown>,
  },
  {
    name: DEFAULT_ACCOUNT_PORTAL_LAYOUT_NAME,
    pageKey: DEFAULT_ACCOUNT_PORTAL_PAGE_KEY,
    role: DEFAULT_ACCOUNT_PORTAL_ROLE,
    description: "Built-in Account Portal dashboard seeded on first install (Task #562).",
    layoutConfig: DEFAULT_ACCOUNT_PORTAL_LAYOUT_CONFIG as unknown as Record<string, unknown>,
  },
  {
    name: DEFAULT_PROJECTS_LAYOUT_NAME,
    pageKey: DEFAULT_PROJECTS_PAGE_KEY,
    role: DEFAULT_PROJECTS_ROLE,
    description: "Built-in Projects Workspace dashboard seeded on first install (Task #562).",
    layoutConfig: DEFAULT_PROJECTS_LAYOUT_CONFIG as unknown as Record<string, unknown>,
  },
  {
    name: DEFAULT_SUPPORT_LAYOUT_NAME,
    pageKey: DEFAULT_SUPPORT_PAGE_KEY,
    role: DEFAULT_SUPPORT_ROLE,
    description: "Built-in Support dashboard seeded on first install (Task #562).",
    layoutConfig: DEFAULT_SUPPORT_LAYOUT_CONFIG as unknown as Record<string, unknown>,
  },
];
