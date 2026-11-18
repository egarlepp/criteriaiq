// @vitest-environment happy-dom
//
// Coverage for task #372 — the source-of-truth badge on the Database
// Connections subtab. Mirrors the wording + colour grammar EnvStatusPanel
// and the Setup wizard already use, driven by the same bootstrap snapshot
// field (`databaseUrlSource`) via the shared `mapDatabaseUrlSource` helper.
//
// We mount `DatabaseConnectionSection` against an in-test QueryClient and
// stub `globalThis.fetch` so both `/api/db-connections` and
// `/api/system/env-status` return controlled payloads — no network involved.

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

import { DatabaseConnectionSection } from "../DatabaseConnectionSection";
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

interface FetchMap {
  envStatus?: unknown;
  envStatusStatus?: number;
  connections?: unknown;
}

function mockFetch(map: FetchMap) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/system/env-status")) {
      const status = map.envStatusStatus ?? 200;
      const body = map.envStatus ?? {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: new Headers({ "content-type": "application/json" }),
      } as unknown as Response;
    }
    // Default to the connections list endpoint
    const body = map.connections ?? {
      connections: [],
    };
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
      headers: new Headers({ "content-type": "application/json" }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

async function renderSection() {
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
        <DatabaseConnectionSection />
      </QueryClientProvider>,
    );
  });
  // Both /api/db-connections and /api/system/env-status resolve
  // independently. Drain microtasks until React-Query settles so the badge
  // reflects the snapshot rather than the initial undefined state.
  for (let i = 0; i < 50; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

function badge(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    '[data-testid="field-source-badge-database-url"]',
  );
  if (!el) throw new Error("DATABASE_URL source badge not rendered");
  return el;
}

describe("DatabaseConnectionSection — DATABASE_URL source-of-truth badge (task #372)", () => {
  it("renders the shared 'env' wording when the snapshot reports DATABASE_URL is in the host env", async () => {
    mockFetch({ envStatus: { databaseUrlSource: "env" } });
    await renderSection();

    const el = badge();
    expect(el.dataset.source).toBe("env");
    expect(el.textContent).toBe(i18n.t("setup.envHelper.fieldBadge.env"));
  });

  it("renders 'wizard' (amber) wording when the snapshot reports the value lives only in db-config.json", async () => {
    mockFetch({ envStatus: { databaseUrlSource: "wizard" } });
    await renderSection();

    const el = badge();
    expect(el.dataset.source).toBe("wizard");
    expect(el.textContent).toBe(i18n.t("setup.envHelper.fieldBadge.wizard"));
  });

  it("collapses snapshot 'none' into the 'not-set' (red) badge", async () => {
    mockFetch({ envStatus: { databaseUrlSource: "none" } });
    await renderSection();

    const el = badge();
    expect(el.dataset.source).toBe("not-set");
    expect(el.textContent).toBe(i18n.t("setup.envHelper.fieldBadge.not-set"));
  });

  it("falls back to 'not-set' if /api/system/env-status returns 403 (non-admin / unauthenticated)", async () => {
    mockFetch({ envStatus: { error: "forbidden" }, envStatusStatus: 403 });
    await renderSection();

    const el = badge();
    expect(el.dataset.source).toBe("not-set");
    expect(el.textContent).toBe(i18n.t("setup.envHelper.fieldBadge.not-set"));
  });
});
