// @vitest-environment happy-dom
//
// Coverage for task #736 — after a successful SESSION_SECRET rotation
// the one-time copy dialog must surface a "you've been logged out
// everywhere, including this tab" notice so the rotating admin gets a
// heads-up before the next API call returns 401 and the global auth
// handler bounces them to /login. The server already exposes the
// `sessionsInvalidated: true` flag on the regenerate response (see
// server/routes/system-routes.ts ~ line 656); these tests assert the client
// actually renders something for it.
//
// We mock the dialog primitives the same way the existing driver test
// does so the portal contents end up inside `container` instead of
// being mounted into a separate body subtree by Radix.

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

// Task #749 fixed the double-`.json()` bug in the bootstrap-secrets
// mutations, so this suite intentionally does NOT shim `apiRequest`.
// The success path now flows through the real helper in
// `client/src/lib/queryClient.ts`, which means a future regression that
// re-introduces `await res.json()` on an already-parsed body will fail
// these tests instead of silently flipping the success path back into
// the toast-only error path.

vi.mock("@/components/ui/dialog", async () => {
  function Dialog({
    open,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
    children: React.ReactNode;
  }) {
    if (!open) return null;
    return <div data-mock-dialog>{children}</div>;
  }
  function DialogContent({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return <div className={className}>{children}</div>;
  }
  function Passthrough({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  return {
    Dialog,
    DialogContent,
    DialogHeader: Passthrough,
    DialogTitle: Passthrough,
    DialogDescription: Passthrough,
    DialogFooter: Passthrough,
    DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const { DatabaseConnectionSection } = await import("../DatabaseConnectionSection");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;

interface RegenerateResponse {
  key: "SESSION_SECRET" | "ENCRYPTION_KEY";
  value: string;
  source: string;
  sessionsInvalidated?: boolean;
  reencrypted?: { tables: number; rows: number };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

function setupFetch(regenerateBody: RegenerateResponse) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/system/secrets/regenerate")) {
      return jsonResponse(regenerateBody);
    }
    if (url.includes("/api/system/env-status")) {
      // Bootstrap snapshot: SESSION_SECRET lives in the wizard file so
      // the rotate button is enabled and the regenerate path is reachable.
      return jsonResponse({
        databaseUrlSource: "wizard",
        sessionSecretSource: "file",
        sessionSecretValue: "old-value",
        encryptionKeySource: "file",
        encryptionKeyValue: "old-enc-value",
      });
    }
    if (url.includes("/api/db-connections")) {
      return jsonResponse({ connections: [] });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
}

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
});

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
  // Drain microtasks until env-status + connections have resolved and
  // the Bootstrap Secrets card has rendered.
  for (let i = 0; i < 50; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

function clickByTestId(testId: string) {
  const el = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`element with data-testid="${testId}" not rendered`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function rotateSessionSecret() {
  clickByTestId("button-regenerate-session_secret");
  // Re-render so the confirm dialog mounts.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  clickByTestId("button-confirm-regenerate");
  // Drain mutation + onSuccess so the one-time copy dialog mounts.
  for (let i = 0; i < 30; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

describe("DatabaseConnectionSection — SESSION_SECRET rotation 'logged out' notice (task #736)", () => {
  it("renders the logged-out heads-up inside the copy-now dialog when sessionsInvalidated is true", async () => {
    setupFetch({
      key: "SESSION_SECRET",
      value: "freshly-generated-value",
      source: "file",
      sessionsInvalidated: true,
    });
    await renderSection();
    await rotateSessionSecret();

    const notice = container.querySelector<HTMLElement>(
      '[data-testid="notice-sessions-invalidated"]',
    );
    expect(notice, "logged-out notice should render").not.toBeNull();
    expect(notice!.textContent ?? "").toContain("logged out");
    expect(notice!.textContent ?? "").toContain("sign in again");

    // The dialog still shows the freshly-generated value so the admin
    // can copy it before getting bounced.
    expect(container.textContent ?? "").toContain("freshly-generated-value");
  });

  it("omits the notice when the server reports sessionsInvalidated: false (e.g. middleware swap failed)", async () => {
    setupFetch({
      key: "SESSION_SECRET",
      value: "freshly-generated-value",
      source: "file",
      sessionsInvalidated: false,
    });
    await renderSection();
    await rotateSessionSecret();

    const notice = container.querySelector(
      '[data-testid="notice-sessions-invalidated"]',
    );
    expect(notice).toBeNull();
    // Copy dialog still opens so the operator can still save the value.
    expect(container.textContent ?? "").toContain("freshly-generated-value");
  });

  it("omits the notice entirely for ENCRYPTION_KEY rotations", async () => {
    setupFetch({
      key: "ENCRYPTION_KEY",
      value: "new-encryption-key",
      source: "file",
      // The server never sets sessionsInvalidated on the
      // ENCRYPTION_KEY branch, but defensively we should not render
      // the banner even if a future server change started echoing it.
      sessionsInvalidated: true,
      reencrypted: { tables: 2, rows: 7 },
    });
    await renderSection();
    clickByTestId("button-regenerate-encryption_key");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    clickByTestId("button-confirm-regenerate");
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 5));
      });
    }

    const notice = container.querySelector(
      '[data-testid="notice-sessions-invalidated"]',
    );
    expect(notice).toBeNull();
    expect(container.textContent ?? "").toContain("new-encryption-key");
  });
});
