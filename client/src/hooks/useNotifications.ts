import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export type NotificationKind =
  | 'project_assigned'
  | 'map_item_assigned'
  | 'map_item_team_assigned'
  | 'map_item_due_soon'
  | 'project_status_changed'
  | 'criterion_completed'
  | 'project_message_posted'
  | 'customer_action_completed'
  | 'criteria_agreement_requested'
  | 'criteria_agreed';

export interface UserNotification {
  id: number;
  kind: NotificationKind | string;
  projectId: number | null;
  params: Record<string, string | null>;
  linkPath: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: UserNotification[];
  unreadCount: number;
}

export const NOTIFICATIONS_QUERY_KEY = ['/api/notifications'] as const;

/** The signed-in user's own notifications, polled every minute. */
export function useNotifications(enabled = true) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => (await apiRequest('GET', '/api/notifications')) as NotificationsResponse,
    enabled,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

  const markRead = useMutation({
    mutationFn: async (id: number) => apiRequest('POST', `/api/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/notifications/read-all'),
    onSuccess: invalidate,
  });

  return {
    notifications: data?.items ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    markRead: markRead.mutate,
    markAllRead: markAllRead.mutate,
    isMarkingAll: markAllRead.isPending,
  };
}
