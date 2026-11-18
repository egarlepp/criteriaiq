import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  config: null as null | { accessToken: string; portalId: string | null },
  holds: 0,
  crm: "none" as string,
  saved: [] as unknown[],
  ownersCleared: 0,
  configCleared: 0,
}));

vi.mock("../config", () => ({
  getHubspotConfig: vi.fn(async () => mocks.config),
  isHubspotConfigured: vi.fn(async () => mocks.config !== null),
  setHubspotConfig: vi.fn(async (...args: unknown[]) => {
    mocks.saved.push(args);
  }),
  saveHubspotCheck: vi.fn(async () => {}),
  clearHubspotConfig: vi.fn(async () => {
    mocks.configCleared++;
  }),
}));

vi.mock("../../storage", () => ({
  storage: {
    countCrmLinkedData: vi.fn(async () => ({ salesforce: 0, hubspot: mocks.holds })),
    clearHubspotOwners: vi.fn(async () => {
      mocks.ownersCleared++;
    }),
    getHubspotOwnerMatchSummary: vi.fn(async () => ({ owners: 0, lastSyncedAt: null, matchedUsers: 0, unmatchedUsers: [] })),
  },
}));

vi.mock("../../crm/provider-setting", () => ({
  getCrmProviderId: vi.fn(async () => mocks.crm),
}));

import { SlidingWindowLimiter, applyRateLimitHeaders } from "../rate-limiter";
import { buildHubspotUrl, hubspotRequest, HubspotError, HUBSPOT_API_BASE } from "../client";
import { classifyProbe, HUBSPOT_PROBES } from "../capabilities";
import { ownerRows, ownerTeams } from "../owners";
import { hubspotPortalChangeAllowed, removeHubspotConnection, saveHubspotToken } from "../connection";
import { HUBSPOT_CAPABILITY_KEYS } from "@shared/hubspot";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

beforeEach(() => {
  mocks.config = null;
  mocks.holds = 0;
  mocks.crm = "none";
  mocks.saved = [];
  mocks.ownersCleared = 0;
  mocks.configCleared = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SlidingWindowLimiter", () => {
  it("lets max requests through, then waits for the oldest to leave the window", async () => {
    let t = 0;
    const sleeps: number[] = [];
    const limiter = new SlidingWindowLimiter(
      { max: 2, intervalMs: 1000 },
      () => t,
      async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    expect(sleeps).toEqual([]);
    await limiter.acquire();
    expect(sleeps).toEqual([1000]);
  });

  it("follows HubSpot's reported limit with a 10% margin", () => {
    const limiter = new SlidingWindowLimiter({ max: 90, intervalMs: 10_000 });
    applyRateLimitHeaders(
      new Headers({ "x-hubspot-ratelimit-max": "190", "x-hubspot-ratelimit-interval-milliseconds": "10000" }),
      limiter,
    );
    expect(limiter.limits).toEqual({ max: 171, intervalMs: 10_000 });
  });

  it("ignores missing or nonsense headers", () => {
    const limiter = new SlidingWindowLimiter({ max: 90, intervalMs: 10_000 });
    applyRateLimitHeaders(new Headers({ "x-hubspot-ratelimit-max": "abc" }), limiter);
    expect(limiter.limits).toEqual({ max: 90, intervalMs: 10_000 });
  });
});

describe("buildHubspotUrl", () => {
  it("keeps every request on api.hubapi.com", () => {
    expect(buildHubspotUrl("/crm/v3/owners", { limit: 1, after: undefined }).toString()).toBe(
      `${HUBSPOT_API_BASE}/crm/v3/owners?limit=1`,
    );
  });

  it("refuses a path that could point the token at another host", () => {
    expect(() => buildHubspotUrl("//evil.example.com/x")).toThrow();
    expect(() => buildHubspotUrl("https://evil.example.com/x")).toThrow();
    expect(() => buildHubspotUrl("crm/v3/owners")).toThrow();
  });
});

describe("hubspotRequest", () => {
  it("throws not_configured with no saved token", async () => {
    await expect(hubspotRequest("/crm/v3/owners")).rejects.toMatchObject({ code: "not_configured" });
  });

  it("throws unauthorized on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, {})));
    await expect(hubspotRequest("/crm/v3/owners", { token: "pat-test-token" })).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("does not retry HubSpot's daily limit", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { policyName: "DAILY" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(hubspotRequest("/crm/v3/owners", { token: "pat-test-token" })).rejects.toBeInstanceOf(HubspotError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the token only as a bearer header and never follows redirects", async () => {
    const fetchMock = vi.fn(async (_url: URL, _init: RequestInit) => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await hubspotRequest("/crm/v3/owners", { token: "pat-test-token" });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`${HUBSPOT_API_BASE}/crm/v3/owners`);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer pat-test-token");
    expect(init.redirect).toBe("manual");
  });
});

describe("classifyProbe", () => {
  it("reads 403 as missing and 2xx as ok", () => {
    expect(classifyProbe("GET", 403)).toBe("missing");
    expect(classifyProbe("GET", 200)).toBe("ok");
    expect(classifyProbe("GET", 500)).toBe("unknown");
  });

  it("reads a write probe's 404 or 400 as allowed, since scopes are checked first", () => {
    expect(classifyProbe("PATCH", 404)).toBe("ok");
    expect(classifyProbe("PATCH", 400)).toBe("ok");
    expect(classifyProbe("GET", 404)).toBe("unknown");
  });

  it("probes every capability exactly once", () => {
    expect(HUBSPOT_PROBES.map((p) => p.key).sort()).toEqual([...HUBSPOT_CAPABILITY_KEYS].sort());
  });
});

describe("ownerRows", () => {
  it("keeps numeric ids only, lowercases email, and lets active win over archived", () => {
    const rows = ownerRows(
      [{ id: "11", email: "A@Example.com", firstName: "Ann" }, { id: "x1" }],
      [{ id: "11", email: "old@example.com" }, { id: 22, email: "gone@example.com" }],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "11", email: "a@example.com", archived: false, firstName: "Ann" }),
        expect.objectContaining({ id: "22", archived: true }),
      ]),
    );
    expect(rows).toHaveLength(2);
  });

  it("keeps each owner's teams, dropping malformed ones", () => {
    const [row] = ownerRows(
      [{ id: "11", teams: [{ id: "7", name: "EMEA SE", primary: true }, { id: 8 }, { id: "bad" }, null] }],
      [],
    );
    expect(row.teams).toEqual([
      { id: "7", name: "EMEA SE", primary: true },
      { id: "8", name: "8", primary: false },
    ]);
    expect(ownerTeams(undefined)).toEqual([]);
  });
});

