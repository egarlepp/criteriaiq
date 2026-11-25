// Evaluation Requests + Support Requests + Support Analytics —
// mixin for DatabaseStorage (Phase 7 #22).
//
// Bundles the entire "request intake" surface — both classes of inbound
// customer-originated request and the per-user analytics / trends rollups
// that drive the support dashboard:
//
//   getAccessibleCustomerIds      (RLS helper used by every analytic
//                                  below to scope external/customer-side
//                                  callers to their own customer rows)
//   Support Request analytics     (FULLY RAW SQL implementation — bypasses
//                                  the Drizzle ORM to keep aggregate-window
//                                  pivots on PG side and avoid the ORM's
//                                  GROUP BY edge cases)
//   Support Request trends        (time-series for the trends widget)
//   Evaluation Request CRUD       (transactional createWithProducts +
//                                  filterable list/get/update/delete)
//   getProductsByIds              (lookup helper for evaluation request
//                                  product hydration)
//   Support Request CRUD          (CRUD + filterable paginated list with
//                                  search across title/description and
//                                  optional internal-notes search for
//                                  internal users)
//
// Behavior preserved verbatim. Demo isolation is not applied here at the
// mixin level — these tables predate the demo flag and the upstream
// route handlers gate access via the user's role/customer scope.
import { db, pool } from "../db";
import { solutionGraphicPath } from "../lib/solution-graphic";
import { applyDemoFilter, applyDemoFilterByCustomer } from "../lib/demo-storage";

/** A solution as the DemoIQ options lookup lists it. */
export interface EvaluationRequestSolution {
  id: number;
  name: string;
  /** A lucide icon name (PascalCase, as the icon picker saves it), or null. */
  iconName: string | null;
  /** Where the uploaded graphic is served (/api/files/...), or null. Wins over iconName. */
  graphicUrl: string | null;
  /** The solution's type as set on the solution ("Solution" unless an admin changed it), or null. */
  solutionType: string | null;
  description: string | null;
  /** Active components linked to this solution, by name. */
  components: Array<{ id: number; name: string; description: string | null }>;
}
import { eq, and, or, desc, asc, count, sql, inArray, gte, ilike } from "drizzle-orm";
import {
  users,
  projects,
  customers,
  products,
  components,
  productComponents,
  supportRequests,
  evaluationRequests,
  evaluationRequestProducts,
} from "@shared/schema";
import type {
  EvaluationRequest,
  EvaluationRequestWithDetails,
  InsertEvaluationRequest,
  EvaluationRequestProduct,
  InsertEvaluationRequestProduct,
  SupportRequest,
  InsertSupportRequest,
  Product,
} from "@shared/schema";

