// @vitest-environment happy-dom
//
// Per-tab coverage for Task #425 — every System Health category tab
// must render the same live "updated Xs ago / spinner / Refresh now"
// affordance the overview header has (Task #418), so an operator
// drilling into a sub-tab during an incident sees the same freshness
// signal without having to jump back to the overview.
//
// We assert the indicator is present (with the tab-specific
// `testIdPrefix`) and that clicking the manual button triggers a
// refetch against the tab's own endpoint. The behaviour of the
// indicator itself (live ticking, spinner mid-flight, button
// disabling) is pinned by the standalone
// `HealthFreshnessIndicator.test.tsx` so we don't have to repeat
// those assertions for every tab.

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

import { DatabaseHealthTab } from "../DatabaseHealthTab";
import { EmailHealthTab } from "../EmailHealthTab";
import { IntegrationHealthTab } from "../IntegrationHealthTab";
import { SecurityHealthTab } from "../SecurityHealthTab";
import { BackgroundServicesTab } from "../BackgroundServicesTab";
import { StorageHealthTab } from "../StorageHealthTab";
import { PerformanceHealthTab } from "../PerformanceHealthTab";
import { ArchiveValidationTab } from "../ArchiveValidationTab";

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

// Minimal payloads — only the fields each tab dereferences before
// reaching the header row. Anything not used is omitted to keep the
// test surface small; the per-tab feature tests cover the rest.
const lastChecked = new Date("2026-04-01T12:00:00Z").toISOString();

const databasePayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  connectionPool: { totalConnections: 1, idleConnections: 1, waitingCount: 0, maxConnections: 10 },
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

const emailPayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  configuration: { isConfigured: true, enabled: true, provider: "sendgrid", server: null, port: null },
  queueStats: { firedToday: 0, sent24h: 0, failed24h: 0, totalLogs: 0, sentThisWeek: 0, sentThisMonth: 0, successRate: 0 },
  recentFailures: [],
  lastSendStatus: { success: null, sentAt: null, error: null },
  schedulerStatus: { active: true, lastRun: null, enabledRulesCount: 0 },
};

const integrationPayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  salesforce: { connectedUsers: 0, totalConfigurations: 0, recentSyncCount: 0, failedSyncs24h: 0, lastSyncTime: null },
  webhooks: { totalConfigurations: 0, activeWebhooks: 0, deliverySuccessRate24h: 100, pendingRetries: 0, recentFailures: [] },
  aiProviders: { configuredProviders: 0, activeProviders: [], lastTestTime: null },
};

const securityPayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  mfaStats: { totalUsers: 1, usersWithMfa: 0, mfaAdoptionRate: 0, usersWithWebauthn: 0, usersWithTotp: 0 },
  loginAttempts: { successful24h: 0, failed24h: 0, failureRate: 0, lockedAccounts: 0 },
  sessions: { activeSessions: 0, expiredSessions24h: 0 },
  passwordSecurity: { usersRequiringReset: 0, expiredPasswords: 0 },
};

const servicesPayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  websocket: { status: "running", connectedClients: 0, authenticatedClients: 0 },
  emailScheduler: { status: "active", rulesCount: 0, triggersCount: 0, scheduledActionsCount: 0 },
  workflowAutomation: { activeRules: 0, executionsToday: 0, failedExecutions24h: 0 },
};

// `StorageHealthTab` reads many fields; provide a permissive shape
// that exercises the header without forcing the rest of the panel to
// hit unrelated branches. The shape mirrors the production response
// but with all counters zeroed.
const storagePayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  objectStorage: {
    status: "connected",
    activeProvider: "local",
    configSource: "env",
    bucketName: "local",
  },
  attachments: {
    totalCount: 0,
    totalSizeFormatted: "0 B",
    byCategory: [],
  },
  logos: {
    companyLogosCount: 0,
    customerLogosCount: 0,
  },
  pathSizes: [],
};

const storageConfigPayload = {
  provider: "local",
  config: {},
  options: { providers: [] },
};

const performancePayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  apiMetrics: {
    requestsPerMinute: 0,
    averageResponseTimeMs: 0,
    slowQueriesCount: 0,
  },
  memoryUsage: {
    heapUsedMB: 100,
    heapTotalMB: 200,
    rssMemoryMB: 300,
    externalMB: 50,
  },
  databasePerformance: {
    avgQueryTimeMs: 0,
    slowQueries24h: 0,
    cacheHitRatio: 0,
  },
  uptime: { uptimeSeconds: 1000, uptimeFormatted: "16m" },
};

const archivePayload = {
  status: "ok",
  lastChecked,
  message: "ok",
  results: [],
  summary: { totalTables: 0, tablesOk: 0, tablesWithIssues: 0, totalMissingColumns: 0 },
};

beforeEach(() => {
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
  vi.restoreAllMocks();
});

async function renderTab(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });
  // Flush microtasks so the initial fetch resolves before assertions.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

interface TabCase {
  name: string;
  testIdPrefix: string;
  endpoint: string;
  payload: unknown;
  // Some tabs (Storage) hit more than one endpoint — the router
  // helper consults this map so the secondary endpoints don't 404
  // and tear down the panel before the indicator mounts.
  extraEndpoints?: Record<string, unknown>;
  render: () => React.ReactNode;
}

