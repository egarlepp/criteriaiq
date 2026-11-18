// @vitest-environment happy-dom
//
// Coverage for the Connection Pool gauge added to the Database Health
// tab in Task #507.
//
// What we pin:
//   - The headline reads "X / poolMax in use" using the new
//     `poolMax` / `totalCount` fields the server now returns.
//   - Live waiters are surfaced inline ("…, N waiting") whenever the
//     server reports `waitingCount > 0`.
//   - The "raise DB_POOL_MAX" hint stays hidden on the first
//     non-zero observation but appears once waiters have been
//     observed across at least two consecutive polls (the
//     "sustained" debounce).
//   - When the hint fires, it deep-links to the
//     "Tuning the database connection pool" section of the
//     self-hosting guide (Task #516) so the operator who's being
//     told to raise the value also lands on the page that explains
//     what number to pick.
//   - The hint disappears as soon as the pool drains.

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u', email: 'u@example.com', role: 'User' },
    effectiveUser: { id: 'u', email: 'u@example.com', role: 'User' },
    isLoading: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn(), toasts: [] }),
  toast: vi.fn(),
}));

import { DatabaseHealthTab } from '../DatabaseHealthTab';

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

interface PoolFixture {
  poolMax?: number;
  totalCount?: number;
  idleCount?: number;
  waitingCount: number;
}

// Holds the next pool snapshot the mocked fetch should return. The
// test mutates this between `refetch()` calls to simulate the polling
// interval observing different states.
let currentPool: PoolFixture = {
  poolMax: 10,
  totalCount: 1,
  idleCount: 1,
  waitingCount: 0,
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as Response;
}

function buildHealthPayload() {
  return {
    status: 'ok' as const,
    lastChecked: new Date().toISOString(),
    message: 'ok',
    connectionPool: { ...currentPool },
    tableStats: [],
    orphanedRecords: {
      projectsWithoutCustomers: 0,
      mapPhasesWithoutProjects: 0,
      mapStepsWithoutPhases: 0,
      mapTasksWithoutSteps: 0,
      successCriteriaWithoutProjects: 0,
    },
    databaseSize: { totalBytes: 0, totalFormatted: '0 B' },
    connectionSource: 'env',
  };
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  currentPool = { poolMax: 10, totalCount: 1, idleCount: 1, waitingCount: 0 };

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    if (url.includes('/api/system/health/database')) {
      return jsonResponse(200, buildHealthPayload());
    }
    // Non-admin users never trigger the schema-migrations query.
    return jsonResponse(404, {});
  }) as unknown as typeof fetch;
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
  // Flush microtasks so the query resolves and the effect runs.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return client;
}

describe('DatabaseHealthTab — Connection Pool gauge (Task #507)', () => {
  it('renders the headline using poolMax + totalCount', async () => {
    currentPool = { poolMax: 25, totalCount: 9, idleCount: 4, waitingCount: 0 };
    await renderTab();

    const headline = container.querySelector('[data-testid="connection-pool-headline"]');
    expect(headline?.textContent).toContain('9 / 25 in use');
    expect(headline?.textContent).not.toContain('waiting');
    expect(container.querySelector('[data-testid="connection-pool-raise-hint"]')).toBeNull();
  });

  it('falls back to legacy field names when the server omits the new ones', async () => {
    // Older server build still on the pre-Task-507 payload — the UI
    // should still render reasonable numbers from the alias fields.
    // The fixture type is intentionally permissive (legacy field
    // names are optional aliases), so we cast to widen here without
    // breaking the rest of the suite.
    currentPool = {
      totalConnections: 5,
      idleConnections: 2,
      maxConnections: 20,
      waitingCount: 0,
    } as unknown as PoolFixture;
    await renderTab();

    const headline = container.querySelector('[data-testid="connection-pool-headline"]');
    expect(headline?.textContent).toContain('5 / 20 in use');
  });

  it('surfaces "N waiting" inline whenever the pool has queued callers', async () => {
    currentPool = { poolMax: 10, totalCount: 10, idleCount: 0, waitingCount: 3 };
    await renderTab();

    const headline = container.querySelector('[data-testid="connection-pool-headline"]');
    expect(headline?.textContent).toContain('10 / 10 in use');
    expect(headline?.textContent).toContain('3 waiting');
  });

  it('hides the raise-hint on the first observation but shows it after a sustained run', async () => {
    currentPool = { poolMax: 10, totalCount: 10, idleCount: 0, waitingCount: 2 };
    const client = await renderTab();

    // First poll has waiters but the hint should still be hidden —
    // a single transient spike shouldn't nag the operator.
    expect(container.querySelector('[data-testid="connection-pool-raise-hint"]')).toBeNull();

    // Force a second poll observing waiters again. The hint debounce
    // requires two consecutive non-zero polls before firing.
    currentPool = { poolMax: 10, totalCount: 10, idleCount: 0, waitingCount: 5 };
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['system-health-database'] });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const hint = container.querySelector('[data-testid="connection-pool-raise-hint"]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('DB_POOL_MAX');
    expect(hint?.textContent).toContain('10');

    // Task #516 — the hint must deep-link to the self-hosting guide
    // section that explains how to size DB_POOL_MAX relative to
    // Postgres' max_connections. The link's anchor must match the
    // explicit `<a id="…"></a>` in `docs/guides/self-hosting.md`,
    // since the in-app docs renderer is regex-based and does not
    // auto-generate heading IDs.
    const docsLink = container.querySelector(
      '[data-testid="connection-pool-raise-hint-link"]',
    ) as HTMLAnchorElement | null;
    expect(docsLink).not.toBeNull();
    expect(docsLink?.getAttribute('href')).toBe(
      '/docs/self-hosting#tuning-the-database-connection-pool',
    );
  });

  it('clears the hint as soon as the pool drains', async () => {
    currentPool = { poolMax: 10, totalCount: 10, idleCount: 0, waitingCount: 2 };
    const client = await renderTab();

    // Two consecutive non-zero polls so the hint appears.
    for (let i = 0; i < 2; i++) {
      currentPool = { poolMax: 10, totalCount: 10, idleCount: 0, waitingCount: 4 };
      await act(async () => {
        await client.invalidateQueries({ queryKey: ['system-health-database'] });
        await new Promise((r) => setTimeout(r, 0));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
    expect(container.querySelector('[data-testid="connection-pool-raise-hint"]')).not.toBeNull();

    // Pool drains — hint should disappear immediately.
    currentPool = { poolMax: 10, totalCount: 4, idleCount: 6, waitingCount: 0 };
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['system-health-database'] });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(container.querySelector('[data-testid="connection-pool-raise-hint"]')).toBeNull();
  });
});