export class RequestsStorageMixin {
  // Helper method to get accessible customer IDs for external users
  async getAccessibleCustomerIds(userId: string): Promise<number[]> {
    try {
      // Get user email for access checks using raw SQL
      const userResult = await pool.query(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      
      if (!userResult.rows.length) {
        console.warn("User not found for customer access check:", userId);
        return [];
      }

      const userEmail = (userResult.rows[0] as any).email;

      // Get projects the user has access to via customerUsers or additionalAccess using raw SQL
      const projectsResult = await pool.query(
        `
          SELECT DISTINCT customer_id 
          FROM projects 
          WHERE customer_id IS NOT NULL 
          AND (
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(customer_users::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userEmail' = $1
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(customer_users::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userId' = $2
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(additional_access::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userEmail' = $1
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(additional_access::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userId' = $2
            )
          )
        `,
        [userEmail, userId]
      );

      // Extract customer IDs
      const customerIds: number[] = [];
      for (const row of projectsResult.rows) {
        const customerId = (row as any).customer_id;
        if (customerId && !customerIds.includes(customerId)) {
          customerIds.push(Number(customerId));
        }
      }

      return customerIds;
    } catch (error) {
      console.error("Error getting accessible customer IDs:", error);
      return [];
    }
  }

  // Support request analytics - FULLY RAW SQL implementation to avoid Drizzle ORM errors
  async getSupportRequestAnalytics(userId: string, userRole: string): Promise<{
    totalRequests: number;
    openRequests: number;
    resolvedRequests: number;
    avgResolutionTime: number;
    statusDistribution: Array<{ status: string; count: number; percentage: number }>;
    typeDistribution: Array<{ type: string; count: number; percentage: number }>;
    priorityDistribution: Array<{ priority: string; count: number; percentage: number }>;
    recentRequests: number;
    staleRequests: number;
  }> {
    const internalRoles = ['Admin', 'Engineer', 'ProServ', 'Support'];
    const isInternal = internalRoles.includes(userRole);

    // Initialize all return values
    let totalRequests = 0;
    let openRequests = 0;
    let resolvedRequests = 0;
    let avgResolutionTime = 0;
    let statusDistribution: Array<{ status: string; count: number; percentage: number }> = [];
    let typeDistribution: Array<{ type: string; count: number; percentage: number }> = [];
    let priorityDistribution: Array<{ priority: string; count: number; percentage: number }> = [];
    let recentRequests = 0;
    let staleRequests = 0;

    try {
      // Build access condition for queries
      let accessCondition = '';
      let accessValues: any[] = [];

      if (!isInternal) {
        // Get accessible customer IDs for external users
        const userResult = await pool.query(`SELECT email FROM users WHERE id = $1 LIMIT 1`, [userId]);
        if (userResult.rows.length === 0) {
          // User not found, return empty results;
          return {
            totalRequests: 0, openRequests: 0, resolvedRequests: 0, avgResolutionTime: 0,
            statusDistribution: [], typeDistribution: [], priorityDistribution: [],
            recentRequests: 0, staleRequests: 0
          };
        }

        const userEmail = (userResult.rows[0] as any).email;
        const projectsResult = await pool.query(`
          SELECT DISTINCT customer_id 
          FROM projects 
          WHERE customer_id IS NOT NULL 
          AND (
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(customer_users::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userEmail' = $1
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(customer_users::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userId' = $2
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(additional_access::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userEmail' = $1
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(additional_access::jsonb, '[]'::jsonb)) elem 
              WHERE elem->>'userId' = $2
            )
          )
        `, [userEmail, userId]);

        const customerIds: number[] = [];
        for (const row of projectsResult.rows) {
          const customerId = (row as any).customer_id;
          if (customerId) {
            customerIds.push(Number(customerId));
          }
        }

        if (customerIds.length === 0) {
          // No accessible customers found, return empty results;
          return {
            totalRequests: 0, openRequests: 0, resolvedRequests: 0, avgResolutionTime: 0,
            statusDistribution: [], typeDistribution: [], priorityDistribution: [],
            recentRequests: 0, staleRequests: 0
          };
        }

        accessCondition = `WHERE customer_id IN (${customerIds.map((_, index) => `$${index + 1}`).join(',')})`;
        accessValues = customerIds;
      }

      // 1. Total count
      const totalQuery = `SELECT COUNT(*) as count FROM support_requests ${accessCondition}`;
      const totalResult = await pool.query(totalQuery, accessValues);
      totalRequests = Number(totalResult.rows[0]?.count || 0);

      if (totalRequests === 0) {
        // No support requests found, return empty results;
        return {
          totalRequests: 0, openRequests: 0, resolvedRequests: 0, avgResolutionTime: 0,
          statusDistribution: [], typeDistribution: [], priorityDistribution: [],
          recentRequests: 0, staleRequests: 0
        };
      }

      // 2. Status distribution
      const statusQuery = `SELECT status, COUNT(*) as count FROM support_requests ${accessCondition} GROUP BY status`;
      const statusResult = await pool.query(statusQuery, accessValues);
      statusDistribution = statusResult.rows.map((row) => ({
        status: row.status || 'Unknown',
        count: Number(row.count || 0),
        percentage: Math.round((Number(row.count || 0) / totalRequests) * 100)
      }));

      // 3. Type distribution
      const typeQuery = `SELECT type, COUNT(*) as count FROM support_requests ${accessCondition} GROUP BY type`;
      const typeResult = await pool.query(typeQuery, accessValues);
      typeDistribution = typeResult.rows.map((row) => ({
        type: row.type || 'Unknown',
        count: Number(row.count || 0),
        percentage: Math.round((Number(row.count || 0) / totalRequests) * 100)
      }));

      // 4. Priority distribution
      const priorityQuery = `SELECT priority, COUNT(*) as count FROM support_requests ${accessCondition} GROUP BY priority`;
      const priorityResult = await pool.query(priorityQuery, accessValues);
      priorityDistribution = priorityResult.rows.map((row) => ({
        priority: row.priority || 'Unknown',
        count: Number(row.count || 0),
        percentage: Math.round((Number(row.count || 0) / totalRequests) * 100)
      }));

      // 5. Calculate open and resolved requests from status distribution
      const openStatuses = ['Not Started', 'In Progress', 'Under Review'];
      const resolvedStatuses = ['Implemented', 'Completed', 'Rejected'];
      
      openRequests = statusDistribution
        .filter(s => openStatuses.includes(s.status))
        .reduce((sum, s) => sum + s.count, 0);

      resolvedRequests = statusDistribution
        .filter(s => resolvedStatuses.includes(s.status))
        .reduce((sum, s) => sum + s.count, 0);

      // 6. Recent requests (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const recentCondition = accessCondition ? 
        `${accessCondition} AND submitted_date >= $${accessValues.length + 1}` : 
        `WHERE submitted_date >= $1`;
      const recentValues = accessCondition ? [...accessValues, sevenDaysAgo] : [sevenDaysAgo];
      
      const recentQuery = `SELECT COUNT(*) as count FROM support_requests ${recentCondition}`;
      const recentResult = await pool.query(recentQuery, recentValues);
      recentRequests = Number(recentResult.rows[0]?.count || 0);

      // 7. Stale requests (older than 5 days and still open)
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const staleCondition = accessCondition ?
        `${accessCondition} AND submitted_date <= $${accessValues.length + 1} AND status IN ('Not Started', 'In Progress')` :
        `WHERE submitted_date <= $1 AND status IN ('Not Started', 'In Progress')`;
      const staleValues = accessCondition ? [...accessValues, fiveDaysAgo] : [fiveDaysAgo];
      
      const staleQuery = `SELECT COUNT(*) as count FROM support_requests ${staleCondition}`;
      const staleResult = await pool.query(staleQuery, staleValues);
      staleRequests = Number(staleResult.rows[0]?.count || 0);

      const result = {
        totalRequests,
        openRequests,
        resolvedRequests,
        avgResolutionTime,
        statusDistribution,
        typeDistribution,
        priorityDistribution,
        recentRequests,
        staleRequests
      };

      return result;

    } catch (error) {
      console.error('Support analytics: Error in raw SQL method:', error);
      // Return empty results instead of throwing to prevent UI crashes
      return {
        totalRequests: 0, openRequests: 0, resolvedRequests: 0, avgResolutionTime: 0,
        statusDistribution: [], typeDistribution: [], priorityDistribution: [],
        recentRequests: 0, staleRequests: 0
      };
    }
  }

  // Support request trends over time
  async getSupportRequestTrends(userId: string, userRole: string, days: number = 30): Promise<Array<{
    date: string;
    submitted: number;
    resolved: number;
    cumulative: number;
  }>> {
    const internalRoles = ['Admin', 'Engineer', 'ProServ', 'Support'];
    const isInternal = internalRoles.includes(userRole);

    // Build base query conditions
    let whereConditions;
    if (!isInternal) {
      const accessibleCustomers = await this.getAccessibleCustomerIds(userId);
      whereConditions = accessibleCustomers.length > 0 
        ? inArray(supportRequests.customerId, accessibleCustomers)
        : eq(supportRequests.id, -1);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get daily submission counts
    const submissionQuery = db
      .select({
        date: sql<string>`DATE(${supportRequests.submittedDate})`,
        count: count()
      })
      .from(supportRequests);
    const submissionDateCondition = gte(supportRequests.submittedDate, startDate);
    const submissionData = whereConditions 
      ? await submissionQuery
          .where(and(whereConditions, submissionDateCondition))
          .groupBy(sql`DATE(${supportRequests.submittedDate})`)
          .orderBy(sql`DATE(${supportRequests.submittedDate})`)
      : await submissionQuery
          .where(submissionDateCondition)
          .groupBy(sql`DATE(${supportRequests.submittedDate})`)
          .orderBy(sql`DATE(${supportRequests.submittedDate})`);

    // Get daily resolution counts
    const resolutionQuery = db
      .select({
        date: sql<string>`DATE(${supportRequests.updatedAt})`,
        count: count()
      })
      .from(supportRequests);
    const resolutionCondition = and(
      gte(supportRequests.updatedAt, startDate),
      or(eq(supportRequests.status, "resolved"), eq(supportRequests.status, "closed"))
    );
    const resolutionData = whereConditions 
      ? await resolutionQuery
          .where(and(whereConditions, resolutionCondition))
          .groupBy(sql`DATE(${supportRequests.updatedAt})`)
          .orderBy(sql`DATE(${supportRequests.updatedAt})`)
      : await resolutionQuery
          .where(resolutionCondition)
          .groupBy(sql`DATE(${supportRequests.updatedAt})`)
          .orderBy(sql`DATE(${supportRequests.updatedAt})`);

    // Generate date range and combine data
    const trends = [];
    let cumulative = 0;
    
    for (let i = 0; i < days; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const submitted = submissionData.find((d) => d.date === dateStr)?.count || 0;
      const resolved = resolutionData.find((d) => d.date === dateStr)?.count || 0;
      
      cumulative += submitted - resolved;
      
      trends.push({
        date: dateStr,
        submitted,
        resolved,
        cumulative: Math.max(0, cumulative)
      });
    }

    return trends;
  }




  // ============ EVALUATION REQUEST METHODS ============

  async createEvaluationRequest(request: InsertEvaluationRequest): Promise<EvaluationRequest> {
    const _newRequestInserted = await db
        .insert(evaluationRequests)
        .values(request as typeof evaluationRequests.$inferInsert)
        .returning();
      const [newRequest] = _newRequestInserted as Array<typeof evaluationRequests.$inferSelect>;
    return newRequest;
  }

  // Create evaluation request with products in a transaction
  async createEvaluationRequestWithProducts(request: InsertEvaluationRequest, productIds: number[]): Promise<EvaluationRequest> {
    return await db.transaction(async (tx) => {
      // Create the evaluation request
      const [newRequest] = await tx.insert(evaluationRequests).values(request).returning();
      
      // Create the product associations
      if (productIds && productIds.length > 0) {
        const productValues = productIds.map(productId => ({
          evaluationRequestId: newRequest.id,
          productId
        }));
        
        await tx.insert(evaluationRequestProducts).values(productValues);
      }
      
      return newRequest;
    });
  }

  async createEvaluationRequestProduct(product: InsertEvaluationRequestProduct): Promise<EvaluationRequestProduct> {
    const _newProductInserted = await db
        .insert(evaluationRequestProducts)
        .values(product as typeof evaluationRequestProducts.$inferInsert)
        .returning();
      const [newProduct] = _newProductInserted as Array<typeof evaluationRequestProducts.$inferSelect>;
    return newProduct;
  }

  async getEvaluationRequests(filters?: {
    userId?: string;
    customerId?: number;
    status?: string;
    accessibleCustomerIds?: number[];
  }): Promise<EvaluationRequestWithDetails[]> {
    let query = db.select().from(evaluationRequests).$dynamic();

    const conditions = [];

    // Demo Mode: only requests on accounts of the current mode.
    conditions.push(applyDemoFilterByCustomer(evaluationRequests.customerId));

    if (filters?.userId) {
      conditions.push(eq(evaluationRequests.userId, filters.userId));
    }

    if (filters?.customerId) {
      conditions.push(eq(evaluationRequests.customerId, filters.customerId));
    }

    if (filters?.status) {
      conditions.push(eq(evaluationRequests.status, filters.status));
    }

    if (filters?.accessibleCustomerIds && filters.accessibleCustomerIds.length > 0) {
      conditions.push(inArray(evaluationRequests.customerId, filters.accessibleCustomerIds));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query.orderBy(desc(evaluationRequests.createdAt));
    return this.hydrateEvaluationRequests(rows);
  }

  async getEvaluationRequestById(id: number): Promise<EvaluationRequest | undefined> {
    const [request] = await db.select().from(evaluationRequests).where(eq(evaluationRequests.id, id));
    return request;
  }

  async getEvaluationRequestDetailById(id: number): Promise<EvaluationRequestWithDetails | undefined> {
    const request = await this.getEvaluationRequestById(id);
    if (!request) return undefined;
    const [detail] = await this.hydrateEvaluationRequests([request]);
    return detail;
  }

  // Adds account name, requester name and requested solutions to each row,
  // with one query per lookup table (no N+1).
  async hydrateEvaluationRequests(rows: EvaluationRequest[]): Promise<EvaluationRequestWithDetails[]> {
    if (rows.length === 0) return [];
    const requestIds = rows.map((r) => r.id);
    const customerIds = Array.from(new Set(rows.map((r) => r.customerId)));
    const userIds = Array.from(new Set(rows.map((r) => r.userId)));

    const [customerRows, userRows, productRows] = await Promise.all([
      db
        .select({ id: customers.id, accountName: customers.accountName })
        .from(customers)
        .where(inArray(customers.id, customerIds)),
      db
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
        .from(users)
        .where(inArray(users.id, userIds)),
      db
        .select({
          evaluationRequestId: evaluationRequestProducts.evaluationRequestId,
          productId: products.id,
          name: products.name,
        })
        .from(evaluationRequestProducts)
        .innerJoin(products, eq(evaluationRequestProducts.productId, products.id))
        .where(inArray(evaluationRequestProducts.evaluationRequestId, requestIds)),
    ]);

    const customerNames = new Map(customerRows.map((c) => [c.id, c.accountName]));
    const requesterNames = new Map(
      userRows.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || null]),
    );
    const productsByRequest = new Map<number, { ids: number[]; names: string[] }>();
    for (const row of productRows) {
      const entry = productsByRequest.get(row.evaluationRequestId) ?? { ids: [], names: [] };
      entry.ids.push(row.productId);
      entry.names.push(row.name);
      productsByRequest.set(row.evaluationRequestId, entry);
    }

    return rows.map((row) => ({
      ...row,
      customerName: customerNames.get(row.customerId) ?? null,
      requesterName: requesterNames.get(row.userId) ?? null,
      solutionIds: productsByRequest.get(row.id)?.ids ?? [],
      requestedSolutions: productsByRequest.get(row.id)?.names ?? [],
    }));
  }

  async updateEvaluationRequest(id: number, updates: Partial<EvaluationRequest>): Promise<EvaluationRequest> {
    const [updatedRequest] = await db
      .update(evaluationRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(evaluationRequests.id, id))
      .returning();
    return updatedRequest;
  }

  // Updates the request's fields and, when productIds is given, replaces its
  // requested solutions, in one transaction.
  async updateEvaluationRequestWithProducts(
    id: number,
    updates: Partial<Pick<EvaluationRequest, "startDate" | "endDate" | "topReasons" | "compellingEvent" | "status">>,
    productIds?: number[],
  ): Promise<EvaluationRequest> {
    return await db.transaction(async (tx) => {
      const [updatedRequest] = await tx
        .update(evaluationRequests)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(evaluationRequests.id, id))
        .returning();
      if (productIds) {
        await tx.delete(evaluationRequestProducts).where(eq(evaluationRequestProducts.evaluationRequestId, id));
        if (productIds.length > 0) {
          await tx
            .insert(evaluationRequestProducts)
            .values(productIds.map((productId) => ({ evaluationRequestId: id, productId })));
        }
      }
      return updatedRequest;
    });
  }

