// @vitest-environment happy-dom
//
// Chrome / branding contract for the post-login MFA enforcement
// screen. Pre-task-432 the dialog stamped the legacy vendor logo at
// the top of the form and rendered its own bespoke gradient
// backdrop with no theme toggle / language switcher / version
// footer — visually disconnected from the login page the operator
// had just been on. This test locks the new contract:
//
//   1. The the legacy vendor logo is gone from the dialog header.
//   2. When mounted inside the parent `<AuthShell>` (the same shell
//      the login page now uses), the operator sees the same chrome
//      they saw on login: theme toggle, Get Help, language switcher,
//      version footer, and the white-logo background watermark.
//
// We render `<AuthShell>` + `<MFAEnforcementDialog isOpen />` together
// here because that is exactly the composition `App.tsx`'s MFA branch
// uses in production.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { AuthShell } from "@/components/shared/AuthShell";
import MFAEnforcementDialog from "../MFAEnforcementDialog";
import i18n from "@/i18n";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "eric.garlepp@example.com",
      role: "Admin",
      securityHealth: { score: 30, status: "INSECURE_INCOMPLETE" },
    },
    effectiveUser: null,
    isLoading: false,
  }),
}));

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
            <MFAEnforcementDialog isOpen={true} onComplete={() => {}} />
          </div>
        </AuthShell>
      </QueryClientProvider>,
    );
  });
}

describe("MFAEnforcementDialog — chrome / branding contract (task-432)", () => {
  it("still renders the MFA enforcement card body unchanged", () => {
    render();
    const card = container.querySelector(
      '[data-testid="mfa-enforcement-card"]',
    );
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain("Security Setup Required");
    expect(card!.textContent).toContain("Enhanced Security Required");
    expect(card!.textContent).toContain("Why MFA is Important");
    expect(card!.textContent).toContain("Set Up Multi-Factor Authentication");
    expect(card!.textContent).toContain("Download Authenticator");
    // User-info card still shows the mocked user email + role.
    expect(card!.textContent).toContain("eric.garlepp@example.com");
    expect(card!.textContent).toContain("Admin");
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
    // landing-branding-locks test uses).
    const watermark = container.querySelector<HTMLElement>(
      "div.opacity-5.pointer-events-none",
    );
    expect(watermark).not.toBeNull();
    expect(watermark!.style.backgroundImage).toMatch(
      /criteriaiq-logo_white\.png/,
    );
    // Pre-task-432 the MFA dialog rendered the dark/light variant of
    // the CriteriaIQ logo at 25% opacity behind the form. That layer
    // must NOT come back — only the shared 5%-opacity white watermark
    // should be present.
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
