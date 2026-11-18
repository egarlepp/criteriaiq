/**
 * Configuration › Scheduler › Workflow schedules. The email_schedules rows
 * an admin or another page created (digests, metric snapshots, Salesforce
 * sync, cleanup, report delivery, backups...). Moved here from Workflow
 * Automation's former Schedules tab; the "Workflow schedules" job in the
 * system list is what checks them every minute.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast, showSuccessToast, showWarningToast } from "@/lib/toast-helper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import { DangerIconButton } from "@/components/shared/danger-icon-button";
import { CalendarCog, CheckCircle2, CircleSlash, History, Loader2, Pencil, Play, Plus, XCircle } from "lucide-react";
import { formatDateTime } from "./scheduler-utils";
import { WorkflowScheduleEditorDialog } from "./WorkflowScheduleEditorDialog";
import { WorkflowScheduleRunsSheet, scheduleRunsKey } from "./WorkflowScheduleRunsSheet";
import {
  ACTION_TYPE_DEFINITIONS,
  SCHEDULE_SOURCE_CLASS,
  scheduleSource,
  type WorkflowSchedule,
} from "./workflow-schedule-utils";

export const WORKFLOW_SCHEDULES_KEY = ["/api/email-automation/schedules"] as const;

interface TriggerResult {
  success: boolean;
  message?: string;
}

function scheduleDetails(schedule: WorkflowSchedule, t: TFunction): string {
  const config = schedule.actionConfig ?? {};
  switch (schedule.actionType) {
    case "email_digest":
      return schedule.ruleName || t("scheduler.workflow.details.rule", { id: schedule.ruleId ?? "?" });
    case "database_cleanup":
      return t("scheduler.workflow.details.retention", { count: config.retentionDays || 90 });
    case "report_generation":
      return schedule.metadata?.reportName || config.reportName || t("scheduler.workflow.details.report");
    case "webhook_retry":
      return t("scheduler.workflow.details.maxRetries", { count: config.maxRetries || 3 });
    case "project_status_check":
      return t("scheduler.workflow.details.alertAt", { count: config.alertThresholdDays || 5 });
    case "salesforce_sync":
      return schedule.metadata?.entityPair || config.syncDirection || t("scheduler.workflow.details.bidirectional");
    case "docs_sync":
      return config.syncIntervalHours
        ? t("scheduler.workflow.details.syncEvery", { count: config.syncIntervalHours })
        : t("scheduler.workflow.details.syncAuto");
    case "ai_assessment_analysis": {
      const projects = Array.isArray(config.projectIds) ? config.projectIds.length : 0;
      const ruleset = config.rulesetName || t("scheduler.workflow.details.allProjects");
      return projects > 0 ? `${ruleset} (${t("scheduler.workflow.details.projects", { count: projects })})` : ruleset;
    }
    default:
      return t("scheduler.workflow.details.allMetrics");
  }
}

export function WorkflowSchedulesCard({ canEdit }: { canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowSchedule | null>(null);
  const [historyFor, setHistoryFor] = useState<WorkflowSchedule | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkflowSchedule | null>(null);

  const { data, isLoading } = useQuery<WorkflowSchedule[] | { schedules: WorkflowSchedule[] }>({
    queryKey: WORKFLOW_SCHEDULES_KEY,
    queryFn: () => apiRequest("GET", "/api/email-automation/schedules"),
  });
  const [sortConfig, handleSort] = useUrlSortState("workflowSchedules");

  const actionName = (schedule: WorkflowSchedule) => {
    const type = schedule.actionType || "email_digest";
    return t(`scheduler.workflow.actionTypes.${type}`, { defaultValue: ACTION_TYPE_DEFINITIONS[type]?.name ?? type });
  };

  const schedules = useMemo(
    () =>
      sortRows(
        (Array.isArray(data) ? data : data?.schedules ?? []).slice().sort((a, b) => a.id - b.id),
        sortConfig,
        {
          action: (s) => actionName(s),
          details: (s) => scheduleDetails(s, t),
          source: (s) => t(`scheduler.workflow.source.${scheduleSource(s.metadata?.createdFrom)}`),
          schedule: (s) => s.cron || s.rrule || "",
          nextRunAt: (s) => (s.active && s.nextRunAt ? new Date(s.nextRunAt) : null),
          active: (s) => s.active,
        },
      ),
    // actionName and the labels read t(), which changes with the language.
    [data, sortConfig, t],
  );

  const refresh = (schedule?: WorkflowSchedule) => {
    queryClient.invalidateQueries({ queryKey: WORKFLOW_SCHEDULES_KEY });
    if (schedule) queryClient.invalidateQueries({ queryKey: scheduleRunsKey(schedule.id) });
  };

  const runMutation = useMutation({
    mutationFn: (schedule: WorkflowSchedule): Promise<TriggerResult> =>
      apiRequest("POST", `/api/email-automation/schedules/${schedule.id}/trigger`),
    onSuccess: (result, schedule) => {
      const name = actionName(schedule);
      const message = result.message ?? "";
      if (!result.success) {
        showErrorToast(t("scheduler.workflow.toasts.runFailed", { name }), message);
      } else if (message.startsWith("Skipped")) {
        // Held by the Send Email Window (quiet hours or the hourly limit).
        showWarningToast(t("scheduler.workflow.toasts.runHeld", { name }), message);
      } else {
        showSuccessToast(t("scheduler.workflow.toasts.runDone", { name }), message);
      }
      refresh(schedule);
    },
    onError: (error: Error, schedule) =>
      showErrorToast(t("scheduler.workflow.toasts.runFailed", { name: actionName(schedule) }), error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (schedule: WorkflowSchedule) => apiRequest("DELETE", `/api/email-automation/schedules/${schedule.id}`),
    onSuccess: () => {
      showSuccessToast(t("scheduler.workflow.toasts.deleted"));
      refresh();
    },
    onError: (error: Error) => showErrorToast(t("scheduler.workflow.toasts.deleteFailed"), error.message),
  });

  const openEditor = (schedule: WorkflowSchedule | null) => {
    setEditing(schedule);
    setEditorOpen(true);
  };

  const runningId = runMutation.isPending ? runMutation.variables?.id ?? null : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CalendarCog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              {t("scheduler.workflow.title")}
            </CardTitle>
            <CardDescription>{t("scheduler.workflow.description")}</CardDescription>
          </div>
          {canEdit && (
            <Button size="sm" onClick={() => openEditor(null)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("scheduler.workflow.add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("scheduler.loading")}
          </div>
        ) : schedules.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("scheduler.workflow.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-800/50">
                  <SortableTableHead sortKey="action" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colAction")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="details" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colDetails")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="source" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colSource")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="schedule" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colSchedule")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="nextRunAt" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colNextRun")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="active" sortConfig={sortConfig} onSort={handleSort}>
                    {t("scheduler.workflow.colStatus")}
                  </SortableTableHead>
                  <SortableTableHead sortable={false} align="right">{t("scheduler.workflow.colActions")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => {
                  const source = scheduleSource(schedule.metadata?.createdFrom);
                  const running = runningId === schedule.id;
                  return (
                    <TableRow key={schedule.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{actionName(schedule)}</span>
                          <span className="text-xs text-muted-foreground">{schedule.timezone || "UTC"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{scheduleDetails(schedule, t)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${SCHEDULE_SOURCE_CLASS[source]}`}>
                          {t(`scheduler.workflow.source.${source}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {schedule.cron || schedule.rrule || t("scheduler.workflow.noCron")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {schedule.active && schedule.nextRunAt ? formatDateTime(schedule.nextRunAt, i18n.language) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {schedule.active ? (
                            <Badge className="w-fit gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("scheduler.workflow.active")}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="w-fit gap-1">
                              <CircleSlash className="h-3 w-3" />
                              {t("scheduler.workflow.inactive")}
                            </Badge>
                          )}
                          {schedule.lastRunStatus === "success" && (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" />
                              {t("scheduler.workflow.lastRunOk")}
                            </span>
                          )}
                          {schedule.lastRunStatus === "failure" && (
                            <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                              <XCircle className="h-3 w-3" />
                              {t("scheduler.workflow.lastRunFailed")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              title={t("scheduler.workflow.runNow")}
                              aria-label={t("scheduler.workflow.runNow")}
                              disabled={running}
                              onClick={() => runMutation.mutate(schedule)}
                            >
                              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title={t("scheduler.workflow.history.title")}
                            aria-label={t("scheduler.workflow.history.title")}
                            onClick={() => setHistoryFor(schedule)}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                          {canEdit && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                title={t("scheduler.workflow.edit")}
                                aria-label={t("scheduler.workflow.edit")}
                                onClick={() => openEditor(schedule)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <DangerIconButton
                                title={t("scheduler.workflow.delete")}
                                aria-label={t("scheduler.workflow.delete")}
                                onClick={() => setPendingDelete(schedule)}
                              />
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <WorkflowScheduleEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editingSchedule={editing}
        onSaved={() => refresh()}
      />

      <WorkflowScheduleRunsSheet
        schedule={historyFor}
        canRun={canEdit}
        running={historyFor !== null && runningId === historyFor.id}
        onOpenChange={(open) => {
          if (!open) setHistoryFor(null);
        }}
        onRunNow={(schedule) => runMutation.mutate(schedule)}
      />

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("scheduler.workflow.deleteTitle")}
        description={t("scheduler.workflow.deleteBody", { name: pendingDelete ? actionName(pendingDelete) : "" })}
        confirmLabel={t("scheduler.workflow.delete")}
        cancelLabel={t("common.cancel")}
        variant="destructive"
        onConfirm={() => {
          if (pendingDelete) deleteMutation.mutate(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  );
}
