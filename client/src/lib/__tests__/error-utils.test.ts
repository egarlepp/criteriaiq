// @vitest-environment happy-dom
//
// Locks the contract that the wizard's error logger does NOT POST to
// /api/error-logs while the operator is on the /setup wizard. The setup
// route runs in setup-only mode where the endpoint returns 503 and there
// is no logged-in session; the previous unconditional POST produced a
// tight loop of console-noise 503 responses every render the wizard's
// error boundary fired. We also assert that real authenticated routes
// keep posting so server-side error tracking is not silently dropped.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logError } from "../error-utils";

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(null, { status: 200 }),
  ) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* happy-dom may throw on quota; ignore */
  }
});

function setPath(path: string) {
  // happy-dom supports replacing window.location via assignment to href,
  // but the simplest reliable mutation is to override pathname on the
  // existing object via Object.defineProperty.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname: path, href: `http://app.test${path}` },
  });
}

describe("logError", () => {
  it("skips POST /api/error-logs while on the setup wizard", () => {
    setPath("/setup/secrets");
    logError(new Error("boom"), "wizard-test");
    // The fetch mock was called zero times because the /setup branch
    // short-circuits the network round-trip.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("still POSTs error logs from authenticated app pages", () => {
    setPath("/projects/123");
    logError(new Error("real error"), "app-test");
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("/api/error-logs");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("does not recursively POST when a previous /api/error-logs call returned 503", () => {
    setPath("/projects/123");
    logError(
      { status: 503, url: "/api/error-logs", message: "logger down" },
      "log-recurse-test",
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
