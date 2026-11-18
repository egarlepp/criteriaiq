// Project messages — mixin for DatabaseStorage.
//
// The customer workspace conversation on a project (project_messages,
// migration 127) and how far each user has read it (project_message_reads,
// migration 130). Routes check project access before calling these; this
// layer only reads and writes rows.
import { db } from "../db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { projectMessageReads, projectMessages, users } from "@shared/schema";
import type { ProjectMessage } from "@shared/schema";

export interface ProjectMessageRow extends ProjectMessage {
  authorFirstName: string | null;
  authorLastName: string | null;
  authorRole: string | null;
}

export interface ProjectMessageCounts {
  projectId: number;
  unread: number;
  lastMessageAt: Date | null;
}

const messageColumns = {
  id: projectMessages.id,
  projectId: projectMessages.projectId,
  authorUserId: projectMessages.authorUserId,
  body: projectMessages.body,
  createdAt: projectMessages.createdAt,
  deletedAt: projectMessages.deletedAt,
  authorFirstName: users.firstName,
  authorLastName: users.lastName,
  authorRole: users.role,
};

export class ProjectMessagesStorageMixin {
  /** The newest `limit` messages of a project, oldest first, with author names. */
  async listProjectMessages(projectId: number, limit: number): Promise<ProjectMessageRow[]> {
    const rows = await db
      .select(messageColumns)
      .from(projectMessages)
      .leftJoin(users, eq(users.id, projectMessages.authorUserId))
      .where(eq(projectMessages.projectId, projectId))
      .orderBy(desc(projectMessages.createdAt), desc(projectMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  /**
   * The newest `limit` messages across several projects (deleted ones left
   * out), oldest first. The Account Portal's "All" view.
   */
  async listRecentProjectMessages(projectIds: number[], limit: number): Promise<ProjectMessageRow[]> {
    if (projectIds.length === 0) return [];
    const rows = await db
      .select(messageColumns)
      .from(projectMessages)
      .leftJoin(users, eq(users.id, projectMessages.authorUserId))
      .where(and(inArray(projectMessages.projectId, projectIds), isNull(projectMessages.deletedAt)))
      .orderBy(desc(projectMessages.createdAt), desc(projectMessages.id))
      .limit(limit);
    return rows.reverse();
  }

  /**
   * Per project with messages: how many the user has not read (written by
   * someone else after the newest one they have seen, deleted ones left
   * out) and when the newest was posted.
   */
  async getProjectMessageCounts(projectIds: number[], userId: string): Promise<ProjectMessageCounts[]> {
    if (projectIds.length === 0) return [];
    const rows = await db
      .select({
        projectId: projectMessages.projectId,
        unread: sql<number>`count(*) filter (where ${projectMessages.id} > coalesce(${projectMessageReads.lastReadMessageId}, 0)
          and ${projectMessages.deletedAt} is null
          and ${projectMessages.authorUserId} is distinct from ${userId})::int`,
        lastMessageAt: sql<Date | null>`max(${projectMessages.createdAt})`,
      })
      .from(projectMessages)
      .leftJoin(
        projectMessageReads,
        and(eq(projectMessageReads.projectId, projectMessages.projectId), eq(projectMessageReads.userId, userId)),
      )
      .where(inArray(projectMessages.projectId, projectIds))
      .groupBy(projectMessages.projectId);
    return rows.map((row) => ({
      projectId: row.projectId,
      unread: Number(row.unread) || 0,
      lastMessageAt: row.lastMessageAt ? new Date(row.lastMessageAt) : null,
    }));
  }

  /** Records that the user has read the project's messages up to `messageId`; never moves back. */
  async markProjectMessagesRead(userId: string, projectId: number, messageId: number): Promise<void> {
    await db
      .insert(projectMessageReads)
      .values({ userId, projectId, lastReadMessageId: messageId })
      .onConflictDoUpdate({
        target: [projectMessageReads.userId, projectMessageReads.projectId],
        set: {
          lastReadMessageId: sql`greatest(${projectMessageReads.lastReadMessageId}, excluded.last_read_message_id)`,
          readAt: new Date(),
        },
      });
  }

  async createProjectMessage(projectId: number, authorUserId: string, body: string): Promise<ProjectMessage> {
    const [row] = await db.insert(projectMessages).values({ projectId, authorUserId, body }).returning();
    return row;
  }

  async getProjectMessage(id: number): Promise<ProjectMessage | undefined> {
    const [row] = await db.select().from(projectMessages).where(eq(projectMessages.id, id)).limit(1);
    return row;
  }

  /** Clears the body and marks the message deleted. False when already deleted or missing. */
  async deleteProjectMessage(id: number): Promise<boolean> {
    const updated = await db
      .update(projectMessages)
      .set({ body: "", deletedAt: new Date() })
      .where(and(eq(projectMessages.id, id), isNull(projectMessages.deletedAt)))
      .returning({ id: projectMessages.id });
    return updated.length > 0;
  }
}
