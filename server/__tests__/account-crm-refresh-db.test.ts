// @vitest-environment node
//
// Linked accounts take their CRM-owned fields from the CRM (migration 122).
// Runs against the real Postgres in DATABASE_URL and skips without one. The
// CRM itself is faked: only the readers are replaced.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

const crm = vi.hoisted(() => ({
  read: { found: [] as Array<Record<string, unknown>>, missing: [] as string[] },
  fail: false,
}));

vi.mock("../crm/hubspot-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../crm/hubspot-provider")>()),
  readHubspotAccounts: vi.fn(async () => {
    if (crm.fail) throw new Error("HubSpot down");
    return crm.read;
  }),
}));

import { db } from "../db";
import { storage } from "../storage";
import { customers, industries, projects, type InsertProject } from "@shared/schema";
import { applyCrmAccountDetails, loadCrmFieldLookups, refreshLinkedAccounts } from "../crm/account-refresh";

const MARKER = "ACR-TEST";
const HS = (id: string) => `https://app.hubspot.com/contacts/12345/record/0-2/${id}`;

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(projects).where(sql`${projects.customerName} LIKE ${MARKER + "%"}`);
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
  await db.delete(industries).where(sql`${industries.name} LIKE ${MARKER + "%"}`);
}

async function linkedAccount(name: string, companyId: string): Promise<number> {
  const created = await storage.createCustomer({ accountName: name, salesforceAccountUrl: HS(companyId) } as never);
  return created.id;
}

describe.skipIf(!process.env.DATABASE_URL)("linked account refresh", () => {
  beforeAll(cleanup);
  afterEach(async () => {
    crm.read = { found: [], missing: [] };
    crm.fail = false;
    await cleanup();
  });
  afterAll(cleanup);

  it("copies the CRM fields, locks them, and renames the account's projects", async () => {
    const [industry] = await db.insert(industries).values({ name: `${MARKER} Software` }).returning();
    const id = await linkedAccount(`${MARKER} Old`, "900001");
    const project = await storage.createProject({ customerName: `${MARKER} Old`, solutionName: "S" } as InsertProject);

    await applyCrmAccountDetails(
      id,
      { id: "900001", name: `${MARKER} New`, industry: `${MARKER} software`, country: "Germany", website: "new.example", ownerEmail: null },
      await loadCrmFieldLookups(),
    );

    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row.accountName).toBe(`${MARKER} New`);
    expect(row.industryId).toBe(industry.id);
    expect(row.region).toBe("Europe");
    expect(row.website).toBe("https://new.example");
    expect(row.crmManagedFields).toEqual(["accountName", "industryId", "region", "website"]);
    expect(row.crmSyncedAt).toBeInstanceOf(Date);

    const [p] = await db.select().from(projects).where(eq(projects.id, project.id));
    expect(p.customerName).toBe(`${MARKER} New`);
    expect(p.customerId).toBe(id);
  });

  it("refreshes HubSpot accounts nightly and flags the ones HubSpot lost", async () => {
    const kept = await linkedAccount(`${MARKER} Kept`, "900002");
    const lost = await linkedAccount(`${MARKER} Lost`, "900003");
    crm.read = {
      found: [{ id: "900002", name: `${MARKER} Kept Inc`, industry: null, country: null, website: null, ownerEmail: null }],
      missing: ["900003"],
    };

    const result = await refreshLinkedAccounts("hubspot");
    expect(result).toMatchObject({ refreshed: 1, missing: 1, failed: 0 });

    const [k] = await db.select().from(customers).where(eq(customers.id, kept));
    expect(k.accountName).toBe(`${MARKER} Kept Inc`);
    expect(k.crmRecordMissingAt).toBeNull();
    const [l] = await db.select().from(customers).where(eq(customers.id, lost));
    expect(l.accountName).toBe(`${MARKER} Lost`);
    expect(l.crmRecordMissingAt).toBeInstanceOf(Date);
  });

  it("changes nothing when the CRM can't be read", async () => {
    const id = await linkedAccount(`${MARKER} Steady`, "900004");
    crm.fail = true;
    const result = await refreshLinkedAccounts("hubspot");
    expect(result.refreshed).toBe(0);
    const [row] = await db.select().from(customers).where(eq(customers.id, id));
    expect(row.accountName).toBe(`${MARKER} Steady`);
    expect(row.crmRecordMissingAt).toBeNull();
    expect(row.crmSyncedAt).toBeNull();
  });
});
