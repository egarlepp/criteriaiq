// @vitest-environment happy-dom
//
// Coverage for the Sessions Cleanup card on the Background Services
// tab (Task #745). The card surfaces the in-memory snapshot returned
// by `getLastPruneSnapshot()` so admins can confirm the daily prune
// job ran without tailing `[Sessions Cleanup]` in stdout.
//
// We pin the four operator-facing states the snapshot can be in:
//   1. Successful prune — "Last expired-session prune: N rows, X
//      minutes ago" + "Next run: …" copy is rendered.
//   2. Scheduler started but no tick yet — "not run yet" copy.
//   3. DB-unreachable skip — the skipped warning row is shown.
//   4. Failed prune — the error row surfaces the driver message.
//
// The 30s polling / freshness-indicator behaviour is covered by the
// shared `HealthTabFreshnessIndicators.test.tsx` so we only render
// the new card here.

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

// Stub auth + toast so the card renders without the real auth query
// or PersonaContext. Defaults to non-Admin so existing card cases
// don't render the "Run now" button (Task #752); per-test variants
// override `mockAuthUser.current`.
const mockAuthUser: { current: { role?: string } | null } = { current: null };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mockAuthUser.current,
    isAuthenticated: !!mockAuthUser.current,
    isLoading: false,
  }),
}));
// The module-level `toast` export is stubbed too: the error path goes
// through `showErrorToast` (lib/toast-helper), which imports `toast`
// directly rather than via the hook.
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: toastSpy, dismiss: vi.fn(), toasts: [] }),
  toast: (...args: unknown[]) => toastSpy(...args),
}));

import { BackgroundServicesTab } from "../BackgroundServicesTab";

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

const lastChecked = new Date("2026-04-30T12:00:00Z").toISOString();

interface SessionsCleanupBlock {
  status: "active" | "inactive" | "unknown";
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRowsPruned: number | null;
  lastDurationMs: number | null;
  lastError: string | null;
  nextRunAt: string | null;
  intervalMs: number | null;
  skippedDueToUnreachableDb: boolean;
}

function buildPayload(sessionsCleanup: SessionsCleanupBlock | undefined) {
  return {
    status: "ok",
    lastChecked,
    message: "ok",
    websocket: { status: "running", connectedClients: 0, authenticatedClients: 0 },
    emailScheduler: {
      status: "active",
      rulesCount: 0,
      triggersCount: 0,
      scheduledActionsCount: 0,
    },
    workflowAutomation: { activeRules: 0, executionsToday: 0, failedExecutions24h: 0 },
    sessionsCleanup,
  };
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  toastSpy.mockClear();
  mockAuthUser.current = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

async function renderTab(client: QueryClient) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <BackgroundServicesTab />
      </QueryClientProvider>,
    );
  });
  await pump();
}

// Drain fetch + re-render. TanStack Query batches its observer
// notifications through notifyManager, whose default scheduler is a
// 0-delay setTimeout, so microtask-only pumps (`await Promise.resolve()`)
// leave the tab stuck on its loading skeleton. Each round yields one
// macrotask, matching DatabaseHealthTab.audit-logins-cleanup.test.tsx.
// No test in this file uses fake timers, so the 0-delay timer always fires.
async function pump(rounds = 10) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

