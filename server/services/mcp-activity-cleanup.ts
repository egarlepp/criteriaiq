// Daily prune of mcp_tool_calls rows older than 30 days, so the MCP
// activity log on Admin › Integrations › MCP Server stays bounded.
// Runs on the shared Scheduler (Configuration › Scheduler): first run a
// few minutes after boot, then every 24 hours by default. Skips a tick
// while the database is unreachable (same short-circuit as
// audit-logins-cleanup).

import { storage } from "../storage";
import { scheduleJob, type JobOutcome } from "./jobs/scheduler";

export const MCP_ACTIVITY_RETENTION_DAYS = 30;
/** Key on Configuration › Scheduler. */
export const MCP_ACTIVITY_CLEANUP_JOB_KEY = "mcp_activity_cleanup";
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

async function runTick(): Promise<JobOutcome> {
  const { dbHealth } = await import("../lib/db-probe");
  if (!dbHealth.reachable) return { status: "skipped", message: "database_unreachable" };
  try {
    const removed = await storage.pruneMcpToolCalls(new Date(Date.now() - MCP_ACTIVITY_RETENTION_DAYS * DAY_MS));
    if (removed > 0) {
      console.log(`[MCP Activity Cleanup] Pruned ${removed} mcp_tool_calls row${removed === 1 ? "" : "s"}`);
    }
    return { status: "success", itemsProcessed: removed };
  } catch (err) {
    console.error("[MCP Activity Cleanup] Prune failed:", err instanceof Error ? err.message : err);
    throw err;
  }
}

export function startMcpActivityCleanup(): void {
  scheduleJob({
    key: MCP_ACTIVITY_CLEANUP_JOB_KEY,
    category: "system",
    label: "MCP activity cleanup",
    defaultIntervalMs: DAY_MS,
    cadenceEditable: true,
    minIntervalMs: HOUR_MS,
    firstRunDelayMs: FIRST_RUN_DELAY_MS,
    task: runTick,
  });
}
