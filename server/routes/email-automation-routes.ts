// Email Automation routes (Phase 8 extraction #11e).
//
// Largest admin-routes slice extracted to date — 19 handlers covering
// the entire email-automation surface:
//
//   Trigger evaluation/execution:
//     POST /api/email-automation/evaluate
//     POST /api/email-automation/execute
//     GET  /api/email-automation/triggers
//     POST /api/admin/email-automation/sync-triggers
//
//   Rule CRUD:
//     GET    /api/email-automation/rules
//     GET    /api/email-automation/rules/:id
//     POST   /api/email-automation/rules
//     PUT    /api/email-automation/rules/:id
//     PATCH  /api/email-automation/rules/:id/toggle
//     DELETE /api/email-automation/rules/:id
//     POST   /api/email-automation/simulate
//
//   Observability:
//     GET /api/email-automation/stats
//     GET /api/email-automation/execution-feed
//
//   Configuration (the PUT lives 1k lines below the block in routes.ts;
//   pulled together here for cohesion):
//     GET /api/email-automation/config
//     PUT /api/email-automation/config
//
//   Schedules:
//     GET    /api/email-automation/schedules
//     GET    /api/email-automation/action-types
//     POST   /api/email-automation/schedules
//     PUT    /api/email-automation/schedules/:id
//     DELETE /api/email-automation/schedules/:id
//     GET    /api/email-automation/schedules/:id/runs
//     POST   /api/email-automation/schedules/:id/trigger   (manual fire)
//
// Dependencies kept the same shape they had inline:
//   - `storage.schema.X` namespace accesses converted to direct
//     `@shared/schema` imports (cleanup pass).
//   - `getAutomationEngine`, `evaluateAndExecute`, and
//     `scheduledActionService` keep their dynamic imports to avoid the
//     same top-level cycle they were avoiding before.
import type { Express } from "express";
import { eq, and, desc, gte, lt, inArray, sql, type SQL } from "drizzle-orm";
import { storage } from "../storage";
import {
  emailTriggers,
  emailRules,
  emailRuleConditions,
  emailRuleActions,
  emailRuleAudits,
  emailSchedules,
  automationRunLogs,
  projects,
} from "@shared/schema";
import { isAuthenticated } from "../auth/simpleAuth";
import { requireSectionEdit } from "../lib/section-permissions";
import {
  SCHEDULE_ACTION_TYPES,
  isScheduleActionType,
  keepScheduleCreator,
  newScheduleIsDemo,
  resolveSchedulePermissions,
  scheduleVisibleInMode,
} from "../lib/schedule-permissions";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { applyDemoFilter } from "../lib/demo-storage";
import { REPORT_SCHEDULE_ACTION_TYPE } from "@shared/report-schedule-calendar";
import { z } from "zod";

// Unknown keys (older clients sent quiet-hours fields here) are ignored.
const testModeConfigSchema = z.object({
  testModeEnabled: z.boolean().optional(),
  testEmailAddresses: z.array(z.email()).max(50).optional(),
});

