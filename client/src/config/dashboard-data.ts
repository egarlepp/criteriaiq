// src/config/dashboard-data.ts
import { DashboardSystemConfig } from "@/types/dashboard-config";

export const defaultDashboardConfig: DashboardSystemConfig = {
  // 1. DEFINE ALL AVAILABLE WIDGETS
  widgets: {
    // --- KPI Strips ---
    'kpi_main': {
      id: 'kpi_main',
      title: 'Key Performance Indicators',
      type: 'kpi_strip',
      dataSource: 'kpi_main_data',
      iconName: 'BarChart3',
      gridColSpan: 3 // Full width
    },
    'kpi_map': {
      id: 'kpi_map',
      title: 'MAP Progress Indicators',
      type: 'kpi_strip',
      dataSource: 'kpi_map_data',
      iconName: 'Waypoints',
      gridColSpan: 3 // Full width
    },

    // --- Main Charts (Currently "Custom" until we fully refactor them) ---
    'project_metrics': {
      id: 'project_metrics',
      title: 'Project Metrics',
      type: 'custom', 
      dataSource: 'project_metrics_data',
      iconName: 'ChartArea',
      gridColSpan: 1
    },
    'fiscal_trends': {
      id: 'fiscal_trends',
      title: 'Fiscal Quarter Trends',
      type: 'custom',
      dataSource: 'fiscal_trends_data',
      iconName: 'TrendingUp',
      gridColSpan: 1
    },
    'support_metrics': {
      id: 'support_metrics',
      title: 'Support Metrics',
      type: 'custom', 
      dataSource: 'support_analytics',
      iconName: 'Bolt',
      gridColSpan: 1
    }
  },

  // 2. DEFINE LAYOUTS
  layouts: [
    {
      id: 'default_layout',
      name: 'Standard Dashboard',
      role: 'All',
      isDefault: true,
      widgetIds: [
        'kpi_main',
        'kpi_map',
        'project_metrics', 
        'fiscal_trends', 
        'support_metrics'
      ]
    },
    {
      id: 'engineer_layout',
      name: 'Engineer Focus',
      role: 'Engineer',
      isDefault: true,
      widgetIds: [
        'kpi_main', // Engineers might not need MAP strip
        'project_metrics',
        'support_metrics' // Engineers care about support tickets
      ]
    }
  ]
};