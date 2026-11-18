// @vitest-environment node
//
// Suggested CRM matches for an unlinked account, against the real Postgres
// in DATABASE_URL (skips without one). The CRM is a fake session: it
// answers searches and reads, so the test covers what the server does with
// them: accounts already linked elsewhere and dismissed pairs are left out.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const crm = vi.hoisted(() => ({
  accounts: [] as Array<{ id: string; name: string; website: string | null }>,
  connected: true,
}));

vi.mock("../crm/index", () => ({
  getActiveCrmProvider: async () => ({
    id: "hubspot",
    isRecordId: (id: string) => /^\d{1,20}$/.test(id),
    connectForUser: async () =>
      crm.connected
        ? {
            searchAccounts: async () => crm.accounts.map((a) => ({ id: a.id, name: a.name, url: `https://app.hubspot.com/contacts/1/record/0-2/${a.id}` })),
            readAccounts: async (ids: string[]) => ({
              found: crm.accounts
                .filter((a) => ids.includes(a.id))
                .map((a) => ({ id: a.id, name: a.name, website: a.website, industry: null, country: null, ownerEmail: null })),
              missing: [],
            }),
          }
        : null,
  }),
}));

import { db } from "../db";
import { storage } from "../storage";
import { accountCrmDismissals, customers } from "@shared/schema";
import { dismissCrmMatch, suggestCrmMatches } from "../crm/account-suggestions";

const MARKER = "ACS-TEST";

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
}

describe.skipIf(!process.env.DATABASE_URL)("suggested CRM matches", () => {
  beforeAll(cleanup);
  afterEach(async () => {
    crm.accounts = [];
    crm.connected = true;
    await cleanup();
  });
  afterAll(cleanup);

  it("ranks matches and leaves out accounts linked elsewhere and dismissed ones", async () => {
    const subject = await storage.createCustomer({ accountName: `${MARKER} Globex`, approvedEmailDomains: ["globex-test.io"] } as never);
    await storage.createCustomer({
      accountName: `${MARKER} Other`,
      salesforceAccountUrl: "https://app.hubspot.com/contacts/1/record/0-2/800003",
    } as never);
    crm.accounts = [
      { id: "800001", name: `${MARKER} Globex Inc`, website: null },
      { id: "800002", name: "Unrelated Name", website: "https://www.globex-test.io" },
      { id: "800003", name: `${MARKER} Globex LLC`, website: null },
      { id: "800004", name: `${MARKER} Globex Ltd`, website: null },
    ];

    expect(await dismissCrmMatch(subject.id, "800004", "u1")).toBe("dismissed");
    // A second dismissal of the same pair is a no-op.
    expect(await dismissCrmMatch(subject.id, "800004", "u1")).toBe("dismissed");

    const result = await suggestCrmMatches(subject.id, "u1");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.suggestions.map((s) => [s.id, s.strength])).toEqual([
      ["800002", "strong"],
      ["800001", "likely"],
    ]);

    const rows = await db.select().from(accountCrmDismissals).where(sql`${accountCrmDismissals.customerId} = ${subject.id}`);
    expect(rows).toHaveLength(1);
  });

  it("suggests nothing for a linked account or a user without a connection", async () => {
    const linked = await storage.createCustomer({
      accountName: `${MARKER} Linked`,
      salesforceAccountUrl: "https://app.hubspot.com/contacts/1/record/0-2/800010",
    } as never);
    expect((await suggestCrmMatches(linked.id, "u1")).status).toBe("linked");

    const local = await storage.createCustomer({ accountName: `${MARKER} Local` } as never);
    crm.connected = false;
    expect((await suggestCrmMatches(local.id, "u1")).status).toBe("not_connected");
  });

  it("refuses a dismissal of an id that isn't this CRM's", async () => {
    const local = await storage.createCustomer({ accountName: `${MARKER} Local` } as never);
    expect(await dismissCrmMatch(local.id, "001000000000001AAA", "u1")).toBe("invalid_id");
  });
});
