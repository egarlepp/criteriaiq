/**
 * Centralized Project Status Definitions
 * 
 * This module provides a single source of truth for project status classifications
 * used throughout the application. Any component or calculation that needs to
 * determine if a project is "active" should use these utilities.
 */

/**
 * Statuses that indicate a project is no longer active/in-progress.
 * A project with any of these statuses is considered "inactive" or "closed".
 */
export const INACTIVE_STATUSES = [
  'completed',
  'closed won',
  'closed lost',
  'cancelled',
  'archived'
] as const;

export type InactiveStatus = typeof INACTIVE_STATUSES[number];

/**
 * Determines if a project is considered "active" based on its status.
 * 
 * A project is active if its status is NOT one of:
 * - Completed
 * - Closed Won
 * - Closed Lost
 * - Cancelled
 * - Archived
 * 
 * @param project - Any object with a status property
 * @returns true if the project is active, false otherwise
 */
export function isActiveProject(project: { status?: string | null }): boolean {
  if (!project.status) return true; // Projects without status are considered active
  return !INACTIVE_STATUSES.includes(project.status.toLowerCase() as InactiveStatus);
}

/**
 * Filters an array of projects to only include active ones.
 * 
 * @param projects - Array of projects with status property
 * @returns Array of active projects only
 */
export function filterActiveProjects<T extends { status?: string | null }>(projects: T[]): T[] {
  return projects.filter(isActiveProject);
}

/**
 * Checks if a status string represents a "closed" project (won or lost).
 * 
 * @param status - The status string to check
 * @returns true if the status is closed won or closed lost
 */
export function isClosedStatus(status?: string | null): boolean {
  if (!status) return false;
  const lower = status.toLowerCase();
  return lower === 'closed won' || lower === 'closed lost';
}

/**
 * Checks if a status string represents a "won" project.
 * 
 * @param status - The status string to check
 * @returns true if the status is closed won
 */
export function isWonStatus(status?: string | null): boolean {
  if (!status) return false;
  return status.toLowerCase() === 'closed won';
}

/**
 * Checks if a status string represents a "lost" project.
 * 
 * @param status - The status string to check
 * @returns true if the status is closed lost
 */
export function isLostStatus(status?: string | null): boolean {
  if (!status) return false;
  return status.toLowerCase() === 'closed lost';
}

/**
 * Checks if a status string represents a "completed" project.
 * 
 * @param status - The status string to check
 * @returns true if the status is completed
 */
export function isCompletedStatus(status?: string | null): boolean {
  if (!status) return false;
  return status.toLowerCase() === 'completed';
}

/**
 * Checks if a status string represents a TCC (Technically Cleared To Close) project.
 * 
 * @param status - The status string to check
 * @returns true if the status is TCC
 */
export function isTCCStatus(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === 'tcc' || s === 'tcc stage' || s === 'technical close confirmed';
}
