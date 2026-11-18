// MCP server — mixin for DatabaseStorage.
//
// Two halves:
//   • The read-only queries behind the MCP tools (server/routes/mcp-routes.ts).
//     Each returns a narrow column set: no logos, contact lists, email
//     domains or free-text feedback, so a tool result stays small and an
//     AI client sees only what the tool's description promises.
//   • The mcp_tool_calls activity log (insert, list for the admin page,
//     daily prune) and the count of active mcp:read keys.
import { db } from "../db";
import { applyDemoFilter } from "../lib/demo-storage";
import { and, asc, count, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { apiKeys, customers, mcpToolCalls, projects, successCriteria } from "@shared/schema";
import type { InsertMcpToolCall, McpCallStatus } from "@shared/schema";

/** Scope an API key needs to call /api/mcp. Admin-scoped REST keys do not qualify. */
export const MCP_READ_SCOPE = "mcp:read";

export interface McpProjectFilter {
  search?: string;
  status?: string;
  customerName?: string;
  limit: number;
}

export interface McpActivityRow {
  id: number;
  calledAt: Date;
  tool: string;
  status: McpCallStatus;
  latencyMs: number | null;
  error: string | null;
  apiKeyId: number | null;
  apiKeyLabel: string | null;
  apiKeyPrefix: string | null;
}

const projectSummaryColumns = {
  id: projects.id,
  name: projects.name,
  customerName: projects.customerName,
  solutionName: projects.solutionName,
  status: projects.status,
  customerStatus: projects.customerStatus,
  risk: projects.risk,
  ranking: projects.ranking,
  startDate: projects.startDate,
  endDate: projects.endDate,
  completedDate: projects.completedDate,
  isDemo: projects.isDemo,
};

/** Escape LIKE wildcards so a search term matches literally. */
function likeTerm(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export class McpStorageMixin {
  // ─── Tool queries ─────────────────────────────────────────────────────

  async mcpListProjects(filter: McpProjectFilter) {
    const clauses: SQL[] = [];
    if (filter.status) clauses.push(eq(projects.status, filter.status));
    if (filter.customerName) clauses.push(ilike(projects.customerName, likeTerm(filter.customerName)));
    if (filter.search) {
      const term = likeTerm(filter.search);
      const match = or(
        ilike(projects.name, term),
        ilike(projects.customerName, term),
        ilike(projects.solutionName, term),
      );
      if (match) clauses.push(match);
    }
    return db
      .select(projectSummaryColumns)
      .from(projects)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(projects.id))
      .limit(filter.limit);
  }

  async mcpGetProject(id: number) {
    const [project] = await db
      .select({
        ...projectSummaryColumns,
        businessProblem: projects.businessProblem,
        customerObjective: projects.customerObjective,
        solutionDescription: projects.solutionDescription,
        industry: projects.industry,
        environment: projects.environment,
        type: projects.type,
        opportunityName: projects.opportunityName,
        opportunityAcvValue: projects.opportunityAcvValue,
        crmProvider: projects.crmProvider,
        crmOpportunityId: projects.crmOpportunityId,
        crmAccountId: projects.crmAccountId,
        tags: projects.tags,
      })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    if (!project) return null;
    const criteriaByStatus = await db
      .select({ status: successCriteria.status, count: count() })
      .from(successCriteria)
      .where(and(eq(successCriteria.projectId, id), eq(successCriteria.isActive, true)))
      .groupBy(successCriteria.status);
    return {
      ...project,
      successCriteria: Object.fromEntries(criteriaByStatus.map((r) => [r.status ?? "unknown", Number(r.count)])),
    };
  }

  async mcpListSuccessCriteria(projectId: number, status: string | undefined, limit: number) {
    const clauses: SQL[] = [eq(successCriteria.projectId, projectId), eq(successCriteria.isActive, true)];
    if (status) clauses.push(eq(successCriteria.status, status));
    return db
      .select({
        id: successCriteria.id,
        productName: successCriteria.productName,
        criterion: successCriteria.criterion,
        expectedOutcome: successCriteria.expectedOutcome,
        status: successCriteria.status,
        lineNumber: successCriteria.lineNumber,
        updatedAt: successCriteria.updatedAt,
      })
      .from(successCriteria)
      .where(and(...clauses))
      .orderBy(asc(successCriteria.lineNumber), asc(successCriteria.id))
      .limit(limit);
  }

  async mcpListAccounts(search: string | undefined, includeInactive: boolean, limit: number) {
    const clauses: SQL[] = [];
    if (!includeInactive) clauses.push(eq(customers.isActive, true));
    if (search) clauses.push(ilike(customers.accountName, likeTerm(search)));
    return db
      .select({
        id: customers.id,
        accountName: customers.accountName,
        abbreviation: customers.abbreviation,
        region: customers.region,
        isActive: customers.isActive,
        isPartner: customers.isPartner,
        isDemo: customers.isDemo,
      })
      .from(customers)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(asc(customers.accountName))
      .limit(limit);
  }

  async mcpProjectStatusSummary() {
    const [byStatus, byCustomerStatus, byRisk] = await Promise.all([
      db.select({ key: projects.status, count: count() }).from(projects).groupBy(projects.status),
      db.select({ key: projects.customerStatus, count: count() }).from(projects).groupBy(projects.customerStatus),
      db.select({ key: projects.risk, count: count() }).from(projects).groupBy(projects.risk),
    ]);
    const toMap = (rows: { key: string | null; count: number }[]) =>
      Object.fromEntries(rows.map((r) => [r.key ?? "unknown", Number(r.count)]));
    return {
      total: byStatus.reduce((sum, r) => sum + Number(r.count), 0),
      byStatus: toMap(byStatus),
      byCustomerStatus: toMap(byCustomerStatus),
      byRisk: toMap(byRisk),
    };
  }

  // ─── Activity log ─────────────────────────────────────────────────────

  async insertMcpToolCall(row: InsertMcpToolCall): Promise<void> {
    await db.insert(mcpToolCalls).values(row);
  }

  async listMcpToolCalls(opts: { status?: McpCallStatus; limit: number }): Promise<McpActivityRow[]> {
    return db
      .select({
        id: mcpToolCalls.id,
        calledAt: mcpToolCalls.calledAt,
        tool: mcpToolCalls.tool,
        status: mcpToolCalls.status,
        latencyMs: mcpToolCalls.latencyMs,
        error: mcpToolCalls.error,
        apiKeyId: mcpToolCalls.apiKeyId,
        apiKeyLabel: apiKeys.label,
        apiKeyPrefix: apiKeys.keyPrefix,
      })
      .from(mcpToolCalls)
      .leftJoin(apiKeys, eq(apiKeys.id, mcpToolCalls.apiKeyId))
      .where(and(applyDemoFilter(mcpToolCalls), opts.status ? eq(mcpToolCalls.status, opts.status) : undefined))
      .orderBy(desc(mcpToolCalls.calledAt))
      .limit(opts.limit);
  }

  /** Deletes rows older than `before`; returns how many were removed. */
  async pruneMcpToolCalls(before: Date): Promise<number> {
    const removed = await db.delete(mcpToolCalls).where(lt(mcpToolCalls.calledAt, before)).returning({ id: mcpToolCalls.id });
    return removed.length;
  }

  /** Active, unexpired keys carrying the mcp:read scope. */
  async countActiveMcpKeys(): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.isActive, true),
          sql`${apiKeys.scopes} @> ${JSON.stringify([MCP_READ_SCOPE])}::jsonb`,
          sql`(${apiKeys.expiresAt} IS NULL OR ${apiKeys.expiresAt} > now())`,
        ),
      );
    return Number(row?.value ?? 0);
  }
}
