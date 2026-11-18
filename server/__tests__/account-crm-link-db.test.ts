// @vitest-environment node
//
// Accounts hold their CRM account id (migration 121): derived from the link
// URL on save, unique per CRM, filled for older rows at boot. Real Postgres
// from DATABASE_URL; skipped without one.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";

import { db } from "../db";
import { storage } from "../storage";
import { backfillCustomerCrmAccountIds } from "../storage/backfills";
import { isCrmAccountConflict } from "../lib/account-crm-link";
import { archivedCustomers, customers } from "@shared/schema";

const MARKER = "ACL-TEST";
const SF_URL = "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view";
const SF_URL_15 = "https://acme.my.salesforce.com/001000000000001";

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
  await db.delete(archivedCustomers).where(sql`${archivedCustomers.accountName} LIKE ${MARKER + "%"}`);
}

describe.skipIf(!process.env.DATABASE_URL)("account CRM id", () => {
  beforeAll(cleanup);
  afterEach(cleanup);
  afterAll(cleanup);

  it("derives the CRM id from the link URL on create and update", async () => {
    const created = await storage.createCustomer({ accountName: `${MARKER} A`, salesforceAccountUrl: SF_URL } as never);
    expect(created).toMatchObject({ crmProvider: "salesforce", crmAccountId: "001000000000001AAA" });

    const cleared = await storage.updateCustomer(created.id, { salesforceAccountUrl: null } as never);
    expect(cleared).toMatchObject({ crmProvider: null, crmAccountId: null });
  });

  it("refuses a second account for the same CRM account, even via a 15-character id", async () => {
    await storage.createCustomer({ accountName: `${MARKER} First`, salesforceAccountUrl: SF_URL } as never);
    const holder = await storage.findCustomerByCrmAccount("salesforce", "001000000000001AAA");
    expect(holder?.accountName).toBe(`${MARKER} First`);

    let error: unknown;
    try {
      await storage.createCustomer({ accountName: `${MARKER} Second`, salesforceAccountUrl: SF_URL_15 } as never);
    } catch (e) {
      error = e;
    }
    expect(isCrmAccountConflict(error)).toBe(true);
  });

  it("backfills older rows and leaves duplicates unlinked", async () => {
    const [a] = await db.insert(customers).values({ accountName: `${MARKER} Old A`, salesforceAccountUrl: SF_URL }).returning();
    const [b] = await db.insert(customers).values({ accountName: `${MARKER} Old B`, salesforceAccountUrl: SF_URL_15 }).returning();

    await backfillCustomerCrmAccountIds();
    await backfillCustomerCrmAccountIds(); // idempotent

    const [rowA] = await db.select().from(customers).where(eq(customers.id, a.id));
    const [rowB] = await db.select().from(customers).where(eq(customers.id, b.id));
    expect(rowA.crmAccountId).toBe("001000000000001AAA");
    expect(rowB.crmAccountId).toBeNull();
    expect(rowB.salesforceAccountUrl).toBe(SF_URL_15);
  });

  it("restores an archived account without a CRM id another account took meanwhile", async () => {
    const original = await storage.createCustomer({ accountName: `${MARKER} Archived`, salesforceAccountUrl: SF_URL } as never);
    await storage.archiveCustomer(original.id, "test-user", "test");
    await storage.createCustomer({ accountName: `${MARKER} Taker`, salesforceAccountUrl: SF_URL } as never);

    await storage.restoreCustomer(original.id, "test-user");
    const [restored] = await db.select().from(customers).where(eq(customers.id, original.id));
    expect(restored.crmAccountId).toBeNull();
    expect(restored.salesforceAccountUrl).toBe(SF_URL);
  });
});
