import type { CustomerAction } from "@shared/customer-actions";

/** A row from GET /api/projects/:id/customer-actions or /api/customers/:id/customer-actions. */
export type CustomerActionRow = CustomerAction & {
  projectId: number;
  ownerName: string | null;
  /** Only on the account-wide route. */
  projectName?: string | null;
  /** Whether the signed-in user may mark it done (shared canCompleteCustomerAction). */
  canComplete?: boolean;
};

export const customerActionsKey = (scope: "projects" | "customers", id: number | null | undefined) =>
  [`/api/${scope}`, id, "customer-actions"] as const;
