/**
 * Configuration › Scheduler › Scheduled jobs table. Jobs are grouped by
 * what they do (shared/job-categories.ts), each group a collapsible header
 * row showing its active/inactive split and turning red when one of its
 * jobs last failed, the way ImpactIQ's Admin › Scheduling does. Groups
 * start collapsed and open when a filter is set.
 *
 * One row per job: what it does, when it runs (every N, daily at a clock
 * time, a schedule set on another page, or each time an event happens),
 * its last result, when it runs next, an on/off switch, an "Email admins on error" switch, and Run now /
 * Change run time / Reset / View history actions. Editing controls are
 * disabled for read-only viewers, and for CRM jobs waiting for a CRM.
 */
import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveTableActionsMenu } from "@/components/ui/table-actions-menu";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleSlash,
  Clock,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Play,
  PlugZap,
  Power,
  PowerOff,
  RotateCcw,
  XCircle,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sortRows, useUrlSortState } from "@/lib/sorting";
import type { JobGroup } from "@shared/job-categories";
import {
  cadenceOptions,
  formatCadence,
  formatClockTime,
  formatDateTime,
  formatRelative,
  groupJobs,
  isDefaultSchedule,
  jobHealth,
  type JobHealth,
  type SchedulerJob,
} from "./scheduler-utils";

interface SchedulerJobsTableProps {
  jobs: SchedulerJob[];
  canEdit: boolean;
  serverTimezone: string;
  pendingRunKey: string | null;
  pendingConfigKey: string | null;
  /** Open every group (a search or filter is set). */
  forceExpanded: boolean;
  onToggle: (job: SchedulerJob, enabled: boolean) => void;
  onNotifyOnError: (job: SchedulerJob, notifyOnError: boolean) => void;
  onCadence: (job: SchedulerJob, intervalMs: number | null) => void;
  /** Daily jobs: open the run-time dialog. */
  onEditRunTime: (job: SchedulerJob) => void;
  /** Back to the job's default cadence or run time. */
  onResetSchedule: (job: SchedulerJob) => void;
  onRunNow: (job: SchedulerJob) => void;
  onShowHistory: (job: SchedulerJob) => void;
}

