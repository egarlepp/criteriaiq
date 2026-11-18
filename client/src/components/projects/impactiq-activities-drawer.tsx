/**
 * ImpactiqActivitiesDrawer — the activities behind a project's count in the
 * Manage Projects Activities column: type, who logged it, hours, start and
 * end. Read from GET /api/projects/:id/impactiq-activities, which applies the
 * same activity types and matching as the count (made-up rows in Demo Mode).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Activity, AlertTriangle, ExternalLink, Loader2, Waypoints } from "lucide-react";
import { DynamicIcon } from "@/components/ui/dynamic-icon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SortableTable,
  SortableTableBody,
  SortableTableCell,
  SortableTableHead,
  SortableTableHeader,
  SortableTableRow,
} from "@/components/ui/sortable-table";
import { sortRows, useSortState } from "@/lib/sorting";
import { useValidationRecordLabel } from "@/hooks/use-validation-record-label";
import { impactiqErrorKey } from "@/components/integrations/ImpactiqConnectionForm";
import type { ImpactiqProjectActivity, ProjectImpactiqActivitiesResponse } from "@shared/impactiq";

export interface ImpactiqActivitiesDrawerProps {
  projectId: number;
  /** Shown under the title, e.g. "Acme · Identity POC". */
  projectLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timezone?: string;
}

const ACCESSORS = {
  type: (a: ImpactiqProjectActivity) => a.type,
  owner: (a: ImpactiqProjectActivity) => a.ownerName,
  hours: (a: ImpactiqProjectActivity) => a.hours,
  start: (a: ImpactiqProjectActivity) => new Date(a.startAt),
  end: (a: ImpactiqProjectActivity) => (a.endAt ? new Date(a.endAt) : null),
};

/** A stored timestamp as a short date and time in the viewer's language and time zone. */
function useFormatDateTime(timezone?: string): (iso: string | null) => string {
  const { i18n } = useTranslation();
  return (iso) => {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "2-digit", hour: "numeric", minute: "2-digit" };
    try {
      return date.toLocaleString(i18n.language || "en-US", { ...options, timeZone: timezone || undefined });
    } catch {
      return date.toLocaleString(i18n.language || "en-US", options);
    }
  };
}

export function ImpactiqActivitiesDrawer({ projectId, projectLabel, open, onOpenChange, timezone }: ImpactiqActivitiesDrawerProps) {
  const { t, i18n } = useTranslation();
  const record = useValidationRecordLabel();
  const formatDateTime = useFormatDateTime(timezone);
  const { sortConfig, handleSort } = useSortState({ key: "start", direction: "desc" });

  const { data, isLoading, isError } = useQuery<ProjectImpactiqActivitiesResponse>({
    queryKey: [`/api/projects/${projectId}/impactiq-activities`],
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });

  const rows = useMemo(
    () => (data?.status === "ok" ? sortRows(data.activities, sortConfig, ACCESSORS) : []),
    [data, sortConfig],
  );
  const hoursFormat = useMemo(() => new Intl.NumberFormat(i18n.language || "en-US", { maximumFractionDigits: 2 }), [i18n.language]);

  const head = (key: keyof typeof ACCESSORS, label: string, align: "left" | "right" = "left") => (
    <SortableTableHead sortKey={key} sortConfig={sortConfig} onSort={handleSort} align={align}>
      {label}
    </SortableTableHead>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("projects.impactiqActivities.drawer.loading")}
      </div>
    );
  } else if (isError || !data || data.status === "hidden") {
    body = <p className="py-8 text-sm text-gray-500 dark:text-gray-400">{t("projects.impactiqActivities.drawer.notAvailable")}</p>;
  } else if (data.status === "unavailable") {
    body = (
      <p className="flex items-center gap-2 py-8 text-sm text-amber-700 dark:text-amber-400" role="alert">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {t("projects.impactiqActivities.drawer.unavailable", { reason: t(impactiqErrorKey(data.errorCode)) })}
      </p>
    );
  } else if (data.activities.length === 0) {
    body = <p className="py-8 text-sm text-gray-500 dark:text-gray-400">{t("projects.impactiqActivities.none")}</p>;
  } else {
    body = (
      <>
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300" data-testid="impactiq-activities-summary">
          {t("projects.impactiqActivities.drawer.summary", { count: data.activityCount, hours: hoursFormat.format(data.totalHours) })}
        </p>
        {data.truncated && (
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
            {t("projects.impactiqActivities.drawer.truncated", { shown: data.activities.length })}
          </p>
        )}
        <div className="overflow-x-auto">
          <SortableTable className="text-sm">
            <SortableTableHeader>
              <SortableTableRow>
                {head("type", t("projects.impactiqActivities.drawer.col.type"))}
                {head("owner", t("projects.impactiqActivities.drawer.col.owner"))}
                {head("hours", t("projects.impactiqActivities.drawer.col.hours"), "right")}
                {head("start", t("projects.impactiqActivities.drawer.col.start"))}
                {head("end", t("projects.impactiqActivities.drawer.col.end"))}
              </SortableTableRow>
            </SortableTableHeader>
            <SortableTableBody>
              {rows.map((a) => (
                <SortableTableRow key={a.id} data-testid="impactiq-activity-row">
                  <SortableTableCell className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-gray-900 dark:text-gray-100">
                      {/* ImpactIQ's own icon and color for the type; plain gray when it has none. */}
                      <DynamicIcon
                        name={a.typeIcon ?? "Activity"}
                        fallback={Activity}
                        className={a.typeColor ? "h-4 w-4 shrink-0" : "h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500"}
                        style={a.typeColor ? { color: a.typeColor } : undefined}
                        aria-hidden
                      />
                      {a.type}
                      {a.viaOpportunity && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Waypoints
                              className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500"
                              aria-label={t("projects.impactiqActivities.drawer.viaOpportunity", { record })}
                            />
                          </TooltipTrigger>
                          <TooltipContent>{t("projects.impactiqActivities.drawer.viaOpportunity", { record })}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </SortableTableCell>
                  <SortableTableCell className="px-3 py-2 text-gray-700 dark:text-gray-300">{a.ownerName}</SortableTableCell>
                  <SortableTableCell className="px-3 py-2 text-right tabular-nums text-gray-900 dark:text-gray-100">
                    {hoursFormat.format(a.hours)}
                  </SortableTableCell>
                  <SortableTableCell className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">{formatDateTime(a.startAt)}</SortableTableCell>
                  <SortableTableCell className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">{formatDateTime(a.endAt)}</SortableTableCell>
                </SortableTableRow>
              ))}
            </SortableTableBody>
          </SortableTable>
        </div>
      </>
    );
  }

  const activitiesUrl = data?.status === "ok" ? data.activitiesUrl : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl" data-testid="impactiq-activities-drawer">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("projects.impactiqActivities.drawer.title")}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center justify-between gap-2">
            <span className="truncate">{projectLabel}</span>
            {activitiesUrl && (
              <a
                href={activitiesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("projects.impactiqActivities.open")}
              </a>
            )}
          </SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}
