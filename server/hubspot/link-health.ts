// Nightly check that every Deal and Company a project or account syncs with
// still exists in HubSpot (Phase 1, PR 6). ImpactIQ's linkHealth.ts is the
// model; the Salesforce counterpart is salesforce-link-health.ts.
//
// - Batched: one batch read per 100 ids per object type.
// - Only an id HubSpot answers OBJECT_NOT_FOUND for is marked broken. A
//   failed batch changes nothing, and a rejected key stops the run, so an
//   outage never flags real links.
// - Self-healing: a broken link whose record is found again goes back to
//   active.
// - Merges: HubSpot answers a merged-away id with the surviving record (the
//   old id listed in hs_merged_object_ids). The link, and the id stored on
//   the project or account, move to the survivor.
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { parseCrmRecordInput } from "@shared/crm-record-id";
import { storage } from "../storage.js";
import { hubspotRecordUrl } from "../crm/hubspot-provider";
import { hubspotRequest, HubspotError } from "./client";
import { getHubspotConfig, type HubspotConfig } from "./config";
import { isHubspotSyncObject, type HubspotSyncObject } from "./records";
import { withCrmColumns } from "../lib/account-crm-link";

const CHUNK_SIZE = 100;
const HUBSPOT_ID = /^\d{1,30}$/;
const OBJECT_TYPE_ID: Record<HubspotSyncObject, string> = { deals: "0-3", companies: "0-2" };

export interface HubspotLinkHealthResult {
  checked: number;
  markedBroken: number;
  restored: number;
  merged: number;
  skipped: number;
  failedChunks: number;
}

type LinkRow = typeof storage.schema.salesforceRecordLinks.$inferSelect;

export interface BatchOutcome {
  /** Requested ids HubSpot returned as themselves. */
  found: Set<string>;
  /** Requested ids HubSpot says don't exist. */
  missing: Set<string>;
  /** Requested ids merged into another record: old id → surviving id. */
  merged: Map<string, string>;
}

function asId(value: unknown): string | null {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  return HUBSPOT_ID.test(text) ? text : null;
}

/**
 * Reads a batch-read answer (200, or 207 with errors). An id that is neither
 * returned, merged, nor named in an OBJECT_NOT_FOUND error is in none of the
 * sets, so it stays as it was.
 */
