// @vitest-environment happy-dom
//
// UI smoke test for the webhook delete confirmation flow introduced
// by Task #666. Mirrors the email-design / email-template
// confirmation patterns locked in by Tasks #589, #649, and #657
// (see
// `email-templates/__tests__/EmailTemplatesSection.delete-confirm.test.tsx`).
//
// What this locks:
//   1. The Webhooks section uses the shared
//      `@/components/ui/confirmation-dialog` for the row-level
//      "Delete" action — not the bespoke AlertDialog block it
//      historically had — so the wording and styling match every
//      other destructive action in the Communications area.
//   2. Clicking the row-level "Delete" action does NOT fire the
//      DELETE call immediately — instead it opens the
//      ConfirmationDialog, naming the webhook and using the
//      destructive variant.
//   3. Cancelling the dialog leaves the webhook intact (no DELETE).
//   4. Confirming the dialog triggers exactly one DELETE call to
//      `/api/webhooks/:id` for the webhook being deleted.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

// Toast helpers: silence side effects.
vi.mock("@/lib/toast-helper", () => ({
  showErrorToast: vi.fn(),
  showInfoToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showWarningToast: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

// WebhookWizardModal and WebhookHistoryDrawer pull in heavier
// dependencies (rich-text editors, drawer markup) that aren't
// relevant here — the dialogs they own never open in this test.
vi.mock("../WebhookWizardModal", () => ({
  default: () => null,
}));

vi.mock("../WebhookHistoryDrawer", () => ({
  default: () => null,
}));

// Capture every fetch call so we can assert presence/absence of the
// DELETE call gated behind the new confirmation dialog. The Webhooks
// section uses raw `fetch` (not `apiRequest`) for its mutations.
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

import WebhooksSection from "../WebhooksSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let originalFetch: typeof fetch;

const webhook = {
  id: 42,
  name: "Ops Slack Channel",
  description: "Posts deploy alerts to #ops",
  serviceType: "slack" as const,
  endpointUrl: "https://hooks.slack.com/services/T000/B000/XXX",
  template: "{}",
  headers: null,
  isActive: true,
  retryEnabled: true,
  maxRetries: 3,
  timeoutMs: 5000,
  createdBy: "ui-test-admin",
  createdAt: new Date("2025-01-02").toISOString(),
  updatedAt: new Date("2025-01-02").toISOString(),
  creatorName: "UI Test Admin",
  hasSigningSecret: false,
};

beforeEach(() => {
  fetchMock.mockClear();
  // Default fetch behaviour: succeed with an empty body. Specific
  // tests inspect the calls via fetchMock.mock.calls below.
  fetchMock.mockImplementation(async () => {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof fetch;

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  // Pre-seed the exact query key the section reads from so no
  // network call fires during the initial render.
  queryClient.setQueryData(["/api/webhooks"], { webhooks: [webhook] });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  queryClient.clear();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function render() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WebhooksSection activeTab="webhooks" />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  });
}

// The "Delete" action is rendered both as an inline icon button
// (Trash2 -> svg.lucide-trash-2) and as a dropdown menu item.
// happy-dom doesn't enforce CSS, so the inline button is always
// present in the DOM regardless of viewport collapse rules.
function deleteButtonForWebhook(): HTMLButtonElement {
  const svg = container.querySelector("button svg.lucide-trash-2");
  if (!svg) {
    throw new Error("Could not find Delete (Trash2) inline button in the row");
  }
  const button = svg.closest("button");
  if (!button) {
    throw new Error("Trash2 svg has no parent <button>");
  }
  return button as HTMLButtonElement;
}

function findConfirmationDialog(): HTMLElement | null {
  // The shared ConfirmationDialog renders a Radix AlertDialog with
  // the title "Delete webhook?". We locate it by that title text so
  // the assertion lines up with what an operator actually sees and
  // catches any regression that swaps in a custom AlertDialog with a
  // different title (the historical "Delete Webhook" wording, for
  // example).
  const candidates = Array.from(document.body.querySelectorAll("*"));
  const titleEl = candidates.find(
    (el) => el.textContent?.trim() === "Delete webhook?",
  );
  if (!titleEl) return null;
  return (
    (titleEl.closest("[role='alertdialog']") as HTMLElement | null) ??
    (titleEl.parentElement?.parentElement as HTMLElement | null) ??
    null
  );
}

function findButtonByText(scope: ParentNode, text: string): HTMLButtonElement | null {
  const buttons = Array.from(scope.querySelectorAll("button"));
  return (buttons.find((b) => b.textContent?.trim() === text) ?? null) as HTMLButtonElement | null;
}

function deleteCallCount(): number {
  return fetchMock.mock.calls.filter(([url, init]) => {
    const method = (init as RequestInit | undefined)?.method;
    return (
      typeof url === "string" &&
      url.startsWith("/api/webhooks/") &&
      !url.includes("/test") &&
      !url.includes("/toggle") &&
      method === "DELETE"
    );
  }).length;
}

describe("WebhooksSection — delete confirmation (Task #666)", () => {
  it("opens the shared destructive ConfirmationDialog instead of deleting immediately when 'Delete' is clicked", () => {
    render();

    const deleteBtn = deleteButtonForWebhook();

    // Clicking the row action MUST NOT fire the DELETE network
    // call directly — the whole point of this task is that it now
    // requires a second confirmation step using the shared dialog.
    act(() => {
      deleteBtn.click();
    });

    expect(deleteCallCount(), "Clicking 'Delete' must NOT fire the DELETE call directly").toBe(0);

    // Instead, the shared ConfirmationDialog should now be open with
    // the question-style title used by the rest of the Communications
    // area ("Delete webhook?"). The legacy AlertDialog used a
    // statement-style title ("Delete Webhook"), so checking for the
    // question-mark title also catches a regression to the old
    // bespoke dialog.
    const dialog = findConfirmationDialog();
    expect(dialog, "ConfirmationDialog with title 'Delete webhook?' should be open").toBeTruthy();

    // The description should name the webhook being deleted so an
    // operator can sanity-check what they're about to remove.
    expect(dialog!.textContent).toContain('"Ops Slack Channel"');
    expect(dialog!.textContent).toContain("permanently delete");

    // The confirm button should be the destructive "Delete webhook"
    // action — mirrors the email-design / email-template dialogs.
    const confirmBtn = findButtonByText(dialog!, "Delete webhook");
    expect(confirmBtn, "Confirm button labeled 'Delete webhook' should be present").toBeTruthy();
    // Destructive variant uses the destructive palette; we lock the
    // colour signal that operators rely on to recognise the
    // destructive action.
    expect(confirmBtn!.className).toMatch(/(destructive|red)/);

    expect(findButtonByText(dialog!, "Cancel"), "Cancel button should be present").toBeTruthy();
  });

  it("cancelling the dialog leaves the webhook intact (no DELETE call)", () => {
    render();

    act(() => {
      deleteButtonForWebhook().click();
    });

    const dialog = findConfirmationDialog();
    expect(dialog).toBeTruthy();

    const cancelBtn = findButtonByText(dialog!, "Cancel")!;
    act(() => {
      cancelBtn.click();
    });

    // Dialog should be gone.
    expect(findConfirmationDialog(), "Dialog should close after Cancel").toBeNull();

    // And critically: NO DELETE call should have fired.
    expect(deleteCallCount(), "Cancelling the confirmation must NOT issue a DELETE call").toBe(0);
  });

  it("confirming the dialog issues exactly one DELETE call for the webhook being deleted", async () => {
    render();

    act(() => {
      deleteButtonForWebhook().click();
    });

    const dialog = findConfirmationDialog();
    expect(dialog).toBeTruthy();

    // The destructive confirm button is the only "Delete webhook"
    // labelled button on the page (the row's inline Trash2 button is
    // icon-only). Search the entire document.body so we don't depend
    // on Radix's portal markup landing inside our dialog scope.
    const confirmBtn = findButtonByText(document.body, "Delete webhook")!;
    expect(confirmBtn, "Confirm 'Delete webhook' button should be present").toBeTruthy();
    act(() => {
      confirmBtn.click();
    });

    // The mutation enqueues the fetch call on a microtask via
    // react-query, so we need to flush the microtask queue before
    // asserting. A few ticks: one for the mutation's internal setup,
    // one for the actual fetch invocation, one for the response
    // promise.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const deleteCalls = fetchMock.mock.calls.filter(([url, init]) => {
      const method = (init as RequestInit | undefined)?.method;
      return (
        typeof url === "string" &&
        url.startsWith("/api/webhooks/") &&
        !url.includes("/test") &&
        !url.includes("/toggle") &&
        method === "DELETE"
      );
    });
    expect(deleteCalls, "Confirming the dialog should issue exactly one DELETE call").toHaveLength(1);
    expect(deleteCalls[0][0]).toBe(`/api/webhooks/${webhook.id}`);

    // Post-success UX: the dialog must close (pending-delete state
    // resets) once the operator confirms. Without this the dialog
    // would linger and a second click on "Delete webhook" could fire
    // a duplicate DELETE — exactly the regression this confirmation
    // pattern is meant to prevent.
    expect(
      findConfirmationDialog(),
      "Dialog should close after a successful confirm",
    ).toBeNull();
  });
});
