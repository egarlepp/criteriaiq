import { useEffect, useRef } from 'react';
import { Info, AlertTriangle, XCircle, Megaphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { triggerCelebration } from '@/lib/celebration';

export interface AnnouncementDetailData {
  id: number;
  title: string;
  content: string;
  severity: 'info' | 'warning' | 'critical';
  createdAt: string;
  celebrationEffect?: string | null;
  celebrationConfig?: Record<string, unknown> | null;
  celebrationOnClick?: 'first' | 'every';
}

interface AnnouncementDetailDialogProps {
  announcement: AnnouncementDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const severityConfig = {
  info: { 
    icon: Info, 
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  warning: { 
    icon: AlertTriangle, 
    color: 'text-amber-500',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  critical: { 
    icon: XCircle, 
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800'
  },
};

export function AnnouncementDetailDialog({
  announcement,
  open,
  onOpenChange
}: AnnouncementDetailDialogProps) {
  const firedForId = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !announcement?.celebrationEffect) return;
    if (firedForId.current === announcement.id) return;
    // Per-announcement "fire on every click vs first click only".
    const mode = announcement.celebrationOnClick === 'every' ? 'every' : 'first';
    const storageKey = `criteriaiq:celeb:click:${announcement.id}`;
    if (mode === 'first' && typeof window !== 'undefined' && window.localStorage.getItem(storageKey)) {
      firedForId.current = announcement.id;
      return;
    }
    firedForId.current = announcement.id;
    try { window.localStorage.setItem(storageKey, '1'); } catch { /* ignore quota */ }
    triggerCelebration(announcement.celebrationEffect, announcement.celebrationConfig ?? {});
  }, [open, announcement?.id, announcement?.celebrationEffect, announcement?.celebrationConfig, announcement?.celebrationOnClick]);

  if (!announcement) {
    return null;
  }

  const config = severityConfig[announcement.severity];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge 
              variant="outline" 
              className={cn(
                'uppercase text-xs',
                config.bgColor,
                config.borderColor
              )}
            >
              <Icon className={cn('h-3 w-3 mr-1', config.color)} />
              {announcement.severity}
            </Badge>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(parseISO(announcement.createdAt), { addSuffix: true })}
            </span>
          </div>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Megaphone className="h-5 w-5 text-primary" />
            {announcement.title}
          </DialogTitle>
        </DialogHeader>
        <Separator className="my-2" />
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]} 
            rehypePlugins={[rehypeRaw]}
          >
            {announcement.content}
          </ReactMarkdown>
        </div>
      </DialogContent>
    </Dialog>
  );
}