export function readBatchOutcome(requested: string[], body: unknown): BatchOutcome {
  const outcome: BatchOutcome = { found: new Set(), missing: new Set(), merged: new Map() };
  const want = new Set(requested);
  const data = (body && typeof body === "object" ? body : {}) as {
    results?: Array<{ id?: unknown; properties?: Record<string, unknown> }>;
    errors?: Array<{ category?: unknown; context?: { ids?: unknown } }>;
  };
  for (const result of data.results ?? []) {
    const id = asId(result.id);
    if (!id) continue;
    if (want.has(id)) outcome.found.add(id);
    const mergedIds = String(result.properties?.hs_merged_object_ids ?? "")
      .split(";")
      .map((s) => s.trim());
    for (const old of mergedIds) {
      if (old && old !== id && want.has(old) && !outcome.found.has(old)) outcome.merged.set(old, id);
    }
  }
  for (const error of data.errors ?? []) {
    if (error.category !== "OBJECT_NOT_FOUND" || !Array.isArray(error.context?.ids)) continue;
    for (const raw of error.context.ids) {
      const id = asId(raw);
      if (id && want.has(id) && !outcome.found.has(id) && !outcome.merged.has(id)) outcome.missing.add(id);
    }
  }
  return outcome;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function readChunk(objectType: HubspotSyncObject, ids: string[]): Promise<BatchOutcome | null> {
  const { status, body } = await hubspotRequest(`/crm/v3/objects/${objectType}/batch/read`, {
    method: "POST",
    body: { properties: ["hs_merged_object_ids"], inputs: ids.map((id) => ({ id })) },
  });
  if (status !== 200 && status !== 207) return null;
  return readBatchOutcome(ids, body);
}

/** Moves a link, and the id stored on its record, from a merged-away record to the survivor. */
async function repointMerged(cfg: HubspotConfig, link: LinkRow, survivor: string): Promise<"moved" | "taken"> {
  const links = storage.schema.salesforceRecordLinks;
  const [taken] = await storage.db
    .select({ id: links.id })
    .from(links)
    .where(and(eq(links.crmProvider, "hubspot"), eq(links.sfRecordId, survivor)))
    .limit(1);
  if (taken && taken.id !== link.id) return "taken";

  const recordId = Number.parseInt(link.cqiRecordId, 10);
  const old = link.sfRecordId;
  if (link.cqiEntityType === "project" && Number.isInteger(recordId)) {
    const p = storage.schema.projects;
    await storage.db
      .update(p)
      .set({ crmOpportunityId: survivor })
      .where(and(eq(p.id, recordId), eq(p.crmProvider, "hubspot"), eq(p.crmOpportunityId, old)));
    await storage
      .createProjectAudit({
        projectId: recordId,
        userId: "system",
        userEmail: "",
        userName: "HubSpot link check",
        fieldName: "crmOpportunityId",
        oldValue: old,
        newValue: `${survivor} (HubSpot merge)`,
        changeType: "update",
      })
      .catch((error: unknown) => console.error("[HubSpot Link Check] could not audit a merge:", error));
  } else if (link.cqiEntityType === "customer" && Number.isInteger(recordId)) {
    const c = storage.schema.customers;
    const [row] = await storage.db.select({ url: c.salesforceAccountUrl }).from(c).where(eq(c.id, recordId)).limit(1);
    const url = hubspotRecordUrl(cfg, OBJECT_TYPE_ID.companies, survivor);
    if (row && url && parseCrmRecordInput(row.url, "hubspot")?.id === old) {
      await storage.db.update(c).set(withCrmColumns({ salesforceAccountUrl: url })).where(eq(c.id, recordId));
    }
    // Projects that name the merged Company as their CRM account follow it.
    const p = storage.schema.projects;
    await storage.db
      .update(p)
      .set({ crmAccountId: survivor })
      .where(and(eq(p.crmProvider, "hubspot"), eq(p.crmAccountId, old)));
  }

  await storage.db
    .update(links)
    .set({
      sfRecordId: survivor,
      linkStatus: "active",
      linkStatusReason: `Merged in HubSpot; was ${old}`,
      updatedAt: new Date(),
    })
    .where(eq(links.id, link.id));
  return "moved";
}

export async function checkHubspotLinkHealth(): Promise<HubspotLinkHealthResult> {
  const result: HubspotLinkHealthResult = { checked: 0, markedBroken: 0, restored: 0, merged: 0, skipped: 0, failedChunks: 0 };
  const cfg = await getHubspotConfig();
  if (!cfg) return result;

  const links = storage.schema.salesforceRecordLinks;
  const rows = await storage.db
    .select()
    .from(links)
    .where(and(eq(links.crmProvider, "hubspot"), inArray(links.linkStatus, ["active", "broken"])));
  if (rows.length === 0) return result;

  const startTime = Date.now();
  const [run] = await storage.db
    .insert(storage.schema.salesforceSyncRuns)
    .values({
      crmProvider: "hubspot",
      entity: "link",
      mode: "link_check",
      direction: "inbound",
      oauthMode: "org_token",
      status: "running",
      startedAt: new Date(),
      batchId: nanoid(),
    })
    .returning();

  const byObject = new Map<HubspotSyncObject, LinkRow[]>();
  for (const row of rows) {
    if (!isHubspotSyncObject(row.sfObjectType) || !HUBSPOT_ID.test(row.sfRecordId)) {
      result.skipped++;
      continue;
    }
    const list = byObject.get(row.sfObjectType) ?? [];
    list.push(row);
    byObject.set(row.sfObjectType, list);
  }

  const errors: string[] = [];
  let stopped = false;
  for (const [objectType, list] of byObject) {
    if (stopped) break;
    for (const part of chunk(list, CHUNK_SIZE)) {
      let outcome: BatchOutcome | null;
      try {
        outcome = await readChunk(objectType, Array.from(new Set(part.map((l) => l.sfRecordId))));
      } catch (error) {
        result.failedChunks++;
        errors.push(`${objectType}: ${error instanceof Error ? error.message : String(error)}`);
        // A rejected key fails every later batch the same way.
        if (error instanceof HubspotError && error.code === "unauthorized") {
          stopped = true;
          break;
        }
        continue;
      }
      if (!outcome) {
        result.failedChunks++;
        errors.push(`${objectType}: batch read failed`);
        continue;
      }

      result.checked += part.length;
      const now = new Date();
      const missing = part.filter((l) => l.linkStatus === "active" && outcome.missing.has(l.sfRecordId));
      const back = part.filter((l) => l.linkStatus === "broken" && outcome.found.has(l.sfRecordId));
      if (missing.length > 0) {
        await storage.db
          .update(links)
          .set({ linkStatus: "broken", linkStatusReason: "Not found in HubSpot during the nightly link check", updatedAt: now })
          .where(and(inArray(links.id, missing.map((l) => l.id)), eq(links.linkStatus, "active")));
        result.markedBroken += missing.length;
      }
      if (back.length > 0) {
        await storage.db
          .update(links)
          .set({ linkStatus: "active", linkStatusReason: null, updatedAt: now })
          .where(and(inArray(links.id, back.map((l) => l.id)), eq(links.linkStatus, "broken")));
        result.restored += back.length;
      }
      for (const link of part) {
        const survivor = outcome.merged.get(link.sfRecordId);
        if (!survivor) continue;
        if ((await repointMerged(cfg, link, survivor)) === "moved") {
          result.merged++;
        } else if (link.linkStatus === "active") {
          await storage.db
            .update(links)
            .set({ linkStatus: "broken", linkStatusReason: `Merged in HubSpot into ${survivor}, which another record already syncs with`, updatedAt: now })
            .where(eq(links.id, link.id));
          result.markedBroken++;
        }
      }
    }
  }

  await storage.db
    .update(storage.schema.salesforceSyncRuns)
    .set({
      status: result.failedChunks > 0 ? "partial" : "success",
      totalRecords: rows.length,
      successCount: result.checked,
      errorCount: result.markedBroken,
      skippedCount: result.skipped,
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      metadata: result,
      errorSummary: errors.length > 0 ? errors.join("\n") : null,
    })
    .where(eq(storage.schema.salesforceSyncRuns.id, run.id));

  return result;
}
