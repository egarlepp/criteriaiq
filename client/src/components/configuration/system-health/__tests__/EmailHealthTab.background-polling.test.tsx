// @vitest-environment happy-dom
//
// Coverage for Task #417 — pin the "pause polling while the tab is
// hidden" behaviour on the per-category Health tabs. The overview's
// equivalent test lives in
// `client/src/components/configuration/__tests__/SystemHealthSection.test.tsx`
// (Task #411). Picking EmailHealthTab as the canary here keeps the
// test surface small (no admin gating, no embedded panels), but the
// `refetchIntervalInBackground: false` contract it exercises is
// shared by every sibling tab via the same explicit settings.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

import { EmailHealthTab } from "../EmailHealthTab";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

function buildEmailHealth() {
  return {
    status: "ok" as const,
    lastChecked: new Date("2026-04-01T12:00:00Z").toISOString(),
    message: "ok",
    configuration: {
      isConfigured: true,
      enabled: true,
      provider: "sendgrid",
      server: null,
      port: null,
    },
    queueStats: { firedToday: 0, sent24h: 0, failed24h: 0, totalLogs: 0, sentThisWeek: 0, sentThisMonth: 0, successRate: 0 },
    recentFailures: [],
    lastSendStatus: { success: null, sentAt: null, error: null },
    schedulerStatus: { active: true, lastRun: null, enabledRulesCount: 0 },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function renderTab(client: QueryClient) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <EmailHealthTab />
      </QueryClientProvider>,
    );
  });
  // Flush a couple of microtask turns so the initial fetch resolves
  // before assertions look at the call count.
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("EmailHealthTab background polling contract (Task #417)", () => {
  it("polls /api/system/health/email after the configured interval while the tab is visible", async () => {
    let healthHits = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes("/api/system/health/email")) {
        healthHits += 1;
        return jsonResponse(200, buildEmailHealth());
      }
      return jsonResponse(404, {});
    }) as unknown as typeof fetch;

    // `shouldAdvanceTime: true` keeps the real clock ticking so the
    // microtask flushes inside `renderTab` resolve while the mock
    // clock controls TanStack Query's interval scheduler.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await renderTab(client);

      // Initial mount fetch must have landed before we touch the clock,
      // otherwise the post-advance count below would be off by one and
      // the test would pass for the wrong reason.
      expect(healthHits).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(60_000);
      });
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      // `>= 2` (rather than `=== 2`) tolerates any focus-driven
      // refetch that may overlap on slower CI without masking the
      // regression we care about (which would leave it stuck at 1).
      expect(healthHits).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll /api/system/health/email while the tab is hidden so background tabs don't waste resources", async () => {
    // Mirrors the "debounced/paused while the tab is hidden" line in
    // Task #411's contract, applied to a sub-tab. TanStack Query reads
    // the tab's focus state from its `focusManager`; flipping
    // `document.hidden` and dispatching `visibilitychange` is what
    // production uses to drive it, so we replay the same handshake
    // here rather than reaching into the manager directly.
    let healthHits = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      if (url.includes("/api/system/health/email")) {
        healthHits += 1;
        return jsonResponse(200, buildEmailHealth());
      }
      return jsonResponse(404, {});
    }) as unknown as typeof fetch;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await renderTab(client);
      expect(healthHits).toBe(1);

      // Mark the document hidden and notify TanStack Query's focus
      // manager. `Object.defineProperty` is required because
      // `document.visibilityState` and `document.hidden` are read-only
      // getters in happy-dom.
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // Spin the clock well past the 60s polling interval. With the
      // tab hidden, `refetchIntervalInBackground: false` should keep
      // the count pinned at the initial mount fetch. Without the
      // explicit setting, a future TanStack Query default change
      // could silently start polling here.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(180_000);
      });
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      expect(healthHits).toBe(1);

      // Restore visibility for downstream tests so they don't inherit
      // the hidden state.
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => false,
      });
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
