// @vitest-environment happy-dom
//
// Coverage for the Schema Migrations card added to the Database Health
// tab in task #391. Verifies:
//   - the admin-only visibility gate (no card for non-admin users),
//   - the happy path where every migration is applied (Up to date badge
//     + table rows + summary line),
//   - the "missing on disk" sanity-check banner when boot somehow
//     skipped a file recorded in `migrations/`,
//   - the "unknown" warning when a recorded migration file has been
//     removed from disk, and
//   - the error path when the admin endpoint refuses (e.g. role
//     downgraded mid-session — should never happen but the UI should
//     not crash).

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

let mockedUser: { id: string; email: string; role: string } | null = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockedUser,
    effectiveUser: mockedUser,
    isLoading: false,
    isAuthenticated: !!mockedUser,
  }),
}));

// Capture toast invocations triggered by the Apply Pending Migrations
// button so the new tests can assert that success/failure feedback is
// surfaced to the operator (Task #419). vi.mock is hoisted above the
// imports, so the spy must be created via vi.hoisted to be referenced
// from inside the factory.
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: toastSpy,
}));

import { DatabaseHealthTab } from "../DatabaseHealthTab";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

interface FetchHandlers {
  databaseHealth?: () => unknown;
  schemaMigrations?: () => {
    status: number;
    body: unknown;
  };
  // POST /api/admin/schema-migrations/run handler. Optional so the
  // existing tests (which never click the button) can leave it
  // undefined.
  runMigrations?: () => {
    status: number;
    body: unknown;
  };
}

function buildHealthPayload() {
  return {
    status: "ok" as const,
    lastChecked: new Date("2026-04-01T12:00:00Z").toISOString(),
    message: "ok",
    connectionPool: {
      totalConnections: 1,
      idleConnections: 1,
      waitingCount: 0,
      maxConnections: 20,
    },
    tableStats: [],
    orphanedRecords: {
      projectsWithoutCustomers: 0,
      mapPhasesWithoutProjects: 0,
      mapStepsWithoutPhases: 0,
      mapTasksWithoutSteps: 0,
      successCriteriaWithoutProjects: 0,
    },
    databaseSize: { totalBytes: 0, totalFormatted: "0 B" },
    connectionSource: "env",
  };
}

function installFetchRouter(handlers: FetchHandlers) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method =
      (init?.method ??
        (typeof input === "object" && "method" in input
          ? (input as Request).method
          : "GET")
      ).toUpperCase();

    if (url.includes("/api/system/health/database")) {
      const body = (handlers.databaseHealth ?? buildHealthPayload)();
      return jsonResponse(200, body);
    }
    if (url.includes("/api/admin/schema-migrations/run")) {
      // Default to a benign success so tests that don't care about
      // the run path don't have to register a handler. Real test
      // cases that exercise the button supply `runMigrations`.
      if (!handlers.runMigrations) {
        return jsonResponse(200, {
          ok: true,
          applied: [],
          report: { applied: [], missing: [], unknown: [] },
        });
      }
      const { status, body } = handlers.runMigrations();
      return jsonResponse(status, body);
    }
    if (url.includes("/api/admin/schema-migrations")) {
      // The mutation hits `/run` (handled above) so any GET-shape
      // request that lands here is the read endpoint regardless of
      // method.
      if (method !== "GET" && method !== "POST") {
        return jsonResponse(405, {});
      }
      if (!handlers.schemaMigrations) {
        return jsonResponse(200, { applied: [], missing: [], unknown: [] });
      }
      const { status, body } = handlers.schemaMigrations();
      return jsonResponse(status, body);
    }
    return jsonResponse(404, {});
  }) as unknown as typeof fetch;
}

