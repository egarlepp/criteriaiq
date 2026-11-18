// @vitest-environment node
//
// Creating a Deal or Company in HubSpot: the properties it starts with, the
// pipeline stage a Deal opens in, and the create request itself.
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({ hubspotRequest: vi.fn(), hubspotJson: vi.fn(), HubspotError: class extends Error {} }));
vi.mock("../client", () => clientMock);
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../storage.js", () => ({ storage: {} }));
vi.mock("../../salesforce/salesforce-payload-builder", () => ({ getCQIRecord: vi.fn() }));
vi.mock("../../salesforce/salesforce-mapping-service", () => ({ salesforceMappingService: {} }));
vi.mock("../../salesforce/salesforce-linkage-service", () => ({ salesforceLinkageService: {} }));
vi.mock("../../crm/provider-setting", () => ({ getCrmProviderId: vi.fn() }));
vi.mock("../../crm/hubspot-provider", () => ({ hubspotProvider: {}, hubspotRecordUrl: vi.fn() }));

import { buildHubspotCreateProperties, defaultDealStage } from "../create-records";
import { createHubspotRecord, DEAL_TO_PRIMARY_COMPANY } from "../records";

type Mapping = Parameters<typeof buildHubspotCreateProperties>[2][number];

function mapping(overrides: Partial<Mapping>): Mapping {
  return {
    id: 1,
    cqiEntity: "project",
    cqiFieldKey: "budget",
    cqiFieldLabel: "Budget",
    cqiFieldType: "number",
    sfObjectApiName: "deals",
    sfObjectLabel: "Deals",
    sfFieldApiName: "amount",
    sfFieldLabel: "Amount",
    sfFieldType: "double",
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

describe("buildHubspotCreateProperties", () => {
  it("sends mapped values, the record name and the owner", () => {
    expect(
      buildHubspotCreateProperties("deals", { budget: 5000, name: "Acme POC" }, [mapping({})], { name: "Acme POC", ownerId: "77" }),
    ).toEqual({ amount: "5000", dealname: "Acme POC", hubspot_owner_id: "77" });
  });

  it("keeps a mapped name and owner, and skips empty values and other objects", () => {
    const props = buildHubspotCreateProperties(
      "deals",
      { title: "Mapped name", owner: "12", notes: "", budget: 1 },
      [
        mapping({ cqiFieldKey: "title", sfFieldApiName: "dealname", sfFieldType: "string" }),
        mapping({ cqiFieldKey: "owner", sfFieldApiName: "hubspot_owner_id", sfFieldType: "string" }),
        mapping({ cqiFieldKey: "notes", sfFieldApiName: "description", sfFieldType: "string" }),
        mapping({ sfObjectApiName: "companies", sfFieldApiName: "annualrevenue" }),
      ],
      { name: "Fallback", ownerId: "99" },
    );
    expect(props).toEqual({ dealname: "Mapped name", hubspot_owner_id: "12" });
  });

  it("names a Company by its account name and ignores inbound-only mappings", () => {
    expect(
      buildHubspotCreateProperties("companies", { region: "EMEA" }, [mapping({ sfObjectApiName: "companies", cqiFieldKey: "region", sfFieldApiName: "region", sfFieldType: "string", direction: "inbound" })], {
        name: "Acme",
        ownerId: null,
      }),
    ).toEqual({ name: "Acme" });
  });
});

describe("defaultDealStage", () => {
  it("starts in the default pipeline's first open stage", () => {
    expect(
      defaultDealStage([
        { id: "other", displayOrder: 0, stages: [{ id: "x", displayOrder: 0 }] },
        {
          id: "default",
          displayOrder: 1,
          stages: [
            { id: "closedwon", displayOrder: 0, metadata: { isClosed: "true" } },
            { id: "qualified", displayOrder: 2 },
            { id: "appointment", displayOrder: 1 },
          ],
        },
      ]),
    ).toEqual({ pipeline: "default", dealstage: "appointment" });
  });

  it("falls back to the first listed pipeline and skips archived ones", () => {
    expect(
      defaultDealStage([
        { id: "b", displayOrder: 2, stages: [{ id: "b1" }] },
        { id: "a", displayOrder: 1, archived: true, stages: [{ id: "a1" }] },
      ]),
    ).toEqual({ pipeline: "b", dealstage: "b1" });
    expect(defaultDealStage([])).toBeNull();
  });
});

describe("createHubspotRecord", () => {
  beforeEach(() => clientMock.hubspotRequest.mockReset());

  it("POSTs the properties and the primary company association", async () => {
    clientMock.hubspotRequest.mockResolvedValue({ status: 201, body: { id: "901" } });
    expect(await createHubspotRecord("deals", { dealname: "Acme" }, [{ toId: "456", associationTypeId: DEAL_TO_PRIMARY_COMPANY }])).toBe("901");
    expect(clientMock.hubspotRequest).toHaveBeenCalledWith("/crm/v3/objects/deals", {
      method: "POST",
      body: {
        properties: { dealname: "Acme" },
        associations: [{ to: { id: "456" }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }] }],
      },
    });
  });

  it("drops an association to an id that isn't a HubSpot id", async () => {
    clientMock.hubspotRequest.mockResolvedValue({ status: 201, body: { id: 12 } });
    await createHubspotRecord("companies", { name: "Acme" }, [{ toId: "../x", associationTypeId: 5 }]);
    expect(clientMock.hubspotRequest.mock.calls[0][1].body.associations).toEqual([]);
  });

  it("words failures the same way updates do", async () => {
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 400, body: { message: "Property dealstage is invalid" } });
    await expect(createHubspotRecord("deals", {})).rejects.toThrow(/validation rule/);
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 403, body: null });
    await expect(createHubspotRecord("deals", {})).rejects.toThrow(/forbidden/);
    clientMock.hubspotRequest.mockResolvedValueOnce({ status: 201, body: {} });
    await expect(createHubspotRecord("deals", {})).rejects.toThrow(/no record id/);
  });
});
