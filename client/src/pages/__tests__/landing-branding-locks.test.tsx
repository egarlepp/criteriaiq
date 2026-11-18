// @vitest-environment happy-dom
//
// Locks the cosmetic branding contract on the Landing (login) page so a
// future refactor cannot silently flip the CriteriaIQ wordmark or the
// faint background graphic back to the theme-dependent variants. See
// task-379:
//   - The CriteriaIQ wordmark must always render `criteriaiq-logo-dark.png`
//     regardless of light or dark theme.
//   - The faint background graphic must always render
//     `criteriaiq-logo_white.png` regardless of light or dark theme,
//     with the surrounding `opacity-5` / centered / contain styling
//     preserved.
//   - The bottom-left version footer must mount.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Landing from "../landing";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;
let queryClient: QueryClient;

beforeEach(async () => {
  await i18n.changeLanguage("en");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "v0.7.10" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/public/products")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify({ adminExists: false }), {
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

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  sessionStorage.clear();
  document.documentElement.classList.remove("dark");
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
  sessionStorage.clear();
  document.documentElement.classList.remove("dark");
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <Landing />
      </QueryClientProvider>,
    );
  });
}

function setTheme(mode: "light" | "dark") {
  // The shared useTheme hook reads localStorage and toggles the
  // `dark` class on <html>. Setting both ensures Landing renders the
  // exercised theme regardless of which signal it consults.
  localStorage.setItem("theme", mode);
  if (mode === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}

function getCriteriaIqLogo(): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>('img[alt="CriteriaIQ"]');
}

function getBackgroundLayer(): HTMLElement | null {
  // The background graphic div is the only element on this page that
  // combines `opacity-5` with `pointer-events-none`. The shared
  // application-wide layout never reuses that pair, so it is a
  // stable selector for the layer we want to assert on.
  return container.querySelector<HTMLElement>(
    "div.opacity-5.pointer-events-none",
  );
}

describe("Landing — branding asset locks", () => {
  it("renders the dark CriteriaIQ wordmark in light theme", async () => {
    setTheme("light");
    render();
    await flush();
    const img = getCriteriaIqLogo();
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/criteriaiq-logo-dark\.png/);
    expect(img!.src).not.toMatch(/criteriaiq-logo-light\.png/);
  });

  it("renders the SAME dark CriteriaIQ wordmark in dark theme", async () => {
    setTheme("dark");
    render();
    await flush();
    const img = getCriteriaIqLogo();
    expect(img).not.toBeNull();
    expect(img!.src).toMatch(/criteriaiq-logo-dark\.png/);
    expect(img!.src).not.toMatch(/criteriaiq-logo-light\.png/);
  });

  it("uses criteriaiq-logo_white.png for the background graphic in light theme", async () => {
    setTheme("light");
    render();
    await flush();
    const layer = getBackgroundLayer();
    expect(layer).not.toBeNull();
    const bg = layer!.style.backgroundImage;
    expect(bg).toMatch(/criteriaiq-logo_white\.png/);
    // Ensure neither old theme variant leaked back in.
    expect(bg).not.toMatch(/criteriaiq-logo-dark\.png/);
    expect(bg).not.toMatch(/criteriaiq-logo-light\.png/);
  });

  it("uses the SAME criteriaiq-logo_white.png for the background graphic in dark theme", async () => {
    setTheme("dark");
    render();
    await flush();
    const layer = getBackgroundLayer();
    expect(layer).not.toBeNull();
    const bg = layer!.style.backgroundImage;
    expect(bg).toMatch(/criteriaiq-logo_white\.png/);
    expect(bg).not.toMatch(/criteriaiq-logo-dark\.png/);
    expect(bg).not.toMatch(/criteriaiq-logo-light\.png/);
  });

  it("preserves the existing background-layer styling (opacity / centered / contain)", async () => {
    setTheme("light");
    render();
    await flush();
    const layer = getBackgroundLayer();
    expect(layer).not.toBeNull();
    // Class-level assertions: opacity-5, pointer-events-none, centered transform.
    expect(layer!.className).toContain("opacity-5");
    expect(layer!.className).toContain("pointer-events-none");
    // Inline-style assertions for the three pinned background props.
    expect(layer!.style.backgroundRepeat).toBe("no-repeat");
    expect(layer!.style.backgroundPosition).toBe("center center");
    expect(layer!.style.backgroundSize).toBe("contain");
  });

  it("renders the shared bottom-left version footer with the API-reported version", async () => {
    setTheme("light");
    render();
    // Wait for the /api/version fetch to settle and React to re-render.
    // useQuery schedules its fetch in an effect, the fetch resolves in a
    // microtask, then React commits — three microticks are not enough on
    // a fast happy-dom run, so we also yield to the macrotask queue.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    const footerText = container.querySelector(
      '[data-testid="app-version-footer-text"]',
    );
    expect(footerText).not.toBeNull();
    expect(footerText!.textContent).toBe("v0.7.10");
  });
});
