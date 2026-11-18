// Activity / Sessions / Board Preferences — mixin for DatabaseStorage
// (Phase 7 #23). Bundles four "live UX state" concerns:
//
//   User Board Preferences   (per-user kanban swimlane prefs by dimension —
//                             status / risk / ranking / customer-status)
//   Kanban Audit Events      (audit feed for kanban-card moves so admins
//                             can trace who-moved-what-when across boards)
//   Project Activities       (per-project activity log feed with optional
//                             targetType filter and pagination)
//   User Accessible Projects (RLS lookup for external/customer-side users)
//   Audit Logins by User     (per-user login audit trail)
//   User Sessions            (active session list per user + create/update/
//                             revoke; pool-acquired client for the
//                             session-revoke / session-list paths)
//
// Behavior preserved verbatim. The two `this.db` call sites use bare `db`
// after extraction — Drizzle's `db.transaction` is not used here so the
// substitution is exact.
import { db, pool } from "../db";
import { eq, and, or, desc, inArray } from "drizzle-orm";
import {
  users,
  projects,
  customerAccess,
  activityLogs,
  auditLogins,
  userSessions,
  userBoardPreferences,
  kanbanAuditEvents,
} from "@shared/schema";
import type {
  ActivityLog,
  AuditLogin,
  Project,
  User,
  UserBoardPreference,
  UserSession,
  InsertUserSession,
  KanbanAuditEvent,
  InsertKanbanAuditEvent,
  PocWithRelations,
} from "@shared/schema";

export class ActivityStorageMixin {
  // User Board Preferences operations
  async getUserBoardPreferences(userId: string, dimension: string): Promise<UserBoardPreference | null> {
    const [preference] = await db
      .select()
      .from(userBoardPreferences)
      .where(and(
        eq(userBoardPreferences.userId, userId),
        eq(userBoardPreferences.dimension, dimension)
      ));
    return preference || null;
  }