export function registerEmailAutomationRoutes(app: Express) {
  // Names of the projects a page of runs is about, for the Execution Feed.
  // Only projects of the current mode are named.
  async function withProjectNames<T extends { projectId: number | null }>(audits: T[]): Promise<Array<T & { projectName: string | null }>> {
    const ids = [...new Set(audits.map((a) => a.projectId).filter((id): id is number => typeof id === "number"))];
    const rows = ids.length > 0
      ? await storage.db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(and(inArray(projects.id, ids), applyDemoFilter(projects)))
      : [];
    const names = new Map(rows.map((r) => [r.id, r.name]));
    return audits.map((a) => ({ ...a, projectName: a.projectId !== null ? names.get(a.projectId) ?? null : null }));
  }

  // Whether an automation rule exists in the current mode (is_demo).
  async function ruleVisibleInMode(ruleId: unknown): Promise<boolean> {
    const id = Number(ruleId);
    if (!Number.isInteger(id)) return false;
    const [rule] = await storage.db
      .select({ id: emailRules.id })
      .from(emailRules)
      .where(and(eq(emailRules.id, id), applyDemoFilter(emailRules)))
      .limit(1);
    return Boolean(rule);
  }

  // POST /api/email-automation/evaluate - Evaluate trigger event and return matching rules (no execution)
  app.post("/api/email-automation/evaluate", isAuthenticated, requireSectionEdit("config.workflow-automation"), async (req: any, res) => {
    try {
      const { triggerKey, projectId, userId, metadata } = req.body;

      if (!triggerKey) {
        return res.status(400).json({ message: "triggerKey is required" });
      }

      const { getAutomationEngine } = await import('../email/email-automation-engine');
      const engine = getAutomationEngine();
      
      const results = await engine.evaluateTrigger({
        triggerKey,
        projectId,
        userId,
        metadata,
        timestamp: new Date(),
      });

      const matchedRules = results.filter(r => r.matched);
      const totalActions = matchedRules.reduce((sum, r) => sum + r.actionsToExecute.length, 0);

      res.json({
        triggerKey,
        evaluatedRules: results.length,
        matchedRules: matchedRules.length,
        totalActionsToExecute: totalActions,
        results,
      });
    } catch (error: any) {
      console.error("Error evaluating trigger:", error);
      res.status(500).json({ message: "Failed to evaluate trigger" });
    }
  });

  // POST /api/email-automation/execute - Evaluate and execute automation rules for a trigger event
  app.post("/api/email-automation/execute", isAuthenticated, requireSectionEdit("config.workflow-automation"), async (req: any, res) => {
    try {
      const { triggerKey, projectId, userId, metadata } = req.body;

      if (!triggerKey) {
        return res.status(400).json({ message: "triggerKey is required" });
      }

      const { evaluateAndExecute } = await import('../email/email-automation-engine');
      
      const result = await evaluateAndExecute({
        triggerKey,
        projectId,
        userId,
        metadata,
        timestamp: new Date(),
      });

      res.json({
        triggerKey,
        evaluatedRules: result.evaluations.length,
        matchedRules: result.evaluations.filter(e => e.matched).length,
        executedActions: result.executedActions,
        totalActionsAttempted: result.executionResults.length,
        evaluations: result.evaluations,
        executionResults: result.executionResults,
      });
    } catch (error: any) {
      console.error("Error executing automation:", error);
      res.status(500).json({ message: "Failed to execute automation" });
    }
  });

  // GET /api/email-automation/triggers - List all available email triggers with usage statistics
  app.get("/api/email-automation/triggers", isAuthenticated, async (req: any, res) => {
    try {
      // Get all triggers
      const triggers = await storage.db
        .select()
        .from(emailTriggers)
        .orderBy(emailTriggers.category, emailTriggers.key);

      // Get rule usage counts for each trigger
      // Count enabled rules that have each trigger in their triggerKeys JSONB array
      const ruleUsageQuery = await storage.db.execute(sql`
        SELECT 
          trigger_key,
          COUNT(*) as rule_count
        FROM (
          SELECT jsonb_array_elements_text(trigger_keys) as trigger_key
          FROM email_rules
          WHERE enabled = true AND is_demo = ${isCurrentRequestDemo()}
        ) subq
        GROUP BY trigger_key
      `);

      const ruleUsageMap = new Map<string, number>();
      (ruleUsageQuery.rows || []).forEach((row: any) => {
        ruleUsageMap.set(row.trigger_key, parseInt(row.rule_count));
      });

      // Get last triggered timestamp for each trigger
      const lastTriggeredQuery = await storage.db.execute(sql`
        SELECT 
          event_key,
          MAX(created_at) as last_triggered
        FROM email_rule_audits
        WHERE is_demo = ${isCurrentRequestDemo()}
        GROUP BY event_key
      `);

      const lastTriggeredMap = new Map<string, Date>();
      (lastTriggeredQuery.rows || []).forEach((row: any) => {
        if (row.last_triggered) {
          lastTriggeredMap.set(row.event_key, new Date(row.last_triggered));
        }
      });

      // Enhance triggers with statistics
      const triggersWithStats = triggers.map(trigger => ({
        ...trigger,
        ruleCount: ruleUsageMap.get(trigger.key) || 0,
        lastTriggered: lastTriggeredMap.get(trigger.key) || null,
      }));

      res.json({ triggers: triggersWithStats });
    } catch (error: any) {
      console.error("Error fetching email triggers:", error);
      res.status(500).json({ message: "Failed to fetch email triggers" });
    }
  });

  // POST /api/admin/email-automation/sync-triggers - Sync system triggers (admin only)
  app.post("/api/admin/email-automation/sync-triggers", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin authorization
      if (req.session?.user?.role !== 'Admin') {
        return res.status(403).json({ message: "Admin access required" });
      }

      const { dryRun = false } = req.body;

      // Import sync function
      const { syncSystemTriggers } = await import('../email/email-trigger-registration');

      // Perform sync
      const result = await syncSystemTriggers(storage, dryRun);

      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json({
          message: "Sync completed with errors",
          ...result
        });
      }
    } catch (error: any) {
      console.error("Error syncing system triggers:", error);
      res.status(500).json({ message: "Failed to sync system triggers" });
    }
  });

  // GET /api/email-automation/rules - List all automation rules with optional filters
  app.get("/api/email-automation/rules", isAuthenticated, async (req: any, res) => {
    try {
      const { enabled } = req.query;

      // Each mode lists only its own rules (is_demo, migration 135).
      const conditions: SQL[] = [applyDemoFilter(emailRules)];
      if (enabled !== undefined) {
        conditions.push(eq(emailRules.enabled, enabled === 'true'));
      }

      const rules = await storage.db
        .select()
        .from(emailRules)
        .where(and(...conditions))
        .orderBy(emailRules.priority, desc(emailRules.createdAt));

      res.json(rules);
    } catch (error: any) {
      console.error("Error fetching email rules:", error);
      res.status(500).json({ message: "Failed to fetch email rules" });
    }
  });

  // GET /api/email-automation/rules/:id - Get single rule with conditions and actions
  app.get("/api/email-automation/rules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const ruleId = parseInt(req.params.id as string);

      // Get rule
      const [rule] = await storage.db
        .select()
        .from(emailRules)
        .where(and(eq(emailRules.id, ruleId), applyDemoFilter(emailRules)))
        .limit(1);

      if (!rule) {
        return res.status(404).json({ message: "Email rule not found" });
      }

      // Get conditions for this rule
      const conditions = await storage.db
        .select()
        .from(emailRuleConditions)
        .where(eq(emailRuleConditions.ruleId, ruleId))
        .orderBy(emailRuleConditions.orderIndex);

      // Get actions for this rule
      const actions = await storage.db
        .select()
        .from(emailRuleActions)
        .where(eq(emailRuleActions.ruleId, ruleId))
        .orderBy(emailRuleActions.orderIndex);

      res.json({
        ...rule,
        conditions,
        actions
      });
    } catch (error: any) {
      console.error("Error fetching email rule:", error);
      res.status(500).json({ message: "Failed to fetch email rule" });
    }
  });

  // POST /api/email-automation/rules - Create new automation rule
  app.post("/api/email-automation/rules", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permission
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can create email automation rules" });
      }

      const { name, description, triggerKeys, priority, enabled, continueOnMatch, conditions, actions } = req.body;

      // Validate required fields
      if (!name || !triggerKeys) {
        return res.status(400).json({ message: "Name and triggerKeys are required" });
      }

      // Create rule in transaction
      const result = await storage.db.transaction(async (tx) => {
        // Insert rule
        const [newRule] = await tx
          .insert(emailRules)
          .values({
            name,
            description,
            triggerKeys,
            priority: priority || 100,
            enabled: enabled !== undefined ? enabled : true,
            continueOnMatch: continueOnMatch || false,
            // A rule made in Demo Mode is a demo rule and never runs.
            isDemo: isCurrentRequestDemo(),
            createdBy: req.session.user.id,
          })
          .returning();

        // Insert conditions if provided
        if (conditions && conditions.length > 0) {
          await tx.insert(emailRuleConditions).values(
            conditions.map((c: any, index: number) => ({
              ruleId: newRule.id,
              kind: c.kind,
              operator: c.operator,
              value: c.value,
              orderIndex: c.orderIndex !== undefined ? c.orderIndex : index,
            }))
          );
        }

        // Insert actions if provided
        if (actions && actions.length > 0) {
          await tx.insert(emailRuleActions).values(
            actions.map((a: any, index: number) => ({
              ruleId: newRule.id,
              action: a.action,
              params: a.params,
              orderIndex: a.orderIndex !== undefined ? a.orderIndex : index,
            }))
          );
        }

        return newRule;
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating email rule:", error);
      res.status(500).json({ message: "Failed to create email rule" });
    }
  });

  // PUT /api/email-automation/rules/:id - Update automation rule
  app.put("/api/email-automation/rules/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permission
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can update email automation rules" });
      }

      const ruleId = parseInt(req.params.id as string);
      const { name, description, triggerKeys, priority, enabled, continueOnMatch, conditions, actions } = req.body;

      // Update rule in transaction
      const result = await storage.db.transaction(async (tx) => {
        // Update rule
        const [updatedRule] = await tx
          .update(emailRules)
          .set({
            name,
            description,
            triggerKeys,
            priority,
            enabled,
            continueOnMatch,
            updatedBy: req.session.user.id,
            updatedAt: new Date(),
          })
          .where(and(eq(emailRules.id, ruleId), applyDemoFilter(emailRules)))
          .returning();

        if (!updatedRule) {
          throw new Error("Rule not found");
        }

        // Delete existing conditions and actions
        await tx.delete(emailRuleConditions).where(eq(emailRuleConditions.ruleId, ruleId));
        await tx.delete(emailRuleActions).where(eq(emailRuleActions.ruleId, ruleId));

        // Insert new conditions if provided
        if (conditions && conditions.length > 0) {
          await tx.insert(emailRuleConditions).values(
            conditions.map((c: any, index: number) => ({
              ruleId: ruleId,
              kind: c.kind,
              operator: c.operator,
              value: c.value,
              orderIndex: c.orderIndex !== undefined ? c.orderIndex : index,
            }))
          );
        }

        // Insert new actions if provided
        if (actions && actions.length > 0) {
          await tx.insert(emailRuleActions).values(
            actions.map((a: any, index: number) => ({
              ruleId: ruleId,
              action: a.action,
              params: a.params,
              orderIndex: a.orderIndex !== undefined ? a.orderIndex : index,
            }))
          );
        }

        return updatedRule;
      });

      res.json(result);
    } catch (error: any) {
      console.error("Error updating email rule:", error);
      if ((error as any).message === "Rule not found") {
        return res.status(404).json({ message: "Email rule not found" });
      }
      res.status(500).json({ message: "Failed to update email rule" });
    }
  });

  // PATCH /api/email-automation/rules/:id/toggle - Toggle rule enabled status
  app.patch("/api/email-automation/rules/:id/toggle", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permission
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can toggle email automation rules" });
      }

      const ruleId = parseInt(req.params.id as string);

      // Get current status
      const [currentRule] = await storage.db
        .select({ enabled: emailRules.enabled })
        .from(emailRules)
        .where(and(eq(emailRules.id, ruleId), applyDemoFilter(emailRules)))
        .limit(1);

      if (!currentRule) {
        return res.status(404).json({ message: "Email rule not found" });
      }

      // Toggle status
      const [updatedRule] = await storage.db
        .update(emailRules)
        .set({
          enabled: !currentRule.enabled,
          updatedBy: req.session.user.id,
          updatedAt: new Date(),
        })
        .where(eq(emailRules.id, ruleId))
        .returning();

      res.json(updatedRule);
    } catch (error: any) {
      console.error("Error toggling email rule:", error);
      res.status(500).json({ message: "Failed to toggle email rule" });
    }
  });

  // DELETE /api/email-automation/rules/:id - Delete automation rule
  app.delete("/api/email-automation/rules/:id", isAuthenticated, async (req: any, res) => {
    try {
      // Check admin permission
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Only administrators can delete email automation rules" });
      }

      const ruleId = parseInt(req.params.id as string);

      // Delete rule (conditions and actions will cascade delete)
      await storage.db
        .delete(emailRules)
        .where(and(eq(emailRules.id, ruleId), applyDemoFilter(emailRules)));

      res.json({ success: true, message: "Email rule deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting email rule:", error);
      res.status(500).json({ message: "Failed to delete email rule" });
    }
  });

  // POST /api/email-automation/simulate - Simulate rule evaluation
  app.post("/api/email-automation/simulate", isAuthenticated, requireSectionEdit("config.workflow-automation"), async (req: any, res) => {
    try {
      const { ruleId, testContext } = req.body;

      if (!ruleId || !testContext) {
        return res.status(400).json({ message: "Rule ID and test context are required" });
      }

      // Get rule with conditions and actions
      const [rule] = await storage.db
        .select()
        .from(emailRules)
        .where(and(eq(emailRules.id, ruleId), applyDemoFilter(emailRules)))
        .limit(1);

      if (!rule) {
        return res.status(404).json({ message: "Email rule not found" });
      }

      const conditions = await storage.db
        .select()
        .from(emailRuleConditions)
        .where(eq(emailRuleConditions.ruleId, ruleId))
        .orderBy(emailRuleConditions.orderIndex);

      const actions = await storage.db
        .select()
        .from(emailRuleActions)
        .where(eq(emailRuleActions.ruleId, ruleId))
        .orderBy(emailRuleActions.orderIndex);

      // Simple simulation: evaluate conditions against test context
      const conditionResults = conditions.map((condition) => {
        // Extract value from JSONB condition.value
        const expectedValue = condition.value;
        const testValue = testContext[condition.kind];
        let passed = false;

        // Basic condition evaluation
        switch (condition.operator) {
          case 'equals':
            passed = testValue === expectedValue;
            break;
          case 'not_equals':
            passed = testValue !== expectedValue;
            break;
          case 'contains':
            passed = String(testValue).includes(String(expectedValue));
            break;
          case 'greater_than':
            passed = Number(testValue) > Number(expectedValue);
            break;
          case 'less_than':
            passed = Number(testValue) < Number(expectedValue);
            break;
          case 'in':
            passed = Array.isArray(expectedValue) && expectedValue.includes(testValue);
            break;
          default:
            passed = false;
        }

        return {
          kind: condition.kind,
          operator: condition.operator,
          expectedValue,
          testValue,
          passed,
        };
      });

      // Determine if all conditions pass (simple AND logic for now)
      const allConditionsPass = conditionResults.length === 0 || conditionResults.every((r) => r.passed);

      // Simulate actions that would execute
      const simulatedActions = actions.map((action) => ({
        action: action.action,
        orderIndex: action.orderIndex,
        params: action.params,
        wouldExecute: allConditionsPass,
      }));

      res.json({
        rule: {
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          triggerKeys: rule.triggerKeys,
        },
        testContext,
        conditionResults,
        allConditionsPass,
        simulatedActions,
        summary: {
          totalConditions: conditions.length,
          passedConditions: conditionResults.filter((r) => r.passed).length,
          wouldTrigger: allConditionsPass && rule.enabled,
          actionsToExecute: allConditionsPass ? actions.length : 0,
        },
      });
    } catch (error: any) {
      console.error("Error simulating email rule:", error);
      res.status(500).json({ message: "Failed to simulate email rule" });
    }
  });

  // GET /api/email-automation/stats - Get KPI statistics for Overview tab
  app.get("/api/email-automation/stats", isAuthenticated, async (req: any, res) => {
    try {
      // Get active/disabled rules count
      const allRules = await storage.db
        .select()
        .from(emailRules)
        .where(applyDemoFilter(emailRules));
      
      const activeRulesCount = allRules.filter(r => r.enabled).length;
      const disabledRulesCount = allRules.filter(r => !r.enabled).length;

      // Get emails sent in last 24h via automation. Action results live in
      // `metadata.executionResults` after the v0.7.53 audit-schema fix;
      // older code paths referenced `actionsSnapshot` which doesn't exist on
      // the table and so the count silently rolled back to 0 every time.
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const emailsSent24h = await storage.db
        .select()
        .from(emailRuleAudits)
        .where(and(gte(emailRuleAudits.createdAt, last24h), applyDemoFilter(emailRuleAudits)))
        .then(audits => {
          return audits.reduce((count, audit) => {
            const metadata = (audit as any).metadata as any;
            const executionResults = metadata?.executionResults;
            if (Array.isArray(executionResults)) {
              const successfulSends = executionResults.filter(
                (r: any) => r.action === 'send_email' && r.status === 'executed'
              ).length;
              return count + successfulSends;
            }
            return count;
          }, 0);
        });

      // Get scheduled emails count
      const statsDemo = isCurrentRequestDemo();
      const scheduledCount = await storage.db
        .select({ actionType: emailSchedules.actionType, isDemo: emailSchedules.isDemo })
        .from(emailSchedules)
        .where(
          and(
            eq(emailSchedules.active, true),
            sql`${emailSchedules.nextRunAt} > NOW()`
          )
        )
        .then(results => results.filter((r) => scheduleVisibleInMode(r, statsDemo)).length);

      // Calculate success rate (last 7 days)
      const last7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recent7daysAudits = await storage.db
        .select()
        .from(emailRuleAudits)
        .where(and(gte(emailRuleAudits.createdAt, last7days), applyDemoFilter(emailRuleAudits)));

      let totalAttempts = 0;
      let successfulSends = 0;

      recent7daysAudits.forEach(audit => {
        const metadata = (audit as any).metadata as any;
        const executionResults = metadata?.executionResults;
        if (Array.isArray(executionResults)) {
          executionResults.forEach((r: any) => {
            if (r.action === 'send_email') {
              totalAttempts++;
              if (r.status === 'executed') {
                successfulSends++;
              }
            }
          });
        }
      });

      const successRate = totalAttempts > 0 
        ? Math.round((successfulSends / totalAttempts) * 100) 
        : null;

      res.json({
        activeRulesCount,
        disabledRulesCount,
        emailsSent24h,
        scheduledCount,
        successRate,
      });
    } catch (error: any) {
      console.error("Error fetching email automation stats:", error);
      res.status(500).json({ message: "Failed to fetch email automation stats" });
    }
  });

  // GET /api/email-automation/execution-feed - Get execution audit logs with pagination
  app.get("/api/email-automation/execution-feed", isAuthenticated, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const sortBy = req.query.sortBy as string || 'triggeredAt';
      const sortOrder = req.query.sortOrder as string || 'desc';

      // Extract filter parameters
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : null;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : null;
      const triggerFilter = req.query.triggers ? (req.query.triggers as string).split(',') : [];
      const ruleFilter = req.query.rules ? (req.query.rules as string).split(',').map(Number) : [];
      const statusFilter = req.query.statuses ? (req.query.statuses as string).split(',') : [];

      // Validate sort field
      const validSortFields = ['triggeredAt', 'ruleName', 'triggerKey', 'duration'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'triggeredAt';
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      // Helper function to apply status filter to formatted audits
      const applyStatusFilter = (audits: any[]) => {
        if (statusFilter.length === 0) return audits;
        
        return audits.filter(audit => {
          const status = audit.actionsFailed > 0 ? 'failed' 
            : audit.actionsExecuted > 0 ? 'matched' 
            : 'skipped';
          return statusFilter.includes(status);
        });
      };

      // For ruleName sorting, we need to join with email_rules table
      if (sortField === 'ruleName') {
        // Build filter conditions array; each mode sees its own run history.
        const filterParts: SQL[] = [sql`a.is_demo = ${isCurrentRequestDemo()}`];
        
        if (startDate) {
          filterParts.push(sql`a.created_at >= ${startDate.toISOString()}`);
        }
        if (endDate) {
          const endDatePlusOne = new Date(endDate);
          endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
          filterParts.push(sql`a.created_at < ${endDatePlusOne.toISOString()}`);
        }
        if (triggerFilter.length > 0) {
          // Use parameterized query to prevent SQL injection
          filterParts.push(sql`a.event_key IN (${sql.join(triggerFilter.map(t => sql`${t}`), sql`, `)})`);
        }
        if (ruleFilter.length > 0) {
          // Use parameterized query to prevent SQL injection
          filterParts.push(sql`a.rule_id IN (${sql.join(ruleFilter.map(id => sql`${id}`), sql`, `)})`);
        }

        // Build the complete query conditionally. SELECT lists reference the
        // actual schema columns (input / metadata / execution_time_ms) — the
        // pre-v0.7.53 code asked for `project_id`/`conditions_snapshot`/
        // `actions_snapshot` which the table doesn't have, so this whole
        // branch was 500-ing in production.
        const baseSelect = sql`
          SELECT
            a.id,
            a.rule_id,
            a.event_key,
            a.input,
            a.decision,
            a.reason,
            a.email_log_id,
            a.execution_time_ms,
            a.metadata,
            a.created_at,
            r.name as rule_name
          FROM email_rule_audits a
          LEFT JOIN email_rules r ON a.rule_id = r.id
        `;
        const query = sql`${baseSelect} WHERE ${sql.join(filterParts, sql` AND `)}
          ORDER BY r.name ${sql.raw(order)}, a.created_at ${sql.raw(order)}
          LIMIT ${limit} OFFSET ${offset}`;

        const auditsWithRules = await storage.db.execute(query);

        // Format response
        let formattedAudits = auditsWithRules.rows.map((row: any) => {
          const metadata = row.metadata as any;
          const input = row.input as any;
          const executionResults = metadata?.executionResults || [];
          const actionsExecuted = executionResults.filter((r: any) => r.status === 'executed').length;
          const actionsSkipped = executionResults.filter((r: any) => r.status === 'skipped').length;
          const actionsFailed = executionResults.filter((r: any) => r.status === 'failed').length;

          return {
            id: row.id,
            ruleId: row.rule_id,
            ruleName: row.rule_name || 'Unknown Rule',
            triggerKey: row.event_key,
            projectId: input?.projectId ?? null,
            triggeredAt: row.created_at,
            decision: row.decision,
            reason: row.reason,
            actionsExecuted,
            actionsSkipped,
            actionsFailed,
            durationMs: row.execution_time_ms ?? null,
            conditionsSnapshot: metadata?.conditions ?? null,
            executionResults,
          };
        });

        // Apply status filter
        formattedAudits = (applyStatusFilter as any)(formattedAudits);

        // Get total count with filters. The filter parts name the audit
        // table "a", so the count reads it under the same alias.
        const countResult = await storage.db.execute(
          sql`SELECT count(*) AS count FROM email_rule_audits a WHERE ${sql.join(filterParts, sql` AND `)}`
        );
        const totalCount = Number((countResult.rows?.[0] as { count?: unknown } | undefined)?.count ?? 0);
        const adjustedTotal = statusFilter.length > 0 ? formattedAudits.length : totalCount;

        return res.json({
          audits: await withProjectNames(formattedAudits),
          pagination: {
            total: adjustedTotal,
            limit,
            offset,
            hasMore: statusFilter.length > 0 ? false : (offset + limit < totalCount),
          },
        });
      }

      // For duration sorting, fetch all and sort in memory (duration is calculated from JSONB)
      if (sortField === 'duration') {
        // Fetch all audits with filters
        let query = storage.db.select().from(emailRuleAudits);
        
        // Build filter conditions; each mode sees its own run history.
        const filterConditions: SQL[] = [applyDemoFilter(emailRuleAudits)];
        if (startDate) {
          filterConditions.push(gte(emailRuleAudits.createdAt, startDate));
        }
        if (endDate) {
          const endDatePlusOne = new Date(endDate);
          endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
          filterConditions.push(lt(emailRuleAudits.createdAt, endDatePlusOne));
        }
        if (triggerFilter.length > 0) {
          // Use parameterized query to prevent SQL injection
          filterConditions.push(sql`${emailRuleAudits.eventKey} IN (${sql.join(triggerFilter.map(t => sql`${t}`), sql`, `)})`);
        }
        if (ruleFilter.length > 0) {
          // Use parameterized query to prevent SQL injection
          filterConditions.push(sql`${emailRuleAudits.ruleId} IN (${sql.join(ruleFilter.map(id => sql`${id}`), sql`, `)})`);
        }
        
        // Apply WHERE filters
        if (filterConditions.length > 0) {
          query = (query as any).where(sql.join(filterConditions, sql` AND `));
        }
        
        const allAudits = await query;

        // Get rule details
        const ruleIds = [...new Set(allAudits.map(a => a.ruleId))];
        const rules = ruleIds.length > 0 
          ? await storage.db
              .select()
              .from(emailRules)
              .where(inArray(emailRules.id, ruleIds as number[]))
          : [];
        
        const ruleMap = new Map(rules.map(r => [r.id, r]));

        // Calculate duration and format
        const auditsWithDuration = allAudits.map(audit => {
          const rule = ruleMap.get(audit.ruleId as number);
          const metadata = (audit as any).metadata as any;
          const input = (audit as any).input as any;
          const executionResults = metadata?.executionResults || [];

          // Prefer the stored execution_time_ms (set by recordAudit); fall back
          // to per-action durationMs sum for older rows written before the
          // field was populated.
          let durationMs: number | null = (audit as any).executionTimeMs ?? null;
          if (durationMs == null && executionResults.length > 0) {
            durationMs = executionResults.reduce((sum: number, r: any) => sum + (r.durationMs || 0), 0);
          }

          return {
            id: audit.id,
            ruleId: audit.ruleId,
            ruleName: rule?.name || 'Unknown Rule',
            triggerKey: audit.eventKey,
            projectId: input?.projectId ?? null,
            triggeredAt: audit.createdAt,
            decision: (audit as any).decision,
            reason: (audit as any).reason,
            actionsExecuted: executionResults.filter((r: any) => r.status === 'executed').length,
            actionsSkipped: executionResults.filter((r: any) => r.status === 'skipped').length,
            actionsFailed: executionResults.filter((r: any) => r.status === 'failed').length,
            durationMs,
            conditionsSnapshot: metadata?.conditions ?? null,
            executionResults,
          };
        });

        // Apply status filter
        const filteredAudits = applyStatusFilter(auditsWithDuration);

        // Sort by duration (null values always go to end regardless of direction)
        filteredAudits.sort((a, b) => {
          // Handle nulls: always send to end
          if (a.durationMs === null && b.durationMs === null) return 0;
          if (a.durationMs === null) return 1;  // a goes after b
          if (b.durationMs === null) return -1; // b goes after a
          
          // Both have values, sort normally
          return order === 'ASC' ? a.durationMs - b.durationMs : b.durationMs - a.durationMs;
        });

        // Apply pagination
        const paginatedAudits = filteredAudits.slice(offset, offset + limit);
        
        return res.json({
          audits: await withProjectNames(paginatedAudits),
          pagination: {
            total: filteredAudits.length,
            limit,
            offset,
            hasMore: offset + limit < filteredAudits.length,
          },
        });
      }

      // For triggeredAt and triggerKey sorting, use regular query
      let orderByClause;
      if (sortField === 'triggeredAt') {
        orderByClause = order === 'ASC' 
          ? emailRuleAudits.createdAt
          : desc(emailRuleAudits.createdAt);
      } else {
        orderByClause = order === 'ASC'
          ? emailRuleAudits.eventKey
          : desc(emailRuleAudits.eventKey);
      }

      // Build query with filters
      let query = storage.db
        .select()
        .from(emailRuleAudits);

      // Build filter conditions
      const regularFilterConditions: SQL[] = [applyDemoFilter(emailRuleAudits)];
      if (startDate) {
        regularFilterConditions.push(gte(emailRuleAudits.createdAt, startDate));
      }
      if (endDate) {
        const endDatePlusOne = new Date(endDate);
        endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
        regularFilterConditions.push(lt(emailRuleAudits.createdAt, endDatePlusOne));
      }
      if (triggerFilter.length > 0) {
        // Use parameterized query to prevent SQL injection
        regularFilterConditions.push(sql`${emailRuleAudits.eventKey} IN (${sql.join(triggerFilter.map(t => sql`${t}`), sql`, `)})`);
      }
      if (ruleFilter.length > 0) {
        // Use parameterized query to prevent SQL injection
        regularFilterConditions.push(sql`${emailRuleAudits.ruleId} IN (${sql.join(ruleFilter.map(id => sql`${id}`), sql`, `)})`);
      }

      // Apply WHERE filters
      if (regularFilterConditions.length > 0) {
        query = (query as any).where(sql.join(regularFilterConditions, sql` AND `));
      }

      // Get audit logs with ordering
      const audits = await query
        .orderBy(orderByClause)
        .limit(limit)
        .offset(offset);

      // Get rule details for each audit
      const ruleIds = [...new Set(audits.map(a => a.ruleId))];
      const rules = ruleIds.length > 0
        ? await storage.db
            .select()
            .from(emailRules)
            .where(inArray(emailRules.id, ruleIds as number[]))
        : [];

      const ruleMap = new Map(rules.map(r => [r.id, r]));

      // Format response
      let formattedAudits = audits.map(audit => {
        const rule = ruleMap.get(audit.ruleId as number);
        const metadata = (audit as any).metadata as any;
        const input = (audit as any).input as any;

        // Extract execution summary
        const executionResults = metadata?.executionResults || [];
        const actionsExecuted = executionResults.filter((r: any) => r.status === 'executed').length;
        const actionsSkipped = executionResults.filter((r: any) => r.status === 'skipped').length;
        const actionsFailed = executionResults.filter((r: any) => r.status === 'failed').length;

        // Duration: prefer the stored execution_time_ms set by recordAudit.
        let durationMs: number | null = (audit as any).executionTimeMs ?? null;
        if (durationMs == null && executionResults.length > 0) {
          durationMs = executionResults.reduce((sum: number, r: any) => sum + (r.durationMs || 0), 0);
        }

        return {
          id: audit.id,
          ruleId: audit.ruleId,
          ruleName: rule?.name || 'Unknown Rule',
          triggerKey: audit.eventKey,
          projectId: input?.projectId ?? null,
          triggeredAt: audit.createdAt,
          decision: (audit as any).decision,
          reason: (audit as any).reason,
          actionsExecuted,
          actionsSkipped,
          actionsFailed,
          durationMs,
          conditionsSnapshot: metadata?.conditions ?? null,
          executionResults,
        };
      });

      // Apply status filter
      formattedAudits = applyStatusFilter(formattedAudits);

      // Get total count with filters
      let countQuery = storage.db
        .select({ count: sql<number>`count(*)` })
        .from(emailRuleAudits);
      
      if (regularFilterConditions.length > 0) {
        countQuery = (countQuery as any).where(sql.join(regularFilterConditions, sql` AND `));
      }
      
      const totalCount = await countQuery.then(results => Number(results[0]?.count || 0));
      
      // Note: If status filter is active, we need to adjust total count
      // Since status is calculated from JSONB, we can't filter it in SQL
      // For accurate pagination with status filter, we'd need to fetch all and count
      // For now, we'll provide approximate total (may be higher than actual filtered results)
      const adjustedTotal = statusFilter.length > 0 ? formattedAudits.length : totalCount;

      res.json({
        audits: await withProjectNames(formattedAudits),
        pagination: {
          total: adjustedTotal,
          limit,
          offset,
          hasMore: statusFilter.length > 0 ? false : (offset + limit < totalCount),
        },
      });
    } catch (error: any) {
      console.error("Error fetching execution feed:", error);
      res.status(500).json({ message: "Failed to fetch execution feed" });
    }
  });

  // GET /api/email-automation/config - Workflow Automation test mode.
  // Quiet hours and the hourly email limit live on Configuration ›
  // Scheduler (/api/scheduler/send-window).
  app.get("/api/email-automation/config", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      const config = await storage.getEmailAutomationConfig();
      res.json({
        testModeEnabled: config?.testModeEnabled ?? false,
        testEmailAddresses: config?.testEmailAddresses ?? [],
      });
    } catch (error: any) {
      console.error("Error fetching email automation config:", error);
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  // GET /api/email-automation/schedules - Get all automation schedules
  app.get("/api/email-automation/schedules", isAuthenticated, async (req: any, res) => {
    try {
      const schedules = await storage.db
        .select({
          id: emailSchedules.id,
          actionType: emailSchedules.actionType,
          ruleId: emailSchedules.ruleId,
          ruleName: emailRules.name,
          actionConfig: emailSchedules.actionConfig,
          rrule: emailSchedules.rrule,
          cron: emailSchedules.cron,
          timezone: emailSchedules.timezone,
          nextRunAt: emailSchedules.nextRunAt,
          lastRunAt: emailSchedules.lastRunAt,
          active: emailSchedules.active,
          metadata: emailSchedules.metadata,
          isDemo: emailSchedules.isDemo,
        })
        .from(emailSchedules)
        .leftJoin(
          emailRules,
          eq(emailSchedules.ruleId, emailRules.id)
        )
        .orderBy(emailSchedules.id);

      const lastRunStatuses = await storage.db.execute(
        sql`SELECT DISTINCT ON (schedule_id) schedule_id, status FROM automation_run_logs ORDER BY schedule_id, started_at DESC`
      );
      const statusMap: Record<number, string> = {};
      for (const row of lastRunStatuses.rows as any[]) {
        statusMap[row.schedule_id] = row.status;
      }

      const permissions = await resolveSchedulePermissions(req);
      const demo = isCurrentRequestDemo();
      const schedulesWithStatus = schedules
        .filter(s => scheduleVisibleInMode(s, demo) && permissions.canView(s.actionType))
        .map(s => ({
          ...s,
          lastRunStatus: statusMap[s.id] || null,
        }));

      res.json({ schedules: schedulesWithStatus });
    } catch (error: any) {
      console.error('Error fetching automation schedules:', error);
      res.status(500).json({ message: 'Failed to fetch schedules' });
    }
  });

  // GET /api/email-automation/action-types - Get available action types for scheduler
  app.get("/api/email-automation/action-types", isAuthenticated, async (req: any, res) => {
    try {
      const { ACTION_TYPES } = await import('../services/scheduled-action-service');
      res.json({ actionTypes: ACTION_TYPES });
    } catch (error: any) {
      console.error('Error fetching action types:', error);
      res.status(500).json({ message: 'Failed to fetch action types' });
    }
  });

  // POST /api/email-automation/schedules - Create a new automation schedule
  app.post("/api/email-automation/schedules", isAuthenticated, async (req: any, res) => {
    try {
      const { actionType, ruleId, actionConfig, rrule, cron, timezone, active, metadata } = req.body;
      
      // Validate action type
      const resolvedActionType = actionType || 'email_digest';
      
      if (!isScheduleActionType(resolvedActionType)) {
        return res.status(400).json({ message: `Invalid action type. Must be one of: ${SCHEDULE_ACTION_TYPES.join(', ')}` });
      }

      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canEdit(resolvedActionType)) {
        return res.status(403).json({ message: 'You do not have permission to create this schedule' });
      }

      // For email_digest, ruleId is required, and the rule must be one this
      // mode can see (a demo digest is a demo schedule; newScheduleIsDemo).
      if (resolvedActionType === 'email_digest' && !ruleId) {
        return res.status(400).json({ message: 'ruleId is required for email_digest action type' });
      }
      if (resolvedActionType === 'email_digest' && !(await ruleVisibleInMode(ruleId))) {
        return res.status(400).json({ message: 'Email rule not found' });
      }

      // Cron expression is always required
      if (!cron && !rrule) {
        return res.status(400).json({ message: 'cron expression is required' });
      }

      // Validate cron expression
      const { EmailScheduler } = await import('../services/scheduler');
      const scheduler = EmailScheduler.getInstance(storage);
      
      const cronExpr = cron || rrule;
      
      // Explicitly reject RRULE format
      if (cronExpr && cronExpr.toUpperCase().startsWith('RRULE:')) {
        return res.status(400).json({ 
          message: 'RRULE format is not supported yet. Please use cron expression format (e.g., "0 9 * * *")' 
        });
      }
      
      if (!scheduler.validateCronExpression(cronExpr)) {
        return res.status(400).json({ message: 'Invalid cron expression format' });
      }

      // Calculate next run time
      const nextRunAt = scheduler.calculateNextRun(cronExpr, timezone || 'America/New_York');
      if (!nextRunAt) {
        return res.status(400).json({ message: 'Could not calculate next run time for cron expression' });
      }

      // Reports read every project, so they may only go to staff users.
      if (resolvedActionType === REPORT_SCHEDULE_ACTION_TYPE) {
        const { reportRecipientProblem } = await import('../email/scheduled-report-email');
        const problem = await reportRecipientProblem(actionConfig);
        if (problem) return res.status(400).json({ message: problem });
      }

      // The creator is recorded server-side (Analytics › Calendar's Created By).
      const scheduleMetadata = {
        ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
        createdBy: req.session.user.id,
      };

      const [newSchedule] = await storage.db
        .insert(emailSchedules)
        .values({
          actionType: resolvedActionType,
          ruleId: resolvedActionType === 'email_digest' ? ruleId : null,
          actionConfig: actionConfig || null,
          rrule: rrule || null,
          cron: cron || null,
          timezone: timezone || 'America/New_York',
          active: active !== undefined ? active : true,
          metadata: scheduleMetadata,
          isDemo: newScheduleIsDemo(resolvedActionType, isCurrentRequestDemo()),
          nextRunAt,
        })
        .returning();

      res.status(201).json(newSchedule);
    } catch (error: any) {
      console.error('Error creating automation schedule:', error);
      res.status(500).json({ message: 'Failed to create schedule' });
    }
  });

  // PUT /api/email-automation/schedules/:id - Update an automation schedule
  app.put("/api/email-automation/schedules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = parseInt(req.params.id as string);
      const { actionType, ruleId, actionConfig, rrule, cron, timezone, active, metadata } = req.body;

      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }

      // Validate action type if provided
      if (actionType && !isScheduleActionType(actionType)) {
        return res.status(400).json({ message: `Invalid action type. Must be one of: ${SCHEDULE_ACTION_TYPES.join(', ')}` });
      }

      const [existing] = await storage.db
        .select({ actionType: emailSchedules.actionType, isDemo: emailSchedules.isDemo, metadata: emailSchedules.metadata })
        .from(emailSchedules)
        .where(eq(emailSchedules.id, scheduleId))
        .limit(1);
      if (!existing || !scheduleVisibleInMode(existing, isCurrentRequestDemo())) {
        return res.status(404).json({ message: 'Schedule not found' });
      }
      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canEdit(existing.actionType) || (actionType && !permissions.canEdit(actionType))) {
        return res.status(403).json({ message: 'You do not have permission to change this schedule' });
      }
      // A schedule keeps its mode: Demo Mode cannot turn a real operational
      // schedule into a demo digest or report, and a digest's rule must be
      // one this mode can see.
      const resultingActionType = actionType ?? existing.actionType ?? 'email_digest';
      if (newScheduleIsDemo(resultingActionType, isCurrentRequestDemo()) !== existing.isDemo) {
        return res.status(400).json({ message: 'This schedule cannot become that action type in this mode' });
      }
      if (resultingActionType === 'email_digest' && ruleId !== undefined && !(await ruleVisibleInMode(ruleId))) {
        return res.status(400).json({ message: 'Email rule not found' });
      }

      // Validate cron expression if provided (RRULE not supported yet)
      const { EmailScheduler } = await import('../services/scheduler');
      const scheduler = EmailScheduler.getInstance(storage);
      
      const cronExpr = cron || rrule;
      
      // Explicitly reject RRULE format
      if (cronExpr && cronExpr.toUpperCase().startsWith('RRULE:')) {
        return res.status(400).json({ 
          message: 'RRULE format is not supported yet. Please use cron expression format (e.g., "0 9 * * *")' 
        });
      }
      
      if (cronExpr && !scheduler.validateCronExpression(cronExpr)) {
        return res.status(400).json({ message: 'Invalid cron expression format' });
      }

      // Calculate next run time
      const nextRunAt = cronExpr 
        ? scheduler.calculateNextRun(cronExpr, timezone || 'America/New_York')
        : null;

      if ((actionType ?? existing.actionType) === REPORT_SCHEDULE_ACTION_TYPE && actionConfig !== undefined) {
        const { reportRecipientProblem } = await import('../email/scheduled-report-email');
        const problem = await reportRecipientProblem(actionConfig);
        if (problem) return res.status(400).json({ message: problem });
      }

      const updateData: any = {
        rrule: rrule || null,
        cron: cron || null,
        timezone: timezone || 'America/New_York',
        active: active !== undefined ? active : true,
        metadata: keepScheduleCreator(metadata, existing.metadata),
        updatedAt: new Date(),
      };
      
      if (nextRunAt) updateData.nextRunAt = nextRunAt;
      if (actionType) updateData.actionType = actionType;
      if (actionConfig !== undefined) updateData.actionConfig = actionConfig;
      if (ruleId !== undefined) updateData.ruleId = ruleId;

      const [updatedSchedule] = await storage.db
        .update(emailSchedules)
        .set(updateData)
        .where(eq(emailSchedules.id, scheduleId))
        .returning();

      if (!updatedSchedule) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      res.json(updatedSchedule);
    } catch (error: any) {
      console.error('Error updating automation schedule:', error);
      res.status(500).json({ message: 'Failed to update schedule' });
    }
  });

  // DELETE /api/email-automation/schedules/:id - Delete an email schedule
  app.delete("/api/email-automation/schedules/:id", isAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = parseInt(req.params.id as string);

      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }

      const [existing] = await storage.db
        .select({ actionType: emailSchedules.actionType, isDemo: emailSchedules.isDemo, metadata: emailSchedules.metadata })
        .from(emailSchedules)
        .where(eq(emailSchedules.id, scheduleId))
        .limit(1);
      if (!existing || !scheduleVisibleInMode(existing, isCurrentRequestDemo())) {
        return res.status(404).json({ message: 'Schedule not found' });
      }
      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canEdit(existing.actionType)) {
        return res.status(403).json({ message: 'You do not have permission to delete this schedule' });
      }

      const [deletedSchedule] = await storage.db
        .delete(emailSchedules)
        .where(eq(emailSchedules.id, scheduleId))
        .returning();

      if (!deletedSchedule) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      res.json({ message: 'Schedule deleted successfully', schedule: deletedSchedule });
    } catch (error: any) {
      console.error('Error deleting email schedule:', error);
      res.status(500).json({ message: 'Failed to delete schedule' });
    }
  });

  // GET /api/email-automation/schedules/:id/runs - Get run history for a schedule
  app.get("/api/email-automation/schedules/:id/runs", isAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = parseInt(req.params.id as string);
      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }

      const [schedule] = await storage.db
        .select({ actionType: emailSchedules.actionType, isDemo: emailSchedules.isDemo })
        .from(emailSchedules)
        .where(eq(emailSchedules.id, scheduleId))
        .limit(1);
      if (!schedule || !scheduleVisibleInMode(schedule, isCurrentRequestDemo())) {
        return res.status(404).json({ message: 'Schedule not found' });
      }
      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canView(schedule.actionType)) {
        return res.status(403).json({ message: 'You do not have permission to view this schedule' });
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = parseInt(req.query.offset as string) || 0;

      const [runs, totalResult] = await Promise.all([
        storage.db
          .select()
          .from(automationRunLogs)
          .where(eq(automationRunLogs.scheduleId, scheduleId))
          .orderBy(desc(automationRunLogs.startedAt))
          .limit(limit)
          .offset(offset),
        storage.db
          .select({ count: sql<number>`count(*)::int` })
          .from(automationRunLogs)
          .where(eq(automationRunLogs.scheduleId, scheduleId)),
      ]);

      res.json({ runs, total: totalResult[0]?.count || 0 });
    } catch (error: any) {
      console.error('Error fetching schedule run history:', error);
      res.status(500).json({ message: 'Failed to fetch run history' });
    }
  });

  // POST /api/email-automation/schedules/:id/trigger - Manually trigger a schedule
  app.post("/api/email-automation/schedules/:id/trigger", isAuthenticated, async (req: any, res) => {
    try {
      const scheduleId = parseInt(req.params.id as string);
      if (isNaN(scheduleId)) {
        return res.status(400).json({ message: 'Invalid schedule ID' });
      }

      const [schedule] = await storage.db
        .select()
        .from(emailSchedules)
        .where(eq(emailSchedules.id, scheduleId))
        .limit(1);

      if (!schedule || !scheduleVisibleInMode(schedule, isCurrentRequestDemo())) {
        return res.status(404).json({ message: 'Schedule not found' });
      }

      const permissions = await resolveSchedulePermissions(req);
      if (!permissions.canEdit(schedule.actionType)) {
        return res.status(403).json({ message: 'You do not have permission to run this schedule' });
      }
      if (schedule.isDemo) {
        return res.status(409).json({ message: 'Demo Mode schedules never run' });
      }

      const actionType = schedule.actionType || 'email_digest';
      const startedAt = new Date();

      let result: any;
      try {
        if (actionType === 'email_digest') {
          const { getAutomationEngine } = await import('../email/email-automation-engine');
          const engine = getAutomationEngine();
          result = await engine.processDigestSend(
            schedule.ruleId!,
            schedule.metadata,
            schedule.actionConfig as Record<string, unknown> | null,
          );
        } else {
          const { scheduledActionService } = await import('../services/scheduled-action-service');
          const config = schedule.actionConfig || {};
          result = await scheduledActionService.executeAction(actionType as any, { ...config }, scheduleId);
        }
      } catch (execError: any) {
        result = { success: false, message: execError.message || 'Execution failed' };
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      await storage.db.insert(automationRunLogs).values({
        scheduleId,
        actionType,
        status: result.success ? 'success' : 'failure',
        triggeredBy: 'manual',
        startedAt,
        completedAt,
        durationMs,
        message: result.message || null,
        rawOutput: result,
      });

      res.json({
        success: result.success,
        message: result.message,
        durationMs,
        rawOutput: result,
      });
    } catch (error: any) {
      console.error('Error triggering schedule manually:', error);
      res.status(500).json({ message: 'Failed to trigger schedule' });
    }
  });
  // PUT /api/email-automation/config - Update Workflow Automation test mode.
  app.put("/api/email-automation/config", isAuthenticated, async (req: any, res) => {
    try {
      if (req.session.user.role !== 'Admin') {
        return res.status(403).json({ message: "Access denied" });
      }

      const parsed = testModeConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid configuration" });
      }
      const { testModeEnabled, testEmailAddresses } = parsed.data;

      if (testModeEnabled && (!testEmailAddresses || testEmailAddresses.length === 0)) {
        return res.status(400).json({
          message: "Test mode requires at least one test email address"
        });
      }

      const result = await storage.updateEmailTestMode(
        { testModeEnabled, testEmailAddresses },
        req.session.user.id ?? null,
      );
      res.json({ testModeEnabled: result.testModeEnabled ?? false, testEmailAddresses: result.testEmailAddresses ?? [] });
    } catch (error: any) {
      console.error("Error updating email automation config:", error);
      res.status(500).json({ message: "Failed to update configuration" });
    }
  });
}
