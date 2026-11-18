// @vitest-environment happy-dom
//
// Component-level coverage for the Landing (post-setup login) page's
// "Setup already complete" callout. The wizard already shows an
// adminExistsLock callout when the operator hits the admin step against
// an already-initialized DB; this banner closes the loop for operators
// who land on the login page after a re-deploy: they shouldn't have to
// guess whether wizard re-entry is necessary.
//
// Contract this file locks:
//   1. Banner DOES NOT render on a cold load (no fromSetup flag, no
//      /setup referrer) — even when /api/setup/status reports adminExists
//      true. We don't want to nag every login.
//   2. Banner DOES render when sessionStorage("criteriaiq:fromSetup") is
//      set AND /api/setup/status reports adminExists true.
//   3. Banner DOES NOT render when the fromSetup flag is set but the
//      status endpoint reports adminExists false (re-deployed to a fresh
//      DB — wizard re-entry IS still required, no banner nag).
//   4. The dismiss button hides the banner and persists the choice via
//      sessionStorage so it doesn't reappear on re-render.
//
// We deliberately drive Landing with the same react-dom/client recipe
// the other setup-* tests use (no @testing-library/react peer at the
// root) and wrap only the QueryClientProvider Landing's product/version
// queries need to mount without throwing.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Landing from "../landing";
import i18n from "@/i18n";
// Import the canonical key constant rather than re-declaring the
// literal — Task #457 hoisted the "criteriaiq:setupCompleteBannerDismissed"
// sessionStorage key into a single helper module so a future rename only
// has to update one file. A grep for the literal anywhere outside that
// helper would defeat the purpose of the refactor.
import { SETUP_COMPLETE_BANNER_DISMISSED_KEY } from "@/lib/setup-complete-banner-dismissed-marker";

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

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  // A fresh client per-test keeps the cached /api/public/products and
  // /api/version queries from leaking across tests.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Default fetch handler — return empty arrays / objects for the
  // product + version queries the page mounts unconditionally. Tests
  // that exercise /api/setup/status override this with mockImplementation.
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/public/products")) {
      return Promise.resolve(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "v0.0.0" }), {
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

  // happy-dom doesn't ship navigator.clipboard. Landing never uses it
  // on first render, but defensive shim keeps the failure modes local.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  // Reset sessionStorage between tests — the banner reads + writes
  // criteriaiq:fromSetup (Task #456) and the dismissed-banner marker
  // hoisted by Task #457.
  sessionStorage.clear();
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

function setStatusResponse(adminExists: boolean) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/status")) {
      return Promise.resolve(
        new Response(JSON.stringify({ adminExists }), {
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
    if (url.includes("/api/version")) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: "v0.0.0" }), {
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
}

describe("Landing — setup-already-complete banner", () => {
  it("does NOT render the banner on a cold visit (no fromSetup flag, no /setup referrer)", async () => {
    setStatusResponse(true); // even when admin exists — banner is gated on context.
    render();
    await flush();
    await flush();

    expect(
      container.querySelector('[data-testid="banner-setup-already-complete"]'),
      "banner must not nag every login — only after a /setup roundtrip",
    ).toBeNull();
  });

  it("renders the banner when fromSetup flag is set AND adminExists=true", async () => {
    sessionStorage.setItem("criteriaiq:fromSetup", "1");
    setStatusResponse(true);
    render();
    await flush();
    await flush();

    const banner = container.querySelector(
      '[data-testid="banner-setup-already-complete"]',
    );
    expect(banner, "banner should render after the wizard hand-off").not.toBeNull();
    expect(banner!.textContent).toContain(
      i18n.t("landing.setupAlreadyComplete.message"),
    );
  });

  it("does NOT render the banner when fromSetup flag is set but adminExists=false", async () => {
    // Operator walked the wizard against a fresh DB but didn't create
    // an admin yet — no banner, since wizard re-entry IS still needed.
    sessionStorage.setItem("criteriaiq:fromSetup", "1");
    setStatusResponse(false);
    render();
    await flush();
    await flush();

    expect(
      container.querySelector('[data-testid="banner-setup-already-complete"]'),
      "banner must not appear when no admin exists yet",
    ).toBeNull();
  });

  it("clears criteriaiq:fromSetup and the setupCompleteBannerDismissed marker after a successful login", async () => {
    // Operator walked the wizard, hit the login form, signed in. The
    // wizard hand-off is implicitly done — both sessionStorage flags
    // must be cleared so a sign-out → re-show login flow in the same
    // tab doesn't surface the "Setup already complete" banner again.
    sessionStorage.setItem("criteriaiq:fromSetup", "1");
    sessionStorage.setItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY, "1");
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: 1 } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (url.includes("/api/setup/status")) {
        return Promise.resolve(
          new Response(JSON.stringify({ adminExists: true }), {
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
      if (url.includes("/api/version")) {
        return Promise.resolve(
          new Response(JSON.stringify({ version: "v0.0.0" }), {
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

    // window.location.href = '/' is the success-branch redirect. Stub
    // it so happy-dom doesn't try to navigate the test harness.
    const originalLocation = window.location;
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: new Proxy(originalLocation, {
        set(target, prop, value) {
          if (prop === "href") {
            hrefSetter(value);
            return true;
          }
          (target as unknown as Record<string | symbol, unknown>)[prop] = value;
          return true;
        },
        get(target, prop) {
          return (target as unknown as Record<string | symbol, unknown>)[prop];
        },
      }),
    });

    try {
      render();
      await flush();
      await flush();

      // Open the auth dialog (login mode) via the hero "Get Started"
      // button — it sets authMode='login' and shows the dialog.
      const getStarted = Array.from(
        container.querySelectorAll<HTMLButtonElement>("button"),
      ).find((btn) => btn.textContent?.includes(i18n.t("landing.getStarted")));
      expect(getStarted, "Get Started button must exist on the page").toBeTruthy();
      act(() => {
        getStarted!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await flush();

      // Radix Dialog renders into a portal under document.body, so
      // query the document — not the container — for the form.
      const form = document.querySelector<HTMLFormElement>("form");
      expect(form, "auth dialog form must render after opening").toBeTruthy();

      // Submit directly. The login branch has no client-side validation
      // and the mocked /api/login resolves with 200, so handleAuth will
      // run the cleanup + redirect path.
      act(() => {
        form!.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        );
      });
      // Allow the async handleAuth → fetch → cleanup chain to settle.
      await flush();
      await flush();
      await flush();

      expect(
        hrefSetter,
        "successful login must trigger the redirect to '/'",
      ).toHaveBeenCalledWith("/");
      expect(
        sessionStorage.getItem("criteriaiq:fromSetup"),
        "fromSetup flag must be cleared after a successful login",
      ).toBeNull();
      expect(
        sessionStorage.getItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY),
        "dismissed flag must be cleared after a successful login so the next /setup roundtrip starts fresh",
      ).toBeNull();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it("hides the banner when dismissed and persists the choice in sessionStorage", async () => {
    sessionStorage.setItem("criteriaiq:fromSetup", "1");
    setStatusResponse(true);
    render();
    await flush();
    await flush();

    const dismiss = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-dismiss-setup-complete-banner"]',
    );
    expect(dismiss, "dismiss button must render alongside the banner").not.toBeNull();

    act(() => {
      dismiss!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    expect(
      container.querySelector('[data-testid="banner-setup-already-complete"]'),
      "banner should disappear immediately after dismiss",
    ).toBeNull();
    expect(
      sessionStorage.getItem(SETUP_COMPLETE_BANNER_DISMISSED_KEY),
      "dismissal must persist so the banner doesn't return on re-render",
    ).toBe("1");
  });
});
