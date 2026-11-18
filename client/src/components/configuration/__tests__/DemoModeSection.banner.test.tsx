// @vitest-environment happy-dom
//
// Task #775 — UI test for the per-session demo toggle on
// /config?tab=demo-mode. Asserts the round-trip the operator
// actually does:
//
//   1. Open the Demo Mode page → /api/demo/status returns
//      `active:false`, banner stays hidden.
//   2. Click the "Enter demo for my session" Switch → the page
//      POSTs to /api/demo/session/enter and invalidates queries.
//   3. The next /api/demo/status poll returns
//      `active:true, sessionFlag:true, source:"session"` →
//      <SidebarDemoIndicator collapsed={false} /> renders the amber sidebar card with the
//      "Demo Mode" label.
//
// Pre-existing tests only cover individual demo-mode helpers,
// not the page → banner round-trip, so a regression in the
// session toggle wiring (e.g. switching to a different POST URL,
// dropping the invalidation that re-fetches /api/demo/status,
// renaming the banner test-id) would slip through.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SidebarDemoIndicator } from "@/components/layout/SidebarDemoIndicator";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// ── External-module mocks ───────────────────────────────────────────
// wouter — the banner reads `useLocation` only to compute the
// excluded-route badge. Hand it the demo-mode tab path so the banner
// renders the "this screen is administrative" copy variant.
vi.mock("wouter", () => ({
  useLocation: () => ["/config?tab=demo-mode", () => {}],
}));

// useToast — DemoModeSection fires a toast on every mutation.
// We don't assert on the toast, so a no-op stub is enough. The
// module-level `toast` is what lib/toast-helper (showSuccessToast /
// showErrorToast) calls, so it needs a stub too.
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  toast: vi.fn(),
}));

