// @vitest-environment happy-dom
//
// Locks the resolution contract from task-389: the shared
// `<AppVersionInline />` helper drives both the About → Introduction
// "Recent Updates (vX)" header and the Flight Deck "What's New"
// version line, so the same `/api/version`-driven amber+italic+tooltip
// cue (task-380 / task-383) appears on those two surfaces too. This
// test pins:
//   1. A real version string (e.g. `"v2.1.4"`) renders in the
//      caller-supplied neutral classes with no tooltip.
//   2. The literal `"unknown"` sentinel returned by
//      `server/lib/version-info.ts` swaps the neutral classes for the
//      shared amber/italic/cursor-help cue and surfaces the
//      `UNKNOWN_VERSION_TOOLTIP` `title` attribute.
//   3. A network/error result with no cached payload falls back to the
//      `"unknown"` cue (NOT the legacy hardcoded `"v0.7.10"` literal
//      that used to live in `RecentUpdatesContent.tsx`).
//   4. While the query is still in flight on first mount the helper
//      renders nothing, so the wrapping caller (e.g. the parenthesised
//      "Recent Updates (vX)" header) can omit the surrounding chrome
//      cleanly without flashing an empty `()`.
//   5. Defaults to a `<span>` tag so it can be spliced inside an `<h3>`
//      `CardTitle` without producing invalid `<p>` inside `<h3>` markup,
//      and accepts `as="p"` for the Flight Deck call-site that wants a
//      block-level paragraph.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppVersionInline } from "../AppVersionInline";
import { UNKNOWN_VERSION_TOOLTIP } from "../AppVersionFooter";

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

function getLabel(): HTMLElement | null {
  return container.querySelector(
    '[data-testid="app-version-inline"]',
  ) as HTMLElement | null;
}

describe("AppVersionInline — task-389 contract", () => {
  it("renders a real version in the caller-supplied neutral classes with no tooltip", () => {
    act(() => {
      root.render(
        <AppVersionInline
          version="v2.1.4"
          isLoading={false}
          isError={false}
          neutralClassName="text-xs text-gray-500 dark:text-gray-400"
          as="p"
          testId="app-version-inline"
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.tagName).toBe("P");
    expect(label!.textContent).toBe("v2.1.4");
    expect(label!.getAttribute("data-version-unknown")).toBe("false");
    expect(label!.className).toContain("text-xs");
    expect(label!.className).toContain("text-gray-500");
    expect(label!.className).not.toContain("text-amber-600");
    expect(label!.className).not.toContain("italic");
    expect(label!.getAttribute("title")).toBeNull();
  });

  it("renders the server-returned 'unknown' sentinel with the shared amber+italic+tooltip cue", () => {
    act(() => {
      root.render(
        <AppVersionInline
          version="unknown"
          isLoading={false}
          isError={false}
          neutralClassName="text-xs text-gray-500 dark:text-gray-400"
          as="p"
          testId="app-version-inline"
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("unknown");
    expect(label!.getAttribute("data-version-unknown")).toBe("true");
    expect(label!.className).toContain("text-amber-600");
    expect(label!.className).toContain("italic");
    expect(label!.className).toContain("cursor-help");
    expect(label!.className).not.toContain("text-gray-500");
    expect(label!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });

  it("falls back to the 'unknown' cue (NOT 'v0.7.10') when /api/version errored out", () => {
    // This is the regression guard for task-389: the About page and the
    // Flight Deck "What's New" widget used to import a hardcoded
    // `CURRENT_VERSION = "v0.7.10"` constant, which would silently
    // masquerade as the running build whenever the API failed. The
    // shared helper must NEVER emit that legacy literal — callers
    // either pass the real version, or get the `"unknown"` sentinel
    // with the amber cue, or render nothing while loading.
    act(() => {
      root.render(
        <AppVersionInline
          version={undefined}
          isLoading={false}
          isError={true}
          neutralClassName="text-xs text-gray-500 dark:text-gray-400"
          as="p"
          testId="app-version-inline"
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).not.toBe("v0.7.10");
    expect(label!.textContent).toBe("unknown");
    expect(label!.getAttribute("data-version-unknown")).toBe("true");
    expect(label!.className).toContain("text-amber-600");
    expect(label!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });

  it("falls back to the 'unknown' cue when the query settled with no version field in the payload", () => {
    act(() => {
      root.render(
        <AppVersionInline
          version={null}
          isLoading={false}
          isError={false}
          neutralClassName="text-xs text-gray-500 dark:text-gray-400"
          testId="app-version-inline"
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).not.toBe("v0.7.10");
    expect(label!.textContent).toBe("unknown");
    expect(label!.getAttribute("data-version-unknown")).toBe("true");
  });

  it("renders nothing while the /api/version query is still loading on first mount", () => {
    // The About header splices the version into a parenthesised
    // suffix ("Recent Updates (vX)"). Returning `null` while loading
    // lets the caller hide the surrounding parens cleanly so the
    // header never flashes an empty "()" before the real version
    // arrives.
    act(() => {
      root.render(
        <AppVersionInline
          version={undefined}
          isLoading={true}
          isError={false}
          neutralClassName="text-xs text-gray-500 dark:text-gray-400"
          testId="app-version-inline"
        />,
      );
    });

    expect(getLabel()).toBeNull();
  });

  it("defaults to a <span> tag so it can sit inside a CardTitle <h3> without producing invalid <p> inside <h3> markup", () => {
    act(() => {
      root.render(
        <AppVersionInline
          version="v2.1.4"
          isLoading={false}
          isError={false}
          neutralClassName=""
          testId="app-version-inline"
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.tagName).toBe("SPAN");
  });
});
