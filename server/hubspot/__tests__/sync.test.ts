// @vitest-environment node
//
// HubSpot field sync: payload building, the property metadata the mapping
// editor reads, record reads/writes and which record a project or account
// links to.
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({ hubspotRequest: vi.fn(), hubspotJson: vi.fn() }));
vi.mock("../client", () => clientMock);
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../storage.js", () => ({ storage: {} }));

import {
  buildHubspotInboundPayload,
  buildHubspotOutboundPayload,
  fromHubspotString,
  toHubspotString,
} from "../sync-payload";
import { getHubspotRecord, hubspotMappingProblem, updateHubspotRecord } from "../records";
import { toMappableField } from "../metadata";
import { hubspotTargetFor } from "../sync-links";

type Mapping = Parameters<typeof buildHubspotOutboundPayload>[2][number];

function mapping(overrides: Partial<Mapping>): Mapping {
  return {
    id: 1,
    cqiEntity: "project",
    cqiFieldKey: "name",
    cqiFieldLabel: "Name",
    cqiFieldType: "string",
    sfObjectApiName: "deals",
    sfObjectLabel: "Deals",
    sfFieldApiName: "dealname",
    sfFieldLabel: "Deal name",
    sfFieldType: "string",
    direction: "bidirectional",
    transformKey: null,
    defaultValue: null,
    unmappedBehavior: "error_and_log",
    isCaseInsensitive: false,
    isRequired: false,
    isActive: true,
    orderIndex: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Mapping;
}

const cqiWins = { conflictStrategy: "criteriaiq_wins" as const };

describe("HubSpot string conversion", () => {
  it("writes values the way HubSpot stores them", () => {
    expect(toHubspotString(new Date("2026-12-01T10:00:00Z"), "date")).toBe("2026-12-01");
    expect(toHubspotString(true, "boolean")).toBe("true");
    expect(toHubspotString(1200.5, "double")).toBe("1200.5");
    expect(toHubspotString(["a", "b"], "multipicklist")).toBe("a;b");
    expect(toHubspotString(null, "string")).toBe("");
  });

  it("reads them back in the shape of the CriteriaIQ value", () => {
    expect(fromHubspotString("true", false, "boolean")).toBe(true);
    expect(fromHubspotString("42", 1, "number")).toBe(42);
    expect(fromHubspotString("2026-12-01", new Date(0), "date")).toEqual(new Date("2026-12-01T00:00:00Z"));
    expect(fromHubspotString("", "x", "string")).toBeNull();
  });
});

describe("buildHubspotOutboundPayload", () => {
  it("sends only properties that differ", () => {
    const result = buildHubspotOutboundPayload(
      { name: "Acme POC", stage: "Done" },
      { dealname: "Acme POC", dealstage: "open" },
      [mapping({}), mapping({ cqiFieldKey: "stage", sfFieldApiName: "dealstage" })],
      cqiWins,
      null,
    );
    expect(result.updateData).toEqual({ dealstage: "Done" });
    expect(result.changes).toHaveLength(1);
  });

  it("skips inbound-only mappings and translates values", () => {
    const result = buildHubspotOutboundPayload(
      { name: "x", stage: "Won" },
      {},
      [
        mapping({ direction: "inbound" }),
        mapping({
          cqiFieldKey: "stage",
          sfFieldApiName: "dealstage",
          valueMaps: [{ id: 1, cqiValue: "Won", sfValue: "closedwon", isDefault: false, isPrimaryOutbound: true }],
        }),
      ],
      cqiWins,
      null,
    );
    expect(result.updateData).toEqual({ dealstage: "closedwon" });
  });

  it("reports a value with no translation instead of sending it", () => {
    const result = buildHubspotOutboundPayload(
      { stage: "Unknown" },
      {},
      [mapping({ cqiFieldKey: "stage", sfFieldApiName: "dealstage", valueMaps: [{ id: 1, cqiValue: "Won", sfValue: "closedwon", isDefault: false, isPrimaryOutbound: true }] })],
      cqiWins,
      null,
    );
    expect(result.updateData).toEqual({});
    expect(result.translationErrors).toHaveLength(1);
  });

  it("keeps HubSpot's value when the CRM wins and it was synced in before", () => {
    const result = buildHubspotOutboundPayload(
      { name: "New name" },
      { dealname: "HubSpot name" },
      [mapping({})],
      { conflictStrategy: "salesforce_wins" },
      { lastInboundSync: new Date() },
    );
    expect(result.updateData).toEqual({});
    expect(result.conflicts[0]).toMatchObject({ field: "name", resolvedValue: "HubSpot name" });
  });
});

describe("buildHubspotInboundPayload", () => {
  it("updates CriteriaIQ columns that differ", () => {
    const result = buildHubspotInboundPayload(
      { name: "Old", budget: 10 },
      { dealname: "New", amount: "10" },
      [mapping({}), mapping({ cqiFieldKey: "budget", sfFieldApiName: "amount", sfFieldType: "double" })],
      cqiWins,
      null,
    );
    expect(result.updateData).toEqual({ name: "New" });
  });

  it("skips outbound-only mappings", () => {
    const result = buildHubspotInboundPayload({ name: "Old" }, { dealname: "New" }, [mapping({ direction: "outbound" })], cqiWins, null);
    expect(result.updateData).toEqual({});
  });
});

describe("hubspotMappingProblem", () => {
  it("allows projects with Deals and accounts with Companies only", () => {
    expect(hubspotMappingProblem("project", "deals")).toBeNull();
    expect(hubspotMappingProblem("customer", "companies")).toBeNull();
    expect(hubspotMappingProblem("project", "companies")).not.toBeNull();
    expect(hubspotMappingProblem("user", "contacts")).not.toBeNull();
  });
});

describe("HubSpot record reads and writes", () => {
  beforeEach(() => clientMock.hubspotRequest.mockReset());

  it("asks only for the mapped properties", async () => {
    clientMock.hubspotRequest.mockResolvedValue({ status: 200, body: { properties: { dealname: "Acme" } } });
    expect(await getHubspotRecord("deals", "123", ["dealname", "dealname", "amount"])).toEqual({ dealname: "Acme" });
    expect(clientMock.hubspotRequest).toHaveBeenCalledWith("/crm/v3/objects/deals/123", {
      query: { properties: "dealname,amount", archived: false },
    });
  });

  it("refuses an id that isn't a HubSpot id without calling HubSpot", async () => {
    await expect(getHubspotRecord("deals", "../owners", [])).rejects.toThrow(/404/);
    expect(clientMock.hubspotRequest).not.toHaveBeenCalled();
  });

  it("words failures so the sync queue can tell them apart", async () => {
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 404, body: null });
    await expect(getHubspotRecord("deals", "1", [])).rejects.toThrow(/\(404\)/);
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 400, body: { message: "Property values were not valid" } });
    await expect(updateHubspotRecord("deals", "1", { amount: "x" })).rejects.toThrow(/validation rule/);
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 403, body: null });
    await expect(updateHubspotRecord("companies", "1", {})).rejects.toThrow(/forbidden/);
  });

  it("sends updates as a PATCH of properties", async () => {
    clientMock.hubspotRequest.mockResolvedValue({ status: 200, body: {} });
    await updateHubspotRecord("companies", "77", { name: "Acme" });
    expect(clientMock.hubspotRequest).toHaveBeenCalledWith("/crm/v3/objects/companies/77", { method: "PATCH", body: { properties: { name: "Acme" } } });
  });
});