  async deleteEvaluationRequest(id: number): Promise<void> {
    // Use transaction to ensure atomicity
    await db.transaction(async (tx) => {
      // Delete the evaluation request products first (foreign key constraint)
      await tx.delete(evaluationRequestProducts).where(eq(evaluationRequestProducts.evaluationRequestId, id));
      
      // Delete the evaluation request itself
      await tx.delete(evaluationRequests).where(eq(evaluationRequests.id, id));
    });
  }

  async getEvaluationRequestsCount(filters?: {
    userId?: string;
    customerId?: number;
    status?: string;
    accessibleCustomerIds?: number[];
  }): Promise<number> {
    let query = db.select({ count: count() }).from(evaluationRequests).$dynamic();

    const conditions = [];

    // Demo Mode: only requests on accounts of the current mode.
    conditions.push(applyDemoFilterByCustomer(evaluationRequests.customerId));

    if (filters?.userId) {
      conditions.push(eq(evaluationRequests.userId, filters.userId));
    }

    if (filters?.customerId) {
      conditions.push(eq(evaluationRequests.customerId, filters.customerId));
    }

    if (filters?.status) {
      conditions.push(eq(evaluationRequests.status, filters.status));
    }

    if (filters?.accessibleCustomerIds && filters.accessibleCustomerIds.length > 0) {
      conditions.push(inArray(evaluationRequests.customerId, filters.accessibleCustomerIds));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  async getProductsByIds(ids: number[]): Promise<Product[]> {
    if (ids.length === 0) return [];
    return await db.select().from(products).where(inArray(products.id, ids));
  }

  // Support Request methods
  async createSupportRequest(request: InsertSupportRequest): Promise<SupportRequest> {
    const [newRequest] = await db
      .insert(supportRequests)
      .values({
        ...request,
        submittedDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return newRequest;
  }

  async updateSupportRequest(id: number, updates: Partial<InsertSupportRequest>): Promise<SupportRequest> {
    const [updatedRequest] = await db
      .update(supportRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supportRequests.id, id))
      .returning();
    return updatedRequest;
  }

  async deleteSupportRequest(id: number): Promise<void> {
    await db.delete(supportRequests).where(eq(supportRequests.id, id));
  }

  async getSupportRequests(filters?: {
    userId?: string;
    customerId?: number;
    type?: string;
    status?: string;
    search?: string;
    assignedToUserId?: string;
    accessibleCustomerIds?: number[];
    includeInternalNotesInSearch?: boolean;
  }): Promise<SupportRequest[]> {
    let query = db.select().from(supportRequests).$dynamic();

    const conditions = [];

    // Demo Mode: only requests on accounts of the current mode.
    conditions.push(applyDemoFilterByCustomer(supportRequests.customerId));

    // Apply customer access filtering for external users
    if (filters?.accessibleCustomerIds && filters.accessibleCustomerIds.length > 0) {
      conditions.push(inArray(supportRequests.customerId, filters.accessibleCustomerIds));
    }

    if (filters?.userId) {
      conditions.push(eq(supportRequests.submittedByUserId, filters.userId));
    }

    if (filters?.customerId) {
      conditions.push(eq(supportRequests.customerId, filters.customerId));
    }

    if (filters?.type) {
      conditions.push(eq(supportRequests.type, filters.type));
    }

    if (filters?.status) {
      conditions.push(eq(supportRequests.status, filters.status));
    }

    if (filters?.assignedToUserId) {
      conditions.push(eq(supportRequests.assignedToUserId, filters.assignedToUserId));
    }

    // Search across title, description, and internalNotes (role-based)
    if (filters?.search) {
      const searchConditions = [
        ilike(supportRequests.title, `%${filters.search}%`),
        ilike(supportRequests.description, `%${filters.search}%`)
      ];
      
      // Include internalNotes in search only for internal users
      if (filters?.includeInternalNotesInSearch) {
        searchConditions.push(ilike(supportRequests.internalNotes, `%${filters.search}%`));
      }
      
      conditions.push(or(...searchConditions));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return await query.orderBy(desc(supportRequests.updatedAt));
  }

  async getSupportRequestById(id: number): Promise<SupportRequest | undefined> {
    const [request] = await db.select().from(supportRequests).where(eq(supportRequests.id, id));
    return request;
  }

  async getSupportRequestsCount(filters?: {
    userId?: string;
    customerId?: number;
    type?: string;
    status?: string;
    search?: string;
    assignedToUserId?: string;
    accessibleCustomerIds?: number[];
    includeInternalNotesInSearch?: boolean;
  }): Promise<number> {
    let query = db.select({ count: count() }).from(supportRequests).$dynamic();

    const conditions = [];

    // Demo Mode: only requests on accounts of the current mode.
    conditions.push(applyDemoFilterByCustomer(supportRequests.customerId));

    // Apply same filtering logic as getSupportRequests
    if (filters?.accessibleCustomerIds && filters.accessibleCustomerIds.length > 0) {
      conditions.push(inArray(supportRequests.customerId, filters.accessibleCustomerIds));
    }

    if (filters?.userId) {
      conditions.push(eq(supportRequests.submittedByUserId, filters.userId));
    }

    if (filters?.customerId) {
      conditions.push(eq(supportRequests.customerId, filters.customerId));
    }

    if (filters?.type) {
      conditions.push(eq(supportRequests.type, filters.type));
    }

    if (filters?.status) {
      conditions.push(eq(supportRequests.status, filters.status));
    }

    if (filters?.assignedToUserId) {
      conditions.push(eq(supportRequests.assignedToUserId, filters.assignedToUserId));
    }

    if (filters?.search) {
      const searchConditions = [
        ilike(supportRequests.title, `%${filters.search}%`),
        ilike(supportRequests.description, `%${filters.search}%`)
      ];
      
      // Include internalNotes in search only for internal users
      if (filters?.includeInternalNotesInSearch) {
        searchConditions.push(ilike(supportRequests.internalNotes, `%${filters.search}%`));
      }
      
      conditions.push(or(...searchConditions));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const result = await query;
    return result[0]?.count || 0;
  }

  // ── Evaluation requests from other apps (POST /api/v1/evaluation-requests)
  // Accounts and solutions a request may name, in the current request's demo
  // mode: active, not the internal (company) account, ids and names only.

  /** Accounts whose name contains the query (case-insensitive), exact matches first. */
  async searchEvaluationRequestAccounts(query: string, limit: number): Promise<Array<{ id: number; name: string }>> {
    const needle = query.trim().toLowerCase();
    const escaped = needle.replace(/[\\%_]/g, (c) => `\\${c}`);
    return db
      .select({ id: customers.id, name: customers.accountName })
      .from(customers)
      .where(
        and(
          eq(customers.isActive, true),
          eq(customers.isInternal, false),
          applyDemoFilter(customers),
          ilike(customers.accountName, `%${escaped}%`),
        ),
      )
      .orderBy(sql`(lower(${customers.accountName}) = ${needle}) DESC`, asc(customers.accountName))
      .limit(limit);
  }

  /** The account, if a request from another app may name it. */
  async getEvaluationRequestAccount(id: number): Promise<{ id: number; name: string } | undefined> {
    const [row] = await db
      .select({ id: customers.id, name: customers.accountName })
      .from(customers)
      .where(
        and(
          eq(customers.id, id),
          eq(customers.isActive, true),
          eq(customers.isInternal, false),
          applyDemoFilter(customers),
        ),
      )
      .limit(1);
    return row;
  }

  /**
   * Active solutions, by name, with how CriteriaIQ draws each one: its
   * uploaded graphic (graphicUrl, wins when set) or its lucide icon name.
   */
  async getEvaluationRequestSolutions(): Promise<EvaluationRequestSolution[]> {
    const rows = await db
      .select({
        id: products.id,
        name: products.name,
        solutionType: products.solutionType,
        description: products.description,
        solutionIcon: products.solutionIcon,
        solutionIconName: products.solutionIconName,
      })
      .from(products)
      .where(and(eq(products.isActive, true), applyDemoFilter(products)))
      .orderBy(asc(products.name));
    const ids = rows.map((r) => r.id);
    const links = ids.length
      ? await db
          .select({
            productId: productComponents.productId,
            id: components.id,
            name: components.name,
            description: components.description,
          })
          .from(productComponents)
          .innerJoin(components, eq(components.id, productComponents.componentId))
          .where(
            and(
              inArray(productComponents.productId, ids),
              eq(components.isActive, true),
              applyDemoFilter(components),
            ),
          )
          .orderBy(asc(components.name), asc(components.id))
      : [];
    const byProduct = new Map<number, EvaluationRequestSolution["components"]>();
    for (const l of links) {
      const list = byProduct.get(l.productId) ?? [];
      if (!list.some((c) => c.id === l.id)) list.push({ id: l.id, name: l.name, description: l.description || null });
      byProduct.set(l.productId, list);
    }
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      iconName: r.solutionIconName || null,
      graphicUrl: solutionGraphicPath(r.solutionIcon),
      solutionType: r.solutionType || null,
      description: r.description || null,
      components: byProduct.get(r.id) ?? [],
    }));
  }

  async getEvaluationRequestByExternalRef(externalRef: string): Promise<EvaluationRequest | undefined> {
    const [row] = await db
      .select()
      .from(evaluationRequests)
      .where(eq(evaluationRequests.externalRef, externalRef))
      .limit(1);
    return row;
  }

  /**
   * Saves a request another app sent, with its solutions, in one transaction.
   * A second call with the same externalRef (a retry racing the first) gets
   * the saved request back with created: false.
   */
  async createExternalEvaluationRequest(
    values: {
      userId: string;
      customerId: number;
      startDate: Date;
      endDate: Date;
      topReasons: string;
      compellingEvent: string;
      externalRef: string;
    },
    productIds: number[],
  ): Promise<{ request: EvaluationRequest; created: boolean }> {
    try {
      const request = await db.transaction(async (tx) => {
        const [row] = await tx.insert(evaluationRequests).values(values).returning();
        await tx
          .insert(evaluationRequestProducts)
          .values(productIds.map((productId) => ({ evaluationRequestId: row.id, productId })));
        return row;
      });
      return { request, created: true };
    } catch (error) {
      // node-postgres errors may arrive wrapped by drizzle, with the pg error as `cause`.
      const e = error as { code?: string; cause?: { code?: string } } | null;
      if ((e?.code ?? e?.cause?.code) === "23505") {
        const existing = await this.getEvaluationRequestByExternalRef(values.externalRef);
        if (existing) return { request: existing, created: false };
      }
      throw error;
    }
  }
}
