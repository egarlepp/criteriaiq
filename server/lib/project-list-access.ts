// Which projects a viewer sees in project lists (GET /api/projects and the
// ImpactIQ activity counts on Manage Projects). Restricted roles see only
// projects they are assigned to or were given access to; every other role
// sees the whole list. Also holds the access-entry matcher shared with
// project-access.ts and GET /api/projects/:id.

export const PROJECT_LIST_RESTRICTED_ROLES: ReadonlySet<string> = new Set(["Customer", "Guest", "Sales", "Partner", "CX", "Product"]);

// A project's customerUsers / additionalAccess entries are stored as
// {userId, permission} (plus userEmail on customer users), but
// storage.getPoc / getProjectById return them enriched as user rows:
// {id, email, ..., permission}. Match both shapes, compare emails
// case-insensitively, and never match on a missing email
// (undefined === undefined used to let any email-less entry through).
export interface ProjectAccessEntry {
  id?: string;
  userId?: string;
  email?: string | null;
  userEmail?: string | null;
  permission?: string | null;
  accessRights?: string | null;
}

/** The entry in a project's customerUsers / additionalAccess list that names this user, if any. */
export function findProjectAccessEntry(
  entries: unknown,
  userId: string,
  userEmail: string | null | undefined,
): ProjectAccessEntry | undefined {
  if (!Array.isArray(entries)) return undefined;
  const email = userEmail?.trim().toLowerCase() || null;
  return (entries as unknown[]).find((raw): raw is ProjectAccessEntry => {
    if (!raw || typeof raw !== "object") return false;
    const entry = raw as ProjectAccessEntry;
    if (userId && (entry.userId === userId || entry.id === userId)) return true;
    if (!email) return false;
    const entryEmail = (entry.userEmail ?? entry.email)?.trim().toLowerCase();
    return entryEmail === email;
  });
}

export interface ProjectListAccessFields {
  primaryEngineerId?: string | null;
  specialistEngineerId?: string | null;
  supportingEngineers?: string[] | null;
  customerUsers?: unknown;
  additionalAccess?: unknown;
}

/** True when this user is named in a project's customerUsers or additionalAccess list. */
export function isListedOnProject(
  project: Pick<ProjectListAccessFields, "customerUsers" | "additionalAccess">,
  userId: string,
  userEmail: string | null | undefined,
): boolean {
  return (
    findProjectAccessEntry(project.customerUsers, userId, userEmail) !== undefined ||
    findProjectAccessEntry(project.additionalAccess, userId, userEmail) !== undefined
  );
}

export function filterProjectsForViewer<T extends ProjectListAccessFields>(
  projects: T[],
  userId: string,
  userRole: string | null | undefined,
  userEmail: string | null | undefined,
): T[] {
  if (!PROJECT_LIST_RESTRICTED_ROLES.has(userRole ?? "")) return projects;
  return projects.filter(
    (project) =>
      project.primaryEngineerId === userId ||
      project.specialistEngineerId === userId ||
      (project.supportingEngineers?.includes(userId) ?? false) ||
      isListedOnProject(project, userId, userEmail),
  );
}
