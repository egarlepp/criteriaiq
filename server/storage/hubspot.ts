// HubSpot owners — mixin for DatabaseStorage.
//
// The local copy of the HubSpot portal's owner list (hubspot_owners,
// migration 089) and how CriteriaIQ users match to it: by email,
// case-insensitive, the same rule HubSpot uses to tie a user to an owner.
// Only active owners match; an archived owner can't own new records.
import { db } from "../db";
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import { hubspotConnection, hubspotOwners, users, type HubspotConnectionRow, type InsertHubspotOwner } from "@shared/schema";
import type { HubspotOwnerMatchSummary } from "@shared/hubspot";
import { EXTERNAL_ROLES } from "../lib/internal-access";

const UNMATCHED_LIST_LIMIT = 50;

const CONNECTION_ROW_ID = 1;

export interface HubspotConnectionWrite {
  /** Already encrypted with encryptText (server/auth/mfaUtils.ts). */
  accessTokenEnc: string;
  portalId: string | null;
  portalName: string | null;
  accountType: string | null;
  uiDomain: string | null;
}

export class HubspotStorageMixin {
  async getHubspotConnectionRow(): Promise<HubspotConnectionRow | null> {
    const [row] = await db.select().from(hubspotConnection).where(eq(hubspotConnection.id, CONNECTION_ROW_ID)).limit(1);
    return row ?? null;
  }

  /** Saves a new key. The last access check belongs to the old key, so it is cleared. */
  async saveHubspotConnectionRow(value: HubspotConnectionWrite, updatedBy: string | null): Promise<void> {
    const set = {
      accessToken: value.accessTokenEnc,
      portalId: value.portalId,
      portalName: value.portalName,
      accountType: value.accountType,
      uiDomain: value.uiDomain,
      lastCheck: null,
      updatedBy,
      updatedAt: new Date(),
    };
    await db
      .insert(hubspotConnection)
      .values({ id: CONNECTION_ROW_ID, ...set })
      .onConflictDoUpdate({ target: hubspotConnection.id, set });
  }

  async saveHubspotConnectionCheck(report: unknown): Promise<void> {
    await db.update(hubspotConnection).set({ lastCheck: report }).where(eq(hubspotConnection.id, CONNECTION_ROW_ID));
  }

  async deleteHubspotConnectionRow(): Promise<void> {
    await db.delete(hubspotConnection).where(eq(hubspotConnection.id, CONNECTION_ROW_ID));
  }

