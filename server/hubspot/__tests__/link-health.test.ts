// @vitest-environment node
//
// Reading HubSpot's batch-read answer for the nightly link check: which ids
// were found, which HubSpot confirms are gone, and which were merged.
import { describe, expect, it, vi } from "vitest";

vi.mock("../client", () => ({ hubspotRequest: vi.fn(), HubspotError: class extends Error {} }));
vi.mock("../config", () => ({ getHubspotConfig: vi.fn() }));
vi.mock("../../storage.js", () => ({ storage: {} }));
vi.mock("../../storage", () => ({ storage: {} }));
vi.mock("../../crm/hubspot-provider", () => ({ hubspotRecordUrl: vi.fn() }));

import { chunk, readBatchOutcome } from "../link-health";

describe("readBatchOutcome", () => {
  it("marks every returned id found", () => {
    const out = readBatchOutcome(["1", "2"], { results: [{ id: "1", properties: {} }, { id: 2, properties: {} }] });
    expect([...out.found].sort()).toEqual(["1", "2"]);
    expect(out.missing.size).toBe(0);
    expect(out.merged.size).toBe(0);
  });

  it("marks ids named in an OBJECT_NOT_FOUND error missing (207)", () => {
    const out = readBatchOutcome(["1", "2", "3"], {
      status: "COMPLETE",
      results: [{ id: "1", properties: {} }],
      errors: [{ category: "OBJECT_NOT_FOUND", context: { ids: ["2", "3"] } }],
    });
    expect([...out.found]).toEqual(["1"]);
    expect([...out.missing].sort()).toEqual(["2", "3"]);
  });

  it("ignores other error categories, so an unexplained failure flags nothing", () => {
    const out = readBatchOutcome(["2"], { results: [], errors: [{ category: "RATE_LIMITS", context: { ids: ["2"] } }] });
    expect(out.missing.size).toBe(0);
    expect(out.found.size).toBe(0);
  });

  it("leaves an id that is neither returned nor reported missing unchanged", () => {
    const out = readBatchOutcome(["1", "9"], { results: [{ id: "1", properties: {} }] });
    expect(out.found.has("9")).toBe(false);
    expect(out.missing.has("9")).toBe(false);
  });

  it("maps a merged-away id to the surviving record", () => {
    const out = readBatchOutcome(["10", "11"], {
      results: [{ id: "20", properties: { hs_merged_object_ids: "10;11" } }],
    });
    expect(out.merged.get("10")).toBe("20");
    expect(out.merged.get("11")).toBe("20");
    expect(out.found.size).toBe(0);
  });

  it("doesn't treat a found id as merged or missing", () => {
    const out = readBatchOutcome(["5", "6"], {
      results: [
        { id: "5", properties: {} },
        { id: "7", properties: { hs_merged_object_ids: "5;6" } },
      ],
      errors: [{ category: "OBJECT_NOT_FOUND", context: { ids: ["5", "6"] } }],
    });
    expect(out.found.has("5")).toBe(true);
    expect(out.merged.has("5")).toBe(false);
    expect(out.merged.get("6")).toBe("7");
    expect(out.missing.size).toBe(0);
  });

  it("ignores ids that weren't requested and malformed bodies", () => {
    expect(readBatchOutcome(["1"], { results: [{ id: "99", properties: {} }] }).found.size).toBe(0);
    const empty = readBatchOutcome(["1"], null);
    expect(empty.found.size + empty.missing.size + empty.merged.size).toBe(0);
  });
});

describe("chunk", () => {
  it("splits into batches of the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 100)).toEqual([]);
  });
});
