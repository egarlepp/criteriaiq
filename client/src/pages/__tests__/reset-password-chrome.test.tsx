// @vitest-environment happy-dom
//
// Chrome / branding contract for the password-reset page that
// operators land on from the emailed reset link (`/reset-password`).
//
// Pre-task-434 the page rendered its own bespoke `#130242` backdrop,
// stamped a legacy vendor logo image above the
// form, and had no theme toggle / Get Help / language switcher /
// version footer — visually disconnected from both the login page
// and the now-unified MFA enforcement / force-password-change
// blocking screens.
//
// Task-434 wraps the reset-password page in `<AuthShell>` (the same
// shell that login, the MFA enforcement screen, and the force-
// password-change screen now use) so the operator following the
// reset link from email lands on the same chrome they see on every
// other pre-app surface. This test mirrors the selectors used by
// the task-432 MFA chrome test and the task-433 force-password-
// change chrome test:
//
//   1. The shared chrome from `<AuthShell>` is rendered (theme
//      toggle, Get Help, language switcher, white-logo watermark,
//      version footer).
//   2. The pre-task-434 a legacy vendor logo image
//      is gone.
//   3. The reset-password card body itself is unchanged.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import ResetPassword from "../reset-password";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await i18n.changeLanguage("en");

  // Production drops the operator on `/reset-password?token=…` from
  // the emailed link. The page mounts the form when it sees a
  // `token` param and otherwise mounts the invalid-token card.
  // Both branches must render the same shared chrome — we exercise
  // the form branch here (the more common production path).
  window.history.replaceState({}, "", "/reset-password?token=test-token");

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
    return Promise.resolve(
      new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

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
  document.documentElement.classList.remove("dark");
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

// <AuthShell> resolves the admin-uploaded login background through
// useBrandingAsset → useQuery, so the tree needs a QueryClientProvider.
function render() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ResetPassword />
      </QueryClientProvider>,
    );
  });
}

describe("ResetPassword — chrome / branding contract (task-434)", () => {
  it("shows the Get Help button pointing at the admin-configured support email", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = url.includes("/api/branding/public")
        ? { assets: [], tagline: null, supportEmail: "help@example.com" }
        : {};
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    render();
    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="auth-shell-get-help"]'),
      ).not.toBeNull();
    });
  });

  it("still renders the reset-password form body unchanged", () => {
    render();
    // The form body itself is out of scope for task-434 — assert the
    // card title + the two password field labels + the submit button
    // copy still render so a future regression that swaps the form
    // for something else is caught here.
    expect(container.textContent).toContain("Create New Password");
    expect(container.textContent).toContain("New Password");
    expect(container.textContent).toContain("Confirm New Password");
    expect(container.textContent).toContain("Reset Password");
  });

  it("renders the shared AuthShell chrome (theme toggle, Get Help, language switcher, watermark)", () => {
    render();
    // Theme toggle in the top-left chrome
    expect(
      container.querySelector('[data-testid="auth-shell-theme-toggle"]'),
    ).not.toBeNull();
    // Get Help button is hidden until an admin configures a support
    // contact email (Configuration → System Settings → Media); this
    // fixture configures none.
    expect(
      container.querySelector('[data-testid="auth-shell-get-help"]'),
    ).toBeNull();
    // Language switcher trigger in the top-right chrome
    expect(
      container.querySelector('button[aria-label="Switch Language"]'),
    ).not.toBeNull();
    // Centered white-logo watermark layer (same selector the
    // landing-branding-locks, MFA chrome, and force-password-change
    // chrome tests use).
    const watermark = container.querySelector<HTMLElement>(
      "div.opacity-5.pointer-events-none",
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.style.backgroundImage).toMatch(
      /criteriaiq-logo_white\.png/,
    );
  });

  it("mounts the bottom-left version footer from the shared shell", async () => {
    render();
    // AppVersionFooter mounts asynchronously after `/api/version` resolves.
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
