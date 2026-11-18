import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ChevronRight,
  Info,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessagesSquare,
  RefreshCw,
  UserCheck,
  UserPlus,
  BrainCircuit,
  CalendarClock,
  XCircle,
  ShieldAlert,
  Handshake,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAnnouncements, type UserAnnouncement } from '@/hooks/useAnnouncements';
import { useNotifications, type UserNotification } from '@/hooks/useNotifications';
import { AnnouncementDetailDialog } from '@/components/announcements/AnnouncementDetailDialog';
import { cn } from '@/lib/utils';

interface NotificationBellProps {
  /** Signed in at all: personal notifications are for every role. */
  enabled: boolean;
  /** Announcements are internal-only. */
  announcementsEnabled: boolean;
}

type BellTab = 'mine' | 'announcements';

const severityConfig = {
  info: { icon: Info, color: 'text-blue-500 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 dark:text-amber-400', bgColor: 'bg-amber-50 dark:bg-amber-900/20' },
  critical: { icon: XCircle, color: 'text-red-500 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20' },
} as const;

const kindIcons: Record<string, { icon: LucideIcon; className: string }> = {
  project_assigned: { icon: UserPlus, className: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300' },
  map_item_assigned: { icon: ListChecks, className: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
  map_item_team_assigned: { icon: ListChecks, className: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-300' },
  map_item_due_soon: { icon: CalendarClock, className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  project_status_changed: { icon: RefreshCw, className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  criterion_completed: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  support_request_status_changed: { icon: LifeBuoy, className: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
  support_request_assigned: { icon: UserCheck, className: 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300' },
  evaluation_request_submitted: { icon: ClipboardList, className: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300' },
  account_link_exception_requested: { icon: ShieldAlert, className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  evaluation_request_status_changed: { icon: ClipboardCheck, className: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-300' },
  outcome_requested: { icon: BrainCircuit, className: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' },
  outcome_reminder: { icon: BrainCircuit, className: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300' },
  outcome_overdue: { icon: BrainCircuit, className: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' },
  criteria_agreement_requested: { icon: Handshake, className: 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' },
  criteria_agreed: { icon: Handshake, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
  project_message_posted: { icon: MessagesSquare, className: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
  customer_action_completed: { icon: ListChecks, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300' },
};

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 86_400],
  ['month', 30 * 86_400],
  ['week', 7 * 86_400],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "Tue, Nov 3" for a "YYYY-MM-DD" due date, read in UTC so it never shifts a day. */
function dueDateLabel(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function relativeTime(iso: string, locale: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return format.format(0, 'minute');
}

export function NotificationBell({ enabled, announcementsEnabled }: NotificationBellProps) {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<BellTab>('mine');
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<UserAnnouncement | null>(null);

  const { notifications, unreadCount, isLoading, markRead, markAllRead, isMarkingAll } = useNotifications(enabled);
  const {
    headerAnnouncements,
    unreadHeaderCount,
    markAsRead: markAnnouncementRead,
    isLoading: announcementsLoading,
  } = useAnnouncements(enabled && announcementsEnabled);

  const announcementUnread = announcementsEnabled ? unreadHeaderCount : 0;
  const totalUnread = unreadCount + announcementUnread;
  const activeTab: BellTab = announcementsEnabled ? tab : 'mine';

  const sortedAnnouncements = useMemo(() => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return [...headerAnnouncements].sort((a, b) => {
      if (a.isRead !== b.isRead) return a.isRead ? 1 : -1;
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [headerAnnouncements]);

  if (!enabled) return null;

  const describe = (n: UserNotification): string => {
    const p = n.params ?? {};
    const project = p.projectName || t('notifications.unnamedProject');
    switch (n.kind) {
      case 'project_assigned':
        return t('notifications.kinds.projectAssigned', { project });
      case 'map_item_assigned':
        return t('notifications.kinds.mapItemAssigned', {
          project,
          item: p.itemName || t('notifications.unnamedItem'),
          type: t(`notifications.itemTypes.${p.itemType === 'phase' || p.itemType === 'step' ? p.itemType : 'task'}`),
        });
      case 'map_item_team_assigned':
        return t('notifications.kinds.mapItemTeamAssigned', {
          project,
          team: p.teamName || t('notifications.unnamedTeam'),
          item: p.itemName || t('notifications.unnamedItem'),
          type: t(`notifications.itemTypes.${p.itemType === 'phase' || p.itemType === 'step' ? p.itemType : 'task'}`),
        });
      case 'map_item_due_soon': {
        const vars = {
          project,
          item: p.itemName || t('notifications.unnamedItem'),
          type: t(`notifications.itemTypes.${p.itemType === 'phase' || p.itemType === 'step' ? p.itemType : 'task'}`),
        };
        return p.daysRemaining === '0' || !p.dueDate
          ? t('notifications.kinds.mapItemDueToday', vars)
          : t('notifications.kinds.mapItemDueSoon', { ...vars, date: dueDateLabel(p.dueDate, i18n.language) });
      }
      case 'project_status_changed':
        return p.oldStatus
          ? t('notifications.kinds.statusChanged', { project, from: p.oldStatus, to: p.newStatus || t('common.notSet') })
          : t('notifications.kinds.statusSet', { project, to: p.newStatus || t('common.notSet') });
      case 'criterion_completed':
        return t('notifications.kinds.criterionCompleted', {
          project,
          criterion: p.criterionName || t('notifications.unnamedCriterion'),
        });
      case 'support_request_status_changed':
        return t('notifications.kinds.supportStatusChanged', {
          request: p.requestTitle || t('notifications.unnamedItem'),
          from: p.oldStatus || t('common.notSet'),
          to: p.newStatus || t('common.notSet'),
        });
      case 'support_request_assigned':
        return t('notifications.kinds.supportAssigned', { request: p.requestTitle || t('notifications.unnamedItem') });
      case 'evaluation_request_submitted':
        return t('notifications.kinds.evaluationSubmitted', {
          account: p.accountName || t('notifications.unnamedAccount'),
          requester: p.requesterName || t('notifications.someone'),
        });
      case 'account_link_exception_requested':
        return t('notifications.kinds.linkExceptionRequested', {
          account: p.accountName || t('notifications.unnamedAccount'),
          requester: p.requesterName || t('notifications.someone'),
          reason: p.reason || '',
        });
      case 'evaluation_request_status_changed':
        return t(p.newStatus === 'closed' ? 'notifications.kinds.evaluationClosed' : 'notifications.kinds.evaluationReopened', {
          account: p.accountName || t('notifications.unnamedAccount'),
        });
      case 'outcome_requested':
        return t(`notifications.kinds.outcomeRequested.${p.outcomeType === 'lost' || p.outcomeType === 'cancelled' ? p.outcomeType : 'won'}`, { project });
      case 'outcome_reminder':
        return t('notifications.kinds.outcomeReminder', { project });
      case 'outcome_overdue':
        return t('notifications.kinds.outcomeOverdue', { project });
      case 'project_message_posted':
        return t('notifications.kinds.messagePosted', {
          project,
          author: p.authorName || t('notifications.someone'),
          excerpt: p.excerpt || '',
        });
      case 'criteria_agreement_requested':
        return t('notifications.kinds.criteriaAgreementRequested', { project, person: p.actorName || t('notifications.someone') });
      case 'criteria_agreed':
        return t('notifications.kinds.criteriaAgreed', { project, person: p.actorName || t('notifications.someone') });
      case 'customer_action_completed':
        return t('notifications.kinds.customerActionCompleted', {
          project,
          person: p.actorName || t('notifications.someone'),
          item: p.itemName || t('notifications.unnamedItem'),
        });
      default:
        return t('notifications.kinds.generic', { project });
    }
  };

  const openNotification = (n: UserNotification) => {
    if (!n.readAt) markRead(n.id);
    setIsOpen(false);
    if (n.linkPath) navigate(n.linkPath);
  };

  const openAnnouncement = (announcement: UserAnnouncement) => {
    if (!announcement.isRead) markAnnouncementRead(announcement.id);
    setSelectedAnnouncement(announcement);
    setIsOpen(false);
  };

  const tabButton = (value: BellTab, label: string, count: number, Icon: LucideIcon) => (
    <button
      type="button"
      onClick={() => setTab(value)}
      aria-pressed={activeTab === value}
      className={cn(
        'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        activeTab === value
          ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
          : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && (
        <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );

  const emptyState = (text: string, pulse = false) => (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      <Bell className={cn('mx-auto mb-2 h-10 w-10 opacity-30', pulse && 'animate-pulse')} />
      <p className="text-sm">{text}</p>
    </div>
  );

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            className="brand-topbar-icon-btn relative rounded-md border-0 bg-transparent p-2 transition-all duration-200"
            title={t('notifications.title')}
            aria-label={t('notifications.title')}
            data-testid="notification-bell"
          >
            {totalUnread > 0 ? (
              <BellRing className={cn('h-5 w-5 fill-none stroke-current stroke-2', !isOpen && 'animate-bell-ring')} />
            ) : (
              <Bell className="h-5 w-5 fill-none stroke-current stroke-2" />
            )}
            {totalUnread > 0 && (
              <span
                className={cn(
                  'brand-topbar-badge-ring absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 bg-red-500 text-[10px] font-bold text-white',
                  !isOpen && 'animate-pulse',
                )}
              >
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-96 p-0" align="end" sideOffset={5}>
          <div className="space-y-3 border-b p-4 dark:border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                <BellRing className="h-5 w-5" />
                {t('notifications.title')}
              </h4>
              {activeTab === 'mine' && unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => markAllRead()}
                  disabled={isMarkingAll}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t('notifications.markAllRead')}
                </Button>
              )}
            </div>
            {announcementsEnabled && (
              <div className="flex gap-1 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                {tabButton('mine', t('notifications.tabs.mine'), unreadCount, Bell)}
                {tabButton('announcements', t('notifications.tabs.announcements'), announcementUnread, Megaphone)}
              </div>
            )}
          </div>

          {activeTab === 'mine' ? (
            isLoading ? (
              emptyState(t('notifications.loading'), true)
            ) : notifications.length === 0 ? (
              emptyState(t('notifications.empty'))
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="divide-y dark:divide-gray-800">
                  {notifications.map((n) => {
                    const kind = kindIcons[n.kind] ?? { icon: Info, className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
                    const Icon = kind.icon;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => openNotification(n)}
                        className={cn(
                          'w-full p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                          !n.readAt && 'bg-blue-50/50 dark:bg-blue-900/10',
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn('rounded-lg p-2', kind.className)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-sm text-gray-800 dark:text-gray-200', !n.readAt && 'font-semibold')}>
                              {describe(n)}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {relativeTime(n.createdAt, i18n.language)}
                            </p>
                          </div>
                          {n.linkPath && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )
          ) : announcementsLoading ? (
            emptyState(t('notifications.loading'), true)
          ) : sortedAnnouncements.length === 0 ? (
            emptyState(t('notifications.noAnnouncements'))
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y dark:divide-gray-800">
                {sortedAnnouncements.map((announcement) => {
                  const config = severityConfig[announcement.severity];
                  const Icon = config.icon;
                  return (
                    <button
                      key={announcement.id}
                      type="button"
                      onClick={() => openAnnouncement(announcement)}
                      className={cn(
                        'w-full p-4 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50',
                        !announcement.isRead && 'bg-blue-50/50 dark:bg-blue-900/10',
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn('rounded-lg p-2', config.bgColor)}>
                          <Icon className={cn('h-4 w-4', config.color)} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h5 className={cn('truncate text-sm font-medium', !announcement.isRead && 'font-semibold')}>
                              {announcement.title}
                            </h5>
                            {!announcement.isRead && (
                              <Badge variant="default" className="h-5 gap-1 text-[10px]">
                                <Info className="h-3 w-3" />
                                {t('notifications.new')}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                            {relativeTime(announcement.createdAt, i18n.language)}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </PopoverContent>
      </Popover>

      {announcementsEnabled && (
        <AnnouncementDetailDialog
          announcement={selectedAnnouncement}
          open={!!selectedAnnouncement}
          onOpenChange={(open) => !open && setSelectedAnnouncement(null)}
        />
      )}
    </>
  );
}
