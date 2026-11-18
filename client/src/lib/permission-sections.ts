import { IMPACTIQ_COST_SECTION } from "@shared/impactiq";

// Page permission keys and their levels live in shared/permissions.ts, and
// Role Management's rows are built from the sidebar (lib/permission-tree.ts).

/**
 * Data a role can be allowed to see on pages it already has. These are not
 * sidebar pages, so Role Management lists them after the page groups and
 * offers only None or View. Stored as ordinary role permissions.
 */
export interface DataVisibilityDefinition {
  id: string;
  labelKey: string;
  descriptionKey: string;
  icon: string;
}

export const DATA_VISIBILITY_PERMISSIONS: DataVisibilityDefinition[] = [
  {
    // Admin always sees it; no grant means no cost on the SE Effort card.
    id: IMPACTIQ_COST_SECTION,
    labelKey: "rolePermissions.dataVisibility.impactiqCost.label",
    descriptionKey: "rolePermissions.dataVisibility.impactiqCost.description",
    icon: "DollarSign",
  },
];
