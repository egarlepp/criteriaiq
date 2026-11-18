// @vitest-environment happy-dom
//
// Coverage for the "Login history cleanup" card added to the Database
// Health tab in Task #751. Verifies:
//   - the admin-only visibility gate (no card for non-admin users —
//     surfacing scheduler internals to ordinary users would leak
//     operational metadata they have no need for, and the GET endpoint
//     itself returns 403 for them so an empty card would be a dead
//     surface anyway),
//   - the "Awaiting first run" placeholder state when the scheduler
//     has been started but no successful tick has fired yet (fresh
//     boot, default 60 s first-run delay window) — the panel still
//     renders the active retention window in this state so admins
//     see "Retention: 90 days" immediately,
//   - the steady-state render once the first tick has stamped a
//     timestamp and a row count, including the "Active" badge and
//     the localized timestamp,
//   - the docs deep-link points at the "Login history retention"
//     section of the self-hosting guide so the panel never stands
//     alone — admins who want to change the retention window can
//     follow it straight to the env-var documentation.

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

const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: toastSpy,
}));

import { DatabaseHealthTab } from "../DatabaseHealthTab";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

interface AuditLoginsCleanupBody {
  lastRunAt: string | null;
  lastRemoved: number | null;
  retentionDays: number | null;
}

interface AuditLoginsPruneRunBody {
  removed?: number;
  lastRunAt?: string;
  retentionDays?: number;
  message?: string;
}

