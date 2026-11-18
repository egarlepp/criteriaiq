// Email operations — mixin for DatabaseStorage (Phase 7 #10).
//
// Combines four related concerns under one mixin:
//   Email Logs           (sent-email audit trail with pagination)
//   Email Templates      (CRUD on user-authored templates by category)
//   Email Designs        (saved drag-and-drop email designs + default flag)
//   Email Configuration  (the singleton SMTP / SES / etc. config row)
//   Send Email Window    (quiet hours + max emails per hour, Scheduler page)
//
// Behavior preserved verbatim. Demo-mode isolation preserved on inserts
// via applyDemoFlag and on reads via applyDemoFilter (where present in
// the original methods).
import { db } from "../db";
import { eq, and, asc, desc, lt, sql, count } from "drizzle-orm";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import {
  emailLogs,
  emailTemplates,
  emailDesigns,
  emailConfiguration,
  emailAutomationConfig,
  emailHourlySendCounts,
  projectMapNotificationSettings,
} from "@shared/schema";
import type {
  EmailAutomationConfig,
  EmailLog,
  InsertEmailLog,
  EmailTemplate,
  InsertEmailTemplate,
  InsertEmailDesign,
} from "@shared/schema";

/** Fields of the Send Email Window an admin edits on Configuration › Scheduler. */
export interface EmailSendWindowPatch {
  quietHoursEnabled?: boolean;
  quietHoursStart?: number;
  quietHoursEnd?: number;
  quietHoursScope?: "digests" | "all";
  /** null = the server's timezone. */
  timezone?: string | null;
  /** 0 = no limit. */
  maxEmailsPerHour?: number;
}

const HOUR_MS = 60 * 60 * 1000;
/** Hourly counters older than this are deleted when a new hour starts. */
const HOURLY_COUNT_RETENTION_MS = 2 * 24 * HOUR_MS;

