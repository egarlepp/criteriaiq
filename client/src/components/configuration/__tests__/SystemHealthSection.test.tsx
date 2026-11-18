// @vitest-environment happy-dom
//
// Coverage for the System Health overview tile grid (Task #351). The
// component renders twelve status cards — eleven category statuses driven by
// `/api/system/health` plus an admin-only "Environment Variables" tile
// (Task #348) coloured by the `envVars` snapshot now folded into the same
// payload (Task #350). Without these tests a regression to the click
// handler (e.g. dropping the `href` branch) or to the worst-row computation
// would silently misroute operators during an incident.
//
// We mount the component against an in-test `QueryClient`, mock `useAuth`
// to flip between admin / non-admin and stub `globalThis.fetch` so it can
// route both `/api/system/health` and the child `EnvStatusPanel`'s
// `/api/system/env-status` request — mirroring the pattern in
// `EnvStatusPanel.test.tsx`.

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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// Mutable mock state — `vi.mock` factories are hoisted, but the closure
// reads `mockedUser` lazily so each test's `beforeEach` can swap roles.
let mockedUser: { id: string; email: string; role: string } | null = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockedUser,
    effectiveUser: mockedUser,
    isLoading: false,
    isAuthenticated: !!mockedUser,
  }),
}));

// `useLocation` only needs a stable [path, setter] pair. The component
// reads `location` to re-derive the active subtab from `window.location`
// on change, so a no-op setter is sufficient.
vi.mock("wouter", () => ({
  useLocation: () => ["/admin", () => {}] as const,
}));

import {
  SystemHealthSection,
  formatRelativeUpdatedAt,
  formatNextRefreshIn,
} from "../SystemHealthSection";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

interface HealthOverviewPayload {
  overallStatus: "ok" | "warning" | "error";
  lastChecked: string;
  // Database tile carries the optional pending-migration fields the
  // server folds in for Tasks #400 / #412 — `pendingMigrations` is the
  // total drift count, `pendingMigrationFiles` a server-capped preview
  // of the actual filenames that backs the tooltip + deep-link in the
  // overview grid. Optional so existing fixtures keep compiling.
  database: {
    status: "ok" | "warning" | "error";
    pendingMigrations?: number;
    pendingMigrationFiles?: string[];
    // Live pool snapshot (Task #515). Optional so existing fixtures
    // keep compiling — only the new pool-gauge tests populate it.
    connectionPool?: {
      poolMax?: number;
      totalCount?: number;
      idleCount?: number;
      waitingCount?: number;
      maxConnections?: number;
      totalConnections?: number;
      idleConnections?: number;
    };
  };
  email: { status: "ok" | "warning" | "error" };
  integrations: { status: "ok" | "warning" | "error" };
  security: { status: "ok" | "warning" | "error" };
  backgroundServices: { status: "ok" | "warning" | "error" };
  storage: { status: "ok" | "warning" | "error" };
  performance: { status: "ok" | "warning" | "error" };
  archiveSchemaValidation: { status: "ok" | "warning" | "error" };
  featureRequests?: { status: "ok" | "warning" | "error"; totalCount?: number };
  supportRequests?: { status: "ok" | "warning" | "error"; totalCount?: number };
  clientErrors?: { status: "ok" | "warning" | "error"; totalCount?: number };
  envVars?: {
    status?: "ok" | "warning" | "error";
    databaseUrlSource?: "env" | "wizard" | "none";
    sessionSecretSource?: "env" | "file" | "none";
    encryptionKeySource?: "env" | "file" | "none";
    publicAppUrlSource?: "env" | "file" | "default";
  };
  // Server-derived headline rollup (Task #352). The component destructures
  // this directly, so the mock must always supply it — otherwise the
  // overview render throws before the category grid mounts and every
  // assertion below fails on a missing tile.
  overviewCounts: {
    healthy: number;
    warning: number;
    error: number;
  };
}

function makeOverview(
  overrides: Partial<HealthOverviewPayload> = {},
): HealthOverviewPayload {
  return {
    overallStatus: "ok",
    lastChecked: new Date("2026-04-01T12:00:00Z").toISOString(),
    database: { status: "ok" },
    email: { status: "ok" },
    integrations: { status: "ok" },
    security: { status: "ok" },
    backgroundServices: { status: "ok" },
    storage: { status: "ok" },
    performance: { status: "ok" },
    archiveSchemaValidation: { status: "ok" },
    featureRequests: { status: "ok", totalCount: 0 },
    supportRequests: { status: "ok", totalCount: 0 },
    clientErrors: { status: "ok", totalCount: 0 },
    overviewCounts: { healthy: 11, warning: 0, error: 0 },
    ...overrides,
  };
}

// Route fetch by URL so the parent's `/api/system/health` and the
// embedded `EnvStatusPanel`'s `/api/system/env-status` can each be served
// independently — mirrors how the production server wires them.
function installFetchRouter(handlers: {
  health: () => HealthOverviewPayload;
  envStatus?: () => unknown;
}) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes("/api/system/health")) {
      const body = handlers.health();
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: new Headers({ "content-type": "application/json" }),
      } as unknown as Response;
    }
    if (url.includes("/api/system/env-status")) {
      const body = handlers.envStatus
        ? handlers.envStatus()
        : { databaseUrlSource: "env", sessionSecretSource: "env", encryptionKeySource: "env", publicAppUrl: "https://app.example.com", publicAppUrlSource: "env" };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: new Headers({ "content-type": "application/json" }),
      } as unknown as Response;
    }
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "",
      headers: new Headers(),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  mockedUser = { id: "user-1", email: "admin@example.com", role: "Admin" };
  // Reset URL between tests so click-handler assertions start from a known
  // path. happy-dom honours `pushState` so this isolates each case.
  window.history.pushState({}, "", "/admin?tab=system-health");
  // Clear any persisted refresh-cadence preference from a prior test
  // (Task #437). The component reads `localStorage` lazily on mount, so
  // a leaked value from a previous case would contaminate the
  // "default cadence" assertions below.
  window.localStorage.clear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

async function renderSection() {
  // Disable retries so error paths resolve on the first failure rather
  // than waiting through the default backoff schedule. Provide a default
  // `queryFn` matching the production `queryClient` so any query that
  // omits an explicit fetcher (e.g. the embedded `EnvStatusPanel`) still
  // resolves against our mocked fetch.
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
        <SystemHealthSection />
      </QueryClientProvider>,
    );
  });
  // Poll until the overview data has resolved and the category grid is
  // committed. React-Query's chain (fetch → onSuccess → setState → render)
  // spans multiple microtasks so a fixed-count flush is racey.
  for (let i = 0; i < 30; i += 1) {
    const dbCard = container.querySelector(
      '[data-testid="health-card-database"]',
    );
    if (dbCard) break;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  // Let any downstream effects (env-status panel queries, etc.) settle so
  // assertions about the env tile colour see the post-rollup state.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  // Returned so tests that need to drive multiple polls (Task #515 —
  // sustained-waiters debounce) can `client.invalidateQueries()` to
  // re-fetch the overview without spinning up their own client.
  return client;
}