describe("portal lock", () => {
  it("allows any portal while nothing links to HubSpot", () => {
    expect(hubspotPortalChangeAllowed("1", "2", false)).toBe(true);
    expect(hubspotPortalChangeAllowed(null, "2", true)).toBe(true);
  });

  it("refuses a different or unnamed portal once records link to the saved one", () => {
    expect(hubspotPortalChangeAllowed("1", "1", true)).toBe(true);
    expect(hubspotPortalChangeAllowed("1", "2", true)).toBe(false);
    expect(hubspotPortalChangeAllowed("1", null, true)).toBe(false);
  });

  it("saveHubspotToken refuses a key for another portal and saves nothing", async () => {
    mocks.config = { accessToken: "pat-old-token", portalId: "111" };
    mocks.holds = 3;
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { portalId: 222, accountType: "STANDARD" })));
    const result = await saveHubspotToken("pat-new-token", "u1");
    expect(result).toEqual({ ok: false, status: 409, errorCode: "portal_locked" });
    expect(mocks.saved).toHaveLength(0);
  });

  it("saveHubspotToken never saves a key HubSpot rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, {})));
    const result = await saveHubspotToken("pat-bad-token", "u1");
    expect(result).toEqual({ ok: false, status: 400, errorCode: "unauthorized" });
    expect(mocks.saved).toHaveLength(0);
  });

  it("saveHubspotToken clears the owner copy when the portal changes", async () => {
    mocks.config = { accessToken: "pat-old-token", portalId: "111" };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { portalId: 222 })));
    const result = await saveHubspotToken("pat-new-token", "u1");
    expect(result).toMatchObject({ ok: true, portalChanged: true });
    expect(mocks.saved).toHaveLength(1);
    expect(mocks.ownersCleared).toBe(1);
  });
});

describe("removeHubspotConnection", () => {
  it("refuses while HubSpot is the CRM", async () => {
    mocks.crm = "hubspot";
    expect(await removeHubspotConnection()).toEqual({ ok: false, status: 409, errorCode: "in_use" });
    expect(mocks.configCleared).toBe(0);
  });

  it("removes the key and the owner copy otherwise", async () => {
    expect(await removeHubspotConnection()).toEqual({ ok: true });
    expect(mocks.configCleared).toBe(1);
    expect(mocks.ownersCleared).toBe(1);
  });
});
