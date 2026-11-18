import { describe, expect, it } from "vitest";
import {
  accountLinkRefusal,
  crmLinkRefusal,
  evaluationLinkMatches,
  normalizeProjectCrmFields,
  parseProjectCrmFilters,
} from "../crm-record-fields";

const OPP_15 = "006A0000004kzLq";
const OPP_18 = "006A0000004kzLqIAI";
const ACCOUNT_15 = "001A0000006Vm9r";
const ACCOUNT_18 = "001A0000006Vm9rIAC";
const EVAL_15 = "a0X5e00000AbCdE";

describe("normalizeProjectCrmFields", () => {
  it("normalizes 15-character Salesforce ids to 18 characters and infers the provider", () => {
    expect(normalizeProjectCrmFields({ crmOpportunityId: OPP_15, crmAccountId: ACCOUNT_15 })).toEqual({
      ok: true,
      values: { crmProvider: "salesforce", crmOpportunityId: OPP_18, crmAccountId: ACCOUNT_18 },
    });
  });

  it("accepts a Salesforce record URL", () => {
    const result = normalizeProjectCrmFields({
      crmProvider: "salesforce",
      crmOpportunityId: `https://acme.lightning.force.com/lightning/r/Opportunity/${OPP_15}/view`,
    });
    expect(result).toEqual({ ok: true, values: { crmProvider: "salesforce", crmOpportunityId: OPP_18 } });
  });

  it("leaves fields the body does not mention untouched", () => {
    expect(normalizeProjectCrmFields({ name: "x" })).toEqual({ ok: true, values: {} });
  });

  it("clears fields sent blank", () => {
    expect(normalizeProjectCrmFields({ crmProvider: "", crmOpportunityId: "", crmAccountId: null })).toEqual({
      ok: true,
      values: { crmProvider: null, crmOpportunityId: null, crmAccountId: null },
    });
  });

  it("keeps HubSpot ids as given", () => {
    expect(normalizeProjectCrmFields({ crmProvider: "hubspot", crmOpportunityId: "123456", crmAccountId: "789" })).toEqual({
      ok: true,
      values: { crmProvider: "hubspot", crmOpportunityId: "123456", crmAccountId: "789" },
    });
  });

  it("rejects an unknown provider, junk ids and a mix of CRMs", () => {
    expect(normalizeProjectCrmFields({ crmProvider: "pipedrive" }).ok).toBe(false);
    expect(normalizeProjectCrmFields({ crmOpportunityId: "not an id" }).ok).toBe(false);
    expect(normalizeProjectCrmFields({ crmProvider: "hubspot", crmOpportunityId: OPP_15 }).ok).toBe(false);
    expect(normalizeProjectCrmFields({ crmOpportunityId: OPP_15, crmAccountId: "123" }).ok).toBe(false);
    expect(normalizeProjectCrmFields({ crmOpportunityId: 42 }).ok).toBe(false);
  });
});

describe("parseProjectCrmFilters", () => {
  it("gives 15- and 18-character Salesforce ids the same candidates", () => {
    const a = parseProjectCrmFilters({ crmOpportunityId: OPP_15, crmAccountId: ACCOUNT_18 });
    const b = parseProjectCrmFilters({ crmOpportunityId: OPP_18, crmAccountId: ACCOUNT_15 });
    expect(a).toEqual(b);
    expect(a).toEqual({ ok: true, filters: { crmOpportunityIds: [OPP_18], crmAccountIds: [ACCOUNT_18] } });
  });

  it("normalizes evaluationId to 18 characters", () => {
    expect(parseProjectCrmFilters({ evaluationId: EVAL_15 })).toEqual({
      ok: true,
      filters: { evaluationId: "a0X5e00000AbCdEEAV" },
    });
  });

  it("returns no filters when none are given", () => {
    expect(parseProjectCrmFilters({ status: "active" })).toEqual({ ok: true, filters: {} });
  });

  it("rejects malformed and repeated values", () => {
    expect(parseProjectCrmFilters({ crmOpportunityId: "x' OR 1=1" }).ok).toBe(false);
    expect(parseProjectCrmFilters({ crmAccountId: [ACCOUNT_15, ACCOUNT_18] }).ok).toBe(false);
    expect(parseProjectCrmFilters({ evaluationId: "123" }).ok).toBe(false);
    expect(parseProjectCrmFilters({ evaluationId: "" }).ok).toBe(false);
  });
});

describe("evaluationLinkMatches", () => {
  const eval18 = "a0X5e00000AbCdEEAV";
  it("matches the id inside a URL in either form", () => {
    expect(evaluationLinkMatches(`https://acme.lightning.force.com/lightning/r/Evaluation__c/${EVAL_15}/view`, eval18)).toBe(true);
    expect(evaluationLinkMatches(`https://acme.my.salesforce.com/${eval18}`, eval18)).toBe(true);
  });

  it("matches a link stored as a bare id", () => {
    expect(evaluationLinkMatches(EVAL_15, eval18)).toBe(true);
  });

  it("does not match a different record or a name", () => {
    expect(evaluationLinkMatches("https://acme.my.salesforce.com/a0X5e00000AbCdF", eval18)).toBe(false);
    expect(evaluationLinkMatches("Q3 Evaluation", eval18)).toBe(false);
    expect(evaluationLinkMatches(null, eval18)).toBe(false);
  });
});

describe("crmLinkRefusal", () => {
  it("lets a link to the active CRM through", () => {
    expect(crmLinkRefusal({ crmProvider: "hubspot" }, null, "hubspot")).toBeNull();
  });

  it("keeps the project's stored CRM", () => {
    expect(crmLinkRefusal({ crmProvider: "salesforce" }, "salesforce", "none")).toBeNull();
  });

  it("allows clearing or not mentioning the CRM", () => {
    expect(crmLinkRefusal({ crmProvider: null }, "salesforce", "hubspot")).toBeNull();
    expect(crmLinkRefusal({}, null, "none")).toBeNull();
  });

  it("refuses a new link to another CRM, or any new link with none", () => {
    expect(crmLinkRefusal({ crmProvider: "salesforce" }, null, "hubspot")).toMatch(/HubSpot/);
    expect(crmLinkRefusal({ crmProvider: "hubspot" }, null, "none")).toMatch(/No CRM/);
  });
});

describe("accountLinkRefusal", () => {
  const SF = "https://acme.lightning.force.com/lightning/r/Account/001A0000006Vm9r/view";
  const HS = "https://app.hubspot.com/contacts/123/record/0-2/10";

  it("accepts the active CRM's link", () => {
    expect(accountLinkRefusal(SF, null, "salesforce")).toBeNull();
    expect(accountLinkRefusal(HS, null, "hubspot")).toBeNull();
  });

  it("keeps an unchanged link and allows a blank one", () => {
    expect(accountLinkRefusal(SF, SF, "hubspot")).toBeNull();
    expect(accountLinkRefusal("", SF, "hubspot")).toBeNull();
  });

  it("refuses a new link to the other CRM, or any new link with none", () => {
    expect(accountLinkRefusal(SF, null, "hubspot")).toMatch(/HubSpot/);
    expect(accountLinkRefusal(HS, null, "salesforce")).toMatch(/Salesforce/);
    expect(accountLinkRefusal(HS, null, "none")).toMatch(/No CRM/);
  });
});
