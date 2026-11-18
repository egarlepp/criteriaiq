import { Cron } from 'croner';
import { eq, and, lte } from 'drizzle-orm';
import type { storage } from '../storage';
import type { WebSocketBroadcaster } from './websocket-broadcaster';

type Storage = typeof storage;

/** Key on Configuration › Scheduler. */
export const WORKFLOW_SCHEDULES_TICK_JOB_KEY = 'workflow_schedules_tick';

export class EmailScheduler {
  private static instance: EmailScheduler | null = null;
  // Tracks whether we already logged the "DB unreachable, skipping" line
  // for the current outage window so we don't add a fresh log line every
  // minute. Reset by the first successful tick after recovery. Static
  // because the singleton constructor only fires once but the
  // dbHealth-driven skip can transition many times across boots.
  static skipLogged = false;
  private storage: Storage;
  private broadcaster: WebSocketBroadcaster | null = null;

  private constructor(storage: Storage) {
    this.storage = storage;
  }

  static getInstance(storage: Storage): EmailScheduler {
    if (!EmailScheduler.instance) {
      EmailScheduler.instance = new EmailScheduler(storage);
    }
    return EmailScheduler.instance;
  }

  /**
   * Set the WebSocket broadcaster for real-time updates
   */
  setBroadcaster(broadcaster: WebSocketBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  /**
   * Calculate the next run time for a cron expression with timezone
   */
  calculateNextRun(cronExpression: string, timezone: string): Date | null {
    try {
      const job = new Cron(cronExpression, { timezone, paused: true });
      const nextRun = job.nextRun();
      job.stop();
      return nextRun;
    } catch (error) {
      console.error('Error calculating next run:', error);
      return null;
    }
  }

  /**
   * Validate a cron expression
   */
  validateCronExpression(cronExpression: string): boolean {
    try {
      const job = new Cron(cronExpression, { paused: true });
      job.stop();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get human-readable description of next run
   */
  getNextRunDescription(cronExpression: string, timezone: string): string {
    const nextRun = this.calculateNextRun(cronExpression, timezone);
    if (!nextRun) return 'Invalid schedule';
    
    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'In less than a minute';
    if (diffMins < 60) return `In ${diffMins} minute${diffMins > 1 ? 's' : ''}`;
    if (diffHours < 24) return `In ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    if (diffDays < 7) return `In ${diffDays} day${diffDays > 1 ? 's' : ''}`;
    
    return nextRun.toLocaleString('en-US', { 
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  }

  /**
   * Register the every-minute tick that runs due Workflow Automation
   * schedules. It runs on the shared Scheduler (Configuration › Scheduler)
   * as `workflow_schedules_tick`: an admin can see its last run, turn it
   * off or run it now there, and with several server copies only one runs
   * a tick at a time, so a due digest isn't sent twice.
   */
  async startBackgroundJob(): Promise<void> {
    const { scheduleJob, isJobRegistered } = await import('./jobs/scheduler');
    if (isJobRegistered(WORKFLOW_SCHEDULES_TICK_JOB_KEY)) {
      console.log('Email scheduler background job already running');
      return;
    }

    scheduleJob({
      key: WORKFLOW_SCHEDULES_TICK_JOB_KEY,
      category: 'workflow',
      label: 'Workflow schedules',
      defaultIntervalMs: 60_000,
      // Schedules are minute-precise cron expressions; a slower tick
      // would make every one of them late.
      cadenceEditable: false,
      singleInstance: true,
      task: async () => {
        const { due } = await this.checkAndExecuteSchedules();
        if (due === 0) return { status: 'skipped' };
        return { status: 'success', itemsProcessed: due, message: `Ran ${due} due schedule${due === 1 ? '' : 's'}` };
      },
    });

    console.log('Email scheduler background job started');
  }

  /**
   * Stop the background job
   */
  async stopBackgroundJob(): Promise<void> {
    const { unscheduleJob } = await import('./jobs/scheduler');
    unscheduleJob(WORKFLOW_SCHEDULES_TICK_JOB_KEY);
    console.log('Email scheduler background job stopped');
  }

  /**
   * Check for schedules that are due and execute them. Returns how many
   * were due. A failure to read the schedules throws, so the Scheduler
   * records a failed run; a single schedule's failure is logged in
   * Workflow Automation's run history and doesn't stop the others.
   */
  private async checkAndExecuteSchedules(): Promise<{ due: number }> {
    // Short-circuit when the database pool is in a known-bad state. The
    // boot-time probe and the long-lived `pool.on('error', ...)` handler
    // in server/db.ts both flip dbHealth.reachable to false on auth /
    // connection failures. Without this guard the tick fires every
    // minute against the broken pool and spams two stack traces per
    // tick — see task #361. Logs only on transition (skipLogged flag)
    // so we don't add a fresh log line every minute either.
    const { dbHealth } = await import('../lib/db-probe');
    if (!dbHealth.reachable) {
      if (!EmailScheduler.skipLogged) {
        console.warn('[scheduler] DB unreachable, skipping ticks until recovery');
        EmailScheduler.skipLogged = true;
      }
      return { due: 0 };
    }
    if (EmailScheduler.skipLogged) {
      console.log('[scheduler] DB reachable again, resuming ticks');
      EmailScheduler.skipLogged = false;
    }
    const now = new Date();

    // Find all active schedules where nextRunAt <= now. Demo Mode schedules
    // only exist to fill Analytics › Calendar and never run.
    const dueSchedules = await this.storage.db
      .select()
      .from(this.storage.schema.emailSchedules)
      .where(
        and(
          eq(this.storage.schema.emailSchedules.active, true),
          eq(this.storage.schema.emailSchedules.isDemo, false),
          lte(this.storage.schema.emailSchedules.nextRunAt, now)
        )
      );

    if (dueSchedules.length === 0) {
      return { due: 0 };
    }

    console.log(`Found ${dueSchedules.length} due schedule(s) to execute`);

    for (const schedule of dueSchedules) {
      try {
        await this.executeSchedule(schedule);
      } catch (error) {
        console.error(`Error executing schedule ${schedule.id}:`, error);
      }
    }
    return { due: dueSchedules.length };
  }

  /**
   * Execute a single schedule
   */
  private async executeSchedule(schedule: any): Promise<void> {
    console.log(`Executing schedule ${schedule.id} (actionType: ${schedule.actionType || 'email_digest'}) for rule ${schedule.ruleId}`);

    const digestStartedAt = new Date();

    try {
      const actionType = schedule.actionType || 'email_digest';
      if (actionType !== 'email_digest') {
        await this.executeNonEmailSchedule(schedule, actionType);
        return;
      }

      // Fetch the email rule
      const [rule] = await this.storage.db
        .select()
        .from(this.storage.schema.emailRules)
        .where(eq(this.storage.schema.emailRules.id, schedule.ruleId))
        .limit(1);

      if (!rule || !rule.enabled || rule.isDemo) {
        console.log(`Rule ${schedule.ruleId} not found, disabled or a demo rule, skipping schedule ${schedule.id}`);
        
        // Calculate next run to advance the schedule (but don't update lastRunAt)
        const cronExpr = schedule.cron || schedule.rrule;
        const nextRunAt = cronExpr ? this.calculateNextRun(
          cronExpr,
          schedule.timezone || 'America/New_York'
        ) : null;

        // Update nextRunAt to prevent perpetual reprocessing
        await this.storage.db
          .update(this.storage.schema.emailSchedules)
          .set({
            nextRunAt,
            updatedAt: new Date(),
          })
          .where(eq(this.storage.schema.emailSchedules.id, schedule.id));

        // Log the skip to audit trail
        await this.storage.db.insert(this.storage.schema.emailRuleAudits).values({
          ruleId: schedule.ruleId,
          eventKey: 'schedule_digest',
          input: {
            scheduleId: schedule.id,
            reason: rule ? 'Rule disabled' : 'Rule not found',
            nextRunAt: nextRunAt?.toISOString(),
          },
          decision: 'skipped',
          reason: rule ? `Rule ${schedule.ruleId} is disabled` : `Rule ${schedule.ruleId} not found`,
          metadata: {
            type: 'digest_schedule_skipped',
          },
        });

        return;
      }

      // Execute the digest send via email automation engine
      console.log(`Executing digest for rule: ${rule.name}`);
      
      let emailSent = false;
      let errorMessage: string | null = null;
      let digestResult: any = null;

      try {
        // Call email automation engine to process and send digest
        const { getAutomationEngine } = await import('../email/email-automation-engine');
        const engine = getAutomationEngine();
        
        digestResult = await engine.processDigestSend(
          rule.id,
          schedule.metadata,
          schedule.actionConfig as Record<string, unknown> | null,
        );
        
        if (digestResult.skipped) {
          // Held by the Send Email Window (quiet hours or the hourly limit);
          // not a failure, items stay pending for the next run.
          emailSent = digestResult.recipientCount > 0;
          console.log(`[Scheduler] ${digestResult.message}`);
        } else if (digestResult.success) {
          emailSent = true;
          console.log(`[Scheduler] Digest sent successfully: ${digestResult.recipientCount} recipients, ${digestResult.itemCount} items`);
        } else {
          errorMessage = digestResult.error || 'Digest processing failed';
          console.warn(`[Scheduler] Digest processing completed with issues: ${errorMessage}`);
        }
      } catch (emailError) {
        console.error(`Failed to send digest email:`, emailError);
        errorMessage = emailError instanceof Error ? emailError.message : 'Unknown email error';
      }

      // Calculate next run time
      const cronExpr = schedule.cron || schedule.rrule;
      if (!cronExpr) {
        throw new Error(`Schedule ${schedule.id} has no cron or rrule expression`);
      }

      const nextRunAt = this.calculateNextRun(
        cronExpr,
        schedule.timezone || 'America/New_York'
      );

      if (!nextRunAt) {
        throw new Error(`Failed to calculate next run for schedule ${schedule.id}. Expression: ${cronExpr}`);
      }

      // Update schedule with last run and next run
      await this.storage.db
        .update(this.storage.schema.emailSchedules)
        .set({
          lastRunAt: new Date(),
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(this.storage.schema.emailSchedules.id, schedule.id));

      console.log(`Schedule ${schedule.id} executed successfully. Next run: ${nextRunAt}`);

      // Held by the Send Email Window: logged as skipped, not failed.
      const heldMessage: string | null = digestResult?.skipped ? (digestResult.message ?? 'Skipped by the Send Email Window') : null;
      const runMessage = heldMessage
        ?? (emailSent
          ? `Digest sent to ${digestResult?.recipientCount || 0} recipients with ${digestResult?.itemCount || 0} items`
          : `Email send failed: ${errorMessage}`);

      // Log to audit trail based on email send result
      await this.storage.db.insert(this.storage.schema.emailRuleAudits).values({
        ruleId: rule.id,
        eventKey: 'schedule_digest',
        input: {
          scheduleId: schedule.id,
          cron: schedule.cron,
          timezone: schedule.timezone,
          executedAt: new Date().toISOString(),
        },
        decision: emailSent ? 'fired' : heldMessage ? 'skipped' : 'failed',
        reason: runMessage,
        metadata: {
          type: 'digest_schedule',
          scheduleName: `Schedule #${schedule.id}`,
          emailSent,
          itemCount: digestResult?.itemCount || 0,
          recipientCount: digestResult?.recipientCount || 0,
          nextRunAt: nextRunAt?.toISOString(),
        },
      });

      const digestCompletedAt = new Date();
      await this.storage.db.insert(this.storage.schema.automationRunLogs).values({
        scheduleId: schedule.id,
        actionType: 'email_digest',
        status: emailSent || heldMessage ? 'success' : 'failure',
        triggeredBy: 'scheduler',
        startedAt: digestStartedAt,
        completedAt: digestCompletedAt,
        durationMs: digestCompletedAt.getTime() - digestStartedAt.getTime(),
        message: runMessage,
        rawOutput: digestResult as any,
      });

      // Broadcast WebSocket update for schedule execution
      if (this.broadcaster) {
        this.broadcaster.broadcastEmailAutomationUpdate({
          type: 'email_automation_update',
          action: 'execution_created',
          targetType: 'email_rule_audit',
          targetId: schedule.id,
          userId: 'system',
          data: {
            scheduleId: schedule.id,
            ruleId: rule.id,
            ruleName: rule.name,
            nextRunAt: nextRunAt?.toISOString(),
            lastRunAt: new Date().toISOString(),
          },
        });
      }

    } catch (error) {
      console.error(`Failed to execute schedule ${schedule.id}:`, error);
      
      const digestErrorMsg = error instanceof Error ? error.message : 'Unknown error';
      const digestFailedAt = new Date();

      // Log failed execution
      await this.storage.db.insert(this.storage.schema.emailRuleAudits).values({
        ruleId: schedule.ruleId,
        eventKey: 'schedule_digest',
        input: {
          scheduleId: schedule.id,
          error: String(error),
        },
        decision: 'failed',
        reason: digestErrorMsg,
        metadata: {
          type: 'digest_schedule_failure',
        },
      });

      await this.storage.db.insert(this.storage.schema.automationRunLogs).values({
        scheduleId: schedule.id,
        actionType: 'email_digest',
        status: 'failure',
        triggeredBy: 'scheduler',
        startedAt: digestStartedAt,
        completedAt: digestFailedAt,
        durationMs: digestFailedAt.getTime() - digestStartedAt.getTime(),
        message: digestErrorMsg,
        rawOutput: { success: false, message: digestErrorMsg, error: String(error) } as any,
      });
    }
  }

  /**
   * Execute a non-email schedule via ScheduledActionService
   */
  private async executeNonEmailSchedule(schedule: any, actionType: string): Promise<void> {
    console.log(`[Scheduler] Executing non-email schedule ${schedule.id} (${actionType})`);

    const startedAt = new Date();

    try {
      const { scheduledActionService } = await import('./scheduled-action-service');
      const config = schedule.actionConfig || {};
      const result = await scheduledActionService.executeAction(actionType as any, { ...config }, schedule.id);

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      const cronExpr = schedule.cron || schedule.rrule;
      const nextRunAt = cronExpr ? this.calculateNextRun(
        cronExpr,
        schedule.timezone || 'America/New_York'
      ) : null;

      await this.storage.db
        .update(this.storage.schema.emailSchedules)
        .set({
          lastRunAt: new Date(),
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(this.storage.schema.emailSchedules.id, schedule.id));

      await this.storage.db.insert(this.storage.schema.automationRunLogs).values({
        scheduleId: schedule.id,
        actionType,
        status: result.success ? 'success' : 'failure',
        triggeredBy: 'scheduler',
        startedAt,
        completedAt,
        durationMs,
        message: result.message || null,
        rawOutput: result as any,
      });

      console.log(`[Scheduler] Non-email schedule ${schedule.id} (${actionType}) completed: ${result.message}. Next run: ${nextRunAt}`);

      if (this.broadcaster) {
        this.broadcaster.broadcastEmailAutomationUpdate({
          type: 'email_automation_update',
          action: 'execution_created',
          targetType: 'email_rule_audit' as const,
          targetId: schedule.id,
          userId: 'system',
          data: {
            scheduleId: schedule.id,
            actionType,
            result: result.success ? 'success' : 'failed',
            message: result.message,
            nextRunAt: nextRunAt?.toISOString(),
            lastRunAt: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error(`[Scheduler] Failed to execute non-email schedule ${schedule.id} (${actionType}):`, error);

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();
      const errorMessage = error instanceof Error ? error.message : String(error);

      const cronExpr = schedule.cron || schedule.rrule;
      const nextRunAt = cronExpr ? this.calculateNextRun(
        cronExpr,
        schedule.timezone || 'America/New_York'
      ) : null;

      await this.storage.db
        .update(this.storage.schema.emailSchedules)
        .set({
          lastRunAt: new Date(),
          nextRunAt,
          updatedAt: new Date(),
        })
        .where(eq(this.storage.schema.emailSchedules.id, schedule.id));

      await this.storage.db.insert(this.storage.schema.automationRunLogs).values({
        scheduleId: schedule.id,
        actionType,
        status: 'failure',
        triggeredBy: 'scheduler',
        startedAt,
        completedAt,
        durationMs,
        message: errorMessage,
        rawOutput: { success: false, message: errorMessage, error: String(error) } as any,
      });
    }
  }

  /**
   * Update a schedule's next run time (called when schedule is created/updated)
   */
  async updateScheduleNextRun(scheduleId: number): Promise<void> {
    try {
      const [schedule] = await this.storage.db
        .select()
        .from(this.storage.schema.emailSchedules)
        .where(eq(this.storage.schema.emailSchedules.id, scheduleId))
        .limit(1);

      if (!schedule) {
        console.error(`Schedule ${scheduleId} not found`);
        return;
      }

      const cronExpr = schedule.cron || schedule.rrule;
      if (!cronExpr) {
        console.error(`Schedule ${scheduleId} has no cron expression`);
        return;
      }

      const nextRunAt = this.calculateNextRun(
        cronExpr,
        schedule.timezone || 'America/New_York'
      );

      if (nextRunAt) {
        await this.storage.db
          .update(this.storage.schema.emailSchedules)
          .set({ nextRunAt, updatedAt: new Date() })
          .where(eq(this.storage.schema.emailSchedules.id, scheduleId));

        console.log(`Updated schedule ${scheduleId} next run to: ${nextRunAt}`);
      }
    } catch (error) {
      console.error(`Error updating schedule ${scheduleId} next run:`, error);
    }
  }
}