// PersonaContext — apiRequest checks `getPersonaActive()` before
// allowing non-GET requests. Force it off so our toggle POST goes
// through. The real export lives in @/contexts/PersonaContext.
vi.mock("@/contexts/PersonaContext", () => ({
  getPersonaActive: () => false,
  PersonaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Lazy import after mocks so the module under test picks up the
// mocked dependencies above.
let DemoModeSection: React.ComponentType;
beforeEach(async () => {
  const mod = await import("@/components/configuration/DemoModeSection");
  DemoModeSection = mod.default;
});

// ── Render harness ──────────────────────────────────────────────────
let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

// Shared mutable status that the fetch mock returns from
// /api/demo/status. The toggle test mutates this between the
// initial render and the post-click re-poll.
let currentStatus: {
  active: boolean;
  source: string;
  sessionFlag: boolean;
  userFlag: boolean;
  appWideFlag: boolean;
  role: string | null;
  isAdmin: boolean;
  forcedUsers: unknown[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    json: async () => body,
    text: async () => JSON.stringify(body),
    // apiRequest refuses non-JSON 2xx bodies (parseJsonResponse).
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

function installFetchMock() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.startsWith("/api/demo/status")) {
      return jsonResponse(currentStatus);
    }
    if (url.startsWith("/api/demo/users")) {
      return jsonResponse([]);
    }
    if (url.startsWith("/api/demo/audit")) {
      return jsonResponse([]);
    }
    if (url.startsWith("/api/demo/counts")) {
      // Shape of GET /api/demo/counts. The catch-all `[]` below has no
      // `counts` key, which the row-count tiles dereference.
      return jsonResponse({ counts: {}, total: 0, hasAny: false });
    }
    if (url.startsWith("/api/demo/session/enter") && method === "POST") {
      // Flip the in-memory status so the next /api/demo/status poll
      // returns "active". This mirrors what the real server does.
      currentStatus = {
        ...currentStatus,
        active: true,
        sessionFlag: true,
        source: "session",
      };
      return jsonResponse({ ok: true });
    }
    if (url.startsWith("/api/demo/session/exit") && method === "POST") {
      currentStatus = {
        ...currentStatus,
        active: false,
        sessionFlag: false,
        source: "none",
      };
      return jsonResponse({ ok: true });
    }
    // Any other URL the page touches (e.g. dashboard-layouts cache
    // invalidations triggered by `qc.invalidateQueries()`) gets an
    // empty-array success response so React Query doesn't surface
    // a network error.
    return jsonResponse([]);
  });
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
}

async function flush() {
  // Settle React Query's fetch + observer + React commit.
  // 10 macrotask ticks is enough for the chained
  // `apiRequest → onSuccess → invalidate → refetch → render` cycle.
  for (let i = 0; i < 15; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function render() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        refetchOnWindowFocus: false,
        // The page's `useQuery` calls (status, users, audit) rely on
        // the production `queryClient`'s default queryFn that fetches
        // `queryKey[0]` as a URL. We don't import that real client
        // here (it would pull every other initialiser with it), so
        // mirror the same contract: GET the first key element and
        // return its JSON body. The fetch mock above intercepts.
        queryFn: async ({ queryKey }) => {
          const url = queryKey[0] as string;
          const res = await fetch(url, { credentials: "include" });
          return res.json();
        },
      },
      mutations: { retry: false },
    },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <SidebarDemoIndicator collapsed={false} />
        <DemoModeSection />
      </QueryClientProvider>,
    );
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  currentStatus = {
    active: false,
    source: "none",
    sessionFlag: false,
    userFlag: false,
    appWideFlag: false,
    role: "Admin",
    isAdmin: true,
    forcedUsers: [],
  };
  installFetchMock();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("Demo Mode page → per-session toggle → banner", () => {
  it("hides the banner when /api/demo/status reports inactive on first load", async () => {
    render();
    await flush();
    // The page rendered, but the banner is gated on
    // `data?.active === true`, so it must not be in the DOM.
    expect(
      container.querySelector('[data-testid="demo-mode-section"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="demo-mode-indicator"]'),
    ).toBeNull();
    // Per-session switch is rendered and unchecked (Radix surfaces
    // the checked state as `data-state="unchecked"`).
    const toggle = container.querySelector(
      '[data-testid="demo-session-toggle"]',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("data-state")).toBe("unchecked");
  });

  it("flipping the per-session switch on shows the yellow banner with the active-source copy", async () => {
    render();
    await flush();
    const toggle = container.querySelector(
      '[data-testid="demo-session-toggle"]',
    ) as HTMLButtonElement;
    expect(toggle).not.toBeNull();

    // Click the Switch — Radix renders it as a <button role="switch">,
    // so a plain MouseEvent on it fires `onCheckedChange(true)`,
    // which calls `apiRequest("POST", "/api/demo/session/enter")`.
    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    // Verify the page actually POSTed to the session-enter endpoint.
    const postCalls = fetchMock.mock.calls.filter(
      ([, init]: [unknown, RequestInit | undefined]) =>
        (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(
      postCalls.some(([url]: [string]) =>
        String(url).startsWith("/api/demo/session/enter"),
      ),
    ).toBe(true);

    // After the POST + invalidation + re-poll, the banner must
    // appear with the amber styling, the source-aware copy, and
    // the data-source attribute the e2e contract advertises.
    const banner = container.querySelector('[data-testid="demo-mode-indicator"]');
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("data-demo-source")).toBe("session");
    expect(banner?.className).toContain("bg-amber-100");
    expect(banner?.className).toContain("border-amber-300");
    expect(banner?.textContent).toContain("Demo Mode");
    expect(banner?.textContent?.toLowerCase()).toContain("your session");

    // The Demo Mode page itself is on the excluded list, so the
    // banner must show the "this screen is administrative" copy
    // variant rather than the "synthetic data" copy.
    expect(banner?.getAttribute("data-demo-excluded")).toBe("true");
    expect(banner?.textContent).toContain("administrative");

    // The Switch in the page now reflects the on state.
    expect(
      container
        .querySelector('[data-testid="demo-session-toggle"]')
        ?.getAttribute("data-state"),
    ).toBe("checked");
  });
});