const HEALTH_STYLES: Record<JobHealth, { className: string; Icon: typeof CheckCircle2 }> = {
  ok: {
    className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  error: {
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
    Icon: XCircle,
  },
  disabled: {
    className: "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
    Icon: CircleSlash,
  },
  never: {
    className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    Icon: Clock,
  },
  waiting: {
    className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    Icon: PlugZap,
  },
};

const COLUMN_COUNT = 7;

export function SchedulerJobsTable({
  jobs,
  canEdit,
  serverTimezone,
  pendingRunKey,
  pendingConfigKey,
  forceExpanded,
  onToggle,
  onNotifyOnError,
  onCadence,
  onEditRunTime,
  onResetSchedule,
  onRunNow,
  onShowHistory,
}: SchedulerJobsTableProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [expanded, setExpanded] = useState<Set<JobGroup>>(() => new Set());

  const [sortConfig, handleSort] = useUrlSortState("schedulerJobs");
  const nameOf = (key: string) => t(`scheduler.jobNames.${key}.name`, { defaultValue: key });
  // Groups stay in their fixed order; a column sort reorders jobs inside each group.
  const groups = groupJobs(jobs, nameOf).map((g) => ({
    ...g,
    jobs: sortRows(g.jobs, sortConfig, {
      name: (job) => nameOf(job.key),
      // Interval jobs by their interval; daily jobs count as once a day; event/cron jobs last.
      cadence: (job) => job.intervalMs ?? job.defaultIntervalMs ?? (job.scheduleType === "daily" ? 86_400_000 : null),
      lastRun: (job) => (job.latestRun ? new Date(job.latestRun.startedAt) : null),
      nextRunAt: (job) => (job.enabled && job.nextRunAt ? new Date(job.nextRunAt) : null),
      enabled: (job) => job.enabled,
      notifyOnError: (job) => job.notifyOnError,
    }),
  }));
  const isOpen = (group: JobGroup) => forceExpanded || expanded.has(group);
  const allExpanded = groups.length > 0 && groups.every((g) => isOpen(g.group));

  const toggleGroup = (group: JobGroup) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(groups.map((g) => g.group)));

  return (
    <TooltipProvider>
      <div className="mb-2 flex items-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-8 p-0"
              onClick={toggleAll}
              disabled={forceExpanded || groups.length === 0}
              aria-label={allExpanded ? t("scheduler.jobs.collapseAll") : t("scheduler.jobs.expandAll")}
            >
              {allExpanded ? <ChevronsDownUp className="h-3.5 w-3.5" /> : <ChevronsUpDown className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{allExpanded ? t("scheduler.jobs.collapseAll") : t("scheduler.jobs.expandAll")}</TooltipContent>
        </Tooltip>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-800/50">
              <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colJob")}
              </SortableTableHead>
              <SortableTableHead sortKey="cadence" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colCadence")}
              </SortableTableHead>
              <SortableTableHead sortKey="lastRun" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colLastRun")}
              </SortableTableHead>
              <SortableTableHead sortKey="nextRunAt" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colNextRun")}
              </SortableTableHead>
              <SortableTableHead sortKey="enabled" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colEnabled")}
              </SortableTableHead>
              <SortableTableHead sortKey="notifyOnError" sortConfig={sortConfig} onSort={handleSort}>
                {t("scheduler.jobs.colErrorEmail")}
              </SortableTableHead>
              <SortableTableHead sortable={false} align="right">{t("scheduler.jobs.colActions")}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const open = isOpen(g.group);
              return (
                <Fragment key={g.group}>
                  <TableRow className="bg-gray-50/60 hover:bg-gray-100 dark:bg-gray-800/40 dark:hover:bg-gray-800/70">
                    <TableCell colSpan={COLUMN_COUNT} className="p-0">
                      <button
                        type="button"
                        onClick={() => toggleGroup(g.group)}
                        disabled={forceExpanded}
                        aria-expanded={open}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left disabled:cursor-default"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                        )}
                        {g.errorCount > 0 ? <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" /> : null}
                        <span
                          className={cn(
                            "font-semibold",
                            g.errorCount > 0 ? "text-rose-700 dark:text-rose-400" : "text-gray-900 dark:text-gray-100",
                          )}
                          title={g.errorCount > 0 ? t("scheduler.groups.errors", { count: g.errorCount }) : undefined}
                        >
                          {t(`scheduler.groups.${g.group}`)}
                        </span>
                        <span className="ml-auto flex shrink-0 items-center gap-2">
                          <span
                            className="inline-flex items-center overflow-hidden rounded-full border border-gray-200 text-xs font-medium tabular-nums dark:border-gray-700"
                            title={t("scheduler.groups.activeTitle", { active: g.activeCount, inactive: g.inactiveCount })}
                          >
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5",
                                g.activeCount > 0
                                  ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                                  : "bg-gray-50 text-gray-400 dark:bg-gray-800/60 dark:text-gray-500",
                              )}
                            >
                              <Power className="h-3 w-3" />
                              {t("scheduler.groups.active", { count: g.activeCount })}
                            </span>
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5",
                                g.inactiveCount > 0
                                  ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                                  : "bg-gray-50 text-gray-400 dark:bg-gray-800/60 dark:text-gray-500",
                              )}
                            >
                              <PowerOff className="h-3 w-3" />
                              {t("scheduler.groups.inactive", { count: g.inactiveCount })}
                            </span>
                          </span>
                          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                            {g.jobs.length}
                          </span>
                        </span>
                      </button>
                    </TableCell>
                  </TableRow>
                  {open ? (
                    g.jobs.map((job) => {
                    const health = jobHealth(job);
                    const { className: pillClass, Icon: PillIcon } = HEALTH_STYLES[health];
                    const busyRun = pendingRunKey === job.key || job.running;
                    const busyConfig = pendingConfigKey === job.key;
                    const lastRun = job.latestRun;
                    const isDefault = isDefaultSchedule(job, serverTimezone);
                    const name = t(`scheduler.jobNames.${job.key}.name`, { defaultValue: job.key });
                    const waiting = job.waitingForCrm;
                    const locked = !canEdit || waiting;
                    return (
                      <TableRow key={job.key} className={job.enabled ? undefined : "opacity-70"}>
                        <TableCell className="min-w-[16rem] pl-10">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {t(`scheduler.jobNames.${job.key}.name`, { defaultValue: job.key })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {t(`scheduler.jobNames.${job.key}.description`, { defaultValue: "" })}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[11rem]">
                          <ScheduleCell job={job} canEdit={!locked} busy={busyConfig} serverTimezone={serverTimezone} onCadence={onCadence} onEditRunTime={onEditRunTime} />
                        </TableCell>
                        <TableCell className="min-w-[10rem]">
                          <div className="flex flex-col gap-1">
                            {waiting ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge variant="outline" className={`w-fit ${pillClass}`}>
                                    <PillIcon className="mr-1 h-3 w-3" />
                                    {t(`scheduler.health.${health}`)}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">{t("scheduler.jobs.waitingForCrm")}</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="outline" className={`w-fit ${pillClass}`}>
                                <PillIcon className="mr-1 h-3 w-3" />
                                {t(`scheduler.health.${health}`)}
                              </Badge>
                            )}
                            {lastRun ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-xs text-muted-foreground">{formatRelative(lastRun.startedAt, language)}</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                  <p>{formatDateTime(lastRun.startedAt, language)}</p>
                                  {lastRun.message ? <p className="mt-1 break-words">{lastRun.message}</p> : null}
                                </TooltipContent>
                              </Tooltip>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {job.running ? (
                            <span className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {t("scheduler.jobs.runningNow")}
                            </span>
                          ) : job.enabled && job.nextRunAt ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm text-gray-700 dark:text-gray-300">{formatRelative(job.nextRunAt, language)}</span>
                              </TooltipTrigger>
                              <TooltipContent>{formatDateTime(job.nextRunAt, language)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={job.enabled}
                            onCheckedChange={(checked) => onToggle(job, checked)}
                            disabled={locked || busyConfig}
                            aria-label={t("scheduler.jobs.toggleLabel", { name })}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={job.notifyOnError}
                            onCheckedChange={(checked) => onNotifyOnError(job, checked)}
                            disabled={locked || busyConfig}
                            aria-label={t("scheduler.jobs.errorEmailLabel", { name })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <ResponsiveTableActionsMenu
                            actions={[
                              {
                                id: "run",
                                label: busyRun ? t("scheduler.jobs.running") : t("scheduler.jobs.runNow"),
                                icon: busyRun ? Loader2 : Play,
                                onClick: () => onRunNow(job),
                                variant: "success",
                                disabled: busyRun,
                                hidden: locked || job.scheduleType === "event",
                              },
                              {
                                id: "run-time",
                                label: t("scheduler.jobs.changeRunTime"),
                                icon: Pencil,
                                onClick: () => onEditRunTime(job),
                                disabled: busyConfig,
                                hidden: locked || !job.cadenceEditable || job.scheduleType !== "daily",
                              },
                              {
                                id: "reset",
                                label:
                                  job.scheduleType === "daily" ? t("scheduler.jobs.resetRunTime") : t("scheduler.jobs.resetCadence"),
                                icon: RotateCcw,
                                onClick: () => onResetSchedule(job),
                                disabled: busyConfig,
                                hidden: locked || !job.cadenceEditable || isDefault,
                              },
                              {
                                id: "history",
                                label: t("scheduler.jobs.viewHistory"),
                                icon: History,
                                onClick: () => onShowHistory(job),
                              },
                            ]}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
}

interface ScheduleCellProps {
  job: SchedulerJob;
  canEdit: boolean;
  busy: boolean;
  serverTimezone: string;
  onCadence: (job: SchedulerJob, intervalMs: number | null) => void;
  onEditRunTime: (job: SchedulerJob) => void;
}

/** The "Runs" column: an interval picker, a daily clock time, a schedule owned by another page, or an event. */
function ScheduleCell({ job, canEdit, busy, serverTimezone, onCadence, onEditRunTime }: ScheduleCellProps) {
  const { t, i18n } = useTranslation();

  if (job.scheduleType === "event") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
          <Zap className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
          {t(`scheduler.events.${(job.eventKey ?? "").replace(/\./g, "_")}`, { defaultValue: job.eventKey ?? "" })}
        </span>
        {job.editPath ? (
          <Link
            href={job.editPath}
            className="flex w-fit items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="h-3 w-3" />
            {t(`scheduler.jobNames.${job.key}.editLink`, { defaultValue: t("scheduler.jobs.editSchedule") })}
          </Link>
        ) : null}
      </div>
    );
  }
  const timezone = job.timezone ?? serverTimezone;
  const timezoneNote =
    timezone === serverTimezone ? t("scheduler.jobs.serverTime", { timezone }) : timezone;

  if (job.scheduleType === "daily" && job.dailyAt) {
    const label = t("scheduler.jobs.dailyAt", { time: formatClockTime(job.dailyAt, i18n.language) });
    return (
      <div className="flex flex-col">
        {job.cadenceEditable && canEdit ? (
          <button
            type="button"
            onClick={() => onEditRunTime(job)}
            disabled={busy}
            className="flex w-fit items-center gap-1 text-left text-sm text-gray-700 hover:text-blue-600 disabled:opacity-60 dark:text-gray-300 dark:hover:text-blue-400"
            aria-label={t("scheduler.jobs.changeRunTime")}
          >
            <Pencil className="h-3 w-3" />
            {label}
          </button>
        ) : (
          <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
        )}
        <span className="text-xs text-muted-foreground">{timezoneNote}</span>
      </div>
    );
  }

  if (job.scheduleType === "cron") {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {t("scheduler.jobs.customSchedule")}{" "}
          <code className="rounded bg-gray-100 px-1 text-xs text-gray-800 dark:bg-gray-800 dark:text-gray-200">{job.cronExpression}</code>
        </span>
        <span className="text-xs text-muted-foreground">{timezoneNote}</span>
        {job.editPath ? (
          <Link
            href={job.editPath}
            className="flex w-fit items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            <ExternalLink className="h-3 w-3" />
            {t("scheduler.jobs.editSchedule")}
          </Link>
        ) : null}
      </div>
    );
  }

  const intervalMs = job.intervalMs ?? 0;
  const defaultIntervalMs = job.defaultIntervalMs ?? intervalMs;
  if (job.cadenceEditable && canEdit) {
    return (
      <Select
        value={intervalMs === defaultIntervalMs ? "default" : String(intervalMs)}
        onValueChange={(value) => onCadence(job, value === "default" ? null : Number(value))}
        disabled={busy}
      >
        <SelectTrigger className="h-8 text-sm" aria-label={t("scheduler.jobs.cadenceLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">
            {t("scheduler.jobs.cadenceDefault", { cadence: formatCadence(defaultIntervalMs, t) })}
          </SelectItem>
          {cadenceOptions(job)
            .filter((ms) => ms !== defaultIntervalMs)
            .map((ms) => (
              <SelectItem key={ms} value={String(ms)}>
                {formatCadence(ms, t)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    );
  }
  return <span className="text-sm text-gray-700 dark:text-gray-300">{formatCadence(intervalMs, t)}</span>;
}
