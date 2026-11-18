import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { levelAllows, resolveLevel, type PermissionLevel } from "@shared/permissions";

export interface Permission {
  id: number;
  userId: string;
  section: string;
  permission: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface NormalizedPermission {
  section: string;
  permission: string;
}

export async function fetchOwnPermissions(userId: string): Promise<Permission[]> {
  const res = await fetch(`/api/user-permissions/${encodeURIComponent(userId)}`, { credentials: "include" });
  if (!res.ok) throw new Error(`Failed to load permissions (HTTP ${res.status})`);
  return res.json();
}

// During View As the signed-in user IS the person viewed (the server swaps
// the session), so their own permission rows are the ones that apply; a
// role stand-in gets its role's Role Management grants from the same
// endpoint. Writes are refused by the server then, but Edit controls still
// show as they would for that person.
export function usePermissions() {
  const { user, isAuthenticated } = useAuth();

  // Explicit queryFn: the default one fetches only queryKey[0], which is the
  // list endpoint. That returns every user's rows to anyone who can view
  // User Management (so the first match could be someone else's) and none
  // for a View As role stand-in.
  const { data: permissions = [] } = useQuery<Permission[]>({
    queryKey: ["/api/user-permissions", user?.id],
    queryFn: () => fetchOwnPermissions(user!.id),
    enabled: isAuthenticated && !!user?.id,
  });

  const activeRole = user?.role;
  const activePermissions: NormalizedPermission[] = permissions;

  // Each page has its own value (Role Management); no row means None.
  const getEffectivePermission = (section: string): PermissionLevel | "admin" | null => {
    if (!user) return null;
    if (activeRole?.toLowerCase() === "admin") return "admin";
    return resolveLevel(activePermissions, section);
  };

  const hasPermission = (section: string, requiredPermission: "view" | "edit" = "view") => {
    if (!user) return false;
    if (activeRole?.toLowerCase() === "admin") return true;
    return levelAllows(section, resolveLevel(activePermissions, section), requiredPermission);
  };

  const canView = (section: string) => hasPermission(section, "view");
  const canEdit = (section: string) => hasPermission(section, "edit");

  return {
    permissions: activePermissions,
    hasPermission,
    canView,
    canEdit,
    getEffectivePermission,
    userRole: activeRole || "User",
  };
}