  /**
   * Replaces the local copy with `rows` in one transaction: every row is
   * upserted with `syncedAt`, and anything older (an owner HubSpot no
   * longer returns) is removed. Returns how many were removed.
   */
  async replaceHubspotOwners(rows: InsertHubspotOwner[], syncedAt: Date): Promise<number> {
    return db.transaction(async (tx) => {
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((row) => ({ ...row, lastSyncedAt: syncedAt }));
        await tx
          .insert(hubspotOwners)
          .values(chunk)
          .onConflictDoUpdate({
            target: hubspotOwners.id,
            set: {
              hubspotUserId: sql`excluded.hubspot_user_id`,
              email: sql`excluded.email`,
              firstName: sql`excluded.first_name`,
              lastName: sql`excluded.last_name`,
              archived: sql`excluded.archived`,
              teams: sql`excluded.teams`,
              lastSyncedAt: sql`excluded.last_synced_at`,
            },
          });
      }
      const gone = await tx
        .delete(hubspotOwners)
        .where(lt(hubspotOwners.lastSyncedAt, syncedAt))
        .returning({ id: hubspotOwners.id });
      return gone.length;
    });
  }

  /** Empties the local copy (the key was removed, or now points at another portal). */
  async clearHubspotOwners(): Promise<void> {
    await db.delete(hubspotOwners);
  }

  /** Active owners' emails (lowercase) and raw stored teams, for the team CRM sync. */
  async listHubspotOwnerTeams(): Promise<Array<{ email: string; teams: unknown }>> {
    const rows = await db
      .select({ email: hubspotOwners.email, teams: hubspotOwners.teams })
      .from(hubspotOwners)
      .where(eq(hubspotOwners.archived, false));
    return rows.filter((r): r is { email: string; teams: unknown } => !!r.email).map((r) => ({ email: r.email.toLowerCase(), teams: r.teams }));
  }

  /** The active HubSpot owner id for a CriteriaIQ user, matched by email. */
  async getHubspotOwnerIdForUser(userId: string): Promise<string | null> {
    const [row] = await db
      .select({ id: hubspotOwners.id })
      .from(users)
      .innerJoin(hubspotOwners, sql`lower(${users.email}) = lower(${hubspotOwners.email})`)
      .where(and(eq(users.id, userId), eq(hubspotOwners.archived, false)))
      .orderBy(asc(hubspotOwners.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** The active HubSpot owner matched to a user by email, for Profile Settings › Integrations. */
  async getHubspotOwnerForUser(userId: string): Promise<{ id: string; name: string | null; email: string | null } | null> {
    const [row] = await db
      .select({
        id: hubspotOwners.id,
        firstName: hubspotOwners.firstName,
        lastName: hubspotOwners.lastName,
        email: hubspotOwners.email,
      })
      .from(users)
      .innerJoin(hubspotOwners, sql`lower(${users.email}) = lower(${hubspotOwners.email})`)
      .where(and(eq(users.id, userId), eq(hubspotOwners.archived, false)))
      .orderBy(asc(hubspotOwners.id))
      .limit(1);
    if (!row) return null;
    const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
    return { id: row.id, name: name || null, email: row.email ?? null };
  }

  /**
   * How many active internal users match an active owner, and who doesn't
   * (the first 50 by name). Outside users (Customer, Guest, Partner) are
   * never HubSpot owners, so they aren't counted either way.
   */
  async getHubspotOwnerMatchSummary(): Promise<HubspotOwnerMatchSummary> {
    const [stats] = await db
      .select({
        owners: sql<string>`count(*) FILTER (WHERE ${hubspotOwners.archived} = false)`,
        lastSyncedAt: sql<Date | null>`max(${hubspotOwners.lastSyncedAt})`,
      })
      .from(hubspotOwners);

    const matched = sql<boolean>`EXISTS (
      SELECT 1 FROM ${hubspotOwners}
      WHERE ${hubspotOwners.archived} = false
        AND lower(${hubspotOwners.email}) = lower(${users.email})
    )`;
    const internalActive = and(
      eq(users.isActive, true),
      sql`${users.email} IS NOT NULL`,
      notInArray(sql`coalesce(${users.role}, '')`, [...EXTERNAL_ROLES]),
    );
    const [counts] = await db
      .select({
        matched: sql<string>`count(*) FILTER (WHERE ${matched})`,
      })
      .from(users)
      .where(internalActive);
    const unmatched = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(and(internalActive, sql`NOT ${matched}`))
      .orderBy(asc(users.lastName), asc(users.firstName), asc(users.email))
      .limit(UNMATCHED_LIST_LIMIT);

    const last = stats?.lastSyncedAt ? new Date(stats.lastSyncedAt) : null;
    return {
      owners: Number(stats?.owners ?? 0),
      lastSyncedAt: last && !Number.isNaN(last.getTime()) ? last.toISOString() : null,
      matchedUsers: Number(counts?.matched ?? 0),
      unmatchedUsers: unmatched.map((u) => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || (u.email ?? u.id),
        email: u.email ?? "",
      })),
    };
  }

  /** Active owners by id, for showing a HubSpot record's owner by name. */
  async getHubspotOwnersByIds(ids: string[]): Promise<Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null }>> {
    if (ids.length === 0) return [];
    return db
      .select({ id: hubspotOwners.id, email: hubspotOwners.email, firstName: hubspotOwners.firstName, lastName: hubspotOwners.lastName })
      .from(hubspotOwners)
      .where(inArray(hubspotOwners.id, ids));
  }
}
