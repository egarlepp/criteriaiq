import { eq, and, gte, inArray, sql } from 'drizzle-orm';
import { storage } from '../storage.js';
import {
  digestQuietHoursDecision,
  getSendWindowSettings,
  RATE_LIMIT_REASON,
  reserveEmailSendSlot,
  ruleEmailQuietHoursDecision,
} from './send-window.js';
import { getBroadcaster } from '../services/websocket-broadcaster.js';
import {
  DIGEST_LOOKBACK_DAYS,
  describeDigestItem,
  escapeHtml,
  groupDigestItems,
  actionTeamTargets,
  markDigestSent,
  resolveActionRecipients,
  ITEM_ASSIGNEE,
} from './digest-utils.js';
import { hasTeamTargets } from '@shared/teams';
import { mapEmailDecision, parseMapEventKey } from './map-email-preferences.js';
import { getCurrentFiscalYear, getCurrentFiscalQuarter } from '../../shared/fiscal-utils.js';
import { salesforceSyncService } from '../salesforce/salesforce-sync-service.js';
import { salesforceLinkageService } from '../salesforce/salesforce-linkage-service.js';

// Salesforce Update Action Params interface
export interface SalesforceUpdateParams {
  targetObject: string; // e.g. 'Opportunity', 'Account'
  fieldMap: Record<string, string | number | boolean>; // Key/Value pairs to update
}

export interface TriggerContext {
  triggerKey: string;
  projectId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
  /**
   * Narrows the one-hour duplicate check to one item (e.g. one MAP task),
   * so different items in the same project each fire the rule.
   */
  dedupKey?: string;
}

export interface EvaluationResult {
  ruleId: number;
  ruleName: string;
  priority: number;
  matched: boolean;
  conditionsEvaluated: ConditionResult[];
  actionsToExecute: ActionToExecute[];
  shouldContinue: boolean;
  reason?: string;
}

export interface ConditionResult {
  id: number;
  kind: string;
  operator: string;
  expectedValue: any;
  actualValue: any;
  passed: boolean;
}

export interface ActionToExecute {
  id: number;
  action: string;
  params: any;
  orderIndex: number;
}

export interface ExecutionResult {
  actionId: number;
  action: string;
  status: 'executed' | 'skipped' | 'delayed' | 'suppressed' | 'failed';
  reason?: string;
  executedAt?: Date;
  error?: string;
  message?: string;
  /** schedule_digest: who the event is queued for (see digest-utils.ts). */
  digestRecipientIds?: string[];
}

export interface ExecutionContext {
  ruleId: number;
  ruleName: string;
  projectId?: string;
  userId?: string;
  triggerKey: string;
  metadata?: Record<string, any>;
  dedupKey?: string;
}

type Storage = typeof storage;

export class EmailAutomationEngine {
  constructor(private storage: Storage) {}

  /**
   * Send one template to one user outside any rule, for built-in jobs on
   * Configuration › Scheduler (the Welcome email). Same checks as a rule's
   * Send Email action: email preferences, the Send Email Window, test mode
   * and the hourly limit.
   */
  async sendTemplateToUser(input: {
    templateKey: string;
    userId: string;
    triggerKey: string;
    jobName: string;
    metadata?: Record<string, any>;
  }): Promise<ExecutionResult> {
    return this.executeSendEmail(
      {
        id: 0,
        action: 'send_email',
        params: { recipientId: input.userId, templateKey: input.templateKey, customData: {} },
        orderIndex: 0,
      },
      {
        ruleId: 0,
        ruleName: input.jobName,
        triggerKey: input.triggerKey,
        userId: input.userId,
        metadata: input.metadata,
      },
      new Date(),
    );
  }

