// @vitest-environment happy-dom
//
// Coverage for the post-setup `EnvStatusPanel` rendered on the
// Configuration → System Settings page (Task #342). The panel reuses the
// same badge grammar as the Setup wizard's env helper so operators who
// already finished setup can still audit which of the four critical env
// vars are coming from the host vs. still backed only by db-config.json.
//
// We mount the component against an in-test `QueryClient` and stub
// `globalThis.fetch` to control the `/api/system/env-status` payload —
// no network or backend involvement.

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

import { EnvStatusPanel } from "../EnvStatusPanel";
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

function mockFetch(body: unknown, status = 200) {
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: new Headers({ "content-type": "application/json" }),
      }) as unknown as Response,
  ) as unknown as typeof fetch;
}

async function renderPanel(props: { detailsHref?: string } = {}) {
  // Disable retries so the error path resolves on the first failure rather
  // than waiting through the default backoff schedule. Mirror the default
  // queryFn the production `queryClient` ships with — fetch the queryKey[0]
  // URL and JSON-parse the response — so the panel doesn't trip on the
  // "Missing queryFn" guard TanStack ships without a default.
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
        <EnvStatusPanel {...props} />
      </QueryClientProvider>,
    );
  });
  // Wait until either the loading spinner clears (data path) or the error
  // block renders (failure path). React-Query's chain involves multiple
  // microtasks (fetch promise → onSuccess → setState → render → effect
  // microtasks for any downstream observers), so a fixed-count flush is
  // racey. Polling is reliable.
  for (let i = 0; i < 30; i += 1) {
    const stillLoading = container.querySelector(
      '[data-testid="env-status-loading"]',
    );
    if (!stillLoading) break;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe("EnvStatusPanel", () => {
  it("renders the four env-var rows with the source badges from /api/system/env-status", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "PUBLIC_APP_URL",
    ] as const) {
      const row = container.querySelector(
        `[data-testid="env-status-row-${key}"]`,
      );
      expect(row, `missing row for ${key}`).not.toBeNull();
    }

    expect(
      container.querySelector('[data-testid="env-status-badge-DATABASE_URL"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.env"));
    expect(
      container.querySelector('[data-testid="env-status-badge-SESSION_SECRET"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.file"));
    expect(
      container.querySelector('[data-testid="env-status-badge-ENCRYPTION_KEY"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.env"));
    expect(
      container.querySelector('[data-testid="env-status-badge-PUBLIC_APP_URL"]')!
        .textContent,
    ).toBe(i18n.t("setup.envHelper.badge.env"));

    // The PUBLIC_APP_URL row is the only one that surfaces the resolved
    // value (already public via the app's own URLs / webhooks).
    const valueHint = container.querySelector(
      '[data-testid="env-status-value-PUBLIC_APP_URL"]',
    );
    expect(valueHint?.textContent).toBe("https://app.example.com");
  });

  it("shows the promote-hint when at least one row is file/wizard-sourced", async () => {
    mockFetch({
      databaseUrlSource: "wizard",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    await renderPanel();

    const hint = container.querySelector(
      '[data-testid="env-status-promote-hint"]',
    );
    expect(hint, "promote hint should render").not.toBeNull();
    expect(hint!.textContent).toBe(i18n.t("setup.envHelper.promoteHint"));
  });

  it("hides the promote-hint when every row is env-sourced", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    expect(
      container.querySelector('[data-testid="env-status-promote-hint"]'),
    ).toBeNull();
  });

  it("collapses snapshot 'none'/'default' sources into the 'not-set' badge", async () => {
    mockFetch({
      databaseUrlSource: "none",
      sessionSecretSource: "none",
      encryptionKeySource: "none",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    await renderPanel();

    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "PUBLIC_APP_URL",
    ] as const) {
      expect(
        container.querySelector(`[data-testid="env-status-badge-${key}"]`)!
          .textContent,
      ).toBe(i18n.t("setup.envHelper.badge.not-set"));
    }
  });

  it("renders the System Health cross-link when amber/red rows exist and detailsHref is provided", async () => {
    mockFetch({
      databaseUrlSource: "wizard",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel({
      detailsHref: "/config?tab=system-settings&subtab=env-status",
    });

    const link = container.querySelector(
      '[data-testid="env-status-details-link"]',
    ) as HTMLAnchorElement | null;
    expect(link, "details link should render when amber row + href").not.toBeNull();
    expect(link!.getAttribute("href")).toBe(
      "/config?tab=system-settings&subtab=env-status",
    );
  });

  it("renders the cross-link when any row is not-set (red) and detailsHref is provided", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "none",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel({ detailsHref: "/config?tab=system-settings&subtab=env-status" });

    expect(
      container.querySelector('[data-testid="env-status-details-link"]'),
    ).not.toBeNull();
  });

  it("hides the cross-link when every row is env-sourced even if detailsHref is provided", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel({ detailsHref: "/config?tab=system-settings&subtab=env-status" });

    expect(
      container.querySelector('[data-testid="env-status-details-link"]'),
    ).toBeNull();
  });

  it("hides the cross-link when detailsHref is omitted, even with amber rows", async () => {
    mockFetch({
      databaseUrlSource: "wizard",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    expect(
      container.querySelector('[data-testid="env-status-details-link"]'),
    ).toBeNull();
  });

  // ───────────────────────────────────────────────────────────────────
  // Task #488 — rollup banner + 4-badge layout + legend
  // ───────────────────────────────────────────────────────────────────

  it("renders the green 'all OK' banner when every row is env-sourced", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    const banner = container.querySelector(
      '[data-testid="env-status-banner"]',
    ) as HTMLElement | null;
    expect(banner, "banner should always render once data loads").not.toBeNull();
    expect(banner!.getAttribute("data-state")).toBe("ok");
    expect(banner!.textContent).toContain(
      i18n.t("config.envStatus.banner.okTitle"),
    );
    expect(banner!.textContent).toContain(
      i18n.t("config.envStatus.banner.okDescription"),
    );
  });

  it("renders the amber 'promote' banner with the count when any row is file/wizard-sourced", async () => {
    mockFetch({
      databaseUrlSource: "wizard",
      sessionSecretSource: "file",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    const banner = container.querySelector(
      '[data-testid="env-status-banner"]',
    ) as HTMLElement | null;
    expect(banner!.getAttribute("data-state")).toBe("promote");
    expect(banner!.textContent).toContain(
      i18n.t("config.envStatus.banner.promoteTitle", { count: 2 }),
    );
    expect(banner!.textContent).toContain(
      i18n.t("config.envStatus.banner.promoteDescription"),
    );
  });

  it("renders the red 'missing' banner when any row is not-set, even if other rows are file/wizard", async () => {
    // Missing trumps promote — a missing var is a hard outage, while
    // a file/wizard one only becomes a problem on the next rebuild.
    mockFetch({
      databaseUrlSource: "wizard",
      sessionSecretSource: "none",
      encryptionKeySource: "none",
      publicAppUrl: "http://localhost:5000",
      publicAppUrlSource: "default",
    });
    await renderPanel();

    const banner = container.querySelector(
      '[data-testid="env-status-banner"]',
    ) as HTMLElement | null;
    expect(banner!.getAttribute("data-state")).toBe("missing");
    expect(banner!.textContent).toContain(
      i18n.t("config.envStatus.banner.missingTitle", { count: 3 }),
    );
  });

  it("renders all four legend entries with the 'Expected' marker on the env entry", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    const legend = container.querySelector(
      '[data-testid="env-status-legend"]',
    );
    expect(legend, "legend should render once data loads").not.toBeNull();

    for (const src of ["env", "file", "wizard", "not-set"] as const) {
      expect(
        container.querySelector(`[data-testid="env-status-legend-item-${src}"]`),
        `legend entry for ${src} should render`,
      ).not.toBeNull();
    }

    const expectedMarker = container.querySelector(
      '[data-testid="env-status-legend-expected-marker"]',
    );
    expect(
      expectedMarker,
      "the env legend entry must carry the 'Expected' marker",
    ).not.toBeNull();
    expect(expectedMarker!.textContent).toContain(
      i18n.t("config.envStatus.legend.expected"),
    );

    // The marker must live inside the env legend entry (not, say, the
    // file/wizard/not-set ones).
    const envEntry = container.querySelector(
      '[data-testid="env-status-legend-item-env"]',
    );
    expect(envEntry!.contains(expectedMarker!)).toBe(true);
  });

  it("renders all four badges per row, with the active source marked and the others muted", async () => {
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "none",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "wizard" as unknown as "env",
    });
    await renderPanel();

    // For each row, all four sources should be represented as a badge,
    // and exactly one should be the active variant.
    const expectations: Array<{ key: string; activeSource: string }> = [
      { key: "DATABASE_URL", activeSource: "env" },
      { key: "SESSION_SECRET", activeSource: "file" },
      { key: "ENCRYPTION_KEY", activeSource: "not-set" },
      // PUBLIC_APP_URL maps "wizard" via mapPublicUrlSource → "not-set"
      // because the snapshot only emits env/file/default for that key.
      { key: "PUBLIC_APP_URL", activeSource: "not-set" },
    ];

    for (const { key, activeSource } of expectations) {
      const row = container.querySelector(
        `[data-testid="env-status-row-${key}"]`,
      ) as HTMLElement | null;
      expect(row, `row for ${key} should render`).not.toBeNull();

      const allBadges = row!.querySelectorAll("[data-active]");
      expect(allBadges.length, `${key} should render four badges`).toBe(4);

      const activeBadges = row!.querySelectorAll('[data-active="true"]');
      expect(
        activeBadges.length,
        `${key} should have exactly one active badge`,
      ).toBe(1);
      const activeBadge = activeBadges[0] as HTMLElement;
      expect(activeBadge.getAttribute("data-source")).toBe(activeSource);

      // Active badge keeps the legacy testid; the other three carry
      // per-source testids so they can be queried explicitly.
      expect(
        row!.querySelector(`[data-testid="env-status-badge-${key}"]`),
        `${key} active badge should keep the legacy testid`,
      ).toBe(activeBadge);
      const sources = ["env", "file", "wizard", "not-set"] as const;
      for (const src of sources) {
        if (src === activeSource) continue;
        const muted = row!.querySelector(
          `[data-testid="env-status-badge-${key}-${src}"]`,
        );
        expect(
          muted,
          `${key} should expose a muted badge for inactive source ${src}`,
        ).not.toBeNull();
        expect((muted as HTMLElement).getAttribute("data-active")).toBe(
          "false",
        );
      }
    }
  });

  it("never renders the resolved value for the secret rows (DATABASE_URL / SESSION_SECRET / ENCRYPTION_KEY)", async () => {
    // Defensive: the panel must only surface PUBLIC_APP_URL's value;
    // the other three are secrets and the API doesn't even send them,
    // but lock the contract anyway in case a future regression adds a
    // value-hint to the wrong row.
    mockFetch({
      databaseUrlSource: "env",
      sessionSecretSource: "env",
      encryptionKeySource: "env",
      publicAppUrl: "https://app.example.com",
      publicAppUrlSource: "env",
    });
    await renderPanel();

    expect(
      container.querySelector(
        '[data-testid="env-status-value-DATABASE_URL"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="env-status-value-SESSION_SECRET"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="env-status-value-ENCRYPTION_KEY"]',
      ),
    ).toBeNull();
    // PUBLIC_APP_URL is the one row that DOES surface the resolved value.
    expect(
      container.querySelector(
        '[data-testid="env-status-value-PUBLIC_APP_URL"]',
      ),
    ).not.toBeNull();
  });

  it("renders an error message when the request fails", async () => {
    globalThis.fetch = vi.fn(async () =>
      Promise.reject(new Error("network down")),
    ) as unknown as typeof fetch;
    await renderPanel();

    const err = container.querySelector('[data-testid="env-status-error"]');
    expect(err, "error block should render on fetch failure").not.toBeNull();
    expect(err!.textContent).toContain(
      i18n.t("config.envStatus.errorWithMessage", { message: "network down" }),
    );
  });

  it("renders the localized card title, description and loading copy", async () => {
    // Hold the fetch open so the loading state stays visible long enough to
    // assert against. We resolve it before the test returns so React-Query
    // doesn't keep the in-flight request leaking into the next test.
    let resolveFetch: (value: Response) => void = () => {};
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;

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
          <EnvStatusPanel />
        </QueryClientProvider>,
      );
    });
    // Let the initial render commit (loading state visible).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const panel = container.querySelector('[data-testid="env-status-panel"]')!;
    expect(panel.textContent).toContain(i18n.t("config.envStatus.title"));
    expect(panel.textContent).toContain(i18n.t("config.envStatus.description"));

    const loading = container.querySelector(
      '[data-testid="env-status-loading"]',
    );
    expect(loading?.textContent).toContain(i18n.t("config.envStatus.loading"));

    // Drain the open fetch + cleanup so the test doesn't leak a pending
    // promise into the next case.
    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({
        databaseUrlSource: "env",
        sessionSecretSource: "env",
        encryptionKeySource: "env",
        publicAppUrl: "https://app.example.com",
        publicAppUrlSource: "env",
      }),
      text: async () => "",
      headers: new Headers({ "content-type": "application/json" }),
    } as unknown as Response);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  });
});
