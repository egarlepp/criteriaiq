// @vitest-environment happy-dom
//
// Locks the contract from task-379 step 5: the Setup wizard renders the
// shared bottom-left version footer (`<AppVersionFooter />`) on first
// mount, using the same `/api/version` payload the Login (Landing)
// screen uses, so operators can verify which build they are configuring
// without leaving the wizard.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import Setup from "../setup";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

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
    if (url.endsWith("/api/setup/status")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            setupRequired: true,
            adminExists: false,
            publicAppUrl: "",
            hasSessionSecret: true,
            hasEncryptionKey: true,
            dbHealth: { reachable: true, lastErrorCode: null },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
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
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("Setup — bottom-left version footer", () => {
  it("renders the shared AppVersionFooter with the version from /api/version", async () => {
    act(() => {
      root.render(<Setup />);
    });
    // Wait for the /api/version fetch to settle and React to re-render.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    const footer = container.querySelector(
      '[data-testid="app-version-footer"]',
    );
    expect(footer).not.toBeNull();
    const text = container.querySelector(
      '[data-testid="app-version-footer-text"]',
    );
    expect(text).not.toBeNull();
    expect(text!.textContent).toBe("v0.7.10");
  });
});
