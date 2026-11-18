// Configuration › Scheduler routes.
//
//   GET   /api/scheduler                      every listed job + health KPIs
//   GET   /api/scheduler/runs?jobKey=&page=&sortKey=&sortDir=   run history (one job or all), 20 a page
//   DELETE /api/scheduler/runs?jobKey=        clear run history (one job or all)
//   PATCH /api/scheduler/jobs/:jobKey         on/off switch, cadence or clock
//                                             time + timezone, error emails
//   POST  /api/scheduler/jobs/:jobKey/run     run the job now
//   GET   /api/scheduler/send-window          quiet hours + max emails per hour
//   PUT   /api/scheduler/send-window          change them
//
// Delegable through Role Management: reads need "view" on the
// config.scheduler section, changes need "edit" (Admin always passes).
//
// CRM jobs follow the install's CRM choice (shared/job-categories.ts
// crmJobAccess): the other CRM's jobs are not listed and answer 404, and
// while no CRM is chosen every CRM job is listed as waiting and refuses to
// be turned on or run (409). The jobs' own ticks stand down too
// (onlyWhenCrmActive), so this holds even if a switch was left on.
// Data access lives in server/storage/scheduler.ts; the live job state
// (next run, running now, effective cadence) comes from the in-process
// scheduler.
import type { Express } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/simpleAuth";
import { storage } from "../storage";
import { userCanEditSection, userCanViewSection } from "../lib/section-permissions";
import {
  applyJobConfig,
  getJobState,
  isValidTimezone,
  listJobStates,
  runJobNow,
  serverTimezone,
} from "../services/jobs/scheduler";
import { clearSendWindowCache, settingsFromRow } from "../email/send-window";
import { getCrmProviderId } from "../crm/provider-setting";
import { crmJobAccess, RECENT_RUNS_PAGE_SIZE, RUN_SORT_KEYS, type CrmJobAccess } from "@shared/job-categories";

import { SCHEDULER_SECTION } from "../lib/schedule-permissions";

export { SCHEDULER_SECTION };

const DAY_MS = 24 * 60 * 60 * 1000;
// Longest cadence an admin can pick: 30 days.
const MAX_INTERVAL_MS = 30 * DAY_MS;

const jobKeySchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    // null resets to the job's default cadence (interval jobs).
    intervalMs: z.number().int().positive().max(MAX_INTERVAL_MS).nullable().optional(),
    // null resets to the job's default clock time (daily jobs).
    dailyAt: z
      .object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) })
      .strict()
      .nullable()
      .optional(),
    // null = the server's timezone (daily jobs).
    timezone: z.string().trim().min(1).max(64).nullable().optional(),
    notifyOnError: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "Nothing to change",
  });

const sendWindowSchema = z
  .object({
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: z.number().int().min(0).max(23).optional(),
    quietHoursEnd: z.number().int().min(0).max(23).optional(),
    quietHoursScope: z.enum(["digests", "all"]).optional(),
    // null = the server's timezone.
    timezone: z.string().trim().min(1).max(64).nullable().optional(),
    // 0 = no limit.
    maxEmailsPerHour: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: "Nothing to change",
  });

const runsQuerySchema = z.object({
  jobKey: jobKeySchema.optional(),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(RECENT_RUNS_PAGE_SIZE),
  // An unknown sort (an old link) falls back to newest first instead of a 400.
  sortKey: z.enum(RUN_SORT_KEYS).optional().catch(undefined),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
});

const clearRunsQuerySchema = z.object({ jobKey: jobKeySchema.optional() });

/** Registered jobs the page doesn't list: the CRM the install doesn't use. */
function hiddenJobKeys(activeCrm: Awaited<ReturnType<typeof getCrmProviderId>>): string[] {
  return listJobStates()
    .filter((state) => crmJobAccess(state.category, activeCrm) === "hidden")
    .map((state) => state.key);
}

/** How a registered job stands under the current CRM choice; null when it isn't registered. */
async function jobAccess(jobKey: string): Promise<CrmJobAccess | null> {
  const state = getJobState(jobKey);
  if (!state) return null;
  return crmJobAccess(state.category, await getCrmProviderId());
}

