// A small completion ring with the percentage in the middle, for phase cards
// and phase headers. The track uses currentColor so it follows the card text
// in light and dark mode; the arc color follows the item's status.
import { cn } from "@/lib/utils";
import type { MapStatus } from "@/types/map";

/** Arc color per status, light and dark (stroke-* classes). */
export const MAP_STATUS_RING: Record<MapStatus, string> = {
  not_started: "stroke-gray-400 dark:stroke-gray-500",
  in_progress: "stroke-blue-600 dark:stroke-blue-400",
  complete: "stroke-green-600 dark:stroke-green-400",
  blocked: "stroke-red-600 dark:stroke-red-400",
  deferred: "stroke-yellow-500 dark:stroke-yellow-400",
  stalled: "stroke-orange-500 dark:stroke-orange-400",
  at_risk: "stroke-purple-600 dark:stroke-purple-400",
  cancelled: "stroke-gray-500 dark:stroke-gray-400",
};

interface MapProgressRingProps {
  done: number;
  total: number;
  status: MapStatus;
  /** Rendered size in px. */
  size?: number;
  label: string;
  className?: string;
}

export function MapProgressRing({ done, total, status, size = 40, label, className }: MapProgressRingProps) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const percent = Math.round(ratio * 100);
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn("flex-none", className)}
      role="img"
      aria-label={label}
      data-testid="map-progress-ring"
    >
      <circle cx="20" cy="20" r={radius} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={5} />
      {ratio > 0 && (
        <circle
          cx="20"
          cy="20"
          r={radius}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 20 20)"
          className={MAP_STATUS_RING[status]}
        />
      )}
      <text x="20" y="23.5" textAnchor="middle" fontSize={percent === 100 ? 9 : 10} fontWeight={700} fill="currentColor">
        {percent}%
      </text>
    </svg>
  );
}
