// @vitest-environment happy-dom
//
// Component-level coverage for the Connect step's "Most likely" tip block on
// the Setup wizard. The server's /api/setup/test-connection route classifies
// libpq errors into a stable `tipKey`; the backend tests in
// `server/__tests__/test-connection-tip.test.ts` lock that contract on the
// API. This file locks the matching client contract: a returned tipKey
// renders the localized tip text plus the "Most likely" badge under the
// `connect-tip-<key>` test id, and a successful (or unclassified) response
// renders nothing.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import Setup from "../setup";
import i18n from "@/i18n";

// React 19's `act` warns when state updates happen outside an `act`-aware
// environment. The same flag the FilterChipsInput test sets — driving the
// component with `react-dom/client` directly so we don't need
// `@testing-library/react`, which conflicts with the project's React 19 /
// TypeScript 5 peer ranges at the root.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(async () => {
  // Pin English so we can assert against the en-US locale strings without
  // happy-dom's `navigator.language` deciding the result.
  await i18n.changeLanguage("en");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  // The wizard now polls /api/setup/status on mount for the dbHealth
  // banner (task #361). That fetch fires BEFORE any user-driven test
  // click and would otherwise consume the per-test mockResolvedValueOnce
  // queue. Prepend a healthy status response so each test's own
  // mockResolvedValueOnce(jsonResponse({...})) still answers the
  // subsequent test-connection POST.
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        setupRequired: true,
        adminExists: false,
        publicAppUrl: "",
        hasSessionSecret: false,
        hasEncryptionKey: false,
        dbHealth: { reachable: true, lastErrorCode: null },
      }),
  } as unknown as Response);
  // The shared bottom-left version footer (task #379) also fires a
  // GET /api/version on mount. Prepend a stub response so the queue
  // position reserved for the per-test test-connection POST is not
  // consumed by the footer's mount fetch.
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ version: "v0.0.0-test" }),
  } as unknown as Response);
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
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
});

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

function urlInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>("input#url");
  if (!el) throw new Error("connection URL input not rendered");
  return el;
}

function setUrlValue(value: string) {
  const el = urlInput();
  // React tracks input values through a private setter; calling the prototype
  // setter and then dispatching `input` is the standard happy-dom recipe to
  // make a controlled <input> see the new value.
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickTestConnection() {
  // Locate the test-connection button by its localized label so a copy
  // edit to the en-US bundle updates this test in lockstep instead of
  // silently breaking the selector.
  const label = i18n.t("setup.connect.testButton");
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const testButton = buttons.find((b) => b.textContent?.trim() === label);
  if (!testButton) throw new Error("Test Connection button not rendered");
  act(() => {
    testButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flushAsyncEffects() {
  // The click handler awaits fetch().json() and then setState. We need to
  // let those microtasks settle inside `act` so React commits the new
  // testResult before we query the DOM.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("Setup — Connect step tip rendering", () => {
  it("renders the localized tip and 'Most likely' badge when the server returns a tipKey", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        latencyMs: 12,
        error: "SSL off",
        errorCode: "connectFailed",
        errorParams: { detail: "SSL off" },
        tipKey: "sslRequired",
      }),
    );

    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    clickTestConnection();
    await flushAsyncEffects();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/setup/test-connection",
      expect.objectContaining({ method: "POST" }),
    );

    const tip = container.querySelector(
      '[data-testid="connect-tip-sslRequired"]',
    );
    expect(tip).not.toBeNull();
    // Locked against the en-US bundle so a future copy edit either updates
    // the locale here or breaks this test deliberately.
    const expectedTip = i18n.t(
      "setup.initialize.migrationOutput.tips.sslRequired",
    );
    const expectedBadge = i18n.t(
      "setup.initialize.migrationOutput.mostLikelyBadge",
    );
    expect(tip!.textContent).toContain(expectedTip);
    expect(tip!.textContent).toContain(expectedBadge);
  });

  it("does not render any tip block on a successful test", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        latencyMs: 7,
        tipKey: null,
      }),
    );

    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    clickTestConnection();
    await flushAsyncEffects();

    const anyTip = container.querySelector('[data-testid^="connect-tip-"]');
    expect(anyTip).toBeNull();
  });

  it("does not render any tip block when the failure cannot be classified (tipKey: null)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: false,
        latencyMs: 9,
        error: "something totally unexpected",
        errorCode: "connectFailed",
        tipKey: null,
      }),
    );

    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    clickTestConnection();
    await flushAsyncEffects();

    const anyTip = container.querySelector('[data-testid^="connect-tip-"]');
    expect(anyTip).toBeNull();
  });
});
