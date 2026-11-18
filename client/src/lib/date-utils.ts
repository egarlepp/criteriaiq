/**
 * Timezone-aware date utilities for the application
 */

import { format, parseISO, differenceInDays } from 'date-fns';
import { pickEndDateFlag } from '@shared/end-date-flags';
import type { WorkingCalendar } from '@shared/working-calendar';

export interface DateStatusResult {
  statusText: string;
  statusClass: string;
  daysDiff: number;
}

export interface EndDateFlag {
  id: number;
  name: string;
  description?: string;
  badgeText: string;
  badgeColor: string;
  icon?: string; // Lucide icon name (optional)
  triggerType: string;
  triggerValue: number;
  priority: number;
  isActive: boolean;
  isSystem: boolean;
  projectStatuses?: string[]; // Added to store allowed project statuses
  targetField?: string; // Which date field this flag applies to (default: 'project.endDate')
  workingDays?: boolean; // "Days before" counts working days (weekends and default holidays don't count)
}

/**
 * Get timezone-aware "today" date for a given timezone
 */
export function getTodayInTimezone(timezone: string): Date {
  const now = new Date();

  // Create a new date in the user's timezone
  const userDate = new Date(now.toLocaleString("en-US", { timeZone: timezone }));

  // Get start of day in user's timezone
  const startOfDay = new Date(userDate.getFullYear(), userDate.getMonth(), userDate.getDate());

  return startOfDay;
}

/**
 * Get start of day for a date in a specific timezone
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  // Convert the date to the user's timezone and get start of day
  const dateInTimezone = new Date(date.toLocaleString("en-US", { timeZone: timezone }));
  return new Date(dateInTimezone.getFullYear(), dateInTimezone.getMonth(), dateInTimezone.getDate());
}

/**
 * Calculate days difference between two dates accounting for timezone
 */
export function calculateDaysDiff(endDate: Date | string, userTimezone: string): number {
  const today = getTodayInTimezone(userTimezone);

  let endDateObj: Date;
  if (typeof endDate === 'string') {
    endDateObj = parseProjectDate(endDate);
  } else {
    endDateObj = endDate;
  }

  const endDateInTimezone = getStartOfDayInTimezone(endDateObj, userTimezone);

  const timeDiff = endDateInTimezone.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

  return daysDiff;
}

/**
 * Calculate days difference for start date to show "Starts in X Days"
 */
export function calculateStartDaysDiff(startDate: Date | string, userTimezone: string): number {
  const today = getTodayInTimezone(userTimezone);

  let startDateObj: Date;
  if (typeof startDate === 'string') {
    startDateObj = parseProjectDate(startDate);
  } else {
    startDateObj = startDate;
  }

  const startDateInTimezone = getStartOfDayInTimezone(startDateObj, userTimezone);

  const timeDiff = startDateInTimezone.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

  return daysDiff;
}

/**
 * Get start date status to show "Starts in X Days" when start date is in the future
 */
export function getStartDateStatus(startDate: Date | string, userTimezone: string = 'America/New_York'): DateStatusResult | null {
  if (!startDate) {
    return null;
  }

  const daysDiff = calculateStartDaysDiff(startDate, userTimezone);

  if (daysDiff > 0) {
    return {
      statusText: daysDiff === 1 ? 'Starts in 1 day' : `Starts in ${daysDiff} days`,
      statusClass: 'text-blue-600 font-medium',
      daysDiff
    };
  }

  return null; // Return null if start date is not in the future
}

/**
 * Get date status with appropriate styling based on timezone-aware calculation
 */
export function getDateStatus(endDate: Date | string, userTimezone: string = 'America/New_York'): DateStatusResult {
  if (!endDate) {
    return {
      statusText: 'Not set',
      statusClass: 'text-gray-400',
      daysDiff: 0
    };
  }

  const daysDiff = calculateDaysDiff(endDate, userTimezone);

  if (daysDiff < 0) {
    const overdueDays = Math.abs(daysDiff);
    return {
      statusText: overdueDays === 1 ? '1 day overdue' : `${overdueDays} days overdue`,
      statusClass: 'text-red-600 font-medium',
      daysDiff
    };
  } else if (daysDiff === 0) {
    return {
      statusText: 'Due Today',
      statusClass: 'text-orange-600 font-medium',
      daysDiff
    };
  } else if (daysDiff <= 7) {
    return {
      statusText: 'Due This Week',
      statusClass: 'text-orange-500',
      daysDiff
    };
  } else {
    return {
      statusText: `Due in ${daysDiff} ${daysDiff === 1 ? 'day' : 'days'}`,
      statusClass: 'text-gray-500',
      daysDiff
    };
  }
}

/**
 * Parse date string or Date object consistently avoiding timezone offset issues
 */
export function parseProjectDate(date: string | Date): Date {
  if (!date) return new Date();

  if (date instanceof Date) {
    return date;
  }

  try {
    if (date.includes('T')) {
      // Handle ISO string - extract date part and parse in local timezone
      const datePart = date.split('T')[0];
      const [year, month, day] = datePart.split('-').map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed
    } else {
      // Handle date-only strings (YYYY-MM-DD)
      const [year, month, day] = date.split('-').map(Number);
      return new Date(year, month - 1, day); // month is 0-indexed
    }
  } catch (error) {
    console.error('Error parsing date:', date, error);
    return new Date();
  }
}

/**
 * Format date for display accounting for timezone
 */
export function formatDateForDisplay(date: Date | string, timezone: string = 'America/New_York'): string {
  if (!date) return 'Not set';

  let dateObj: Date;
  if (typeof date === 'string') {
    dateObj = parseProjectDate(date);
  } else {
    dateObj = date;
  }

  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

/** "YYYY-MM-DD" of a local-time Date. */
function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The highest-priority flag for a date (rule in shared/end-date-flags.ts).
 * `calendar` holds the days off for flags that count working days; without
 * it those flags count calendar days.
 */
export function getEndDateFlag(
  endDate: string | Date | null,
  flags: EndDateFlag[],
  timezone: string = 'America/New_York',
  projectStatus?: string,
  targetField: string = 'project.endDate',
  calendar?: WorkingCalendar,
): EndDateFlag | null {
  if (!endDate || !flags || flags.length === 0) return null;

  try {
    const endDateObj = typeof endDate === 'string' ? parseProjectDate(endDate) : endDate;
    if (isNaN(endDateObj.getTime())) return null;

    return pickEndDateFlag(flags, {
      todayIso: localIsoDate(getTodayInTimezone(timezone)),
      dueIso: localIsoDate(getStartOfDayInTimezone(endDateObj, timezone)),
      projectStatus,
      targetField,
      calendar,
    });
  } catch (error) {
    console.error('Error in getEndDateFlag:', error);
    return null;
  }
}
