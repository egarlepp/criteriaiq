// Which projects' customer to-dos a user may see and tick off. Shared by the
// MAP routes (GET .../customer-actions) and the customer workspace routes
// (marking a to-do done).
import { storage } from "../storage";
import { hasProjectEditAccess } from "./project-access";
import { isExternalRole } from "./internal-access";
import { canCompleteCustomerAction, mapSharedWithOutsideUsers, type CustomerAction } from "@shared/customer-actions";

/**
 * Customer, Partner and Guest users see a project's customer tasks only when
 * its MAP tab is shared with them (deliverables visibility). Internal users
 * see every project they can open.
 */
export async function projectsWithVisibleCustomerActions(
  projectIds: number[],
  userRole: string | null | undefined,
): Promise<number[]> {
  if (!isExternalRole(userRole)) return projectIds;
  const visible: number[] = [];
  for (const projectId of projectIds) {
    const project = await storage.getProjectById(projectId);
    const visibility = (project as { deliverablesVisibility?: { cardVisible?: boolean; tabs?: Record<string, boolean> } | null } | undefined)
      ?.deliverablesVisibility;
    if (project && mapSharedWithOutsideUsers(visibility)) visible.push(projectId);
  }
  return visible;
}

/**
 * Adds `canComplete` to each to-do: whether this user may mark it done
 * (shared/customer-actions.ts canCompleteCustomerAction). Edit access is
 * looked up once per project, and only for internal users.
 */
export async function withCanComplete<T extends Pick<CustomerAction, "ownerUserId" | "team"> & { projectId: number }>(
  actions: T[],
  user: { id: string; role: string | null | undefined; email: string | null | undefined },
): Promise<Array<T & { canComplete: boolean }>> {
  const isExternal = isExternalRole(user.role);
  const editByProject = new Map<number, boolean>();
  const out: Array<T & { canComplete: boolean }> = [];
  for (const action of actions) {
    let hasEditAccess = false;
    if (!isExternal) {
      if (!editByProject.has(action.projectId)) {
        editByProject.set(action.projectId, await hasProjectEditAccess(user.id, user.role, user.email, action.projectId));
      }
      hasEditAccess = editByProject.get(action.projectId) ?? false;
    }
    out.push({
      ...action,
      canComplete: canCompleteCustomerAction({
        task: { assignedToCustomerUserId: action.ownerUserId, teamOwned: action.team },
        userId: user.id,
        isExternal,
        hasEditAccess,
      }),
    });
  }
  return out;
}
