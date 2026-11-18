// @vitest-environment node
//
// The HubSpot CRM provider: who may use the portal token, record links, and
// how Companies and Deals map onto the CRM-neutral shapes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: { accessToken: "t", portalId: "123", uiDomain: "app-eu1.hubspot.com" } as Record<string, unknown> | null,
  user: { id: "u1", role: "Engineer", isActive: true } as Record<string, unknown> | undefined,
  ownerId: "77" as string | null,
  hubspotJson: vi.fn(),
  validation: { hubspot: { objectType: null as string | null } },
}));

vi.mock("../../hubspot/config", () => ({ getHubspotConfig: vi.fn(async () => mocks.config) }));
vi.mock("../../hubspot/client", () => ({ hubspotJson: mocks.hubspotJson }));
vi.mock("../../lib/crm-validation-record-settings", () => ({
  getValidationRecordSettings: vi.fn(async () => mocks.validation),
}));
vi.mock("../../storage", () => ({
  storage: {
    getUser: vi.fn(async () => mocks.user),
    getHubspotOwnerIdForUser: vi.fn(async () => mocks.ownerId),
    getHubspotOwnersByIds: vi.fn(async () => [{ id: "77", firstName: "Ada", lastName: "Lovelace", email: "ada@x.test" }]),
  },
}));

import {
  clearHubspotProviderCaches,
  hubspotProvider,
  hubspotRecordUrl,
  hubspotSearchToken,
  hubspotUiHost,
  isHubspotRecordId,
} from "../hubspot-provider";

beforeEach(() => {
  mocks.config = { accessToken: "t", portalId: "123", uiDomain: "app-eu1.hubspot.com" };
  mocks.user = { id: "u1", role: "Engineer", isActive: true };
  mocks.ownerId = "77";
  mocks.validation = { hubspot: { objectType: null } };
  clearHubspotProviderCaches();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("helpers", () => {
  it("recognises HubSpot record ids", () => {
    expect(isHubspotRecordId("12345")).toBe(true);
    expect(isHubspotRecordId("006A0000004kzLq")).toBe(false);
    expect(isHubspotRecordId("1'2")).toBe(false);
  });

  it("only trusts a hubspot.com UI host", () => {
    expect(hubspotUiHost("app-eu1.hubspot.com")).toBe("app-eu1.hubspot.com");
    expect(hubspotUiHost("evil.example.com")).toBe("app.hubspot.com");
    expect(hubspotUiHost(null)).toBe("app.hubspot.com");
  });

  it("builds record URLs only from well-formed parts", () => {
    expect(hubspotRecordUrl({ portalId: "123", uiDomain: null }, "0-2", "9")).toBe(
      "https://app.hubspot.com/contacts/123/record/0-2/9",
    );
    expect(hubspotRecordUrl({ portalId: null, uiDomain: null }, "0-2", "9")).toBeNull();
    expect(hubspotRecordUrl({ portalId: "123", uiDomain: null }, "0-2", "abc")).toBeNull();
  });

  it("strips search operators from the term", () => {
    expect(hubspotSearchToken('Acme "*Corp')).toBe("*Acme Corp*");
    expect(hubspotSearchToken('**""')).toBeNull();
  });
});

describe("connectForUser", () => {
  it("connects an active internal user matched to an owner", async () => {
    expect(await hubspotProvider.connectForUser("u1")).not.toBeNull();
  });

  it("refuses with no connection saved", async () => {
    mocks.config = null;
    expect(await hubspotProvider.connectForUser("u1")).toBeNull();
  });

  it("refuses outside users, inactive users and users with no owner match", async () => {
    mocks.user = { id: "u1", role: "Customer", isActive: true };
    expect(await hubspotProvider.connectForUser("u1")).toBeNull();
    mocks.user = { id: "u1", role: "Engineer", isActive: false };
    expect(await hubspotProvider.connectForUser("u1")).toBeNull();
    mocks.user = { id: "u1", role: "Engineer", isActive: true };
    mocks.ownerId = null;
    expect(await hubspotProvider.connectForUser("u1")).toBeNull();
  });
});

describe("the session", () => {
  it("maps a company's deals onto opportunities, newest first", async () => {
    mocks.hubspotJson.mockImplementation(async (path: string) => {
      if (path === "/crm/v3/objects/companies/search") return { results: [{ id: "10", properties: { name: "Acme" } }] };
      if (path.startsWith("/crm/v4/associations/companies/deals")) {
        return { results: [{ from: { id: "10" }, to: [{ toObjectId: 501 }, { toObjectId: 502 }] }] };
      }
      if (path === "/crm/v3/objects/deals/batch/read") {
        return {
          results: [
            { id: "501", properties: { dealname: "Old", dealstage: "s1", hs_lastmodifieddate: "2026-01-01" } },
            {
              id: "502",
              properties: {
                dealname: "New",
                amount: "1200.5",
                closedate: "2026-12-01T00:00:00Z",
                dealstage: "s2",
                hubspot_owner_id: "77",
                hs_lastmodifieddate: "2026-10-01",
              },
            },
          ],
        };
      }
      if (path === "/crm/v3/pipelines/deals") return { results: [{ stages: [{ id: "s2", label: "Proposal" }] }] };
      throw new Error(`unexpected ${path}`);
    });
    const session = await hubspotProvider.connectForUser("u1");
    const deals = await session!.opportunitiesForAccount("Acme");
    expect(deals.map((d) => d.id)).toEqual(["502", "501"]);
    expect(deals[0]).toMatchObject({
      name: "New",
      accountId: "10",
      accountName: "Acme",
      ownerName: "Ada Lovelace",
      stageName: "Proposal",
      amount: 1200.5,
      closeDate: "2026-12-01",
    });
    expect(deals[1].stageName).toBe("s1");
  });

  it("returns no validation records until an object type is chosen", async () => {
    const session = await hubspotProvider.connectForUser("u1");
    expect(await session!.validationRecordsForOpportunity("502")).toEqual([]);
    expect(mocks.hubspotJson).not.toHaveBeenCalled();
  });

  it("refuses a deal id that isn't HubSpot's", async () => {
    const session = await hubspotProvider.connectForUser("u1");
    await expect(session!.validationRecordsForOpportunity("006A0000004kzLq")).rejects.toThrow();
  });

  it("links searched companies to their HubSpot pages", async () => {
    mocks.hubspotJson.mockResolvedValue({ results: [{ id: "10", properties: { name: "Acme" } }] });
    const session = await hubspotProvider.connectForUser("u1");
    expect(await session!.searchAccounts("Ac")).toEqual([
      { id: "10", name: "Acme", url: "https://app-eu1.hubspot.com/contacts/123/record/0-2/10" },
    ]);
  });
});
