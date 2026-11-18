// @vitest-environment happy-dom
//
// useAuth's queryFn decides where a 401 from /api/auth/user goes:
//   1. Setup incomplete (no admin) → /setup.
//   2. Setup complete, and the browser signed in moments ago (the
//      "just signed in" marker is fresh) → /setup?reentry=1, because the
//      cookie never stuck.
//   3. Anything else, including an ordinary expiry mid-session → no
//      redirect: the sign-in page renders, with a notice if this page
//      load had a signed-in user.

import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useAuth } from "../useAuth";
import { PersonaProvider } from "@/contexts/PersonaContext";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;
let originalLocation: Location;
let assignedHref: string | null;
let queryClient: QueryClient;

function setupLocation(pathname = "/") {
  // jsdom/happy-dom blocks `window.location = …` assignment, but we can
  // intercept the `href` setter to capture redirect attempts without
  // actually navigating. Snapshot the original href as a plain string
  // up front so the getter cannot recursively call back into itself
  // through the wrapped property descriptor.
  originalLocation = window.location;
  const snapshotHref = String(originalLocation.href);
  assignedHref = null;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      pathname,
      search: "",
      get href() {
        return snapshotHref;
      },
      set href(v: string) {
        assignedHref = v;
      },
    },
  });
}

function restoreLocation() {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
}

interface MockOpts {
  authStatus: number;
  setupStatus: {
    setupRequired?: boolean;
    adminExists?: boolean;
    setupCompletedAt?: string | null;
  };
  /**
   * Body returned for /api/auth/user. Defaults to `{}` so legacy
   * tests (which only care about the redirect side-effect of a 401)
   * keep working unchanged. Tests covering the successful-auth path
   * pass a real user-shaped object so useAuth treats the response
   * as authenticated and marks the session.
   */
  authBody?: Record<string, unknown>;
}

function installFetchMock(opts: MockOpts) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/auth/user")) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.authBody ?? {}), {
          status: opts.authStatus,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify(opts.setupStatus), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof globalThis.fetch;
}

function HookProbe({ onResult }: { onResult: (a: ReturnType<typeof useAuth>) => void }) {
  const result = useAuth();
  React.useEffect(() => {
    onResult(result);
    // We only need the first stable result for these tests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.isLoading]);
  return null;
}

function renderHook(onResult: (a: ReturnType<typeof useAuth>) => void) {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <PersonaProvider>
          <HookProbe onResult={onResult} />
        </PersonaProvider>
      </QueryClientProvider>,
    );
  });
}

async function flush(times = 6) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  setupLocation("/");
  // Task #420: each test starts with a clean localStorage so the
  // "had a session" marker (criteriaiq:hadSession) is never leaked
  // between tests. Tests that exercise the post-Redeploy bounce
  // explicitly seed the marker in their own arrange step.
  try {
    window.localStorage.removeItem("criteriaiq:hadSession");
  } catch {
    /* localStorage unavailable in some test envs — safe to ignore */
  }
  // Task #455: same hygiene for the explicit-exit sessionStorage
  // flag so the bounce-suppression test can't bleed into the
  // unguarded "marker set, no flag → bounce" assertion that
  // immediately follows it.
  try {
    window.sessionStorage.removeItem("criteriaiq:fromSetup");
    window.sessionStorage.removeItem("auth.sessionIdleTimeout");
    window.sessionStorage.removeItem("auth.sessionExpired");
  } catch {
    /* sessionStorage unavailable in some test envs — safe to ignore */
  }
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  restoreLocation();
  try {
    window.localStorage.removeItem("criteriaiq:hadSession");
  } catch {
    /* see beforeEach */
  }
  try {
    window.sessionStorage.removeItem("criteriaiq:fromSetup");
  } catch {
    /* see beforeEach */
  }
  vi.restoreAllMocks();
});

