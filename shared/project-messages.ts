// Project messages: a short conversation on the project page between the
// customer and the project team (customer workspace side panel). Plain text
// only; the page renders it as text, never as HTML.
import { z } from "zod";

/** Longest message, in characters. */
export const PROJECT_MESSAGE_MAX_LENGTH = 4000;

/** Most recent messages one request returns. */
export const PROJECT_MESSAGES_LIMIT = 200;

export const projectMessageInputSchema = z.object({
  body: z.string().trim().min(1).max(PROJECT_MESSAGE_MAX_LENGTH),
});

export type ProjectMessageInput = z.infer<typeof projectMessageInputSchema>;

/** A message as GET /api/projects/:projectId/messages returns it. */
export interface ProjectMessageView {
  id: number;
  projectId: number;
  /** Empty once deleted. */
  body: string;
  authorId: string | null;
  authorName: string | null;
  /** Customer, Partner or Guest: drawn on the customer side. */
  authorIsExternal: boolean;
  createdAt: string;
  deletedAt: string | null;
  /** The viewer wrote it (or is an Admin) and may delete it. */
  canDelete: boolean;
}

/** Most projects one cross-project request (Account Portal) may name. */
export const PROJECT_MESSAGES_MAX_PROJECTS = 100;

/** Latest messages the Account Portal shows across all its projects. */
export const PROJECT_MESSAGES_RECENT_LIMIT = 30;

export const projectMessageReadSchema = z.object({
  messageId: z.number().int().positive(),
});

/**
 * A project's message counts for the signed-in user, as
 * GET /api/project-messages/unread returns them. Unread: messages by
 * someone else after the newest one the user has seen (deleted ones left out).
 */
export interface ProjectMessageUnread {
  projectId: number;
  unread: number;
  /** ISO time of the project's newest message. */
  lastMessageAt: string | null;
}
