// Who may see and change the shared Artifacts library: documents, links and
// code scripts. Internal staff see and edit everything. External users
// (Customer, Guest, Partner) only read active items that are not tied to
// another account, a competitor, or an internal-only type, and may only
// delete documents they uploaded themselves.
import { isExternalRole } from "./internal-access";
import { getExternalUserAccountIds } from "./customer-access";

// Item types written for staff (competitive and deal notes). Never shown to
// external users, whatever the item's account scope says.
export const INTERNAL_ONLY_LIBRARY_TYPES: ReadonlySet<string> = new Set([
  "Internal Notes",
  "Win/Loss Info",
  "Battlecard",
]);

export interface LibraryItem {
  isActive?: boolean | null;
  accountIds?: number[] | null;
  customerId?: number | null;
  competitorId?: number | null;
  documentType?: string | null;
  linkType?: string | null;
}

export interface LibraryViewer {
  userId: string;
  external: boolean;
  /** Accounts an external viewer belongs to. Empty for internal viewers. */
  accountIds: ReadonlySet<number>;
}

interface SessionRequest {
  session?: { user?: { id?: string; role?: string | null; email?: string | null } };
}

export async function getLibraryViewer(req: SessionRequest): Promise<LibraryViewer> {
  const user = req.session?.user;
  const userId = user?.id ?? "";
  const external = !user?.role || isExternalRole(user.role);
  if (!external) return { userId, external, accountIds: new Set() };
  const accountIds = userId ? await getExternalUserAccountIds(userId, user?.email) : [];
  return { userId, external, accountIds: new Set(accountIds) };
}

export function canViewLibraryItem(viewer: LibraryViewer, item: LibraryItem): boolean {
  if (!viewer.external) return true;
  if (item.isActive === false) return false;
  if (item.competitorId != null) return false;
  if (item.documentType && INTERNAL_ONLY_LIBRARY_TYPES.has(item.documentType)) return false;
  if (item.linkType && INTERNAL_ONLY_LIBRARY_TYPES.has(item.linkType)) return false;
  if (item.customerId != null && !viewer.accountIds.has(item.customerId)) return false;
  if (Array.isArray(item.accountIds) && item.accountIds.length > 0) {
    return item.accountIds.some((id) => viewer.accountIds.has(id));
  }
  return true;
}

export function filterLibraryItems<T extends LibraryItem>(viewer: LibraryViewer, items: T[]): T[] {
  if (!viewer.external) return items;
  return items.filter((item) => canViewLibraryItem(viewer, item));
}

/** External users may delete only a document they uploaded and can still see. */
export function canDeleteDocument(
  viewer: LibraryViewer,
  document: LibraryItem & { uploadedByUserId?: string | null },
): boolean {
  if (!viewer.external) return true;
  return document.uploadedByUserId === viewer.userId && canViewLibraryItem(viewer, document);
}
