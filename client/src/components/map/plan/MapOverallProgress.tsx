// The whole plan's completion, shown above the MAP drawer's tabs: one
// stacked bar (done, in progress, blocked / at risk / stalled) over every
// work item, with the count, percentage, date span and late count.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectMapData } from "@/types/map";
import { buildPlanTree, formatShortDate, planProgress } from "./map-plan-utils";

export function MapOverallProgress({ mapData }: { mapData: ProjectMapData }) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => new Date(), []);
  const progress = useMemo(() => planProgress(buildPlanTree(mapData), today), [mapData, today]);
  if (progress.total === 0) return null;
  const pct = (n: number) => (n / progress.total) * 100;
  const percent = Math.round(pct(progress.done));
  const date = (value: string | null) => (value ? formatShortDate(value, i18n.language) : "—");

  return (
    <div className="mb-3" data-testid="map-overall-progress">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{t("mapPlan.overall.title")}</span>
        <span className="text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {t("mapPlan.overall.count", { done: progress.done, total: progress.total })}
          </span>
          {" · "}
          {percent}%{" · "}
          {t("mapPlan.stepper.span", { start: date(progress.start), end: date(progress.end) })}
          {progress.late > 0 && (
            <span className="font-semibold text-red-600 dark:text-red-400"> · {t("mapPlan.stepper.late", { count: progress.late })}</span>
          )}
        </span>
      </div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={t("mapPlan.overall.title")}
      >
        <div className="bg-green-500 dark:bg-green-600" style={{ width: `${pct(progress.done)}%` }} />
        <div className="bg-blue-500 dark:bg-blue-600" style={{ width: `${pct(progress.inProgress)}%` }} />
        <div className="bg-red-500 dark:bg-red-600" style={{ width: `${pct(progress.blocked)}%` }} />
      </div>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-green-500 dark:bg-green-600" aria-hidden="true" />
          {t("mapPlan.overall.done")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-blue-500 dark:bg-blue-600" aria-hidden="true" />
          {t("mapPlan.overall.inProgress")}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-red-500 dark:bg-red-600" aria-hidden="true" />
          {t("mapPlan.overall.needsAttention")}
        </span>
      </div>
    </div>
  );
}
