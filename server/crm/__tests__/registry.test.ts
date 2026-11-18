// @vitest-environment node
//
// The provider registry, the per-CRM route guard and the CRM-neutral routes.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "http";

const settingMock = vi.hoisted(() => ({ getCrmProviderId: vi.fn(), isCrmProviderActive: vi.fn() }));
const sfMock = vi.hoisted(() => ({
  id: "salesforce" as const,
  isRecordId: (id: string) => /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(id),
  connectForUser: vi.fn(),
}));
const hsMock = vi.hoisted(() => ({
  id: "hubspot" as const,
  isRecordId: (id: string) => /^\d{1,20}$/.test(id),
  connectForUser: vi.fn(),
}));
vi.mock("../provider-setting", () => settingMock);
vi.mock("../salesforce-provider", () => ({ salesforceProvider: sfMock }));
vi.mock("../hubspot-provider", () => ({ hubspotProvider: hsMock }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (req: any, res: any, next: any) => (req.session?.user ? next() : res.status(401).json({})),
}));

import { getActiveCrmProvider, requireCrmProvider } from "..";
import { registerCrmRoutes } from "../../routes/crm-routes";

const OPP = "006A0000006Vm9rIAC";
const session = {
  opportunitiesForAccount: vi.fn(),
  opportunitiesForAccountId: vi.fn(),
  validationRecordsForOpportunity: vi.fn(),
  searchAccounts: vi.fn(),
};
let role = "Engineer";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use((req: any, _res, next) => {
    req.session = { user: { id: "u1", role } };
    next();
  });
  app.get("/guarded", requireCrmProvider("salesforce"), (_req, res) => {
    res.json({ ok: true });
  });
  registerCrmRoutes(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  role = "Engineer";
  settingMock.getCrmProviderId.mockResolvedValue("salesforce");
  sfMock.connectForUser.mockResolvedValue(session);
  hsMock.connectForUser.mockResolvedValue(session);
  session.searchAccounts.mockResolvedValue([{ id: "001A", name: "Acme", url: "https://x.my.salesforce.com/001A" }]);
  session.opportunitiesForAccount.mockResolvedValue([{ id: OPP, name: "Deal" }]);
  session.opportunitiesForAccountId.mockResolvedValue([{ id: OPP, name: "Linked deal" }]);
  session.validationRecordsForOpportunity.mockResolvedValue([{ id: "a0B", name: "POC", url: null }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("getActiveCrmProvider", () => {
  it("returns Salesforce when it is the chosen CRM", async () => {
    expect((await getActiveCrmProvider())?.id).toBe("salesforce");
  });

  it("returns HubSpot when it is the chosen CRM", async () => {
    settingMock.getCrmProviderId.mockResolvedValue("hubspot");
    expect((await getActiveCrmProvider())?.id).toBe("hubspot");
  });

  it("returns null for none", async () => {
    settingMock.getCrmProviderId.mockResolvedValue("none");
    expect(await getActiveCrmProvider()).toBeNull();
  });
});

describe("requireCrmProvider", () => {
  it("lets the request through when the CRM matches", async () => {
    const res = await fetch(`${base}/guarded`);
    expect(res.status).toBe(200);
  });

  it("answers 409 when the install uses another CRM or none", async () => {
    for (const other of ["hubspot", "none"]) {
      settingMock.getCrmProviderId.mockResolvedValue(other);
      const res = await fetch(`${base}/guarded`);
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ errorCode: "crm_provider_mismatch", required: "salesforce" });
    }
  });
});

describe("CRM-neutral routes", () => {
  it("lists opportunities through the active provider", async () => {
    const res = await fetch(`${base}/api/crm/opportunities/by-account?accountName=Acme`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ provider: "salesforce", opportunities: [{ id: OPP, name: "Deal" }] });
    expect(session.opportunitiesForAccount).toHaveBeenCalledWith("Acme");
  });

  it("lists a linked account's opportunities by its CRM id", async () => {
    const res = await fetch(`${base}/api/crm/opportunities/by-account?crmAccountId=001A000001ABCDEFGH&accountName=Acme`);
    expect(res.status).toBe(200);
    expect((await res.json()).opportunities).toEqual([{ id: OPP, name: "Linked deal" }]);
    expect(session.opportunitiesForAccountId).toHaveBeenCalledWith("001A000001ABCDEFGH");
    expect(session.opportunitiesForAccount).not.toHaveBeenCalled();
  });

  it("refuses a CRM account id that isn't the active CRM's shape before connecting", async () => {
    const res = await fetch(`${base}/api/crm/opportunities/by-account?crmAccountId=${encodeURIComponent("x' OR Name != ''")}`);
    expect(res.status).toBe(400);
    expect(sfMock.connectForUser).not.toHaveBeenCalled();
  });

  it("lists validation records for an opportunity", async () => {
    const res = await fetch(`${base}/api/crm/validation-records/by-opportunity?opportunityId=${OPP}`);
    expect(await res.json()).toEqual({ provider: "salesforce", records: [{ id: "a0B", name: "POC", url: null }] });
  });

  it("refuses an id that isn't the active CRM's shape before connecting", async () => {
    const res = await fetch(`${base}/api/crm/validation-records/by-opportunity?opportunityId=nope'`);
    expect(res.status).toBe(400);
    expect(sfMock.connectForUser).not.toHaveBeenCalled();
  });

  it("answers 409 with no active CRM", async () => {
    settingMock.getCrmProviderId.mockResolvedValue("none");
    const res = await fetch(`${base}/api/crm/opportunities/by-account?accountName=Acme`);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ errorCode: "crm_not_active" });
  });

  it("answers 401 when the user hasn't connected the CRM", async () => {
    sfMock.connectForUser.mockResolvedValue(null);
    const res = await fetch(`${base}/api/crm/opportunities/by-account?accountName=Acme`);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ errorCode: "crm_not_connected", provider: "salesforce" });
  });

  it("requires the query parameter", async () => {
    const res = await fetch(`${base}/api/crm/opportunities/by-account`);
    expect(res.status).toBe(400);
  });
});

