// Outlook sign-in — mixin for DatabaseStorage.
//
// The one outlook_signin_config row (migration 102) and each person's
// Microsoft tokens in user_integrations (provider "microsoft"). Secrets and
// tokens arrive already encrypted with encryptText; this layer never sees
// the plaintext.
import { db } from "../db";
import { and, count, eq, isNotNull } from "drizzle-orm";
import {
  outlookMapEvents,
  outlookSigninConfig,
  userIntegrations,
  type OutlookMapEventRow,
  type OutlookSigninConfigRow,
} from "@shared/schema";

const CONFIG_ROW_ID = 1;
const MICROSOFT = "microsoft";

export interface OutlookSigninConfigWrite {
  tenantId: string;
  clientId: string;
  /** Already encrypted. Omit to keep the saved secret. */
  clientSecretEnc?: string;
  enabled: boolean;
  /** Omit to keep the saved choice. */
  readWorkingHours?: boolean;
  /** Omit to keep the saved choice. */
  writeMapDueDates?: boolean;
}

export interface OutlookTokenRow {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  accountLabel: string | null;
  connectedAt: Date | null;
}

export interface OutlookTokenWrite {
  /** All three already encrypted. */
  accessTokenEnc: string;
  /** Omit to keep the saved refresh token (Microsoft doesn't always send a new one). */
  refreshTokenEnc?: string;
  expiresAt: Date;
}

export class OutlookStorageMixin {
  async getOutlookSigninConfigRow(): Promise<OutlookSigninConfigRow | null> {
    const [row] = await db.select().from(outlookSigninConfig).where(eq(outlookSigninConfig.id, CONFIG_ROW_ID)).limit(1);
    return row ?? null;
  }

  async saveOutlookSigninConfigRow(value: OutlookSigninConfigWrite, updatedBy: string | null): Promise<void> {
    const existing = await this.getOutlookSigninConfigRow();
    const clientSecret = value.clientSecretEnc ?? existing?.clientSecret;
    if (!clientSecret) throw new Error("A client secret is required");
    const set = {
      tenantId: value.tenantId,
      clientId: value.clientId,
      clientSecret,
      enabled: value.enabled,
      readWorkingHours: value.readWorkingHours ?? existing?.readWorkingHours ?? false,
      writeMapDueDates: value.writeMapDueDates ?? existing?.writeMapDueDates ?? false,
      updatedBy,
      updatedAt: new Date(),
    };
    await db
      .insert(outlookSigninConfig)
      .values({ id: CONFIG_ROW_ID, ...set })
      .onConflictDoUpdate({ target: outlookSigninConfig.id, set });
  }

  async deleteOutlookSigninConfigRow(): Promise<void> {
    await db.delete(outlookSigninConfig).where(eq(outlookSigninConfig.id, CONFIG_ROW_ID));
  }

