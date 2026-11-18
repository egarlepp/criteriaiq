import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getEndDateFlag, type EndDateFlag } from '@/lib/date-utils';
import { useAuth } from '@/hooks/useAuth';
import { useDefaultWorkingCalendar } from '@/hooks/useDefaultWorkingCalendar';
import { cn } from '@/lib/utils';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import { normalizeColor } from '@/lib/color-utils';

interface EndDateBadgeProps {
  endDate: string | Date | null;
  projectStatus?: string;
  className?: string;
  targetField?: string;
}

export function EndDateBadge({ endDate, projectStatus, className, targetField = 'project.endDate' }: EndDateBadgeProps) {
  const { user } = useAuth();
  const { data: flags = [] } = useQuery<EndDateFlag[]>({
    queryKey: ['/api/end-date-flags/active'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  const calendar = useDefaultWorkingCalendar();

  if (!endDate) return null;

  // Use user's timezone or default to America/New_York
  const userTimezone = user?.timezone || 'America/New_York';
  const flag = getEndDateFlag(endDate, flags, userTimezone, projectStatus, targetField, calendar);

  if (!flag) return null;

  // Normalise the stored colour — maps legacy Tailwind variant names
  // ('warning', 'destructive', etc.) to their hex equivalents so the inline
  // style always receives a valid CSS colour value.
  // Text is always white: these are alert badges designed for dark badge colors;
  // white is the standard and matches the admin Field Settings preview.
  const bgColor = normalizeColor(flag.badgeColor);

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold", className)}
      style={{
        backgroundColor: bgColor,
        color: '#FFFFFF',
      }}
    >
      {flag.icon && <DynamicIcon name={flag.icon} className="h-3 w-3" />}
      <span>{flag.badgeText}</span>
    </span>
  );
}
