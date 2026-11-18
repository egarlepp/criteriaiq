// @vitest-environment node
//
// One CRM per install, locked to the CRM the stored record ids came from
// (ImpactIQ's rule, ported in Phase 1).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageMock = vi.hoisted(() => ({
  getSystemSetting: vi.fn(),
  upsertSystemSetting: vi.fn(),
  countCrmLinkedData: vi.fn(),
}));
const sfConfigMock = vi.hoisted(() => ({ getOAuthConfig: vi.fn() }));
vi.mock("../../storage", () => ({ storage: storageMock }));
vi.mock("../../salesforce/salesforce-config-service", () => ({ salesforceConfigService: sfConfigMock }));
const hubspotConfigMock = vi.hoisted(() => ({ isHubspotConfigured: vi.fn() }));
vi.mock("../../hubspot/config", () => hubspotConfigMock);

import { changeCrmProvider, getCrmProviderState } from "../provider-lock";
import { clearCrmProviderCache, getCrmProviderId } from "../provider-setting";

beforeEach(() => {
  clearCrmProviderCache();
  storageMock.getSystemSetting.mockResolvedValue(undefined);
  storageMock.upsertSystemSetting.mockResolvedValue(undefined);
  storageMock.countCrmLinkedData.mockResolvedValue({ salesforce: 0, hubspot: 0 });
  sfConfigMock.getOAuthConfig.mockResolvedValue({ clientId: "id", clientSecret: "secret" });
  hubspotConfigMock.isHubspotConfigured.mockResolvedValue(false);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getCrmProviderId", () => {
  it("reads as None when nothing is saved, so an install runs without a CRM until one is chosen", async () => {
    expect(await getCrmProviderId()).toBe("none");
  });

  it("keeps the last known CRM when the setting can't be read", async () => {
    vi.useFakeTimers();
    try {
      storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "salesforce" } });
      expect(await getCrmProviderId()).toBe("salesforce");
      vi.advanceTimersByTime(31_000);
      storageMock.getSystemSetting.mockRejectedValue(new Error("db down"));
      expect(await getCrmProviderId()).toBe("salesforce");
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to None when the setting can't be read and nothing is known", async () => {
    storageMock.getSystemSetting.mockRejectedValue(new Error("db down"));
    expect(await getCrmProviderId()).toBe("none");
  });

  it("reads HubSpot as configured once its token is saved", async () => {
    hubspotConfigMock.isHubspotConfigured.mockResolvedValue(true);
    expect((await getCrmProviderState()).configured.hubspot).toBe(true);
  });

  it("caches the setting between reads", async () => {
    storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "hubspot" } });
    await getCrmProviderId();
    await getCrmProviderId();
    expect(storageMock.getSystemSetting).toHaveBeenCalledTimes(1);
  });
});

describe("getCrmProviderState", () => {
  it("offers every CRM while nothing links to one", async () => {
    const state = await getCrmProviderState();
    expect(state.allowed).toEqual(["salesforce", "hubspot", "none"]);
    expect(state.configured).toEqual({ salesforce: true, hubspot: false });
  });

  it("locks out HubSpot once projects hold Salesforce ids", async () => {
    storageMock.countCrmLinkedData.mockResolvedValue({ salesforce: 4, hubspot: 0 });
    const state = await getCrmProviderState();
    expect(state.allowed).toEqual(["salesforce", "none"]);
    expect(state.linkedData.salesforce).toBe(4);
  });

  it("reads Salesforce as not configured when its secret can't be decrypted", async () => {
    sfConfigMock.getOAuthConfig.mockRejectedValue(new Error("bad key"));
    expect((await getCrmProviderState()).configured.salesforce).toBe(false);
  });
});

describe("changeCrmProvider", () => {
  it("saves an allowed change", async () => {
    const result = await changeCrmProvider("hubspot", "admin-1");
    expect(result.ok).toBe(true);
    expect(storageMock.upsertSystemSetting).toHaveBeenCalledWith(
      "crm_provider",
      { provider: "hubspot" },
      "admin-1",
      expect.any(String),
    );
    expect(await getCrmProviderId()).toBe("hubspot");
  });

  it("refuses another CRM once linked data exists, and saves nothing", async () => {
    storageMock.countCrmLinkedData.mockResolvedValue({ salesforce: 1, hubspot: 0 });
    const result = await changeCrmProvider("hubspot", "admin-1");
    expect(result).toMatchObject({ ok: false, status: 409, errorCode: "crm_provider_locked" });
    expect(storageMock.upsertSystemSetting).not.toHaveBeenCalled();
  });

  it("always allows None, which keeps the ids", async () => {
    storageMock.getSystemSetting.mockResolvedValue({ value: { provider: "salesforce" } });
    storageMock.countCrmLinkedData.mockResolvedValue({ salesforce: 9, hubspot: 0 });
    const result = await changeCrmProvider("none", "admin-1");
    expect(result).toMatchObject({ ok: true, before: "salesforce", after: "none" });
  });

  it("does not write when the choice is unchanged", async () => {
    await changeCrmProvider("none", "admin-1");
    expect(storageMock.upsertSystemSetting).not.toHaveBeenCalled();
  });
});
