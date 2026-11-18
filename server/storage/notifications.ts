// Personal in-app notifications — mixin for DatabaseStorage.
//
// Backs the header bell (GET /api/notifications) and the daily
// notification digest. Rows are written by server/services/notifications.ts
// from the app's automation events; nothing here decides who is notified.
import { db } from "../db";
import { isCurrentRequestDemo } from "../lib/demo-mode";
import { applyDemoFilterByProject } from "../lib/demo-storage";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { userEmailPreferences, userNotifications, users } from "@shared/schema";
import type { InsertUserNotification, UserNotification } from "@shared/schema";

export type NotificationDigestSetting = "off" | "daily";

export interface DigestRecipient {
  userId: string;
  email: string;
  firstName: string | null;
}

export class NotificationsStorageMixin {
  async createUserNotifications(rows: InsertUserNotification[]): Promise<number> {
    // Demo Mode: the people notified are real, the project isn't. Nothing
    // reaches anyone's bell (or digest) from a demo request.
    if (rows.length === 0 || isCurrentRequestDemo()) return 0;
    const inserted = await db.insert(userNotifications).values(rows).returning({ id: userNotifications.id });
    return inserted.length;
  }

  /** Who already got a given kind of notification since a date, with its params (for de-duplicating reminders). */
  async listNotificationsOfKindSince(
    kind: string,
    since: Date,
  ): Promise<Array<{ userId: string; params: Record<string, string | null> }>> {
    return await db
      .select({ userId: userNotifications.userId, params: userNotifications.params })
      .from(userNotifications)
      .where(and(eq(userNotifications.kind, kind), gte(userNotifications.createdAt, since)));
  }

  async listUserNotifications(userId: string, limit = 30): Promise<UserNotification[]> {
    return await db
      .select()
      .from(userNotifications)
      // Demo Mode: the bell shows notifications about projects of the current mode.
      .where(and(eq(userNotifications.userId, userId), applyDemoFilterByProject(userNotifications.projectId)))
      .orderBy(desc(userNotifications.createdAt), desc(userNotifications.id))
      .limit(limit);
  }

  async countUnreadUserNotifications(userId: string): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
          applyDemoFilterByProject(userNotifications.projectId),
        ),
      );
    return Number(row?.n ?? 0);
  }

  /** Marks one of the user's own notifications read. False when it isn't theirs. */
  async markUserNotificationRead(userId: string, id: number): Promise<boolean> {
    const rows = await db
      .update(userNotifications)
      .set({ readAt: new Date() })
      .where(and(eq(userNotifications.id, id), eq(userNotifications.userId, userId)))
      .returning({ id: userNotifications.id });
    return rows.length > 0;
  }

  async markAllUserNotificationsRead(userId: string): Promise<number> {
    const rows = await db
      .update(userNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
          applyDemoFilterByProject(userNotifications.projectId),
        ),
      )
      .returning({ id: userNotifications.id });
    return rows.length;
  }

  async getNotificationDigestSetting(userId: string): Promise<NotificationDigestSetting> {
    const [row] = await db
      .select({ digest: userEmailPreferences.notificationDigest })
      .from(userEmailPreferences)
      .where(eq(userEmailPreferences.userId, userId))
      .limit(1);
    return row?.digest === "daily" ? "daily" : "off";
  }

  async setNotificationDigestSetting(userId: string, digest: NotificationDigestSetting): Promise<void> {
    await db
      .insert(userEmailPreferences)
      .values({ userId, notificationDigest: digest })
      .onConflictDoUpdate({
        target: userEmailPreferences.userId,
        set: { notificationDigest: digest, updatedAt: new Date() },
      });
  }

  /** Active, approved people with the daily digest on and an email address. */
  async listNotificationDigestRecipients(): Promise<DigestRecipient[]> {
    const rows = await db
      .select({ userId: users.id, email: users.email, firstName: users.firstName })
      .from(userEmailPreferences)
      .innerJoin(users, eq(users.id, userEmailPreferences.userId))
      .where(
        and(
          eq(userEmailPreferences.notificationDigest, "daily"),
          eq(users.isActive, true),
          eq(users.isApproved, true),
        ),
      );
    return rows.filter((r): r is DigestRecipient => !!r.email);
  }

  /** Unread notifications the digest hasn't sent yet, oldest first. */
  async listUndigestedNotifications(userId: string, limit = 50): Promise<UserNotification[]> {
    return await db
      .select()
      .from(userNotifications)
      .where(
        and(
          eq(userNotifications.userId, userId),
          isNull(userNotifications.readAt),
          isNull(userNotifications.emailedAt),
          // The digest runs as a job (never in demo), so demo notifications stay out of it.
          applyDemoFilterByProject(userNotifications.projectId),
        ),
      )
      .orderBy(userNotifications.createdAt, userNotifications.id)
      .limit(limit);
  }

  async markUserNotificationsEmailed(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.update(userNotifications).set({ emailedAt: new Date() }).where(inArray(userNotifications.id, ids));
  }

  async pruneUserNotifications(before: Date): Promise<number> {
    const rows = await db
      .delete(userNotifications)
      .where(lt(userNotifications.createdAt, before))
      .returning({ id: userNotifications.id });
    return rows.length;
  }
}
