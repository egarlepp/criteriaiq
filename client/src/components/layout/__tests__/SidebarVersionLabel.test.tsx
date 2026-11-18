// @vitest-environment happy-dom
//
// Locks the sidebar version-label contract from task-383: the bottom of
// the main app sidebar must NEVER fall back to the legacy hardcoded
// `'v0.7.10'` literal. Once the `/api/version` query has settled, the
// sidebar must show the real version (in the existing neutral grey
// treatment) OR the literal `"unknown"` sentinel with the shared
// amber+italic+tooltip cue introduced by task-380. While the query is
// still in flight on first mount, the row stays empty so the layout
// (theme toggle + sign-out button) does not flicker.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SidebarVersionLabel } from "../SidebarVersionLabel";
import { UNKNOWN_VERSION_TOOLTIP } from "@/components/shared/AppVersionFooter";

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
    '[data-testid="sidebar-version-label"]',
  ) as HTMLElement | null;
}

describe("SidebarVersionLabel — task-383 contract", () => {
  it("shows the real version in the neutral grey treatment when /api/version returned a usable payload", () => {
    act(() => {
      root.render(
        <SidebarVersionLabel
          version="v2.1.4"
          isLoading={false}
          isError={false}
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("v2.1.4");
    expect(label!.getAttribute("data-version-unknown")).toBe("false");
    expect(label!.className).toContain("text-xs");
    expect(label!.className).toContain("text-gray-400");
    expect(label!.className).not.toContain("text-amber-600");
    expect(label!.className).not.toContain("italic");
    expect(label!.getAttribute("title")).toBeNull();
  });

  it("renders the server-returned 'unknown' sentinel with the shared amber+italic+tooltip cue", () => {
    // This is the task-380 server-side branch: `version.json` was
    // missing on the runtime image, so the API returned the literal
    // `"unknown"` sentinel verbatim.
    act(() => {
      root.render(
        <SidebarVersionLabel
          version="unknown"
          isLoading={false}
          isError={false}
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
    expect(label!.className).not.toContain("text-gray-400");
    expect(label!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });

  it("falls back to the 'unknown' cue (NOT 'v0.7.10') when /api/version errored out", () => {
    // Network failure / non-2xx response: React Query reports
    // `isError`. The pre-task-383 sidebar would have rendered
    // `'v0.7.10'` here; now the operator must instead see the
    // unknown-build cue.
    act(() => {
      root.render(
        <SidebarVersionLabel
          version={undefined}
          isLoading={false}
          isError={true}
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).not.toBe("v0.7.10");
    expect(label!.textContent).toBe("unknown");
    expect(label!.getAttribute("data-version-unknown")).toBe("true");
    expect(label!.className).toContain("text-amber-600");
    expect(label!.className).toContain("italic");
    expect(label!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });

  it("falls back to the 'unknown' cue when the query settled with no version field in the payload", () => {
    // 200 OK but the payload was missing/empty — should still surface
    // the unknown cue instead of the legacy literal.
    act(() => {
      root.render(
        <SidebarVersionLabel
          version={null}
          isLoading={false}
          isError={false}
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).not.toBe("v0.7.10");
    expect(label!.textContent).toBe("unknown");
    expect(label!.getAttribute("data-version-unknown")).toBe("true");
  });

  it("renders an empty placeholder while the /api/version query is still loading on first mount", () => {
    // Avoids briefly flashing "unknown" before the real version
    // arrives — the row layout is preserved by the empty <p>.
    act(() => {
      root.render(
        <SidebarVersionLabel
          version={undefined}
          isLoading={true}
          isError={false}
        />,
      );
    });

    const label = getLabel();
    expect(label).not.toBeNull();
    expect(label!.textContent).toBe("");
    expect(label!.getAttribute("data-version-state")).toBe("loading");
    expect(label!.getAttribute("data-version-unknown")).toBeNull();
    expect(label!.getAttribute("title")).toBeNull();
  });
});
