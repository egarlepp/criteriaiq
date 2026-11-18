// @vitest-environment happy-dom
//
// Component coverage for the duplicate-cleanup notice banner.

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

const authHolder: { user: { role: string } | null; isAuthenticated: boolean } = {
  user: { role: "Admin" },
  isAuthenticated: true,
};
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => authHolder,
}));

const toastCalls: Array<unknown> = [];
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: (args: unknown) => {
      toastCalls.push(args);
    },
  }),
}));

const apiRequestMock = vi.fn();
vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...args),
}));

import DuplicateCleanupNotice from "../DuplicateCleanupNotice";

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let originalFetch: typeof globalThis.fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

function mountWithSeed(seed: unknown) {
  queryClient.setQueryData(["/api/users/duplicate-cleanup-notice"], seed);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  authHolder.user = { role: "Admin" };
  authHolder.isAuthenticated = true;
  toastCalls.length = 0;
  apiRequestMock.mockReset();

  fetchMock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({ dismissed: true, dismissedAt: null, duplicates: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (originalFetch) globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

async function render(props: { onReviewUser?: (id: string) => void } = {}) {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <DuplicateCleanupNotice {...props} />
      </QueryClientProvider>,
    );
  });
}

const SEEDED_DUPES = {
  dismissed: false,
  dismissedAt: null as string | null,
  duplicates: [
    {
      loser: {
        id: "u-loser-1",
        email: "Foo+dup42+a3f1c8d2@example.com",
        firstName: "Foo",
        lastName: "Bar",
        isActive: false,
        deactivatedAt: "2026-04-15T12:00:00Z",
      },
      originalEmail: "Foo@example.com",
      surviving: {
        id: "u-winner-1",
        email: "foo@example.com",
        firstName: "Foo",
        lastName: "Winner",
        isActive: true,
      },
    },
  ],
};

describe("DuplicateCleanupNotice (Task #544)", () => {
  it("renders nothing for non-admin sessions even if a payload is somehow seeded", async () => {
    authHolder.user = { role: "Engineer" };
    mountWithSeed(SEEDED_DUPES);
    await render();

    expect(
      container.querySelector('[data-testid="duplicate-cleanup-notice"]'),
    ).toBeNull();
  });

  it("renders nothing when the server reports dismissed=true", async () => {
    mountWithSeed({ ...SEEDED_DUPES, dismissed: true });
    await render();
    expect(
      container.querySelector('[data-testid="duplicate-cleanup-notice"]'),
    ).toBeNull();
  });

  it("renders nothing when there are zero duplicates", async () => {
    mountWithSeed({ dismissed: false, dismissedAt: null, duplicates: [] });
    await render();
    expect(
      container.querySelector('[data-testid="duplicate-cleanup-notice"]'),
    ).toBeNull();
  });

  it("renders the loser/surviving pair with Review buttons that call back into the parent", async () => {
    mountWithSeed(SEEDED_DUPES);
    const onReview = vi.fn();
    await render({ onReviewUser: onReview });

    const banner = container.querySelector(
      '[data-testid="duplicate-cleanup-notice"]',
    );
    expect(banner).not.toBeNull();

    // Both the renamed (deactivated) email and the surviving email
    // should be visible so the admin can see the pair at a glance.
    expect(banner!.textContent).toContain("Foo+dup42+a3f1c8d2@example.com");
    expect(banner!.textContent).toContain("foo@example.com");
    expect(banner!.textContent).toContain("Foo@example.com"); // reconstructed original

    // Review buttons fire the callback with the right user id.
    const reviewLoser = banner!.querySelector(
      '[data-testid="review-loser-u-loser-1"]',
    ) as HTMLButtonElement | null;
    expect(reviewLoser).not.toBeNull();
    await act(async () => {
      reviewLoser!.click();
    });
    expect(onReview).toHaveBeenCalledWith("u-loser-1");

    const reviewSurviving = banner!.querySelector(
      '[data-testid="review-surviving-u-winner-1"]',
    ) as HTMLButtonElement | null;
    expect(reviewSurviving).not.toBeNull();
    await act(async () => {
      reviewSurviving!.click();
    });
    expect(onReview).toHaveBeenCalledWith("u-winner-1");
  });

  it("dismiss button POSTs to the dismiss endpoint and optimistically hides the banner", async () => {
    mountWithSeed(SEEDED_DUPES);
    apiRequestMock.mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, dismissedAt: "2026-04-28T08:00:00Z" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await render();

    const dismissBtn = container.querySelector(
      '[data-testid="dismiss-duplicate-cleanup-notice"]',
    ) as HTMLButtonElement | null;
    expect(dismissBtn).not.toBeNull();

    await act(async () => {
      dismissBtn!.click();
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      "POST",
      "/api/users/duplicate-cleanup-notice/dismiss",
    );
    // Optimistic update: once the mutation's onSuccess runs (the request
    // and res.json() take several microtasks, more under CI load), the
    // cache reports dismissed=true and the banner re-render removes the
    // testid node.
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      const cached = queryClient.getQueryData<{ dismissed: boolean }>([
        "/api/users/duplicate-cleanup-notice",
      ]);
      expect(cached?.dismissed).toBe(true);
      expect(
        container.querySelector('[data-testid="duplicate-cleanup-notice"]'),
      ).toBeNull();
    });
  });

  it("renders a 'no surviving account' fallback when the surviving lookup found nothing", async () => {
    mountWithSeed({
      dismissed: false,
      dismissedAt: null,
      duplicates: [
        {
          loser: {
            id: "u-loser-2",
            email: "Orphan+dup99+deadbeef@example.com",
            firstName: "Orphan",
            lastName: null,
            isActive: false,
            deactivatedAt: "2026-04-15T12:00:00Z",
          },
          originalEmail: "Orphan@example.com",
          surviving: null,
        },
      ],
    });
    await render({ onReviewUser: () => {} });

    const banner = container.querySelector(
      '[data-testid="duplicate-cleanup-notice"]',
    );
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain("No active surviving account");
    // No "Review surviving" button when surviving is null.
    expect(
      banner!.querySelector('[data-testid^="review-surviving-"]'),
    ).toBeNull();
  });
});