describe("useAuth redirect decision (task-378)", () => {
  it("redirects to /setup (no reentry tag) when setup is incomplete (no admin)", async () => {
    installFetchMock({
      authStatus: 401,
      setupStatus: { setupRequired: false, adminExists: false, setupCompletedAt: null },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBe("/setup");
  });

  it("redirects to /setup?reentry=1 on 401 when setup has previously been completed AND the browser has held a session before (task-378 + task-420)", async () => {
    // The exact case from the architect review: setupRequired=false,
    // adminExists=true, setupCompletedAt set, /api/auth/user 401.
    // Task #420: ALSO requires the browser-local "had a session"
    // marker — seeded here to mirror the post-redeploy reality
    // (operator successfully logged in once before the container
    // was redeployed and lost the session cookie). Since c0678754 the
    // marker is an epoch-ms timestamp that must be inside the 30-min
    // freshness window — the legacy "1" sentinel reads as stale.
    window.localStorage.setItem("criteriaiq:hadSession", String(Date.now()));
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBe("/setup?reentry=1");
    // Cleared so "Go to Login" on the health check can't loop back here.
    expect(window.localStorage.getItem("criteriaiq:hadSession")).toBeNull();
  });

  // Task #455 — even when EVERY existing bounce condition is true
  // (401 + setupCompletedAt set + had-a-session marker present),
  // the explicit-exit sessionStorage flag set by both wizard
  // "Go to Login" buttons (Done step + health-check view) MUST
  // suppress the bounce. Without this gate the marker traps the
  // operator on the diagnostic screen on every attempt to reach
  // the login form, because dev auto-login / a prior admin session
  // permanently flips the marker on. This test pins the suppression.
  it("does NOT redirect on 401 when the explicit-exit flag is set, even with the marker present (task-455)", async () => {
    // Fresh marker, so the explicit-exit flag is the ONLY thing
    // suppressing the bounce (a stale marker would skip it anyway).
    window.localStorage.setItem("criteriaiq:hadSession", String(Date.now()));
    window.sessionStorage.setItem("criteriaiq:fromSetup", "1");
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(
      assignedHref,
      "operator who explicitly clicked 'Go to Login' must reach the login form, not be bounced back to the health-check view",
    ).toBeNull();
    // The flag must persist after the bounce-suppression read so a
    // failed first-credential attempt (401) doesn't bounce mid-
    // session — Landing clears it on successful login / banner
    // dismiss instead.
    expect(window.sessionStorage.getItem("criteriaiq:fromSetup")).toBe("1");
  });

  it("does NOT redirect on 401 when setup is complete but the browser has never held a session (task-420 fresh-install no-bounce)", async () => {
    // The bug task-420 was filed against: post-redeploy, /api/setup/
    // status reports setupCompletedAt set, /api/auth/user is 401, but
    // the operator on this browser has never successfully logged in.
    // Pre-task-420, useAuth bounced them to /setup?reentry=1 and the
    // "Go to login" button on that screen looped them right back. We
    // gate the bounce on the localStorage marker so this case falls
    // through to the normal landing page.
    expect(window.localStorage.getItem("criteriaiq:hadSession")).toBeNull();
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on 401 when the marker is not a timestamp", async () => {
    window.localStorage.setItem("criteriaiq:hadSession", "1");
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on 401 when the sign-in was more than 2 minutes ago (session expired mid-use)", async () => {
    // The production report: signed in hours ago, the 8-hour absolute
    // session TTL ran out while the user was working. That is an
    // ordinary expiry and belongs on the sign-in page, not Setup.
    window.localStorage.setItem(
      "criteriaiq:hadSession",
      String(Date.now() - 3 * 60 * 1000),
    );
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect on 401 after the marker has been cleared (post-logout, task-420)", async () => {
    // Mirrors the "operator clicks Sign Out → revisits /" flow. The
    // logout call sites clear the marker; if the server then returns
    // 401 we must NOT bounce them to the health-check view.
    window.localStorage.setItem("criteriaiq:hadSession", "1");
    window.localStorage.removeItem("criteriaiq:hadSession");
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });

  it("does NOT redirect when setup is complete but no marker is present (legacy data)", async () => {
    // Pre-task-378 deployments will have setupCompletedAt=null even
    // though setup is functionally complete. We must NOT redirect on
    // every plain 401 in that case (would loop on the login page).
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: null,
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });

  it("does NOT write the sign-in marker on a successful /api/auth/user (only an explicit sign-in does)", async () => {
    // Refreshing the marker on every poll kept it fresh for an active
    // user, so their session expiring sent them to Setup.
    installFetchMock({
      authStatus: 200,
      authBody: { id: "user-1", email: "operator@example.com", role: "admin" },
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
    expect(window.localStorage.getItem("criteriaiq:hadSession")).toBeNull();
  });

  it("flags an idle-timeout 401 for the sign-in notice and does not redirect", async () => {
    window.localStorage.setItem("criteriaiq:hadSession", String(Date.now()));
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ message: "Session expired due to inactivity.", code: "SESSION_IDLE_TIMEOUT" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as unknown as typeof globalThis.fetch;
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
    expect(window.sessionStorage.getItem("auth.sessionIdleTimeout")).toBe("1");
    expect(window.localStorage.getItem("criteriaiq:hadSession")).toBeNull();
  });

  it("does NOT redirect when already on /setup (avoids a redirect loop)", async () => {
    setupLocation("/setup");
    installFetchMock({
      authStatus: 401,
      setupStatus: {
        setupRequired: false,
        adminExists: true,
        setupCompletedAt: "2026-04-26T12:00:00.000Z",
      },
    });
    renderHook(() => {});
    await flush();
    expect(assignedHref).toBeNull();
  });
});