interface FetchHandlers {
  auditLoginsCleanup?: () => { status: number; body: AuditLoginsCleanupBody };
  auditLoginsPruneRun?: () => { status: number; body: AuditLoginsPruneRunBody };
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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

function installFetchRouter(handlers: FetchHandlers) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url.includes("/api/system/health/database")) {
      return jsonResponse(200, buildHealthPayload());
    }
    if (url.includes("/api/admin/audit-logins-cleanup/run")) {
      if (!handlers.auditLoginsPruneRun) {
        return jsonResponse(200, {
          removed: 0,
          lastRunAt: new Date().toISOString(),
          retentionDays: 90,
        });
      }
      const { status, body } = handlers.auditLoginsPruneRun();
      return jsonResponse(status, body);
    }
    if (url.includes("/api/admin/audit-logins-cleanup/status")) {
      if (!handlers.auditLoginsCleanup) {
        return jsonResponse(200, {
          lastRunAt: null,
          lastRemoved: null,
          retentionDays: null,
        });
      }
      const { status, body } = handlers.auditLoginsCleanup();
      return jsonResponse(status, body);
    }
    if (url.includes("/api/admin/schema-migrations")) {
      // Default benign response so the unrelated migrations card
      // doesn't error during these tests. Method-agnostic — mutation
      // hits `/run`, GET hits the bare path, both 200-shaped.
      return jsonResponse(200, { applied: [], missing: [], unknown: [] });
    }
    return jsonResponse(404, {});
  }) as unknown as typeof fetch;
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
  // Two admin queries fan out (schema migrations + audit-logins
  // cleanup) on top of the public database health query; flush
  // multiple microtask queues so every fetch resolves before the
  // assertions run.
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("DatabaseHealthTab login history cleanup card", () => {
  it("does not render the card for non-admin users", async () => {
    mockedUser = { id: "u1", email: "user@example.com", role: "User" };
    installFetchRouter({});

    await renderTab();

    expect(
      container.querySelector('[data-testid="card-audit-logins-cleanup"]'),
    ).toBeNull();
    // The admin-only fetch must not have been issued — the `enabled`
    // gate is what keeps non-Admin users from triggering a 403.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const calledUrls = fetchCalls.map((c) => String(c[0]));
    expect(
      calledUrls.some((u) => u.includes("/api/admin/audit-logins-cleanup/status")),
    ).toBe(false);
  });

  it("shows 'Awaiting first run' but still surfaces the active retention window before the first tick", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
    });

    await renderTab();

    const card = container.querySelector(
      '[data-testid="card-audit-logins-cleanup"]',
    );
    expect(card).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="badge-audit-logins-cleanup-pending"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="badge-audit-logins-cleanup-active"]',
      ),
    ).toBeNull();

    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-last-run-value"]',
      )?.textContent,
    ).toContain("Not yet");
    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-removed-value"]',
      )?.textContent,
    ).toContain("—");
    // The retention window must render even before the first tick so
    // the panel never shows a blank value during the first-run
    // delay window.
    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-retention-value"]',
      )?.textContent,
    ).toContain("90 days");
  });

  it("renders the steady-state 'Active' badge with the timestamp + row count after the first successful tick", async () => {
    const lastRunAt = "2026-04-30T10:15:00.000Z";
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt, lastRemoved: 1234, retentionDays: 30 },
      }),
    });

    await renderTab();

    expect(
      container.querySelector(
        '[data-testid="badge-audit-logins-cleanup-active"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="badge-audit-logins-cleanup-pending"]',
      ),
    ).toBeNull();

    // The timestamp is rendered through `new Date(...).toLocaleString()`,
    // which is locale-sensitive (and depends on the test host TZ). We
    // assert it isn't the placeholder rather than pinning an exact
    // string — the important contract is "the last-run timestamp is
    // surfaced and not the 'Not yet' placeholder".
    const lastRunText = container.querySelector(
      '[data-testid="audit-logins-cleanup-last-run-value"]',
    )?.textContent ?? "";
    expect(lastRunText).not.toContain("Not yet");
    expect(lastRunText.length).toBeGreaterThan(0);

    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-removed-value"]',
      )?.textContent,
    ).toContain("1,234");
    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-retention-value"]',
      )?.textContent,
    ).toContain("30 days");
  });

  it("links to the 'Login history retention' section of the self-hosting guide", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: {
          lastRunAt: "2026-04-30T10:15:00.000Z",
          lastRemoved: 0,
          retentionDays: 90,
        },
      }),
    });

    await renderTab();

    const link = container.querySelector(
      '[data-testid="link-audit-logins-cleanup-docs"]',
    ) as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    // The guide is a regex-rendered markdown file with explicit
    // `<a id="…">` anchors — tests pin the anchor name so adding /
    // renaming an anchor without updating the matching docs section
    // breaks loud rather than silently 404-ing the operator.
    expect(link!.getAttribute("href")).toBe(
      "/docs/self-hosting#login-history-retention",
    );
    // External-tab semantics so admins don't lose their place on the
    // System Health dashboard while reading the docs.
    expect(link!.getAttribute("target")).toBe("_blank");
    expect(link!.getAttribute("rel")).toContain("noopener");
  });

  // ─── On-demand "Prune now" button (Task #756) ────────────────
  // The daily scheduler still runs every 24 h by default, but the
  // panel now exposes a button that triggers the same prune
  // synchronously so an admin who tightens the retention window
  // mid-process doesn't have to wait until the next tick.

  it("renders the 'Prune now' button for admins", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
    });

    await renderTab();

    const button = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(false);
    expect(button!.textContent ?? "").toContain("Prune now");
  });

  // ─── AlertDialog confirmation (Task #758) ────────────────
  // The "Prune now" trigger no longer fires the POST directly;
  // instead it opens an AlertDialog that names the active
  // retention window so an accidental click (e.g. an admin who
  // meant to hit the adjacent Refresh button) can't wipe
  // compliance-relevant audit_logins rows. Helpers below mirror
  // the schema-migrations Apply confirmation tests.
  async function openPruneDialog() {
    const button = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }

  it("opens a confirmation dialog naming the active retention window before sending the prune request", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 30 },
      }),
    });

    await renderTab();

    // Before the trigger is clicked the dialog must not be in the
    // DOM and the POST must not have fired.
    expect(
      document.body.querySelector(
        '[data-testid="dialog-confirm-prune-audit-logins"]',
      ),
    ).toBeNull();
    const fetchCallsBefore = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(
      fetchCallsBefore.some((c) =>
        String(c[0]).includes("/api/admin/audit-logins-cleanup/run"),
      ),
    ).toBe(false);

    await openPruneDialog();

    // Dialog mounts into a portal under document.body, not under
    // the test container.
    const dialog = document.body.querySelector(
      '[data-testid="dialog-confirm-prune-audit-logins"]',
    );
    expect(dialog).not.toBeNull();
    const description = document.body.querySelector(
      '[data-testid="dialog-confirm-prune-audit-logins-description"]',
    );
    expect(description).not.toBeNull();
    // The active retention window must be named in the body so the
    // operator confirms against the same number that's about to be
    // applied — vague "are you sure" prompts get rubber-stamped.
    expect(description!.textContent ?? "").toContain("30 day");
    expect(description!.textContent ?? "").toMatch(/cannot be undone/i);

    // Critically: opening the dialog must not have fired the POST.
    const fetchCallsAfterOpen = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(
      fetchCallsAfterOpen.some((c) =>
        String(c[0]).includes("/api/admin/audit-logins-cleanup/run"),
      ),
    ).toBe(false);
  });

  it("cancels without sending the prune request when the operator backs out of the dialog", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
    });

    await renderTab();
    await openPruneDialog();

    const cancel = document.body.querySelector(
      '[data-testid="button-cancel-prune-audit-logins"]',
    ) as HTMLButtonElement | null;
    expect(cancel).not.toBeNull();
    await act(async () => {
      cancel!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Dialog closes after cancel.
    expect(
      document.body.querySelector(
        '[data-testid="dialog-confirm-prune-audit-logins"]',
      ),
    ).toBeNull();
    // No prune POST may have fired — this is the whole point of the
    // confirmation step.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(
      fetchCalls.some((c) =>
        String(c[0]).includes("/api/admin/audit-logins-cleanup/run"),
      ),
    ).toBe(false);
    // No success/error toast either — cancelling is a no-op.
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("POSTs to the on-demand prune endpoint, surfaces the removed count via a toast, and refreshes the snapshot", async () => {
    let pruneCalls = 0;
    const newRunAt = "2026-04-30T11:00:00.000Z";
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
      auditLoginsPruneRun: () => {
        pruneCalls += 1;
        return {
          status: 200,
          body: {
            removed: 42,
            lastRunAt: newRunAt,
            retentionDays: 30,
          },
        };
      },
    });

    await renderTab();

    const button = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Task #758: confirm in the dialog before the POST fires.
    const confirm = document.body.querySelector(
      '[data-testid="button-confirm-prune-audit-logins"]',
    ) as HTMLButtonElement | null;
    expect(confirm).not.toBeNull();
    await act(async () => {
      confirm!.click();
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    expect(pruneCalls).toBe(1);
    // The POST verb is what the server route matches on; pinning it
    // here keeps a future "let's switch to PATCH" refactor from
    // silently breaking the route contract.
    const fetchCalls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const pruneCall = fetchCalls.find((c) =>
      String(c[0]).includes("/api/admin/audit-logins-cleanup/run"),
    );
    expect(pruneCall).toBeDefined();
    const init = pruneCall![1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");

    expect(toastSpy).toHaveBeenCalled();
    const titles = toastSpy.mock.calls.map((c) => (c[0] as { title?: string })?.title ?? "");
    expect(titles.some((t) => /Pruned 42/.test(t))).toBe(true);

    // Snapshot is refreshed in the cache so the panel re-renders with
    // the new last-run timestamp + row count without a follow-up GET.
    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-removed-value"]',
      )?.textContent,
    ).toContain("42");
    expect(
      container.querySelector(
        '[data-testid="audit-logins-cleanup-retention-value"]',
      )?.textContent,
    ).toContain("30 days");
    expect(
      container.querySelector(
        '[data-testid="badge-audit-logins-cleanup-active"]',
      ),
    ).not.toBeNull();
  });

  it("disables the 'Prune now' button while a run is in flight so concurrent clicks don't queue duplicate prunes", async () => {
    let resolveRun: ((value: { status: number; body: AuditLoginsPruneRunBody }) => void) | null = null;
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
      auditLoginsPruneRun: () => {
        // Returning a resolved value here would let the mutation
        // settle inside the same microtask the click triggered, so
        // we'd never observe the pending state. Instead we hand back
        // a deferred and resolve it after the assertion runs.
        return {
          status: 200,
          body: { removed: 0, lastRunAt: new Date().toISOString(), retentionDays: 90 },
        };
      },
    });

    // Re-wrap the prune-run handler so we can defer its response.
    const originalFetchFn = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/api/admin/audit-logins-cleanup/run")) {
        return new Promise<Response>((resolve) => {
          resolveRun = (value) => {
            resolve({
              ok: value.status >= 200 && value.status < 300,
              status: value.status,
              json: async () => value.body,
              text: async () => JSON.stringify(value.body),
              headers: new Headers({ "content-type": "application/json" }),
            } as unknown as Response);
          };
        });
      }
      return (originalFetchFn as typeof fetch)(input, init);
    }) as unknown as typeof fetch;

    await renderTab();

    const button = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Task #758: confirm in the dialog so the deferred POST fires
    // and the trigger flips into its in-flight state.
    const confirm = document.body.querySelector(
      '[data-testid="button-confirm-prune-audit-logins"]',
    ) as HTMLButtonElement | null;
    expect(confirm).not.toBeNull();
    await act(async () => {
      confirm!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const buttonDuring = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement;
    expect(buttonDuring.disabled).toBe(true);
    expect(buttonDuring.textContent ?? "").toContain("Pruning");

    // Resolve the deferred so the mutation can settle and the test
    // teardown isn't left holding a pending promise.
    await act(async () => {
      resolveRun?.({
        status: 200,
        body: { removed: 0, lastRunAt: new Date().toISOString(), retentionDays: 90 },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("surfaces a server-side error message in a toast when the on-demand prune fails", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 200,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: 90 },
      }),
      auditLoginsPruneRun: () => ({
        status: 500,
        body: { message: "Failed to prune audit logins: connection reset" },
      }),
    });

    await renderTab();

    const button = container.querySelector(
      '[data-testid="button-prune-audit-logins-cleanup"]',
    ) as HTMLButtonElement;

    await act(async () => {
      button.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // Task #758: confirm in the dialog so the failing POST actually fires.
    const confirm = document.body.querySelector(
      '[data-testid="button-confirm-prune-audit-logins"]',
    ) as HTMLButtonElement | null;
    expect(confirm).not.toBeNull();
    await act(async () => {
      confirm!.click();
    });
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    expect(toastSpy).toHaveBeenCalled();
    const descriptions = toastSpy.mock.calls.map((c) => {
      const arg = c[0] as { description?: unknown };
      return typeof arg?.description === "string" ? arg.description : "";
    });
    expect(descriptions.some((d) => /connection reset/.test(d))).toBe(true);
  });

  it("renders an inline error banner when the status endpoint fails", async () => {
    installFetchRouter({
      auditLoginsCleanup: () => ({
        status: 500,
        body: { lastRunAt: null, lastRemoved: null, retentionDays: null },
      }),
    });

    await renderTab();

    const banner = container.querySelector(
      '[data-testid="audit-logins-cleanup-error"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.textContent ?? "").toMatch(/Failed to fetch audit-logins/i);
  });
});
