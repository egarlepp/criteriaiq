// @vitest-environment node
//
// A linked account's CRM-owned fields are read-only: a save keeps the stored
// name (always) and whatever the CRM filled, while the link stays the same.
// Linking pulls the CRM fields at once; unlinking (Admin only) keeps the
// values and makes them editable again. Refresh and preview answer with
// the account or a clear refusal.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const SF_URL = "https://acme.lightning.force.com/lightning/r/Account/001000000000001AAA/view";
const SF_ID = "001000000000001AAA";
const OTHER_URL = "https://acme.lightning.force.com/lightning/r/Account/001000000000002AAA/view";

const state = vi.hoisted(() => ({
  user: { id: "u1", role: "Engineer", email: "e@example.com" } as Record<string, string>,
  crm: "salesforce",
  customer: null as Record<string, unknown> | null,
  refresh: { status: "not_connected" } as Record<string, unknown>,
}));

const storageMock = vi.hoisted(() => ({
  getUserPermissions: vi.fn(async () => [{ section: "project.customers", permission: "edit" }]),
  getCustomer: vi.fn(async () => state.customer),
  createCustomer: vi.fn(async (data: Record<string, unknown>) => ({ id: 9, ...data })),
  updateCustomer: vi.fn(async (_id: number, data: Record<string, unknown>) => ({ id: 5, ...data })),
  findCustomerByCrmAccount: vi.fn(async () => undefined),
  getAllowedDomainsByAccountId: vi.fn(async () => []),
  getAllowedDomainByDomain: vi.fn(async () => undefined),
  createAllowedDomain: vi.fn(async () => undefined),
  updateAllowedDomain: vi.fn(async () => undefined),
  deleteAllowedDomain: vi.fn(async () => undefined),
}));

const refreshMock = vi.hoisted(() => vi.fn(async () => state.refresh));
const previewMock = vi.hoisted(() => vi.fn());
const suggestMock = vi.hoisted(() => vi.fn());
const dismissMock = vi.hoisted(() => vi.fn());
const resolveMock = vi.hoisted(() => vi.fn());

vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../db", () => ({ db: {} }));
vi.mock("../../auth/simpleAuth", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../crm/provider-setting", () => ({ getCrmProviderId: async () => state.crm }));
vi.mock("../../crm/account-refresh", () => ({ refreshAccountFromCrm: refreshMock, previewCrmLink: previewMock }));
vi.mock("../../crm/account-suggestions", () => ({ suggestCrmMatches: suggestMock, dismissCrmMatch: dismissMock }));
vi.mock("../../crm/account-resolve", () => ({ resolveCrmAccount: resolveMock }));
vi.mock("../../lib/customer-logo", () => ({ withFreshLogo: async (c: unknown) => c }));
vi.mock("../../salesforce/index.js", () => ({ salesforceSyncService: { queueOutboundSyncIfLinked: async () => undefined } }));

const { registerCustomersRoutes } = await import("../customers-routes");
const { registerAccountCrmRoutes } = await import("../account-crm-routes");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { session: { user: state.user } });
    next();
  });
  registerAccountCrmRoutes(app);
  registerCustomersRoutes(app);
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const LINKED = {
  id: 5,
  accountName: "Acme Corp",
  industryId: 3,
  region: "Europe",
  accountRepresentativeId: "rep-crm",
  salesforceAccountUrl: SF_URL,
  crmProvider: "salesforce",
  crmAccountId: SF_ID,
  crmManagedFields: ["accountName", "industryId", "region"],
  contactUsers: [],
};

const FORM = {
  accountName: "Typed name",
  industryId: "8",
  region: "Asia Pacific",
  accountRepresentativeId: "rep-typed",
  accountEngineerId: "eng",
  productInterests: JSON.stringify(["Product"]),
  contactUsers: JSON.stringify([]),
};

beforeEach(() => {
  state.user = { id: "u1", role: "Engineer", email: "e@example.com" };
  state.crm = "salesforce";
  state.customer = { ...LINKED };
  state.refresh = { status: "not_connected" };
  vi.clearAllMocks();
});

