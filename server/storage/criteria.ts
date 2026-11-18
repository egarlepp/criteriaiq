// Success Criteria + Components + Activity Logs — mixin for
// DatabaseStorage (Phase 7 #27).
//
// Bundles three closely-coupled per-project domains:
//
//   Success Criteria operations    (per-project criteria CRUD with stable
//                                   line-number assignment, hierarchical
//                                   delete-by-criteria/outcome/product
//                                   helpers, criteria/outcome/action getters
//                                   used by the project Detail page)
//   Components management          (optional layer between Solutions and
//                                   Criteria — CRUD on the components table
//                                   plus the productComponents junction
//                                   for which solutions a component
//                                   belongs to)
//   Activity Log operations        (createActivityLog + getActivityLogsByPoc
//                                   that join through users for the
//                                   activity feed)
//
// Behavior preserved verbatim. Demo isolation gating is preserved on
// activity logs via applyDemoFilter; the library tables (criteria,
// outcomes, actions, components) keep demo and real rows apart by is_demo
// (migration 114).
import { db, pool } from "../db";
import { eq, and, or, desc, sql, inArray, ne } from "drizzle-orm";
import { applyDemoFilter, applyDemoFlag, demoModeSql } from "../lib/demo-storage";
import {
  users,
  projects,
  products,
  successCriteria,
  expectedOutcomes,
  actionItems,
  components,
  criteriaLibrary,
  productActions,
  productComponents,
  productOutcomes,
  criteriaOutcomes,
  outcomeActions,
  activityLogs,
} from "@shared/schema";
import type {
  SuccessCriteria,
  InsertSuccessCriteria,
  ActivityLog,
  InsertActivityLog,
  User,
} from "@shared/schema";

// Cross-mixin call surface: CriteriaStorageMixin.createComponent /
// updateComponent reach into linkComponentToProducts which lives in
// the Products mixin. Phantom interface lets tsc resolve `this.<method>`
// against the composed DatabaseStorage at runtime without a circular
// import on `../storage`.
interface ProductsLinkShape {
  linkComponentToProducts(componentId: number, productIds: number[]): Promise<void>;
}

export interface CriteriaStorageMixin extends ProductsLinkShape {}
export class CriteriaStorageMixin {
  // Success Criteria operations
  async createSuccessCriteria(criteria: InsertSuccessCriteria): Promise<SuccessCriteria> {
    // Compute next stable line number for this project
    const maxResult = await db.execute(
      sql`SELECT COALESCE(MAX(line_number), 0) + 1 AS next_line FROM success_criteria WHERE project_id = ${criteria.projectId}`
    );
    const nextLineNumber = (maxResult.rows[0] as any)?.next_line ?? 1;

    const [newCriteria] = await db
      .insert(successCriteria)
      .values({ ...criteria, lineNumber: nextLineNumber })
      .returning();
    return newCriteria;
  }

  async getSuccessCriterionById(id: number): Promise<SuccessCriteria | undefined> {
    const [row] = await db.select().from(successCriteria).where(eq(successCriteria.id, id)).limit(1);
    return row;
  }