export function hourStartOf(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

export class EmailStorageMixin {
  // Email Log operations
  async createEmailLog(emailLog: InsertEmailLog): Promise<EmailLog> {
    const _newEmailLogInserted = await db
        .insert(emailLogs)
        .values(applyDemoFlag({ ...emailLog }) as typeof emailLogs.$inferInsert)
        .returning();
      const [newEmailLog] = _newEmailLogInserted as Array<typeof emailLogs.$inferSelect>;
    return newEmailLog;
  }

  async getEmailLogs(limit: number = 100): Promise<EmailLog[]> {
    return await db.select().from(emailLogs)
      .where(applyDemoFilter(emailLogs))
      .orderBy(desc(emailLogs.sentAt))
      .limit(limit);
  }

  async getEmailLogsPaginated(limit: number, offset: number, cursor?: number): Promise<{ emails: EmailLog[], total: number }> {
    const [emailResults, totalResult] = await Promise.all([
      cursor
        ? db.select().from(emailLogs)
            .where(and(lt(emailLogs.id, cursor), applyDemoFilter(emailLogs)))
            .orderBy(desc(emailLogs.id))
            .limit(limit)
        : db.select().from(emailLogs)
            .where(applyDemoFilter(emailLogs))
            .orderBy(desc(emailLogs.sentAt))
            .limit(limit)
            .offset(offset),
      db.select({ count: count() }).from(emailLogs).where(applyDemoFilter(emailLogs))
    ]);

    return {
      emails: emailResults,
      total: totalResult[0]?.count || 0
    };
  }

  async getEmailLog(id: number): Promise<EmailLog | undefined> {
    const [emailLog] = await db.select().from(emailLogs).where(and(eq(emailLogs.id, id), applyDemoFilter(emailLogs)));
    return emailLog;
  }

  // Email Template operations
  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    // Task #723 — auto-tag inserts from a demo session.
    const _newTemplateInserted = await db
        .insert(emailTemplates)
        .values(applyDemoFlag(template) as typeof emailTemplates.$inferInsert)
        .returning();
      const [newTemplate] = _newTemplateInserted as Array<typeof emailTemplates.$inferSelect>;
    return newTemplate;
  }

  async updateEmailTemplate(id: number, updates: Partial<InsertEmailTemplate>): Promise<EmailTemplate> {
    const [updatedTemplate] = await db
      .update(emailTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(emailTemplates.id, id))
      .returning();
    return updatedTemplate;
  }

  async deleteEmailTemplate(id: number): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  async getEmailTemplates(): Promise<EmailTemplate[] > {
    // Plain SELECT — all canonical seeding, missing-row insertion, and
    // content-aware `is_system` backfill is now done once at boot by
    // `seedSystemEmailTemplates` (Task #702). Prior to this task, every
    // `GET /api/email-templates` rebuilt the canonical map from
    // `SYSTEM_EMAIL_TEMPLATE_SEEDS`, scanned every row for a content-
    // pristine backfill candidate, and ran a now-dead missing-insert
    // path — all on the per-request hot path. Since Task #696 made the
    // boot seeder the single source of truth (it upserts every
    // canonical key at startup), none of that work was reachable in
    // steady state.
    // Task #723 — demo isolation
    return await db
      .select()
      .from(emailTemplates)
      .where(applyDemoFilter(emailTemplates))
      .orderBy(emailTemplates.category, emailTemplates.name);
  }

  async getEmailTemplate(id: number): Promise<EmailTemplate | undefined> {
    // Task #723 — gate by demo context.
    const [template] = await db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), applyDemoFilter(emailTemplates)));
    return template;
  }

  async getEmailTemplateByKey(templateKey: string): Promise<EmailTemplate | undefined> {
    // Task #723 — gate by demo context.
    const [template] = await db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.templateKey, templateKey), applyDemoFilter(emailTemplates)));
    return template;
  }

  async getEmailTemplatesByCategory(category: string): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates)
      .where(eq(emailTemplates.category, category))
      .orderBy(emailTemplates.name);
  }

  async getActiveEmailTemplates(): Promise<EmailTemplate[]> {
    return await db.select().from(emailTemplates)
      .where(eq(emailTemplates.isActive, true))
      .orderBy(emailTemplates.category, emailTemplates.name);
  }

  // Email Design operations
  async getEmailDesigns(activeOnly: boolean = false): Promise<any[]> {
    try {
      // Use Drizzle query builder instead of raw SQL
      let query = db.select().from(emailDesigns).$dynamic();

      if (activeOnly) {
        query = query.where(eq(emailDesigns.isActive, true));
      }

      const result = await query.orderBy(emailDesigns.createdAt);

      // Convert snake_case to camelCase for frontend
      return result.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        htmlRaw: row.htmlRaw,
        isActive: row.isActive,
        isSystem: row.isSystem,
        isDefault: row.isDefault === true,
        designVariables: row.designVariables || {},
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }));
    } catch (error) {
      console.error('Error fetching email designs:', error);
      throw error;
    }
  }

  async getEmailDesign(id: number): Promise<any | null> {
    try {
      // Use Drizzle query builder instead of raw SQL
      const result = await db.select()
        .from(emailDesigns)
        .where(eq(emailDesigns.id, id))
        .limit(1);

      const row = result[0];
      if (!row) return null;

      // Convert to camelCase for frontend
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        htmlRaw: row.htmlRaw,
        isActive: row.isActive,
        isSystem: row.isSystem,
        isDefault: row.isDefault === true,
        designVariables: row.designVariables || {},
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      };
    } catch (error) {
      console.error('Error fetching email design:', error);
      return null;
    }
  }

  async createEmailDesign(data: InsertEmailDesign): Promise<any> {
    try {

      const result = await db.execute(sql`
        INSERT INTO email_designs (name, description, html_raw, is_active, is_system, design_variables, created_by, created_at, updated_at)
        VALUES (${data.name}, ${data.description || ''}, ${data.htmlRaw}, ${data.isActive ?? true}, ${data.isSystem ?? false}, ${JSON.stringify(data.designVariables ?? {})}, ${data.createdBy ?? null}, NOW(), NOW())
        RETURNING id, name, description, html_raw, is_active, is_system, design_variables, created_by, created_at, updated_at
      `);

      const row = result.rows?.[0];
      if (!row) throw new Error('Failed to create email design');

      // Convert snake_case to camelCase for frontend
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        htmlRaw: row.html_raw,
        isActive: row.is_active,
        isSystem: row.is_system,
        designVariables: row.design_variables || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error creating email design:', error);
      throw error;
    }
  }

  async getEmailDesignByName(name: string): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT
          id,
          name,
          description,
          html_raw as "htmlRaw",
          design_variables as "designVariables",
          is_active as "isActive",
          is_default as "isDefault",
          is_system as "isSystem",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM email_designs
        WHERE name = ${name} AND is_active = true
        LIMIT 1
      `);
      return result.rows?.[0] || null;
    } catch (error) {
      console.error('Error fetching email design by name:', error);
      return null;
    }
  }

  // Returns the active design flagged `is_default = true`. Use this in
  // preference to looking up the design by name — the rebrand renamed the
  // default to "CriteriaIQ Default", and a future
  // rename or a customer-provided default would silently break a name-based
  // lookup. The is_default flag is the durable contract.
  async getDefaultEmailDesign(): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT
          id,
          name,
          description,
          html_raw as "htmlRaw",
          design_variables as "designVariables",
          is_active as "isActive",
          is_default as "isDefault",
          is_system as "isSystem",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM email_designs
        WHERE is_default = true AND is_active = true
        LIMIT 1
      `);
      return result.rows?.[0] || null;
    } catch (error) {
      console.error('Error fetching default email design:', error);
      return null;
    }
  }

  async updateEmailDesign(id: number, data: any): Promise<any> {
    try {

      const result = await db.execute(sql`
        UPDATE email_designs
        SET name = ${data.name}, description = ${data.description || ''}, html_raw = ${data.htmlRaw},
            is_active = ${data.isActive ?? true}, is_system = ${data.isSystem ?? false},
            design_variables = ${JSON.stringify(data.designVariables ?? {})}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at
      `);

      const row = result.rows?.[0];
      if (!row) throw new Error('Failed to update email design');

      // Convert snake_case to camelCase for frontend
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        htmlRaw: row.html_raw,
        isActive: row.is_active,
        isSystem: row.is_system,
        isDefault: row.is_default === true,
        designVariables: row.design_variables || {},
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Error updating email design:', error);
      throw error;
    }
  }

  async deleteEmailDesign(id: number): Promise<void> {
    try {
      // Mirror the DELETE /api/email-designs/:id route guard at the SQL
      // layer so the default design is never removed even if a future
      // caller skips the route check (Task #589). The default design
      // can only be deleted *after* another design has been promoted
      // via PATCH /api/email-designs/:id/set-default, which flips
      // `is_default` on the new default and back to false here.
      await db.execute(sql`
        DELETE FROM email_designs
        WHERE id = ${id}
          AND (is_system IS FALSE OR is_system IS NULL)
          AND (is_default IS FALSE OR is_default IS NULL)
      `);
    } catch (error) {
      console.error('Error deleting email design:', error);
      throw error;
    }
  }

  async setDefaultEmailDesign(id: number): Promise<any> {
    try {
      // Promote the chosen design to default and demote every other
      // design in a single transaction so two clicks in the UI cannot
      // race to leave zero (or two) defaults flagged. The design must
      // exist and be active — defaulting an inactive/missing design
      // would leave email templates without a wrapper.
      const promoted = await db.transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(emailDesigns)
          .where(eq(emailDesigns.id, id))
          .limit(1);
        if (!target) {
          const err: any = new Error('Email design not found');
          err.code = 'NOT_FOUND';
          throw err;
        }
        if (target.isActive === false) {
          const err: any = new Error('Cannot set an inactive design as default');
          err.code = 'INACTIVE_DESIGN';
          throw err;
        }
        await tx.execute(
          sql`UPDATE email_designs SET is_default = false, updated_at = NOW() WHERE is_default = true AND id <> ${id}`
        );
        const result = await tx.execute(sql`
          UPDATE email_designs
          SET is_default = true, updated_at = NOW()
          WHERE id = ${id}
          RETURNING id, name, description, html_raw, is_active, is_system, is_default, design_variables, created_by, created_at, updated_at
        `);
        return result.rows?.[0];
      });

      if (!promoted) throw new Error('Failed to set default email design');

      return {
        id: promoted.id,
        name: promoted.name,
        description: promoted.description,
        htmlRaw: promoted.html_raw,
        isActive: promoted.is_active,
        isSystem: promoted.is_system,
        isDefault: promoted.is_default === true,
        designVariables: promoted.design_variables || {},
        createdBy: promoted.created_by,
        createdAt: promoted.created_at,
        updatedAt: promoted.updated_at,
      };
    } catch (error) {
      console.error('Error setting default email design:', error);
      throw error;
    }
  }


  async getEmailConfiguration(): Promise<any | null> {
    const [config] = await db
      .select()
      .from(emailConfiguration)
      .limit(1);
    return config || null;
  }

  async createEmailConfiguration(data: Record<string, any>): Promise<any> {
    const [config] = await db
      .insert(emailConfiguration)
      .values(data as typeof emailConfiguration.$inferInsert)
      .returning();
    return config;
  }

  async updateEmailConfiguration(id: number, data: any): Promise<any> {
    const [config] = await db
      .update(emailConfiguration)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailConfiguration.id, id))
      .returning();
    return config;
  }

  async upsertEmailConfiguration(data: Record<string, any>): Promise<any> {
    const existing = await this.getEmailConfiguration();
    
    if (existing) {
      return this.updateEmailConfiguration(existing.id, data);
    } else {
      return this.createEmailConfiguration(data);
    }
  }

  // ── Send Email Window ────────────────────────────────────────────────

  /** The single email_automation_config row, or null before anyone saved one. */
  /**
   * The app-wide automation settings row. Always the oldest row: an
   * unordered LIMIT 1 can return a different row after an UPDATE, so with
   * a stray second row a save could land on one row and the next read
   * come from another.
   */
  async getEmailAutomationConfig(): Promise<EmailAutomationConfig | null> {
    const [row] = await db.select().from(emailAutomationConfig).orderBy(asc(emailAutomationConfig.id)).limit(1);
    return row ?? null;
  }

  async updateEmailSendWindow(patch: EmailSendWindowPatch, userId: string | null): Promise<EmailAutomationConfig> {
    const set: Partial<typeof emailAutomationConfig.$inferInsert> = { updatedAt: new Date(), updatedBy: userId };
    if (patch.quietHoursEnabled !== undefined) set.quietHoursEnabled = patch.quietHoursEnabled;
    if (patch.quietHoursStart !== undefined) set.defaultQuietHoursStart = patch.quietHoursStart;
    if (patch.quietHoursEnd !== undefined) set.defaultQuietHoursEnd = patch.quietHoursEnd;
    if (patch.quietHoursScope !== undefined) set.quietHoursScope = patch.quietHoursScope;
    if (patch.timezone !== undefined) set.sendWindowTimezone = patch.timezone;
    if (patch.maxEmailsPerHour !== undefined) set.maxEmailsPerHour = patch.maxEmailsPerHour;
    return this.upsertEmailAutomationConfig(set);
  }

  /** Workflow Automation's test mode (reroutes rule emails to test inboxes). */
  async updateEmailTestMode(
    patch: { testModeEnabled?: boolean; testEmailAddresses?: string[] },
    userId: string | null,
  ): Promise<EmailAutomationConfig> {
    const set: Partial<typeof emailAutomationConfig.$inferInsert> = { updatedAt: new Date(), updatedBy: userId };
    if (patch.testModeEnabled !== undefined) set.testModeEnabled = patch.testModeEnabled;
    if (patch.testEmailAddresses !== undefined) set.testEmailAddresses = patch.testEmailAddresses;
    return this.upsertEmailAutomationConfig(set);
  }

  private async upsertEmailAutomationConfig(
    set: Partial<typeof emailAutomationConfig.$inferInsert>,
  ): Promise<EmailAutomationConfig> {
    const existing = await this.getEmailAutomationConfig();
    if (existing) {
      const [row] = await db
        .update(emailAutomationConfig)
        .set(set)
        .where(eq(emailAutomationConfig.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(emailAutomationConfig).values(set).returning();
    return row;
  }

  /**
   * Take one slot of this hour's automated-email budget. True when the
   * email may go out. One atomic upsert, so several server copies sharing
   * the database never exceed `max` between them. `max` <= 0 = no limit
   * (still counted, so the Scheduler page can show this hour's total).
   */
  async reserveHourlyEmailSlot(max: number, now: Date = new Date()): Promise<boolean> {
    const hourStart = hourStartOf(now);
    const limited = max > 0;
    const rows = await db
      .insert(emailHourlySendCounts)
      .values({ hourStart, sentCount: 1 })
      .onConflictDoUpdate({
        target: emailHourlySendCounts.hourStart,
        set: { sentCount: sql`${emailHourlySendCounts.sentCount} + 1` },
        ...(limited ? { setWhere: lt(emailHourlySendCounts.sentCount, max) } : {}),
      })
      .returning({ sentCount: emailHourlySendCounts.sentCount });
    if (rows.length === 0) return false;
    if (rows[0].sentCount === 1) {
      // First email of a new hour: drop counters nobody reads any more.
      await db
        .delete(emailHourlySendCounts)
        .where(lt(emailHourlySendCounts.hourStart, new Date(hourStart.getTime() - HOURLY_COUNT_RETENTION_MS)));
    }
    return true;
  }

  /** Automated emails counted so far in the current clock hour. */
  async getHourlyEmailSendCount(now: Date = new Date()): Promise<number> {
    const [row] = await db
      .select({ sentCount: emailHourlySendCounts.sentCount })
      .from(emailHourlySendCounts)
      .where(eq(emailHourlySendCounts.hourStart, hourStartOf(now)));
    return row?.sentCount ?? 0;
  }

  /** Saves which MAP events email one person on one project (the drawer's Notifications tab). */
  async upsertProjectMapNotificationSettings(
    projectId: number,
    userId: string,
    settings: { phasesSettings: string[]; stepsSettings: string[]; tasksSettings: string[] },
  ): Promise<void> {
    const now = new Date();
    await db
      .insert(projectMapNotificationSettings)
      .values({ projectId, userId, ...settings, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [projectMapNotificationSettings.projectId, projectMapNotificationSettings.userId],
        set: { ...settings, updatedAt: now },
      });
  }
}