describe("toMappableField", () => {
  it("maps HubSpot property types to the editor's types", () => {
    expect(toMappableField({ name: "amount", label: "Amount", type: "number", hubspotDefined: true })).toMatchObject({ type: "double", updateable: true, custom: false });
    expect(
      toMappableField({ name: "dealstage", label: "Stage", type: "enumeration", fieldType: "select", options: [{ value: "open", label: "Open" }, { value: "x", hidden: true }] }),
    ).toMatchObject({ type: "picklist", picklistValues: [{ value: "open", label: "Open", active: true }] });
    expect(toMappableField({ name: "c", type: "enumeration", fieldType: "checkbox" })?.type).toBe("multipicklist");
  });

  it("marks read-only and calculated properties as not updateable and drops hidden ones", () => {
    expect(toMappableField({ name: "hs_object_id", type: "number", modificationMetadata: { readOnlyValue: true } })?.updateable).toBe(false);
    expect(toMappableField({ name: "x", type: "string", hidden: true })).toBeNull();
  });
});

describe("hubspotTargetFor", () => {
  it("links a HubSpot project to its Deal", () => {
    expect(hubspotTargetFor("project", { crmProvider: "hubspot", crmOpportunityId: "991", name: "POC" })).toEqual({ objectType: "deals", id: "991", name: "POC" });
    expect(hubspotTargetFor("project", { crmProvider: "salesforce", crmOpportunityId: "006000000000001AAA" })).toBeNull();
    expect(hubspotTargetFor("project", { crmProvider: "hubspot", crmOpportunityId: null })).toBeNull();
  });

  it("links an account to the Company in its HubSpot URL", () => {
    expect(
      hubspotTargetFor("customer", { salesforceAccountUrl: "https://app.hubspot.com/contacts/123/record/0-2/456", name: "Acme" }),
    ).toEqual({ objectType: "companies", id: "456", name: "Acme" });
    expect(hubspotTargetFor("customer", { salesforceAccountUrl: "https://acme.my.salesforce.com/001000000000001" })).toBeNull();
  });
});
