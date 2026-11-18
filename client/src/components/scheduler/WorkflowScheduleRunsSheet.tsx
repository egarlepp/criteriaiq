/**
 * Configuration › Scheduler › Workflow schedules › Run history. One
 * schedule's automation_run_logs rows, newest first, with Run now.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertCircle, CheckCircle2, ChevronDown, Clock, Hand, History, Loader2, Play, XCircle } from "lucide-react";
import { formatDateTime, formatDuration } from "./scheduler-utils";
import { ACTION_TYPE_DEFINITIONS, type WorkflowSchedule } from "./workflow-schedule-utils";

export interface WorkflowScheduleRun {
  id: number;
  scheduleId: number;
  actionType: string;
  status: "success" | "failure" | "skipped";
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  message: string | null;
  rawOutput: unknown;
}

interface RunsResponse {
  runs: WorkflowScheduleRun[];
  total: number;
}

interface WorkflowScheduleRunsSheetProps {
  schedule: WorkflowSchedule | null;
  canRun: boolean;
  running: boolean;
  onOpenChange: (open: boolean) => void;
  onRunNow: (schedule: WorkflowSchedule) => void;
}

export const scheduleRunsKey = (id: number | undefined) => ["/api/email-automation/schedules", id, "runs"] as const;

const STATUS_STYLE = {
  success: { Icon: CheckCircle2, className: "text-emerald-600 dark:text-emerald-400" },
  skipped: { Icon: AlertCircle, className: "text-amber-600 dark:text-amber-400" },
  failure: { Icon: XCircle, className: "text-red-600 dark:text-red-400" },
} as const;

export function WorkflowScheduleRunsSheet({ schedule, canRun, running, onOpenChange, onRunNow }: WorkflowScheduleRunsSheetProps) {
  const { t, i18n } = useTranslation();
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<RunsResponse>({
    queryKey: scheduleRunsKey(schedule?.id),
    queryFn: () => apiRequest("GET", `/api/email-automation/schedules/${schedule?.id}/runs`),
    enabled: schedule !== null,
  });

  const actionName = schedule?.actionType
    ? t(`scheduler.workflow.actionTypes.${schedule.actionType}`, {
        defaultValue: ACTION_TYPE_DEFINITIONS[schedule.actionType]?.name ?? schedule.actionType,
      })
    : "";
  const runs = data?.runs ?? [];

  return (
    <Sheet
      open={schedule !== null}
      onOpenChange={(open) => {
        if (!open) setExpandedRunId(null);
        onOpenChange(open);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            {t("scheduler.workflow.history.title")}
          </SheetTitle>
          <SheetDescription>
            <span className="font-medium text-foreground">{actionName}</span>
            {schedule ? ` · ${schedule.cron || schedule.rrule || t("scheduler.workflow.noCron")}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {data ? t("scheduler.workflow.history.total", { count: data.total }) : ""}
          </span>
          {canRun && schedule && (
            <Button variant="outline" size="sm" onClick={() => onRunNow(schedule)} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              {t("scheduler.workflow.runNow")}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("scheduler.loading")}
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Clock className="mb-3 h-10 w-10 opacity-30" />
            <p className="text-sm font-medium">{t("scheduler.workflow.history.empty")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const expanded = expandedRunId === run.id;
              const style = STATUS_STYLE[run.status] ?? STATUS_STYLE.failure;
              const StatusIcon = style.Icon;
              return (
                <div key={run.id} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    onClick={() => setExpandedRunId(expanded ? null : run.id)}
                    aria-expanded={expanded}
                  >
                    <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${style.className}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-xs font-semibold ${style.className}`}>
                          {t(`scheduler.workflow.history.status.${run.status}`, { defaultValue: run.status })}
                        </span>
                        {run.triggeredBy === "manual" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                            <Hand className="h-3 w-3" />
                            {t("scheduler.runs.source.manual")}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatDateTime(run.startedAt, i18n.language)}</span>
                        {run.durationMs != null && (
                          <span className="text-xs text-muted-foreground">· {formatDuration(run.durationMs, t)}</span>
                        )}
                      </div>
                      {run.message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{run.message}</p>}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/30">
                      {run.message && <p className="mb-2 text-xs font-medium text-foreground">{run.message}</p>}
                      {run.rawOutput != null && (
                        <>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {t("scheduler.workflow.history.rawOutput")}
                          </p>
                          <pre className="max-h-60 overflow-x-auto whitespace-pre-wrap break-all rounded border border-gray-200 bg-white p-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-900">
                            {JSON.stringify(run.rawOutput, null, 2)}
                          </pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
