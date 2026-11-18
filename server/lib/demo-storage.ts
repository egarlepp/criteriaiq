// Task #723 — Demo isolation helpers.
// applyDemoFilter(table)   → WHERE predicate matching current request mode.
// applyDemoFlag(values)    → auto-sets isDemo:true on inserts from demo.
import { eq, or, and, isNull, sql, type Column, type SQL } from "drizzle-orm";
import { isCurrentRequestDemo } from "./demo-mode";

export function applyDemoFilter<T extends { isDemo: unknown }>(table: T): SQL {
  const col = (table as unknown as { isDemo: never }).isDemo;
  return eq(col, isCurrentRequestDemo());
}

export function applyDemoFilterPreserveSystem<T extends { isDemo: unknown; isSystem: unknown }>(table: T): SQL {
  const demoCol = (table as unknown as { isDemo: never }).isDemo;
  const sysCol = (table as unknown as { isSystem: never }).isSystem;
  if (isCurrentRequestDemo()) {
    return or(eq(demoCol, true), eq(sysCol, true))!;
  }
  return eq(demoCol, false);
}

/** The same predicate for raw SQL: `<alias>.is_demo = TRUE|FALSE`. */
export function demoModeSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return `${alias}.is_demo = ${isCurrentRequestDemo() ? "TRUE" : "FALSE"}`;
}

export function applyDemoFlag<V extends Record<string, unknown>>(values: V): V {
  if (values && typeof values === "object" && !("isDemo" in values) && isCurrentRequestDemo()) {
    return { ...values, isDemo: true };
  }
  return values;
}

// Rows of untagged tables (support requests, outcomes, risk predictions…)
// belong to the mode of the project or account they hang off. These
// predicates keep them inside that mode: in demo, only rows on demo
// projects/accounts; otherwise rows on real ones, plus rows with no
// project/account at all (never shown in demo).
export function applyDemoFilterByProject(projectIdCol: Column): SQL {
  const demo = isCurrentRequestDemo();
  const inMode = sql`${projectIdCol} IN (SELECT id FROM projects WHERE is_demo = ${demo})`;
  return demo ? inMode : or(isNull(projectIdCol), inMode)!;
}

export function applyDemoFilterByCustomer(customerIdCol: Column): SQL {
  const demo = isCurrentRequestDemo();
  const inMode = sql`${customerIdCol} IN (SELECT id FROM customers WHERE is_demo = ${demo})`;
  return demo ? inMode : or(isNull(customerIdCol), inMode)!;
}
