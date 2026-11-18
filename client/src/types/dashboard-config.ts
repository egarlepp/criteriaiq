import { LucideIcon } from "lucide-react";

export type WidgetType = 
  | 'kpi_strip' 
  | 'bar' 
  | 'line' 
  | 'area' 
  | 'pie' 
  | 'donut' 
  | 'radar' 
  | 'radial' 
  | 'custom'
  | 'project_metrics_component' // ADDED: Specific type for the donuts component
  | 'support_metrics_component'; // ADDED: Specific type for support

export interface ChartTooltipConfig {
  indicator?: 'default' | 'line' | 'dashed' | 'none';
  showLabel?: boolean;
}

export interface WidgetConfig {
  id: string;
  title: string;
  type: WidgetType | string;
  dataSource?: string; // key mapping to API response
  iconName?: string;

  // Layout Props
  gridColSpan?: number; // How many columns this widget takes up (relative to parent section)
  gridRowSpan?: number; // Height in units (standard = 1, tall = 2)

  // Chart Specifics
  settings?: {
    showLegend?: boolean;
    showAxis?: boolean;
    showTooltip?: boolean;
    colorScheme?: string[];
    // Title customization
    titleFontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
    titleFontWeight?: 'thin' | 'extralight' | 'light' | 'normal' | 'medium' | 'semibold' | 'bold' | 'extrabold' | 'black';
    titleColor?: string; // Hex color or Tailwind color class
  };

  chartConfig?: {
    variant?: string; // stacked, percent, gradient, etc.
    tooltip?: ChartTooltipConfig;
    dataKeys?: string[];
  };
}

// NEW: Section Definition
export interface LayoutSection {
  id: string;
  title?: string;
  columns: 1 | 2 | 3 | 4 | 6; // Number of columns in this row
  widgetIds: string[]; // Widgets belonging to this row
}

export interface LayoutConfig {
  id: string;
  name: string;
  role: string; // Deprecated - kept for backward compatibility
  roles?: string[]; // New: Array of role IDs that can access this layout
  targetPage?: string; // Page key this layout is assigned to, or "standalone" if not tied to a page
  isDefault?: boolean; // Whether this is the default layout for the role
  widgetIds?: string[]; // Legacy: flat list of widgets (backward compatibility)
  // UPDATED: Layouts now have sections, not just a flat list of widgets
  sections?: LayoutSection[]; 
}

export interface DashboardSystemConfig {
  layouts: LayoutConfig[];
  widgets: Record<string, WidgetConfig>; // Normalized store of all widgets
}