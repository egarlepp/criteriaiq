// @vitest-environment happy-dom
//
// Locks the shared sidebar/footer version-label contract from task-383:
// the same `<AppVersionLabel />` styling helper now powers both the
// login/setup footer (task-380) and the main-app sidebar, so the
// "missing build metadata" cue (amber tint + italic + tooltip) is
// identical everywhere a version is rendered. This test pins both
// branches the sidebar exercises:
//   1. A real version string (e.g. `"v0.7.10"`) renders in the
//      caller-supplied neutral classes (the sidebar passes
//      `"text-xs text-gray-400"`) with no tooltip.
//   2. The literal `"unknown"` sentinel returned by
//      `server/lib/version-info.ts` swaps the neutral classes for the
//      amber+italic+cursor-help cue and surfaces
//      `UNKNOWN_VERSION_TOOLTIP` via the `title` attribute, instead of
//      silently masquerading as a real build (this used to be the
//      hardcoded `"v0.7.10"` literal in the sidebar).
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AppVersionLabel,
  UNKNOWN_VERSION_TOOLTIP,
} from "../AppVersionFooter";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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
});

describe("AppVersionLabel — shared sidebar/footer styling helper", () => {
  it("renders a real version with the caller-supplied neutral classes and no tooltip", () => {
    act(() => {
      root.render(
        <AppVersionLabel
          version="v0.7.10"
          neutralClassName="text-xs text-gray-400"
          style={{ fontSize: "10px" }}
          testId="sidebar-version-label"
        />,
      );
    });

    const text = container.querySelector(
      '[data-testid="sidebar-version-label"]',
    ) as HTMLElement | null;
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe("v0.7.10");
    expect(text!.getAttribute("data-version-unknown")).toBe("false");
    // The caller's neutral classes are preserved verbatim and the
    // amber/italic/cursor cue is absent.
    expect(text!.className).toContain("text-xs");
    expect(text!.className).toContain("text-gray-400");
    expect(text!.className).not.toContain("text-amber-600");
    expect(text!.className).not.toContain("italic");
    expect(text!.className).not.toContain("cursor-help");
    expect(text!.getAttribute("title")).toBeNull();
    // Inline sizing from the sidebar call-site is forwarded unchanged.
    expect((text!.style as CSSStyleDeclaration).fontSize).toBe("10px");
  });

  it("renders the literal 'unknown' sentinel with the amber+italic cue and explanatory tooltip, dropping the neutral classes", () => {
    act(() => {
      root.render(
        <AppVersionLabel
          version="unknown"
          neutralClassName="text-xs text-gray-400"
          style={{ fontSize: "10px" }}
          testId="sidebar-version-label"
        />,
      );
    });

    const text = container.querySelector(
      '[data-testid="sidebar-version-label"]',
    ) as HTMLElement | null;
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe("unknown");
    expect(text!.getAttribute("data-version-unknown")).toBe("true");
    // Distinct cue classes are present and the neutral classes are
    // explicitly NOT mixed in — otherwise the cue would be muddled.
    expect(text!.className).toContain("text-amber-600");
    expect(text!.className).toContain("italic");
    expect(text!.className).toContain("cursor-help");
    expect(text!.className).not.toContain("text-gray-400");
    expect(text!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });

  it("never falls back to the legacy 'v0.7.10' literal when no real version is available", () => {
    // Regression test for task-383: the sidebar previously rendered
    // `versionData?.version || 'v0.7.10'`, which silently masqueraded
    // as a real build on every self-hosted install whose runtime image
    // was missing version metadata. The shared helper must NEVER emit
    // that literal — callers either pass the real version, or the
    // server-side `"unknown"` sentinel, or skip rendering entirely.
    act(() => {
      root.render(
        <AppVersionLabel
          version="unknown"
          neutralClassName="text-xs text-gray-400"
          testId="sidebar-version-label"
        />,
      );
    });

    const text = container.querySelector(
      '[data-testid="sidebar-version-label"]',
    ) as HTMLElement | null;
    expect(text).not.toBeNull();
    expect(text!.textContent).not.toBe("v0.7.10");
    expect(text!.textContent).toBe("unknown");
  });
});