  async updateSuccessCriteria(
    id: number,
    updates: Partial<InsertSuccessCriteria>
  ): Promise<SuccessCriteria> {
    const [updatedCriteria] = await db
      .update(successCriteria)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(successCriteria.id, id))
      .returning();
    return updatedCriteria;
  }

  async deleteSuccessCriteria(id: number): Promise<void> {
    await db.delete(successCriteria).where(eq(successCriteria.id, id));
  }

  async deleteSuccessCriteriaByProduct(productName: string): Promise<void> {
    await db.delete(successCriteria).where(eq(successCriteria.productName, productName));
  }

  async getProductById(id: number): Promise<any> {
    // Task #723 — gate by demo context.
    const result = await db.select().from(products)
      .where(and(eq(products.id, id), applyDemoFilter(products)))
      .limit(1);
    return result[0] || null;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async getCriteria(showInactive: boolean = false): Promise<any[]> {
    try {
      const query = showInactive
        ? `SELECT cl.id, cl.name, cl.description, cl.is_active as "isActive", 
                  cl.is_all_solutions as "isAllSolutions", cl.is_system as "isSystem",
                  cl.created_by as "createdBy", cl.created_at as "createdAt",
                  cl.updated_by as "updatedBy", cl.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(pc.product_id) FILTER (WHERE pc.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM criteria_library cl 
           LEFT JOIN users u ON u.id = cl.created_by
           LEFT JOIN users uu ON uu.id = cl.updated_by
           LEFT JOIN product_criteria pc ON pc.criteria_id = cl.id
           WHERE ${demoModeSql("cl")}
           GROUP BY cl.id, cl.name, cl.description, cl.is_active, cl.is_all_solutions, cl.is_system, cl.created_by, cl.created_at, 
                    cl.updated_by, cl.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`
        : `SELECT cl.id, cl.name, cl.description, cl.is_active as "isActive", 
                  cl.is_all_solutions as "isAllSolutions", cl.is_system as "isSystem",
                  cl.created_by as "createdBy", cl.created_at as "createdAt",
                  cl.updated_by as "updatedBy", cl.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(pc.product_id) FILTER (WHERE pc.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM criteria_library cl 
           LEFT JOIN users u ON u.id = cl.created_by
           LEFT JOIN users uu ON uu.id = cl.updated_by
           LEFT JOIN product_criteria pc ON pc.criteria_id = cl.id
           WHERE cl.is_active = true AND ${demoModeSql("cl")}
           GROUP BY cl.id, cl.name, cl.description, cl.is_active, cl.is_all_solutions, cl.is_system, cl.created_by, cl.created_at, 
                    cl.updated_by, cl.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getCriteria failed:', error);
      return [];
    }
  }

  async getExpectedOutcomes(): Promise<any[]> {
    try {
      const query = `SELECT id, name, description, is_active as "isActive", created_by as "createdBy", created_at as "createdAt" FROM expected_outcomes WHERE is_active = true AND ${demoModeSql("expected_outcomes")}`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getExpectedOutcomes failed:', error);
      return [];
    }
  }

  async getActionItems(): Promise<any[]> {
    try {
      const query = `SELECT id, name, description, is_active as "isActive", created_by as "createdBy", created_at as "createdAt" FROM action_items WHERE is_active = true AND ${demoModeSql("action_items")}`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getActionItems failed:', error);
      return [];
    }
  }

  async deleteCriteria(id: number): Promise<void> {
    await db.delete(criteriaLibrary).where(eq(criteriaLibrary.id, id));
  }

  async getCriteriaById(id: number): Promise<any> {
    try {
      const query = `
        SELECT cl.id, cl.name, cl.description, 
               cl.is_active as "isActive", cl.is_all_solutions as "isAllSolutions",
               cl.is_system as "isSystem",
               cl.created_by as "createdBy", cl.created_at as "createdAt",
               u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
               COALESCE(ARRAY_AGG(pc.product_id) FILTER (WHERE pc.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
        FROM criteria_library cl
        LEFT JOIN users u ON u.id = cl.created_by
        LEFT JOIN product_criteria pc ON pc.criteria_id = cl.id
        WHERE cl.id = $1 AND ${demoModeSql("cl")}
        GROUP BY cl.id, cl.name, cl.description, cl.is_active, cl.is_all_solutions, cl.is_system, cl.created_by, cl.created_at,
                 u.first_name, u.last_name, u.email
      `;
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching criteria by ID:', error);
      return null;
    }
  }

  async getOutcomeById(id: number): Promise<any> {
    try {
      const query = `
        SELECT eo.id, eo.name, eo.description, 
               eo.is_active as "isActive", eo.is_all_solutions as "isAllSolutions",
               eo.is_system as "isSystem",
               eo.created_by as "createdBy", eo.created_at as "createdAt",
               u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
               COALESCE(ARRAY_AGG(po.product_id) FILTER (WHERE po.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
        FROM expected_outcomes eo
        LEFT JOIN users u ON u.id = eo.created_by
        LEFT JOIN product_outcomes po ON po.outcome_id = eo.id
        WHERE eo.id = $1 AND ${demoModeSql("eo")}
        GROUP BY eo.id, eo.name, eo.description, eo.is_active, eo.is_all_solutions, eo.is_system, eo.created_by, eo.created_at,
                 u.first_name, u.last_name, u.email
      `;
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching outcome by ID:', error);
      return null;
    }
  }

  async getActionById(id: number): Promise<any> {
    try {
      const query = `
        SELECT ai.id, ai.name, ai.description, 
               ai.is_active as "isActive", ai.is_all_solutions as "isAllSolutions",
               ai.is_system as "isSystem",
               ai.created_by as "createdBy", ai.created_at as "createdAt",
               u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
               COALESCE(ARRAY_AGG(pa.product_id) FILTER (WHERE pa.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
        FROM action_items ai
        LEFT JOIN users u ON u.id = ai.created_by
        LEFT JOIN product_actions pa ON pa.action_id = ai.id
        WHERE ai.id = $1 AND ${demoModeSql("ai")}
        GROUP BY ai.id, ai.name, ai.description, ai.is_active, ai.is_all_solutions, ai.is_system, ai.created_by, ai.created_at,
                 u.first_name, u.last_name, u.email
      `;
      const result = await pool.query(query, [id]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching action by ID:', error);
      return null;
    }
  }

  // Components management (optional layer between Solutions and Criteria)
  async getComponents(showInactive: boolean = false, solutionId?: number): Promise<any[]> {
    try {
      let query = `
        SELECT c.id, c.name, c.description, 
               c.is_active as "isActive", c.is_all_solutions as "isAllSolutions", c.is_system as "isSystem",
               c.created_by as "createdBy", c.created_at as "createdAt",
               c.updated_by as "updatedBy", c.updated_at as "updatedAt",
               u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
               uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
               COALESCE(ARRAY_AGG(pc.product_id) FILTER (WHERE pc.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
        FROM components c
        LEFT JOIN users u ON u.id = c.created_by
        LEFT JOIN users uu ON uu.id = c.updated_by
        LEFT JOIN product_components pc ON pc.component_id = c.id
        WHERE ${demoModeSql("c")}`;

      const params: any[] = [];
      
      if (!showInactive) {
        query += ` AND c.is_active = true`;
      }
      
      if (solutionId) {
        // Include rows where EITHER this specific solution is in the
        // product_components link table, OR the component is flagged
        // `is_all_solutions = true`. The All-Solutions branch
        // matters because those components intentionally skip the
        // link table at create time (see createComponent below);
        // without this OR clause they would be invisible to any
        // by-solution filter and the Gap dialog's "Component / Module"
        // picker would show "No components found" even when an
        // All-Solutions component exists. User-reported regression.
        query += ` AND (pc.product_id = $1 OR c.is_all_solutions = true)`;
        params.push(solutionId);
      }
      
      query += ` GROUP BY c.id, c.name, c.description, c.is_active, c.is_all_solutions, c.is_system, c.created_by, c.created_at, 
                         c.updated_by, c.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email
                 ORDER BY c.created_at DESC`;
      
      const result = params.length > 0 
        ? await pool.query(query, params)
        : await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching components:', error);
      return [];
    }
  }

  async getComponentById(id: number): Promise<any> {
    const result = await pool.query(
      `SELECT id, is_system as "isSystem" FROM components WHERE id = $1 AND ${demoModeSql("components")}`,
      [id]
    );
    return result.rows[0] || null;
  }

  async createComponent(component: {
    name: string;
    description?: string | null;
    isAllSolutions?: boolean;
    isActive?: boolean;
    isSystem?: boolean;
    createdBy?: string;
    solutionIds?: number[];
  }): Promise<any> {
    // solutionId is deprecated (replaced by the productComponents link table).
    // Its legacy NOT NULL constraint was dropped in migration 065, so writing
    // null is now valid; product associations are recorded in product_components
    // below. The cast remains until the column itself is dropped.
    const [newComponent] = await db.insert(components).values(applyDemoFlag({
      name: component.name,
      description: component.description ?? null,
      solutionId: null,
      isAllSolutions: component.isAllSolutions === true,
      isActive: component.isActive !== false,
      isSystem: component.isSystem === true,
      createdBy: component.createdBy,
    }) as unknown as typeof components.$inferInsert).returning();

    // Link to products if solutionIds provided (non-All Solutions entities)
    // If isAllSolutions is true, no links needed (applies everywhere)
    if (!component.isAllSolutions && component.solutionIds && Array.isArray(component.solutionIds) && component.solutionIds.length > 0) {
      await this.linkComponentToProducts(newComponent.id, component.solutionIds);
    }

    return newComponent;
  }

  async updateComponent(id: number, updates: any): Promise<any> {
    const updateData: any = {};
    
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    if (updates.isAllSolutions !== undefined) {
      updateData.isAllSolutions = updates.isAllSolutions;
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }
    if (updates.isSystem !== undefined) {
      updateData.isSystem = updates.isSystem;
    }
    if (updates.updatedBy !== undefined) {
      updateData.updatedBy = updates.updatedBy;
      updateData.updatedAt = new Date();
    }
    
    const [updated] = await db.update(components)
      .set(updateData)
      .where(eq(components.id, id))
      .returning();
    
    // Update solution links if solutionIds provided
    // If isAllSolutions is true, clear all links (applies everywhere)
    if (updates.solutionIds !== undefined && Array.isArray(updates.solutionIds)) {
      await this.linkComponentToProducts(id, updates.isAllSolutions ? [] : updates.solutionIds);
    }
    
    return updated;
  }

  async deleteComponent(id: number): Promise<void> {
    // Set componentId to null for any criteria linked to this component
    await db.update(criteriaLibrary)
      .set({ componentId: null })
      .where(eq(criteriaLibrary.componentId, id));
    
    // Delete the component
    await db.delete(components).where(eq(components.id, id));
  }

  async deleteOutcome(id: number): Promise<void> {
    // Must delete referencing junction rows before deleting the outcome
    await db.delete(productOutcomes).where(eq(productOutcomes.outcomeId, id));
    await db.delete(criteriaOutcomes).where(eq(criteriaOutcomes.outcomeId, id));
    await db.delete(expectedOutcomes).where(eq(expectedOutcomes.id, id));
  }

  async deleteAction(id: number): Promise<void> {
    // Must delete referencing junction rows before deleting the action
    await db.delete(productActions).where(eq(productActions.actionId, id));
    await db.delete(outcomeActions).where(eq(outcomeActions.actionId, id));
    await db.delete(actionItems).where(eq(actionItems.id, id));
  }

  async deleteOutcomesByCriteria(criteriaId: number): Promise<void> {
    // Get all outcomes linked to this criteria
    const relatedOutcomes = await db
      .select({ id: expectedOutcomes.id })
      .from(expectedOutcomes)
      .leftJoin(criteriaOutcomes, eq(criteriaOutcomes.outcomeId, expectedOutcomes.id))
      .where(eq(criteriaOutcomes.criteriaId, criteriaId));

    const outcomeIds = relatedOutcomes.map((o) => o.id);

    if (outcomeIds.length > 0) {
      // Delete referencing junction rows before deleting outcomes
      // (criteria_outcomes.outcomeId → expected_outcomes.id has NO ACTION)
      await db.delete(productOutcomes).where(inArray(productOutcomes.outcomeId, outcomeIds));
      await db.delete(criteriaOutcomes).where(eq(criteriaOutcomes.criteriaId, criteriaId));
      // Now safe to delete the outcomes
      await db.delete(expectedOutcomes).where(inArray(expectedOutcomes.id, outcomeIds));
    }
  }

  async deleteActionsByOutcome(outcomeId: number): Promise<void> {
    // Get all actions linked to this outcome
    const relatedActions = await db
      .select({ id: actionItems.id })
      .from(actionItems)
      .leftJoin(outcomeActions, eq(outcomeActions.actionId, actionItems.id))
      .where(eq(outcomeActions.outcomeId, outcomeId));

    const actionIds = relatedActions.map((a) => a.id);

    if (actionIds.length > 0) {
      // Delete referencing junction rows before deleting actions
      // (outcome_actions.actionId → action_items.id has NO ACTION)
      await db.delete(productActions).where(inArray(productActions.actionId, actionIds));
      await db.delete(outcomeActions).where(eq(outcomeActions.outcomeId, outcomeId));
      // Now safe to delete the actions
      await db.delete(actionItems).where(inArray(actionItems.id, actionIds));
    }
  }

  async deleteActionsByOutcomeCriteria(criteriaId: number): Promise<void> {
    // Get all outcomes linked to this criteria
    const relatedOutcomes = await db
      .select({ id: expectedOutcomes.id })
      .from(expectedOutcomes)
      .leftJoin(criteriaOutcomes, eq(criteriaOutcomes.outcomeId, expectedOutcomes.id))
      .where(eq(criteriaOutcomes.criteriaId, criteriaId));

    const outcomeIds = relatedOutcomes.map((o) => o.id);

    if (outcomeIds.length > 0) {
      // Get all actions linked to these outcomes
      const relatedActions = await db
        .select({ id: actionItems.id })
        .from(actionItems)
        .leftJoin(outcomeActions, eq(outcomeActions.actionId, actionItems.id))
        .where(inArray(outcomeActions.outcomeId, outcomeIds));

      const actionIds = relatedActions.map((a) => a.id);

      if (actionIds.length > 0) {
        // Delete referencing junction rows before deleting actions
        await db.delete(productActions).where(inArray(productActions.actionId, actionIds));
        await db.delete(outcomeActions).where(inArray(outcomeActions.outcomeId, outcomeIds));
        // Now safe to delete the actions
        await db.delete(actionItems).where(inArray(actionItems.id, actionIds));
      }
    }
  }

  async getSuccessCriteriaByPoc(projectId: number): Promise<SuccessCriteria[]> {
    return await db
      .select()
      .from(successCriteria)
      .where(eq(successCriteria.projectId, projectId));
  }

  // Activity Log operations
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    // Task #723 — every audit row written during a demo session is
    // tagged is_demo=true so wipeDemoData() removes it, preventing the
    // demo audit trail from polluting real audit history.
    const tagged = applyDemoFlag(log) as typeof activityLogs.$inferInsert;
    const _newLogInserted = await db
        .insert(activityLogs)
        .values(tagged)
        .returning();
      const [newLog] = _newLogInserted as Array<typeof activityLogs.$inferSelect>;
    return newLog;
  }

  async getActivityLogsByPoc(projectId: number): Promise<(ActivityLog & { user: User })[]> {
    // Task #723 — demo isolation. Although `projectId` already implies the
    // demo context (a demo session can only have produced demo project ids),
    // we filter explicitly so a stray cross-context id can't leak rows.
    const results = await db
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
      .where(and(eq(activityLogs.projectId, projectId), applyDemoFilter(activityLogs)))
      .orderBy(desc(activityLogs.createdAt));

    return results.filter((result) => result.user !== null) as (ActivityLog & { user: User })[];
  }
}
