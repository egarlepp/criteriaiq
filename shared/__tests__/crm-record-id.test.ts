import { describe, expect, it } from "vitest";
import {
  crmIdFilterCandidates,
  isHubspotUrl,
  extractSalesforceIdFromUrl,
  parseCrmRecordInput,
  salesforceIdsEqual,
  salesforceObjectForId,
  toSalesforceId18,
} from "../crm-record-id";

// Salesforce's documented example: 001A0000006Vm9r <-> 001A0000006Vm9rIAC.
const ACCOUNT_15 = "001A0000006Vm9r";
const ACCOUNT_18 = "001A0000006Vm9rIAC";

describe("toSalesforceId18", () => {
  it("converts a 15-character id to its 18-character form", () => {
    expect(toSalesforceId18(ACCOUNT_15)).toBe(ACCOUNT_18);
  });

  it("keeps an 18-character id and corrects a wrong-case suffix", () => {
    expect(toSalesforceId18(ACCOUNT_18)).toBe(ACCOUNT_18);
    expect(toSalesforceId18("001A0000006Vm9riac")).toBe(ACCOUNT_18);
  });

  it("trims whitespace", () => {
    expect(toSalesforceId18(`  ${ACCOUNT_15}\n`)).toBe(ACCOUNT_18);
  });

  it("rejects anything that is not 15 or 18 alphanumeric characters", () => {
    expect(toSalesforceId18("001A0000006Vm9")).toBeNull();
    expect(toSalesforceId18("001A0000006Vm9rIA")).toBeNull();
    expect(toSalesforceId18("001A0000006Vm9r'--")).toBeNull();
    expect(toSalesforceId18("")).toBeNull();
  });

  it("treats 15- and 18-character forms of one record as equal", () => {
    expect(salesforceIdsEqual(ACCOUNT_15, ACCOUNT_18)).toBe(true);
    expect(salesforceIdsEqual(ACCOUNT_15, "001A0000006Vm9s")).toBe(false);
    // 15-character ids are case-sensitive.
    expect(salesforceIdsEqual(ACCOUNT_15, "001a0000006vm9r")).toBe(false);
  });
});

describe("extractSalesforceIdFromUrl", () => {
  it("reads Lightning record URLs", () => {
    expect(
      extractSalesforceIdFromUrl(`https://acme.lightning.force.com/lightning/r/Evaluation__c/${ACCOUNT_15}/view`),
    ).toBe(ACCOUNT_18);
    expect(extractSalesforceIdFromUrl(`https://acme.lightning.force.com/lightning/r/${ACCOUNT_18}/view`)).toBe(ACCOUNT_18);
  });

  it("reads Classic and ?id= URLs", () => {
    expect(extractSalesforceIdFromUrl(`https://acme.my.salesforce.com/${ACCOUNT_15}`)).toBe(ACCOUNT_18);
    expect(extractSalesforceIdFromUrl(`https://acme.my.salesforce.com/apex/Page?id=${ACCOUNT_15}`)).toBe(ACCOUNT_18);
  });

  it("returns null for text that is not a URL or has no id", () => {
    expect(extractSalesforceIdFromUrl("Q3 Evaluation")).toBeNull();
    expect(extractSalesforceIdFromUrl("https://acme.lightning.force.com/lightning/o/Evaluation__c/list")).toBeNull();
    expect(extractSalesforceIdFromUrl(null)).toBeNull();
  });
});

describe("parseCrmRecordInput", () => {
  it("parses bare Salesforce and HubSpot ids", () => {
    expect(parseCrmRecordInput(ACCOUNT_15)).toEqual({ provider: "salesforce", id: ACCOUNT_18 });
    expect(parseCrmRecordInput("9876543210")).toEqual({ provider: "hubspot", id: "9876543210" });
  });

  it("parses HubSpot record URLs, new and legacy", () => {
    expect(parseCrmRecordInput("https://app.hubspot.com/contacts/123/record/0-3/456789")).toEqual({
      provider: "hubspot",
      id: "456789",
    });
    expect(parseCrmRecordInput("https://app-eu1.hubspot.com/contacts/123/deal/42")).toEqual({ provider: "hubspot", id: "42" });
  });

  it("refuses input from the other CRM when a provider is given", () => {
    expect(parseCrmRecordInput(ACCOUNT_15, "hubspot")).toBeNull();
    expect(parseCrmRecordInput("https://app.hubspot.com/contacts/1/deal/2", "salesforce")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(parseCrmRecordInput("not an id")).toBeNull();
    expect(parseCrmRecordInput("   ")).toBeNull();
  });
});

describe("crmIdFilterCandidates", () => {
  it("maps 15- and 18-character Salesforce input to the same stored value", () => {
    expect(crmIdFilterCandidates(ACCOUNT_15)).toEqual([ACCOUNT_18]);
    expect(crmIdFilterCandidates(ACCOUNT_18)).toEqual([ACCOUNT_18]);
  });

  it("keeps HubSpot ids and rejects junk", () => {
    expect(crmIdFilterCandidates("12345")).toEqual(["12345"]);
    expect(crmIdFilterCandidates("abc'; drop")).toEqual([]);
  });
});

describe("salesforceObjectForId", () => {
  it("recognises Account and Opportunity key prefixes", () => {
    expect(salesforceObjectForId(ACCOUNT_18)).toBe("Account");
    expect(salesforceObjectForId("006A0000004kzLqIAI")).toBe("Opportunity");
    expect(salesforceObjectForId("a0X5e00000AbCdEFGH")).toBeNull();
  });
});

describe("isHubspotUrl", () => {
  it("matches hubspot.com and its subdomains only", () => {
    expect(isHubspotUrl("https://app.hubspot.com/contacts/1/record/0-2/9")).toBe(true);
    expect(isHubspotUrl("https://app-eu1.hubspot.com/x")).toBe(true);
    expect(isHubspotUrl("https://hubspot.com.evil.test/x")).toBe(false);
    expect(isHubspotUrl("https://acme.my.salesforce.com/001")).toBe(false);
    expect(isHubspotUrl(null)).toBe(false);
  });
});
