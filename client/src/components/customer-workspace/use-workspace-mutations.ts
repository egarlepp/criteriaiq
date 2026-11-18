// Writes behind the customer workspace side panel: marking a customer to-do
// done (or undoing it), project messages and reading them. Each refreshes
// the project's queries (plan, to-dos, messages) and the Account Portal's
// to-do list, messages and unread counts.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { showErrorToast } from "@/lib/toast-helper";
import { getPersonaActive } from "@/contexts/PersonaContext";

export const projectMessagesKey = (projectId: number) => ["/api/projects", projectId, "messages"] as const;

/** Prefix of the Account Portal's cross-project message queries (latest and unread). */
export const ACCOUNT_MESSAGES_KEY = "/api/project-messages";

export interface CustomerActionStatusInput {
  projectId: number;
  taskId: number;
  done: boolean;
  /** On undo: the status the to-do had before it was ticked. */
  previousStatus?: string;
}

const REOPEN_STATUSES = new Set(["not_started", "in_progress", "blocked", "at_risk", "stalled"]);

export function useCustomerActionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, taskId, done, previousStatus }: CustomerActionStatusInput) =>
      apiRequest("POST", `/api/projects/${projectId}/customer-actions/${taskId}/status`, {
        done,
        ...(!done && previousStatus && REOPEN_STATUSES.has(previousStatus) ? { previousStatus } : {}),
      }),
    onSuccess: (_data, { projectId }) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["/api/customer-actions"] });
    },
    onError: () => showErrorToast("workspace.todos.saveFailedTitle", "workspace.todos.saveFailed"),
  });
}

export function usePostProjectMessage(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => apiRequest("POST", `/api/projects/${projectId}/messages`, { body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMessagesKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_MESSAGES_KEY] });
    },
    onError: () => showErrorToast("workspace.messages.sendFailedTitle", "workspace.messages.sendFailed"),
  });
}

export function useDeleteProjectMessage(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: number) => apiRequest("DELETE", `/api/projects/${projectId}/messages/${messageId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMessagesKey(projectId) });
      void queryClient.invalidateQueries({ queryKey: [ACCOUNT_MESSAGES_KEY] });
    },
    onError: () => showErrorToast("workspace.messages.deleteFailedTitle", "workspace.messages.deleteFailed"),
  });
}

/**
 * Marks the project's messages read up to `messageId`; refreshes the unread
 * counts. Silent on failure, and skipped under View As (read only), where
 * apiRequest would warn on every message seen.
 */
export function useMarkProjectMessagesRead(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: number) => {
      if (getPersonaActive()) return null;
      return apiRequest("POST", `/api/projects/${projectId}/messages/read`, { messageId });
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [ACCOUNT_MESSAGES_KEY, "unread"] }),
  });
}
