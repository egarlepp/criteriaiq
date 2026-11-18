// @vitest-environment node
//
// The Salesforce provider must send Salesforce exactly the SOQL the
// /api/salesforce routes sent before Phase 1, so moving the routes behind
// the provider interface changes nothing for Salesforce installs.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const conn = vi.hoisted(() => ({
  instanceUrl: "https://acme.my.salesforce.com/",
  query: vi.fn(),
}));
const configMock = vi.hoisted(() => ({
  getEvaluationObjectApiName: vi.fn(),
  getEvaluationOpportunityLookupField: vi.fn(),
}));
const connectMock = vi.hoisted(() => vi.fn());

vi.mock("../../salesforce/salesforce-config-service", () => ({
  salesforceConfigService: configMock,
  getSalesforceConnectionForUser: connectMock,
}));

import { salesforceProvider } from "../salesforce-provider";

const OPP = "006A0000006Vm9rIAC";

beforeEach(() => {
  connectMock.mockResolvedValue(conn);
  configMock.getEvaluationObjectApiName.mockResolvedValue("Evaluation__c");
  configMock.getEvaluationOpportunityLookupField.mockResolvedValue("Opportunity__c");
  conn.query.mockResolvedValue({ records: [] });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("salesforceProvider", () => {
  it("returns null for a user who hasn't connected Salesforce", async () => {
    connectMock.mockRejectedValue(new Error("User not connected to Salesforce"));
    expect(await salesforceProvider.connectForUser("u1")).toBeNull();
  });

  it("still fails loudly when Salesforce itself isn't configured", async () => {
    connectMock.mockRejectedValue(new Error("Salesforce OAuth not configured"));
    await expect(salesforceProvider.connectForUser("u1")).rejects.toThrow("OAuth not configured");
  });

  it("checks record ids with the Salesforce id shape", () => {
    expect(salesforceProvider.isRecordId(OPP)).toBe(true);
    expect(salesforceProvider.isRecordId("12345")).toBe(false);
  });

  it("sends the same opportunity SOQL as before", async () => {
    const session = await salesforceProvider.connectForUser("u1");
    conn.query.mockResolvedValue({
      records: [{ Id: OPP, Name: "Big deal", Account: { Name: "Acme", Id: "001A" }, Owner: { Name: "Ann", Id: "005A" }, StageName: "Eval" }],
    });
    const rows = await session!.opportunitiesForAccount("Ac'me");
    expect(conn.query).toHaveBeenCalledWith(
      `
      SELECT Id, Name, Account.Name, Account.Id, Owner.Name, Owner.Id, 
             StageName, Amount, CloseDate, Type
      FROM Opportunity
      WHERE Name LIKE '%%'
     AND Account.Name LIKE '%Ac\\'me%' ORDER BY LastModifiedDate DESC LIMIT 50`,
    );
    expect(rows[0]).toMatchObject({ id: OPP, name: "Big deal", accountName: "Acme", stageName: "Eval" });
  });

  it("sends the same validation record SOQL as before, with the record link", async () => {
    const session = await salesforceProvider.connectForUser("u1");
    conn.query.mockResolvedValue({ records: [{ Id: "a0B000000000001AAA", Name: "POC 1" }] });
    const rows = await session!.validationRecordsForOpportunity(OPP);
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(conn.query).toHaveBeenCalledWith(
      `SELECT Id, Name FROM Evaluation__c WHERE Opportunity__c = '${OPP}' ORDER BY LastModifiedDate DESC LIMIT 50`,
    );
    expect(rows).toEqual([{ id: "a0B000000000001AAA", name: "POC 1", url: "https://acme.my.salesforce.com/a0B000000000001AAA" }]);
  });

  it("falls back to OpportunityId__c when the default lookup field fails", async () => {
    const session = await salesforceProvider.connectForUser("u1");
    conn.query.mockRejectedValueOnce(new Error("No such column")).mockResolvedValueOnce({ records: [] });
    await session!.validationRecordsForOpportunity(OPP);
    expect(conn.query).toHaveBeenLastCalledWith(
      `SELECT Id, Name FROM Evaluation__c WHERE OpportunityId__c = '${OPP}' ORDER BY LastModifiedDate DESC LIMIT 50`,
    );
  });

  it("uses only a custom lookup field when one is set", async () => {
    configMock.getEvaluationOpportunityLookupField.mockResolvedValue("Deal__c");
    const session = await salesforceProvider.connectForUser("u1");
    conn.query.mockRejectedValue(new Error("No such column"));
    expect(await session!.validationRecordsForOpportunity(OPP)).toEqual([]);
    expect(conn.query).toHaveBeenCalledTimes(1);
  });

  it("never lets a non-Salesforce id reach the SOQL", async () => {
    const session = await salesforceProvider.connectForUser("u1");
    expect(() => session!.validationRecordsForOpportunity("x' OR Name != '")).toThrow();
    expect(conn.query).not.toHaveBeenCalled();
  });
});
