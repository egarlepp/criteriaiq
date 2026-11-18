// Project access helpers shared across MAP routes.
//
// Extracted from server/routes.ts (Phase 8 #9c). These are the
// project-level access-check helpers used by every MAP route — the
// project-map / phases / steps / tasks endpoints all guard with one
// of `hasProjectAccess` or `hasProjectEditAccess`. Pulled into a
// standalone module so the MAP route files can share them without
// importing from routes.ts (which would create a cycle).
import { storage } from "../storage";
import { findProjectAccessEntry, type ProjectAccessEntry } from "./project-list-access";

// Entry matching (both the stored {userId, userEmail} and the enriched
// {id, email} shapes) lives in project-list-access.ts so the list filter,
// GET /api/projects/:id and these MAP checks all agree.
function grantsEdit(entry: ProjectAccessEntry | undefined): boolean {
  return (entry?.permission ?? entry?.accessRights)?.toLowerCase() === "edit";
}

// Check if user has access to a project (for MAP read operations)
export async function hasProjectAccess(
  userId: string,
  userRole: string | null | undefined,
  userEmail: string | null | undefined,
  projectId: number,
): Promise<boolean> {
  // Get the project first
  const project = await storage.getProjectById(projectId);
  if (!project) return false;

  // Admin/Engineer roles get full access
  if (userRole === 'Engineer' || userRole === 'Admin') {
    return true;
  }

  // Check if user is a Primary, Specialist, or Supporting Engineer
  if (project.primaryEngineerId === userId ||
      project.specialistEngineerId === userId ||
      (project.supportingEngineers && project.supportingEngineers.includes(userId))) {
    return true;
  }

  // Any explicit customer or additional access grants read permission
  if (findProjectAccessEntry(project.customerUsers, userId, userEmail) ||
      findProjectAccessEntry(project.additionalAccess, userId, userEmail)) {
    return true;
  }

  // Check if user role matches restricted roles - they need explicit access
  const restrictedRoles = ['Customer', 'Guest', 'Sales', 'Partner', 'CX', 'Product'];
  if (restrictedRoles.includes(userRole as string)) {
    return false; // No access unless explicitly granted above
  }

  // For other internal roles, default to view access
  return true;
}

// Check if user has EDIT access to a project (for MAP write operations)
export async function hasProjectEditAccess(
  userId: string,
  userRole: string | null | undefined,
  userEmail: string | null | undefined,
  projectId: number,
): Promise<boolean> {
  // Get the project first
  const project = await storage.getProjectById(projectId);
  if (!project) return false;

  // Admin/Engineer roles get full edit access
  if (userRole === 'Engineer' || userRole === 'Admin') {
    return true;
  }

  // Non-admin API keys (synthetic role "ApiKey", server/auth/apiKeyAuth.ts)
  // are not project members, so without this every write from a
  // "Read and write" n8n key was refused. The key's scopes already gate the
  // request before it reaches a route (checkApiKeyAccess): a read-only or
  // automation-only key never gets this far on a write.
  if (userRole === 'ApiKey') {
    return true;
  }

  // Check if user is a Primary, Specialist, Supporting Engineer, or Additional Supporting Team (edit access)
  if (project.primaryEngineerId === userId ||
      project.specialistEngineerId === userId ||
      (project.supportingEngineers && project.supportingEngineers.includes(userId)) ||
      (project.additionalSupportingTeam && project.additionalSupportingTeam.includes(userId))) {
    return true;
  }

  // Customer or additional access set to "Edit" grants edit permission
  if (grantsEdit(findProjectAccessEntry(project.customerUsers, userId, userEmail)) ||
      grantsEdit(findProjectAccessEntry(project.additionalAccess, userId, userEmail))) {
    return true;
  }

  // For all other cases (including restricted roles without explicit edit access), deny edit access
  return false;
}
