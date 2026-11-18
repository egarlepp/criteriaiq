// @vitest-environment node
//
// With a CRM active an account must be linked; only an Admin may save one
// unlinked, with a reason, and only an Admin may remove a link. A CRM
// account already linked to another account is refused with that account's
// name. Anyone internal can ask the Admins for an exception.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const SF_URL = "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer", email: "e@example.com", firstName: "Eve", lastName: "Engineer" } as Record<string, string>,
  crm: "salesforce",
  customer: null as Record<string, unknown> | null,
  holder: undefined as { id: number; accountName: string } | undefined,
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => [{ section: "project.customers", permission: "edit" }]),
  getCustomer: vi.fn(async () => state.customer),
  createCustomer: vi.fn(async (data: Record<string, unknown>) => ({ id: 9, ...data })),
  updateCustomer: vi.fn(async (_id: number, data: Record<string, unknown>) => ({ id: 5, ...data })),
  findCustomerByCrmAccount: vi.fn(async () => state.holder),
  getAllowedDomainsByAccountId: vi.fn(async () => []),
  getAllowedDomainByDomain: vi.fn(async () => undefined),
  createAllowedDomain: vi.fn(async () => undefined),
  updateAllowedDomain: vi.fn(async () => undefined),
  deleteAllowedDomain: vi.fn(async () => undefined),
  getUsersByRoleName: vi.fn(async () => [{ id: "admin1" }, { id: "admin2" }]),
}));

const notifyMock = vi.hoisted(() => vi.fn(async () => 2));

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../crm/provider-setting", () => ({ getCrmProviderId: async () => state.crm }));
vi.mock("../../services/notifications", () => ({ notifyAccountLinkExceptionRequested: notifyMock }));
vi.mock("../../salesforce/index.js", () => ({ salesforceSyncService: { queueOutboundSyncIfLinked: async () => undefined } }));

const { registerCustomersRoutes } = await import("../customers-routes");
const { registerAccountLinkExceptionRoutes } = await import("../account-link-exception-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerAccountLinkExceptionRoutes(app);
  registerCustomersRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer", email: "e@example.com", firstName: "Eve", lastName: "Engineer" };
  state.crm = "salesforce";
  state.customer = { id: 5, accountName: "Acme", salesforceAccountUrl: SF_URL, contactUsers: [] };
  state.holder = undefined;
  vi.clearAllMocks();
});

const NEW_ACCOUNT = {
  accountName: "Globex",
  industryId: "1",
  region: "Europe",
  accountRepresentativeId: "rep",
  accountEngineerId: "eng",
  productInterests: JSON.stringify(["Product"]),
  contactUsers: JSON.stringify([]),
};

function send(method: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("create account with a CRM active", () => {
  it("refuses a non-Admin without a link", async () => {
    const res = await send("POST", "/api/customers", NEW_ACCOUNT);
    expect(res.status).toBe(403);
    expect((await res.json()).errorCode).toBe("crm_link_required");
    expect(storageMock.createCustomer).not.toHaveBeenCalled();
  });

  it("refuses an Admin without a reason, then saves the exception with one", async () => {
    state.user = { ...state.user, id: "a1", role: "Admin" };
    const noReason = await send("POST", "/api/customers", NEW_ACCOUNT);
    expect(noReason.status).toBe(400);
    expect((await noReason.json()).errorCode).toBe("crm_link_reason_required");

    const res = await send("POST", "/api/customers", { ...NEW_ACCOUNT, crmLinkExceptionReason: "Not in Salesforce" });
    expect(res.status).toBe(201);
    expect(storageMock.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ crmLinkExceptionReason: "Not in Salesforce", crmLinkExceptionBy: "a1" }),
    );
  });

  it("refuses a CRM account another account already holds, naming it", async () => {
    state.holder = { id: 3, accountName: "Acme" };
    const res = await send("POST", "/api/customers", { ...NEW_ACCOUNT, salesforceAccountUrl: SF_URL });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.errorCode).toBe("crm_account_already_linked");
    expect(body.existingAccount).toEqual({ id: 3, accountName: "Acme" });
  });

  it("needs no link with no CRM", async () => {
    state.crm = "none";
    const res = await send("POST", "/api/customers", NEW_ACCOUNT);
    expect(res.status).toBe(201);
  });
});

describe("update account with a CRM active", () => {
  it("makes removing a link Admin-only", async () => {
    const res = await send("PUT", "/api/customers/5", { ...NEW_ACCOUNT, salesforceAccountUrl: "" });
    expect(res.status).toBe(403);
    expect(storageMock.updateCustomer).not.toHaveBeenCalled();

    state.user = { ...state.user, id: "a1", role: "Admin" };
    const ok = await send("PUT", "/api/customers/5", { ...NEW_ACCOUNT, salesforceAccountUrl: "", crmLinkExceptionReason: "Merged away" });
    expect(ok.status).toBe(200);
  });

  it("keeps an account saved unlinked before the rule editable", async () => {
    state.customer = { id: 5, accountName: "Legacy", salesforceAccountUrl: null, contactUsers: [] };
    const res = await send("PUT", "/api/customers/5", { ...NEW_ACCOUNT, salesforceAccountUrl: "" });
    expect(res.status).toBe(200);
  });

  it("clears a stored exception once the account is linked", async () => {
    state.customer = { id: 5, accountName: "Legacy", salesforceAccountUrl: null, contactUsers: [] };
    const res = await send("PUT", "/api/customers/5", { ...NEW_ACCOUNT, salesforceAccountUrl: SF_URL });
    expect(res.status).toBe(200);
    expect(storageMock.updateCustomer).toHaveBeenCalledWith(5, expect.objectContaining({ crmLinkExceptionReason: null }));
  });
});

describe("exception requests", () => {
  it("notifies the Admins", async () => {
    const res = await send("POST", "/api/customers/crm-link-exception-requests", { accountName: "Globex", reason: "Not in CRM" });
    expect(res.status).toBe(202);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ adminIds: ["admin1", "admin2"], accountName: "Globex", reason: "Not in CRM", requesterName: "Eve Engineer" }),
    );
  });

  it("needs a name and a reason, and a CRM", async () => {
    expect((await send("POST", "/api/customers/crm-link-exception-requests", { accountName: "Globex" })).status).toBe(400);
    state.crm = "none";
    expect((await send("POST", "/api/customers/crm-link-exception-requests", { accountName: "G", reason: "r" })).status).toBe(409);
  });
});
