// @vitest-environment happy-dom
//
// Locks the visual cue contract from task-380: when `/api/version`
// returns the literal `"unknown"` sentinel, the bottom-left footer
// must look visually distinct from a real version line (amber tint +
// italic + tooltip), so operators of self-hosted installs notice the
// missing build metadata at a glance instead of mistaking it for a
// real version string.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AppVersionFooter,
  UNKNOWN_VERSION_TOOLTIP,
} from "../AppVersionFooter";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;

function mockVersionFetch(version: string) {
  const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

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
  if (originalFetch) {
    globalThis.fetch = originalFetch;
    originalFetch = undefined;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  vi.restoreAllMocks();
});

describe("AppVersionFooter — unknown-version visual cue", () => {
  it("renders a real version in the neutral grey treatment with no tooltip", async () => {
    mockVersionFetch("v0.7.10");

    act(() => {
      root.render(<AppVersionFooter />);
    });
    await flush();

    const wrapper = container.querySelector(
      '[data-testid="app-version-footer"]',
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute("data-version-unknown")).toBe("false");

    const text = container.querySelector(
      '[data-testid="app-version-footer-text"]',
    ) as HTMLElement | null;
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe("v0.7.10");
    // Neutral grey, no italic, no tooltip — matches the pre-task-380
    // appearance for a successfully detected build.
    expect(text!.className).toContain("text-gray-400");
    expect(text!.className).not.toContain("text-amber-600");
    expect(text!.className).not.toContain("italic");
    expect(text!.getAttribute("title")).toBeNull();
  });

  it("renders the literal 'unknown' with an amber+italic cue and an explanatory tooltip", async () => {
    mockVersionFetch("unknown");

    act(() => {
      root.render(<AppVersionFooter />);
    });
    await flush();

    const wrapper = container.querySelector(
      '[data-testid="app-version-footer"]',
    );
    expect(wrapper).not.toBeNull();
    expect(wrapper!.getAttribute("data-version-unknown")).toBe("true");

    const text = container.querySelector(
      '[data-testid="app-version-footer-text"]',
    ) as HTMLElement | null;
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe("unknown");
    // Distinct visual cue: amber tint + italic + a tooltip explaining
    // why the build metadata is missing. The neutral grey class must
    // NOT also be present, otherwise the cue would be ambiguous.
    expect(text!.className).toContain("text-amber-600");
    expect(text!.className).toContain("italic");
    expect(text!.className).not.toContain("text-gray-400");
    expect(text!.getAttribute("title")).toBe(UNKNOWN_VERSION_TOOLTIP);
  });
});
