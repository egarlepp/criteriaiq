import { useTheme } from "@/hooks/use-theme";

export interface ChartColorPair {
  light: string;
  dark: string;
}

export interface ChartTheme {
  primary: ChartColorPair;
  secondary: ChartColorPair;
  success: ChartColorPair;
  warning: ChartColorPair;
  danger: ChartColorPair;
  info: ChartColorPair;
  purple: ChartColorPair;
  pink: ChartColorPair;
  teal: ChartColorPair;
  orange: ChartColorPair;
  gray: ChartColorPair;
  slate: ChartColorPair;
}

const chartColors: ChartTheme = {
  primary: { light: "#2563eb", dark: "#60a5fa" },
  secondary: { light: "#64748b", dark: "#94a3b8" },
  success: { light: "#16a34a", dark: "#4ade80" },
  warning: { light: "#d97706", dark: "#fbbf24" },
  danger: { light: "#dc2626", dark: "#f87171" },
  info: { light: "#0891b2", dark: "#22d3ee" },
  purple: { light: "#9333ea", dark: "#a855f7" },
  pink: { light: "#db2777", dark: "#f472b6" },
  teal: { light: "#0d9488", dark: "#2dd4bf" },
  orange: { light: "#ea580c", dark: "#fb923c" },
  gray: { light: "#6b7280", dark: "#9ca3af" },
  slate: { light: "#475569", dark: "#94a3b8" },
};

const defaultPaletteOrder: (keyof ChartTheme)[] = [
  "primary",
  "success",
  "danger",
  "warning",
  "purple",
  "info",
  "pink",
  "teal",
  "orange",
  "secondary",
  "gray",
  "slate",
];

export function useChartTheme() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const getColor = (colorKey: keyof ChartTheme): string => {
    return isDark ? chartColors[colorKey].dark : chartColors[colorKey].light;
  };

  const getPalette = (count: number = 5, startWith?: keyof ChartTheme): string[] => {
    const orderedKeys = startWith
      ? [startWith, ...defaultPaletteOrder.filter((k) => k !== startWith)]
      : defaultPaletteOrder;

    return orderedKeys.slice(0, count).map((key) => getColor(key));
  };

  const getCustomPalette = (colorKeys: (keyof ChartTheme)[]): string[] => {
    return colorKeys.map((key) => getColor(key));
  };

  const getColorFromHex = (lightHex: string, darkHex?: string): string => {
    return isDark ? (darkHex || lightHex) : lightHex;
  };

  const tooltipStyles = {
    backgroundColor: isDark ? "#1e293b" : "#ffffff",
    borderColor: isDark ? "#334155" : "#e2e8f0",
    textColor: isDark ? "#f1f5f9" : "#1e293b",
  };

  const axisStyles = {
    tickColor: isDark ? "#94a3b8" : "#64748b",
    gridColor: isDark ? "#334155" : "#e2e8f0",
  };

  const legendStyles = {
    textColor: isDark ? "#cbd5e1" : "#475569",
  };

  return {
    isDark,
    colors: chartColors,
    getColor,
    getPalette,
    getCustomPalette,
    getColorFromHex,
    tooltipStyles,
    axisStyles,
    legendStyles,
    defaultPalette: getPalette(12),
  };
}

export const CHART_COLOR_KEYS = Object.keys(chartColors) as (keyof ChartTheme)[];

export default useChartTheme;
