// @vitest-environment happy-dom
//
// Contract test for `apiRequest` — task #754.
//
// This test pins down the single, app-wide invariant that the entire
// task #754 sweep depends on: `apiRequest` returns the *parsed* JSON
// body, NOT a Fetch `Response`. Every call site that previously did
// `const res = await apiRequest(...); return res.json();` was silently
// throwing a `TypeError: res.json is not a function`, which mutation
// callers swallowed into their `onError` branch — the user saw a
// failure toast even though the server happily wrote the change.
//
// Locking the contract here means:
//   1. Any future edit to `apiRequest` that accidentally returns the
//      raw `Response` (or wraps it in something with a `.json` method)
//      fails this test before it can break callers.
//   2. The `scripts/check-api-request-json-usage.ts` lint script and
//      this contract test together form a two-layer defense — the lint
//      stops authors from re-introducing the antipattern at the call
//      site; this test stops the helper itself from silently changing
//      shape underneath them.
//
// We deliberately exercise the *real* `apiRequest` (no shim, no
// stand-in) and only mock the underlying `fetch` so that any future
// regression in the helper surfaces here rather than in some downstream
// component test.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "../queryClient";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  // Defensive — every test installs its own mock; this just
  // guarantees we never reuse a previous one across files if vitest
  // shares the module instance.
  globalThis.fetch = ORIGINAL_FETCH;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function mockJsonResponse(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as typeof globalThis.fetch;
}

function mockEmptyResponse(status: number): void {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(null, { status }),
  ) as typeof globalThis.fetch;
}

describe("apiRequest — returns parsed body, not a Response (task #754)", () => {
  it("returns the parsed JSON object directly for a 200 OK GET", async () => {
    mockJsonResponse({ id: 7, name: "Acme" });

    const result = await apiRequest("GET", "/api/things/7");

    // Plain JSON object, NOT a Response.
    expect(result).toEqual({ id: 7, name: "Acme" });
    // The whole bug was call sites doing `result.json()` on this
    // value. Lock the absence of that method so a future change that
    // silently re-wraps the body in a Response shape fails here.
    expect((result as Record<string, unknown>).json).toBeUndefined();
    expect(typeof (result as Record<string, unknown>).json).not.toBe("function");
  });

  it("returns the parsed JSON object for a 201 Created POST so mutations consume it directly", async () => {
    mockJsonResponse({ id: 42, created: true }, 201);

    const result = await apiRequest("POST", "/api/things", { name: "Acme" });

    expect(result).toEqual({ id: 42, created: true });
    expect((result as Record<string, unknown>).json).toBeUndefined();
  });

  it("returns null (not a Response) for 204 No Content so callers can `await` without crashing", async () => {
    mockEmptyResponse(204);

    const result = await apiRequest("DELETE", "/api/things/7");

    expect(result).toBeNull();
    // Defensive — make sure `null` literally surfaces (not `undefined`),
    // because mutation `onSuccess(data)` callers branch on it.
    expect(result).not.toBeUndefined();
  });

  // Task #766 — pin the 304 contract.
  //
  // Before #766, `apiRequest` had a dead `if (status === 304) return null`
  // branch sitting BELOW the `!response.ok` check. Fetch's `response.ok`
  // is only true for 200–299, so a 304 (which the browser HTTP cache can
  // emit transparently from a stored ETag/Last-Modified, even when our
  // code didn't add conditional headers) hit the error branch first and
  // surfaced as the unhelpful `ApiError("HTTP 304: ")` (statusText is
  // empty for 304s). The fix moves the 204/304 short-circuit ABOVE the
  // `!response.ok` check; this test locks that contract so a future
  // refactor that re-introduces the dead branch fails here instead of
  // confusing a user with an "HTTP 304: " toast.
  it("returns null for 304 Not Modified (browser HTTP-cache revalidation) instead of throwing 'HTTP 304: '", async () => {
    mockEmptyResponse(304);

    const result = await apiRequest("GET", "/api/things/7");

    expect(result).toBeNull();
    expect(result).not.toBeUndefined();
  });

  it("returns nested arrays/objects intact (no Response wrapping)", async () => {
    const body = {
      items: [
        { id: 1, tags: ["a", "b"] },
        { id: 2, tags: [] },
      ],
      total: 2,
    };
    mockJsonResponse(body);

    const result = await apiRequest("GET", "/api/things");

    expect(result).toEqual(body);
    // Arrays in the response should be real arrays, not iterables
    // of a Response stream.
    expect(Array.isArray((result as { items: unknown[] }).items)).toBe(true);
  });
});
