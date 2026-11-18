/**
 * Nightly check that every linked Salesforce record still exists.
 *
 * Ported from ImpactIQ's detectDisconnectedLinks job:
 * - Batched: one `SELECT Id ... WHERE Id IN (...)` per object type per 200
 *   ids, instead of one API call per link.
 * - Self-healing both ways: a missing record marks the link `broken`; a
 *   broken link whose record is found again (Recycle Bin restore, or a
 *   transient failure last time) goes back to `active`.
 * - A failed query changes nothing. "Absent from a failed fetch" is not the
 *   same as "deleted", so a Salesforce outage never flags real links.
 *
 * Each group of links is checked with the Salesforce connection of the user
 * who linked them (there is no org-wide connection). Links with no linking
 * user, or whose user is no longer connected, are left alone.
 */
import { storage } from '../storage.js';
import { and, eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getSalesforceConnectionForUser } from './salesforce-config-service.js';

const CHUNK_SIZE = 200;
const SF_ID_RX = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const SOBJECT_RX = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface LinkHealthResult {
  checked: number;
  markedBroken: number;
  restored: number;
  skipped: number;
  failedChunks: number;
}

type LinkRow = typeof storage.schema.salesforceRecordLinks.$inferSelect;

/** Salesforce Ids compare case-sensitively on their first 15 characters. */
function id15(id: string): string {
  return id.slice(0, 15);
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function checkLinkHealth(): Promise<LinkHealthResult> {
  const links = storage.schema.salesforceRecordLinks;
  const rows = await storage.db
    .select()
    .from(links)
    // Salesforce's own links only; HubSpot ids can look like Salesforce ids.
    .where(and(eq(links.crmProvider, 'salesforce'), inArray(links.linkStatus, ['active', 'broken'])));

  const result: LinkHealthResult = { checked: 0, markedBroken: 0, restored: 0, skipped: 0, failedChunks: 0 };
  if (rows.length === 0) return result;

  const startTime = Date.now();
  const [run] = await storage.db
    .insert(storage.schema.salesforceSyncRuns)
    .values({
      crmProvider: 'salesforce',
      entity: 'link',
      mode: 'link_check',
      direction: 'inbound',
      oauthMode: 'user_context',
      status: 'running',
      startedAt: new Date(),
      batchId: nanoid(),
    })
    .returning();

  // Group by linking user, then by object type.
  const byUser = new Map<string, Map<string, LinkRow[]>>();
  for (const row of rows) {
    if (!row.linkedBy || !SF_ID_RX.test(row.sfRecordId) || !SOBJECT_RX.test(row.sfObjectType)) {
      result.skipped++;
      continue;
    }
    const byObject = byUser.get(row.linkedBy) ?? new Map<string, LinkRow[]>();
    const list = byObject.get(row.sfObjectType) ?? [];
    list.push(row);
    byObject.set(row.sfObjectType, list);
    byUser.set(row.linkedBy, byObject);
  }

  const errors: string[] = [];

  for (const [userId, byObject] of byUser) {
    let conn;
    try {
      conn = await getSalesforceConnectionForUser(userId);
    } catch {
      for (const list of byObject.values()) result.skipped += list.length;
      continue;
    }

    for (const [sobject, list] of byObject) {
      for (const part of chunk(list, CHUNK_SIZE)) {
        let found: Set<string>;
        try {
          const idList = part.map((l) => `'${l.sfRecordId}'`).join(',');
          const res = await conn.query<{ Id: string }>(`SELECT Id FROM ${sobject} WHERE Id IN (${idList})`);
          found = new Set(res.records.map((r) => id15(r.Id)));
        } catch (error) {
          // Leave every link in this chunk exactly as it was.
          result.failedChunks++;
          errors.push(`${sobject}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }

        result.checked += part.length;
        const now = new Date();
        const missing = part.filter((l) => l.linkStatus === 'active' && !found.has(id15(l.sfRecordId)));
        const back = part.filter((l) => l.linkStatus === 'broken' && found.has(id15(l.sfRecordId)));

        if (missing.length > 0) {
          await storage.db
            .update(links)
            .set({ linkStatus: 'broken', linkStatusReason: 'Not found in Salesforce during the nightly link check', updatedAt: now })
            .where(and(inArray(links.id, missing.map((l) => l.id)), eq(links.linkStatus, 'active')));
          result.markedBroken += missing.length;
        }
        if (back.length > 0) {
          await storage.db
            .update(links)
            .set({ linkStatus: 'active', linkStatusReason: null, updatedAt: now })
            .where(and(inArray(links.id, back.map((l) => l.id)), eq(links.linkStatus, 'broken')));
          result.restored += back.length;
        }
      }
    }
  }

  await storage.db
    .update(storage.schema.salesforceSyncRuns)
    .set({
      status: result.failedChunks > 0 ? 'partial' : 'success',
      totalRecords: rows.length,
      successCount: result.checked,
      errorCount: result.markedBroken,
      skippedCount: result.skipped,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      metadata: result,
      errorSummary: errors.length > 0 ? errors.join('\n') : null,
    })
    .where(eq(storage.schema.salesforceSyncRuns.id, run.id));

  return result;
}