const cases: TabCase[] = [
  {
    name: "DatabaseHealthTab",
    testIdPrefix: "database-health",
    endpoint: "/api/system/health/database",
    payload: databasePayload,
    extraEndpoints: {
      // Schema migrations endpoint is admin-gated; the tab keeps the
      // query disabled when the auth hook returns a non-Admin user
      // (the default in tests), but we route it defensively just in
      // case the auth shim changes.
      "/api/admin/schema-migrations": { applied: [], missing: [], unknown: [] },
    },
    render: () => <DatabaseHealthTab />,
  },
  {
    name: "EmailHealthTab",
    testIdPrefix: "email-health",
    endpoint: "/api/system/health/email",
    payload: emailPayload,
    render: () => <EmailHealthTab />,
  },
  {
    name: "IntegrationHealthTab",
    testIdPrefix: "integration-health",
    endpoint: "/api/system/health/integrations",
    payload: integrationPayload,
    render: () => <IntegrationHealthTab />,
  },
  {
    name: "SecurityHealthTab",
    testIdPrefix: "security-health",
    endpoint: "/api/system/health/security",
    payload: securityPayload,
    render: () => <SecurityHealthTab />,
  },
  {
    name: "BackgroundServicesTab",
    testIdPrefix: "background-services-health",
    endpoint: "/api/system/health/services",
    payload: servicesPayload,
    render: () => <BackgroundServicesTab />,
  },
  {
    name: "StorageHealthTab",
    testIdPrefix: "storage-health",
    endpoint: "/api/system/health/storage",
    payload: storagePayload,
    extraEndpoints: {
      "/api/system/storage-config": storageConfigPayload,
    },
    render: () => <StorageHealthTab />,
  },
  {
    name: "PerformanceHealthTab",
    testIdPrefix: "performance-health",
    endpoint: "/api/system/health/performance",
    payload: performancePayload,
    extraEndpoints: {
      "/api/system/health/database": databasePayload,
    },
    render: () => <PerformanceHealthTab />,
  },
  {
    name: "ArchiveValidationTab",
    testIdPrefix: "archive-validation-health",
    endpoint: "/api/system/health/archive-validation",
    payload: archivePayload,
    render: () => <ArchiveValidationTab />,
  },
];

describe("Per-tab freshness indicators (Task #425)", () => {
  for (const c of cases) {
    describe(c.name, () => {
      it(`renders the '${c.testIdPrefix}-updated-ago' label seeded from the freshness timestamp`, async () => {
        let primaryHits = 0;
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          if (url.includes(c.endpoint)) {
            primaryHits += 1;
            return jsonResponse(200, c.payload);
          }
          if (c.extraEndpoints) {
            for (const [extraUrl, extraPayload] of Object.entries(c.extraEndpoints)) {
              if (url.includes(extraUrl)) {
                return jsonResponse(200, extraPayload);
              }
            }
          }
          return jsonResponse(404, {});
        }) as unknown as typeof fetch;

        await renderTab(c.render());

        // Primary endpoint must have resolved before we look for the
        // header — otherwise the tab is still in its loading state
        // and the indicator hasn't mounted yet.
        expect(primaryHits).toBeGreaterThanOrEqual(1);

        const label = container.querySelector(
          `[data-testid="${c.testIdPrefix}-updated-ago"]`,
        ) as HTMLElement | null;
        expect(label, `expected ${c.testIdPrefix}-updated-ago to render`).not.toBeNull();
        expect(label!.textContent).toMatch(/^updated [0-9]+s ago$/);

        // Task #442 — the tab no longer renders a separate
        // `Last checked: …` line. The absolute timestamp must instead
        // surface on the relative label's `title` so it remains
        // discoverable on hover for audit/debug. We assert both:
        // there must be no leftover "Last checked" text in the
        // header, and the relative label must carry the formatted
        // tooltip.
        expect(container.textContent ?? "").not.toContain("Last checked:");
        expect(label!.getAttribute("title")).toBe(
          `Last checked: ${new Date(lastChecked).toLocaleString()}`,
        );

        const button = container.querySelector(
          `[data-testid="${c.testIdPrefix}-refresh-now"]`,
        ) as HTMLButtonElement | null;
        expect(button, `expected ${c.testIdPrefix}-refresh-now to render`).not.toBeNull();
        expect(button!.textContent).toContain("Refresh now");
      });

      it(`triggers a refetch against ${c.endpoint} when 'Refresh now' is clicked`, async () => {
        let primaryHits = 0;
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          if (url.includes(c.endpoint)) {
            primaryHits += 1;
            return jsonResponse(200, c.payload);
          }
          if (c.extraEndpoints) {
            for (const [extraUrl, extraPayload] of Object.entries(c.extraEndpoints)) {
              if (url.includes(extraUrl)) {
                return jsonResponse(200, extraPayload);
              }
            }
          }
          return jsonResponse(404, {});
        }) as unknown as typeof fetch;

        await renderTab(c.render());

        // Snapshot the post-mount baseline. Clicking the button must
        // add at least one more hit; we use `>= baseline + 1` rather
        // than `=== baseline + 1` so any focus-driven refetch that
        // races on slower CI doesn't flake the assertion.
        const baseline = primaryHits;
        expect(baseline).toBeGreaterThanOrEqual(1);

        const button = container.querySelector(
          `[data-testid="${c.testIdPrefix}-refresh-now"]`,
        ) as HTMLButtonElement | null;
        expect(button).not.toBeNull();

        act(() => {
          button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        });
        for (let i = 0; i < 10; i += 1) {
          await act(async () => {
            await new Promise((r) => setTimeout(r, 5));
          });
        }

        expect(primaryHits).toBeGreaterThanOrEqual(baseline + 1);
      });
    });
  }
});
