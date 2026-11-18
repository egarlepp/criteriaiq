// Products + Hierarchical Relationships — mixin for DatabaseStorage
// (Phase 7 #25). Largest single domain since the original Phase 7 #9
// MAP extraction.
//
// Bundles every read/write surface for the Product / Component /
// Criteria / Outcome / Action / ValueMapping graph that powers the
// criteria library:
//
//   Products CRUD                 (raw-SQL workaround for ORM JSON edge
//                                  cases on the JSONB columns; demo
//                                  isolation gated explicitly with the
//                                  parameterised is_demo boolean)
//   Hierarchical relationship ops (link/unlink criteria↔product,
//                                  outcome↔criteria, action↔outcome and
//                                  the reverse-lookup queries that
//                                  drive the "linked to" panels)
//   Helper methods                (linkXToProducts bulk replace
//                                  variants used by the Create/Update
//                                  Library Item flows)
//
// Behavior preserved verbatim. The raw-SQL `getProducts` path is the
// largest single workaround in the data layer — kept intact because
// the Drizzle ORM path lost the JSONB column ordering on writes.
import { db, pool } from "../db";
import { eq, and, or, ne, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { applyDemoFilter, applyDemoFlag, demoModeSql } from "../lib/demo-storage";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import {
  users,
  products,
  components,
  criteriaLibrary,
  expectedOutcomes,
  actionItems,
  valueMappings,
  productCriteria,
  productOutcomes,
  productActions,
  criteriaOutcomes,
  outcomeActions,
  productValueMappings,
} from "@shared/schema";
import type {
  Product,
  InsertProduct,
} from "@shared/schema";

// Locally redefined to avoid a circular import on `../storage` (which
// imports this mixin). The canonical export still lives in storage.ts.
type UserSummary = { id: string; firstName: string | null; lastName: string | null; email: string };

export class ProductsStorageMixin {
  // Product operations - Temporary raw SQL workaround for ORM issues
  async getProducts(showInactive: boolean = false): Promise<Product[] > {
    try {
      // Task #723 — gate raw-SQL paths by the demo context. The
      // boolean below mirrors what applyDemoFilter() injects on the
      // ORM side: a demo request sees only is_demo=true rows; a prod
      // request sees only is_demo=false rows.
      const demo = isCurrentRequestDemo();
      const demoClause = `p.is_demo = ${demo ? "TRUE" : "FALSE"}`;
      const query = showInactive
        ? `SELECT p.id, p.name, p.abbreviation, p.description, 
                  p.solution_type as "solutionType", p.solution_icon as "solutionIcon", p.solution_icon_name as "solutionIconName", 
                  p.is_active as "isActive", p.is_system as "isSystem",
                  p.created_by as "createdBy", p.created_at as "createdAt",
                  p.updated_by as "updatedBy", p.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  p.tags 
           FROM products p 
           LEFT JOIN users u ON u.id = p.created_by
           LEFT JOIN users uu ON uu.id = p.updated_by
           WHERE ${demoClause}`
        : `SELECT p.id, p.name, p.abbreviation, p.description, 
                  p.solution_type as "solutionType", p.solution_icon as "solutionIcon", p.solution_icon_name as "solutionIconName", 
                  p.is_active as "isActive", p.is_system as "isSystem",
                  p.created_by as "createdBy", p.created_at as "createdAt",
                  p.updated_by as "updatedBy", p.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  p.tags 
           FROM products p 
           LEFT JOIN users u ON u.id = p.created_by
           LEFT JOIN users uu ON uu.id = p.updated_by
           WHERE p.is_active = true AND ${demoClause}`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getProducts failed:', error);
      // Return empty array as fallback
      return [];
    }
  }

  async getActiveProductsWithCriteria(): Promise<Product[]> {
    try {
      // Task #723 — same demo isolation as getProducts above.
      const demo = isCurrentRequestDemo();
      const demoClause = `p.is_demo = ${demo ? "TRUE" : "FALSE"}`;
      // Raw SQL to get ALL active products (not just those with criteria)
      // This ensures all active solutions appear in the landing page dropdown
      const query = `
        SELECT DISTINCT p.id, p.name, p.abbreviation, p.description, 
               p.solution_type as "solutionType", p.solution_icon as "solutionIcon", p.solution_icon_name as "solutionIconName", 
               p.is_active as "isActive", p.created_by as "createdBy", 
               p.created_at as "createdAt",
               u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
               ARRAY[]::text[] as tags 
        FROM products p 
        LEFT JOIN users u ON u.id = p.created_by
        WHERE p.is_active = true AND ${demoClause}
        ORDER BY p.name ASC
      `;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getActiveProductsWithCriteria failed:', error);
      return [];
    }
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    // Task #723 — auto-tag inserts from a demo session.
    const result = await db.insert(products).values(applyDemoFlag({
      name: product.name,
      abbreviation: product.abbreviation,
      description: product.description,
      tags: product.tags,
      isSystem: product.isSystem === true,
      solutionIcon: product.solutionIcon,
      solutionIconName: product.solutionIconName ?? null,
      documentationLinkId: product.documentationLinkId || null,
      docsRepoConfigId: product.docsRepoConfigId || null,
      createdBy: product.createdBy,
    }) as typeof products.$inferInsert).returning();
    const [newProduct] = result as Product[];
    return newProduct;
  }

  async updateProduct(id: number, updates: any): Promise<Product> {
    const updateData: any = {};
    
    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    if (updates.abbreviation !== undefined) {
      updateData.abbreviation = updates.abbreviation;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    if (updates.tags !== undefined) {
      updateData.tags = updates.tags;
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }
    if (updates.isSystem !== undefined) {
      updateData.isSystem = updates.isSystem;
    }
    if (updates.solutionIcon !== undefined) {
      updateData.solutionIcon = updates.solutionIcon;
    }
    if (updates.solutionIconName !== undefined) {
      updateData.solutionIconName = updates.solutionIconName;
    }
    if (updates.documentationLinkId !== undefined) {
      updateData.documentationLinkId = updates.documentationLinkId || null;
    }
    if (updates.docsRepoConfigId !== undefined) {
      updateData.docsRepoConfigId = updates.docsRepoConfigId || null;
    }
    if (updates.updatedBy !== undefined) {
      updateData.updatedBy = updates.updatedBy;
      updateData.updatedAt = new Date();
    }
    
    const [updated] = await db.update(products)
      .set(updateData)
      .where(eq(products.id, id))
      .returning();
    return updated;
  }

  async createCriteria(criteria: Record<string, any>): Promise<any> {
    const [newCriteria] = await db.insert(criteriaLibrary).values(applyDemoFlag({
      name: criteria.name,
      description: criteria.description,
      isAllSolutions: criteria.isAllSolutions === true,
      isSystem: criteria.isSystem === true,
      createdBy: criteria.createdBy,
    })).returning();

    // Link to products if solutionIds provided (non-All Solutions entities)
    // If isAllSolutions is true, no links needed (applies everywhere)
    if (!criteria.isAllSolutions && criteria.solutionIds && Array.isArray(criteria.solutionIds) && criteria.solutionIds.length > 0) {
      await this.linkCriteriaToProducts(newCriteria.id, criteria.solutionIds);
    }

    return newCriteria;
  }

  async updateCriteria(id: number, updates: any): Promise<any> {
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
    
    const [updated] = await db.update(criteriaLibrary)
      .set(updateData)
      .where(eq(criteriaLibrary.id, id))
      .returning();
    
    // Update solution links if solutionIds provided
    // If isAllSolutions is true, clear all links (applies everywhere)
    if (updates.solutionIds !== undefined && Array.isArray(updates.solutionIds)) {
      await this.linkCriteriaToProducts(id, updates.isAllSolutions ? [] : updates.solutionIds);
    }
    
    return updated;
  }

  async getOutcomes(showInactive: boolean = false): Promise<any[]> {
    try {
      const query = showInactive
        ? `SELECT eo.id, eo.name, eo.description, eo.is_active as "isActive", 
                  eo.is_all_solutions as "isAllSolutions", eo.is_system as "isSystem",
                  eo.created_by as "createdBy", eo.created_at as "createdAt",
                  eo.updated_by as "updatedBy", eo.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(po.product_id) FILTER (WHERE po.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM expected_outcomes eo 
           LEFT JOIN users u ON u.id = eo.created_by
           LEFT JOIN users uu ON uu.id = eo.updated_by
           LEFT JOIN product_outcomes po ON po.outcome_id = eo.id
           WHERE ${demoModeSql("eo")}
           GROUP BY eo.id, eo.name, eo.description, eo.is_active, eo.is_all_solutions, eo.is_system, eo.created_by, eo.created_at, 
                    eo.updated_by, eo.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`
        : `SELECT eo.id, eo.name, eo.description, eo.is_active as "isActive", 
                  eo.is_all_solutions as "isAllSolutions", eo.is_system as "isSystem",
                  eo.created_by as "createdBy", eo.created_at as "createdAt",
                  eo.updated_by as "updatedBy", eo.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(po.product_id) FILTER (WHERE po.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM expected_outcomes eo 
           LEFT JOIN users u ON u.id = eo.created_by
           LEFT JOIN users uu ON uu.id = eo.updated_by
           LEFT JOIN product_outcomes po ON po.outcome_id = eo.id
           WHERE eo.is_active = true AND ${demoModeSql("eo")}
           GROUP BY eo.id, eo.name, eo.description, eo.is_active, eo.is_all_solutions, eo.is_system, eo.created_by, eo.created_at, 
                    eo.updated_by, eo.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getOutcomes failed:', error);
      return [];
    }
  }

  async createOutcome(outcome: Record<string, any>): Promise<any> {
    const [newOutcome] = await db.insert(expectedOutcomes).values(applyDemoFlag({
      name: outcome.name,
      description: outcome.description,
      isAllSolutions: outcome.isAllSolutions === true,
      isSystem: outcome.isSystem === true,
      createdBy: outcome.createdBy,
    })).returning();

    // Link to products if solutionIds provided (non-All Solutions entities)
    // If isAllSolutions is true, no links needed (applies everywhere)
    if (!outcome.isAllSolutions && outcome.solutionIds && Array.isArray(outcome.solutionIds) && outcome.solutionIds.length > 0) {
      await this.linkOutcomeToProducts(newOutcome.id, outcome.solutionIds);
    }

    return newOutcome;
  }

  async updateOutcome(id: number, updates: any): Promise<any> {
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
    
    const [updated] = await db.update(expectedOutcomes)
      .set(updateData)
      .where(eq(expectedOutcomes.id, id))
      .returning();
    
    // Update solution links if solutionIds provided
    // If isAllSolutions is true, clear all links (applies everywhere)
    if (updates.solutionIds !== undefined && Array.isArray(updates.solutionIds)) {
      await this.linkOutcomeToProducts(id, updates.isAllSolutions ? [] : updates.solutionIds);
    }
    
    return updated;
  }

  async getActions(showInactive: boolean = false): Promise<any[]> {
    try {
      const query = showInactive
        ? `SELECT ai.id, ai.name, ai.description, ai.is_active as "isActive", 
                  ai.is_all_solutions as "isAllSolutions", ai.is_system as "isSystem",
                  ai.created_by as "createdBy", ai.created_at as "createdAt",
                  ai.updated_by as "updatedBy", ai.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(pa.product_id) FILTER (WHERE pa.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM action_items ai 
           LEFT JOIN users u ON u.id = ai.created_by
           LEFT JOIN users uu ON uu.id = ai.updated_by
           LEFT JOIN product_actions pa ON pa.action_id = ai.id
           WHERE ${demoModeSql("ai")}
           GROUP BY ai.id, ai.name, ai.description, ai.is_active, ai.is_all_solutions, ai.is_system, ai.created_by, ai.created_at, 
                    ai.updated_by, ai.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`
        : `SELECT ai.id, ai.name, ai.description, ai.is_active as "isActive", 
                  ai.is_all_solutions as "isAllSolutions", ai.is_system as "isSystem",
                  ai.created_by as "createdBy", ai.created_at as "createdAt",
                  ai.updated_by as "updatedBy", ai.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(pa.product_id) FILTER (WHERE pa.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM action_items ai 
           LEFT JOIN users u ON u.id = ai.created_by
           LEFT JOIN users uu ON uu.id = ai.updated_by
           LEFT JOIN product_actions pa ON pa.action_id = ai.id
           WHERE ai.is_active = true AND ${demoModeSql("ai")}
           GROUP BY ai.id, ai.name, ai.description, ai.is_active, ai.is_all_solutions, ai.is_system, ai.created_by, ai.created_at, 
                    ai.updated_by, ai.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Raw SQL fallback for getActions failed:', error);
      return [];
    }
  }

  async createAction(action: Record<string, any>): Promise<any> {
    const [newAction] = await db.insert(actionItems).values(applyDemoFlag({
      name: action.name,
      description: action.description,
      isAllSolutions: action.isAllSolutions === true,
      isSystem: action.isSystem === true,
      createdBy: action.createdBy,
    })).returning();

    // Link to products if solutionIds provided (non-All Solutions entities)
    // If isAllSolutions is true, no links needed (applies everywhere)
    if (!action.isAllSolutions && action.solutionIds && Array.isArray(action.solutionIds) && action.solutionIds.length > 0) {
      await this.linkActionToProducts(newAction.id, action.solutionIds);
    }

    return newAction;
  }

  async updateAction(id: number, updates: any): Promise<any> {
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
    
    const [updated] = await db.update(actionItems)
      .set(updateData)
      .where(eq(actionItems.id, id))
      .returning();
    
    // Update solution links if solutionIds provided
    // If isAllSolutions is true, clear all links (applies everywhere)
    if (updates.solutionIds !== undefined && Array.isArray(updates.solutionIds)) {
      await this.linkActionToProducts(id, updates.isAllSolutions ? [] : updates.solutionIds);
    }
    
    return updated;
  }

  // Hierarchical relationship operations
  async linkCriteriaToProduct(productId: number, criteriaIds: number[]): Promise<void> {
    // First delete existing relationships for this product
    await db.delete(productCriteria).where(eq(productCriteria.productId, productId));

    // Insert new relationships
    if (criteriaIds.length > 0) {
      const relationships = criteriaIds.map(criteriaId => ({
        productId,
        criteriaId
      }));
      await db.insert(productCriteria).values(relationships);
    }
  }

  async linkOutcomesToProduct(productId: number, outcomeIds: number[]): Promise<void> {
    // First delete existing relationships for this product
    await db.delete(productOutcomes).where(eq(productOutcomes.productId, productId));

    // Insert new relationships
    if (outcomeIds.length > 0) {
      const relationships = outcomeIds.map(outcomeId => ({
        productId,
        outcomeId
      }));
      await db.insert(productOutcomes).values(relationships);
    }
  }

  async linkActionsToProduct(productId: number, actionIds: number[]): Promise<void> {
    // First delete existing relationships for this product
    await db.delete(productActions).where(eq(productActions.productId, productId));

    // Insert new relationships
    if (actionIds.length > 0) {
      const relationships = actionIds.map(actionId => ({
        productId,
        actionId
      }));
      await db.insert(productActions).values(relationships);
    }
  }

  async linkOutcomesToCriteria(criteriaId: number, outcomeIds: number[]): Promise<void> {
    // First delete existing relationships for this criteria
    await db.delete(criteriaOutcomes).where(eq(criteriaOutcomes.criteriaId, criteriaId));

    // Insert new relationships
    if (outcomeIds.length > 0) {
      const relationships = outcomeIds.map(outcomeId => ({
        criteriaId,
        outcomeId
      }));
      await db.insert(criteriaOutcomes).values(relationships);
    }
  }

  async linkActionsToOutcome(outcomeId: number, actionIds: number[]): Promise<void> {
    // First delete existing relationships for this outcome
    await db.delete(outcomeActions).where(eq(outcomeActions.outcomeId, outcomeId));

    // Insert new relationships
    if (actionIds.length > 0) {
      const relationships = actionIds.map(actionId => ({
        outcomeId,
        actionId
      }));
      await db.insert(outcomeActions).values(relationships);
    }
  }

  async getLinkedCriteria(productId: number): Promise<number[]> {
    const links = await db.select().from(productCriteria).where(eq(productCriteria.productId, productId));
    return links.map((link) => link.criteriaId);
  }

  async getLinkedOutcomes(criteriaId: number): Promise<number[]> {
    const links = await db.select().from(criteriaOutcomes).where(eq(criteriaOutcomes.criteriaId, criteriaId));
    return links.map((link) => link.outcomeId);
  }

  async getLinkedActions(outcomeId: number): Promise<number[]> {
    const links = await db.select().from(outcomeActions).where(eq(outcomeActions.outcomeId, outcomeId));
    return links.map((link) => link.actionId);
  }

  // Additional methods for reverse lookups (needed for the frontend to show which items are linked TO a specific item)
  async getCriteriaLinkedToProduct(criteriaId: number): Promise<number[]> {
    // Find which products have this specific criteria linked to them
    const links = await db.select().from(productCriteria).where(eq(productCriteria.criteriaId, criteriaId));
    return links.map((link) => link.productId);
  }

  async getOutcomesLinkedToCriteria(outcomeId: number): Promise<number[]> {
    // Find which criteria have this specific outcome linked to them
    const links = await db.select().from(criteriaOutcomes).where(eq(criteriaOutcomes.outcomeId, outcomeId));
    return links.map((link) => link.criteriaId);
  }

  async getActionsLinkedToOutcome(actionId: number): Promise<number[]> {
    // Find which outcomes have this specific action linked to them
    const links = await db.select().from(outcomeActions).where(eq(outcomeActions.actionId, actionId));
    return links.map((link) => link.outcomeId);
  }

  // Helper methods to link one item to multiple products
  async linkComponentToProducts(componentId: number, productIds: number[]): Promise<void> {
    // First delete existing product relationships for this component
    await pool.query('DELETE FROM product_components WHERE component_id = $1', [componentId]);

    // Insert new relationships
    if (productIds.length > 0) {
      const values = productIds.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(', ');
      const params = productIds.flatMap(productId => [productId, componentId]);
      await pool.query(
        `INSERT INTO product_components (product_id, component_id) VALUES ${values}`,
        params
      );
    }
  }

  async linkCriteriaToProducts(criteriaId: number, productIds: number[]): Promise<void> {
    // First delete existing product relationships for this criteria
    await db.delete(productCriteria).where(eq(productCriteria.criteriaId, criteriaId));

    // Insert new relationships
    if (productIds.length > 0) {
      const relationships = productIds.map(productId => ({
        productId,
        criteriaId
      }));
      await db.insert(productCriteria).values(relationships);
    }
  }

  async linkOutcomeToProducts(outcomeId: number, productIds: number[]): Promise<void> {
    // First delete existing product relationships for this outcome
    await db.delete(productOutcomes).where(eq(productOutcomes.outcomeId, outcomeId));

    // Insert new relationships
    if (productIds.length > 0) {
      const relationships = productIds.map(productId => ({
        productId,
        outcomeId
      }));
      await db.insert(productOutcomes).values(relationships);
    }
  }

  async linkActionToProducts(actionId: number, productIds: number[]): Promise<void> {
    // First delete existing product relationships for this action
    await db.delete(productActions).where(eq(productActions.actionId, actionId));

    // Insert new relationships
    if (productIds.length > 0) {
      const relationships = productIds.map(productId => ({
        productId,
        actionId
      }));
      await db.insert(productActions).values(relationships);
    }
  }

  async getValueMappingById(id: number): Promise<any> {
    const result = await pool.query(
      `SELECT id, is_system as "isSystem" FROM value_mappings WHERE id = $1 AND ${demoModeSql("value_mappings")}`,
      [id]
    );
    return result.rows[0] || null;
  }

  async getValueMappings(showInactive: boolean = false): Promise<any[]> {
    try {
      const whereClause = showInactive
        ? `WHERE ${demoModeSql("vm")}`
        : `WHERE vm.is_active = true AND ${demoModeSql("vm")}`;
      const query = `SELECT vm.id, vm.name, vm.description, vm.is_active as "isActive",
                  vm.is_all_solutions as "isAllSolutions", vm.is_system as "isSystem",
                  vm.created_by as "createdBy", vm.created_at as "createdAt",
                  vm.updated_by as "updatedBy", vm.updated_at as "updatedAt",
                  u.first_name as "creatorFirstName", u.last_name as "creatorLastName", u.email as "creatorEmail",
                  uu.first_name as "updatedByFirstName", uu.last_name as "updatedByLastName", uu.email as "updatedByEmail",
                  COALESCE(ARRAY_AGG(pvm.product_id) FILTER (WHERE pvm.product_id IS NOT NULL), ARRAY[]::integer[]) as "solutionIds"
           FROM value_mappings vm
           LEFT JOIN users u ON u.id = vm.created_by
           LEFT JOIN users uu ON uu.id = vm.updated_by
           LEFT JOIN product_value_mappings pvm ON pvm.value_mapping_id = vm.id
           ${whereClause}
           GROUP BY vm.id, vm.name, vm.description, vm.is_active, vm.is_all_solutions, vm.is_system, vm.created_by, vm.created_at,
                    vm.updated_by, vm.updated_at, u.first_name, u.last_name, u.email, uu.first_name, uu.last_name, uu.email`;
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('getValueMappings failed:', error);
      return [];
    }
  }

  async createValueMapping(data: Record<string, any>): Promise<any> {
    const [newMapping] = await db.insert(valueMappings).values(applyDemoFlag({
      name: data.name,
      description: data.description,
      isAllSolutions: data.isAllSolutions === true,
      isSystem: data.isSystem === true,
      createdBy: data.createdBy,
    })).returning();

    if (!data.isAllSolutions && data.solutionIds && Array.isArray(data.solutionIds) && data.solutionIds.length > 0) {
      await this.linkValueMappingToProducts(newMapping.id, data.solutionIds);
    }

    return newMapping;
  }

  async updateValueMapping(id: number, updates: any): Promise<any> {
    const updateData: any = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.isAllSolutions !== undefined) updateData.isAllSolutions = updates.isAllSolutions;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.isSystem !== undefined) updateData.isSystem = updates.isSystem;
    if (updates.updatedBy !== undefined) {
      updateData.updatedBy = updates.updatedBy;
      updateData.updatedAt = new Date();
    }

    const [updated] = await db.update(valueMappings)
      .set(updateData)
      .where(eq(valueMappings.id, id))
      .returning();

    if (updates.solutionIds !== undefined && Array.isArray(updates.solutionIds)) {
      await this.linkValueMappingToProducts(id, updates.isAllSolutions ? [] : updates.solutionIds);
    }

    return updated;
  }

  async deleteValueMapping(id: number): Promise<void> {
    await db.delete(productValueMappings).where(eq(productValueMappings.valueMappingId, id));
    await db.delete(valueMappings).where(eq(valueMappings.id, id));
  }

  async linkValueMappingToProducts(valueMappingId: number, productIds: number[]): Promise<void> {
    await db.delete(productValueMappings).where(eq(productValueMappings.valueMappingId, valueMappingId));
    if (productIds.length > 0) {
      const relationships = productIds.map(productId => ({ productId, valueMappingId }));
      await db.insert(productValueMappings).values(relationships);
    }
  }
}
