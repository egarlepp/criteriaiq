// Types and formatting helpers for Configuration › Scheduler.
import type { TFunction } from "i18next";
import { JOB_GROUPS, jobGroup, type JobGroup } from "@shared/job-categories";

export type JobCategory = "system" | "salesforce" | "hubspot" | "workflow";
export type JobRunStatus = "success" | "error";

export interface JobRun {
  id: number;
  jobKey: string;
  status: JobRunStatus;
  source: "scheduled" | "manual" | "event";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  itemsProcessed: number | null;
  message: string | null;
  triggeredBy: string | null;
}

export type JobScheduleType = "interval" | "daily" | "cron" | "event";

export interface DailyTime {
  hour: number;
  minute: number;
}

export interface SchedulerJob {
  key: string;
  category: JobCategory;
  scheduleType: JobScheduleType;
  /** Interval jobs only. */
  defaultIntervalMs: number | null;
  intervalMs: number | null;
  minIntervalMs: number;
  /** Daily jobs only. */
  defaultDailyAt: DailyTime | null;
  dailyAt: DailyTime | null;
  /** Daily and cron jobs. */
  timezone: string | null;
  cronExpression: string | null;
  /** Event jobs: the event that runs the job (e.g. "user.registration_completed"). */
  eventKey: string | null;
  cadenceEditable: boolean;
  /** Where a cron job's schedule (or an event job's content) is edited, when it isn't on this page. */
  editPath: string | null;
  enabled: boolean;
  notifyOnError: boolean;
  running: boolean;
  nextRunAt: string | null;
  /** A CRM job while no CRM is chosen: off and not runnable until one is. */
  waitingForCrm: boolean;
  latestRun: JobRun | null;
}

export interface SchedulerKpis {
  jobsInError: number;
  jobsDisabled: number;
  neverRun: number;
  noErrorEmail: number;
  failedRuns7d: number;
}

export interface SchedulerState {
  jobs: SchedulerJob[];
  /** The install's CRM (Admin › Integrations › Overview › CRM). */
  activeCrm: "salesforce" | "hubspot" | "none";
  kpis: SchedulerKpis;
  serverTimezone: string;
}

/** GET /api/scheduler/runs: one page of run history. */
export interface JobRunsPage {
  runs: JobRun[];
  total: number;
  page: number;
  pageSize: number;
}

export interface JobConfigBody {
  enabled?: boolean;
  intervalMs?: number | null;
  dailyAt?: DailyTime | null;
  timezone?: string | null;
  notifyOnError?: boolean;
}

export interface JobRunResult {
  recorded: boolean;
  status: "success" | "skipped" | "error";
  message?: string;
}

export type JobHealth = "ok" | "error" | "disabled" | "never" | "waiting";

export function jobHealth(job: SchedulerJob): JobHealth {
  if (job.waitingForCrm) return "waiting";
  if (!job.enabled) return "disabled";
  if (!job.latestRun) return "never";
  return job.latestRun.status === "error" ? "error" : "ok";
}

export interface JobGroupSummary {
  group: JobGroup;
  jobs: SchedulerJob[];
  /** Jobs whose last run failed (turns the group name red). */
  errorCount: number;
  /** On and able to run. */
  activeCount: number;
  /** Turned off, or waiting for a CRM. */
  inactiveCount: number;
}

/** Jobs grouped by what they do, in JOB_GROUPS order; empty groups left out. */
export function groupJobs(jobs: SchedulerJob[], nameOf: (key: string) => string): JobGroupSummary[] {
  return JOB_GROUPS.map((group) => {
    const members = jobs
      .filter((job) => jobGroup(job.key) === group)
      .sort((a, b) => nameOf(a.key).localeCompare(nameOf(b.key)));
    const errorCount = members.filter((job) => jobHealth(job) === "error").length;
    const activeCount = members.filter((job) => job.enabled && !job.waitingForCrm).length;
    return { group, jobs: members, errorCount, activeCount, inactiveCount: members.length - activeCount };
  }).filter((g) => g.jobs.length > 0);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Cadences offered in the picker (filtered by each job's minimum). */
export const CADENCE_PRESETS_MS = [
  MINUTE,
  5 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  7 * DAY,
];

export function cadenceOptions(job: SchedulerJob): number[] {
  const options = new Set(CADENCE_PRESETS_MS.filter((ms) => ms >= job.minIntervalMs));
  if (job.defaultIntervalMs !== null) options.add(job.defaultIntervalMs);
  if (job.intervalMs !== null) options.add(job.intervalMs);
  return Array.from(options).sort((a, b) => a - b);
}

/** Whether the job runs on its default schedule (nothing to reset). */
export function isDefaultSchedule(job: SchedulerJob, serverTimezone: string): boolean {
  if (job.scheduleType === "interval") return job.intervalMs === job.defaultIntervalMs;
  if (job.scheduleType === "daily") {
    return (
      job.dailyAt?.hour === job.defaultDailyAt?.hour &&
      job.dailyAt?.minute === job.defaultDailyAt?.minute &&
      (job.timezone ?? serverTimezone) === serverTimezone
    );
  }
  return true;
}

/** "03:00" in the user's language (12- or 24-hour as their locale prefers). */
export function formatClockTime(time: DailyTime, language: string): string {
  const at = new Date(Date.UTC(2000, 0, 1, time.hour, time.minute));
  return new Intl.DateTimeFormat(language, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(at);
}

/** "HH:MM" for an <input type="time">. */
export function toTimeInputValue(time: DailyTime): string {
  return `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
}

export function fromTimeInputValue(value: string): DailyTime | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function formatCadence(ms: number, t: TFunction): string {
  if (ms % DAY === 0) return t("scheduler.cadence.days", { count: ms / DAY });
  if (ms % HOUR === 0) return t("scheduler.cadence.hours", { count: ms / HOUR });
  if (ms % MINUTE === 0) return t("scheduler.cadence.minutes", { count: ms / MINUTE });
  return t("scheduler.cadence.seconds", { count: Math.round(ms / 1000) });
}

export function formatDuration(ms: number, t: TFunction): string {
  if (ms < 1000) return t("scheduler.duration.ms", { count: ms });
  if (ms < MINUTE) return t("scheduler.duration.seconds", { value: (ms / 1000).toFixed(1) });
  return t("scheduler.duration.minutes", { value: (ms / MINUTE).toFixed(1) });
}

/** "5 minutes ago" / "in 3 hours", in the user's language. */
export function formatRelative(iso: string | null, language: string, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return null;
  const diff = at - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  if (abs < MINUTE) return rtf.format(Math.round(diff / 1000), "second");
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  return rtf.format(Math.round(diff / DAY), "day");
}

export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
