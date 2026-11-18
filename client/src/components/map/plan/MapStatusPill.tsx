import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle,
  CircleArrowUp,
  Clock,
  OctagonPause,
  Siren,
  Target,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { MAP_STATUS_CONFIG, type MapStatus } from "@/types/map";
import { MAP_ITEM_STATUSES } from "@shared/map-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { dueVariance, formatShortDate, normalizeStatus } from "./map-plan-utils";

/** The icon each status uses across the app (same set as the project page's MAP legend). */
export const MAP_STATUS_ICON: Record<MapStatus, LucideIcon> = {
  not_started: Clock,
  in_progress: Target,
  blocked: AlertTriangle,
  complete: CheckCircle,
  deferred: CircleArrowUp,
  stalled: OctagonPause,
  at_risk: Siren,
  cancelled: XCircle,
};

/** Pill colors per status, light and dark. Hues follow MAP_STATUS_CONFIG. */
export const MAP_STATUS_PILL: Record<MapStatus, string> = {
  not_started: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  complete: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  blocked: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
  deferred: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  stalled: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  at_risk: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200",
  cancelled: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
};

/** Progress bar fill per status. */
export const MAP_STATUS_BAR_FILL: Record<MapStatus, string> = {
  not_started: "bg-gray-400 dark:bg-gray-500",
  in_progress: "bg-blue-600 dark:bg-blue-500",
  complete: "bg-green-600 dark:bg-green-500",
  blocked: "bg-red-600 dark:bg-red-500",
  deferred: "bg-yellow-500 dark:bg-yellow-400",
  stalled: "bg-orange-500 dark:bg-orange-400",
  at_risk: "bg-purple-600 dark:bg-purple-500",
  cancelled: "bg-gray-500 dark:bg-gray-400",
};

/** Stepper card colors per status. */
export const MAP_STATUS_CARD: Record<MapStatus, string> = {
  not_started: "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
  in_progress: "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-200",
  complete: "border-transparent bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200",
  blocked: "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950/40 dark:text-red-200",
  deferred: "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200",
  stalled: "border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200",
  at_risk: "border-purple-200 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-200",
  cancelled: "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400",
};

export function useStatusLabel() {
  const { t } = useTranslation();
  return (status: string | null | undefined) => t(`mapPlan.status.${normalizeStatus(status)}`);
}

interface MapStatusPillProps {
  status: string | null | undefined;
  /** Shown on hover when the item is finished: the date it was completed. */
  completedDate?: string | null;
  className?: string;
}

export function MapStatusPill({ status, completedDate, className }: MapStatusPillProps) {
  const { t, i18n } = useTranslation();
  const label = useStatusLabel();
  const value = normalizeStatus(status);
  const Icon = MAP_STATUS_ICON[value];
  const pill = (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        MAP_STATUS_PILL[value],
        className,
      )}
      data-testid={`map-status-${value}`}
    >
      <Icon className="h-3 w-3 flex-none" aria-hidden="true" />
      {label(value)}
    </span>
  );
  if (value !== "complete" || !completedDate) return pill;
  const completedLabel = t("mapPlan.detail.completedOn", { date: formatShortDate(completedDate, i18n.language) });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={`${label(value)}, ${completedLabel}`} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          {pill}
        </span>
      </TooltipTrigger>
      <TooltipContent data-testid="map-status-completed-on">{completedLabel}</TooltipContent>
    </Tooltip>
  );
}

type DueItem = { dueDate: string | null; status: string | null | undefined; completedDate?: string | null };

/**
 * How many days early (+, green) or late (-, red) an item finished, or how far
 * past due it is while still open, in brackets. Nothing when on target.
 */
export function MapDueVariance({ item, today }: { item: DueItem; today: Date }) {
  const { t } = useTranslation();
  const variance = dueVariance(item, today);
  if (variance === null) return null;
  return (
    <span
      className={cn("ml-1 font-semibold", variance > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}
      title={variance > 0 ? t("mapPlan.due.early", { count: variance }) : t("mapPlan.due.late", { count: -variance })}
      data-testid="map-due-variance"
    >
      ({variance > 0 ? `+${variance}` : `${variance}`})
    </span>
  );
}

/** A due date followed by its early/late days. */
export function MapDueDate({ item, today, className }: { item: DueItem; today: Date; className?: string }) {
  const { i18n } = useTranslation();
  if (!item.dueDate) return <span className={cn("text-gray-400 dark:text-gray-500", className)}>—</span>;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)} data-testid="map-due-date">
      {formatShortDate(item.dueDate, i18n.language)}
      <MapDueVariance item={item} today={today} />
    </span>
  );
}

interface MapStatusSelectProps {
  id: string;
  value: string | null | undefined;
  onChange: (status: MapStatus) => void;
  disabled?: boolean;
}

export function MapStatusSelect({ id, value, onChange, disabled }: MapStatusSelectProps) {
  const label = useStatusLabel();
  return (
    <Select value={normalizeStatus(value)} onValueChange={(v) => onChange(v as MapStatus)} disabled={disabled}>
      <SelectTrigger id={id} className="h-8 w-[170px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MAP_ITEM_STATUSES.map((status) => {
          const Icon = MAP_STATUS_ICON[status];
          return (
            <SelectItem key={status} value={status}>
              <span className="flex items-center gap-2">
                <Icon className={cn("h-3.5 w-3.5", MAP_STATUS_CONFIG[status].textColor, "dark:brightness-125")} aria-hidden="true" />
                {label(status)}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
