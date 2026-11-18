// Daily prune of page_view_daily rows older than 400 days, so Admin ›
// Monitoring & Audit › Page Usage keeps a bit over a year of history.
// Runs on the shared Scheduler (Configuration › Scheduler): first run a few
// minutes after boot, then every 24 hours by default. Skips a tick while the
// database is unreachable (same short-circuit as mcp-activity-cleanup).

import { storage } from "../storage";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";
import { PAGE_VIEW_RETENTION_DAYS } from "@shared/page-views";

/** Key on Configuration › Scheduler. */
export const PAGE_VIEW_CLEANUP_JOB_KEY = "page_view_cleanup";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FIRST_RUN_DELAY_MS = 6 * 60 * 1000;

async function runTick(): Promise<JobOutcome> {
  const { dbHealth } = await import("../lib/db-probe");
  if (!dbHealth.reachable) return { status: "skipped", message: "database_unreachable" };
  try {
    const beforeDay = new Date(Date.now() - PAGE_VIEW_RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
    const removed = await storage.prunePageViews(beforeDay);
    if (removed > 0) {
      console.log(`[Page View Cleanup] Pruned ${removed} page_view_daily row${removed === 1 ? "" : "s"}`);
    }
    return { status: "success", itemsProcessed: removed };
  } catch (err) {
    console.error("[Page View Cleanup] Prune failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

export function startPageViewCleanup(): void {
  scheduleJob({
    key: PAGE_VIEW_CLEANUP_JOB_KEY,
    category: "system",
    label: "Page view cleanup",
    defaultIntervalMs: DAY_MS,
    cadenceEditable: true,
    minIntervalMs: HOUR_MS,
    firstRunDelayMs: FIRST_RUN_DELAY_MS,
    task: runTick,
  });
}
