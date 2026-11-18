// How a project finds its account (migration 120).
//
// projects.customer_id is the link; projects.customer_name is the display
// copy. Rows the migration could not resolve (two accounts with the same
// name, or a name no account has) keep customer_id NULL and fall back to the
// old name match, so nothing that joined before stops joining.
import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { archivedProjects, customers, projects } from "@shared/schema";
import { db } from "../db";

/** Join condition from `projects` to `customers`: by id, else by name for unresolved rows. */
export const projectCustomerJoin: SQL = or(
  eq(projects.customerId, customers.id),
  and(isNull(projects.customerId), eq(projects.customerName, customers.accountName)),
)!;

type Executor = Pick<typeof db, "select">;

/**
 * The id of the one active account whose name matches `name` (ignoring case
 * and surrounding spaces), or null when none or more than one does.
 */
export async function resolveCustomerIdByName(
  name: string | null | undefined,
  executor: Executor = db,
): Promise<number | null> {
  const key = typeof name === "string" ? name.trim().toLowerCase() : "";
  if (!key) return null;
  const rows = await executor
    .select({ id: customers.id })
    .from(customers)
    .where(sql`lower(trim(${customers.accountName})) = ${key}`)
    .limit(2);
  return rows.length === 1 ? rows[0].id : null;
}

/**
 * Fills `customerId` from `customerName` when the caller set a name but no
 * id. An explicit `customerId` (including null) always wins.
 */
export async function withResolvedCustomerId<T extends { customerName?: string | null; customerId?: number | null }>(
  values: T,
  executor: Executor = db,
): Promise<T> {
  if (values.customerId !== undefined || values.customerName === undefined) return values;
  return { ...values, customerId: await resolveCustomerIdByName(values.customerName, executor) };
}

type Writer = Pick<typeof db, "select" | "update">;

/**
 * After an account is renamed, give its projects (active and archived) the
 * new display name. Projects still linked only by the old name (customer_id
 * NULL) are linked by id now, unless another account also has the old name.
 */
export async function propagateAccountRename(
  executor: Writer,
  customerId: number,
  oldName: string,
  newName: string,
): Promise<void> {
  if (oldName === newName) return;
  const oldKey = oldName.trim().toLowerCase();
  const others = await executor
    .select({ id: customers.id })
    .from(customers)
    .where(and(sql`lower(trim(${customers.accountName})) = ${oldKey}`, sql`${customers.id} <> ${customerId}`))
    .limit(1);
  const adoptByName = others.length === 0 && oldKey !== "";

  for (const table of [projects, archivedProjects] as const) {
    await executor.update(table).set({ customerName: newName }).where(eq(table.customerId, customerId));
    if (adoptByName) {
      await executor
        .update(table)
        .set({ customerId, customerName: newName })
        .where(and(isNull(table.customerId), sql`lower(trim(${table.customerName})) = ${oldKey}`));
    }
  }
}
