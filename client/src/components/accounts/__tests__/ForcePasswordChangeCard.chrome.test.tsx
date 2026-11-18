// @vitest-environment happy-dom
//
// Chrome / branding contract for the force-password-change screen.
// Pre-task-433 the App.tsx force-password-change branch rendered its
// own bespoke gradient backdrop with a 25%-opacity dark/light
// CriteriaIQ logo behind the card and no theme toggle / Get Help /
// language switcher / version footer — visually disconnected from
// both the login page and the sibling MFA enforcement screen.
//
// Task-433 wraps the force-password-change card in `<AuthShell>` so
// the operator sees the same chrome they saw on login. This test
// locks the new contract by mirroring the selectors used by the
// task-432 MFA chrome test:
//
//   1. The shared chrome from `<AuthShell>` is rendered (theme
//      toggle, Get Help, language switcher, white-logo watermark,
//      version footer).
//   2. The pre-task-433 25%-opacity dark/light logo backdrop is
//      gone.
//   3. The card body itself is unchanged.
//
// We render `<AuthShell>` + `<ForcePasswordChangeCard />` together
// here because that is exactly the composition `App.tsx`'s
// force-password-change branch uses in production.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { AuthShell } from "@/components/shared/AuthShell";
import { ForcePasswordChangeCard } from "../ForcePasswordChangeCard";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

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
        <AuthShell>
          <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
            <ForcePasswordChangeCard onComplete={() => {}} />
          </div>
        </AuthShell>
      </QueryClientProvider>,
    );
  });
}

describe("ForcePasswordChangeCard — chrome / branding contract (task-433)", () => {
  it("still renders the force-password-change card body unchanged", () => {
    render();
    // The card body itself is out of scope for task-433 — assert the
    // headline + the three password field labels still render so a
    // future regression that swaps the card for something else is
    // caught here.
    expect(container.textContent).toContain("Password Change Required");
    expect(container.textContent).toContain("Current Password");
    expect(container.textContent).toContain("New Password");
    expect(container.textContent).toContain("Confirm New Password");
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
    // landing-branding-locks and MFA chrome tests use).
    const watermark = container.querySelector<HTMLElement>(
      "div.opacity-5.pointer-events-none",
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.style.backgroundImage).toMatch(
      /criteriaiq-logo_white\.png/,
    );
    // Pre-task-433 the force-password-change branch rendered the
    // dark/light variant of the CriteriaIQ logo at 25% opacity
    // behind the card. That layer must NOT come back — only the
    // shared 5%-opacity white watermark should be present.
    expect(container.innerHTML).not.toMatch(/opacity-25/);
    expect(container.innerHTML).not.toMatch(/criteriaiq-logo-dark\.png/);
    expect(container.innerHTML).not.toMatch(/criteriaiq-logo-light\.png/);
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
