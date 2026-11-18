// Scheduler — mixin for DatabaseStorage.
//
// Backs Configuration › Scheduler: the per-job overrides in `job_config`
// and the run history in `job_runs`. The scheduler itself
// (server/services/jobs/scheduler.ts) gets these through injection at boot
// so it stays free of database imports.
import { db } from "../db";
import { and, asc, count, desc, eq, gte, isNull, lt, notInArray, or, type SQL } from "drizzle-orm";
import { jobConfig, jobRuns } from "@shared/schema";
import type { InsertJobRun, JobConfig, JobRun } from "@shared/schema";
import type { RunSortKey } from "@shared/job-categories";

export interface JobConfigPatch {
  enabled?: boolean;
  /** null resets to the job's default cadence. */
  intervalMs?: number | null;
  notifyOnError?: boolean;
  /** Daily jobs; null resets to the job's default time or the server timezone. */
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  timezone?: string | null;
}

const PATCH_FIELDS = ["enabled", "intervalMs", "notifyOnError", "scheduleHour", "scheduleMinute", "timezone"] as const;

function jobRunsFilter(jobKey: string | undefined, excludeKeys: string[]): SQL | undefined {
  return and(
    jobKey ? eq(jobRuns.jobKey, jobKey) : undefined,
    excludeKeys.length > 0 ? notInArray(jobRuns.jobKey, excludeKeys) : undefined,
  );
}

export class SchedulerStorageMixin {
  async listJobConfigs(): Promise<JobConfig[]> {
    return db.select().from(jobConfig);
  }

  async upsertJobConfig(jobKey: string, patch: JobConfigPatch, userId: string | null): Promise<JobConfig> {
    const set: Partial<typeof jobConfig.$inferInsert> = { updatedAt: new Date(), updatedBy: userId };
    for (const field of PATCH_FIELDS) {
      if (patch[field] !== undefined) (set as Record<string, unknown>)[field] = patch[field];
    }
    const [row] = await db
      .insert(jobConfig)
      .values({ jobKey, ...set })
      .onConflictDoUpdate({ target: jobConfig.jobKey, set })
      .returning();
    return row;
  }

  /**
   * Claim one clock-time slot of a daily or cron job for this server copy.
   * True for the first copy to reach the slot, false for the rest. A row
   * created here keeps every override at its default (no updated_at, so it
   * doesn't read as an admin edit).
   */
  async claimJobSlot(jobKey: string, slot: Date): Promise<boolean> {
    const rows = await db
      .insert(jobConfig)
      .values({ jobKey, lastSlotAt: slot, updatedAt: null })
      .onConflictDoUpdate({
        target: jobConfig.jobKey,
        set: { lastSlotAt: slot },
        setWhere: or(isNull(jobConfig.lastSlotAt), lt(jobConfig.lastSlotAt, slot)),
      })
      .returning({ jobKey: jobConfig.jobKey });
    return rows.length > 0;
  }

  /**
   * Reserve the "Scheduled job failed" email for a job: true when "Email
   * admins on error" is on and no email went out in the last `minGapMs`.
   * One atomic update, so two copies failing together send one email.
   */
  async claimJobErrorEmail(jobKey: string, now: Date, minGapMs: number): Promise<boolean> {
    const rows = await db
      .update(jobConfig)
      .set({ lastErrorEmailAt: now })
      .where(
        and(
          eq(jobConfig.jobKey, jobKey),
          eq(jobConfig.notifyOnError, true),
          or(isNull(jobConfig.lastErrorEmailAt), lt(jobConfig.lastErrorEmailAt, new Date(now.getTime() - minGapMs))),
        ),
      )
      .returning({ jobKey: jobConfig.jobKey });
    return rows.length > 0;
  }

  async insertJobRun(run: InsertJobRun): Promise<void> {
    await db.insert(jobRuns).values(run);
  }

  /** Latest run per job key. */
  async getLatestJobRuns(): Promise<JobRun[]> {
    return db
      .selectDistinctOn([jobRuns.jobKey])
      .from(jobRuns)
      .orderBy(jobRuns.jobKey, desc(jobRuns.startedAt));
  }

  /**
   * Newest first unless `sort` names a column (ties then newest first).
   * `excludeKeys` leaves out jobs the page doesn't list (the CRM the
   * install doesn't use).
   */
  async listRecentJobRuns(
    limit: number,
    jobKey?: string,
    offset = 0,
    excludeKeys: string[] = [],
    sort?: { key: RunSortKey; direction: "asc" | "desc" },
  ): Promise<JobRun[]> {
    const order = sort ? [(sort.direction === "asc" ? asc : desc)(jobRuns[sort.key])] : [];
    return db
      .select()
      .from(jobRuns)
      .where(jobRunsFilter(jobKey, excludeKeys))
      .orderBy(...order, desc(jobRuns.startedAt), desc(jobRuns.id))
      .limit(limit)
      .offset(offset);
  }

  /** Runs recorded for one job, or for every job. Backs Recent runs paging. */
  async countJobRuns(jobKey?: string, excludeKeys: string[] = []): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(jobRuns)
      .where(jobRunsFilter(jobKey, excludeKeys));
    return Number(row?.n ?? 0);
  }

  /**
   * Configuration › Scheduler › Clear run history: deletes the recorded
   * runs of one job, or of every job. Returns how many rows went.
   */
  async clearJobRuns(jobKey?: string): Promise<number> {
    const removed = await db
      .delete(jobRuns)
      .where(jobKey ? eq(jobRuns.jobKey, jobKey) : undefined)
      .returning({ id: jobRuns.id });
    return removed.length;
  }

  async countFailedJobRunsSince(since: Date, excludeKeys: string[] = []): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(jobRuns)
      .where(and(eq(jobRuns.status, "error"), gte(jobRuns.startedAt, since), jobRunsFilter(undefined, excludeKeys)));
    // count() can come back as a string from the pg driver.
    return Number(row?.n ?? 0);
  }

  async pruneJobRuns(before: Date): Promise<number> {
    const removed = await db.delete(jobRuns).where(lt(jobRuns.startedAt, before)).returning({ id: jobRuns.id });
    return removed.length;
  }
}
