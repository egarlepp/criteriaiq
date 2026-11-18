// @vitest-environment happy-dom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { EnvSourceWarningBanner } from "../EnvSourceWarningBanner";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function makeUser(role: string | null) {
  return {
    id: "user-1",
    email: "admin@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    role,
  };
}

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: mockedUser, effectiveUser: mockedUser, isLoading: false }),
}));

// Minimal wouter <Link> shim — the component only reads the `href` prop and
// renders children; we don't need actual routing in this unit test.
vi.mock("wouter", () => ({
  Link: ({
    href,
    children,
    className,
    "data-testid": testId,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "data-testid"?: string;
  }) => (
    <a href={href} className={className} data-testid={testId}>
      {children}
    </a>
  ),
}));

let mockedUser: ReturnType<typeof makeUser> | null = null;

function renderBanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <EnvSourceWarningBanner />
      </QueryClientProvider>,
    );
  });
}

async function flushQuery() {
  // Settle React Query's fetch + observer + React commit + localStorage useEffect.
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockedUser = makeUser("Admin");
  localStorage.clear();
  fetchMock = vi.fn();
  (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

function mockEnvStatus(snapshot: {
  databaseUrlSource: "env" | "wizard" | "none";
  sessionSecretSource: "env" | "file" | "none";
  encryptionKeySource: "env" | "file" | "none";
  publicAppUrlSource: "env" | "file" | "default";
}) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => snapshot,
  } as Response);
}

describe("EnvSourceWarningBanner", () => {
  it("renders nothing for non-admin users and does not call the admin endpoint", async () => {
    mockedUser = makeUser("SE");
    mockEnvStatus({
      databaseUrlSource: "wizard",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "file",
    });
    renderBanner();
    await flushQuery();
    expect(container.querySelector('[data-testid="banner-env-source-warning"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing when every critical secret is env-sourced", async () => {
    mockEnvStatus({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrlSource: "env",
    });
    renderBanner();
    await flushQuery();
    expect(container.querySelector('[data-testid="banner-env-source-warning"]')).toBeNull();
  });

  it("warns when DATABASE_URL is wizard-sourced", async () => {
    mockEnvStatus({
      databaseUrlSource: "wizard",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrlSource: "env",
    });
    renderBanner();
    await flushQuery();
    const banner = container.querySelector('[data-testid="banner-env-source-warning"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("DATABASE_URL");
    expect(banner?.textContent).toContain(" is still stored");
  });

  it("warns when multiple secrets are file-sourced and links to the wizard and System Settings", async () => {
    mockEnvStatus({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "file",
    });
    renderBanner();
    await flushQuery();
    const banner = container.querySelector('[data-testid="banner-env-source-warning"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("SESSION_SECRET");
    expect(banner?.textContent).toContain("ENCRYPTION_KEY");
    expect(banner?.textContent).toContain("PUBLIC_APP_URL");
    expect(banner?.textContent).toContain(" are still stored");
    const setupLink = container.querySelector(
      '[data-testid="link-env-warning-setup"]',
    ) as HTMLAnchorElement | null;
    const settingsLink = container.querySelector(
      '[data-testid="link-env-warning-system-settings"]',
    ) as HTMLAnchorElement | null;
    expect(setupLink?.getAttribute("href")).toBe("/setup");
    expect(settingsLink?.getAttribute("href")).toBe("/admin?tab=fiscal-calendar");
  });

  it("dismisses for the current snapshot but reappears after the file-sourced set changes", async () => {
    mockEnvStatus({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "file",
    });
    renderBanner();
    await flushQuery();
    const dismiss = container.querySelector(
      '[data-testid="button-env-warning-dismiss"]',
    ) as HTMLButtonElement;
    expect(dismiss).not.toBeNull();
    act(() => {
      dismiss.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushQuery();
    expect(
      container.querySelector('[data-testid="banner-env-source-warning"]'),
    ).toBeNull();

    // Same snapshot → banner stays dismissed.
    act(() => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    mockEnvStatus({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "file",
    });
    renderBanner();
    await flushQuery();
    expect(
      container.querySelector('[data-testid="banner-env-source-warning"]'),
    ).toBeNull();

    // Promote ENCRYPTION_KEY → snapshot key changes → banner reappears with the rest.
    act(() => {
      root.unmount();
    });
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = vi.fn();
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
    mockEnvStatus({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "env",
      publicAppUrlSource: "file",
    });
    renderBanner();
    await flushQuery();
    const banner = container.querySelector('[data-testid="banner-env-source-warning"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("SESSION_SECRET");
    expect(banner?.textContent).toContain("PUBLIC_APP_URL");
    expect(banner?.textContent).not.toContain("ENCRYPTION_KEY");
  });
});
