import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { showErrorToast } from '@/lib/toast-helper';

export interface UserAnnouncement {
  id: number;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  startDate: string;
  endDate: string | null;
  showInHeader: boolean;
  showInFooter: boolean;
  celebrationEffect: string | null;
  celebrationConfig: Record<string, any> | null;
  celebrationOnClick?: 'first' | 'every';
  celebrationOnLogin?: 'first' | 'every';
  createdAt: string;
  isRead: boolean;
}

export function useAnnouncements(enabled: boolean = true) {
  const queryClient = useQueryClient();

  const { data: announcements = [], isLoading, error } = useQuery({
    queryKey: ['/api/announcements/active'],
    queryFn: async () => {
      return await apiRequest('GET', '/api/announcements/active') as UserAnnouncement[];
    },
    enabled,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (announcementId: number) => {
      return await apiRequest('POST', `/api/announcements/${announcementId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/announcements/active'] });
    },
    onError: (error: any) => {
      console.error('Failed to mark announcement as read:', error);
      showErrorToast(
        'Sync Error',
        'Could not mark announcement as read. Please try again.',
      );
    },
  });

  const headerAnnouncements = announcements.filter(a => a.showInHeader);
  const footerAnnouncements = announcements.filter(a => a.showInFooter);
  const unreadCount = announcements.filter(a => !a.isRead).length;
  const unreadHeaderCount = headerAnnouncements.filter(a => !a.isRead).length;

  return {
    announcements,
    headerAnnouncements,
    footerAnnouncements,
    unreadCount,
    unreadHeaderCount,
    isLoading,
    error,
    markAsRead: (id: number) => markAsReadMutation.mutate(id),
    isMarkingAsRead: markAsReadMutation.isPending,
    markAsReadError: markAsReadMutation.error,
  };
}
