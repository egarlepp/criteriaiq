// @vitest-environment happy-dom
//
// Coverage for the shared "updated Xs ago / spinner / Refresh now"
// affordance (Task #425) that every per-category Health tab now
// renders. The overview's equivalent assertions live in
// `client/src/components/configuration/__tests__/SystemHealthSection.test.tsx`
// (Task #418); these tests pin the standalone component the tabs
// share so we don't have to mount each tab to verify the behaviour
// is wired up — the per-tab smoke tests below assert the indicator
// is present with the correct `testIdPrefix` and rely on this file
// for the live ticking, spinner, and refresh-button behaviour.

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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

import { HealthFreshnessIndicator } from "../HealthFreshnessIndicator";

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

describe("HealthFreshnessIndicator (Task #425)", () => {
  it("renders an 'updated Xs ago' label seeded from the freshness timestamp", async () => {
    const now = Date.now();
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={now}
          isFetching={false}
          onRefresh={() => {}}
          testIdPrefix="example-health"
        />,
      );
    });

    const label = container.querySelector(
      '[data-testid="example-health-updated-ago"]',
    );
    expect(label).not.toBeNull();
    // Within the first second of mount the formatter should always
    // produce a single-digit seconds value — using a regex keeps the
    // assertion stable across the few milliseconds spent in render.
    expect(label!.textContent).toMatch(/^updated [0-9]+s ago$/);
  });

  it("ticks the relative label forward as wall-clock time advances", async () => {
    const updatedAt = Date.now();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await act(async () => {
        root.render(
          <HealthFreshnessIndicator
            dataUpdatedAt={updatedAt}
            isFetching={false}
            onRefresh={() => {}}
            testIdPrefix="example-health"
          />,
        );
      });

      const label = container.querySelector(
        '[data-testid="example-health-updated-ago"]',
      );
      expect(label).not.toBeNull();

      // Advance 5 seconds and let the interval's setState commit.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      const match = label!.textContent?.match(/^updated (\d+)s ago$/);
      expect(match, `label text was ${label!.textContent}`).not.toBeNull();
      // Assert "at least 4s" rather than an exact number to stay
      // robust on slower CI without masking a regression where the
      // ticker stops firing.
      expect(Number(match![1])).toBeGreaterThanOrEqual(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the spinner only while a refetch is in flight", async () => {
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={false}
          onRefresh={() => {}}
          testIdPrefix="example-health"
        />,
      );
    });
    // Idle state — no spinner, button enabled.
    expect(
      container.querySelector(
        '[data-testid="example-health-refreshing-spinner"]',
      ),
    ).toBeNull();
    expect(
      (
        container.querySelector(
          '[data-testid="example-health-refresh-now"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(false);

    // Flip `isFetching` true and re-render. The spinner mounts and
    // the button disables so impatient operators can't queue a flood
    // of duplicate fetches.
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={true}
          onRefresh={() => {}}
          testIdPrefix="example-health"
        />,
      );
    });
    expect(
      container.querySelector(
        '[data-testid="example-health-refreshing-spinner"]',
      ),
    ).not.toBeNull();
    expect(
      (
        container.querySelector(
          '[data-testid="example-health-refresh-now"]',
        ) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("invokes the onRefresh callback when the manual button is clicked", async () => {
    const onRefresh = vi.fn();
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={false}
          onRefresh={onRefresh}
          testIdPrefix="example-health"
        />,
      );
    });

    const button = container.querySelector(
      '[data-testid="example-health-refresh-now"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button!.textContent).toContain("Refresh now");

    act(() => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("surfaces the absolute lastChecked time as a hover/title tooltip on the relative label (Task #442)", async () => {
    // The redundant `Last checked: <date>` header line was dropped in
    // Task #442; the absolute time now lives in the relative label's
    // `title` so it remains discoverable for audit/debug without
    // taking a second row.
    const iso = "2026-04-01T12:00:00.000Z";
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={false}
          onRefresh={() => {}}
          testIdPrefix="example-health"
          lastCheckedIso={iso}
        />,
      );
    });

    const label = container.querySelector(
      '[data-testid="example-health-updated-ago"]',
    ) as HTMLElement | null;
    expect(label).not.toBeNull();
    const expected = `Last checked: ${new Date(iso).toLocaleString()}`;
    expect(label!.getAttribute("title")).toBe(expected);
  });

  it("omits the title attribute when no lastCheckedIso is supplied", async () => {
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={false}
          onRefresh={() => {}}
          testIdPrefix="example-health"
        />,
      );
    });
    const label = container.querySelector(
      '[data-testid="example-health-updated-ago"]',
    ) as HTMLElement | null;
    expect(label).not.toBeNull();
    expect(label!.hasAttribute("title")).toBe(false);
  });

  it("falls back to no title when lastCheckedIso is unparseable", async () => {
    await act(async () => {
      root.render(
        <HealthFreshnessIndicator
          dataUpdatedAt={Date.now()}
          isFetching={false}
          onRefresh={() => {}}
          testIdPrefix="example-health"
          lastCheckedIso="not-a-real-iso"
        />,
      );
    });
    const label = container.querySelector(
      '[data-testid="example-health-updated-ago"]',
    ) as HTMLElement | null;
    expect(label).not.toBeNull();
    expect(label!.hasAttribute("title")).toBe(false);
  });

  it("scopes test IDs by the supplied testIdPrefix so sibling indicators don't collide", async () => {
    await act(async () => {
      root.render(
        <div>
          <HealthFreshnessIndicator
            dataUpdatedAt={Date.now()}
            isFetching={true}
            onRefresh={() => {}}
            testIdPrefix="alpha-health"
          />
          <HealthFreshnessIndicator
            dataUpdatedAt={Date.now()}
            isFetching={false}
            onRefresh={() => {}}
            testIdPrefix="beta-health"
          />
        </div>,
      );
    });
    expect(
      container.querySelector('[data-testid="alpha-health-updated-ago"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="beta-health-updated-ago"]'),
    ).not.toBeNull();
    // Spinner only renders for the in-flight tab, so we can confirm
    // each prefix actually addresses the right instance.
    expect(
      container.querySelector(
        '[data-testid="alpha-health-refreshing-spinner"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="beta-health-refreshing-spinner"]',
      ),
    ).toBeNull();
  });
});