function send(method: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function savedUpdate(): Record<string, unknown> {
  const call = storageMock.updateCustomer.mock.calls[0] as unknown as [number, Record<string, unknown>] | undefined;
  if (!call) throw new Error("updateCustomer was not called");
  return call[1];
}

describe("saving a linked account", () => {
  it("keeps the CRM-managed fields and saves the rest", async () => {
    const res = await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: SF_URL });
    expect(res.status).toBe(200);
    const data = savedUpdate();
    expect(data.accountName).toBe("Acme Corp");
    expect(data.industryId).toBe(3);
    expect(data.region).toBe("Europe");
    // Not filled by the CRM, so still editable.
    expect(data.accountRepresentativeId).toBe("rep-typed");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("locks the name even before the CRM has filled anything", async () => {
    state.customer = { ...LINKED, crmManagedFields: null };
    await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: SF_URL });
    const data = savedUpdate();
    expect(data.accountName).toBe("Acme Corp");
    expect(data.region).toBe("Asia Pacific");
  });

  it("locks nothing when no CRM is active", async () => {
    state.crm = "none";
    await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: SF_URL });
    expect(savedUpdate().accountName).toBe("Typed name");
  });

  it("refuses an unlink by a non-Admin", async () => {
    const res = await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: "" });
    expect(res.status).toBe(403);
    expect(storageMock.updateCustomer).not.toHaveBeenCalled();
  });

  it("lets an Admin unlink with a reason: values stay, become editable", async () => {
    state.user = { ...state.user, id: "a1", role: "Admin" };
    const res = await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: "", crmLinkExceptionReason: "Wrong account" });
    expect(res.status).toBe(200);
    const data = savedUpdate();
    expect(data.accountName).toBe("Typed name");
    expect(data.crmManagedFields).toBeNull();
    expect(data.crmLinkedBy).toBeNull();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("pulls the CRM fields when the link changes, as the linking user", async () => {
    state.refresh = { status: "refreshed", customer: { id: 5, accountName: "Other Co" } };
    const res = await send("PUT", "/api/customers/5", { ...FORM, salesforceAccountUrl: OTHER_URL });
    expect(res.status).toBe(200);
    expect(savedUpdate().crmLinkedBy).toBe("u1");
    expect(refreshMock).toHaveBeenCalledWith(5, "u1");
    expect((await res.json()).accountName).toBe("Other Co");
  });
});

describe("creating a linked account", () => {
  it("pulls the CRM fields straight away", async () => {
    state.customer = null;
    state.refresh = { status: "refreshed", customer: { id: 9, accountName: "Acme Corp" } };
    const res = await send("POST", "/api/customers", { ...FORM, salesforceAccountUrl: SF_URL });
    expect(res.status).toBe(201);
    expect(storageMock.createCustomer).toHaveBeenCalledWith(expect.objectContaining({ crmLinkedBy: "u1" }));
    expect(refreshMock).toHaveBeenCalledWith(9, "u1");
    expect((await res.json()).accountName).toBe("Acme Corp");
  });

  it("still saves when the user can't reach the CRM", async () => {
    state.customer = null;
    const res = await send("POST", "/api/customers", { ...FORM, salesforceAccountUrl: SF_URL });
    expect(res.status).toBe(201);
    expect((await res.json()).accountName).toBe("Typed name");
  });
});

