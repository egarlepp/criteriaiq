import { format, isValid, parse } from 'date-fns';

/** An evaluation request as GET /api/evaluation-requests returns it (JSON). */
export interface EvaluationRequestDetail {
  id: number;
  customerId: number;
  customerName: string | null;
  userId: string;
  requesterName: string | null;
  status: string;
  startDate: string;
  endDate: string;
  topReasons: string;
  compellingEvent: string;
  createdAt: string | null;
  updatedAt: string | null;
  solutionIds: number[];
  requestedSolutions: string[];
}

export type EvaluationRequestDialogMode = 'create' | 'view' | 'edit';

export const REQUEST_STATUSES = ['open', 'closed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * The yyyy-MM-dd part of a stored date. Start/end dates are saved as
 * midnight UTC, so reading the calendar day from the string (not through
 * the local time zone) keeps the day the user picked.
 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const day = value.slice(0, 10);
  return isValid(parse(day, 'yyyy-MM-dd', new Date())) ? day : '';
}

/** Formats a stored start/end date for display, keeping the picked day. */
export function formatRequestDay(value: string | null | undefined): string {
  const day = toDateInputValue(value);
  return day ? format(parse(day, 'yyyy-MM-dd', new Date()), 'MMM dd, yyyy') : '';
}

/** Formats a timestamp (created/updated) in the viewer's time zone. */
export function formatRequestTimestamp(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return isValid(date) ? format(date, 'MMM dd, yyyy') : '';
}

export function requestStatusBadgeClass(status: string): string {
  return status.toLowerCase() === 'closed'
    ? 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700'
    : 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800';
}
