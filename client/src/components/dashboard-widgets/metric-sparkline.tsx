import * as React from "react";
import { useMetricHistory, MetricHistoryPoint } from "@/hooks/use-metric-history";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MetricSparklineProps {
  metricKey: string;
  data?: MetricHistoryPoint[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
  showPoints?: boolean;
  unit?: "count" | "currency" | "percentage" | "days" | "hours";
  className?: string;
}

const formatValue = (value: number, unit?: string): string => {
  switch (unit) {
    case "currency":
      if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
      if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
      return `$${value.toFixed(0)}`;
    case "percentage":
      return `${value}%`;
    case "days":
      return `${value}d`;
    case "hours":
      return `${value}h`;
    default:
      return value.toLocaleString();
  }
};

export function MetricSparkline({
  metricKey,
  data: providedData,
  width = 80,
  height = 24,
  color,
  strokeWidth = 2,
  showPoints = true,
  unit = "count",
  className = "",
}: MetricSparklineProps) {
  const { data: fetchedData, isLoading } = useMetricHistory(metricKey, 6);
  
  const sparkData = providedData || fetchedData || [];

  if (isLoading && !providedData) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (sparkData.length === 0) {
    return (
      <div className={`flex items-center justify-center ${className}`} style={{ width, height }}>
        <div className="text-[10px] text-muted-foreground">No data</div>
      </div>
    );
  }

  const values = sparkData.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const trend = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const trendColor = color || (trend > 0 ? "#10B981" : trend < 0 ? "#EF4444" : "#6B7280");

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return { x, y, value, date: sparkData[index].date };
  });

  const pathData = `M ${points.map(p => `${p.x},${p.y}`).join(" L ")}`;

  return (
    <div className={`relative ${className}`}>
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id={`gradient-${metricKey}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={trendColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={trendColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>

        <path
          d={`${pathData} L ${width},${height} L 0,${height} Z`}
          fill={`url(#gradient-${metricKey})`}
        />

        <path
          d={pathData}
          fill="none"
          stroke={trendColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {showPoints && points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r="2"
              fill={trendColor}
              className="transition-all cursor-pointer"
              style={{
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.setAttribute("r", "4");
                e.currentTarget.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.2))";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.setAttribute("r", "2");
                e.currentTarget.style.filter = "drop-shadow(0 1px 2px rgba(0,0,0,0.1))";
              }}
            />
            <title>{point.date}: {formatValue(point.value, unit)}</title>
          </g>
        ))}
      </svg>
    </div>
  );
}

interface MetricSparklineWithLabelProps extends MetricSparklineProps {
  showTrend?: boolean;
}

export function MetricSparklineWithTrend({
  showTrend = true,
  ...props
}: MetricSparklineWithLabelProps) {
  const { data: fetchedData } = useMetricHistory(props.metricKey, 6);
  const sparkData = props.data || fetchedData || [];

  const values = sparkData.map(d => d.value);
  const trend = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const trendPercent = values[0] !== 0 ? Math.round((trend / values[0]) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <MetricSparkline {...props} data={sparkData} />
      {showTrend && values.length >= 2 && (
        <span
          className={`text-xs font-medium ${
            trend > 0 ? "text-green-600" : trend < 0 ? "text-red-600" : "text-gray-500"
          }`}
        >
          {trend > 0 ? "↗" : trend < 0 ? "↘" : "→"}
          {Math.abs(trendPercent)}%
        </span>
      )}
    </div>
  );
}

export function MetricSparklineCard({
  metricKey,
  title,
  unit = "count",
  onClick,
}: {
  metricKey: string;
  title: string;
  unit?: "count" | "currency" | "percentage" | "days" | "hours";
  onClick?: () => void;
}) {
  const { data: history } = useMetricHistory(metricKey, 6);
  const currentValue = history && history.length > 0 ? history[history.length - 1].value : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="p-3 bg-slate-50 dark:bg-gray-800 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
          onClick={onClick}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">{title}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold dark:text-slate-100">
              {formatValue(currentValue, unit)}
            </span>
            <MetricSparkline metricKey={metricKey} width={60} height={20} unit={unit} />
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <p className="font-semibold mb-1">{title}</p>
        <p className="text-xs">6-week trend showing weekly snapshots</p>
        {history && history.length > 0 && (
          <div className="text-xs mt-1 text-muted-foreground">
            {history.map((h, i) => (
              <span key={i}>
                {h.date}: {formatValue(h.value, unit)}
                {i < history.length - 1 ? " → " : ""}
              </span>
            ))}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
