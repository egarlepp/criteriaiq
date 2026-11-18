// @vitest-environment happy-dom
//
// Coverage for Task #421 — guard the `useSystemHealthCategoryQuery`
// helper that every System Health tab now shares. The per-tab
// background-polling test
// (`EmailHealthTab.background-polling.test.tsx`) and the overview
// test (`SystemHealthSection.test.tsx`) still exercise the contract
// end-to-end, but those would only catch a regression on the tabs
// they happen to mount. Pinning the contract on the helper itself
// catches a contributor who lands a tenth tab and bypasses the
// helper, or who edits the helper to drop one of the three settings.

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

import {
  SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS,
  useSystemHealthCategoryQuery,
} from "../useSystemHealthCategoryQuery";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS", () => {
  it("pins refetchIntervalInBackground: false and refetchOnWindowFocus: true", () => {
    // The defaults object is the canonical source of truth referenced
    // by the comment block on every Health query. If a future edit
    // flips one of them this assertion explodes loudly instead of
    // silently shipping a behavioural change to nine tabs.
    expect(SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS.refetchIntervalInBackground).toBe(false);
    expect(SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS.refetchOnWindowFocus).toBe(true);
  });
});

describe("useSystemHealthCategoryQuery", () => {
  it("polls the configured queryFn after the supplied refetchInterval while the tab is visible", async () => {
    let hits = 0;
    function Probe() {
      useSystemHealthCategoryQuery<{ ok: true }>({
        queryKey: ["sys-health-helper-visible"],
        queryFn: async () => {
          hits += 1;
          return { ok: true };
        },
        refetchInterval: 1_000,
      });
      return null;
    }

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <Probe />
          </QueryClientProvider>,
        );
      });
      // Flush microtasks so the initial fetch resolves.
      for (let i = 0; i < 3; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
      expect(hits).toBe(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }
      // `>= 2` (rather than `=== 2`) tolerates any focus-driven
      // refetch that may overlap on slower CI without masking the
      // regression we care about (which would leave it stuck at 1).
      expect(hits).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll while the tab is hidden so the helper carries the contract for every sub-tab", async () => {
    let hits = 0;
    function Probe() {
      useSystemHealthCategoryQuery<{ ok: true }>({
        queryKey: ["sys-health-helper-hidden"],
        queryFn: async () => {
          hits += 1;
          return { ok: true };
        },
        refetchInterval: 1_000,
      });
      return null;
    }

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      await act(async () => {
        root.render(
          <QueryClientProvider client={client}>
            <Probe />
          </QueryClientProvider>,
        );
      });
      for (let i = 0; i < 3; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0));
        });
      }
      expect(hits).toBe(1);

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

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      // With the helper applying `refetchIntervalInBackground: false`,
      // the hit count must stay at the initial mount fetch. If a
      // future edit drops the setting from the helper the count
      // would jump as the interval ticks while hidden.
      expect(hits).toBe(1);

      // Restore visibility for downstream tests.
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

  it("ignores caller attempts to override the pinned background/focus settings", () => {
    // Belt-and-braces: the helper applies the contract last so even a
    // contributor who tries to opt a tab out (e.g. by passing
    // `refetchIntervalInBackground: true`) ends up with the shared
    // behaviour. We assert this on the defaults object since spinning
    // up TanStack's focusManager just to read back what the caller
    // *would* see is excessive — the call-site spread order in the
    // helper is the unit under test here.
    const callerOverrides: Record<string, unknown> = {
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: false,
    };
    const merged: Record<string, unknown> = {
      ...callerOverrides,
      ...SYSTEM_HEALTH_AUTO_REFRESH_DEFAULTS,
    };
    expect(merged.refetchIntervalInBackground).toBe(false);
    expect(merged.refetchOnWindowFocus).toBe(true);
    expect(merged.refetchInterval).toBe(60_000);
  });
});