describe("SystemHealthSection", () => {
  describe("Environment Variables tile visibility", () => {
    it("renders the env-status tile for admin users", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "ok",
              databaseUrlSource: "env",
              sessionSecretSource: "env",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      expect(
        container.querySelector('[data-testid="health-card-env-status"]'),
      ).not.toBeNull();
    });

    it("hides the env-status tile for non-admin users", async () => {
      mockedUser = { id: "user-2", email: "se@example.com", role: "SE" };
      installFetchRouter({
        // Non-admins don't get the `envVars` block from the server, so the
        // tile should drop out of the grid entirely. Mirror that by
        // omitting it from the overview payload.
        health: () => makeOverview(),
      });
      await renderSection();

      // Other category tiles still render — only the env-status one is gated.
      expect(
        container.querySelector('[data-testid="health-card-database"]'),
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="health-card-env-status"]'),
      ).toBeNull();
    });

    it("still hides the env-status tile for non-admin users even if the server accidentally returns envVars", async () => {
      // Belt-and-braces: the server already strips `envVars` for non-admins
      // (Task #350), but the frontend's `isAdmin` gate must hold even if a
      // future regression sends the block through. Otherwise an SE could
      // see — and click into — an admin-only sub-tab.
      mockedUser = { id: "user-2", email: "se@example.com", role: "SE" };
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "error",
              databaseUrlSource: "wizard",
              sessionSecretSource: "none",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      expect(
        container.querySelector('[data-testid="health-card-env-status"]'),
      ).toBeNull();
    });
  });

  describe("Environment Variables tile colour matches the worst env row", () => {
    it("renders green when every row is env-sourced", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "ok",
              databaseUrlSource: "env",
              sessionSecretSource: "env",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-env-status"]',
      );
      expect(tile).not.toBeNull();
      expect(tile!.className).toContain("border-green-200");
      // Status label under the tile name reflects the same rollup.
      expect(tile!.textContent).toContain("ok");
    });

    it("renders amber when at least one row is file/wizard-sourced", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-env-status"]',
      );
      expect(tile).not.toBeNull();
      expect(tile!.className).toContain("border-yellow-200");
      expect(tile!.textContent).toContain("warning");
    });

    it("renders red when at least one row is not-set, even alongside file rows", async () => {
      // not-set must dominate file/wizard — verifies the worst-row
      // computation isn't short-circuited by the warning branch.
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "error",
              databaseUrlSource: "wizard",
              sessionSecretSource: "none",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-env-status"]',
      );
      expect(tile).not.toBeNull();
      expect(tile!.className).toContain("border-red-200");
      expect(tile!.textContent).toContain("error");
    });
  });

  describe("Environment Variables tile click handler", () => {
    it("scrolls to the env-var panel on the same page instead of navigating", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-env-status"]',
      ) as HTMLElement | null;
      expect(tile).not.toBeNull();

      const before = window.location.pathname + window.location.search;
      const scrollSpy = vi.fn();
      const originalScroll = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollSpy;
      const popstateSpy = vi.fn();
      window.addEventListener("popstate", popstateSpy);

      act(() => {
        tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      window.removeEventListener("popstate", popstateSpy);
      Element.prototype.scrollIntoView = originalScroll;

      // The panel lives on this page, so the URL stays put and no
      // cross-tab navigation fires.
      expect(window.location.pathname + window.location.search).toBe(before);
      expect(popstateSpy).not.toHaveBeenCalled();
    });
  });

  // Defensive fallback for a missing `overviewCounts` block (Task #355).
  // If a future server change omits the field — or returns `null` — the
  // overview must degrade to a still-useful render rather than throwing
  // and leaving operators staring at a blank panel during an incident.
  // The fallback counts the per-category statuses client-side so the
  // headline tiles show numbers consistent with the grid below.
  describe("defensive handling of missing overviewCounts", () => {
    it("renders the overview without crashing when overviewCounts is omitted", async () => {
      installFetchRouter({
        // Build a payload that satisfies every other field but drops the
        // server-derived rollup. Using `delete` on a typed object is
        // cleaner than re-typing the whole shape — the cast localises
        // the looseness to this one test.
        health: () => {
          const payload = makeOverview({
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          });
          delete (payload as Partial<HealthOverviewPayload>).overviewCounts;
          return payload;
        },
      });
      await renderSection();

      // Category grid still mounts — the regression manifested as a
      // blank panel because the destructure threw before the grid
      // rendered, so the simplest pin is "the grid is here".
      expect(
        container.querySelector('[data-testid="health-card-database"]'),
      ).not.toBeNull();
    });

    it("falls back to counting the visible category tiles when overviewCounts is null", async () => {
      // Two warnings (email + env-vars) and one error (storage); the
      // remaining nine of the twelve admin-visible tiles are healthy.
      // Verifying the headline numbers proves the fallback isn't just
      // zeroing out — operators get a number that matches what they see
      // in the grid below.
      installFetchRouter({
        health: () => {
          const payload = makeOverview({
            email: { status: "warning" },
            storage: { status: "error" },
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          });
          // `null` is the other shape a defensive client must tolerate —
          // a server that explicitly serialises a missing rollup as
          // `null` instead of omitting the key would otherwise still
          // crash the destructure.
          (payload as unknown as { overviewCounts: null }).overviewCounts =
            null;
          return payload;
        },
      });
      await renderSection();

      // The three big rollup tiles render the counts as the only
      // standalone numeric strings inside their cards. Locate them by
      // matching the headline text rather than by position so a future
      // re-order of the grid doesn't silently flip the assertion.
      const headings = Array.from(
        container.querySelectorAll("h3"),
      ) as HTMLElement[];
      const findCount = (label: string) => {
        const heading = headings.find((h) => h.textContent?.trim() === label);
        expect(heading, `${label} heading present`).toBeDefined();
        // The headline tile wraps the title row and the count in
        // sibling divs inside a shared `CardContent`. Walk up to the
        // title-row parent and read the next sibling div — same shape
        // used by the production markup so the test doubles as a
        // layout pin.
        const titleRow = heading!.parentElement;
        expect(titleRow, `${label} title row present`).not.toBeNull();
        const countEl = titleRow!.nextElementSibling as HTMLElement | null;
        expect(countEl, `${label} count element present`).not.toBeNull();
        return countEl!.textContent?.trim();
      };

      expect(findCount("Healthy")).toBe("9");
      expect(findCount("Warnings")).toBe("2");
      expect(findCount("Errors")).toBe("1");
    });

    it("backfills missing keys when overviewCounts is partial", async () => {
      // A partially-formed `overviewCounts` (server filled `healthy`
      // but forgot `warning`/`error`) used to render `undefined` for
      // the missing tiles. Each missing key should fall back to the
      // client-derived count for just that slot, while the present
      // key continues to come from the server — keeps the server as
      // the source of truth wherever possible.
      installFetchRouter({
        health: () => {
          const payload = makeOverview({
            email: { status: "warning" },
            storage: { status: "error" },
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
          });
          // Server-supplied healthy intentionally disagrees with the
          // client tally (99 vs. 6) so the assertion proves the
          // present key won — not that we accidentally fell through
          // to the fallback for everything.
          (payload as unknown as { overviewCounts: { healthy: number } })
            .overviewCounts = { healthy: 99 };
          return payload;
        },
      });
      await renderSection();

      const headings = Array.from(
        container.querySelectorAll("h3"),
      ) as HTMLElement[];
      const findCount = (label: string) => {
        const heading = headings.find((h) => h.textContent?.trim() === label);
        const titleRow = heading!.parentElement;
        const countEl = titleRow!.nextElementSibling as HTMLElement | null;
        return countEl!.textContent?.trim();
      };

      // Server-supplied `healthy` wins.
      expect(findCount("Healthy")).toBe("99");
      // Missing `warning`/`error` fall back to the client tally over
      // the visible nine tiles (one warning category + one warning
      // env-vars row = 2; one error category = 1).
      expect(findCount("Warnings")).toBe("2");
      expect(findCount("Errors")).toBe("1");
    });
  });

  // Coverage for the eight "category" tiles (Database, Email, Integrations,
  // Security, Background Services, Storage, Performance, Archive Validation)
  // added in Task #353. Each tile shares the same render + click handler
  // shape, so a single parametrised loop catches the regressions that
  // matter: a swapped subtab key, a dropped popstate dispatch, or a
  // mismatch between the API field and the tile colour. Adding a tenth
  // tile only requires adding one row to `categoryTiles` below.
  describe("Category tile rendering and click handling", () => {
    // `apiField` is the key on `/api/system/health` whose `status` colours
    // the tile; `key` is the value the click handler pushes onto the URL
    // as `subtab`; `label` is the human-readable string rendered under the
    // icon. These three are decoupled in the component (e.g.
    // `backgroundServices` → `services` → "Background Services") so the
    // table flushes them out individually.
    const categoryTiles: ReadonlyArray<{
      apiField: keyof Pick<
        HealthOverviewPayload,
        | "database"
        | "email"
        | "integrations"
        | "security"
        | "backgroundServices"
        | "storage"
        | "performance"
        | "archiveSchemaValidation"
      >;
      key: string;
      label: string;
    }> = [
      { apiField: "database", key: "database", label: "Database" },
      { apiField: "email", key: "email", label: "Email System" },
      { apiField: "integrations", key: "integrations", label: "Integrations" },
      { apiField: "security", key: "security", label: "Security" },
      { apiField: "backgroundServices", key: "services", label: "Background Services" },
      { apiField: "storage", key: "storage", label: "Storage" },
      { apiField: "performance", key: "performance", label: "Performance" },
      { apiField: "archiveSchemaValidation", key: "archive", label: "Archive Validation" },
    ];

    // Map the three traffic-light statuses to the Tailwind border class the
    // component applies on the tile root. These come straight from
    // `SystemHealthSection.tsx` — keep them in lockstep so a colour-class
    // swap fails the test instead of silently mis-shading the tile.
    const statusBorderClass: Record<"ok" | "warning" | "error", string> = {
      ok: "border-green-200",
      warning: "border-yellow-200",
      error: "border-red-200",
    };

    for (const { apiField, key, label } of categoryTiles) {
      describe(`${label} tile (key="${key}")`, () => {
        it(`renders with data-testid health-card-${key} and the correct label`, async () => {
          installFetchRouter({ health: () => makeOverview() });
          await renderSection();

          const tile = container.querySelector(
            `[data-testid="health-card-${key}"]`,
          );
          expect(tile).not.toBeNull();
          // The label is rendered inside the tile body — protects against a
          // future refactor accidentally shuffling the label/icon mapping.
          expect(tile!.textContent).toContain(label);
        });

        for (const status of ["ok", "warning", "error"] as const) {
          it(`reflects the ${status} status from /api/system/health`, async () => {
            installFetchRouter({
              health: () =>
                makeOverview({
                  // Override just the field under test so the other seven
                  // tiles stay green and we can attribute any colour
                  // change to this row.
                  [apiField]: { status },
                } as Partial<HealthOverviewPayload>),
            });
            await renderSection();

            const tile = container.querySelector(
              `[data-testid="health-card-${key}"]`,
            );
            expect(tile).not.toBeNull();
            expect(tile!.className).toContain(statusBorderClass[status]);
            // The lower-case status label sits under the tile name, so
            // mirror what an operator scanning the grid would see.
            expect(tile!.textContent).toContain(status);
          });
        }

        it(`pushes /admin?tab=system-health&subtab=${key} and dispatches popstate on click`, async () => {
          installFetchRouter({ health: () => makeOverview() });
          await renderSection();

          const tile = container.querySelector(
            `[data-testid="health-card-${key}"]`,
          ) as HTMLElement | null;
          expect(tile).not.toBeNull();

          // Capture popstate so we can assert the same handshake
          // `config.tsx` listens for (history push + popstate dispatch).
          // Without the dispatch the outer page would never re-derive the
          // active sub-tab and operators would land on stale content.
          const popstateSpy = vi.fn();
          window.addEventListener("popstate", popstateSpy);

          act(() => {
            tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
          });

          window.removeEventListener("popstate", popstateSpy);

          expect(window.location.pathname + window.location.search).toBe(
            `/admin?tab=system-health&subtab=${key}`,
          );
          expect(popstateSpy).toHaveBeenCalled();
        });
      });
    }
  });

  // Coverage for Task #354 — pin the rendered invariant the operator
  // mental-models around. The three big "Healthy / Warnings / Errors"
  // tiles above the grid are driven by `overviewCounts` from the
  // server, while the tiles below are coloured per-component. A server
  // bug that miscounted (e.g. forgot to include the env-vars row, or
  // double-counted a warning) would render a grid where the headline
  // says "0 errors" while a tile is bright red. The tests below feed a
  // mixed payload and assert the headline numbers ALWAYS equal the
  // count of tiles with each border colour.
  describe("Headline overview counts match the rendered tile colours", () => {
    // Read the integer text out of the three big counter tiles. The
    // counts are rendered as the only `.text-2xl.font-bold.text-{colour}-600`
    // descendants so a class selector is stable enough — and decouples
    // the assertion from the surrounding card chrome.
    function readHeadlineCounts(): {
      healthy: number;
      warning: number;
      error: number;
    } {
      const healthy = container.querySelector(
        ".text-2xl.font-bold.text-green-600",
      );
      const warning = container.querySelector(
        ".text-2xl.font-bold.text-yellow-600",
      );
      const error = container.querySelector(
        ".text-2xl.font-bold.text-red-600",
      );
      return {
        healthy: Number(healthy?.textContent ?? "NaN"),
        warning: Number(warning?.textContent ?? "NaN"),
        error: Number(error?.textContent ?? "NaN"),
      };
    }

    // Count tiles in the category grid by their border colour. Mirrors
    // the Tailwind classes the component applies in
    // `SystemHealthSection.tsx` — one of `border-{green,yellow,red}-200`
    // per tile, applied to the `[data-testid^="health-card-"]` root.
    function readTileColourCounts(): {
      healthy: number;
      warning: number;
      error: number;
    } {
      const tiles = Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-testid^="health-card-"]',
        ),
      );
      let healthy = 0;
      let warning = 0;
      let error = 0;
      for (const tile of tiles) {
        if (tile.className.includes("border-green-200")) healthy += 1;
        else if (tile.className.includes("border-yellow-200")) warning += 1;
        else if (tile.className.includes("border-red-200")) error += 1;
      }
      return { healthy, warning, error };
    }

    it("admin grid: 9 ok / 1 warning / 1 error categories + a warning env-vars tile (12 tiles total)", async () => {
      // Mixed payload covering all three statuses across the eleven
      // categories AND a file-sourced session secret so the env-vars
      // tile is yellow. Headline must read 6 / 2 / 1 — exactly the
      // count of green / yellow / red tiles below.
      installFetchRouter({
        health: () =>
          makeOverview({
            overallStatus: "error",
            email: { status: "warning" },
            security: { status: "error" },
            envVars: {
              status: "warning",
              databaseUrlSource: "env",
              sessionSecretSource: "file",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
            // Server-derived counts — what the dashboard renders into
            // the headline tiles. Matches the per-tile fold in
            // `withEnvVars` (Task #354): 6 healthy categories +
            // 1 warning category + 1 error category + 1 warning env tile.
            overviewCounts: { healthy: 9, warning: 2, error: 1 },
          }),
      });
      await renderSection();

      // Eight category tiles + the env-vars tile must all be present
      // for the contract to even be meaningful.
      const tiles = container.querySelectorAll(
        '[data-testid^="health-card-"]',
      );
      expect(tiles).toHaveLength(12);

      const headline = readHeadlineCounts();
      const tileColours = readTileColourCounts();

      // Cross-check the absolute numbers first so a regression to the
      // headline OR the tile shading would each fail loudly.
      expect(headline).toEqual({ healthy: 9, warning: 2, error: 1 });
      expect(tileColours).toEqual({ healthy: 9, warning: 2, error: 1 });
      // And the invariant itself: the two surfaces must agree.
      expect(headline).toEqual(tileColours);
    });

    it("admin grid: env-vars tile is the only red tile (11 ok categories + 1 error env tile)", async () => {
      // Catches the regression the task description calls out by name
      // — a server bug that forgot to include the env-vars row would
      // render a headline of "0 errors" alongside one bright-red tile.
      installFetchRouter({
        health: () =>
          makeOverview({
            overallStatus: "error",
            envVars: {
              status: "error",
              databaseUrlSource: "env",
              sessionSecretSource: "none",
              encryptionKeySource: "env",
              publicAppUrlSource: "env",
            },
            overviewCounts: { healthy: 11, warning: 0, error: 1 },
          }),
      });
      await renderSection();

      const headline = readHeadlineCounts();
      const tileColours = readTileColourCounts();

      expect(tileColours).toEqual({ healthy: 11, warning: 0, error: 1 });
      expect(headline).toEqual(tileColours);
    });

    it("non-admin grid: 9 ok / 1 warning / 1 error categories with no env-vars tile (11 tiles total)", async () => {
      // Non-admins don't get the env-vars block from the server, so the
      // tile is filtered out of the grid and the headline counts only
      // the eleven categories. The contract still holds.
      mockedUser = { id: "user-2", email: "se@example.com", role: "SE" };
      installFetchRouter({
        health: () =>
          makeOverview({
            overallStatus: "error",
            email: { status: "warning" },
            security: { status: "error" },
            overviewCounts: { healthy: 9, warning: 1, error: 1 },
          }),
      });
      await renderSection();

      const tiles = container.querySelectorAll(
        '[data-testid^="health-card-"]',
      );
      expect(tiles).toHaveLength(11);

      const headline = readHeadlineCounts();
      const tileColours = readTileColourCounts();

      expect(headline).toEqual({ healthy: 9, warning: 1, error: 1 });
      expect(tileColours).toEqual({ healthy: 9, warning: 1, error: 1 });
      expect(headline).toEqual(tileColours);
    });
  });

  // Auto-refresh contract for the headline overview (Task #411). Task #400
  // wires migration drift into the Database tile, but without a periodic
  // refetch an admin already on the page would keep seeing "all green"
  // until a reload — defeating the whole point of surfacing drift on the
  // dashboard. The component sets `refetchInterval: 60000` precisely to
  // close that gap; this test pins the contract so a future re-shape of
  // the `useQuery` options can't silently drop polling and reintroduce
  // the regression.
  describe("Auto-refresh polling (Task #411)", () => {
    it("refetches /api/system/health after the polling interval so drift appears without a manual reload", async () => {
      // Count health-endpoint hits independently of the env-status panel
      // so the assertion isn't sensitive to the embedded panel's own
      // (separately polled) cadence.
      let healthHits = 0;
      installFetchRouter({
        health: () => {
          healthHits += 1;
          return makeOverview();
        },
      });

      // `shouldAdvanceTime: true` keeps the real clock ticking so the
      // existing `renderSection` helper — which polls for the mounted
      // category grid via `setTimeout(r, 5)` — still resolves while the
      // mock clock controls TanStack Query's interval scheduler.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();

        // Initial mount fetch must have landed before we start advancing
        // the clock, otherwise the post-advance count below would be off
        // by one and the test would pass for the wrong reason.
        expect(healthHits).toBe(1);

        // Advance past the 60s `refetchInterval` and let any
        // microtasks the resulting fetch chains through (queryFn →
        // setState → re-render) flush.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(60_000);
        });
        for (let i = 0; i < 5; i += 1) {
          await act(async () => {
            await new Promise((r) => setTimeout(r, 5));
          });
        }

        // At least one additional hit means the polling fired; a strict
        // `>= 2` (rather than `=== 2`) tolerates any focus-driven
        // refetch that may overlap on slower CI without masking the
        // regression we care about (which would leave it stuck at 1).
        expect(healthHits).toBeGreaterThanOrEqual(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not poll /api/system/health while the tab is hidden so we don't waste resources in the background", async () => {
      // Mirrors the "debounced/paused while the tab is hidden" line in
      // the Done-looks-like list. TanStack Query reads the tab's focus
      // state from its `focusManager`; flipping `document.hidden` and
      // dispatching `visibilitychange` is what production uses to drive
      // it, so we replay the same handshake here rather than reaching
      // into the manager directly.
      let healthHits = 0;
      installFetchRouter({
        health: () => {
          healthHits += 1;
          return makeOverview();
        },
      });

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();
        expect(healthHits).toBe(1);

        // Mark the document hidden and notify TanStack Query's focus
        // manager. `Object.defineProperty` is required because
        // `document.visibilityState` and `document.hidden` are
        // read-only getters in happy-dom.
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "hidden",
        });
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => true,
        });
        await act(async () => {
          document.dispatchEvent(new Event("visibilitychange"));
        });

        // Now spin the clock well past the polling interval. With the
        // tab hidden, `refetchIntervalInBackground: false` should keep
        // the count pinned at the initial mount fetch.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(180_000);
        });
        for (let i = 0; i < 5; i += 1) {
          await act(async () => {
            await new Promise((r) => setTimeout(r, 5));
          });
        }

        expect(healthHits).toBe(1);

        // Restore visibility for downstream tests so they don't inherit
        // the hidden state. Re-defining the getters is enough — the
        // afterEach cleanup also restores fetch and unmounts the root.
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          get: () => "visible",
        });
        Object.defineProperty(document, "hidden", {
          configurable: true,
          get: () => false,
        });
        await act(async () => {
          document.dispatchEvent(new Event("visibilitychange"));
        });
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // Coverage for Task #412 — when the server reports migration drift,
  // the Database tile must surface both the count AND the filenames in
  // its hover tooltip, with a "+N more" indicator when the preview is
  // capped, AND its click must deep-link into the Schema Migrations
  // card via a URL hash so an admin lands directly on the panel that
  // owns the full list.
  describe("Database tile pending-migrations tooltip and deep-link", () => {
    // Radix's `TooltipContent` renders into a portal that is mounted
    // outside of `container`, and only when the trigger is focused or
    // hovered. Opening it via a focus event (cheaper and more reliable
    // in happy-dom than a synthetic pointermove sequence) and reading
    // the content from `document.body` matches what Radix actually
    // exposes to assistive tech, so the assertions below mirror what
    // a screen-reader or hover would surface.
    async function openTileTooltipAndRead(testid: string) {
      const tile = container.querySelector(
        `[data-testid="${testid}"]`,
      ) as HTMLElement | null;
      expect(tile).not.toBeNull();
      act(() => {
        tile!.focus();
        tile!.dispatchEvent(
          new FocusEvent("focus", { bubbles: true }),
        );
      });
      // Wait a tick — Radix opens the content asynchronously on focus.
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
        if (
          document.body.querySelector(
            `[data-testid="tooltip-health-card-${testid.replace("health-card-", "")}"]`,
          )
        ) {
          break;
        }
      }
      return document.body.querySelector(
        `[data-testid="tooltip-health-card-${testid.replace("health-card-", "")}"]`,
      );
    }

    it("attaches a tooltip listing each filename when the server returns a short pending list", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "warning",
              pendingMigrations: 2,
              pendingMigrationFiles: [
                "021_add_widget_table.sql",
                "022_add_widget_index.sql",
              ],
            },
            overviewCounts: { healthy: 7, warning: 1, error: 0 },
          }),
      });
      await renderSection();

      const tooltip = await openTileTooltipAndRead("health-card-database");
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain("2 migrations on disk");
      expect(tooltip!.textContent).toContain("021_add_widget_table.sql");
      expect(tooltip!.textContent).toContain("022_add_widget_index.sql");
      // No "+N more" indicator when every file is shown.
      expect(
        document.body.querySelector(
          '[data-testid="tooltip-pending-migration-more"]',
        ),
      ).toBeNull();
    });

    it("renders a +N more indicator when the server caps the file list below the total", async () => {
      // Server caps the preview at 5 (PENDING_MIGRATION_FILES_LIMIT)
      // but reports the true total via `pendingMigrations`. The tile
      // has to communicate the gap so an operator knows to click in
      // for the rest — the deep-link is meaningless if the tooltip
      // looks complete.
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "warning",
              pendingMigrations: 8,
              pendingMigrationFiles: [
                "021_a.sql",
                "022_b.sql",
                "023_c.sql",
                "024_d.sql",
                "025_e.sql",
              ],
            },
            overviewCounts: { healthy: 7, warning: 1, error: 0 },
          }),
      });
      await renderSection();

      const tooltip = await openTileTooltipAndRead("health-card-database");
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain("8 migrations on disk");
      const more = document.body.querySelector(
        '[data-testid="tooltip-pending-migration-more"]',
      );
      expect(more).not.toBeNull();
      expect(more!.textContent).toBe("+3 more");
    });

    it("uses singular wording when only one migration is pending", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "warning",
              pendingMigrations: 1,
              pendingMigrationFiles: ["021_only_one.sql"],
            },
            overviewCounts: { healthy: 7, warning: 1, error: 0 },
          }),
      });
      await renderSection();

      const tooltip = await openTileTooltipAndRead("health-card-database");
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain("1 migration on disk");
      expect(tooltip!.textContent).toContain("021_only_one.sql");
    });

    it("omits the tooltip entirely when there is no migration drift", async () => {
      // When `pendingMigrations` is zero (or absent) the tile must not
      // render the tooltip wrapper at all — operators rely on hover
      // tooltips meaning "something needs your attention here", so a
      // green tile with a tooltip would be a UX regression. Even after
      // attempting to focus the tile (which would open any wired
      // tooltip via Radix's keyboard affordance) the portal stays
      // empty, proving the wrapper was skipped — not just hidden.
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();
      const tooltip = await openTileTooltipAndRead("health-card-database");
      expect(tooltip).toBeNull();
    });

    it("deep-links to #schema-migrations on click when there is migration drift", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "warning",
              pendingMigrations: 2,
              pendingMigrationFiles: [
                "021_a.sql",
                "022_b.sql",
              ],
            },
            overviewCounts: { healthy: 7, warning: 1, error: 0 },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-database"]',
      ) as HTMLElement | null;
      expect(tile).not.toBeNull();

      const popstateSpy = vi.fn();
      const hashchangeSpy = vi.fn();
      window.addEventListener("popstate", popstateSpy);
      window.addEventListener("hashchange", hashchangeSpy);

      act(() => {
        tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      window.removeEventListener("popstate", popstateSpy);
      window.removeEventListener("hashchange", hashchangeSpy);

      // URL must include both the Database subtab AND the anchor so
      // the destination tab can scroll the matching card into view.
      expect(window.location.pathname + window.location.search).toBe(
        "/admin?tab=system-health&subtab=database",
      );
      expect(window.location.hash).toBe("#schema-migrations");
      // Both events fire — popstate so config.tsx re-derives the
      // active tab, hashchange so the Database tab's scroll-to
      // listener triggers.
      expect(popstateSpy).toHaveBeenCalled();
      expect(hashchangeSpy).toHaveBeenCalled();
    });

    it("does NOT add a hash when there is no migration drift", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-database"]',
      ) as HTMLElement | null;
      expect(tile).not.toBeNull();

      act(() => {
        tile!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      expect(window.location.pathname + window.location.search).toBe(
        "/admin?tab=system-health&subtab=database",
      );
      // No hash — the deep-link is reserved for the actionable case so
      // the Database tab doesn't auto-scroll on every click.
      expect(window.location.hash).toBe("");
    });
  });

  // Coverage for Task #515 — the connection-pool gauge surfaced
  // directly on the System Health overview's Database tile so an
  // operator landing on the dashboard during an incident can spot
  // pool exhaustion without having to click through to the deep
  // Database Health tab. The gauge mirrors the contract the deep
  // tab already reads from `/api/system/health/database`: a
  // `totalCount / poolMax` headline plus a "N waiting" badge when
  // `waitingCount > 0`, and a sustained-waiters debounce that
  // downgrades the tile from `ok` to `warning` only after waiters
  // have been observed across multiple polls (so a single transient
  // burst doesn't redden the tile).
  describe("Database tile connection-pool gauge (Task #515)", () => {
    it("renders the 'Pool X / Y' gauge from the connectionPool block", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "ok",
              connectionPool: {
                poolMax: 20,
                totalCount: 9,
                idleCount: 4,
                waitingCount: 0,
              },
            },
          }),
      });
      await renderSection();

      const gauge = container.querySelector(
        '[data-testid="health-card-database-pool"]',
      );
      expect(gauge).not.toBeNull();
      expect(gauge!.textContent).toContain("Pool 9 / 20");
      // No waiters → no badge.
      expect(
        container.querySelector(
          '[data-testid="health-card-database-waiting"]',
        ),
      ).toBeNull();
    });

    it("falls back to legacy alias fields when the server omits the new ones", async () => {
      // Older server build still on the pre-Task-#515 payload — the
      // tile must still render reasonable numbers from the alias
      // fields, mirroring how `DatabaseHealthTab` normalises the
      // same payload.
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "ok",
              connectionPool: {
                totalConnections: 5,
                idleConnections: 2,
                maxConnections: 20,
                waitingCount: 0,
              },
            },
          }),
      });
      await renderSection();

      const gauge = container.querySelector(
        '[data-testid="health-card-database-pool"]',
      );
      expect(gauge).not.toBeNull();
      expect(gauge!.textContent).toContain("Pool 5 / 20");
    });

    it("renders the 'N waiting' badge whenever waitingCount > 0", async () => {
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "warning",
              connectionPool: {
                poolMax: 10,
                totalCount: 10,
                idleCount: 0,
                waitingCount: 3,
              },
            },
            overviewCounts: { healthy: 7, warning: 1, error: 0 },
          }),
      });
      await renderSection();

      const gauge = container.querySelector(
        '[data-testid="health-card-database-pool"]',
      );
      expect(gauge).not.toBeNull();
      expect(gauge!.textContent).toContain("Pool 10 / 10");

      const badge = container.querySelector(
        '[data-testid="health-card-database-waiting"]',
      );
      expect(badge).not.toBeNull();
      expect(badge!.textContent).toContain("3 waiting");
    });

    it("omits the gauge entirely when the server payload has no connectionPool block", async () => {
      // Forward-compat with older server payloads — without the
      // block the tile must look exactly as it did before Task #515.
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();
      expect(
        container.querySelector(
          '[data-testid="health-card-database-pool"]',
        ),
      ).toBeNull();
    });

    it("does NOT downgrade the Database tile on the first poll showing waiters", async () => {
      // A single transient spike during a load burst shouldn't redden
      // the tile — the deep Database Health tab applies the same
      // sustained-waiters debounce before showing its raise-hint, so
      // we mirror that here. The server-reported `database.status`
      // (`ok`) wins on the very first observation.
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "ok",
              connectionPool: {
                poolMax: 10,
                totalCount: 10,
                idleCount: 0,
                waitingCount: 2,
              },
            },
          }),
      });
      await renderSection();

      const tile = container.querySelector(
        '[data-testid="health-card-database"]',
      );
      expect(tile).not.toBeNull();
      // First poll only — tile keeps the server's `ok` colour.
      expect(tile!.className).toContain("border-green-200");
    });

    it("downgrades the Database tile to warning after sustained waiters across multiple polls", async () => {
      // Two consecutive non-zero waiter polls flip the tile from
      // green to amber — the same `SUSTAINED_WAITING_OBSERVATIONS`
      // debounce the deep Database Health tab uses. Without this
      // mirror, an operator on the overview would have to click
      // into the Database tab to see the saturation state the deep
      // tab is already shouting about.
      installFetchRouter({
        health: () =>
          makeOverview({
            database: {
              status: "ok",
              connectionPool: {
                poolMax: 10,
                totalCount: 10,
                idleCount: 0,
                waitingCount: 4,
              },
            },
          }),
      });
      const client = await renderSection();

      // Force a second poll observing waiters again.
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["system-health-overview"],
        });
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      const tile = container.querySelector(
        '[data-testid="health-card-database"]',
      );
      expect(tile).not.toBeNull();
      expect(tile!.className).toContain("border-yellow-200");
      // Headline counts must match the visible tile colours
      // (Task #354) — so the override must roll forward into the
      // Healthy / Warnings rollup as well, not just the tile border.
      const warningCount = container.querySelector(
        ".text-yellow-600.text-2xl",
      );
      expect(warningCount).not.toBeNull();
      expect(warningCount!.textContent?.trim()).toBe("1");
    });

    it("clears the warning override as soon as the pool drains", async () => {
      // Once the pool empties, the next poll resets the sustained
      // tally and the tile flips back to green immediately. Without
      // this the override would be sticky and an operator would see
      // a stale amber tile long after the incident resolved.
      let waiting = 4;
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/system/health")) {
          const body = makeOverview({
            database: {
              status: "ok",
              connectionPool: {
                poolMax: 10,
                totalCount: waiting > 0 ? 10 : 4,
                idleCount: waiting > 0 ? 0 : 6,
                waitingCount: waiting,
              },
            },
          });
          return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
            headers: new Headers({ "content-type": "application/json" }),
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => "",
          headers: new Headers(),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const client = await renderSection();
      // Two non-zero polls so the override fires.
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["system-health-overview"],
        });
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      let tile = container.querySelector(
        '[data-testid="health-card-database"]',
      );
      expect(tile!.className).toContain("border-yellow-200");

      // Pool drains — next poll should clear the override.
      waiting = 0;
      await act(async () => {
        await client.invalidateQueries({
          queryKey: ["system-health-overview"],
        });
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      tile = container.querySelector('[data-testid="health-card-database"]');
      expect(tile!.className).toContain("border-green-200");
      expect(
        container.querySelector(
          '[data-testid="health-card-database-waiting"]',
        ),
      ).toBeNull();
    });
  });

  // Coverage for Task #418 — the live "updated Xs ago" indicator,
  // in-flight spinner, and manual "Refresh now" button that operators
  // rely on during an incident to know whether the dashboard is live,
  // frozen, or about to refresh. The behaviour is layered on top of
  // the existing 60s polling (Task #411) without changing it, so the
  // tests below pin only the new affordances and assume the polling
  // contract is exercised by the suite above.
  describe("Live freshness indicator and manual refresh (Task #418)", () => {
    it("renders an 'updated Xs ago' label seeded with the time since the data landed", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const label = container.querySelector(
        '[data-testid="system-health-updated-ago"]',
      );
      expect(label).not.toBeNull();
      // Immediately after mount the label should read 0 or 1 second.
      // Using a regex keeps the assertion stable across the few
      // milliseconds spent in `renderSection`'s polling loop.
      expect(label!.textContent).toMatch(/^updated [0-9]+s ago$/);
    });

    it("ticks the relative label forward as wall-clock time advances", async () => {
      installFetchRouter({ health: () => makeOverview() });

      // Use fake timers so the 1Hz interval inside the component is
      // deterministic. `shouldAdvanceTime: true` lets the existing
      // `renderSection` helper's `setTimeout` polling loop still
      // resolve while we control the component's tick clock.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();

        const label = container.querySelector(
          '[data-testid="system-health-updated-ago"]',
        );
        expect(label).not.toBeNull();

        // Advance 5 seconds and let the interval's setState commit.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000);
        });

        // The label must have ticked forward — the exact value
        // depends on how many ms elapsed in `renderSection` before
        // the timer started, so assert "at least 4s" rather than an
        // exact number to stay robust on slower CI without masking
        // a regression where the ticker stops firing.
        const match = label!.textContent?.match(/^updated (\d+)s ago$/);
        expect(match, `label text was ${label!.textContent}`).not.toBeNull();
        expect(Number(match![1])).toBeGreaterThanOrEqual(4);
      } finally {
        vi.useRealTimers();
      }
    });

    // Direct unit tests for the formatter so the seconds / minutes /
    // hours boundary logic is pinned without having to wrestle the
    // 60-second polling refetch into a deterministic shape — the
    // refetch resets `dataUpdatedAt` on success and React's interval
    // re-renders happen on a different timer than TanStack Query's
    // poll, so a wall-clock-driven assertion in the rendered DOM is
    // both flaky and slow. The pure helper is the part operators
    // actually see, so testing it directly catches the same regressions.
    describe("formatRelativeUpdatedAt boundaries", () => {
      it("returns seconds for diffs under 60 seconds", () => {
        expect(formatRelativeUpdatedAt(1_000_000, 1_000_000)).toBe("updated 0s ago");
        expect(formatRelativeUpdatedAt(1_000_000, 1_005_000)).toBe("updated 5s ago");
        expect(formatRelativeUpdatedAt(1_000_000, 1_059_999)).toBe("updated 59s ago");
      });

      it("flips to minutes at the 60-second boundary", () => {
        expect(formatRelativeUpdatedAt(1_000_000, 1_060_000)).toBe("updated 1m ago");
        expect(formatRelativeUpdatedAt(1_000_000, 1_120_000)).toBe("updated 2m ago");
        expect(formatRelativeUpdatedAt(0, 59 * 60 * 1000)).toBe("updated 59m ago");
      });

      it("flips to hours at the 60-minute boundary", () => {
        expect(formatRelativeUpdatedAt(0, 60 * 60 * 1000)).toBe("updated 1h ago");
        expect(formatRelativeUpdatedAt(0, 3 * 60 * 60 * 1000)).toBe("updated 3h ago");
      });

      it("clamps negative diffs (clock skew) to 0s instead of rendering '-Ns ago'", () => {
        // If the server's clock runs ahead of the client a freshly
        // landed response could record `dataUpdatedAt` slightly in
        // the future. Clamping to 0 keeps the label sensible instead
        // of leaking the skew into the operator's view.
        expect(formatRelativeUpdatedAt(2_000_000, 1_000_000)).toBe("updated 0s ago");
      });
    });

    // Direct unit tests for the countdown formatter (Task #424). The
    // helper drives the "next refresh in Xs" indicator that sits next
    // to the "updated Xs ago" label, so the same boundary-pinning
    // approach used for the relative formatter applies — testing the
    // pure helper catches the regressions operators actually see
    // (counter going negative, ticking the wrong direction, drifting
    // out of sync with the polling cadence) without having to wrestle
    // TanStack Query's internal poll timer into a deterministic shape.
    describe("formatNextRefreshIn boundaries", () => {
      it("returns the full interval immediately after fresh data lands", () => {
        // When `currentMs === updatedAtMs` the next poll is still a
        // full interval away, so the label should read the cadence
        // (60s for the System Health overview) instead of starting
        // at 59s and skipping the round-number reset operators expect.
        expect(formatNextRefreshIn(1_000_000, 1_000_000, 60_000)).toBe(
          "next refresh in 60s",
        );
      });

      it("ticks down toward zero as the interval elapses", () => {
        // Mid-interval values exercise the ceiling: 27.5s remaining
        // should read "28s" so the label spends a full second on each
        // displayed value rather than flicker between two adjacent
        // numbers within the same wall-clock second.
        expect(formatNextRefreshIn(1_000_000, 1_032_500, 60_000)).toBe(
          "next refresh in 28s",
        );
        expect(formatNextRefreshIn(1_000_000, 1_059_000, 60_000)).toBe(
          "next refresh in 1s",
        );
      });

      it("clamps to 0s once the interval has elapsed but the response hasn't landed yet", () => {
        // A stalled poll (network slow, server hung) leaves the
        // operator on the page with `dataUpdatedAt` older than one
        // interval. The countdown must stop at "0s" rather than
        // tick into negative territory and look broken — they can
        // tell the dashboard is overdue, not that the indicator
        // itself is glitching.
        expect(formatNextRefreshIn(1_000_000, 1_060_000, 60_000)).toBe(
          "next refresh in 0s",
        );
        expect(formatNextRefreshIn(1_000_000, 1_120_000, 60_000)).toBe(
          "next refresh in 0s",
        );
      });

      it("clamps negative diffs (clock skew) to 0s instead of producing impossibly large values", () => {
        // If the client clock jumps backward (NTP correction, sleep)
        // `currentMs` could drop below `updatedAtMs`, making the
        // remaining time exceed the interval. Clamping the negative
        // case keeps the label inside the [0, interval] range rather
        // than briefly showing "next refresh in 999s".
        const updatedAt = 2_000_000;
        const now = 1_000_000;
        // The raw arithmetic would yield > interval; the helper
        // shouldn't expose that to operators.
        const text = formatNextRefreshIn(updatedAt, now, 60_000);
        const match = text.match(/^next refresh in (\d+)s$/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBeLessThanOrEqual(60);
      });
    });

    it("renders a 'next refresh in Xs' countdown beside the 'updated Xs ago' label", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const countdown = container.querySelector(
        '[data-testid="system-health-next-refresh"]',
      );
      expect(countdown).not.toBeNull();
      // Immediately after a fresh fetch the label should read close
      // to the full 60-second interval. We allow a small window to
      // absorb the few ms `renderSection` spends polling for the
      // category grid before the assertion runs.
      const match = countdown!.textContent?.match(
        /^next refresh in (\d+)s$/,
      );
      expect(match, `countdown text was ${countdown!.textContent}`).not.toBeNull();
      const seconds = Number(match![1]);
      expect(seconds).toBeGreaterThanOrEqual(58);
      expect(seconds).toBeLessThanOrEqual(60);
    });

    it("ticks the countdown downward as wall-clock time advances", async () => {
      installFetchRouter({ health: () => makeOverview() });

      // Fake timers so the 1Hz ticker is deterministic; the mount
      // fetch and category-grid polling loop still resolve thanks
      // to `shouldAdvanceTime: true`.
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();

        const countdown = container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        );
        expect(countdown).not.toBeNull();

        const initialMatch = countdown!.textContent?.match(
          /^next refresh in (\d+)s$/,
        );
        expect(initialMatch).not.toBeNull();
        const initial = Number(initialMatch![1]);

        // Advance 5 seconds of wall-clock time and let the ticker's
        // setState commit. The countdown must have ticked down by
        // roughly the same amount — assert "at least 4s lower" to
        // stay robust on slower CI without masking a regression
        // where the ticker stops firing or counts the wrong way.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(5_000);
        });

        const tickedMatch = countdown!.textContent?.match(
          /^next refresh in (\d+)s$/,
        );
        expect(
          tickedMatch,
          `countdown text was ${countdown!.textContent}`,
        ).not.toBeNull();
        const ticked = Number(tickedMatch![1]);
        expect(ticked).toBeLessThanOrEqual(initial - 4);
      } finally {
        vi.useRealTimers();
      }
    });

    it("hides the countdown while a refetch is in flight so it doesn't fight the spinner for screen real estate", async () => {
      // Hold the second fetch open with a deferred so we can observe
      // the in-flight state — same pattern as the Task #418 spinner
      // test above. The countdown should disappear the moment
      // `isFetching` flips to true and reappear once the response
      // resolves, mirroring the spinner's lifecycle inversely.
      let firstCall = true;
      let resolveSecond: (value: HealthOverviewPayload) => void = () => {};
      const secondFetch = new Promise<HealthOverviewPayload>((resolve) => {
        resolveSecond = resolve;
      });

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/system/health")) {
          if (firstCall) {
            firstCall = false;
            const body = makeOverview();
            return {
              ok: true,
              status: 200,
              json: async () => body,
              text: async () => JSON.stringify(body),
              headers: new Headers({ "content-type": "application/json" }),
            } as unknown as Response;
          }
          const body = await secondFetch;
          return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
            headers: new Headers({ "content-type": "application/json" }),
          } as unknown as Response;
        }
        if (url.includes("/api/system/env-status")) {
          const body = {
            databaseUrlSource: "env",
            sessionSecretSource: "env",
            encryptionKeySource: "env",
            publicAppUrl: "https://app.example.com",
            publicAppUrlSource: "env",
          };
          return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
            headers: new Headers({ "content-type": "application/json" }),
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => "",
          headers: new Headers(),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      await renderSection();

      // Baseline: countdown is rendered when no refetch is running.
      expect(
        container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        ),
      ).not.toBeNull();

      // Click the manual refresh button to start the held second
      // fetch — same trigger the operator uses, so the assertion
      // doubles as coverage for the spinner ↔ countdown swap.
      const button = container.querySelector(
        '[data-testid="system-health-refresh-now"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      act(() => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      // Mid-flight: countdown is gone, spinner is up.
      expect(
        container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        ),
      ).toBeNull();
      expect(
        container.querySelector(
          '[data-testid="system-health-refreshing-spinner"]',
        ),
      ).not.toBeNull();

      // Resolve the held fetch and let the success path commit.
      await act(async () => {
        resolveSecond(makeOverview());
        await new Promise((r) => setTimeout(r, 0));
      });
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      // After settle: countdown is back and seeded near the full
      // interval — proves the post-refetch reset works end-to-end,
      // not just in the helper's unit tests.
      const countdown = container.querySelector(
        '[data-testid="system-health-next-refresh"]',
      );
      expect(countdown).not.toBeNull();
      const resetMatch = countdown!.textContent?.match(
        /^next refresh in (\d+)s$/,
      );
      expect(resetMatch).not.toBeNull();
      expect(Number(resetMatch![1])).toBeGreaterThanOrEqual(58);
    });

    it("renders the 'Refresh now' button and triggers a refetch when clicked", async () => {
      let healthHits = 0;
      installFetchRouter({
        health: () => {
          healthHits += 1;
          return makeOverview();
        },
      });
      await renderSection();

      // Initial mount fetch must have landed before we click — gives
      // us a stable baseline to assert the click adds another hit.
      expect(healthHits).toBe(1);

      const button = container.querySelector(
        '[data-testid="system-health-refresh-now"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.textContent).toContain("Refresh now");

      act(() => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Allow the refetch chain (fetch → onSuccess → setState) to
      // flush so the hit count is observable.
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      expect(healthHits).toBeGreaterThanOrEqual(2);
    });

    it("shows the in-flight spinner while a refetch is running and hides it again afterwards", async () => {
      // Hold the second fetch open with a deferred so we can observe
      // the spinner mid-flight; the first mount fetch resolves
      // immediately so `renderSection` can settle.
      let firstCall = true;
      let resolveSecond: (value: HealthOverviewPayload) => void = () => {};
      const secondFetch = new Promise<HealthOverviewPayload>((resolve) => {
        resolveSecond = resolve;
      });

      globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        if (url.includes("/api/system/health")) {
          if (firstCall) {
            firstCall = false;
            const body = makeOverview();
            return {
              ok: true,
              status: 200,
              json: async () => body,
              text: async () => JSON.stringify(body),
              headers: new Headers({ "content-type": "application/json" }),
            } as unknown as Response;
          }
          const body = await secondFetch;
          return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
            headers: new Headers({ "content-type": "application/json" }),
          } as unknown as Response;
        }
        if (url.includes("/api/system/env-status")) {
          const body = {
            databaseUrlSource: "env",
            sessionSecretSource: "env",
            encryptionKeySource: "env",
            publicAppUrl: "https://app.example.com",
            publicAppUrlSource: "env",
          };
          return {
            ok: true,
            status: 200,
            json: async () => body,
            text: async () => JSON.stringify(body),
            headers: new Headers({ "content-type": "application/json" }),
          } as unknown as Response;
        }
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          text: async () => "",
          headers: new Headers(),
        } as unknown as Response;
      }) as unknown as typeof fetch;

      await renderSection();

      // Spinner is hidden when no refetch is in flight — the mount
      // fetch settled inside `renderSection` so the indicator must
      // have torn down by the time we look.
      expect(
        container.querySelector(
          '[data-testid="system-health-refreshing-spinner"]',
        ),
      ).toBeNull();

      // Click the manual refresh button to start a new fetch that
      // we control via `resolveSecond`. The spinner should mount
      // before the response lands.
      const button = container.querySelector(
        '[data-testid="system-health-refresh-now"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      act(() => {
        button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      // Yield so React commits the `isFetching: true` re-render before
      // we assert. A single microtask is enough — React's setState
      // chain is synchronous up to the next paint.
      for (let i = 0; i < 5; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      const spinner = container.querySelector(
        '[data-testid="system-health-refreshing-spinner"]',
      );
      expect(spinner).not.toBeNull();
      // Button must also disable while the request is pending so the
      // operator can't queue a flood of duplicate fetches.
      expect((button as HTMLButtonElement).disabled).toBe(true);

      // Resolve the held fetch and let the success path commit.
      await act(async () => {
        resolveSecond(makeOverview());
        await new Promise((r) => setTimeout(r, 0));
      });
      for (let i = 0; i < 10; i += 1) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 5));
        });
      }

      // Spinner unmounts and the button re-enables — the tear-down
      // is what tells the operator the refresh has finished.
      expect(
        container.querySelector(
          '[data-testid="system-health-refreshing-spinner"]',
        ),
      ).toBeNull();
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
  });

  // Coverage for Task #437 — the operator-controlled refresh-cadence
  // selector. The previous tasks established the polling contract
  // (#411) and the visible countdown (#424); this task makes the
  // cadence itself adjustable, persists the choice to `localStorage`,
  // and rewires both the `refetchInterval` and the countdown to track
  // the new value. The tests below pin each of those three contracts
  // independently so a regression to any one surface (e.g. the
  // selector wired up but the countdown still reading 60s) shows up
  // as a targeted failure rather than a generic "refresh feels off".
  describe("Refresh cadence selector (Task #437)", () => {
    it("renders the cadence selector with the documented options and seeds it to the 60s default", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const select = container.querySelector(
        '[data-testid="system-health-refresh-interval-select"]',
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();

      // The four options must all be present and labelled exactly
      // as documented — operators eyeball the labels when picking,
      // so a future relabel must update the test in lockstep with
      // the UI. Task #443 added the "Off" entry (value `0`) so an
      // operator can fully freeze the dashboard while writing up a
      // postmortem or capturing screenshots; pinning it here keeps
      // a future re-order or accidental drop from going unnoticed.
      const optionValues = Array.from(select!.options).map((o) => o.value);
      const optionLabels = Array.from(select!.options).map((o) =>
        o.textContent?.trim(),
      );
      expect(optionValues).toEqual(["30000", "60000", "300000", "0"]);
      expect(optionLabels).toEqual(["30s", "60s", "5m", "Off"]);

      // Default selection on a fresh load (no `localStorage` entry)
      // is the 60s value the constant codifies as the seed.
      expect(select!.value).toBe("60000");
    });

    it("retunes the countdown to the newly selected cadence", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      // Baseline: countdown reads near the full 60s the dashboard
      // boots into. This pins the seed before we change cadence so
      // the post-change assertion is unambiguous.
      const initialCountdown = container.querySelector(
        '[data-testid="system-health-next-refresh"]',
      );
      expect(initialCountdown).not.toBeNull();
      expect(initialCountdown!.textContent).toMatch(
        /^next refresh in (5[89]|60)s$/,
      );

      // Switch to 30s. Use a real `change` event on the native
      // `<select>` so the React `onChange` handler fires through the
      // synthetic event system the production UI relies on.
      const select = container.querySelector(
        '[data-testid="system-health-refresh-interval-select"]',
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      act(() => {
        select!.value = "30000";
        select!.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // Countdown immediately re-renders with the new cap. The label
      // should never read more than the selected interval — the
      // formatter clamps to `[0, intervalSeconds]` and we want to see
      // that change reflected, not a stale 60s lingering in the DOM.
      const countdown = container.querySelector(
        '[data-testid="system-health-next-refresh"]',
      );
      expect(countdown).not.toBeNull();
      const match = countdown!.textContent?.match(
        /^next refresh in (\d+)s$/,
      );
      expect(
        match,
        `countdown text was ${countdown!.textContent}`,
      ).not.toBeNull();
      expect(Number(match![1])).toBeLessThanOrEqual(30);
    });

    it("persists the operator's selection to localStorage so the choice sticks across reloads", async () => {
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const select = container.querySelector(
        '[data-testid="system-health-refresh-interval-select"]',
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();

      act(() => {
        select!.value = "300000";
        select!.dispatchEvent(new Event("change", { bubbles: true }));
      });

      // The component owns the storage key — assert against the
      // documented namespace so a rename has to update both surfaces
      // together. Storing the raw ms keeps the value comparable to
      // the option list without any extra parsing on read.
      expect(
        window.localStorage.getItem("system-health-refetch-interval-ms"),
      ).toBe("300000");
    });

    it("re-hydrates the selector from localStorage on the next mount", async () => {
      // Seed storage as if the operator picked 30s on a previous
      // visit, then mount fresh. The select value (and, transitively,
      // the countdown cap) should reflect the persisted choice
      // without the operator having to repick.
      window.localStorage.setItem(
        "system-health-refetch-interval-ms",
        "30000",
      );
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const select = container.querySelector(
        '[data-testid="system-health-refresh-interval-select"]',
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select!.value).toBe("30000");

      // Countdown must immediately honour the rehydrated cadence —
      // 30s ceiling, not the 60s default — so an operator who
      // reloads mid-incident keeps their faster poll without
      // anything visually flashing on the longer cadence first.
      const countdown = container.querySelector(
        '[data-testid="system-health-next-refresh"]',
      );
      expect(countdown).not.toBeNull();
      const match = countdown!.textContent?.match(
        /^next refresh in (\d+)s$/,
      );
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeLessThanOrEqual(30);
    });

    it("falls back to the 60s default when the stored value is no longer a recognised option", async () => {
      // A stale or hand-edited entry (e.g. an option we shipped
      // briefly and then removed) must not silently reactivate an
      // unsupported cadence. The whitelist check inside
      // `loadStoredRefetchInterval` should drop it on the floor.
      window.localStorage.setItem(
        "system-health-refetch-interval-ms",
        "12345",
      );
      installFetchRouter({ health: () => makeOverview() });
      await renderSection();

      const select = container.querySelector(
        '[data-testid="system-health-refresh-interval-select"]',
      ) as HTMLSelectElement | null;
      expect(select).not.toBeNull();
      expect(select!.value).toBe("60000");
    });

    it("polls /api/system/health on the freshly selected cadence", async () => {
      // The user-visible part of this task is the countdown, but the
      // whole point is to make the actual poll fire faster (or
      // slower) — so we observe the next `/api/system/health` hit
      // and confirm it lands within the selected interval rather
      // than the previous one. Use fake timers so we can step the
      // clock forward deterministically without waiting through
      // real wall time.
      let healthHits = 0;
      installFetchRouter({
        health: () => {
          healthHits += 1;
          return makeOverview();
        },
      });

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();
        // Mount fetch baseline — every later assertion compares
        // against this so a flaky in-flight extra hit doesn't trip
        // the test.
        const baselineHits = healthHits;

        // Switch to 30s.
        const select = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        act(() => {
          select!.value = "30000";
          select!.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Step the clock past the new 30s interval and let the
        // refetch chain resolve. We advance a touch over to absorb
        // any sub-millisecond drift between TanStack Query's timer
        // and our `vi.advanceTimersByTimeAsync` granularity.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(31_000);
        });

        // At least one additional hit must have fired by now —
        // the old 60s cadence wouldn't have ticked yet.
        expect(healthHits).toBeGreaterThan(baselineHits);
      } finally {
        vi.useRealTimers();
      }
    });

    // Coverage for the "Off" cadence (Task #443). The previous tests
    // pin the three numeric options; these pin the pause behaviour so a
    // regression to any one surface (selector wired but polling still
    // running, polling stopped but countdown still ticking, paused
    // state not surviving a reload) shows up as a targeted failure
    // rather than a generic "pause feels off". The manual-refresh
    // assertion is the load-bearing one — the task explicitly calls
    // out that "Refresh now" must keep working while the operator is
    // paused, since otherwise an operator who freezes the dashboard
    // for a screenshot has no way to pull a fresh reading without
    // first un-freezing it.
    describe("'Off' cadence (Task #443)", () => {
      it("swaps the countdown for a 'paused' label when the operator picks Off", async () => {
        installFetchRouter({ health: () => makeOverview() });
        await renderSection();

        // Baseline: default 60s cadence, countdown reads as a normal
        // "next refresh in Xs" label — not the paused indicator.
        const initialCountdown = container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        );
        expect(initialCountdown).not.toBeNull();
        expect(initialCountdown!.textContent).toMatch(
          /^next refresh in \d+s$/,
        );

        const select = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        act(() => {
          select!.value = "0";
          select!.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // After flipping to Off the same slot must surface the
        // paused state — keeping the testid stable means operators
        // (and assistive tech via `aria-live`) always see one
        // freshness indicator rather than the slot disappearing.
        const paused = container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        );
        expect(paused).not.toBeNull();
        expect(paused!.textContent).toMatch(/paused/i);
        // And it must not still be ticking the countdown — the
        // numeric label and the paused label are mutually
        // exclusive, so a regression that left both visible (or
        // left the countdown running) trips this assertion.
        expect(paused!.textContent).not.toMatch(/next refresh in \d+s/);
      });

      it("stops polling /api/system/health while paused", async () => {
        // The whole point of pausing is to freeze the data, so the
        // network must go quiet — even past what would have been
        // several default ticks. Anything otherwise means TanStack
        // Query is still firing on the old cadence and the operator's
        // screenshot/postmortem comparison just changed under them.
        let healthHits = 0;
        installFetchRouter({
          health: () => {
            healthHits += 1;
            return makeOverview();
          },
        });

        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
          await renderSection();
          const select = container.querySelector(
            '[data-testid="system-health-refresh-interval-select"]',
          ) as HTMLSelectElement | null;
          expect(select).not.toBeNull();
          act(() => {
            select!.value = "0";
            select!.dispatchEvent(new Event("change", { bubbles: true }));
          });

          // Snapshot AFTER switching so any in-flight mount fetch
          // has settled into the count we're guarding against.
          const baselineHits = healthHits;

          // Step well past every offered cadence (5m is the
          // longest) so we'd see at least one stray hit if the
          // poll were still wired. The hit count must stay flat.
          await act(async () => {
            await vi.advanceTimersByTimeAsync(330_000);
          });

          expect(healthHits).toBe(baselineHits);
        } finally {
          vi.useRealTimers();
        }
      });

      it("still honours the manual 'Refresh now' button while paused", async () => {
        // Pausing the cadence freezes automatic polling, but the
        // task explicitly preserves the manual override — operators
        // capturing a comparison reading or finalising a postmortem
        // need the escape hatch without first having to un-pause.
        let healthHits = 0;
        installFetchRouter({
          health: () => {
            healthHits += 1;
            return makeOverview();
          },
        });

        await renderSection();
        const select = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        act(() => {
          select!.value = "0";
          select!.dispatchEvent(new Event("change", { bubbles: true }));
        });

        const baselineHits = healthHits;
        const refreshBtn = container.querySelector(
          '[data-testid="system-health-refresh-now"]',
        ) as HTMLButtonElement | null;
        expect(refreshBtn).not.toBeNull();
        await act(async () => {
          refreshBtn!.click();
        });
        // Let the refetch promise settle so the hit count is stable
        // before we assert. A microtask flush is enough — fake
        // timers are off in this test so the real fetch mock
        // resolves immediately.
        await act(async () => {
          await Promise.resolve();
          await Promise.resolve();
        });

        expect(healthHits).toBeGreaterThan(baselineHits);
      });

      it("persists the Off choice to localStorage and rehydrates it on the next mount", async () => {
        installFetchRouter({ health: () => makeOverview() });
        await renderSection();

        const select = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        act(() => {
          select!.value = "0";
          select!.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // The pause must use the same storage key as the other
        // cadence options so an operator's choice survives reloads
        // exactly like the 30s / 60s / 5m picks already do.
        expect(
          window.localStorage.getItem("system-health-refetch-interval-ms"),
        ).toBe("0");

        // Tear the component down and remount fresh — the seeded
        // storage entry should drive both the selector value and
        // the paused label without the operator having to repick.
        act(() => {
          root.unmount();
        });
        container.remove();
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        await renderSection();

        const rehydratedSelect = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(rehydratedSelect).not.toBeNull();
        expect(rehydratedSelect!.value).toBe("0");

        const paused = container.querySelector(
          '[data-testid="system-health-next-refresh"]',
        );
        expect(paused).not.toBeNull();
        expect(paused!.textContent).toMatch(/paused/i);
      });
    });

    it("does NOT poll on the old cadence after switching to a slower one", async () => {
      // Mirror image of the test above: switching from 60s to 5m
      // must SUPPRESS the would-be 60s tick rather than letting one
      // last poll slip through. This protects against a regression
      // where the setter updates state but the existing query
      // timer keeps the old interval until the next manual
      // `refetch()` call.
      let healthHits = 0;
      installFetchRouter({
        health: () => {
          healthHits += 1;
          return makeOverview();
        },
      });

      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderSection();
        const baselineHits = healthHits;

        const select = container.querySelector(
          '[data-testid="system-health-refresh-interval-select"]',
        ) as HTMLSelectElement | null;
        expect(select).not.toBeNull();
        act(() => {
          select!.value = "300000";
          select!.dispatchEvent(new Event("change", { bubbles: true }));
        });

        // Step past what would have been the 60s default tick. If
        // TanStack Query honours the new interval the hit count
        // stays put; if it doesn't, we'd see at least one extra
        // hit at the 60s mark.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(75_000);
        });

        expect(healthHits).toBe(baselineHits);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
