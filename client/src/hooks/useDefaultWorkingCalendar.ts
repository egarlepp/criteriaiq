import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WorkingCalendar } from '@shared/working-calendar';

interface DefaultHolidayDates {
  from: string;
  to: string;
  holidays: string[];
}

/**
 * The organization's default working calendar (weekends plus the default
 * holiday calendars), for working-day counts such as end-date flags.
 * Undefined until it loads, so callers fall back to calendar days.
 */
export function useDefaultWorkingCalendar(): WorkingCalendar | undefined {
  const { data } = useQuery<DefaultHolidayDates>({
    queryKey: ['/api/holiday-calendars/default-dates'],
    staleTime: 60 * 60 * 1000,
  });
  return useMemo(() => (data ? { holidays: new Set(data.holidays) } : undefined), [data]);
}
