// Core domain — User + Dashboard Metrics + Project (POC) operations.
// Mixin for DatabaseStorage (Phase 7 #28 — final core extraction).
//
// Bundles the foundational entities that everything else hangs off:
//
//   User operations              (getUser, upsertUser — the primary
//                                 read+upsert path used by every login;
//                                 admin CRUD lives in UsersStorageMixin)
//   Dashboard Metrics            (the bulletin-board metrics rollup
//                                 driving the home page tiles)
//   Project (POC) operations     (createPoc/createProject, update,
//                                 delete, getPoc, getProjectById,
//                                 getProjects with full filter +
//                                 search + pagination support)
//
// Behavior preserved verbatim. Cross-mixin calls reach into
// AuditRiskStorageMixin.getProjectAuditCount via the prototype chain.
import { db } from "../db";
import { eq, and, or, desc, count, sql, inArray, ilike, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { applyDemoFilter, applyDemoFlag } from "../lib/demo-storage";
import { freshLogoUrl } from "../lib/customer-logo";
import { projectCustomerJoin, withResolvedCustomerId } from "./_project-customer";
import {
  users,
  projects,
  customers,
  customerAccess,
  dashboardMetrics,
  activityLogs,
  successCriteria,
  products,
  tags,
  statusConfigs,
} from "@shared/schema";
import type {
  User,
  UpsertUser,
  DashboardMetric,
  NewDashboardMetric,
  Project,
  InsertProject,
  Poc,
  InsertPoc,
  PocWithRelations,
  ActivityLog,
  ProjectStatusChange,
} from "@shared/schema";

// Cross-mixin call surface: getProjectById reaches into the audit-risk
// mixin for getProjectAuditCount. Phantom interface lets tsc resolve
// `this.<method>` against the composed DatabaseStorage at runtime
// without forcing a circular import on `../storage`.
interface AuditCountShape {
  getProjectAuditCount(projectId: number): Promise<number>;
}

export interface CoreStorageMixin extends AuditCountShape {}
export class CoreStorageMixin {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    if (!db) {
      throw new Error('Database not configured');
    }

    const [user] = (await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning()) as User[];
    return user;
  }

  // Dashboard Metrics operations
  async getDashboardMetrics(): Promise<DashboardMetric[]> {
    return await db.select().from(dashboardMetrics);
  }

  async createDashboardMetric(metric: NewDashboardMetric): Promise<DashboardMetric> {
    const [newMetric] = await db
      .insert(dashboardMetrics)
      .values(metric)
      .returning();
    return newMetric;
  }

  // Project operations
  async createPoc(poc: InsertPoc): Promise<Poc> {
    // Task #723 — auto-tag inserts from a demo session.
    const values = await withResolvedCustomerId(poc);
    const result = await db.insert(projects).values(applyDemoFlag(values)).returning();
    const [newPoc] = result as Poc[];
    return newPoc;
  }

  async createProject(project: InsertProject): Promise<Project> {
    // Task #723 — auto-tag inserts from a demo session.
    const values = await withResolvedCustomerId(project);
    const result = await db.insert(projects).values(applyDemoFlag(values)).returning();
    const [newProject] = result as Project[];
    return newProject;
  }

  async updatePoc(id: number, updates: Partial<InsertPoc>): Promise<Poc> {
    // The form sends customerName on every save. Re-link only when the name
    // actually changed, so an unresolved (NULL) or explicitly set id isn't
    // touched by an unrelated edit.
    let values = updates;
    if (updates.customerId === undefined && typeof updates.customerName === "string") {
      const [current] = await db
        .select({ customerName: projects.customerName })
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      const sameName = current?.customerName?.trim().toLowerCase() === updates.customerName.trim().toLowerCase();
      if (!sameName) values = await withResolvedCustomerId(updates);
    }
    const [updatedPoc] = await db
      .update(projects)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updatedPoc;
  }

  async deletePoc(id: number): Promise<void> {
    // First delete all related data to avoid foreign key constraints

    // Delete activity logs first
    await db.delete(activityLogs).where(eq(activityLogs.projectId, id));

    // Delete success criteria
    await db.delete(successCriteria).where(eq(successCriteria.projectId, id));

    // Note: File attachments are stored as JSON in the projects table, so no separate deletion needed

    // Finally delete the project itself
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getPoc(id: number): Promise<PocWithRelations | undefined> {
    return this.getProjectById(id);
  }

  async getProjectById(id: number): Promise<PocWithRelations | undefined> {
    // Create aliases for multiple user joins
    const primaryEngineer = alias(users, 'primaryEngineer') as unknown as typeof users;
    const accountRepresentative = alias(users, 'accountRepresentative') as unknown as typeof users;
    const specialistEngineer = alias(users, 'specialistEngineer') as unknown as typeof users;
    const opportunityEngineer = alias(users, 'opportunityEngineer') as unknown as typeof users;

    const [poc] = await db
      .select({
        projects,
        primaryEngineer,
        accountRepresentative,
        specialistEngineer,
        opportunityEngineer,
        customerLogoLive: customers.logoUrl,
      })
      .from(projects)
      .leftJoin(primaryEngineer, eq(projects.primaryEngineerId, primaryEngineer.id))
      .leftJoin(accountRepresentative, eq(projects.accountRepresentativeId, accountRepresentative.id))
      .leftJoin(specialistEngineer, eq(projects.specialistEngineerId, specialistEngineer.id))
      .leftJoin(opportunityEngineer, eq(projects.opportunityEngineerId, opportunityEngineer.id))
      .leftJoin(customers, projectCustomerJoin)
      .where(eq(projects.id, id));
    

    if (!poc) return undefined;

    const criteriaResults = await db
      .select({
        id: successCriteria.id,
        projectId: successCriteria.projectId,
        productName: successCriteria.productName,
        criterion: successCriteria.criterion,
        expectedOutcome: successCriteria.expectedOutcome,
        actionItem: successCriteria.actionItem,
        status: successCriteria.status,
        notes: successCriteria.notes,
        isActive: successCriteria.isActive,
        lineNumber: successCriteria.lineNumber,
        componentName: successCriteria.componentName,
        valueMappingName: successCriteria.valueMappingName,
        createdAt: successCriteria.createdAt,
        updatedAt: successCriteria.updatedAt,
        solutionIcon: products.solutionIcon,
        solutionIconName: products.solutionIconName,
      })
      .from(successCriteria)
      .leftJoin(products, eq(successCriteria.productName, products.name))
      .where(eq(successCriteria.projectId, id));

    const activityResults = await db
      .select({
        id: activityLogs.id,
        projectId: activityLogs.projectId,
        userId: activityLogs.userId,
        action: activityLogs.action,
        details: activityLogs.details,
        targetType: activityLogs.targetType,
        targetId: activityLogs.targetId,
        createdAt: activityLogs.createdAt,
        user: users,
      })
      .from(activityLogs)
      .leftJoin(users, eq(activityLogs.userId, users.id))
      .where(eq(activityLogs.projectId, id))
      .orderBy(desc(activityLogs.createdAt));

    // Get supporting sales engineers if they exist
    let supportingSalesEngineers: any[] = [];
    let additionalSupportingTeam: any[] = [];
    let enrichedCustomerUsers: any[] = [];
    let enrichedAdditionalAccess: any[] = [];

    if (poc.projects.supportingEngineers && poc.projects.supportingEngineers.length > 0) {
      supportingSalesEngineers = await db
        .select()
        .from(users)
        .where(inArray(users.id, poc.projects.supportingEngineers));
    }

    if (poc.projects.additionalSupportingTeam && poc.projects.additionalSupportingTeam.length > 0) {
      additionalSupportingTeam = await db
        .select()
        .from(users)
        .where(inArray(users.id, poc.projects.additionalSupportingTeam));
    }

    // Enrich customerUsers (stored as {userId, permission} objects)
    if (poc.projects.customerUsers && Array.isArray(poc.projects.customerUsers) && poc.projects.customerUsers.length > 0) {
      const customerUserIds = (poc.projects.customerUsers as Array<{userId: string, permission: string}>).map((cu) => cu.userId);
      if (customerUserIds.length > 0) {
        const customerUsersData = await db
          .select()
          .from(users)
          .where(inArray(users.id, customerUserIds));
        
        // Map users back with their permissions
        const customerArray = poc.projects.customerUsers as Array<{userId: string, permission: string}>;
        enrichedCustomerUsers = customerUsersData.map((user) => {
          const originalCustomer = customerArray.find((cu) => cu.userId === user.id);
          return {
            ...user,
            permission: originalCustomer?.permission || 'View'
          };
        });
      }
    }

    // Enrich additionalAccess (stored as {userId, permission} objects)
    if (poc.projects.additionalAccess && Array.isArray(poc.projects.additionalAccess) && poc.projects.additionalAccess.length > 0) {
      const additionalUserIds = (poc.projects.additionalAccess as Array<{userId: string, permission: string}>).map((aa) => aa.userId);
      if (additionalUserIds.length > 0) {
        const additionalUsers = await db
          .select()
          .from(users)
          .where(inArray(users.id, additionalUserIds));
        
        // Map users back with their permissions
        const accessArray = poc.projects.additionalAccess as Array<{userId: string, permission: string}>;
        enrichedAdditionalAccess = additionalUsers.map((user) => {
          const originalAccess = accessArray.find((aa) => aa.userId === user.id);
          return {
            ...user,
            permission: originalAccess?.permission || 'View'
          };
        });
      }
    }

    // Get customer access information
    const customerAccessResults = await db
      .select()
      .from(customerAccess)
      .where(eq(customerAccess.projectId, id));

    return {
      ...poc.projects,
      // Cloud logo links are signed and expire; re-sign both the account's
      // current logo and the copy saved on the project.
      customerLogo: await freshLogoUrl(poc.projects.customerLogo),
      customerLogoLive: await freshLogoUrl(poc.customerLogoLive),
      primarySe: poc.primaryEngineer,
      specialistSe: poc.specialistEngineer,
      accountRepresentative: poc.accountRepresentative ? {
        ...poc.accountRepresentative,
        firstName: poc.accountRepresentative.firstName,
        lastName: poc.accountRepresentative.lastName,
      } : null,
      opportunityEngineer: poc.opportunityEngineer ? {
        ...poc.opportunityEngineer,
        firstName: poc.opportunityEngineer.firstName,
        lastName: poc.opportunityEngineer.lastName,
      } : null,
      supportingSalesEngineers,
      additionalSupportingTeam,
      customerUsers: enrichedCustomerUsers,
      additionalAccess: enrichedAdditionalAccess,
      successCriteria: criteriaResults,
      activityLogs: activityResults.filter((activity) => activity.user !== null) as (ActivityLog & { user: User })[],
      customerAccess: customerAccessResults,
    } as unknown as PocWithRelations;
  }

  async getProjects(
    userId: string,
    filters?: {
      status?: string;
      customerName?: string;
      search?: string;
      // CRM lookup filters (server/lib/crm-record-fields.ts). Id lists are
      // the stored forms to match; evaluationId is the 18-character id.
      crmOpportunityIds?: string[];
      crmAccountIds?: string[];
      evaluationId?: string;
    }
  ): Promise<PocWithRelations[]> {
    // Create aliases for multiple user joins
    const primaryUser = alias(users, 'primaryUser') as unknown as typeof users;

    let query = db
      .select({
        poc: projects,
        primarySe: primaryUser,
        statusConfig: statusConfigs,
      })
      .from(projects)
      .leftJoin(primaryUser, eq(projects.primaryEngineerId, primaryUser.id))
      .leftJoin(statusConfigs, sql`LOWER(${projects.status}) = LOWER(${statusConfigs.name})`).$dynamic();

    const conditions = [];

    // Task #723 — gate by demo context.
    conditions.push(applyDemoFilter(projects));

    // Note: Removed user restriction since role-based access control is handled in routes
    // Admin users should be able to see all projects

    if (filters?.status) {
      // Use case-insensitive comparison since DB stores lowercase but UI uses title case
      conditions.push(sql`LOWER(${projects.status}) = LOWER(${filters.status})`);
    }

    if (filters?.customerName) {
      conditions.push(ilike(projects.customerName, `%${filters.customerName}%`));
    }

    if (filters?.search) {
      conditions.push(
        or(
          ilike(projects.customerName, `%${filters.search}%`),
          ilike(projects.solutionName, `%${filters.search}%`)
        )
      );
    }

    if (filters?.crmOpportunityIds) {
      conditions.push(inArray(projects.crmOpportunityId, filters.crmOpportunityIds));
    }

    if (filters?.crmAccountIds) {
      conditions.push(inArray(projects.crmAccountId, filters.crmAccountIds));
    }

    if (filters?.evaluationId) {
      // Candidate match only: a link holds the id in its 15- or
      // 18-character form, and both start with the same 15 case-sensitive
      // characters. The route re-checks the parsed id exactly.
      const id15 = filters.evaluationId.slice(0, 15);
      conditions.push(sql`strpos(${projects.salesforceEvaluationLink}, ${id15}) > 0`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    const results = await query.orderBy(desc(projects.updatedAt));

    // Competitor names per project (the Manage Projects hover lists them).
    const competitorRows = await db.execute(sql`
      SELECT pc.project_id, c.name
      FROM project_competitors pc
      JOIN competitors c ON c.id = pc.competitor_id
      ORDER BY pc.project_id, c.name
    `);
    const competitorNamesMap = new Map<number, string[]>();
    for (const row of competitorRows.rows) {
      const projectId = Number(row.project_id);
      const names = competitorNamesMap.get(projectId) ?? [];
      names.push(String(row.name));
      competitorNamesMap.set(projectId, names);
    }

    // Who last set each status, and when: the newest project_audits row per
    // project for the two status fields.
    const statusChangeRows = await db.execute(sql`
      SELECT DISTINCT ON (project_id, field_name)
        project_id, field_name, user_name,
        -- timestamp without time zone holds session-zone wall time; make it an instant
        created_at AT TIME ZONE current_setting('TimeZone') AS created_at
      FROM project_audits
      WHERE field_name IN ('status', 'customerStatus')
      ORDER BY project_id, field_name, created_at DESC
    `);
    const statusChangeMap = new Map<string, ProjectStatusChange>();
    for (const row of statusChangeRows.rows) {
      const at = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ? String(row.created_at) : null;
      statusChangeMap.set(`${Number(row.project_id)}:${String(row.field_name)}`, {
        by: row.user_name ? String(row.user_name) : null,
        at,
      });
    }

    // Get success criteria for each Project
    const projectsWithRelations: PocWithRelations[] = [];
    for (const result of results) {
      const criteriaResults = await db
        .select()
        .from(successCriteria)
        .where(eq(successCriteria.projectId, result.poc.id));

      const activityResults = await db
        .select({
          id: activityLogs.id,
          projectId: activityLogs.projectId,
          userId: activityLogs.userId,
          action: activityLogs.action,
          details: activityLogs.details,
          targetType: activityLogs.targetType,
          targetId: activityLogs.targetId,
          createdAt: activityLogs.createdAt,
          user: users,
        })
        .from(activityLogs)
        .leftJoin(users, eq(activityLogs.userId, users.id))
        .where(eq(activityLogs.projectId, result.poc.id))
        .orderBy(desc(activityLogs.createdAt))
        .limit(5);

      // Use the already-joined primary engineer data
      const primarySe = result.primarySe;

      // Fetch other engineer relationships
      let specialistSe = null;
      let supportingSalesEngineers: any[] = [];
      let additionalSupportingTeam: any[] = [];
      let enrichedCustomerUsers: any[] = [];
      let enrichedAdditionalAccess: any[] = [];

      if (result.poc.specialistEngineerId) {
        const [specialist] = await db
          .select()
          .from(users)
          .where(eq(users.id, result.poc.specialistEngineerId));
        specialistSe = specialist || null;
      }

      if (result.poc.supportingEngineers && result.poc.supportingEngineers.length > 0) {
        supportingSalesEngineers = await db
          .select()
          .from(users)
          .where(inArray(users.id, result.poc.supportingEngineers));
      }

      if (result.poc.additionalSupportingTeam && result.poc.additionalSupportingTeam.length > 0) {
        additionalSupportingTeam = await db
          .select()
          .from(users)
          .where(inArray(users.id, result.poc.additionalSupportingTeam));
      }

      // Enrich customerUsers (stored as {userId, permission} objects)
      if (result.poc.customerUsers && Array.isArray(result.poc.customerUsers) && result.poc.customerUsers.length > 0) {
        const customerUserIds = (result.poc.customerUsers as Array<{userId: string, permission: string}>).map((cu) => cu.userId);
        if (customerUserIds.length > 0) {
          const customerUsersData = await db
            .select()
            .from(users)
            .where(inArray(users.id, customerUserIds));
          
          // Map users back with their permissions
          const customerArray = result.poc.customerUsers as Array<{userId: string, permission: string}>;
          enrichedCustomerUsers = customerUsersData.map((user) => {
            const originalCustomer = customerArray.find((cu) => cu.userId === user.id);
            return {
              ...user,
              permission: originalCustomer?.permission || 'View'
            };
          });
        }
      }

      // Enrich additionalAccess (stored as {userId, permission} objects)
      if (result.poc.additionalAccess && Array.isArray(result.poc.additionalAccess) && result.poc.additionalAccess.length > 0) {
        const additionalUserIds = (result.poc.additionalAccess as Array<{userId: string, permission: string}>).map((aa) => aa.userId);
        if (additionalUserIds.length > 0) {
          const additionalUsers = await db
            .select()
            .from(users)
            .where(inArray(users.id, additionalUserIds));
          
          // Map users back with their permissions
          const accessArray = result.poc.additionalAccess as Array<{userId: string, permission: string}>;
          enrichedAdditionalAccess = additionalUsers.map((user) => {
            const originalAccess = accessArray.find((aa) => aa.userId === user.id);
            return {
              ...user,
              permission: originalAccess?.permission || 'View'
            };
          });
        }
      }

      // Get actual products based on solutionName
      let projectProducts: { id: number; name: string }[] = [];
      if (result.poc.solutionName) {
        try {
          // Parse solutionName - it could be JSON array or comma-separated string
          let solutionNames: string[] = [];
          
          if (typeof result.poc.solutionName === 'string') {
            const solutionNameStr: string = result.poc.solutionName;
            try {
              const parsed = JSON.parse(solutionNameStr);
              if (Array.isArray(parsed)) {
                solutionNames = parsed;
              } else {
                solutionNames = solutionNameStr.split(',').map((s: string) => s.trim());
              }
            } catch (e) {
              solutionNames = solutionNameStr.split(',').map((s: string) => s.trim());
            }
          } else if (Array.isArray(result.poc.solutionName)) {
            solutionNames = result.poc.solutionName;
          }
          
          // Fetch products matching these solution names
          if (solutionNames.length > 0) {
            const matchedProducts = await db
              .select({ id: products.id, name: products.name })
              .from(products)
              .where(inArray(products.name, solutionNames));
            projectProducts = matchedProducts;
          }
        } catch (error) {
          console.error(`Error parsing products for project ${result.poc.id}:`, error);
        }
      }

      // Get audit count for this project
      const auditCount = await this.getProjectAuditCount(result.poc.id);

      const projectWithRelations = {
        ...result.poc,
        primarySe,
        specialistSe,
        supportingSalesEngineers,
        additionalSupportingTeam,
        customerUsers: enrichedCustomerUsers,
        additionalAccess: enrichedAdditionalAccess,
        products: projectProducts,
        successCriteria: criteriaResults,
        activityLogs: activityResults.filter((activity) => activity.user !== null) as (ActivityLog & { user: User })[],
        auditCount,
        statusConfig: result.statusConfig,
        competitorCount: competitorNamesMap.get(result.poc.id)?.length ?? 0,
        competitorNames: competitorNamesMap.get(result.poc.id) ?? [],
        statusChange: statusChangeMap.get(`${result.poc.id}:status`) ?? null,
        customerStatusChange: statusChangeMap.get(`${result.poc.id}:customerStatus`) ?? null,
      } as unknown as PocWithRelations;

      projectsWithRelations.push(projectWithRelations);
    }

    return projectsWithRelations;
  }
}