async function canView(req: any, res: any): Promise<boolean> {
  if (await userCanViewSection(req, SCHEDULER_SECTION)) return true;
  res.status(403).json({ message: "You do not have permission to view the Scheduler" });
  return false;
}

async function canEdit(req: any, res: any): Promise<boolean> {
  if (await userCanEditSection(req, SCHEDULER_SECTION)) return true;
  res.status(403).json({ message: "You do not have permission to change scheduled jobs" });
  return false;
}

export function registerSchedulerRoutes(app: Express) {
  app.get("/api/scheduler", isAuthenticated, async (req: any, res) => {
    if (!(await canView(req, res))) return;
    try {
      const activeCrm = await getCrmProviderId();
      const [latest, configs, failedRuns7d] = await Promise.all([
        storage.getLatestJobRuns(),
        storage.listJobConfigs(),
        storage.countFailedJobRunsSince(new Date(Date.now() - 7 * DAY_MS), hiddenJobKeys(activeCrm)),
      ]);
      const latestByKey = new Map(latest.map((r) => [r.jobKey, r]));
      const configByKey = new Map(configs.map((c) => [c.jobKey, c]));
      const jobs = listJobStates().flatMap((state) => {
        const access = crmJobAccess(state.category, activeCrm);
        if (access === "hidden") return [];
        const waiting = access === "waiting";
        return [
          {
            ...state,
            // A waiting job doesn't run, whatever its switch says.
            enabled: waiting ? false : state.enabled,
            nextRunAt: waiting ? null : state.nextRunAt,
            waitingForCrm: waiting,
            latestRun: latestByKey.get(state.key) ?? null,
            updatedAt: configByKey.get(state.key)?.updatedAt ?? null,
          },
        ];
      });
      // Waiting jobs aren't counted against the install: they can't run yet.
      const counted = jobs.filter((j) => !j.waitingForCrm);
      res.json({
        jobs,
        activeCrm,
        kpis: {
          jobsInError: counted.filter((j) => j.latestRun?.status === "error").length,
          jobsDisabled: counted.filter((j) => !j.enabled).length,
          neverRun: counted.filter((j) => !j.latestRun).length,
          noErrorEmail: counted.filter((j) => !j.notifyOnError).length,
          failedRuns7d,
        },
        serverTimezone: serverTimezone(),
      });
    } catch (error) {
      console.error("Error fetching scheduler state:", error);
      res.status(500).json({ message: "Failed to load scheduled jobs" });
    }
  });

  app.get("/api/scheduler/runs", isAuthenticated, async (req: any, res) => {
    if (!(await canView(req, res))) return;
    const parsed = runsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Invalid filter" });
    const { jobKey, page, pageSize, sortKey, sortDir } = parsed.data;
    try {
      const hidden = hiddenJobKeys(await getCrmProviderId());
      const [runs, total] = await Promise.all([
        storage.listRecentJobRuns(pageSize, jobKey, (page - 1) * pageSize, hidden, sortKey ? { key: sortKey, direction: sortDir } : undefined),
        storage.countJobRuns(jobKey, hidden),
      ]);
      res.json({ runs, total, page, pageSize });
    } catch (error) {
      console.error("Error fetching job runs:", error);
      res.status(500).json({ message: "Failed to load run history" });
    }
  });

  app.delete("/api/scheduler/runs", isAuthenticated, async (req: any, res) => {
    if (!(await canEdit(req, res))) return;
    const parsed = clearRunsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Invalid job" });
    try {
      const removed = await storage.clearJobRuns(parsed.data.jobKey);
      console.log(
        `[Scheduler] User ${req.session.user?.id ?? "unknown"} cleared ${removed} run${removed === 1 ? "" : "s"}` +
          (parsed.data.jobKey ? ` of ${parsed.data.jobKey}` : " (all jobs)"),
      );
      res.json({ removed });
    } catch (error) {
      console.error("Error clearing job runs:", error);
      res.status(500).json({ message: "Failed to clear the run history" });
    }
  });

  app.patch("/api/scheduler/jobs/:jobKey", isAuthenticated, async (req: any, res) => {
    if (!(await canEdit(req, res))) return;
    const key = jobKeySchema.safeParse(req.params.jobKey);
    if (!key.success) return res.status(400).json({ message: "Invalid job" });
    const state = getJobState(key.data);
    if (!state) return res.status(404).json({ message: "Job not found" });
    const access = crmJobAccess(state.category, await getCrmProviderId());
    if (access === "hidden") return res.status(404).json({ message: "Job not found" });
    if (access === "waiting") {
      return res.status(409).json({ code: "crm_not_chosen", message: "Choose a CRM before changing this job" });
    }
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    const { enabled, intervalMs, dailyAt, timezone, notifyOnError } = parsed.data;
    if (intervalMs !== undefined && intervalMs !== null) {
      if (!state.cadenceEditable || state.scheduleType !== "interval") {
        return res.status(400).json({ message: "This job's cadence can't be changed" });
      }
      if (intervalMs < state.minIntervalMs) {
        return res.status(400).json({ message: "That cadence is shorter than this job allows" });
      }
    }
    if ((dailyAt !== undefined || timezone !== undefined) && (!state.cadenceEditable || state.scheduleType !== "daily")) {
      return res.status(400).json({ message: "This job's run time can't be changed here" });
    }
    if (timezone && !isValidTimezone(timezone)) {
      return res.status(400).json({ message: "Unknown timezone" });
    }
    const patch = {
      enabled,
      intervalMs,
      notifyOnError,
      scheduleHour: dailyAt === undefined ? undefined : (dailyAt?.hour ?? null),
      scheduleMinute: dailyAt === undefined ? undefined : (dailyAt?.minute ?? null),
      timezone,
    };
    try {
      const row = await storage.upsertJobConfig(key.data, patch, req.session.user?.id ?? null);
      applyJobConfig(key.data, {
        enabled: row.enabled,
        intervalMs: row.intervalMs,
        scheduleHour: row.scheduleHour,
        scheduleMinute: row.scheduleMinute,
        timezone: row.timezone,
        notifyOnError: row.notifyOnError,
      });
      res.json({ job: getJobState(key.data) });
    } catch (error) {
      console.error("Error updating job config:", error);
      res.status(500).json({ message: "Failed to save the job settings" });
    }
  });

  app.post("/api/scheduler/jobs/:jobKey/run", isAuthenticated, async (req: any, res) => {
    if (!(await canEdit(req, res))) return;
    const key = jobKeySchema.safeParse(req.params.jobKey);
    if (!key.success) return res.status(400).json({ message: "Invalid job" });
    try {
      const access = await jobAccess(key.data);
      if (access === null || access === "hidden") return res.status(404).json({ message: "Job not found" });
      if (access === "waiting") {
        return res.status(409).json({ code: "crm_not_chosen", message: "Choose a CRM before running this job" });
      }
      const result = await runJobNow(key.data, req.session.user?.id);
      if (!result) return res.status(404).json({ message: "Job not found" });
      if (result.message === "already_running") {
        return res.status(409).json({ message: "This job is already running" });
      }
      if (result.message === "event_job") {
        return res.status(400).json({ message: "This job runs when its event happens, not on demand" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error running job:", error);
      res.status(500).json({ message: "Failed to run the job" });
    }
  });

  app.get("/api/scheduler/send-window", isAuthenticated, async (req: any, res) => {
    if (!(await canView(req, res))) return;
    try {
      const [row, sentThisHour] = await Promise.all([
        storage.getEmailAutomationConfig(),
        storage.getHourlyEmailSendCount(),
      ]);
      res.json({ ...settingsFromRow(row), sentThisHour, serverTimezone: serverTimezone() });
    } catch (error) {
      console.error("Error fetching send window:", error);
      res.status(500).json({ message: "Failed to load the Send Email Window" });
    }
  });

  app.put("/api/scheduler/send-window", isAuthenticated, async (req: any, res) => {
    if (!(await canEdit(req, res))) return;
    const parsed = sendWindowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    }
    if (parsed.data.timezone && !isValidTimezone(parsed.data.timezone)) {
      return res.status(400).json({ message: "Unknown timezone" });
    }
    try {
      const row = await storage.updateEmailSendWindow(parsed.data, req.session.user?.id ?? null);
      clearSendWindowCache();
      res.json({ ...settingsFromRow(row), sentThisHour: await storage.getHourlyEmailSendCount() });
    } catch (error) {
      console.error("Error updating send window:", error);
      res.status(500).json({ message: "Failed to save the Send Email Window" });
    }
  });
}
