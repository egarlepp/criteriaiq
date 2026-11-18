// Resource Content — mixin for DatabaseStorage.
//
// The links on the Account Portal's "Learning & Documentation" and
// "Support & Community" cards (portal_resources, migration 131). Routes
// (server/routes/portal-resources-routes.ts) check permissions and validate
// input with the schemas in shared/portal-resources.ts before calling these;
// this layer keeps each card's positions dense (0..n-1, at most
// PORTAL_CARD_LIMIT) and refuses ids from another card or mode.
//
// Demo isolation: Demo Mode sees demo rows plus System rows; real mode sees
// real rows (System rows are never demo).
import { db } from "../db";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { portalResources, users } from "@shared/schema";
import type { PortalResource } from "@shared/schema";
import {
  PORTAL_CARD_LIMIT,
  type PortalResourceCard,
  type PortalResourceCreate,
  type PortalResourceUpdate,
  type PortalResourceView,
} from "@shared/portal-resources";
import { applyDemoFilterPreserveSystem, applyDemoFlag } from "../lib/demo-storage";
import { SYSTEM_PORTAL_RESOURCES } from "../seed/system-portal-resources";

/** Why a Resource Content write was refused; routes map it to a 4xx with `code`. */
export class PortalResourceError extends Error {
  constructor(
    readonly code: "not_found" | "wrong_card" | "card_full",
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "PortalResourceError";
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function toView(row: PortalResource, ownerName: string | null): PortalResourceView {
  return {
    id: row.id,
    card: row.card as PortalResourceCard,
    title: row.title,
    description: row.description,
    icon: row.icon,
    iconColor: row.iconColor,
    linkType: row.linkType as PortalResourceView["linkType"],
    url: row.url,
    isSystem: row.isSystem,
    portalPosition: row.portalPosition,
    ownerId: row.ownerId,
    ownerName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const ownerNameSql = sql<string | null>`nullif(trim(concat_ws(' ', ${users.firstName}, ${users.lastName})), '')`;

/** Renumbers a card's shown resources 0..n-1, keeping their order. */
async function compactCard(tx: Tx, card: string): Promise<void> {
  const shown = await tx
    .select({ id: portalResources.id })
    .from(portalResources)
    .where(and(eq(portalResources.card, card), isNotNull(portalResources.portalPosition), applyDemoFilterPreserveSystem(portalResources)))
    .orderBy(asc(portalResources.portalPosition), asc(portalResources.id));
  for (const [index, row] of shown.entries()) {
    await tx.update(portalResources).set({ portalPosition: index }).where(eq(portalResources.id, row.id));
  }
}

export class PortalResourcesStorageMixin {
  /** Every resource in the current mode, for the Resource Content page. */
  async listPortalResources(): Promise<PortalResourceView[]> {
    const rows = await db
      .select({ row: portalResources, ownerName: ownerNameSql })
      .from(portalResources)
      .leftJoin(users, eq(users.id, portalResources.ownerId))
      .where(applyDemoFilterPreserveSystem(portalResources))
      .orderBy(asc(portalResources.card), asc(portalResources.title));
    return rows.map((r) => toView(r.row, r.ownerName));
  }

  async getPortalResource(id: number): Promise<PortalResourceView | undefined> {
    const [found] = await db
      .select({ row: portalResources, ownerName: ownerNameSql })
      .from(portalResources)
      .leftJoin(users, eq(users.id, portalResources.ownerId))
      .where(and(eq(portalResources.id, id), applyDemoFilterPreserveSystem(portalResources)))
      .limit(1);
    return found ? toView(found.row, found.ownerName) : undefined;
  }

  /** What each portal card shows, in order (at most PORTAL_CARD_LIMIT each). */
  async getPortalResourceCards(): Promise<Record<PortalResourceCard, PortalResourceView[]>> {
    const rows = await db
      .select({ row: portalResources, ownerName: ownerNameSql })
      .from(portalResources)
      .leftJoin(users, eq(users.id, portalResources.ownerId))
      .where(and(isNotNull(portalResources.portalPosition), applyDemoFilterPreserveSystem(portalResources)))
      .orderBy(asc(portalResources.portalPosition), asc(portalResources.id));
    const cards: Record<PortalResourceCard, PortalResourceView[]> = { learning: [], support: [] };
    for (const r of rows) {
      const card = r.row.card as PortalResourceCard;
      if (cards[card] && cards[card].length < PORTAL_CARD_LIMIT) cards[card].push(toView(r.row, r.ownerName));
    }
    return cards;
  }

  /** A new resource starts off its card; the card editor or the page adds it. */
  async createPortalResource(input: PortalResourceCreate, ownerId: string): Promise<PortalResourceView> {
    const [row] = await db
      .insert(portalResources)
      .values(applyDemoFlag({ ...input, ownerId, isSystem: false, portalPosition: null }))
      .returning();
    return (await this.getPortalResource(row.id)) ?? toView(row, null);
  }

  /** Moving a resource to the other card takes it off the card it was on. */
  async updatePortalResource(id: number, patch: PortalResourceUpdate): Promise<PortalResourceView> {
    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(portalResources)
        .where(and(eq(portalResources.id, id), applyDemoFilterPreserveSystem(portalResources)))
        .limit(1);
      if (!current) throw new PortalResourceError("not_found", 404, "Resource not found");
      const movesCard = patch.card !== undefined && patch.card !== current.card;
      await tx
        .update(portalResources)
        .set({ ...patch, ...(movesCard ? { portalPosition: null } : {}), updatedAt: new Date() })
        .where(eq(portalResources.id, id));
      if (movesCard && current.portalPosition !== null) await compactCard(tx, current.card);
    });
    const updated = await this.getPortalResource(id);
    if (!updated) throw new PortalResourceError("not_found", 404, "Resource not found");
    return updated;
  }

  async deletePortalResource(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      const [removed] = await tx
        .delete(portalResources)
        .where(and(eq(portalResources.id, id), applyDemoFilterPreserveSystem(portalResources)))
        .returning();
      if (!removed) throw new PortalResourceError("not_found", 404, "Resource not found");
      if (removed.portalPosition !== null) await compactCard(tx, removed.card);
    });
  }