  async saveUserBoardPreferences(data: {
    userId: string;
    dimension: string;
    columnOrder: any;
  }): Promise<UserBoardPreference> {
    const [saved] = await db
      .insert(userBoardPreferences)
      .values({
        userId: data.userId,
        dimension: data.dimension,
        columnOrder: data.columnOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userBoardPreferences.userId, userBoardPreferences.dimension],
        set: {
          columnOrder: data.columnOrder,
          updatedAt: new Date(),
        },
      })
      .returning();
    return saved;
  }

  // Kanban Audit Events operations
  async getKanbanAuditEvents(params: {
    dimension?: string;
    projectId?: number;
    limit?: number;
  }): Promise<(KanbanAuditEvent & { user: { id: string; firstName: string | null; lastName: string | null; email: string | null } })[]> {
    const { dimension, projectId, limit = 50 } = params;

    let query = db
      .select({
        id: kanbanAuditEvents.id,
        userId: kanbanAuditEvents.userId,
        eventType: kanbanAuditEvents.eventType,
        projectId: kanbanAuditEvents.projectId,
        dimension: kanbanAuditEvents.dimension,
        fromStatus: kanbanAuditEvents.fromStatus,
        toStatus: kanbanAuditEvents.toStatus,
        statusId: kanbanAuditEvents.statusId,
        orderedIds: kanbanAuditEvents.orderedIds,
        columnOrder: kanbanAuditEvents.columnOrder,
        metaPatch: kanbanAuditEvents.metaPatch,
        createdAt: kanbanAuditEvents.createdAt,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(kanbanAuditEvents)
      .leftJoin(users, eq(kanbanAuditEvents.userId, users.id))
      .orderBy(desc(kanbanAuditEvents.createdAt))
      .limit(limit).$dynamic();

    const conditions = [];
    if (dimension) {
      conditions.push(eq(kanbanAuditEvents.dimension, dimension));
    }
    if (projectId !== undefined) {
      conditions.push(eq(kanbanAuditEvents.projectId, projectId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query;
    return results as any;
  }

  async createKanbanAuditEvents(events: InsertKanbanAuditEvent[]): Promise<KanbanAuditEvent[]> {
    if (events.length === 0) {
      return [];
    }
    const inserted = await db.insert(kanbanAuditEvents).values(events).returning();
    return inserted;
  }


  async getProjectActivities(
    projectId: number,
    filters?: { targetTypes?: string[]; limit?: number; offset?: number }
  ): Promise<(ActivityLog & { user: User | null })[]> {
    const { targetTypes, limit = 100, offset = 0 } = filters || {};
    
    // Build where conditions
    const whereConditions = [eq(activityLogs.projectId, projectId)];
    if (targetTypes && targetTypes.length > 0) {
      whereConditions.push(inArray(activityLogs.targetType, targetTypes));
    }

    const activities = await db
      .select({
        id: activityLogs.id,
        projectId: activityLogs.projectId,
        userId: activityLogs.userId,
        action: activityLogs.action,
        details: activityLogs.details,
        targetType: activityLogs.targetType,
        targetId: activityLogs.targetId,
        createdAt: activityLogs.createdAt,
        user: {
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        }
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(and(...whereConditions))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return activities.map((activity) => ({
      ...activity,
      user: activity.user && activity.user.id ? activity.user : null // Return null if user doesn't exist
    })) as (ActivityLog & { user: User | null })[];
  }

  async getUserAccessibleProjects(userId: string): Promise<Project[]> {
    try {
      // Get user role first
      const user = await db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user.length) {
        return [];
      }

      const userRole = user[0].role;

      // Admins can access all projects
      if (userRole === 'Admin') {
        return await db.select().from(projects);
      }

      // Non-admins: get projects they have explicit access to
      const accessibleProjects = await db
        .select({
          id: projects.id,
          customerName: projects.customerName,
          businessFunction: (projects as any).businessFunction,
          title: (projects as any).title,
          description: (projects as any).description,
          status: projects.status,
          priority: (projects as any).priority,
          startDate: projects.startDate,
          endDate: projects.endDate,
          createdAt: projects.createdAt,
          updatedAt: projects.updatedAt
        })
        .from(projects)
        .innerJoin(customerAccess, eq(customerAccess.projectId, projects.id))
        .where(eq(customerAccess.userEmail, userId)); // Assuming userId is email for customer access

      return accessibleProjects as unknown as PocWithRelations[];
    } catch (error) {
      console.error('Error getting user accessible projects:', error);
      return [];
    }
  }

  async getAuditLoginsByUserId(userId: string, limit: number = 10): Promise<AuditLogin[]> {
    const client = await pool.connect();
    try {
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client acquired. Active connections:', pool.totalCount);
      const logins = await db
        .select()
        .from(auditLogins)
        .where(eq(auditLogins.userId, userId))
        .orderBy(desc(auditLogins.createdAt))
        .limit(limit);
      return logins;
    } finally {
      client.release();
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client released. Active connections:', pool.totalCount);
    }
  }

  async getUserSessions(userId: string): Promise<UserSession[]> {
    const client = await pool.connect();
    try {
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client acquired. Active connections:', pool.totalCount);
      const sessions = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.userId, userId))
        .orderBy(desc(userSessions.lastActive));
      return sessions;
    } finally {
      client.release();
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client released. Active connections:', pool.totalCount);
    }
  }

  async createUserSession(sessionData: InsertUserSession): Promise<UserSession> {
    const client = await pool.connect();
    try {
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client acquired. Active connections:', pool.totalCount);
      const [session] = await db
        .insert(userSessions)
        .values(sessionData)
        .returning();
      return session;
    } finally {
      client.release();
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client released. Active connections:', pool.totalCount);
    }
  }

  async updateUserSession(sessionId: string, lastActive: Date): Promise<void> {
    const client = await pool.connect();
    try {
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client acquired. Active connections:', pool.totalCount);
      await db
        .update(userSessions)
        .set({ lastActive })
        .where(eq(userSessions.sessionId, sessionId));
    } finally {
      client.release();
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client released. Active connections:', pool.totalCount);
    }
  }

  async revokeUserSession(sessionId: string): Promise<void> {
    const client = await pool.connect();
    try {
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client acquired. Active connections:', pool.totalCount);
      await db
        .delete(userSessions)
        .where(eq(userSessions.sessionId, sessionId));
    } finally {
      client.release();
      if (process.env.DEBUG_DB_POOL === 'true') console.log('Database client released. Active connections:', pool.totalCount);
    }
  }
}
