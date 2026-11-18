import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle } from "lucide-react";
import { formatDateForDisplay } from "@/lib/date-utils";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { impactiqErrorKey } from "@/components/integrations/ImpactiqConnectionForm";
import { PROJECT_ACTIVITY_COUNTS_KEY } from "@/components/integrations/ImpactiqActivityCountsSettings";
import { ImpactiqActivitiesDrawer } from "./impactiq-activities-drawer";
import type { ImpactiqProjectActivityCount, ProjectActivityCountsResponse } from "@shared/impactiq";

export interface ImpactiqActivityColumn {
  /** Draw the column at all: ImpactIQ is connected and an admin chose activity types. */
  visible: boolean;
  /** Set when ImpactIQ couldn't be read; every cell then shows the warning. */
  errorCode: string | null;
  counts: Map<number, ImpactiqProjectActivityCount>;
}

/**
 * ImpactIQ activity counts for the projects this viewer sees on Manage
 * Projects. Staff only; the server picks the projects, so nothing is sent.
 */
export function useImpactiqActivityColumn(enabled: boolean): ImpactiqActivityColumn {
  const { data } = useQuery<ProjectActivityCountsResponse>({
    queryKey: PROJECT_ACTIVITY_COUNTS_KEY,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
  return useMemo(() => {
    if (!enabled || !data || data.status === "hidden") return { visible: false, errorCode: null, counts: new Map() };
    if (data.status === "unavailable") return { visible: true, errorCode: data.errorCode, counts: new Map() };
    const counts = new Map<number, ImpactiqProjectActivityCount>();
    for (const [id, count] of Object.entries(data.counts)) counts.set(Number(id), count);
    return { visible: true, errorCode: null, counts };
  }, [enabled, data]);
}

/** Sort value for a project: its count, or -1 while unknown so those rows sort last when descending. */
export function impactiqActivitySortValue(column: ImpactiqActivityColumn, projectId: number): number {
  return column.counts.get(projectId)?.activityCount ?? -1;
}

export function ImpactiqActivityCell({
  column,
  projectId,
  projectLabel,
  timezone,
}: {
  column: ImpactiqActivityColumn;
  projectId: number;
  /** Shown in the drawer under its title. */
  projectLabel: string;
  timezone?: string;
}) {
  const { t } = useTranslation();
  const record = useValidationRecordLabel();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (column.errorCode) {
    const reason = t(impactiqErrorKey(column.errorCode));
    return (
      <span
        className="inline-flex items-center text-amber-600 dark:text-amber-400"
        title={t("projects.impactiqActivities.unavailable", { reason })}
        aria-label={t("projects.impactiqActivities.unavailable", { reason })}
        data-testid={`impactiq-activities-${projectId}`}
      >
        <AlertTriangle className="h-4 w-4" />
      </span>
    );
  }

  const count = column.counts.get(projectId);
  if (!count) return <span className="text-sm text-gray-400 dark:text-gray-500" data-testid={`impactiq-activities-${projectId}`}>—</span>;

  const lines = [
    count.activityCount === 0
      ? t("projects.impactiqActivities.none")
      : t("projects.impactiqActivities.hoursLast", {
          hours: count.totalHours,
          date: count.lastActivityAt ? formatDateForDisplay(count.lastActivityAt, timezone) : "—",
        }),
    ...(count.viaOpportunity > 0 ? [t("projects.impactiqActivities.viaOpportunity", { count: count.viaOpportunity, record })] : []),
  ];
  const title = lines.join("\n");
  const label = (
    <>
      <Activity className="mr-1 h-3.5 w-3.5" />
      <span className="tabular-nums">{count.activityCount}</span>
    </>
  );

  if (count.activityCount > 0) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDrawerOpen(true);
          }}
          title={`${title}\n${t("projects.impactiqActivities.showList")}`}
          aria-label={`${count.activityCount} · ${t("projects.impactiqActivities.showList")}`}
          className="inline-flex items-center rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary dark:text-blue-400"
          data-testid={`impactiq-activities-${projectId}`}
        >
          {label}
        </button>
        {drawerOpen && (
          <ImpactiqActivitiesDrawer
            projectId={projectId}
            projectLabel={projectLabel}
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            timezone={timezone}
          />
        )}
      </>
    );
  }
  return (
    <span
      className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400"
      title={title}
      data-testid={`impactiq-activities-${projectId}`}
    >
      {label}
    </span>
  );
}
