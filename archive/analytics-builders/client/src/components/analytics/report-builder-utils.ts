/**
 * Per-source visual accent for Report Builder field groups.
 *
 * Each reportable source (Projects, Customers, etc.) gets its own
 * color so the Fields tab — and the matching filter-example chips on
 * the Filters tab — read as visually distinct groups instead of a wall
 * of identical blue panels. The palette uses tints already established
 * elsewhere in the app, all with `dark:` siblings.
 *
 * Unknown sources fall back to the neutral default (blue) so a new
 * server-registered source still renders without UI changes here.
 */
export interface GroupAccent {
  /** Tinted container background — light + dark */
  container: string;
  /** Container border — light + dark */
  border: string;
  /** Group-header text color (e.g. for the source name + count) */
  headerText: string;
  /** Group-header chevron color */
  chevron: string;
  /** Header row hover background (subtle, slightly stronger than container) */
  headerHover: string;
}

const ACCENTS: Record<string, GroupAccent> = {
  Projects: {
    container: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    headerText: "text-blue-700 dark:text-blue-300",
    chevron: "text-blue-600 dark:text-blue-400",
    headerHover: "hover:bg-blue-100 dark:hover:bg-blue-900/40",
  },
  Customers: {
    container: "bg-emerald-50 dark:bg-emerald-900/20",
    border: "border-emerald-200 dark:border-emerald-800",
    headerText: "text-emerald-700 dark:text-emerald-300",
    chevron: "text-emerald-600 dark:text-emerald-400",
    headerHover: "hover:bg-emerald-100 dark:hover:bg-emerald-900/40",
  },
  Teams: {
    container: "bg-teal-50 dark:bg-teal-900/20",
    border: "border-teal-200 dark:border-teal-800",
    headerText: "text-teal-700 dark:text-teal-300",
    chevron: "text-teal-600 dark:text-teal-400",
    headerHover: "hover:bg-teal-100 dark:hover:bg-teal-900/40",
  },
  "Validation Criteria": {
    container: "bg-purple-50 dark:bg-purple-900/20",
    border: "border-purple-200 dark:border-purple-800",
    headerText: "text-purple-700 dark:text-purple-300",
    chevron: "text-purple-600 dark:text-purple-400",
    headerHover: "hover:bg-purple-100 dark:hover:bg-purple-900/40",
  },
  "MAP Tasks": {
    container: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    headerText: "text-amber-700 dark:text-amber-300",
    chevron: "text-amber-600 dark:text-amber-400",
    headerHover: "hover:bg-amber-100 dark:hover:bg-amber-900/40",
  },
  Gaps: {
    container: "bg-rose-50 dark:bg-rose-900/20",
    border: "border-rose-200 dark:border-rose-800",
    headerText: "text-rose-700 dark:text-rose-300",
    chevron: "text-rose-600 dark:text-rose-400",
    headerHover: "hover:bg-rose-100 dark:hover:bg-rose-900/40",
  },
  Products: {
    container: "bg-cyan-50 dark:bg-cyan-900/20",
    border: "border-cyan-200 dark:border-cyan-800",
    headerText: "text-cyan-700 dark:text-cyan-300",
    chevron: "text-cyan-600 dark:text-cyan-400",
    headerHover: "hover:bg-cyan-100 dark:hover:bg-cyan-900/40",
  },
  "Evaluation Requests": {
    container: "bg-indigo-50 dark:bg-indigo-900/20",
    border: "border-indigo-200 dark:border-indigo-800",
    headerText: "text-indigo-700 dark:text-indigo-300",
    chevron: "text-indigo-600 dark:text-indigo-400",
    headerHover: "hover:bg-indigo-100 dark:hover:bg-indigo-900/40",
  },
  "Audit Findings": {
    container: "bg-orange-50 dark:bg-orange-900/20",
    border: "border-orange-200 dark:border-orange-800",
    headerText: "text-orange-700 dark:text-orange-300",
    chevron: "text-orange-600 dark:text-orange-400",
    headerHover: "hover:bg-orange-100 dark:hover:bg-orange-900/40",
  },
};

const DEFAULT_ACCENT: GroupAccent = ACCENTS.Projects;

/**
 * Returns the visual accent for the given source name. Falls back to
 * the Projects (blue) accent when the source is unknown so newly
 * registered server-side sources still render cleanly without
 * requiring this map to be updated first.
 */
export function groupAccent(source: string): GroupAccent {
  return ACCENTS[source] ?? DEFAULT_ACCENT;
}
