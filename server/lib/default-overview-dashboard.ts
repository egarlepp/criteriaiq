/**
 * Server-side payload for the built-in "Analytics - Dashboard Builder"
 * Overview dashboard that `seedProtectedDashboardLayouts` writes into
 * `dashboard_layouts` on first install (Task #555).
 *
 * The shape mirrors the client-side `DashboardSystemConfig` consumed
 * by `client/src/components/dashboard/dashboard-renderer.tsx`. We
 * keep an independent copy here (rather than importing from
 * `client/src/config/dashboard-data.ts`) for two reasons:
 *
 *   1. The client fallback uses the legacy flat `widgetIds` shape on
 *      each layout, which the renderer no longer honors — it expects
 *      `sections`. Mirroring the client exactly would seed an empty
 *      Overview page. The shape below uses `sections` so the seeded
 *      row drives a real, populated Overview dashboard out of the box.
 *
 *   2. Server modules must never import from `client/`. Keeping the
 *      seed payload here avoids dragging the client tree into the
 *      Node bundle and keeps the seed deterministic on a fresh
 *      install with no client build artifacts present.
 *
 * Widget IDs deliberately use stable, human-readable slugs (no
 * `widget-<timestamp>` ids) so the seeded layout is reproducible
 * across environments and easy to identify in support tickets.
 */
export const DEFAULT_OVERVIEW_LAYOUT_NAME = "Analytics - Dashboard Builder";
export const DEFAULT_OVERVIEW_PAGE_KEY = "overview";
export const DEFAULT_OVERVIEW_ROLE = "All";

export const DEFAULT_OVERVIEW_LAYOUT_CONFIG = {
  layouts: [
    {
      id: "default_layout",
      name: "Standard Dashboard",
      role: "All",
      roles: ["all"],
      isDefault: true,
      sections: [
        {
          id: "section-default",
          columns: 3,
          widgetIds: [
            "kpi_main",
            "kpi_map",
            "project_metrics",
            "fiscal_trends",
            "support_metrics",
          ],
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
    kpi_map: {
      id: "kpi_map",
      type: "kpi_strip",
      title: "MAP Progress Indicators",
      iconName: "Waypoints",
      dataSource: "kpi_map_data",
      gridColSpan: 3,
      gridRowSpan: 1,
      settings: { colorScheme: ["#1E40AF"] },
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
    support_metrics: {
      id: "support_metrics",
      type: "support_metrics_component",
      title: "Support Metrics",
      iconName: "Bolt",
      dataSource: "support_analytics",
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
