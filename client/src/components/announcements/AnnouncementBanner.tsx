import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Info, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAnnouncements, UserAnnouncement } from '@/hooks/useAnnouncements';
import { cn } from '@/lib/utils';
import { AnnouncementDetailDialog } from './AnnouncementDetailDialog';
import { triggerCelebration } from '@/lib/celebration';

interface AnnouncementBannerProps {
  enabled?: boolean;
}

const severityConfig = {
  info: { 
    icon: Info, 
    bgColor: 'bg-blue-600',
    hoverBgColor: 'hover:bg-blue-700',
    textColor: 'text-white',
    borderColor: 'border-blue-700'
  },
  warning: { 
    icon: AlertTriangle, 
    bgColor: 'bg-amber-500',
    hoverBgColor: 'hover:bg-amber-600',
    textColor: 'text-white',
    borderColor: 'border-amber-600'
  },
  critical: { 
    icon: XCircle, 
    bgColor: 'bg-red-600',
    hoverBgColor: 'hover:bg-red-700',
    textColor: 'text-white',
    borderColor: 'border-red-700'
  },
};

export function AnnouncementBanner({ enabled = true }: AnnouncementBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<UserAnnouncement | null>(null);
  const firedCelebrationIds = useRef<Set<number>>(new Set());
  
  const { 
    footerAnnouncements,
    announcements,
    markAsRead, 
    isLoading 
  } = useAnnouncements(enabled);

  useEffect(() => {
    if (isLoading) return;
    for (const a of announcements) {
      if (!a.celebrationEffect) continue;
      if (firedCelebrationIds.current.has(a.id)) continue;
      // Per-announcement "fire on every login vs first login only".
      // 'first' = once ever (per browser); 'every' = once per page load (still gated by
      // the in-session firedCelebrationIds ref above so it doesn't re-fire on re-renders).
      const mode = a.celebrationOnLogin === 'every' ? 'every' : 'first';
      const storageKey = `criteriaiq:celeb:login:${a.id}`;
      if (mode === 'first' && typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) {
        continue;
      }
      firedCelebrationIds.current.add(a.id);
      try { window.localStorage.setItem(storageKey, '1'); } catch { /* ignore quota */ }
      setTimeout(() => {
        triggerCelebration(a.celebrationEffect!, a.celebrationConfig || {});
      }, 800);
      break;
    }
  }, [isLoading, announcements]);

  const visibleAnnouncements = useMemo(() => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return footerAnnouncements
      .filter(a => !dismissedIds.has(a.id))
      .sort((a, b) => {
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [footerAnnouncements, dismissedIds]);

  const currentAnnouncement = visibleAnnouncements[currentIndex] || null;

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prev => 
      prev > 0 ? prev - 1 : visibleAnnouncements.length - 1
    );
  }, [visibleAnnouncements.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => 
      prev < visibleAnnouncements.length - 1 ? prev + 1 : 0
    );
  }, [visibleAnnouncements.length]);

  const handleDismiss = useCallback((id: number) => {
    markAsRead(id);
    setDismissedIds(prev => {
      const newDismissed = new Set([...prev, id]);
      const remainingCount = footerAnnouncements.filter(a => !newDismissed.has(a.id)).length;
      if (remainingCount > 0 && currentIndex >= remainingCount) {
        setCurrentIndex(Math.max(0, remainingCount - 1));
      } else if (remainingCount === 0) {
        setCurrentIndex(0);
      }
      return newDismissed;
    });
  }, [markAsRead, currentIndex, footerAnnouncements]);

  const handleAnnouncementClick = useCallback(() => {
    if (currentAnnouncement) {
      if (!currentAnnouncement.isRead) {
        markAsRead(currentAnnouncement.id);
      }
      setSelectedAnnouncement(currentAnnouncement);
    }
  }, [currentAnnouncement, markAsRead]);

  if (!enabled || isLoading || visibleAnnouncements.length === 0 || !currentAnnouncement) {
    return null;
  }

  const config = severityConfig[currentAnnouncement.severity];
  const Icon = config.icon;

  return (
    <>
      <div 
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'flex items-center justify-between px-4 py-2',
          'shadow-lg border-t',
          config.bgColor,
          config.borderColor,
          config.textColor
        )}
      >
        {/* Left arrow for previous */}
        {visibleAnnouncements.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevious}
            className={cn(
              'text-white hover:bg-white/20 p-1',
              config.hoverBgColor
            )}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}

        {/* Main content */}
        <button
          onClick={handleAnnouncementClick}
          className="flex-1 flex items-center justify-center gap-3 cursor-pointer hover:opacity-90 transition-opacity mx-2"
        >
          <Icon className="h-5 w-5 shrink-0" />
          <span className="font-medium truncate max-w-[70%]">
            {currentAnnouncement.title}
          </span>
          {visibleAnnouncements.length > 1 && (
            <Badge 
              variant="outline" 
              className="bg-white/20 text-white border-white/40 text-xs"
            >
              {currentIndex + 1} / {visibleAnnouncements.length}
            </Badge>
          )}
        </button>

        {/* Right side: next arrow and dismiss */}
        <div className="flex items-center gap-1">
          {visibleAnnouncements.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNext}
              className={cn(
                'text-white hover:bg-white/20 p-1',
                config.hoverBgColor
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDismiss(currentAnnouncement.id)}
            className={cn(
              'text-white hover:bg-white/20 p-1',
              config.hoverBgColor
            )}
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Detail dialog */}
      <AnnouncementDetailDialog
        announcement={selectedAnnouncement}
        open={!!selectedAnnouncement}
        onOpenChange={(open) => !open && setSelectedAnnouncement(null)}
      />
    </>
  );
}
