import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart3 } from "lucide-react";

export type RiskLevel = "low" | "medium" | "high" | "critical";

interface ProjectWithRisk {
  id: number;
  riskScore: string | number;
  [key: string]: any;
}

interface RiskDistributionBarProps {
  projects: ProjectWithRisk[];
  activeFilter: RiskLevel | null;
  onFilterChange: (level: RiskLevel | null) => void;
  className?: string;
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; bgColor: string; darkBgColor: string; barColor: string; hoverColor: string; range: string }> = {
  low: {
    label: "Low",
    color: "text-green-700 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
    darkBgColor: "bg-green-50 dark:bg-green-900/20",
    barColor: "bg-green-500 dark:bg-green-500",
    hoverColor: "hover:bg-green-600 dark:hover:bg-green-400",
    range: "0-25%",
  },
  medium: {
    label: "Medium",
    color: "text-yellow-700 dark:text-yellow-400",
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    darkBgColor: "bg-yellow-50 dark:bg-yellow-900/20",
    barColor: "bg-yellow-500 dark:bg-yellow-500",
    hoverColor: "hover:bg-yellow-600 dark:hover:bg-yellow-400",
    range: "26-50%",
  },
  high: {
    label: "High",
    color: "text-orange-700 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    darkBgColor: "bg-orange-50 dark:bg-orange-900/20",
    barColor: "bg-orange-500 dark:bg-orange-500",
    hoverColor: "hover:bg-orange-600 dark:hover:bg-orange-400",
    range: "51-75%",
  },
  critical: {
    label: "Critical",
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    darkBgColor: "bg-red-50 dark:bg-red-900/20",
    barColor: "bg-red-500 dark:bg-red-500",
    hoverColor: "hover:bg-red-600 dark:hover:bg-red-400",
    range: "76-100%",
  },
};

function getRiskLevel(score: number): RiskLevel {
  if (score <= 25) return "low";
  if (score <= 50) return "medium";
  if (score <= 75) return "high";
  return "critical";
}

export function RiskDistributionBar({
  projects,
  activeFilter,
  onFilterChange,
  className = "",
}: RiskDistributionBarProps) {
  const distribution = useMemo(() => {
    const counts: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    projects.forEach((p) => {
      const score = parseFloat(String(p.riskScore));
      if (!isNaN(score)) {
        counts[getRiskLevel(score)]++;
      }
    });
    return counts;
  }, [projects]);

  const total = projects.length;

  const handleClick = (level: RiskLevel) => {
    onFilterChange(activeFilter === level ? null : level);
  };

  if (total === 0) {
    return (
      <Card className={`${className}`}>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Risk Distribution</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">No analyzed projects yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Project Risk Distribution: R-Index</h3>
          </div>
          {activeFilter && (
            <button
              onClick={() => onFilterChange(null)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="w-full h-8 rounded-lg overflow-hidden flex bg-gray-100 dark:bg-gray-800 mb-3 cursor-pointer">
          {(["low", "medium", "high", "critical"] as RiskLevel[]).map((level) => {
            const count = distribution[level];
            if (count === 0) return null;
            const pct = (count / total) * 100;
            const config = RISK_CONFIG[level];
            const isActive = activeFilter === level;
            const isFiltered = activeFilter !== null && activeFilter !== level;

            return (
              <Tooltip key={level}>
                <TooltipTrigger asChild>
                  <div
                    onClick={() => handleClick(level)}
                    className={`${config.barColor} transition-all duration-200 flex items-center justify-center relative ${
                      isActive ? "ring-2 ring-offset-1 ring-blue-500 dark:ring-blue-400 z-10 scale-y-110" : ""
                    } ${isFiltered ? "opacity-30" : "opacity-100"} hover:brightness-110`}
                    style={{ width: `${pct}%`, minWidth: count > 0 ? "24px" : "0" }}
                  >
                    {pct >= 12 && (
                      <span className="text-[10px] font-bold text-white drop-shadow-sm">
                        {count}
                      </span>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs font-medium">
                    {config.label}: {count} project{count !== 1 ? "s" : ""} ({pct.toFixed(0)}%)
                  </p>
                  <p className="text-[10px] text-gray-400">Score range: {config.range}</p>
                  <p className="text-[10px] text-gray-400">Click to {isActive ? "clear" : "filter"}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["low", "medium", "high", "critical"] as RiskLevel[]).map((level) => {
            const count = distribution[level];
            const config = RISK_CONFIG[level];
            const isActive = activeFilter === level;

            return (
              <button
                key={level}
                onClick={() => handleClick(level)}
                className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full transition-all ${
                  isActive
                    ? `${config.bgColor} ${config.color} ring-1 ring-current font-semibold`
                    : `${config.darkBgColor} ${config.color} hover:${config.bgColor}`
                }`}
              >
                <span className="font-semibold">{count}</span>
                <span>{config.label}</span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
