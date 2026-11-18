/**
 * The app's KPI card: a tinted card with a faint watermark icon, a small
 * icon + title, a big value and a one-line caption. Used by the
 * Assumptions, Dependencies, Competitor Intelligence and Scheduler pages.
 * Add a color here rather than forking the card inline.
 */
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const METRIC_COLOR_CONFIG = {
  blue: {
    card:      "bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
    watermark: "text-blue-600 dark:text-blue-400",
    icon:      "text-blue-900 dark:text-blue-300",
    value:     "text-blue-600 dark:text-blue-400",
  },
  green: {
    card:      "bg-green-50/80 dark:bg-green-950/40 border-green-200 dark:border-green-800",
    watermark: "text-green-600 dark:text-green-400",
    icon:      "text-green-900 dark:text-green-300",
    value:     "text-green-600 dark:text-green-400",
  },
  rose: {
    card:      "bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
    watermark: "text-rose-600 dark:text-rose-400",
    icon:      "text-rose-900 dark:text-rose-300",
    value:     "text-rose-600 dark:text-rose-400",
  },
  amber: {
    card:      "bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
    watermark: "text-amber-600 dark:text-amber-400",
    icon:      "text-amber-900 dark:text-amber-300",
    value:     "text-amber-600 dark:text-amber-400",
  },
  purple: {
    card:      "bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800",
    watermark: "text-purple-600 dark:text-purple-400",
    icon:      "text-purple-900 dark:text-purple-300",
    value:     "text-purple-600 dark:text-purple-400",
  },
  teal: {
    card:      "bg-teal-50/80 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800",
    watermark: "text-teal-600 dark:text-teal-400",
    icon:      "text-teal-900 dark:text-teal-300",
    value:     "text-teal-600 dark:text-teal-400",
  },
  orange: {
    card:      "bg-orange-50/80 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800",
    watermark: "text-orange-600 dark:text-orange-400",
    icon:      "text-orange-900 dark:text-orange-300",
    value:     "text-orange-600 dark:text-orange-400",
  },
} as const;

export type MetricColor = keyof typeof METRIC_COLOR_CONFIG;

export function MetricCard({
  title,
  value,
  sub,
  icon,
  loading,
  color = "blue",
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  loading?: boolean;
  color?: MetricColor;
}) {
  const cfg = METRIC_COLOR_CONFIG[color];
  return (
    <Card className={cn("relative overflow-hidden border rounded-2xl shadow-sm", cfg.card)}>
      <div className={cn("absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-10 [&_svg]:h-24 [&_svg]:w-24", cfg.watermark)}>
        {icon}
      </div>
      <CardContent className="relative p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("w-4 h-4 shrink-0", cfg.icon)}>{icon}</div>
          <h3 className="tracking-tight text-[15px] font-bold text-gray-900 dark:text-gray-100 leading-tight">{title}</h3>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-16 mb-1" />
        ) : (
          <div className={cn("text-2xl font-bold", cfg.value)}>{value}</div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}
