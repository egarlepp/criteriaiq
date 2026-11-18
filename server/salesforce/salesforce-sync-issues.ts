/**
 * Salesforce Sync Issues and health KPIs (ported from ImpactIQ's CRM Sync
 * page).
 *
 * An issue is the LATEST run item for a record + direction when that item
 * is an error. So:
 * - a later success clears the issue on its own;
 * - "Resolve" stamps the error item (handled without retrying);
 * - a newer failure writes a new, unresolved item, so a resolved issue
 *   reopens automatically.
 */
import { storage } from '../storage.js';
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { syncCrm } from '../crm/sync-crm.js';

export type IssueStatusFilter = 'open' | 'resolved' | 'all';

export interface SyncIssue {
  itemId: number;
  runId: number;
  cqiEntityType: string;
  cqiRecordId: string;
  recordName: string | null;
  sfObjectType: string | null;
  sfRecordId: string | null;
  direction: string;
  message: string | null;
  failedAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  linkStatus: string | null;
}

export interface SyncHealth {
  openIssues: number;
  resolvedIssues: number;
  successRate24h: number | null;
  attempts24h: number;
  pendingQueue: number;
  retryingQueue: number;
  brokenLinks: number;
  lastRunAt: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function listSyncIssues(status: IssueStatusFilter = 'open', limit = 200): Promise<SyncIssue[]> {
  const statusClause =
    status === 'open'
      ? sql`AND latest.resolved_at IS NULL`
      : status === 'resolved'
        ? sql`AND latest.resolved_at IS NOT NULL`
        : sql``;

  const crm = await syncCrm();
  const result = await storage.db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (i.cqi_entity_type, i.cqi_record_id, i.direction)
        i.id, i.run_id, i.cqi_entity_type, i.cqi_record_id, i.sf_object_type, i.sf_record_id,
        i.direction, i.status, i.message, i.created_at, i.resolved_at, i.resolved_by
      FROM salesforce_sync_run_items i
      JOIN salesforce_sync_runs run ON run.id = i.run_id AND run.crm_provider = ${crm}
      WHERE i.status IN ('success', 'conflict', 'error')
      ORDER BY i.cqi_entity_type, i.cqi_record_id, i.direction, i.created_at DESC, i.id DESC
    )
    SELECT
      latest.*,
      CASE latest.cqi_entity_type
        WHEN 'project' THEN COALESCE(p.name, p.customer_name)
        WHEN 'customer' THEN c.account_name
        WHEN 'user' THEN NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '')
      END AS record_name,
      NULLIF(TRIM(CONCAT(r.first_name, ' ', r.last_name)), '') AS resolved_by_name,
      l.link_status
    FROM latest
    LEFT JOIN projects p ON latest.cqi_entity_type = 'project' AND p.id::text = latest.cqi_record_id
    LEFT JOIN customers c ON latest.cqi_entity_type = 'customer' AND c.id::text = latest.cqi_record_id
    LEFT JOIN users u ON latest.cqi_entity_type = 'user' AND u.id = latest.cqi_record_id
    LEFT JOIN users r ON r.id = latest.resolved_by
    LEFT JOIN salesforce_record_links l
      ON l.cqi_entity_type = latest.cqi_entity_type AND l.cqi_record_id = latest.cqi_record_id
      AND l.crm_provider = ${crm}
    WHERE latest.status = 'error' ${statusClause}
    ORDER BY latest.created_at DESC
    LIMIT ${limit}
  `);

  return (result.rows as Record<string, unknown>[]).map((row) => ({
    itemId: Number(row.id),
    runId: Number(row.run_id),
    cqiEntityType: String(row.cqi_entity_type),
    cqiRecordId: String(row.cqi_record_id),
    recordName: (row.record_name as string | null) ?? null,
    sfObjectType: (row.sf_object_type as string | null) ?? null,
    sfRecordId: (row.sf_record_id as string | null) ?? null,
    direction: String(row.direction),
    message: (row.message as string | null) ?? null,
    failedAt: toIso(row.created_at),
    resolvedAt: toIso(row.resolved_at),
    resolvedByName: (row.resolved_by_name as string | null) ?? null,
    linkStatus: (row.link_status as string | null) ?? null,
  }));
}

/** Mark an error item resolved. Returns false if it isn't an error item. */
export async function resolveSyncIssue(itemId: number, userId: string): Promise<boolean> {
  const items = storage.schema.salesforceSyncRunItems;
  const updated = await storage.db
    .update(items)
    .set({ resolvedAt: new Date(), resolvedBy: userId })
    .where(and(eq(items.id, itemId), eq(items.status, 'error'), isNull(items.resolvedAt)))
    .returning({ id: items.id });
  return updated.length > 0;
}

/** The error item behind an issue, for Retry. */
export async function getIssueItem(itemId: number) {
  const items = storage.schema.salesforceSyncRunItems;
  const [item] = await storage.db.select().from(items).where(eq(items.id, itemId)).limit(1);
  return item && item.status === 'error' ? item : null;
}

export async function getSyncHealth(): Promise<SyncHealth> {
  const items = storage.schema.salesforceSyncRunItems;
  const queue = storage.schema.salesforceSyncQueue;
  const links = storage.schema.salesforceRecordLinks;
  const runs = storage.schema.salesforceSyncRuns;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const crm = await syncCrm();
  const crmRuns = storage.db.select({ id: runs.id }).from(runs).where(eq(runs.crmProvider, crm));

  const [open, resolved, attempts, pending, broken, lastRun] = await Promise.all([
    listSyncIssues('open', 1000),
    listSyncIssues('resolved', 1000),
    storage.db
      .select({
        total: sql<string>`count(*)`,
        ok: sql<string>`count(*) filter (where ${items.status} in ('success', 'conflict'))`,
      })
      .from(items)
      .where(and(
        gte(items.createdAt, since),
        sql`${items.status} in ('success', 'conflict', 'error')`,
        inArray(items.runId, crmRuns),
      )),
    storage.db
      .select({
        pending: sql<string>`count(*)`,
        retrying: sql<string>`count(*) filter (where ${queue.retryCount} > 0)`,
      })
      .from(queue)
      .where(eq(queue.status, 'pending')),
    storage.db
      .select({ n: sql<string>`count(*)` })
      .from(links)
      .where(and(eq(links.linkStatus, 'broken'), eq(links.crmProvider, crm))),
    storage.db.select({ at: sql<Date | null>`max(${runs.startedAt})` }).from(runs).where(eq(runs.crmProvider, crm)),
  ]);

  // Aggregates come back from the pg driver as strings; coerce explicitly.
  const total = Number(attempts[0]?.total ?? 0);
  const ok = Number(attempts[0]?.ok ?? 0);

  return {
    openIssues: open.length,
    resolvedIssues: resolved.length,
    successRate24h: total > 0 ? Math.round((ok / total) * 1000) / 10 : null,
    attempts24h: total,
    pendingQueue: Number(pending[0]?.pending ?? 0),
    retryingQueue: Number(pending[0]?.retrying ?? 0),
    brokenLinks: Number(broken[0]?.n ?? 0),
    lastRunAt: toIso(lastRun[0]?.at),
  };
}
