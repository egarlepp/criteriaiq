import { isWorkingDay, workingDaysBetween, type WorkingCalendar } from "@shared/working-calendar";

/**
 * Utility functions for project form date calculations and working-day logic
 */

/**
 * Format date for input field (YYYY-MM-DD)
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Calculate total days between two dates (including both start and end dates)
 * @param startDate - Start date string
 * @param endDate - End date string
 * @returns Total number of days
 */
export const calculateTotalDays = (startDate: string, endDate: string): number => {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const timeDiff = end.getTime() - start.getTime();
  return Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // +1 to include both start and end dates
};

/**
 * Working days from `startDate` to `endDate` ("YYYY-MM-DD"), counting both
 * ends: weekends and the calendar's holidays don't count.
 */
export const countWorkingDays = (startDate: string, endDate: string, cal: WorkingCalendar): number => {
  if (!startDate || !endDate || endDate < startDate) return 0;
  return (isWorkingDay(startDate, cal) ? 1 : 0) + workingDaysBetween(startDate, endDate, cal);
};