describe("refresh and preview", () => {
  it("answers a refresh with the account", async () => {
    state.refresh = { status: "refreshed", customer: { id: 5, accountName: "Acme Corp" } };
    const res = await send("POST", "/api/customers/5/crm-refresh", { ifOlderThanHours: 24 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "refreshed", customer: { id: 5, accountName: "Acme Corp" } });
    expect(refreshMock).toHaveBeenCalledWith(5, "u1", { ifOlderThanMs: 24 * 60 * 60 * 1000 });
  });

  it("says when the user isn't connected", async () => {
    const res = await send("POST", "/api/customers/5/crm-refresh", {});
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe("not_connected");
  });

  it("refuses a bad id", async () => {
    const res = await send("POST", "/api/customers/abc/crm-refresh", {});
    expect(res.status).toBe(400);
  });

  it("passes the preview through, and its refusals", async () => {
    previewMock.mockResolvedValueOnce({ ok: true, name: "Acme Corp", changes: [] });
    const ok = await send("POST", "/api/customers/crm-link-preview", { url: SF_URL, customerId: 5 });
    expect(ok.status).toBe(200);
    expect(previewMock).toHaveBeenCalledWith("u1", SF_URL, 5);

    previewMock.mockResolvedValueOnce({ ok: false, status: 404, errorCode: "crm_record_missing", message: "gone" });
    const missing = await send("POST", "/api/customers/crm-link-preview", { url: SF_URL });
    expect(missing.status).toBe(404);
    expect((await missing.json()).errorCode).toBe("crm_record_missing");
  });

  it("refuses outside users", async () => {
    state.user = { id: "c1", role: "Customer", email: "c@customer.com" };
    const res = await send("POST", "/api/customers/crm-link-preview", { url: SF_URL });
    expect(res.status).toBe(403);
  });
});

describe("suggested CRM matches", () => {
  it("returns the suggestions", async () => {
    suggestMock.mockResolvedValueOnce({ status: "ok", suggestions: [{ id: "x", name: "Acme", strength: "likely" }] });
    const res = await fetch(`${baseUrl}/api/customers/5/crm-suggestions`);
    expect(res.status).toBe(200);
    expect((await res.json()).suggestions).toHaveLength(1);
    expect(suggestMock).toHaveBeenCalledWith(5, "u1");
  });

  it("answers an empty list when there is nothing to suggest", async () => {
    suggestMock.mockResolvedValueOnce({ status: "not_connected" });
    const res = await fetch(`${baseUrl}/api/customers/5/crm-suggestions`);
    expect(await res.json()).toEqual({ status: "not_connected", suggestions: [] });
  });

  it("dismisses with Account Management edit only", async () => {
    dismissMock.mockResolvedValueOnce("dismissed");
    const ok = await send("POST", "/api/customers/5/crm-suggestions/dismiss", { crmAccountId: SF_ID });
    expect(ok.status).toBe(204);
    expect(dismissMock).toHaveBeenCalledWith(5, SF_ID, "u1");

    storageMock.getUserPermissions.mockResolvedValueOnce([{ section: "project.customers", permission: "view" }]);
    const denied = await send("POST", "/api/customers/5/crm-suggestions/dismiss", { crmAccountId: SF_ID });
    expect(denied.status).toBe(403);
  });

  it("refuses a dismissal without an id", async () => {
    const res = await send("POST", "/api/customers/5/crm-suggestions/dismiss", {});
    expect(res.status).toBe(400);
    expect(dismissMock).not.toHaveBeenCalled();
  });
});

describe("resolving a CRM account picked on Create Project", () => {
  it("answers with the linked account", async () => {
    resolveMock.mockResolvedValueOnce({ ok: true, status: "linked", customer: { id: 5, accountName: "Acme Corp" } });
    const res = await send("POST", "/api/crm/accounts/resolve", { url: SF_URL });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "linked", customer: { id: 5, accountName: "Acme Corp" } });
    expect(resolveMock).toHaveBeenCalledWith("u1", SF_URL);
  });

  it("passes refusals through with their code", async () => {
    resolveMock.mockResolvedValueOnce({ ok: false, status: 401, errorCode: "crm_not_connected", message: "CRM not connected" });
    const res = await send("POST", "/api/crm/accounts/resolve", { url: SF_URL });
    expect(res.status).toBe(401);
    expect((await res.json()).errorCode).toBe("crm_not_connected");
  });

  it("needs a link, and refuses outside users", async () => {
    const empty = await send("POST", "/api/crm/accounts/resolve", {});
    expect(empty.status).toBe(400);
    state.user = { id: "c1", role: "Customer", email: "c@customer.com" };
    const outside = await send("POST", "/api/crm/accounts/resolve", { url: SF_URL });
    expect(outside.status).toBe(403);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