  /** Sets what a card shows, in this order; every other resource of the card comes off it. */
  async setPortalResourceCard(card: PortalResourceCard, ids: number[]): Promise<Record<PortalResourceCard, PortalResourceView[]>> {
    if (ids.length > PORTAL_CARD_LIMIT) throw new PortalResourceError("card_full", 409, `A card shows at most ${PORTAL_CARD_LIMIT} resources`);
    await db.transaction(async (tx) => {
      if (ids.length > 0) {
        const found = await tx
          .select({ id: portalResources.id, card: portalResources.card })
          .from(portalResources)
          .where(and(inArray(portalResources.id, ids), applyDemoFilterPreserveSystem(portalResources)));
        if (found.length !== ids.length) throw new PortalResourceError("not_found", 404, "Resource not found");
        if (found.some((r) => r.card !== card)) throw new PortalResourceError("wrong_card", 409, "Resource belongs to another card");
      }
      await tx
        .update(portalResources)
        .set({ portalPosition: null })
        .where(and(eq(portalResources.card, card), applyDemoFilterPreserveSystem(portalResources)));
      for (const [index, id] of ids.entries()) {
        await tx.update(portalResources).set({ portalPosition: index }).where(eq(portalResources.id, id));
      }
    });
    return this.getPortalResourceCards();
  }

  /**
   * Adds any missing System resource (by system_key). Existing rows keep an
   * Admin's edits and card choices. A missing row starts on its card only
   * while the card has room.
   */
  async seedSystemPortalResources(): Promise<number> {
    const existing = await db
      .select({ systemKey: portalResources.systemKey })
      .from(portalResources)
      .where(eq(portalResources.isSystem, true));
    const have = new Set(existing.map((r) => r.systemKey));
    const missing = SYSTEM_PORTAL_RESOURCES.filter((seed) => !have.has(seed.systemKey));
    if (missing.length === 0) return 0;

    const shown = await db
      .select({ card: portalResources.card, count: sql<number>`cast(count(*) as int)` })
      .from(portalResources)
      .where(and(isNotNull(portalResources.portalPosition), eq(portalResources.isDemo, false)))
      .groupBy(portalResources.card);
    const next = new Map(shown.map((r) => [r.card, r.count]));

    const values = missing.map((seed) => {
      const position = next.get(seed.card) ?? 0;
      const fits = position < PORTAL_CARD_LIMIT;
      if (fits) next.set(seed.card, position + 1);
      return { ...seed, isSystem: true, ownerId: null, portalPosition: fits ? position : null };
    });
    const inserted = await db.insert(portalResources).values(values).onConflictDoNothing().returning({ id: portalResources.id });
    return inserted.length;
  }
}