// Builds a `SchemaMigrationPending`-shaped entry for tests. The
// server contract added in Task #435 surfaces a description and a
// short SQL preview alongside each pending filename so the Apply
// dialog can show the admin what each file actually does — not just
// the bare filename. Tests construct realistic-looking payloads via
// this helper so renaming the contract in one place ripples through
// every fixture without a search-and-replace.
function pending(
  filename: string,
  overrides: Partial<{
    description: string;
    previewLines: string[];
    previewTruncated: boolean;
  }> = {},
): {
  filename: string;
  description: string;
  previewLines: string[];
  previewTruncated: boolean;
} {
  return {
    filename,
    description: overrides.description ?? `Pending: ${filename}`,
    previewLines: overrides.previewLines ?? ["-- placeholder", "SELECT 1;"],
    previewTruncated: overrides.previewTruncated ?? false,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  mockedUser = { id: "admin-1", email: "admin@example.com", role: "Admin" };
  toastSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <DatabaseHealthTab />
      </QueryClientProvider>,
    );
  });
  // Two queries fan out (database health + schema migrations); flush
  // both microtask queues so the eventual render lands before assertions.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("DatabaseHealthTab schema migrations card", () => {
  it("does not render the card for non-admin users", async () => {
    mockedUser = { id: "u1", email: "user@example.com", role: "User" };
    installFetchRouter({});

    await renderTab();

    expect(
      container.querySelector('[data-testid="card-schema-migrations"]'),
    ).toBeNull();
    // The admin-only fetch must not have been issued — the `enabled`
    // gate is what protects non-Admin users from a noisy 403.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const calledUrls = fetchCalls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes("/api/admin/schema-migrations"))).toBe(false);
  });

  it("renders applied migrations with the up-to-date badge when nothing is pending", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 200,
        body: {
          applied: [
            {
              filename: "001_migrate_end_date_flags_colors.sql",
              checksum: "c1",
              appliedAt: "2025-01-02T03:04:05.000Z",
              description: "Migrate end date flags colors",
            },
            {
              filename: "002_create_validation_criteria_templates.sql",
              checksum: "c2",
              appliedAt: "2025-02-03T04:05:06.000Z",
              description: "Create validation criteria templates",
            },
          ],
          missing: [],
          unknown: [],
        },
      }),
    });

    await renderTab();

    expect(
      container.querySelector('[data-testid="card-schema-migrations"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="badge-schema-migrations-up-to-date"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="badge-schema-migrations-attention"]'),
    ).toBeNull();
    // Both migrations should appear in the table.
    expect(
      container.querySelector(
        '[data-testid="row-schema-migration-001_migrate_end_date_flags_colors.sql"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="row-schema-migration-002_create_validation_criteria_templates.sql"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="schema-migrations-summary"]')?.textContent,
    ).toMatch(/2 migrations applied/);
  });

  it("surfaces the missing-on-disk warning when the runner skipped a file", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 200,
        body: {
          applied: [
            {
              filename: "001_first.sql",
              checksum: "c1",
              appliedAt: "2025-01-02T03:04:05.000Z",
              description: "First",
            },
          ],
          missing: [pending("030_pending_upgrade.sql", { description: "Pending upgrade" })],
          unknown: [],
        },
      }),
    });

    await renderTab();

    const banner = container.querySelector('[data-testid="schema-migrations-missing"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("030_pending_upgrade.sql");
    // Description must accompany the filename so the warning is
    // informative rather than just a list of opaque file names.
    expect(banner!.textContent).toContain("Pending upgrade");
    expect(
      container.querySelector('[data-testid="badge-schema-migrations-attention"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="schema-migrations-summary"]')?.textContent,
    ).toMatch(/1 pending on disk/);
  });

  it("surfaces the unknown-on-disk warning when a recorded file has been removed", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 200,
        body: {
          applied: [
            {
              filename: "001_first.sql",
              checksum: "c1",
              appliedAt: "2025-01-02T03:04:05.000Z",
              description: "First",
            },
            {
              filename: "999_ghost.sql",
              checksum: "c9",
              appliedAt: "2025-01-02T03:04:05.000Z",
              description: "Ghost",
            },
          ],
          missing: [],
          unknown: ["999_ghost.sql"],
        },
      }),
    });

    await renderTab();

    const banner = container.querySelector('[data-testid="schema-migrations-unknown"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("999_ghost.sql");
    expect(
      container.querySelector('[data-testid="badge-schema-migrations-attention"]'),
    ).not.toBeNull();
  });

  it("renders an error message when the admin endpoint refuses without crashing the tab", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 403,
        body: { error: "Admin role required", errorCode: "forbidden" },
      }),
    });

    await renderTab();

    const card = container.querySelector('[data-testid="card-schema-migrations"]');
    expect(card).not.toBeNull();
    const errBanner = container.querySelector('[data-testid="schema-migrations-error"]');
    expect(errBanner).not.toBeNull();
    expect(errBanner!.textContent).toMatch(/403/);
    // The rest of the Database tab keeps rendering — the connection
    // pool tile must still be present.
    expect(container.textContent).toContain("Connection Pool");
  });

  // Coverage for Task #412 — the Schema Migrations card has to expose
  // a stable anchor (`#schema-migrations` + matching id) so the
  // Database tile in the System Health overview can deep-link into
  // it. We assert both the anchor markup and that a `hashchange`
  // event triggers `scrollIntoView` on the card so an admin who
  // arrives via the deep-link lands on the right panel even when
  // the tab content is taller than the viewport.
  it("exposes a #schema-migrations anchor and scrolls on hashchange", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 200,
        body: {
          applied: [
            {
              filename: "001_first.sql",
              checksum: "c1",
              appliedAt: "2025-01-02T03:04:05.000Z",
              description: "First",
            },
          ],
          missing: [],
          unknown: [],
        },
      }),
    });

    await renderTab();

    const card = container.querySelector(
      '[data-testid="card-schema-migrations"]',
    ) as HTMLElement | null;
    expect(card).not.toBeNull();
    // The id must match the hash the System Health tile pushes —
    // change one without the other and the deep-link silently breaks.
    expect(card!.id).toBe("schema-migrations");

    const scrollSpy = vi.fn();
    card!.scrollIntoView = scrollSpy as unknown as Element["scrollIntoView"];

    // Simulate the deep-link arrival: the System Health tile pushes
    // the hash and dispatches `hashchange`, which is what triggers
    // the scroll-to behaviour.
    window.location.hash = "#schema-migrations";
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    // `requestAnimationFrame` defers the scroll one tick so the
    // Database tab has a chance to mount the card after the URL
    // change — flush microtasks twice to give it room to fire.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    expect(scrollSpy).toHaveBeenCalled();

    // Reset the hash so it doesn't bleed into other tests in the file.
    window.location.hash = "";
  });

  it("shows the empty-state copy when no migrations have ever been recorded", async () => {
    installFetchRouter({
      schemaMigrations: () => ({
        status: 200,
        body: { applied: [], missing: [], unknown: [] },
      }),
    });

    await renderTab();

    expect(
      container.querySelector('[data-testid="schema-migrations-empty"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="badge-schema-migrations-up-to-date"]'),
    ).not.toBeNull();
  });

  // -- Task #419: Apply Pending Migrations button --
  // The card now ships an "Apply pending migrations" affordance that
  // calls POST /api/admin/schema-migrations/run. The cases below pin
  // the disabled/enabled gating, the success path (cache update +
  // toast), and the failure path (error banner + cache update for
  // partially-applied state).
  describe("apply pending migrations button", () => {
    it("disables the apply button when no migrations are pending", async () => {
      installFetchRouter({
        schemaMigrations: () => ({
          status: 200,
          body: {
            applied: [
              {
                filename: "001_first.sql",
                checksum: "c1",
                appliedAt: "2025-01-02T03:04:05.000Z",
                description: "First",
              },
            ],
            missing: [],
            unknown: [],
          },
        }),
      });

      await renderTab();

      const button = container.querySelector(
        '[data-testid="button-apply-pending-migrations"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.disabled).toBe(true);
    });

    it("enables the apply button when at least one migration is pending", async () => {
      installFetchRouter({
        schemaMigrations: () => ({
          status: 200,
          body: {
            applied: [],
            missing: [pending("030_pending_upgrade.sql")],
            unknown: [],
          },
        }),
      });

      await renderTab();

      const button = container.querySelector(
        '[data-testid="button-apply-pending-migrations"]',
      ) as HTMLButtonElement | null;
      expect(button).not.toBeNull();
      expect(button!.disabled).toBe(false);
      // Label should reflect how many are pending so the operator
      // doesn't have to scan the banner before clicking.
      expect(button!.textContent).toMatch(/Apply 1 pending/);
    });

    // Helper for the Task #427 confirmation dialog: clicking the
    // header "Apply" button now opens an alert dialog that lists the
    // pending filenames, and the operator must hit "Apply now" inside
    // it to actually fire the POST. Tests that exercise the run path
    // share this two-step click so the original assertions still hold.
    async function openAndConfirmApplyDialog() {
      const button = container.querySelector(
        '[data-testid="button-apply-pending-migrations"]',
      ) as HTMLButtonElement;
      await act(async () => {
        button.click();
      });
      // The Radix AlertDialog mounts into a portal under
      // document.body, not under our test container.
      const confirm = document.body.querySelector(
        '[data-testid="button-confirm-apply-migrations"]',
      ) as HTMLButtonElement | null;
      expect(confirm).not.toBeNull();
      await act(async () => {
        confirm!.click();
      });
    }

    it("opens a confirmation dialog listing every pending filename", async () => {
      installFetchRouter({
        schemaMigrations: () => ({
          status: 200,
          body: {
            applied: [],
            missing: [
              pending("030_pending_upgrade.sql", {
                description: "Add account_ids column to links table",
                previewLines: [
                  "-- Add account_ids column to links table",
                  "ALTER TABLE links ADD COLUMN IF NOT EXISTS account_ids integer[];",
                ],
              }),
              pending("031_followup_upgrade.sql", {
                description: "Followup upgrade",
              }),
            ],
            unknown: [],
          },
        }),
      });

      await renderTab();

      // Pre-click: dialog should not be in the DOM yet.
      expect(
        document.body.querySelector(
          '[data-testid="dialog-confirm-apply-migrations"]',
        ),
      ).toBeNull();
      // The mutation must NOT have fired just because we rendered.
      const fetchMockEarly = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(
        fetchMockEarly.some((c) =>
          String(c[0]).includes("/api/admin/schema-migrations/run"),
        ),
      ).toBe(false);

      const button = container.querySelector(
        '[data-testid="button-apply-pending-migrations"]',
      ) as HTMLButtonElement;
      await act(async () => {
        button.click();
      });

      const dialog = document.body.querySelector(
        '[data-testid="dialog-confirm-apply-migrations"]',
      );
      expect(dialog).not.toBeNull();
      // Both pending filenames should be listed inside the dialog.
      expect(
        document.body.querySelector(
          '[data-testid="dialog-pending-migration-030_pending_upgrade.sql"]',
        ),
      ).not.toBeNull();
      expect(
        document.body.querySelector(
          '[data-testid="dialog-pending-migration-031_followup_upgrade.sql"]',
        ),
      ).not.toBeNull();
      // Task #435: each row must show the human description so the
      // confirmation isn't just "yes, that's the file I expected" but
      // "yes, I'm okay with these schema changes".
      expect(
        document.body.querySelector(
          '[data-testid="dialog-pending-migration-description-030_pending_upgrade.sql"]',
        )?.textContent,
      ).toBe("Add account_ids column to links table");
      expect(
        document.body.querySelector(
          '[data-testid="dialog-pending-migration-description-031_followup_upgrade.sql"]',
        )?.textContent,
      ).toBe("Followup upgrade");
      // The SQL preview is collapsed by default — the toggle must
      // exist for files that have a preview, but the <pre> body
      // must NOT be in the DOM until the operator clicks it.
      const toggle = document.body.querySelector(
        '[data-testid="dialog-pending-migration-toggle-030_pending_upgrade.sql"]',
      ) as HTMLButtonElement | null;
      expect(toggle).not.toBeNull();
      expect(
        document.body.querySelector(
          '[data-testid="dialog-pending-migration-preview-030_pending_upgrade.sql"]',
        ),
      ).toBeNull();
      // Click to expand and verify the SQL preview lines render.
      await act(async () => {
        toggle!.click();
      });
      const previewBlock = document.body.querySelector(
        '[data-testid="dialog-pending-migration-preview-030_pending_upgrade.sql"]',
      );
      expect(previewBlock).not.toBeNull();
      expect(previewBlock!.textContent).toContain(
        "ALTER TABLE links ADD COLUMN IF NOT EXISTS account_ids integer[];",
      );
      // Critically: opening the dialog must not have fired the POST.
      const fetchMock = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(
        fetchMock.some((c) =>
          String(c[0]).includes("/api/admin/schema-migrations/run"),
        ),
      ).toBe(false);

      // Cancel closes the dialog without side effects.
      const cancel = document.body.querySelector(
        '[data-testid="button-cancel-apply-migrations"]',
      ) as HTMLButtonElement;
      expect(cancel).not.toBeNull();
      await act(async () => {
        cancel.click();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(
        document.body.querySelector(
          '[data-testid="dialog-confirm-apply-migrations"]',
        ),
      ).toBeNull();
      // Still no POST after cancelling.
      const fetchMockAfterCancel = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(
        fetchMockAfterCancel.some((c) =>
          String(c[0]).includes("/api/admin/schema-migrations/run"),
        ),
      ).toBe(false);
      // No toast either — Cancel must be a true no-op.
      expect(toastSpy).not.toHaveBeenCalled();
    });

    it("applies pending migrations and refreshes the report on success", async () => {
      let getCallCount = 0;
      installFetchRouter({
        schemaMigrations: () => {
          getCallCount += 1;
          // First fetch shows a pending file; subsequent fetches
          // (after invalidation) reflect that it has been applied.
          if (getCallCount === 1) {
            return {
              status: 200,
              body: {
                applied: [],
                missing: [pending("030_pending_upgrade.sql", { description: "Pending upgrade" })],
                unknown: [],
              },
            };
          }
          return {
            status: 200,
            body: {
              applied: [
                {
                  filename: "030_pending_upgrade.sql",
                  checksum: "c1",
                  appliedAt: "2026-04-26T01:02:03.000Z",
                  description: "Pending upgrade",
                },
              ],
              missing: [],
              unknown: [],
            },
          };
        },
        runMigrations: () => ({
          status: 200,
          body: {
            ok: true,
            applied: ["030_pending_upgrade.sql"],
            report: {
              applied: [
                {
                  filename: "030_pending_upgrade.sql",
                  checksum: "c1",
                  appliedAt: "2026-04-26T01:02:03.000Z",
                  description: "Pending upgrade",
                },
              ],
              missing: [],
              unknown: [],
            },
          },
        }),
      });

      await renderTab();

      // Sanity check: the missing banner should be present pre-click.
      expect(
        container.querySelector('[data-testid="schema-migrations-missing"]'),
      ).not.toBeNull();

      await openAndConfirmApplyDialog();
      // Allow the mutation + cache update to flush.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // The fresh report (returned in the POST body) should have
      // replaced the pending banner.
      expect(
        container.querySelector('[data-testid="schema-migrations-missing"]'),
      ).toBeNull();
      expect(
        container.querySelector(
          '[data-testid="row-schema-migration-030_pending_upgrade.sql"]',
        ),
      ).not.toBeNull();
      expect(
        container.querySelector('[data-testid="badge-schema-migrations-up-to-date"]'),
      ).not.toBeNull();
      // Operator should have received a success toast naming the
      // applied file.
      expect(toastSpy).toHaveBeenCalled();
      const toastArgs = toastSpy.mock.calls[0][0] as {
        title?: string;
        description?: string;
      };
      expect(toastArgs.title).toMatch(/Applied 1 migration/);
      expect(toastArgs.description).toContain("030_pending_upgrade.sql");
    });

    it("shows the server-supplied message when a second click hits the in-flight lock", async () => {
      installFetchRouter({
        schemaMigrations: () => ({
          status: 200,
          body: {
            applied: [],
            missing: [pending("030_pending_upgrade.sql")],
            unknown: [],
          },
        }),
        runMigrations: () => ({
          status: 409,
          body: {
            ok: false,
            errorCode: "run_in_progress",
            error: "A migration run is already in progress",
          },
        }),
      });

      await renderTab();

      await openAndConfirmApplyDialog();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // The card should surface the inline error banner with the
      // server's wording so a second admin sees why the click was
      // rejected (rather than thinking the click silently failed).
      const errBanner = container.querySelector(
        '[data-testid="schema-migrations-run-error"]',
      );
      expect(errBanner).not.toBeNull();
      expect(errBanner!.textContent).toMatch(/already in progress/i);
      const lastToast = toastSpy.mock.calls.at(-1)?.[0] as {
        variant?: string;
        title?: string;
      };
      // Task #461: this surface now flows through showErrorToast, which
      // emits variant: "error". The previous "destructive" variant was
      // visually equivalent (red banner) and has been consolidated into
      // the helper-driven "error" variant.
      expect(lastToast?.variant).toBe("error");
    });

    it("surfaces an error banner and seeds the partial report when the run fails", async () => {
      const partialReport = {
        applied: [],
        missing: [pending("031_broken.sql", { description: "Broken" })],
        unknown: [],
      };
      installFetchRouter({
        schemaMigrations: () => ({
          status: 200,
          body: {
            applied: [],
            missing: [pending("031_broken.sql", { description: "Broken" })],
            unknown: [],
          },
        }),
        runMigrations: () => ({
          status: 500,
          body: {
            ok: false,
            errorCode: "migration_failed",
            error: 'Migration 031_broken.sql failed: column "foo" does not exist',
            failedFilename: "031_broken.sql",
            sqlState: "42703",
            applied: [],
            report: partialReport,
          },
        }),
      });

      await renderTab();

      await openAndConfirmApplyDialog();
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      const errBanner = container.querySelector(
        '[data-testid="schema-migrations-run-error"]',
      );
      expect(errBanner).not.toBeNull();
      expect(errBanner!.textContent).toContain("031_broken.sql");
      // The missing banner should still reflect the unapplied file.
      expect(
        container.querySelector('[data-testid="schema-migrations-missing"]'),
      ).not.toBeNull();
      // And the operator should see a destructive toast.
      const lastToast = toastSpy.mock.calls.at(-1)?.[0] as {
        variant?: string;
        title?: string;
        description?: string;
      };
      // Task #461: showErrorToast emits variant: "error" — see comment
      // on the conflict-path test above.
      expect(lastToast?.variant).toBe("error");
      expect(lastToast?.title).toMatch(/Migration run failed/);
    });
  });
});