  async evaluateTrigger(context: TriggerContext): Promise<EvaluationResult[]> {
    const { triggerKey, projectId, userId, metadata = {}, timestamp = new Date(), dedupKey } = context;

    // Find all enabled rules that match this trigger key. Demo Mode rules
    // never run (is_demo, migration 135).
    const rules = await this.storage.db
      .select()
      .from(this.storage.schema.emailRules)
      .where(
        and(
          eq(this.storage.schema.emailRules.enabled, true),
          eq(this.storage.schema.emailRules.isDemo, false),
          sql`${this.storage.schema.emailRules.triggerKeys}::jsonb @> ${JSON.stringify([triggerKey])}::jsonb`
        )
      )
      .orderBy(this.storage.schema.emailRules.priority);

    if (rules.length === 0) {
      return [];
    }

    const results: EvaluationResult[] = [];
    let shouldStopEvaluation = false;

    for (const rule of rules) {
      if (shouldStopEvaluation) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority || 100,
          matched: false,
          conditionsEvaluated: [],
          actionsToExecute: [],
          shouldContinue: false,
          reason: 'Stopped by higher priority rule',
        });
        continue;
      }

      // Check if this rule was recently triggered for deduplication. Now
      // runs for project-less triggers too (user.registration_completed,
      // user.first_login, etc.) — those used to fall through the gate and
      // could re-fire on every signup. The dedup query falls back to
      // "no other audit with the same rule/event in the last hour" when
      // no projectId is in context.
      const isDuplicate = await this.checkDeduplication(rule.id, projectId ?? null, triggerKey, dedupKey);
      if (isDuplicate) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority || 100,
          matched: false,
          conditionsEvaluated: [],
          actionsToExecute: [],
          shouldContinue: true,
          reason: 'Deduplicated - recently triggered',
        });
        continue;
      }

      // Get conditions and actions for this rule
      const conditions = await this.storage.db
        .select()
        .from(this.storage.schema.emailRuleConditions)
        .where(eq(this.storage.schema.emailRuleConditions.ruleId, rule.id))
        .orderBy(this.storage.schema.emailRuleConditions.orderIndex);

      const actions = await this.storage.db
        .select()
        .from(this.storage.schema.emailRuleActions)
        .where(eq(this.storage.schema.emailRuleActions.ruleId, rule.id))
        .orderBy(this.storage.schema.emailRuleActions.orderIndex);

      // Evaluate all conditions
      const conditionResults = await Promise.all(
        conditions.map((condition: any) => this.evaluateCondition(condition, { projectId, userId, metadata, timestamp }))
      );

      const allConditionsPassed = conditionResults.length === 0 || conditionResults.every((r: ConditionResult) => r.passed);

      if (allConditionsPassed) {
        // Rule matched - prepare actions to execute
        const actionsToExecute = actions.map((action: any) => ({
          id: action.id,
          action: action.action,
          params: action.params,
          orderIndex: action.orderIndex || 0,
        }));

        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority || 100,
          matched: true,
          conditionsEvaluated: conditionResults,
          actionsToExecute,
          shouldContinue: rule.continueOnMatch || false,
          reason: 'All conditions passed',
        });

        // (Audit row is written once per rule firing in executeActions
        // below, after the actions have actually run. We used to write a
        // separate audit row here at match-time too — but it duplicated
        // the row written post-execute and didn't carry the action
        // results the UI cares about.)

        // Stop evaluation if continueOnMatch is false
        if (!rule.continueOnMatch) {
          shouldStopEvaluation = true;
        }
      } else {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority || 100,
          matched: false,
          conditionsEvaluated: conditionResults,
          actionsToExecute: [],
          shouldContinue: true,
          reason: 'Conditions not met',
        });
      }
    }

    return results;
  }

  private async evaluateCondition(
    condition: any,
    context: {
      projectId?: string;
      userId?: string;
      metadata: Record<string, any>;
      timestamp: Date;
    }
  ): Promise<ConditionResult> {
    const { kind, operator, value: expectedValue } = condition;
    const { projectId, userId, metadata, timestamp } = context;

    let actualValue: any;

    // Determine actual value based on condition kind
    switch (kind) {
      case 'project_field':
        actualValue = await this.getProjectFieldValue(projectId, expectedValue.field);
        break;
      
      case 'map_status':
        actualValue = await this.getMapStatusValue(projectId, expectedValue.entityType, expectedValue.entityId);
        break;
      
      case 'user_role':
        actualValue = await this.getUserRole(userId, projectId);
        break;
      
      case 'timezone':
        actualValue = await this.getTimezone(userId);
        break;
      
      case 'business_hours':
        actualValue = this.isBusinessHours(timestamp, expectedValue.timezone || 'America/New_York');
        break;
      
      case 'property_check':
        actualValue = metadata[expectedValue.property];
        break;
      
      default:
        actualValue = metadata[kind];
    }

    // Evaluate based on operator
    const passed = this.evaluateOperator(operator, actualValue, expectedValue.value);

    return {
      id: condition.id,
      kind,
      operator,
      expectedValue: expectedValue.value,
      actualValue,
      passed,
    };
  }

  private evaluateOperator(operator: string, actualValue: any, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return actualValue === expectedValue;
      
      case 'not_equals':
        return actualValue !== expectedValue;
      
      case 'contains':
        if (typeof actualValue === 'string') {
          return actualValue.includes(String(expectedValue));
        }
        if (Array.isArray(actualValue)) {
          return actualValue.includes(expectedValue);
        }
        return false;
      
      case 'not_contains':
        if (typeof actualValue === 'string') {
          return !actualValue.includes(String(expectedValue));
        }
        if (Array.isArray(actualValue)) {
          return !actualValue.includes(expectedValue);
        }
        return true;
      
      case 'greater_than':
        return Number(actualValue) > Number(expectedValue);
      
      case 'less_than':
        return Number(actualValue) < Number(expectedValue);
      
      case 'greater_than_or_equal':
        return Number(actualValue) >= Number(expectedValue);
      
      case 'less_than_or_equal':
        return Number(actualValue) <= Number(expectedValue);
      
      case 'in':
        if (Array.isArray(expectedValue)) {
          return expectedValue.includes(actualValue);
        }
        return false;
      
      case 'not_in':
        if (Array.isArray(expectedValue)) {
          return !expectedValue.includes(actualValue);
        }
        return true;
      
      case 'between':
        if (Array.isArray(expectedValue) && expectedValue.length === 2) {
          const numValue = Number(actualValue);
          return numValue >= Number(expectedValue[0]) && numValue <= Number(expectedValue[1]);
        }
        return false;
      
      case 'starts_with':
        return typeof actualValue === 'string' && actualValue.startsWith(String(expectedValue));
      
      case 'ends_with':
        return typeof actualValue === 'string' && actualValue.endsWith(String(expectedValue));
      
      case 'is_empty':
        return actualValue === null || actualValue === undefined || actualValue === '';
      
      case 'is_not_empty':
        return actualValue !== null && actualValue !== undefined && actualValue !== '';
      
      default:
        return false;
    }
  }

  private async getProjectFieldValue(projectId: string | undefined, field: string): Promise<any> {
    if (!projectId) return null;

    const [project] = await this.storage.db
      .select()
      .from(this.storage.schema.projects)
      .where(eq(this.storage.schema.projects.id, projectId as any))
      .limit(1);

    if (!project) return null;

    return (project as any)[field];
  }

  private async getMapStatusValue(
    projectId: string | undefined,
    entityType: 'phase' | 'step' | 'task',
    entityId: number
  ): Promise<string | null> {
    if (!projectId) return null;

    let status = null;

    switch (entityType) {
      case 'phase':
        const [phase] = await this.storage.db
          .select({ status: this.storage.schema.mapPhases.status })
          .from(this.storage.schema.mapPhases)
          .where(
            and(
              eq(this.storage.schema.mapPhases.projectId, projectId as any),
              eq(this.storage.schema.mapPhases.id, entityId)
            )
          )
          .limit(1);
        status = phase?.status;
        break;
      
      case 'step':
        const [step] = await this.storage.db
          .select({ status: this.storage.schema.mapSteps.status, phaseId: this.storage.schema.mapSteps.phaseId })
          .from(this.storage.schema.mapSteps)
          .leftJoin(
            this.storage.schema.mapPhases,
            eq(this.storage.schema.mapSteps.phaseId, this.storage.schema.mapPhases.id)
          )
          .where(
            and(
              eq(this.storage.schema.mapSteps.id, entityId),
              eq(this.storage.schema.mapPhases.projectId, projectId as any)
            )
          )
          .limit(1);
        status = step?.status;
        break;
      
      case 'task':
        const [task] = await this.storage.db
          .select({ status: this.storage.schema.mapTasks.status })
          .from(this.storage.schema.mapTasks)
          .leftJoin(
            this.storage.schema.mapSteps,
            eq(this.storage.schema.mapTasks.stepId, this.storage.schema.mapSteps.id)
          )
          .leftJoin(
            this.storage.schema.mapPhases,
            eq(this.storage.schema.mapSteps.phaseId, this.storage.schema.mapPhases.id)
          )
          .where(
            and(
              eq(this.storage.schema.mapTasks.id, entityId),
              eq(this.storage.schema.mapPhases.projectId, projectId as any)
            )
          )
          .limit(1);
        status = task?.status;
        break;
    }

    return status;
  }

  private async getUserRole(userId: string | undefined, projectId: string | undefined): Promise<string | null> {
    if (!userId) return null;

    if (projectId) {
      const [project] = await this.storage.db
        .select()
        .from(this.storage.schema.projects)
        .where(eq(this.storage.schema.projects.id, projectId as any))
        .limit(1);

      if (!project) return null;

      if (project.primaryEngineerId === userId) return 'primary_engineer';
      if (project.specialistEngineerId === userId) return 'specialist_engineer';
      
      const supportingEngineers = project.supportingEngineers as string[] || [];
      if (supportingEngineers.includes(userId)) return 'supporting_engineer';
      
      const additionalAccess = project.additionalAccess as string[] || [];
      if (additionalAccess.includes(userId)) return 'additional_access';
    }

    const [user] = await this.storage.db
      .select({ role: this.storage.schema.users.role })
      .from(this.storage.schema.users)
      .where(eq(this.storage.schema.users.id, userId))
      .limit(1);

    return user?.role || null;
  }

  private async getTimezone(userId: string | undefined): Promise<string> {
    if (!userId) return 'America/New_York';

    const [prefs] = await this.storage.db
      .select({ timezone: (this.storage.schema.userEmailPreferences as any).timezone })
      .from(this.storage.schema.userEmailPreferences)
      .where(eq(this.storage.schema.userEmailPreferences.userId, userId))
      .limit(1);

    return prefs?.timezone || 'America/New_York';
  }

  private isBusinessHours(timestamp: Date, timezone: string): boolean {
    const hour = new Date(timestamp.toLocaleString('en-US', { timeZone: timezone })).getHours();
    return hour >= 9 && hour < 17;
  }

  // Dedup check — has this (rule, eventKey, projectId-if-any) fired in the last hour?
  // Switched from the legacy snake-case columns the code used to reference
  // (`triggered_at`, `trigger_key`, `project_id`) to the real schema columns
  // (`created_at`, `event_key`, plus `input->>projectId` for the project-scoped
  // case). The old `as any` casts pointed at columns that don't exist, so this
  // query silently returned every audit as "not duplicate" before — moot in
  // practice because the corresponding write was also broken and produced no
  // rows. Now that the write actually works, the dedup needs to too.
  private async checkDeduplication(
    ruleId: number,
    projectId: string | null,
    eventKey: string,
    dedupKey?: string,
  ): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const projectFilter = projectId
      ? sql`AND ${this.storage.schema.emailRuleAudits.input}->>'projectId' = ${projectId}`
      : sql`AND (${this.storage.schema.emailRuleAudits.input}->>'projectId' IS NULL)`;

    const result = await this.storage.db.execute(sql`
      SELECT 1 FROM email_rule_audits
      WHERE rule_id = ${ruleId}
        AND event_key = ${eventKey}
        AND decision = 'matched'
        AND created_at > ${oneHourAgo.toISOString()}
        ${projectFilter}
        ${dedupKey ? sql`AND ${this.storage.schema.emailRuleAudits.input}->>'dedupKey' = ${dedupKey}` : sql``}
      LIMIT 1
    `);

    return (result.rows?.length ?? 0) > 0;
  }

  // Write one audit row per rule firing. Schema reference:
  //   rule_id            : the rule that fired
  //   event_key          : the trigger key (e.g. 'user.registration_completed')
  //   input              : trigger context (userId/projectId/metadata) so the
  //                        firing can be forensically reconstructed
  //   decision           : 'matched' | 'no_match' | 'duplicate' | 'error'
  //   reason             : short human text
  //   email_log_id       : link to email_logs row if a send_email action ran
  //                        and produced a deliverable record (null otherwise)
  //   execution_time_ms  : total wall time for the eval+execute of this rule
  //   metadata           : { conditions, actions, executionResults } — full
  //                        per-action results so the Execution Feed UI can
  //                        render the matched/skipped/failed action breakdown
  //
  // Prior version inserted `projectId`/`triggerKey`/`triggeredAt`/
  // `conditionsSnapshot`/`actionsSnapshot` — none of which exist in the
  // schema. Because the schema's `event_key`/`input`/`decision` are
  // `NOT NULL` with no defaults, every insert would have thrown — silently
  // swallowed by the `void evaluateAndExecute(...).catch(...)` call sites.
  // Net effect: `email_rule_audits` had been permanently empty in prod,
  // which is why the Automation Feed UI showed 0 / --% even though rules
  // were firing and emails were going out.
  private async recordAudit(params: {
    ruleId: number;
    eventKey: string;
    input: any;
    decision: 'matched' | 'no_match' | 'duplicate' | 'error';
    reason: string;
    metadata?: any;
    emailLogId?: number | null;
    executionTimeMs?: number | null;
    userId?: string;
  }): Promise<void> {
    try {
      const [auditRecord] = await this.storage.db
        .insert(this.storage.schema.emailRuleAudits)
        .values({
          ruleId: params.ruleId,
          eventKey: params.eventKey,
          input: params.input ?? {},
          decision: params.decision,
          reason: params.reason,
          emailLogId: params.emailLogId ?? null,
          executionTimeMs: params.executionTimeMs ?? null,
          metadata: params.metadata ?? null,
        })
        .returning();

      const broadcaster = getBroadcaster();
      if (broadcaster && auditRecord) {
        broadcaster.broadcastEmailAutomationUpdate({
          type: 'email_automation_update',
          action: 'execution_created',
          targetType: 'email_rule_audit',
          targetId: auditRecord.id,
          userId: params.userId ?? 'system',
          data: {
            ruleId: params.ruleId,
            eventKey: params.eventKey,
            decision: params.decision,
            createdAt: auditRecord.createdAt,
          },
        });
      }
    } catch (err) {
      console.error('[email-automation] failed to write rule audit:', err);
    }
  }

  // ============================================================================
  // ACTION EXECUTION SYSTEM
  // ============================================================================

  async executeActions(
    context: ExecutionContext,
    actions: ActionToExecute[]
  ): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const timestamp = new Date();
    const startMs = Date.now();

    // Sort actions by orderIndex
    const sortedActions = [...actions].sort((a, b) => a.orderIndex - b.orderIndex);

    for (const action of sortedActions) {
      try {
        const result = await this.executeAction(action, context, timestamp);
        results.push(result);

        // If action failed and is critical, stop execution
        if (result.status === 'failed' && action.params?.critical) {
          break;
        }
      } catch (error) {
        console.error(`Failed to execute action ${action.id}:`, error);
        results.push({
          actionId: action.id,
          action: action.action,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Record execution in audit trail. Runs for EVERY execution regardless
    // of whether the trigger carried a `projectId` — the prior `if (projectId)`
    // gate excluded user-lifecycle triggers (registration, first login, etc.)
    // from the Execution Feed and KPI cards even though those rules were
    // firing and delivering emails.
    const anyFailed = results.some(r => r.status === 'failed');
    const anyExecuted = results.some(r => r.status === 'executed');
    const decision: 'matched' | 'error' = anyFailed && !anyExecuted ? 'error' : 'matched';
    const emailLogId = results
      .map(r => (r as any).emailLogId)
      .find((id: unknown): id is number => typeof id === 'number') ?? null;

    await this.recordAudit({
      ruleId: context.ruleId,
      eventKey: context.triggerKey,
      input: {
        projectId: context.projectId ?? null,
        userId: context.userId ?? null,
        metadata: context.metadata ?? {},
        ...(context.dedupKey ? { dedupKey: context.dedupKey } : {}),
      },
      decision,
      reason: anyFailed
        ? `Rule matched; ${results.filter(r => r.status === 'failed').length} action(s) failed`
        : 'Rule matched and executed',
      emailLogId,
      executionTimeMs: Date.now() - startMs,
      metadata: {
        actions: sortedActions.map(a => ({ id: a.id, action: a.action, orderIndex: a.orderIndex })),
        executionResults: results,
      },
      userId: context.userId,
    });

    return results;
  }

  private async executeAction(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { action: actionType, params } = action;

    switch (actionType) {
      case 'send_email':
        return await this.executeSendEmailToRecipients(action, context, timestamp);
      
      case 'delay':
        return await this.executeDelay(action, context, timestamp);
      
      case 'schedule_digest':
        return await this.executeScheduleDigest(action, context, timestamp);
      
      case 'suppress_for':
        return await this.executeSuppressFor(action, context, timestamp);
      
      case 'log_only':
        return this.executeLogOnly(action, context, timestamp);
      
      case 'trigger_webhook':
        return await this.executeWebhook(action, context, timestamp);
      
      case 'update_salesforce':
        return await this.executeSalesforceUpdate(action, context, timestamp);

      case 'update_project_status':
        return await this.executeUpdateProjectStatus(action, context, timestamp);

      case 'update_risk_level':
        return await this.executeUpdateRiskLevel(action, context, timestamp);

      case 'assign_user':
        return await this.executeAssignUser(action, context, timestamp);

      case 'create_map_task':
        return await this.executeCreateMapTask(action, context, timestamp);

      case 'update_map_status':
        return await this.executeUpdateMapStatus(action, context, timestamp);

      case 'run_ai_assessment':
        return await this.executeRunAiAssessment(action, context, timestamp);

      case 'create_notification':
        return await this.executeCreateNotification(action, context, timestamp);

      case 'celebration': {
        const broadcaster = getBroadcaster();
        if (broadcaster) {
          broadcaster.broadcastCelebration(
            params?.style || 'confetti_burst',
            params?.config || {}
          );
        }
        return {
          actionId: action.id,
          action: 'celebration',
          status: 'executed',
          message: `Celebration effect '${params?.style || 'confetti_burst'}' broadcast to all users`,
        };
      }

      default:
        return {
          actionId: action.id,
          action: actionType,
          status: 'failed',
          error: `Unknown action type: ${actionType}`,
        };
    }
  }

  private async executeSendEmail(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { templateKey, customData } = params;

    // "trigger_user" is a sentinel meaning "send to the user who fired the
    // trigger" — resolved from context.userId at runtime. This lets seeded
    // system rules address the registering / logging-in user without
    // needing a hardcoded ID stored in the rule params.
    const recipientId: string =
      params.recipientId === 'trigger_user'
        ? (context.userId ?? '')
        : params.recipientId === ITEM_ASSIGNEE
          ? assigneeOf(context)
          : (params.recipientId ?? '');

    try {
      // Get recipient email
      const [recipient] = await this.storage.db
        .select({ email: this.storage.schema.users.email, firstName: this.storage.schema.users.firstName })
        .from(this.storage.schema.users)
        .where(eq(this.storage.schema.users.id, recipientId))
        .limit(1);

      if (!recipient) {
        return {
          actionId: action.id,
          action: 'send_email',
          status: 'failed',
          error: 'Recipient not found',
        };
      }

      // Get email template. The Drizzle table field is `templateKey` (which
      // maps to the `template_key` column); the prior `(emailTemplates as
      // any).key` reference resolved to undefined and produced a malformed
      // `WHERE = $1` SQL that threw on every send_email action — the root
      // cause of "rule matched; 1 action(s) failed" on every Welcome Email
      // firing.
      const [template] = await this.storage.db
        .select()
        .from(this.storage.schema.emailTemplates)
        .where(eq(this.storage.schema.emailTemplates.templateKey, templateKey))
        .limit(1);

      if (!template) {
        return {
          actionId: action.id,
          action: 'send_email',
          status: 'failed',
          error: `Template not found: ${templateKey}`,
        };
      }

      // Recipient's choices: suppression windows, "Do Not Send Any Emails"
      // (sign-in emails excepted) and their MAP email settings.
      const canSend = await this.canSendEmail(recipientId, context, timestamp, template.category);
      if (!canSend.allowed) {
        return {
          actionId: action.id,
          action: 'send_email',
          status: 'skipped',
          reason: canSend.reason,
        };
      }

      // Send Email Window: quiet hours hold rule emails only when the
      // admin set them to cover all automated email. Sign-in emails
      // (category "Authentication") are never held.
      const quiet = ruleEmailQuietHoursDecision(await getSendWindowSettings(), template.category, timestamp);
      if (quiet.held) {
        return {
          actionId: action.id,
          action: 'send_email',
          status: 'skipped',
          reason: quiet.reason,
        };
      }

      // Check for test mode and reroute if enabled
      const config = await this.storage.getEmailAutomationConfig();

      const testModeEnabled = config?.testModeEnabled || false;
      const testEmailAddresses = (config?.testEmailAddresses as string[]) || [];
      const originalRecipient = recipient.email;

      // Determine final recipient(s) based on test mode
      let finalRecipients: string[] = [];
      let testModeActive = false;

      if (testModeEnabled && testEmailAddresses.length > 0) {
        finalRecipients = testEmailAddresses;
        testModeActive = true;
      } else {
        finalRecipients = [recipient.email as string];
      }

      // Merge template data with custom data and context metadata
      const templateData: Record<string, any> = {
        ...customData,
        ...context.metadata,
        recipientName: recipient.firstName,
        recipientEmail: recipient.email,
      };

      // Inject fiscal date variables from system fiscal calendar config
      try {
        // systemSettings.value is jsonb — Drizzle returns it already parsed;
        // do NOT JSON.parse() it (throws "[object Object]").
        const fiscalConfigSetting = await storage.getSystemSetting("fiscal_config");
        const fiscalConfig = (fiscalConfigSetting?.value as any) ??
          { displayMode: "calendar", fiscalYearStartMonth: 1, yearNamingOffset: 0 };
        templateData.fiscalYear = getCurrentFiscalYear(fiscalConfig).toString();
        templateData.fiscalQuarter = `Q${getCurrentFiscalQuarter(fiscalConfig)}`;
        templateData.currentDate = new Date().toLocaleDateString();
        templateData.currentYear = new Date().getFullYear().toString();
        templateData.currentMonth = new Date().toLocaleString('default', { month: 'long' });
      } catch {
        // Non-fatal: leave fiscal variables unresolved if config fetch fails
      }

      // Replace placeholders in subject and body. The schema fields are
      // `emailContent` (newer richer template body), `htmlContent` (legacy
      // body), and `textContent` (plain-text alt) — the prior code referenced
      // `(template as any).htmlBody` / `.textBody`, fields that don't exist on
      // the email_templates table. The result: `replacePlaceholders(undefined, …)`
      // threw "Cannot read properties of undefined (reading 'replace')" and
      // the send_email action failed before ever talking to SMTP.
      let subject = this.replacePlaceholders(template.subject || "", templateData);
      const htmlSource = (template as any).emailContent || (template as any).htmlContent || "";
      const htmlBody = this.replacePlaceholders(htmlSource, templateData);
      const textSource = (template as any).textContent;
      const textBody = textSource ? this.replacePlaceholders(textSource, templateData) : undefined;

      // Add test mode indicator to subject if active
      if (testModeActive) {
        subject = `[TEST MODE - Original: ${originalRecipient}] ${subject}`;
      }

      // Import email service and send email
      const { sendEmail } = await import('./email.js');
      
      // Convert projectId from string to number for email service
      const projectIdNum = context.projectId ? parseInt(context.projectId, 10) : undefined;

      // Send to all test recipients (or single real recipient). Each email
      // takes one slot of the hourly limit; over it, the rest are skipped.
      let sentCount = 0;
      for (const recipientEmail of finalRecipients) {
        if (!(await reserveEmailSendSlot(template.category))) break;
        sentCount++;
        await sendEmail({
          to: recipientEmail,
          from: 'noreply@criteriaiq.com',
          subject,
          html: htmlBody,
          text: textBody,
          emailType: template.category,
          userId: recipientId,
          projectId: projectIdNum,
        });
      }

      if (sentCount === 0) {
        return {
          actionId: action.id,
          action: 'send_email',
          status: 'skipped',
          reason: RATE_LIMIT_REASON,
        };
      }

      return {
        actionId: action.id,
        action: 'send_email',
        status: 'executed',
        executedAt: timestamp,
        reason: sentCount < finalRecipients.length
          ? `${RATE_LIMIT_REASON} after ${sentCount} of ${finalRecipients.length} emails`
          : testModeActive 
          ? `Test mode: Rerouted from ${originalRecipient} to ${finalRecipients.join(', ')}` 
          : undefined,
      };
    } catch (error) {
      return {
        actionId: action.id,
        action: 'send_email',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  private replacePlaceholders(text: string, data: Record<string, any>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? String(data[key]) : match;
    });
  }

  private async executeDelay(
    action: ActionToExecute,
    _context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    // Delayed actions have no runner yet. The previous version inserted an
    // email_schedules row with columns that do not exist, which left a
    // blank, never-running "email digest" schedule in Configuration ›
    // Scheduler on every run (cleaned up by migration 088). Record the
    // action as skipped instead so the run log says what happened.
    return {
      actionId: action.id,
      action: 'delay',
      status: 'skipped',
      reason: 'Delay actions are not supported yet; nothing was scheduled',
      executedAt: timestamp,
    };
  }

  /**
   * People an action sends to: the chosen users plus everyone on the chosen
   * teams and subteams right now. The fallback (the user who triggered the
   * rule) applies only when neither people nor teams are chosen, so a team
   * that is empty today sends to nobody rather than to the trigger user.
   */
  private async actionRecipients(
    params: Record<string, unknown> | null | undefined,
    triggerUserId: string | undefined,
    fallback: 'trigger_user' | 'none',
    assigneeId?: string | null,
  ): Promise<string[]> {
    const teamTargets = actionTeamTargets(params);
    const withTeams = hasTeamTargets(teamTargets);
    const direct = resolveActionRecipients(params, triggerUserId, withTeams ? 'none' : fallback, assigneeId);
    if (!withTeams) return direct;
    const fromTeams = await this.storage.resolveTeamRecipientIds(teamTargets);
    return [...new Set([...direct, ...fromTeams])];
  }

  /**
   * Send Email to each recipient of the action. The rule editor saves a
   * list (recipientUserIds); older and seeded rules use one recipientId.
   */
  private async executeSendEmailToRecipients(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const recipients = await this.actionRecipients(action.params, context.userId, 'none', assigneeOf(context));
    if (recipients.length <= 1) {
      return this.executeSendEmail(
        { ...action, params: { ...action.params, recipientUserIds: undefined, recipientTeamIds: undefined, recipientSubteamIds: undefined, recipientId: recipients[0] ?? '' } },
        context,
        timestamp,
      );
    }

    const results: ExecutionResult[] = [];
    for (const recipientId of recipients) {
      results.push(
        await this.executeSendEmail(
          { ...action, params: { ...action.params, recipientUserIds: undefined, recipientTeamIds: undefined, recipientSubteamIds: undefined, recipientId } },
          context,
          timestamp,
        ),
      );
    }
    const executed = results.filter(r => r.status === 'executed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const notes = [...new Set(
      results
        .filter(r => r.status !== 'executed')
        .map(r => r.error || r.reason)
        .filter((note): note is string => Boolean(note)),
    )];
    return {
      actionId: action.id,
      action: 'send_email',
      status: executed > 0 ? 'executed' : failed === results.length ? 'failed' : 'skipped',
      message: `Sent to ${executed} of ${results.length} recipients`,
      ...(notes.length ? { reason: notes.join('; ') } : {}),
      executedAt: timestamp,
    };
  }

  /**
   * Queue this event for the rule's next digest. Nothing is stored here:
   * the rule's audit row (written by executeActions) carries the
   * recipients, and processDigestSend reads it when the rule's
   * email_digest schedule runs. With no recipients chosen, the user who
   * triggered the rule gets it.
   */
  private async executeScheduleDigest(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const resolved = await this.actionRecipients(action.params, context.userId, 'trigger_user', assigneeOf(context));
    const recipients: string[] = [];
    for (const id of resolved) {
      if ((await this.mapEmailAllowed(id, context)).allowed) recipients.push(id);
    }
    if (resolved.length > 0 && recipients.length === 0) {
      return {
        actionId: action.id,
        action: 'schedule_digest',
        status: 'skipped',
        reason: 'Every recipient turned off emails for this MAP event',
        executedAt: timestamp,
      };
    }
    if (recipients.length === 0) {
      return {
        actionId: action.id,
        action: 'schedule_digest',
        status: 'failed',
        error: 'No digest recipient: choose recipients, or trigger the rule with a user',
        executedAt: timestamp,
      };
    }

    return {
      actionId: action.id,
      action: 'schedule_digest',
      status: 'delayed',
      reason: `Queued for the next digest (${recipients.length} recipient${recipients.length === 1 ? '' : 's'})`,
      digestRecipientIds: recipients,
      executedAt: timestamp,
    };
  }

  private async executeSuppressFor(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { durationMinutes, scope, recipientId } = params;

    const suppressUntil = new Date(timestamp.getTime() + durationMinutes * 60 * 1000);

    // The suppression record is the per-action ExecutionResult we return below
    // — `executeActions` writes the parent audit row (with this result inside
    // `metadata.executionResults`), and `checkActiveSuppression` reads the
    // suppression payload back out of that same metadata path. The previous
    // implementation here wrote a SECOND audit row with non-existent columns
    // (`projectId`, `triggerKey`, `triggeredAt`, `actionsSnapshot`), which
    // threw and aborted the whole suppress_for action; downstream code paths
    // that depended on the suppression being recorded were silently broken.
    return {
      actionId: action.id,
      action: 'suppress_for',
      status: 'executed',
      // `status: 'executed'` (not 'suppressed') so the audit-side query
      // can find this row via the same standard predicate the UI uses
      // for executed actions; the suppression semantics are recorded in
      // the result payload below.
      reason: `Suppressed for ${durationMinutes} minutes (scope: ${scope})`,
      executedAt: timestamp,
      // Suppression payload — read back by checkActiveSuppression
      suppressUntil,
      scope,
      recipientId: recipientId || context.userId,
      originalTriggerKey: context.triggerKey,
    } as any;
  }

  private executeLogOnly(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): ExecutionResult {
    console.log('[Email Automation - Log Only]', {
      ruleId: context.ruleId,
      ruleName: context.ruleName,
      triggerKey: context.triggerKey,
      action,
      timestamp,
    });

    return {
      actionId: action.id,
      action: 'log_only',
      status: 'executed',
      reason: 'Logged to console',
      executedAt: timestamp,
    };
  }

  private async executeWebhook(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { webhookId } = params;

    if (!webhookId) {
      return {
        actionId: action.id,
        action: 'trigger_webhook',
        status: 'failed',
        error: 'Webhook ID not specified',
      };
    }

    try {
      const { webhookService } = await import('../webhooks/webhook-service');
      
      const result = await webhookService.triggerWebhook(webhookId, {
        triggerKey: context.triggerKey,
        projectId: context.projectId ? parseInt(context.projectId) : undefined,
        ruleId: context.ruleId,
        metadata: context.metadata,
        timestamp,
      });

      if (result.success) {
        return {
          actionId: action.id,
          action: 'trigger_webhook',
          status: 'executed',
          reason: `Webhook delivered successfully (status: ${result.statusCode})`,
          executedAt: timestamp,
        };
      } else {
        return {
          actionId: action.id,
          action: 'trigger_webhook',
          status: 'failed',
          error: result.errorMessage || `Webhook delivery failed after ${result.attemptNumber} attempt(s)`,
        };
      }
    } catch (error) {
      console.error('[Workflow Automation] Webhook execution error:', error);
      return {
        actionId: action.id,
        action: 'trigger_webhook',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown webhook error',
      };
    }
  }

  // ============================================================================
  // SALESFORCE UPDATE ACTION
  // ============================================================================

  private async executeSalesforceUpdate(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { targetObject, fieldMap } = params as SalesforceUpdateParams;

    // Validate required params
    if (!targetObject) {
      return {
        actionId: action.id,
        action: 'update_salesforce',
        status: 'failed',
        error: 'Target Salesforce object not specified',
      };
    }

    if (!fieldMap || Object.keys(fieldMap).length === 0) {
      return {
        actionId: action.id,
        action: 'update_salesforce',
        status: 'failed',
        error: 'No fields specified to update',
      };
    }

    // Validate user context - must have userId to make SF API calls
    if (!context.userId) {
      return {
        actionId: action.id,
        action: 'update_salesforce',
        status: 'failed',
        error: 'User context required for Salesforce updates',
      };
    }

    // Determine CQI entity type from targetObject for linkage lookup
    const entityTypeMap: Record<string, 'project' | 'customer' | 'user'> = {
      'Opportunity': 'project',
      'Account': 'customer',
      'Contact': 'customer',
      'Lead': 'customer',
      'Task': 'project',
    };
    const cqiEntityType = entityTypeMap[targetObject] || 'project';

    // Get the record ID from context (projectId for projects)
    const projectId = context.projectId;
    if (!projectId) {
      return {
        actionId: action.id,
        action: 'update_salesforce',
        status: 'failed',
        error: 'No CriteriaIQ record ID in context for Salesforce linkage lookup',
      };
    }
    // Convert to string for linkage service (accepts string IDs)
    const cqiRecordId = String(projectId);

    try {
      // Step 1: Look up Salesforce record via linkage service
      const link = await salesforceLinkageService.getLink(cqiEntityType, cqiRecordId);
      if (!link || link.linkStatus !== 'active') {
        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'skipped',
          reason: 'No active Salesforce link found for this record',
          executedAt: timestamp,
        };
      }

      // Verify the linked SF object matches the target object
      if (link.sfObjectType !== targetObject) {
        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'skipped',
          reason: `Linked Salesforce object (${link.sfObjectType}) does not match target (${targetObject})`,
          executedAt: timestamp,
        };
      }

      // Step 2: Resolve dynamic variables in fieldMap values
      const resolvedFieldMap = this.resolveSalesforceVariables(fieldMap, context, timestamp);

      // Step 3: Dirty check - fetch current SF record and compare
      const fieldsToCheck = Object.keys(resolvedFieldMap);
      const currentRecord = await salesforceSyncService.fetchSalesforceRecord(
        context.userId,
        targetObject,
        link.sfRecordId,
        fieldsToCheck
      );

      if (!currentRecord) {
        // Record not found in Salesforce
        await this.logSalesforceAudit(context, action, timestamp, 'failed', {
          originalFieldMap: fieldMap,
          resolvedFieldMap,
          error: 'Salesforce record not found',
        });

        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'failed',
          error: 'Salesforce record not found (may have been deleted)',
        };
      }

      // Check if all values already match (dirty check)
      const changedFields: Record<string, { current: unknown; new: unknown }> = {};
      for (const [field, newValue] of Object.entries(resolvedFieldMap)) {
        const currentValue = currentRecord[field];
        if (!this.valuesAreEqual(currentValue, newValue)) {
          changedFields[field] = { current: currentValue, new: newValue };
        }
      }

      // If no changes needed, skip (prevents infinite loops)
      if (Object.keys(changedFields).length === 0) {
        await this.logSalesforceAudit(context, action, timestamp, 'skipped', {
          originalFieldMap: fieldMap,
          resolvedFieldMap,
          reason: 'All values already match - no update needed',
        });

        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'skipped',
          reason: 'All Salesforce field values already match - no update needed',
          executedAt: timestamp,
        };
      }

      // Step 4: Perform the immediate Salesforce update
      const onlyChangedFieldMap: Record<string, string | number | boolean | null> = {};
      for (const field of Object.keys(changedFields)) {
        const value = resolvedFieldMap[field];
        onlyChangedFieldMap[field] = value as string | number | boolean | null;
      }

      const updateResult = await salesforceSyncService.directSalesforceUpdate({
        userId: context.userId,
        sfObjectType: targetObject,
        sfRecordId: link.sfRecordId,
        fieldMap: onlyChangedFieldMap,
      });

      // Step 5: Log the outcome to audit trail
      if (updateResult.success) {
        await this.logSalesforceAudit(context, action, timestamp, 'success', {
          originalFieldMap: fieldMap,
          resolvedFieldMap,
          changedFields,
          fieldsUpdated: updateResult.fieldsUpdated,
        });

        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'executed',
          reason: `Updated ${Object.keys(changedFields).length} field(s) on ${targetObject}: ${Object.keys(changedFields).join(', ')}`,
          executedAt: timestamp,
        };
      } else {
        await this.logSalesforceAudit(context, action, timestamp, 'failed', {
          originalFieldMap: fieldMap,
          resolvedFieldMap,
          changedFields,
          error: updateResult.error,
          errorType: updateResult.errorType,
        });

        return {
          actionId: action.id,
          action: 'update_salesforce',
          status: 'failed',
          error: updateResult.error || 'Unknown Salesforce update error',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Workflow Automation] Salesforce update error:', error);

      await this.logSalesforceAudit(context, action, timestamp, 'failed', {
        originalFieldMap: fieldMap,
        error: errorMessage,
      });

      return {
        actionId: action.id,
        action: 'update_salesforce',
        status: 'failed',
        error: errorMessage,
      };
    }
  }

  private async executeUpdateProjectStatus(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { status } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'update_project_status', status: 'failed', error: 'No project in context' };
    }
    if (!status) {
      return { actionId: action.id, action: 'update_project_status', status: 'failed', error: 'No target status specified' };
    }

    try {
      await this.storage.db
        .update(this.storage.schema.projects)
        .set({ status, updatedAt: timestamp })
        .where(eq(this.storage.schema.projects.id, Number(projectId)));

      console.log(`[Workflow Automation] Updated project ${projectId} status to "${status}"`);
      return { actionId: action.id, action: 'update_project_status', status: 'executed', reason: `Project status updated to "${status}"`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'update_project_status', status: 'failed', error: msg };
    }
  }

  private async executeUpdateRiskLevel(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { riskLevel } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'update_risk_level', status: 'failed', error: 'No project in context' };
    }
    if (!riskLevel) {
      return { actionId: action.id, action: 'update_risk_level', status: 'failed', error: 'No risk level specified' };
    }

    try {
      await this.storage.db
        .update(this.storage.schema.projects)
        .set({ risk: riskLevel, updatedAt: timestamp })
        .where(eq(this.storage.schema.projects.id, Number(projectId)));

      console.log(`[Workflow Automation] Updated project ${projectId} risk level to "${riskLevel}"`);
      return { actionId: action.id, action: 'update_risk_level', status: 'executed', reason: `Risk level updated to "${riskLevel}"`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'update_risk_level', status: 'failed', error: msg };
    }
  }

  private async executeAssignUser(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { userId } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'assign_user', status: 'failed', error: 'No project in context' };
    }
    if (!userId) {
      return { actionId: action.id, action: 'assign_user', status: 'failed', error: 'No user specified' };
    }

    try {
      await this.storage.db
        .update(this.storage.schema.projects)
        .set({ primaryEngineerId: userId, updatedAt: timestamp })
        .where(eq(this.storage.schema.projects.id, Number(projectId)));

      console.log(`[Workflow Automation] Assigned user ${userId} to project ${projectId}`);
      return { actionId: action.id, action: 'assign_user', status: 'executed', reason: `User ${userId} assigned to project`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'assign_user', status: 'failed', error: msg };
    }
  }

  private async executeCreateMapTask(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { title } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'create_map_task', status: 'failed', error: 'No project in context' };
    }
    if (!title) {
      return { actionId: action.id, action: 'create_map_task', status: 'failed', error: 'No task title specified' };
    }

    try {
      const [firstStep] = await this.storage.db
        .select({ id: this.storage.schema.mapSteps.id })
        .from(this.storage.schema.mapSteps)
        .innerJoin(this.storage.schema.mapPhases, eq(this.storage.schema.mapSteps.phaseId, this.storage.schema.mapPhases.id))
        .where(eq(this.storage.schema.mapPhases.projectId, Number(projectId)))
        .limit(1);

      if (!firstStep) {
        return { actionId: action.id, action: 'create_map_task', status: 'skipped', reason: 'No MAP steps found for project' };
      }

      const [firstPhase] = await this.storage.db
        .select({ id: this.storage.schema.mapPhases.id, isDemo: this.storage.schema.mapPhases.isDemo })
        .from(this.storage.schema.mapPhases)
        .where(eq(this.storage.schema.mapPhases.projectId, Number(projectId)))
        .limit(1);

      await this.storage.db.insert(this.storage.schema.mapTasks).values({
        stepId: firstStep.id,
        phaseId: firstPhase?.id || firstStep.id,
        projectId: Number(projectId),
        name: title,
        status: 'not_started',
        orderIndex: 999,
        // A task on a demo project's plan is demo data, like the plan.
        isDemo: firstPhase?.isDemo ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      console.log(`[Workflow Automation] Created MAP task "${title}" for project ${projectId}`);
      return { actionId: action.id, action: 'create_map_task', status: 'executed', reason: `MAP task "${title}" created`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'create_map_task', status: 'failed', error: msg };
    }
  }

  private async executeUpdateMapStatus(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { level, status: newStatus } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'update_map_status', status: 'failed', error: 'No project in context' };
    }
    if (!level || !newStatus) {
      return { actionId: action.id, action: 'update_map_status', status: 'failed', error: 'Level and status are required' };
    }

    try {
      if (level === 'phase') {
        await this.storage.db
          .update(this.storage.schema.mapPhases)
          .set({ status: newStatus, updatedAt: timestamp })
          .where(eq(this.storage.schema.mapPhases.projectId, Number(projectId)));
      } else if (level === 'step') {
        const phaseIds = await this.storage.db
          .select({ id: this.storage.schema.mapPhases.id })
          .from(this.storage.schema.mapPhases)
          .where(eq(this.storage.schema.mapPhases.projectId, Number(projectId)));
        if (phaseIds.length > 0) {
          await this.storage.db
            .update(this.storage.schema.mapSteps)
            .set({ status: newStatus, updatedAt: timestamp })
            .where(inArray(this.storage.schema.mapSteps.phaseId, phaseIds.map(p => p.id)));
        }
      } else if (level === 'task') {
        await this.storage.db
          .update(this.storage.schema.mapTasks)
          .set({ status: newStatus, updatedAt: timestamp })
          .where(eq(this.storage.schema.mapTasks.projectId, Number(projectId)));
      }

      console.log(`[Workflow Automation] Updated MAP ${level} status to "${newStatus}" for project ${projectId}`);
      return { actionId: action.id, action: 'update_map_status', status: 'executed', reason: `MAP ${level} status updated to "${newStatus}"`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'update_map_status', status: 'failed', error: msg };
    }
  }

  private async executeRunAiAssessment(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { rulesetId } = params;
    const projectId = context.projectId;

    if (!projectId) {
      return { actionId: action.id, action: 'run_ai_assessment', status: 'failed', error: 'No project in context' };
    }
    if (!rulesetId) {
      return { actionId: action.id, action: 'run_ai_assessment', status: 'failed', error: 'No assessment ruleset specified' };
    }

    try {
      await this.storage.db.insert(this.storage.schema.assessmentJobs).values({
        projectIds: [Number(projectId)],
        totalProjects: 1,
        rulesetId: Number(rulesetId),
        status: 'pending',
        createdAt: timestamp,
      });

      console.log(`[Workflow Automation] Queued AI assessment (ruleset ${rulesetId}) for project ${projectId}`);
      return { actionId: action.id, action: 'run_ai_assessment', status: 'executed', reason: `AI assessment queued (ruleset ${rulesetId})`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'run_ai_assessment', status: 'failed', error: msg };
    }
  }

  private async executeCreateNotification(
    action: ActionToExecute,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<ExecutionResult> {
    const { params } = action;
    const { message } = params;

    if (!message) {
      return { actionId: action.id, action: 'create_notification', status: 'failed', error: 'No notification message specified' };
    }

    try {
      const broadcaster = getBroadcaster();
      if (broadcaster) {
        broadcaster.broadcastEmailAutomationUpdate({
          type: 'execution',
          action: 'create_notification',
          data: {
            message,
            projectId: context.projectId,
            userId: context.userId,
          },
        } as any);
      }

      console.log(`[Workflow Automation] Created notification: "${message}"`);
      return { actionId: action.id, action: 'create_notification', status: 'executed', reason: `Notification broadcast: "${message}"`, executedAt: timestamp };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { actionId: action.id, action: 'create_notification', status: 'failed', error: msg };
    }
  }

  /**
   * Resolves dynamic variables in fieldMap values.
   * Supports: {{timestamp}}, {{today}}, and flattened context.metadata keys
   */
  private resolveSalesforceVariables(
    fieldMap: Record<string, string | number | boolean>,
    context: ExecutionContext,
    timestamp: Date
  ): Record<string, string | number | boolean> {
    const resolved: Record<string, string | number | boolean> = {};

    for (const [field, value] of Object.entries(fieldMap)) {
      if (typeof value === 'string') {
        let resolvedValue = value;

        // Replace {{timestamp}} with ISO string
        resolvedValue = resolvedValue.replace(/\{\{timestamp\}\}/gi, timestamp.toISOString());

        // Replace {{today}} with YYYY-MM-DD
        const todayStr = timestamp.toISOString().split('T')[0];
        resolvedValue = resolvedValue.replace(/\{\{today\}\}/gi, todayStr);

        // Replace metadata variables (flattened access)
        // e.g., {{status}} looks up context.metadata.status
        if (context.metadata) {
          resolvedValue = resolvedValue.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            const metadataValue = context.metadata?.[key];
            if (metadataValue !== undefined && metadataValue !== null) {
              return String(metadataValue);
            }
            return match; // Keep original if not found
          });
        }

        resolved[field] = resolvedValue;
      } else {
        // Non-string values (numbers, booleans) pass through unchanged
        resolved[field] = value;
      }
    }

    return resolved;
  }

  /**
   * Compares two values for equality (handles type coercion for SF comparisons)
   */
  private valuesAreEqual(current: unknown, newValue: unknown): boolean {
    // Handle null/undefined
    if (current === null || current === undefined) {
      return newValue === null || newValue === undefined || newValue === '';
    }
    if (newValue === null || newValue === undefined) {
      return current === null || current === undefined || current === '';
    }

    // String comparison
    if (typeof current === 'string' && typeof newValue === 'string') {
      return current === newValue;
    }

    // Number comparison (handle string numbers)
    if (typeof current === 'number' || typeof newValue === 'number') {
      return Number(current) === Number(newValue);
    }

    // Boolean comparison
    if (typeof current === 'boolean' || typeof newValue === 'boolean') {
      return Boolean(current) === Boolean(newValue);
    }

    // Fallback to strict equality
    return current === newValue;
  }

  /**
   * Logs Salesforce update action results to the audit trail
   */
  private async logSalesforceAudit(
    context: ExecutionContext,
    action: ActionToExecute,
    timestamp: Date,
    status: 'success' | 'skipped' | 'failed',
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.storage.db.insert(this.storage.schema.emailRuleAudits).values({
        ruleId: context.ruleId,
        eventKey: context.triggerKey,
        input: {
          projectId: context.projectId ?? null,
          userId: context.userId ?? null,
          metadata: context.metadata ?? {},
        },
        decision: status === 'success' ? 'matched' : status === 'failed' ? 'error' : 'no_match',
        reason: `Salesforce ${status}`,
        metadata: {
          actions: [{ id: action.id, action: 'update_salesforce' }],
          executionResults: [
            {
              actionId: action.id,
              action: 'update_salesforce',
              status: status === 'success' ? 'executed' : status,
              ...details,
            },
          ],
        },
      });
    } catch (error) {
      console.error('[Workflow Automation] Failed to log Salesforce audit:', error);
    }
  }

  // ============================================================================
  // PREFERENCE & QUIET HOURS CHECKING
  // ============================================================================

  /** Whether the recipient wants an email for this MAP event on this project (true for other events). */
  private async mapEmailAllowed(
    recipientId: string,
    context: ExecutionContext,
    prefs?: { phasesPreference?: string | null; stepsPreference?: string | null; tasksPreference?: string | null } | null,
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!parseMapEventKey(context.triggerKey)) return { allowed: true };
    const projectId = context.projectId ? Number(context.projectId) : NaN;
    const userPrefs =
      prefs !== undefined
        ? prefs
        : (
            await this.storage.db
              .select()
              .from(this.storage.schema.userEmailPreferences)
              .where(eq(this.storage.schema.userEmailPreferences.userId, recipientId))
              .limit(1)
          )[0] ?? null;
    const [projectSettings] = Number.isSafeInteger(projectId)
      ? await this.storage.db
          .select()
          .from(this.storage.schema.projectMapNotificationSettings)
          .where(
            and(
              eq(this.storage.schema.projectMapNotificationSettings.projectId, projectId),
              eq(this.storage.schema.projectMapNotificationSettings.userId, recipientId),
            ),
          )
          .limit(1)
      : [];
    return mapEmailDecision(context.triggerKey, userPrefs, projectSettings ?? null);
  }

  private async canSendEmail(
    recipientId: string,
    context: ExecutionContext,
    timestamp: Date,
    templateCategory?: string | null,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Check active suppression windows
    const isSuppressed = await this.checkActiveSuppression(recipientId, context, timestamp);
    if (isSuppressed.suppressed) {
      return { allowed: false, reason: isSuppressed.reason };
    }

    // 2. Profile › Notifications "Do Not Send Any Emails". Sign-in emails
    // (category "Authentication") still go out. (This used to read an
    // `emailsEnabled` column that doesn't exist, which blocked every rule
    // email to anyone who had saved their preferences.)
    const [userPrefs] = await this.storage.db
      .select()
      .from(this.storage.schema.userEmailPreferences)
      .where(eq(this.storage.schema.userEmailPreferences.userId, recipientId))
      .limit(1);

    if (userPrefs?.overallPreference === 'do_not_send' && templateCategory !== 'Authentication') {
      return { allowed: false, reason: 'Recipient turned off automated emails in Profile' };
    }

    // 3. MAP events: the recipient's Profile and project MAP email choices.
    const mapDecision = await this.mapEmailAllowed(recipientId, context, userPrefs ?? null);
    if (!mapDecision.allowed) return mapDecision;

    // 4. Check quiet hours
    if ((userPrefs as any)?.quietHoursEnabled && userPrefs?.quietHoursStart && userPrefs?.quietHoursEnd) {
      const userTimezone = (userPrefs as any).timezone || 'America/New_York';
      const isQuietTime = this.isInQuietHours(
        timestamp,
        userTimezone,
        userPrefs.quietHoursStart as any,
        userPrefs.quietHoursEnd as any
      );

      if (isQuietTime) {
        return { allowed: false, reason: 'Currently in user quiet hours' };
      }
    }

    return { allowed: true };
  }

  private async checkActiveSuppression(
    recipientId: string,
    context: ExecutionContext,
    timestamp: Date
  ): Promise<{ suppressed: boolean; reason?: string }> {
    // Suppression rows are audits where the action that ran was 'suppress_for'.
    // Post-v0.7.53 audit schema, action results live under
    // `metadata.executionResults`, not the legacy `actions_snapshot` column.
    // The prior query referenced `actions_snapshot::jsonb->>'actionType'`
    // against a column that doesn't exist, so this whole check would 500
    // on every send_email — which is exactly what the user hit on the
    // first registration that actually reached this code path.
    const suppressions = await this.storage.db
      .select()
      .from(this.storage.schema.emailRuleAudits)
      .where(
        and(
          eq(this.storage.schema.emailRuleAudits.ruleId, context.ruleId),
          sql`(metadata->'executionResults') @> '[{"action":"suppress_for","status":"executed"}]'`
        )
      )
      .orderBy(sql`created_at DESC`)
      .limit(20);

    for (const suppression of suppressions) {
      const metadata = (suppression as any).metadata as any;
      const input = (suppression as any).input as any;
      // Find the executed suppress_for action result in this audit (carries
      // suppressUntil + scope + recipientId in its result row)
      const results = Array.isArray(metadata?.executionResults) ? metadata.executionResults : [];
      const suppressResult = results.find(
        (r: any) => r.action === 'suppress_for' && r.status === 'executed'
      );
      if (!suppressResult?.suppressUntil || !suppressResult?.scope) {
        continue;
      }

      const suppressUntil = new Date(suppressResult.suppressUntil);

      // Check if suppression is still active
      if (timestamp >= suppressUntil) {
        continue; // Suppression expired
      }

      const scope = suppressResult.scope;
      const matches = this.matchesSuppressionScope(
        scope,
        context,
        recipientId,
        input?.projectId ?? null,
        (suppression as any).eventKey,
        suppressResult.recipientId
      );
      
      if (matches) {
        const remainingMs = suppressUntil.getTime() - timestamp.getTime();
        const remainingMinutes = Math.ceil(remainingMs / 60000);
        return { 
          suppressed: true, 
          reason: `Suppressed for ${remainingMinutes} more minutes (scope: ${scope})` 
        };
      }
    }

    return { suppressed: false };
  }

  private matchesSuppressionScope(
    scope: string,
    context: ExecutionContext,
    recipientId: string,
    suppressionProjectId: string | null,
    suppressionTriggerKey: string,
    suppressionRecipientId?: string
  ): boolean {
    switch (scope) {
      case 'all':
        // All scope: Only matches if project and rule match
        return suppressionProjectId === context.projectId;
      
      case 'project':
        // Project scope: Must match projectId
        return !!(context.projectId && suppressionProjectId === context.projectId);
      
      case 'user':
        // User scope: Must match recipientId
        return !!(suppressionRecipientId && suppressionRecipientId === recipientId);
      
      case 'trigger':
        // Trigger scope: Must match exact trigger key
        return suppressionTriggerKey === context.triggerKey;
      
      case 'rule':
        // Rule scope: Already filtered by ruleId, any record matches
        return true;
      
      default:
        return false;
    }
  }

  private isInQuietHours(
    timestamp: Date,
    timezone: string,
    quietStart: string,
    quietEnd: string
  ): boolean {
    try {
      const userTime = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(timestamp);

      // Compare time strings (e.g., "22:00" vs "08:00")
      const currentTime = userTime.replace(':', '');
      const startTime = quietStart.replace(':', '');
      const endTime = quietEnd.replace(':', '');

      // Handle overnight quiet hours (e.g., 22:00 to 08:00)
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime < endTime;
      }

      return currentTime >= startTime && currentTime < endTime;
    } catch (error) {
      console.error('Error checking quiet hours:', error);
      return false;
    }
  }

  // ============================================================================
  // DIGEST EMAIL PROCESSING
  // ============================================================================

  async processDigestSend(
    ruleId: number,
    scheduleMetadata?: any,
    actionConfig?: Record<string, unknown> | null,
  ): Promise<{
    success: boolean;
    itemCount: number;
    recipientCount: number;
    error?: string;
    /** Set when the Send Email Window held some or all of the digest. */
    skipped?: 'quiet_hours' | 'rate_limit';
    /** Recipients whose items stay pending because of the hourly limit. */
    heldRecipientCount?: number;
    message?: string;
  }> {
    try {
      // Send Email Window: a digest inside quiet hours waits for the next
      // run; its items stay pending (Configuration › Scheduler).
      const sendWindow = await getSendWindowSettings();
      const quiet = digestQuietHoursDecision(sendWindow, actionConfig);
      if (quiet.held) {
        return {
          success: true,
          itemCount: 0,
          recipientCount: 0,
          skipped: 'quiet_hours',
          message: quiet.reason,
        };
      }

      // Get the rule to extract digest configuration
      const [rule] = await this.storage.db
        .select()
        .from(this.storage.schema.emailRules)
        .where(eq(this.storage.schema.emailRules.id, ruleId))
        .limit(1);

      if (!rule || !rule.enabled || rule.isDemo) {
        return {
          success: false,
          itemCount: 0,
          recipientCount: 0,
          error: 'Rule not found or disabled',
        };
      }

      // Events queued by this rule's Schedule Digest action (see
      // digest-utils.ts). The digest run's own audit rows carry no
      // digestRecipientIds, so they never count as items.
      const audits = this.storage.schema.emailRuleAudits;
      const cutoffTime = new Date(Date.now() - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const candidates = await this.storage.db
        .select()
        .from(audits)
        .where(
          and(
            eq(audits.ruleId, ruleId),
            gte(audits.createdAt, cutoffTime),
            sql`${audits.metadata}::jsonb -> 'executionResults' @> '[{"action":"schedule_digest"}]'::jsonb`,
          )
        )
        .orderBy(audits.createdAt);

      const itemsByRecipient = groupDigestItems(candidates);
      const pendingItems = [...new Set([...itemsByRecipient.values()].flat())];

      if (pendingItems.length === 0) {
        return {
          success: true,
          itemCount: 0,
          recipientCount: 0,
          message: 'No new events to include in the digest',
        };
      }

      // Workflow Automation test mode reroutes digests like rule emails.
      const automationConfig = await this.storage.getEmailAutomationConfig();
      const testAddresses = (automationConfig?.testEmailAddresses as string[] | null) ?? [];
      const testMode = Boolean(automationConfig?.testModeEnabled) && testAddresses.length > 0;

      const { sendEmail } = await import('./email.js');
      let sentCount = 0;
      let heldCount = 0;
      let skippedCount = 0;

      for (const [recipientId, items] of itemsByRecipient) {
        if (heldCount > 0) {
          // Hourly limit already reached on this run: leave the rest pending.
          heldCount++;
          continue;
        }
        try {
          const [recipient] = await this.storage.db
            .select()
            .from(this.storage.schema.users)
            .where(eq(this.storage.schema.users.id, recipientId))
            .limit(1);

          if (!recipient?.email) {
            console.warn(`[Digest] Recipient ${recipientId} not found, skipping`);
            skippedCount++;
            continue;
          }

          // The recipient's email preferences and suppression windows.
          const allowed = await this.canSendEmail(
            recipientId,
            { ruleId, ruleName: rule.name, triggerKey: 'schedule_digest', userId: recipientId } as ExecutionContext,
            new Date(),
          );
          if (!allowed.allowed) {
            skippedCount++;
            continue;
          }

          const digestContent = this.buildDigestEmailContent(rule, items);
          const to = testMode ? testAddresses : [recipient.email as string];
          const subjectBase = `${rule.name} - Digest Summary`;
          const subject = testMode ? `[TEST MODE - Original: ${recipient.email}] ${subjectBase}` : subjectBase;

          // Max emails per hour (Send Email Window): one slot per email.
          // Over the limit, this recipient's items stay pending.
          let delivered = 0;
          for (const address of to) {
            if (!(await reserveEmailSendSlot('digest'))) break;
            await sendEmail({
              to: address,
              from: 'noreply@criteriaiq.com',
              subject,
              html: digestContent.html,
              text: digestContent.text,
              emailType: 'digest',
              userId: recipientId,
            });
            delivered++;
          }
          if (delivered === 0) {
            heldCount++;
            continue;
          }

          sentCount++;

          const sentAt = new Date();
          for (const item of items) {
            // Re-read so recipients marked earlier in this run are kept.
            const [fresh] = await this.storage.db
              .select({ metadata: audits.metadata })
              .from(audits)
              .where(eq(audits.id, item.id))
              .limit(1);
            await this.storage.db
              .update(audits)
              .set({ metadata: markDigestSent(fresh?.metadata ?? item.metadata, recipientId, sentAt) })
              .where(eq(audits.id, item.id));
          }
        } catch (recipientError) {
          console.error(`[Digest] Failed to send digest to ${recipientId}:`, recipientError);
        }
      }

      if (heldCount > 0) {
        return {
          success: true,
          itemCount: pendingItems.length,
          recipientCount: sentCount,
          skipped: 'rate_limit',
          heldRecipientCount: heldCount,
          message: `Digest sent to ${sentCount} recipients; ${heldCount} held by the hourly email limit until the next run`,
        };
      }

      return {
        success: sentCount > 0 || skippedCount === itemsByRecipient.size,
        itemCount: pendingItems.length,
        recipientCount: sentCount,
        ...(sentCount === 0 ? { error: 'No digest could be sent (recipients not found or email sending failed)' } : {}),
        ...(skippedCount > 0 ? { message: `Digest sent to ${sentCount} recipients; ${skippedCount} skipped by their email preferences or not found` } : {}),
      };
    } catch (error) {
      console.error('Error processing digest send:', error);
      return {
        success: false,
        itemCount: 0,
        recipientCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildDigestEmailContent(rule: any, items: any[]): { html: string; text: string } {
    // Items are email_rule_audits rows: eventKey is the trigger, input the
    // trigger context. Every value is escaped; rule names and event details
    // are user-entered.
    const describe = (item: any) => ({
      eventKey: String(item.eventKey ?? ''),
      when: item.createdAt ? new Date(item.createdAt).toLocaleString() : '',
      description: describeDigestItem(item.input),
    });
    const ruleName = escapeHtml(rule.name);

    const itemsHtml = items
      .map((item, index) => {
        const d = describe(item);
        return `
      <div style="padding: 12px; margin: 8px 0; background: #f9fafb; border-left: 3px solid #3b82f6;">
        <strong>#${index + 1}</strong> - ${escapeHtml(d.eventKey)}<br/>
        <small style="color: #6b7280;">${escapeHtml(d.when)}</small>
        ${d.description ? `<p>${escapeHtml(d.description)}</p>` : ''}
      </div>
    `;
      })
      .join('');

    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #3b82f6; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 20px; border: 1px solid #e5e7eb; }
            .footer { background: #f9fafb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">Digest Summary: ${ruleName}</h2>
            </div>
            <div class="content">
              <p>You have <strong>${items.length}</strong> new ${items.length === 1 ? 'notification' : 'notifications'}:</p>
              ${itemsHtml}
            </div>
            <div class="footer">
              This is an automated digest email from CriteriaIQ Email Automation.
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Digest Summary: ${rule.name}

You have ${items.length} new ${items.length === 1 ? 'notification' : 'notifications'}:

${items
  .map((item, index) => {
    const d = describe(item);
    return `#${index + 1} - ${d.eventKey}\n  ${d.when}${d.description ? `\n  ${d.description}` : ''}`;
  })
  .join('\n\n')}

---
This is an automated digest email from CriteriaIQ Email Automation.
    `.trim();

    return { html, text };
  }
}

/** The MAP item's assignee from the event metadata, or "" when it has none. */
function assigneeOf(context: { metadata?: Record<string, any> }): string {
  const value = context.metadata?.assignedTo;
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

let engineInstance: EmailAutomationEngine | null = null;

export function getAutomationEngine(): EmailAutomationEngine {
  if (!engineInstance) {
    engineInstance = new EmailAutomationEngine(storage);
  }
  return engineInstance;
}

export async function evaluateAndExecute(context: TriggerContext): Promise<{
  evaluations: EvaluationResult[];
  executionResults: ExecutionResult[];
  executedActions: number;
}> {
  const engine = getAutomationEngine();
  const evaluations = await engine.evaluateTrigger(context);
  
  const matchedRules = evaluations.filter(e => e.matched);
  const allExecutionResults: ExecutionResult[] = [];
  let executedActions = 0;
  
  // Execute actions for each matched rule
  for (const result of matchedRules) {
    if (result.actionsToExecute.length > 0) {
      const executionContext: ExecutionContext = {
        ruleId: result.ruleId,
        ruleName: result.ruleName,
        triggerKey: context.triggerKey,
        projectId: context.projectId,
        userId: context.userId,
        metadata: context.metadata,
        dedupKey: context.dedupKey,
      };

      const execResults = await engine.executeActions(executionContext, result.actionsToExecute);
      allExecutionResults.push(...execResults);
      
      // Count successfully executed actions
      executedActions += execResults.filter(r => r.status === 'executed').length;
    }
  }
  
  return {
    evaluations,
    executionResults: allExecutionResults,
    executedActions,
  };
}
