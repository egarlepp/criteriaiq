// Keeps a record's HubSpot sync link in step with what the record itself
// says. On HubSpot there is no separate "link to CRM" action: a project
// links the Deal named on it (crm_opportunity_id), an account the Company
// in its CRM link URL. Each save calls ensureHubspotLink() before the
// outbound sync is queued, so the link the sync reads is never stale.
import { and, eq } from "drizzle-orm";
import { parseCrmRecordInput } from "@shared/crm-record-id";
import { storage } from "../storage.js";
import type { HubspotSyncObject } from "./records";

export interface HubspotLinkTarget {
  objectType: HubspotSyncObject;
  id: string;
  name: string | null;
}

type LinkEntity = "project" | "customer" | "user";

const HUBSPOT_ID = /^\d{1,30}$/;

/** The HubSpot record a project or account points at, from its own columns. */
export function hubspotTargetFor(
  entity: LinkEntity,
  record: { crmProvider?: string | null; crmOpportunityId?: string | null; salesforceAccountUrl?: string | null; name?: string | null },
): HubspotLinkTarget | null {
  if (entity === "project") {
    const id = record.crmOpportunityId?.trim() ?? "";
    if (record.crmProvider !== "hubspot" || !HUBSPOT_ID.test(id)) return null;
    return { objectType: "deals", id, name: record.name ?? null };
  }
  if (entity === "customer") {
    const parsed = parseCrmRecordInput(record.salesforceAccountUrl, "hubspot");
    return parsed ? { objectType: "companies", id: parsed.id, name: record.name ?? null } : null;
  }
  return null;
}

async function loadTarget(entity: LinkEntity, cqiRecordId: string): Promise<HubspotLinkTarget | null> {
  const id = Number.parseInt(cqiRecordId, 10);
  if (!Number.isInteger(id)) return null;
  if (entity === "project") {
    const p = storage.schema.projects;
    const [row] = await storage.db
      .select({ crmProvider: p.crmProvider, crmOpportunityId: p.crmOpportunityId, name: p.name })
      .from(p)
      .where(eq(p.id, id))
      .limit(1);
    return row ? hubspotTargetFor(entity, row) : null;
  }
  if (entity === "customer") {
    const c = storage.schema.customers;
    const [row] = await storage.db
      .select({ salesforceAccountUrl: c.salesforceAccountUrl, name: c.accountName })
      .from(c)
      .where(eq(c.id, id))
      .limit(1);
    return row ? hubspotTargetFor(entity, row) : null;
  }
  return null;
}

/**
 * Creates, moves, re-activates or archives the record's HubSpot link so it
 * matches the record. A Deal or Company already linked to another record is
 * left alone (one CRM record syncs with one CriteriaIQ record). Never throws.
 */
export async function ensureHubspotLink(entity: LinkEntity, cqiRecordId: string, userId?: string | null): Promise<void> {
  const links = storage.schema.salesforceRecordLinks;
  try {
    const target = await loadTarget(entity, cqiRecordId);
    const [existing] = await storage.db
      .select()
      .from(links)
      .where(and(eq(links.cqiEntityType, entity), eq(links.cqiRecordId, cqiRecordId)))
      .limit(1);

    if (!target) {
      if (existing && existing.crmProvider === "hubspot" && existing.linkStatus !== "archived") {
        await storage.db
          .update(links)
          .set({ linkStatus: "archived", linkStatusReason: "The record no longer names a HubSpot record", updatedAt: new Date() })
          .where(eq(links.id, existing.id));
      }
      return;
    }

    const sameRecord =
      existing?.crmProvider === "hubspot" && existing.sfObjectType === target.objectType && existing.sfRecordId === target.id;
    if (sameRecord) {
      if (existing.linkStatus === "archived") {
        await storage.db
          .update(links)
          .set({ linkStatus: "active", linkStatusReason: null, sfRecordName: target.name, updatedAt: new Date() })
          .where(eq(links.id, existing.id));
      }
      return;
    }

    const [taken] = await storage.db
      .select({ id: links.id })
      .from(links)
      .where(eq(links.sfRecordId, target.id))
      .limit(1);
    if (taken && taken.id !== existing?.id) {
      console.warn(`[HubSpot Sync] ${target.objectType} ${target.id} is already linked to another record; ${entity} ${cqiRecordId} is not synced`);
      return;
    }

    const fresh = {
      crmProvider: "hubspot",
      sfObjectType: target.objectType,
      sfRecordId: target.id,
      sfRecordName: target.name,
      linkStatus: "active",
      linkStatusReason: null,
      lastInboundSync: null,
      lastOutboundSync: null,
      syncHash: null,
      linkedBy: userId ?? null,
      linkedAt: new Date(),
      updatedAt: new Date(),
    };
    if (existing) {
      await storage.db.update(links).set(fresh).where(eq(links.id, existing.id));
    } else {
      await storage.db.insert(links).values({ cqiEntityType: entity, cqiRecordId, ...fresh });
    }
  } catch (error) {
    console.error(`[HubSpot Sync] Failed to update the link for ${entity} ${cqiRecordId}:`, error);
  }
}
