// @vitest-environment node
//
// ImpactIQ activity counts on Manage Projects: the batched, cached client
// calls (ImpactIQ v1.454 POST /api/v1/effort/project-counts) and the
// project refs CriteriaIQ sends.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null as null | { baseUrl: string; apiKey: string; enabled: boolean },
}));

vi.mock("../config", () => ({ getImpactiqConfig: vi.fn(async () => mocks.config) }));
vi.mock("../../lib/outbound-url", () => {
  class OutboundUrlError extends Error {}
  return { OutboundUrlError, assertOutboundUrl: vi.fn(async (url: string) => new URL(url)) };
});

import { clearImpactiqCache, getProjectActivityCounts, ImpactiqError, requestActivityTypes, type ImpactiqProjectRef } from "../client";
import { crmProjectIdFromLink, toImpactiqProjectRef } from "../project-refs";

const KEY = "iqk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const SETTINGS = { activityTypes: ["POx Work"], opportunityFallback: false };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function ref(id: number): ImpactiqProjectRef {
  return { criteriaiqProjectId: id, crmProjectId: null, crmOpportunityId: null, startDate: null, endDate: null };
}

function answerFor(body: { projects: Array<{ criteriaiqProjectId: number }> }) {
  return {
    data: {
      version: 1,
      projects: body.projects.map((p) => ({ criteriaiqProjectId: p.criteriaiqProjectId, activityCount: p.criteriaiqProjectId % 7, totalHours: 1.5, lastActivityAt: null, viaOpportunity: 0 })),
    },
  };
}

beforeEach(() => {
  mocks.config = { baseUrl: "https://iq.example.com", apiKey: KEY, enabled: true };
  clearImpactiqCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getProjectActivityCounts", () => {
  it("is null when ImpactIQ isn't connected or is off", async () => {
    mocks.config = null;
    expect(await getProjectActivityCounts(SETTINGS, [ref(1)])).toBeNull();
    mocks.config = { baseUrl: "https://iq.example.com", apiKey: KEY, enabled: false };
    expect(await getProjectActivityCounts(SETTINGS, [ref(1)])).toBeNull();
  });

  it("asks in batches of 200 and caches the answers", async () => {
    const calls: Array<{ url: string; body: { activityTypes: string[]; projects: Array<{ criteriaiqProjectId: number }> }; auth: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: URL, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push({ url: String(url), body, auth: new Headers(init.headers).get("authorization") });
      return jsonResponse(200, answerFor(body));
    }));
    const refs = Array.from({ length: 450 }, (_, i) => ref(i + 1));
    const first = await getProjectActivityCounts(SETTINGS, refs);
    expect(calls.map((c) => c.body.projects.length)).toEqual([200, 200, 50]);
    expect(calls[0]!.url).toBe("https://iq.example.com/api/v1/effort/project-counts");
    expect(calls[0]!.auth).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.body.activityTypes).toEqual(["POx Work"]);
    expect(first!.counts.size).toBe(450);
    expect(first!.counts.get(10)).toMatchObject({ activityCount: 3 });

    await getProjectActivityCounts(SETTINGS, refs);
    expect(calls).toHaveLength(3);

    // Different settings are a different answer.
    await getProjectActivityCounts({ activityTypes: ["Demo"], opportunityFallback: false }, [ref(1)]);
    expect(calls).toHaveLength(4);
  });

  it("sends only filled-in fields", async () => {
    let sent: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: URL, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return jsonResponse(200, answerFor(sent as { projects: Array<{ criteriaiqProjectId: number }> }));
    }));
    await getProjectActivityCounts({ activityTypes: ["POx Work"], opportunityFallback: true }, [
      { criteriaiqProjectId: 5, crmProjectId: "a0X5e00000AbCdEFGH", crmOpportunityId: null, startDate: "2026-10-01", endDate: null },
    ]);
    expect(sent).toEqual({
      activityTypes: ["POx Work"],
      opportunityFallback: true,
      projects: [{ criteriaiqProjectId: 5, crmProjectId: "a0X5e00000AbCdEFGH", startDate: "2026-10-01" }],
    });
  });

  it("reports an ImpactIQ too old for the endpoint as not_supported", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, { error: "not found" })));
    await expect(getProjectActivityCounts(SETTINGS, [ref(1)])).rejects.toMatchObject({ code: "not_supported" });
    await expect(requestActivityTypes(mocks.config!)).rejects.toBeInstanceOf(ImpactiqError);
  });

  it("refuses an answer in the wrong shape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { data: { projects: [{ criteriaiqProjectId: "x" }] } })));
    await expect(getProjectActivityCounts(SETTINGS, [ref(1)])).rejects.toMatchObject({ code: "bad_response" });
  });
});

describe("project refs", () => {
  it("reads the CRM project id from the Evaluation link", () => {
    expect(crmProjectIdFromLink("https://acme.lightning.force.com/lightning/r/Evaluations__c/a0X5e00000AbCdE/view", "salesforce")).toMatch(/^a0X5e00000AbCdE[A-Za-z0-9]{3}$/);
    // A bare id comes back in its 18-character form.
    expect(crmProjectIdFromLink("a0X5e00000AbCdE", null)).toMatch(/^a0X5e00000AbCdE[A-Za-z0-9]{3}$/);
    expect(crmProjectIdFromLink("https://app.hubspot.com/contacts/123/record/0-970/456789", "hubspot")).toBe("456789");
    expect(crmProjectIdFromLink("Acme evaluation", "salesforce")).toBeNull();
    expect(crmProjectIdFromLink(null, "salesforce")).toBeNull();
  });

  it("builds the ref ImpactIQ needs and drops ids it would refuse", () => {
    expect(toImpactiqProjectRef({
      id: 9,
      crmProvider: "salesforce",
      crmOpportunityId: " 006Ab00000XyZ12AAB ",
      salesforceEvaluationLink: null,
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: "2026-11-30T00:00:00.000Z",
    })).toEqual({ criteriaiqProjectId: 9, crmProjectId: null, crmOpportunityId: "006Ab00000XyZ12AAB", startDate: "2026-10-01", endDate: "2026-11-30" });
    expect(toImpactiqProjectRef({ id: 9, crmOpportunityId: "006' OR 1" }).crmOpportunityId).toBeNull();
  });
});