describe("BackgroundServicesTab — Sessions Cleanup card (Task #745)", () => {
  it("renders 'Last expired-session prune: N rows, X minutes ago' after a successful tick", async () => {
    // Compute timestamps relative to the real clock so the formatter
    // produces the expected "5 minutes ago" / "23 hours" labels
    // without needing fake timers (fake timers stall async fetch
    // resolution under happy-dom and the renderTab pump).
    const lastSuccessAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const nextRunAt = new Date(Date.now() + 23 * 60 * 60_000).toISOString();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        200,
        buildPayload({
          status: "active",
          // lastRunAt and lastSuccessAt match — the most recent tick was
          // a success so no separate "last attempt" row should render.
          lastRunAt: lastSuccessAt,
          lastSuccessAt,
          lastRowsPruned: 42,
          lastDurationMs: 17,
          lastError: null,
          nextRunAt,
          intervalMs: 86_400_000,
          skippedDueToUnreachableDb: false,
        }),
      ),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const card = container.querySelector('[data-testid="sessions-cleanup-card"]');
    expect(card).not.toBeNull();
    const lastRun = container.querySelector('[data-testid="sessions-cleanup-last-run"]');
    expect(lastRun?.textContent).toContain("Last expired-session prune");
    expect(lastRun?.textContent).toContain("42 rows");
    expect(lastRun?.textContent).toContain("5 minutes ago");

    // No separate "Last attempt" row when most recent attempt was the
    // success itself.
    const lastAttempt = container.querySelector(
      '[data-testid="sessions-cleanup-last-attempt"]',
    );
    expect(lastAttempt).toBeNull();

    const nextRun = container.querySelector('[data-testid="sessions-cleanup-next-run"]');
    expect(nextRun?.textContent).toContain("Next run");
    expect(nextRun?.textContent).toContain("last took 17ms");
  });

  it("renders a separate 'Last attempt' row when the most recent tick failed after a prior success", async () => {
    // Prior success 2h ago, failed attempt 1m ago. The card should
    // still show "23 rows, 2 hours ago" for the success line and
    // surface a distinct "Last attempt: 1 minute ago" row so the row
    // count is never paired with the failed-tick timestamp.
    const lastSuccessAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const lastRunAt = new Date(Date.now() - 60_000).toISOString();
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        200,
        buildPayload({
          status: "active",
          lastRunAt,
          lastSuccessAt,
          lastRowsPruned: 23,
          lastDurationMs: 4,
          lastError: "connection reset",
          nextRunAt: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
          intervalMs: 86_400_000,
          skippedDueToUnreachableDb: false,
        }),
      ),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const lastRun = container.querySelector(
      '[data-testid="sessions-cleanup-last-run"]',
    );
    expect(lastRun?.textContent).toContain("Last expired-session prune");
    expect(lastRun?.textContent).toContain("23 rows");
    expect(lastRun?.textContent).toContain("2 hours ago");
    // Crucially, the success row must not include the failed-tick
    // "1 minute ago" timestamp.
    expect(lastRun?.textContent).not.toContain("1 minute ago");

    const lastAttempt = container.querySelector(
      '[data-testid="sessions-cleanup-last-attempt"]',
    );
    expect(lastAttempt?.textContent).toContain("Last attempt");
    expect(lastAttempt?.textContent).toContain("1 minute ago");
  });

  it("renders the 'not run yet' copy when the scheduler is active but has no tick yet", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        200,
        buildPayload({
          status: "active",
          lastRunAt: null,
          lastSuccessAt: null,
          lastRowsPruned: null,
          lastDurationMs: null,
          lastError: null,
          nextRunAt: new Date(Date.now() + 60_000).toISOString(),
          intervalMs: 86_400_000,
          skippedDueToUnreachableDb: false,
        }),
      ),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const lastRun = container.querySelector('[data-testid="sessions-cleanup-last-run"]');
    expect(lastRun?.textContent).toContain("not run yet");
  });

  it("surfaces the DB-unreachable skip warning when the most recent tick was skipped", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        200,
        buildPayload({
          status: "active",
          lastRunAt: null,
          lastSuccessAt: null,
          lastRowsPruned: null,
          lastDurationMs: null,
          lastError: null,
          nextRunAt: new Date(Date.now() + 60_000).toISOString(),
          intervalMs: 86_400_000,
          skippedDueToUnreachableDb: true,
        }),
      ),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const skipped = container.querySelector(
      '[data-testid="sessions-cleanup-db-unreachable"]',
    );
    expect(skipped).not.toBeNull();
    expect(skipped?.textContent).toContain("database was unreachable");
  });

  it("surfaces the driver error when the last prune failed", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(
        200,
        buildPayload({
          status: "active",
          lastRunAt: new Date().toISOString(),
          lastSuccessAt: null,
          lastRowsPruned: null,
          lastDurationMs: 5,
          lastError: "connection reset",
          nextRunAt: new Date(Date.now() + 60_000).toISOString(),
          intervalMs: 86_400_000,
          skippedDueToUnreachableDb: false,
        }),
      ),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const lastError = container.querySelector(
      '[data-testid="sessions-cleanup-last-error"]',
    );
    expect(lastError).not.toBeNull();
    expect(lastError?.textContent).toContain("connection reset");
  });

  it("omits the card entirely when the server omits sessionsCleanup (legacy payload)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, buildPayload(undefined)),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const card = container.querySelector('[data-testid="sessions-cleanup-card"]');
    expect(card).toBeNull();
  });
});

