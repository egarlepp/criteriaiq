// @vitest-environment node
//
// Picking a CRM account on Create Project, against the real Postgres in
// DATABASE_URL (skips without one). The CRM is a fake session. Covers: an
// account already linked is returned as is; otherwise the CRM's values come
// back with CriteriaIQ look-alikes, leaving out linked, internal and
// dismissed accounts.

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
            readAccounts: async (ids: string[]) => ({
              found: crm.accounts
                .filter((a) => ids.includes(a.id))
                .map((a) => ({ id: a.id, name: a.name, website: a.website, industry: null, country: null, ownerEmail: null })),
              missing: ids.filter((id) => !crm.accounts.some((a) => a.id === id)),
            }),
          }
        : null,
  }),
}));

import { db } from "../db";
import { storage } from "../storage";
import { customers } from "@shared/schema";
import { resolveCrmAccount } from "../crm/account-resolve";

const MARKER = "ACR-TEST";
const url = (id: string) => `https://app.hubspot.com/contacts/1/record/0-2/${id}`;

async function cleanup(): Promise<void> {
  if (!db) return;
  await db.delete(customers).where(sql`${customers.accountName} LIKE ${MARKER + "%"}`);
}

describe.skipIf(!process.env.DATABASE_URL)("resolving a picked CRM account", () => {
  beforeAll(cleanup);
  afterEach(async () => {
    crm.accounts = [];
    crm.connected = true;
    await cleanup();
  });
  afterAll(cleanup);

  it("returns the account already linked to it, without asking the CRM", async () => {
    crm.connected = false;
    const linked = await storage.createCustomer({ accountName: `${MARKER} Linked`, salesforceAccountUrl: url("810001") } as never);
    const result = await resolveCrmAccount("u1", url("810001"));
    expect(result).toEqual({ ok: true, status: "linked", customer: { id: linked.id, accountName: `${MARKER} Linked` } });
  });

  it("returns the CRM values and look-alikes, strongest first", async () => {
    crm.accounts = [{ id: "810002", name: `${MARKER} Initech`, website: "https://initech-test.io" }];
    const byDomain = await storage.createCustomer({ accountName: `${MARKER} Something Else`, approvedEmailDomains: ["initech-test.io"] } as never);
    const byName = await storage.createCustomer({ accountName: `${MARKER} Initech, Inc.` } as never);
    // Left out: linked to another CRM account, the internal account, a dismissed pair.
    await storage.createCustomer({ accountName: `${MARKER} Initech LLC`, salesforceAccountUrl: url("810099") } as never);
    await storage.createCustomer({ accountName: `${MARKER} Initech Ltd`, isInternal: true } as never);
    const dismissed = await storage.createCustomer({ accountName: `${MARKER} Initech GmbH` } as never);
    await storage.addCrmDismissal(dismissed.id, "hubspot", "810002", "u1");

    const result = await resolveCrmAccount("u1", url("810002"));
    expect(result.ok && result.status).toBe("new");
    if (!result.ok || result.status !== "new") return;
    expect(result.name).toBe(`${MARKER} Initech`);
    expect(result.crmAccountId).toBe("810002");
    expect(result.url).toBe(url("810002"));
    expect(result.values.accountName).toBe(`${MARKER} Initech`);
    expect(result.lookalikes.map((l) => [l.id, l.strength])).toEqual([
      [byDomain.id, "strong"],
      [byName.id, "likely"],
    ]);
  });

  it("refuses a record the CRM doesn't have, a foreign link, and a user who isn't connected", async () => {
    expect(await resolveCrmAccount("u1", url("810003"))).toMatchObject({ ok: false, status: 404, errorCode: "crm_record_missing" });
    expect(await resolveCrmAccount("u1", "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view")).toMatchObject({
      ok: false,
      status: 400,
      errorCode: "crm_link_invalid",
    });
    crm.connected = false;
    expect(await resolveCrmAccount("u1", url("810004"))).toMatchObject({ ok: false, status: 401, errorCode: "crm_not_connected" });
  });
});
