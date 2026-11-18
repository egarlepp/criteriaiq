// How long a project made from a project template runs, in working days.
// The project form sets the end date this many working days after the start
// date, skipping weekends and the organization's default holidays. See
// docs/features/working-calendar.md.

/** Working days a new project runs when its template doesn't say. */
export const DEFAULT_PROJECT_WORKING_DAYS = 14;
/** The longest duration a template can set, about a working year. */
export const MAX_PROJECT_WORKING_DAYS = 260;

/**
 * A template's duration from a request body or stored row: a whole number
 * from 1 to MAX_PROJECT_WORKING_DAYS, else null (not set).
 */
export function parseProjectWorkingDays(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= 1 && n <= MAX_PROJECT_WORKING_DAYS ? n : null;
}

/** The working days a project from this template runs. */
export function projectWorkingDays(template: { durationWorkingDays?: unknown } | null | undefined): number {
  return parseProjectWorkingDays(template?.durationWorkingDays) ?? DEFAULT_PROJECT_WORKING_DAYS;
}