describe("CRM status", () => {
  it("reports the CRM and whether the user can query it", async () => {
    expect(await (await fetch(`${base}/api/crm/status`)).json()).toEqual({ provider: "salesforce", connected: true });
    sfMock.connectForUser.mockResolvedValue(null);
    expect(await (await fetch(`${base}/api/crm/status`)).json()).toEqual({ provider: "salesforce", connected: false });
  });

  it("reports none with no CRM", async () => {
    settingMock.getCrmProviderId.mockResolvedValue("none");
    expect(await (await fetch(`${base}/api/crm/status`)).json()).toEqual({ provider: "none", connected: false });
  });

  it("never reports an outside user as connected", async () => {
    role = "Customer";
    expect(await (await fetch(`${base}/api/crm/status`)).json()).toEqual({ provider: "salesforce", connected: false });
    expect(sfMock.connectForUser).not.toHaveBeenCalled();
  });
});

describe("outside users", () => {
  it("are refused the CRM queries", async () => {
    role = "Partner";
    const res = await fetch(`${base}/api/crm/opportunities/by-account?accountName=Acme`);
    expect(res.status).toBe(403);
    expect(session.opportunitiesForAccount).not.toHaveBeenCalled();
  });
});

describe("account search", () => {
  it("searches the active CRM", async () => {
    settingMock.getCrmProviderId.mockResolvedValue("hubspot");
    const res = await fetch(`${base}/api/crm/accounts/search?q=Acme`);
    expect(res.status).toBe(200);
    expect((await res.json()).provider).toBe("hubspot");
    expect(session.searchAccounts).toHaveBeenCalledWith("Acme");
  });

  it("needs 2 to 100 characters", async () => {
    expect((await fetch(`${base}/api/crm/accounts/search?q=A`)).status).toBe(400);
    expect((await fetch(`${base}/api/crm/accounts/search?q=${"a".repeat(101)}`)).status).toBe(400);
  });
});