  async getOutlookTokenRow(userId: string): Promise<OutlookTokenRow | null> {
    const [row] = await db
      .select({
        accessToken: userIntegrations.accessToken,
        refreshToken: userIntegrations.refreshToken,
        expiresAt: userIntegrations.expiresAt,
        accountLabel: userIntegrations.accountLabel,
        connectedAt: userIntegrations.connectedAt,
      })
      .from(userIntegrations)
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, MICROSOFT)))
      .limit(1);
    return row ?? null;
  }

  /** First sign-in or reconnect: replaces the person's tokens and resets "connected since". */
  async saveOutlookTokens(
    userId: string,
    value: OutlookTokenWrite & { refreshTokenEnc: string; accountLabel: string | null },
  ): Promise<void> {
    const now = new Date();
    const set = {
      accessToken: value.accessTokenEnc,
      refreshToken: value.refreshTokenEnc,
      instanceUrl: null,
      expiresAt: value.expiresAt,
      accountLabel: value.accountLabel,
      connectedAt: now,
      updatedAt: now,
    };
    await db
      .insert(userIntegrations)
      .values({ userId, provider: MICROSOFT, ...set })
      .onConflictDoUpdate({ target: [userIntegrations.userId, userIntegrations.provider], set });
  }

  /** A refreshed access token. Keeps "connected since" and, unless one is given, the refresh token. */
  async updateOutlookTokens(userId: string, value: OutlookTokenWrite): Promise<void> {
    await db
      .update(userIntegrations)
      .set({
        accessToken: value.accessTokenEnc,
        ...(value.refreshTokenEnc ? { refreshToken: value.refreshTokenEnc } : {}),
        expiresAt: value.expiresAt,
        updatedAt: new Date(),
      })
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, MICROSOFT)));
  }

  async setOutlookAccountLabel(userId: string, accountLabel: string): Promise<void> {
    await db
      .update(userIntegrations)
      .set({ accountLabel })
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, MICROSOFT)));
  }

  async deleteOutlookTokens(userId: string): Promise<void> {
    await db
      .delete(userIntegrations)
      .where(and(eq(userIntegrations.userId, userId), eq(userIntegrations.provider, MICROSOFT)));
  }

  /** When the admin removes the app: tokens it issued can never be refreshed again. */
  async deleteAllOutlookTokens(): Promise<void> {
    await db.delete(userIntegrations).where(eq(userIntegrations.provider, MICROSOFT));
  }

  /** Everyone with a usable Outlook link, for the daily calendar sync. */
  async listOutlookConnectedUserIds(): Promise<string[]> {
    const rows = await db
      .select({ userId: userIntegrations.userId })
      .from(userIntegrations)
      .where(and(eq(userIntegrations.provider, MICROSOFT), isNotNull(userIntegrations.refreshToken)));
    return rows.map((r) => r.userId);
  }

  async countOutlookConnectedUsers(): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(userIntegrations)
      .where(and(eq(userIntegrations.provider, MICROSOFT), isNotNull(userIntegrations.refreshToken)));
    return Number(row?.n ?? 0);
  }

  // ---- Outlook write-back of MAP due dates (outlook_map_events, migration 111)

  async listOutlookMapEvents(userId: string): Promise<OutlookMapEventRow[]> {
    return db.select().from(outlookMapEvents).where(eq(outlookMapEvents.userId, userId));
  }

  /** People CriteriaIQ has put due-date events in the Outlook of. */
  async listOutlookMapEventUserIds(): Promise<string[]> {
    const rows = await db.selectDistinct({ userId: outlookMapEvents.userId }).from(outlookMapEvents);
    return rows.map((r) => r.userId);
  }

  /** People with a due-date event for an item of this project (after a MAP delete). */
  async listOutlookMapEventUserIdsForProject(projectId: number): Promise<string[]> {
    const rows = await db
      .selectDistinct({ userId: outlookMapEvents.userId })
      .from(outlookMapEvents)
      .where(eq(outlookMapEvents.projectId, projectId));
    return rows.map((r) => r.userId);
  }

  async saveOutlookMapEvent(value: Omit<OutlookMapEventRow, "id" | "syncedAt">): Promise<void> {
    const syncedAt = new Date();
    await db
      .insert(outlookMapEvents)
      .values({ ...value, syncedAt })
      .onConflictDoUpdate({
        target: [outlookMapEvents.userId, outlookMapEvents.itemType, outlookMapEvents.itemId],
        set: {
          projectId: value.projectId,
          graphEventId: value.graphEventId,
          dueDate: value.dueDate,
          subject: value.subject,
          syncedAt,
        },
      });
  }

  async deleteOutlookMapEvent(id: number): Promise<void> {
    await db.delete(outlookMapEvents).where(eq(outlookMapEvents.id, id));
  }

  /** Forgets the events (they stay in Outlook): one person's, or everyone's. */
  async deleteOutlookMapEventRows(userId?: string): Promise<void> {
    await db.delete(outlookMapEvents).where(userId ? eq(outlookMapEvents.userId, userId) : undefined);
  }
}
