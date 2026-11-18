import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { UpdateCategory } from "@shared/version-updates";

export interface VersionUpdate {
  version: string;
  date: string;
  pr: number | null;
  title: string;
  category: UpdateCategory;
}

export interface VersionUpdates {
  release: string;
  version: string;
  updates: VersionUpdate[];
}

export const VERSION_UPDATES_KEY = ["/api/version/updates"] as const;

// Matches server/lib/internal-access.ts EXTERNAL_ROLES.
const EXTERNAL_ROLES: ReadonlySet<string> = new Set(["Customer", "Guest", "Partner"]);

/** Only signed-in internal users get the version link and the update list. */
export function canViewVersionUpdates(role: string | null | undefined, signedIn: boolean): boolean {
  return signedIn && !EXTERNAL_ROLES.has(role ?? "");
}

/**
 * Interim updates in the current release (one per merge to main, newest
 * first), shown by the sidebar version link and About → Introduction.
 * Internal users only: PR titles can name internal or security work, so the
 * server refuses outside users and the query is not sent for them (or for an
 * Admin viewing as one).
 */
export function useVersionUpdates() {
  const { user } = useAuth();
  const canView = canViewVersionUpdates(user?.role, Boolean(user));
  const query = useQuery<VersionUpdates>({
    queryKey: VERSION_UPDATES_KEY,
    staleTime: 5 * 60_000,
    enabled: canView,
  });
  return { ...query, canView };
}
