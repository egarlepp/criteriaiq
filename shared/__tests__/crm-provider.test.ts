import { describe, expect, it } from "vitest";
import {
  crmProviderChangeAllowed,
  crmProvidersWithData,
  crmWordingVariables,
  normalizeCrmProvider,
  validationRecordRequired,
} from "../crm-provider";

const none = { salesforce: 0, hubspot: 0 };

describe("normalizeCrmProvider", () => {
  it("reads the stored { provider } shape", () => {
    expect(normalizeCrmProvider({ provider: "hubspot" })).toBe("hubspot");
    expect(normalizeCrmProvider({ provider: "none" })).toBe("none");
  });

  it("falls back to None, the default, for anything unreadable", () => {
    expect(normalizeCrmProvider(undefined)).toBe("none");
    expect(normalizeCrmProvider(null)).toBe("none");
    expect(normalizeCrmProvider({ provider: "pipedrive" })).toBe("none");
    expect(normalizeCrmProvider("garbage")).toBe("none");
  });
});

describe("crmProviderChangeAllowed", () => {
  it("allows any change while nothing links to a CRM", () => {
    expect(crmProviderChangeAllowed("salesforce", "hubspot", none)).toBe(true);
    expect(crmProviderChangeAllowed("none", "hubspot", none)).toBe(true);
  });

  it("with Salesforce data allows only Salesforce or none", () => {
    const counts = { salesforce: 3, hubspot: 0 };
    expect(crmProviderChangeAllowed("salesforce", "hubspot", counts)).toBe(false);
    expect(crmProviderChangeAllowed("salesforce", "none", counts)).toBe(true);
    expect(crmProviderChangeAllowed("none", "salesforce", counts)).toBe(true);
    expect(crmProviderChangeAllowed("none", "hubspot", counts)).toBe(false);
  });

  it("with HubSpot data allows only HubSpot or none", () => {
    const counts = { salesforce: 0, hubspot: 1 };
    expect(crmProviderChangeAllowed("hubspot", "salesforce", counts)).toBe(false);
    expect(crmProviderChangeAllowed("none", "hubspot", counts)).toBe(true);
  });

  it("with data from both keeps the current choice and none only", () => {
    const counts = { salesforce: 1, hubspot: 1 };
    expect(crmProviderChangeAllowed("salesforce", "salesforce", counts)).toBe(true);
    expect(crmProviderChangeAllowed("salesforce", "none", counts)).toBe(true);
    expect(crmProviderChangeAllowed("none", "salesforce", counts)).toBe(false);
    expect(crmProviderChangeAllowed("salesforce", "hubspot", counts)).toBe(false);
  });
});

describe("display names", () => {
  it("lists the CRMs holding data", () => {
    expect(crmProvidersWithData({ salesforce: 2, hubspot: 0 })).toEqual(["salesforce"]);
  });

  it("fills the {{crm}} wording variables", () => {
    expect(crmWordingVariables("salesforce")).toEqual({ crm: "Salesforce", crmShort: "SF" });
    expect(crmWordingVariables("none")).toEqual({ crm: "CRM", crmShort: "CRM" });
  });
});

describe("validationRecordRequired", () => {
  it("requires the link only while a CRM is in use", () => {
    expect(validationRecordRequired("none")).toBe(false);
    expect(validationRecordRequired("salesforce")).toBe(true);
    expect(validationRecordRequired("hubspot")).toBe(true);
  });

  it("treats an unknown CRM as in use", () => {
    expect(validationRecordRequired(undefined)).toBe(true);
    expect(validationRecordRequired(null)).toBe(true);
  });
});
