// @vitest-environment happy-dom
//
// Coverage for the admin "encryption-key rotation in progress" banner
// (Task #734). The banner polls GET /api/system/secrets/rotation-status
// once a second while `active` is true and stops polling entirely once
// the dual-key fallback tail elapses.
//
// We mount the component against an in-test QueryClient and stub
// `globalThis.fetch` so we can drive the banner through its three
// states (steady-state hidden -> active visible -> faded out) without
// any backend involvement.

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

import { RotationStatusBanner } from "../RotationStatusBanner";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

beforeEach(async () => {
  await i18n.changeLanguage("en");
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
});

function mockFetchSequence(payloads: unknown[]) {
  let i = 0;
  globalThis.fetch = vi.fn(async () => {
    const payload = payloads[Math.min(i, payloads.length - 1)];
    i += 1;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
      headers: new Headers({ "content-type": "application/json" }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function renderBanner() {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const url = queryKey[0] as string;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        },
      },
    },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <RotationStatusBanner />
      </QueryClientProvider>,
    );
  });
  // Flush a few microtasks so the initial fetch resolves.
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe("RotationStatusBanner", () => {
  it("renders nothing in steady state (no rotation tail active)", async () => {
    mockFetchSequence([
      {
        active: false,
        tailRemainingMs: 0,
        tailDurationMs: 0,
        lastCompletedAt: null,
        reencrypted: null,
      },
    ]);
    await renderBanner();
    expect(
      container.querySelector('[data-testid="rotation-status-banner"]'),
    ).toBeNull();
  });

  it("renders the banner with the spinner, remaining seconds, and re-encryption counts when the tail is active", async () => {
    mockFetchSequence([
      {
        active: true,
        tailRemainingMs: 4200,
        tailDurationMs: 5000,
        lastCompletedAt: "2026-04-30T12:00:00.000Z",
        reencrypted: { tables: 3, rows: 11 },
      },
    ]);
    await renderBanner();

    const banner = container.querySelector(
      '[data-testid="rotation-status-banner"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute("data-active")).toBe("true");

    const detail = container.querySelector(
      '[data-testid="rotation-status-detail"]',
    );
    expect(detail).not.toBeNull();
    // The translation interpolates {seconds} as ceil(tailRemainingMs/1000) — 4200ms -> 5s.
    expect(detail!.textContent).toContain("5");
    expect(detail!.textContent).toContain("11");
    expect(detail!.textContent).toContain("3");
  });

  it("never reveals raw secret values — the banner only consumes metadata fields", async () => {
    // Defensive contract: even if the server payload accidentally widens
    // to include raw key material (it won't — see the server-side test in
    // server/__tests__/rotation-status-endpoint.test.ts), the banner
    // template here MUST ignore it. We feed a hypothetical bad payload
    // and assert the rendered text does not contain the secret.
    const FAKE_KEY = "deadbeefcafebabe1234567890abcdef".repeat(2);
    mockFetchSequence([
      {
        active: true,
        tailRemainingMs: 3000,
        tailDurationMs: 5000,
        lastCompletedAt: "2026-04-30T12:00:00.000Z",
        reencrypted: { tables: 1, rows: 1 },
        // Extra fields the banner has no template slot for — they MUST
        // not leak into the DOM.
        encryptionKeyValue: FAKE_KEY,
        oldEncryptionKey: FAKE_KEY,
      } as Record<string, unknown>,
    ]);
    await renderBanner();
    const banner = container.querySelector(
      '[data-testid="rotation-status-banner"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.textContent ?? "").not.toContain(FAKE_KEY);
  });
});
