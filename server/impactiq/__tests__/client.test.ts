import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null as null | { baseUrl: string; apiKey: string; enabled: boolean },
  blocked: false,
}));

vi.mock("../config", () => ({
  getImpactiqConfig: vi.fn(async () => mocks.config),
}));

vi.mock("../../lib/outbound-url", () => {
  class OutboundUrlError extends Error {}
  return {
    OutboundUrlError,
    assertOutboundUrl: vi.fn(async (url: string) => {
      if (mocks.blocked) throw new OutboundUrlError("blocked");
      return new URL(url);
    }),
  };
});

import { checkImpactiqConnection, clearImpactiqCache, getOpportunityEffort, ImpactiqError, requestEffort, requestProjectActivities } from "../client";

const KEY = "iqk_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
const EFFORT = {
  version: 1,
  crmOpportunityId: "006Ab00000XyZ12AAB",
  totalHours: 6.75,
  activityCount: 3,
  firstActivityAt: "2026-10-18T15:00:00.000Z",
  lastActivityAt: "2026-10-22T15:00:00.000Z",
  byPerson: [{ name: "Ana SE", email: "ana@example.com", hours: 5.5, activityCount: 2 }],
  byType: [{ name: "POx Work", hours: 3.5, activityCount: 1 }],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof ImpactiqError ? error.code : "other";
  }
}

beforeEach(() => {
  mocks.config = { baseUrl: "https://impactiq.example.com/", apiKey: KEY, enabled: true };
  mocks.blocked = false;
  clearImpactiqCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestEffort", () => {
  it("sends the key as a bearer token, refuses redirects and returns the effort", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: EFFORT, error: null, meta: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const effort = await requestEffort({ baseUrl: "https://impactiq.example.com/", apiKey: KEY }, "006Ab00000XyZ12AAB");
    expect(effort).toEqual(EFFORT);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://impactiq.example.com/api/v1/effort?crmOpportunityId=006Ab00000XyZ12AAB");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(init.redirect).toBe("manual");
  });

  it("maps ImpactIQ's refusals to error codes", async () => {
    const cases: Array<[number, unknown, string]> = [
      [401, { error: "errors.apikey.invalid" }, "key_invalid"],
      [403, { error: "errors.apikey.wrong_scope" }, "key_wrong_scope"],
      [403, { error: "errors.auth.forbidden" }, "owner_not_leader"],
      [429, { error: "errors.rate_limited" }, "rate_limited"],
      [500, null, "bad_response"],
      [302, null, "bad_response"],
    ];
    for (const [status, body, code] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => (status === 302 ? new Response(null, { status }) : jsonResponse(status, body))));
      expect(await codeOf(requestEffort(mocks.config!, "1"))).toBe(code);
    }
  });

  it("refuses an answer that isn't an effort summary", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { data: { totalHours: "lots" } })));
    expect(await codeOf(requestEffort(mocks.config!, "1"))).toBe("bad_response");
  });

  it("refuses an address the outbound guard blocks, without calling it", async () => {
    mocks.blocked = true;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await codeOf(checkImpactiqConnection(mocks.config!))).toBe("url_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a network failure as unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    expect(await codeOf(requestEffort(mocks.config!, "1"))).toBe("unreachable");
  });
});

describe("getOpportunityEffort", () => {
  it("is null when ImpactIQ isn't connected or is switched off", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    mocks.config = null;
    expect(await getOpportunityEffort("006Ab00000XyZ12AAB")).toBeNull();
    mocks.config = { baseUrl: "https://impactiq.example.com", apiKey: KEY, enabled: false };
    expect(await getOpportunityEffort("006Ab00000XyZ12AAB")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches per Opportunity and returns ImpactIQ's address without the trailing slash", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: EFFORT }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await getOpportunityEffort("006Ab00000XyZ12AAB");
    const second = await getOpportunityEffort("006Ab00000XyZ12AAB");
    expect(first).toEqual({ effort: EFFORT, impactiqUrl: "https://impactiq.example.com" });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clearImpactiqCache();
    await getOpportunityEffort("006Ab00000XyZ12AAB");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("requestProjectActivities", () => {
  const row = { id: "a1", type: "POx Work", ownerName: "Ana SE", hours: 1, startAt: "2026-10-25T15:00:00.000Z", endAt: null, viaOpportunity: false };
  const list = (activities: unknown[]) => jsonResponse(200, { data: { activityCount: activities.length, totalHours: 1, truncated: false, activities } });
  const settings = { activityTypes: ["POx Work"], opportunityFallback: false };

  it("keeps the type's icon and color, and drops values that aren't a plain icon name or hex color", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => list([
      { ...row, id: "ok", typeIcon: "FlaskConical", typeColor: "#7C3AED" },
      { ...row, id: "bad", typeIcon: "<script>", typeColor: "red;background:url(x)" },
      { ...row, id: "none" },
    ])));
    const out = await requestProjectActivities({ baseUrl: "https://impactiq.example.com/", apiKey: KEY }, settings, { criteriaiqProjectId: 1 });
    expect(out.activities.map((a) => [a.id, a.typeIcon, a.typeColor])).toEqual([
      ["ok", "FlaskConical", "#7C3AED"],
      ["bad", null, null],
      ["none", null, null],
    ]);
  });
});