// Admin-only "Run now" button on the Sessions Cleanup card (Task #752).
describe("BackgroundServicesTab — Sessions Cleanup 'Run now' button (Task #752)", () => {
  function buildSnapshot(rowsPruned = 0, lastSuccessAt: string | null = null) {
    return {
      status: "active" as const,
      lastRunAt: lastSuccessAt,
      lastSuccessAt,
      lastRowsPruned: rowsPruned || null,
      lastDurationMs: 5,
      lastError: null,
      nextRunAt: new Date(Date.now() + 23 * 60 * 60_000).toISOString(),
      intervalMs: 86_400_000,
      skippedDueToUnreachableDb: false,
    };
  }

  it("hides the Run now button for non-admin callers", async () => {
    mockAuthUser.current = { role: "User" };
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, buildPayload(buildSnapshot())),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    expect(
      container.querySelector('[data-testid="sessions-cleanup-run-now"]'),
    ).toBeNull();
  });

  it("renders the Run now button for an Admin caller", async () => {
    mockAuthUser.current = { role: "Admin" };
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, buildPayload(buildSnapshot())),
    ) as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const btn = container.querySelector(
      '[data-testid="sessions-cleanup-run-now"]',
    );
    expect(btn).not.toBeNull();
    expect((btn as HTMLButtonElement).textContent).toContain("Run now");
  });

  it("POSTs to the manual-prune endpoint, refetches, and updates the card after a successful click", async () => {
    mockAuthUser.current = { role: "Admin" };
    const justNow = new Date().toISOString();
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (init?.method === "POST") {
        return jsonResponse(200, {
          rowsPruned: 7,
          durationMs: 12,
          snapshot: buildSnapshot(7, justNow),
        });
      }
      if (fetchMock.mock.calls.length > 1) {
        return jsonResponse(200, buildPayload(buildSnapshot(7, justNow)));
      }
      return jsonResponse(200, buildPayload(buildSnapshot()));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const btn = container.querySelector(
      '[data-testid="sessions-cleanup-run-now"]',
    ) as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await pump();

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url: typeof url === "string" ? url : (url as Request).url,
      method: (init as RequestInit | undefined)?.method,
    }));
    const postCall = calls.find((c) => c.method === "POST");
    expect(postCall).toBeDefined();
    expect(postCall!.url).toBe(
      "/api/system/health/services/sessions-cleanup/run",
    );

    const postIdx = calls.findIndex((c) => c.method === "POST");
    expect(
      calls.slice(postIdx + 1).some((c) => c.method !== "POST"),
    ).toBe(true);

    expect(toastSpy).toHaveBeenCalled();
    const toastArg = toastSpy.mock.calls.at(-1)?.[0];
    expect(toastArg.title).toContain("7");

    const lastRun = container.querySelector(
      '[data-testid="sessions-cleanup-last-run"]',
    );
    expect(lastRun?.textContent).toContain("7 rows");
  });

  it("surfaces the server error via toast when the manual prune fails", async () => {
    mockAuthUser.current = { role: "Admin" };
    const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse(500, {
          message: "Failed to prune expired sessions",
          error: "connection reset",
        });
      }
      return jsonResponse(200, buildPayload(buildSnapshot()));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const client = makeClient();
    await renderTab(client);

    const btn = container.querySelector(
      '[data-testid="sessions-cleanup-run-now"]',
    ) as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await pump();

    const failureToast = toastSpy.mock.calls
      .map((args) => args[0])
      .find((arg) => arg?.title === "Prune failed");
    expect(failureToast).toBeDefined();
    expect(failureToast.description).toContain("connection reset");
  });
});
