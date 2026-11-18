// @vitest-environment node
//
// GET /api/crm/me: each user's own link to the install's CRM (Profile Settings
// › Integrations and the sidebar icon), and the Salesforce token health check
// behind it.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sfConfigMock = vi.hoisted(() => ({
  isOAuthConfigured: vi.fn(),
  getUserConnectionRecord: vi.fn(),
}));
vi.mock("../../salesforce/salesforce-config-service", () => ({
  salesforceConfigService: sfConfigMock,
  getSalesforceConnectionForUser: vi.fn(),
}));

import { buildMyCrmConnection, type MyCrmConnectionDeps } from "../my-connection";
import {
  clearSalesforceUserCheck,
  getSalesforceUserConnection,
  isRevokedTokenError,
} from "../../salesforce/salesforce-user-connection";
import { isCrmConnectionReady, type MyCrmConnection } from "@shared/my-connections";

const sfConnected = { configured: true, connected: true, healthy: true, accountLabel: "sam@acme.com", connectedAt: null };
const owner = { id: "77", name: "Sam Lee", email: "sam@acme.com" };

function deps(provider: "salesforce" | "hubspot" | "none", overrides: Partial<MyCrmConnectionDeps> = {}): MyCrmConnectionDeps {
  return {
    providerId: async () => provider,
    salesforce: vi.fn(async () => sfConnected),
    hubspotConfig: vi.fn(async () => ({ portalName: "Acme" })),
    hubspotOwner: vi.fn(async () => owner),
    ...overrides,
  };
}

describe("buildMyCrmConnection", () => {
  it("returns no CRM block for outside users, without checking the CRM", async () => {
    const d = deps("salesforce");
    const me = await buildMyCrmConnection({ id: "u1", role: "Customer" }, d);
    expect(me).toEqual({ provider: "salesforce", external: true, salesforce: null, hubspot: null });
    expect(d.salesforce).not.toHaveBeenCalled();
  });

  it("returns nothing to connect when no CRM is chosen", async () => {
    const me = await buildMyCrmConnection({ id: "u1", role: "Admin" }, deps("none"));
    expect(me.salesforce).toBeNull();
    expect(me.hubspot).toBeNull();
    expect(isCrmConnectionReady(me)).toBeNull();
  });

  it("fills only the Salesforce block on a Salesforce install", async () => {
    const d = deps("salesforce");
    const me = await buildMyCrmConnection({ id: "u1", role: "Admin" }, d);
    expect(me.salesforce).toEqual(sfConnected);
    expect(me.hubspot).toBeNull();
    expect(d.hubspotOwner).not.toHaveBeenCalled();
  });

  it("matches the HubSpot owner on a HubSpot install", async () => {
    const me = await buildMyCrmConnection({ id: "u1", role: "Admin" }, deps("hubspot"));
    expect(me.hubspot).toEqual({ configured: true, portalName: "Acme", owner });
    expect(isCrmConnectionReady(me)).toBe(true);
  });

  it("skips the owner lookup when HubSpot has no key saved", async () => {
    const d = deps("hubspot", { hubspotConfig: vi.fn(async () => null) });
    const me = await buildMyCrmConnection({ id: "u1", role: "Admin" }, d);
    expect(me.hubspot).toEqual({ configured: false, portalName: null, owner: null });
    expect(d.hubspotOwner).not.toHaveBeenCalled();
    expect(isCrmConnectionReady(me)).toBe(false);
  });
});

describe("isCrmConnectionReady", () => {
  const base: MyCrmConnection = { provider: "salesforce", external: false, salesforce: null, hubspot: null };
  it("treats an unknown health check as connected, a refused token as not", () => {
    expect(isCrmConnectionReady({ ...base, salesforce: { ...sfConnected, healthy: null } })).toBe(true);
    expect(isCrmConnectionReady({ ...base, salesforce: { ...sfConnected, healthy: false } })).toBe(false);
    expect(isCrmConnectionReady({ ...base, salesforce: { ...sfConnected, connected: false, healthy: null } })).toBe(false);
  });
  it("is null while nothing is loaded", () => {
    expect(isCrmConnectionReady(undefined)).toBeNull();
  });
});

describe("isRevokedTokenError", () => {
  it("recognizes a refused or expired token", () => {
    expect(isRevokedTokenError({ name: "invalid_grant", message: "expired access/refresh token" })).toBe(true);
    expect(isRevokedTokenError({ errorCode: "INVALID_SESSION_ID", message: "Session expired" })).toBe(true);
    expect(isRevokedTokenError(new Error("invalid_grant: authentication failure"))).toBe(true);
  });
  it("does not treat an outage as a broken token", () => {
    expect(isRevokedTokenError(new Error("connect ETIMEDOUT"))).toBe(false);
    expect(isRevokedTokenError({ errorCode: "REQUEST_LIMIT_EXCEEDED", message: "limit" })).toBe(false);
    expect(isRevokedTokenError(null)).toBe(false);
  });
});

describe("getSalesforceUserConnection", () => {
  beforeEach(() => {
    clearSalesforceUserCheck();
    sfConfigMock.isOAuthConfigured.mockResolvedValue(true);
    sfConfigMock.getUserConnectionRecord.mockResolvedValue({ connected: true, connectedAt: new Date("2026-10-01T00:00:00Z") });
  });

  it("does not call Salesforce for a user with no token", async () => {
    sfConfigMock.getUserConnectionRecord.mockResolvedValue({ connected: false, connectedAt: null });
    const identity = vi.fn();
    const result = await getSalesforceUserConnection("u1", { identity });
    expect(result).toEqual({ configured: true, connected: false, healthy: null, accountLabel: null, connectedAt: null });
    expect(identity).not.toHaveBeenCalled();
  });

  it("reads the username and caches the check", async () => {
    let now = 1_000;
    const identity = vi.fn(async () => ({ username: "sam@acme.com", display_name: "Sam" }));
    const first = await getSalesforceUserConnection("u1", { identity, now: () => now });
    expect(first).toMatchObject({ connected: true, healthy: true, accountLabel: "sam@acme.com", connectedAt: "2026-10-01T00:00:00.000Z" });
    now += 60_000;
    await getSalesforceUserConnection("u1", { identity, now: () => now });
    expect(identity).toHaveBeenCalledTimes(1);
    now += 11 * 60_000;
    await getSalesforceUserConnection("u1", { identity, now: () => now });
    expect(identity).toHaveBeenCalledTimes(2);
  });

  it("marks a revoked token as needing reconnect, keeping the last label", async () => {
    let now = 1_000;
    const identity = vi
      .fn()
      .mockResolvedValueOnce({ username: "sam@acme.com" })
      .mockRejectedValueOnce({ name: "invalid_grant", message: "expired access/refresh token" });
    await getSalesforceUserConnection("u1", { identity, now: () => now });
    now += 11 * 60_000;
    const result = await getSalesforceUserConnection("u1", { identity, now: () => now });
    expect(result.healthy).toBe(false);
    expect(result.accountLabel).toBe("sam@acme.com");
  });

  it("reports unknown, not broken, when Salesforce can't be reached", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const identity = vi.fn().mockRejectedValue(new Error("connect ETIMEDOUT"));
    const result = await getSalesforceUserConnection("u1", { identity });
    expect(result.healthy).toBeNull();
    expect(isCrmConnectionReady({ provider: "salesforce", external: false, salesforce: result, hubspot: null })).toBe(true);
    warn.mockRestore();
  });
});
