// @vitest-environment happy-dom
//
// UI smoke test for the email-template delete confirmation flow
// introduced by Task #657. Mirrors the email-design pattern that
// task #649 locked in (see
// `email-designs/__tests__/EmailDesignsSection.default-badge.test.tsx`).
//
// What this locks:
//   1. Clicking the row-level "Delete template" action does NOT fire
//      the DELETE call immediately — instead it opens a
//      ConfirmationDialog naming the template and using the
//      destructive variant.
//   2. Cancelling the dialog leaves the template intact (no DELETE).
//   3. Confirming the dialog triggers exactly one DELETE call to
//      `/api/email-templates/:id` for the template being deleted.
//
// We render the real `EmailTemplatesSection` against a pre-seeded React
// Query cache and stub `apiRequest` so we can assert which network
// call was issued (and which was NOT) on each interaction.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "ui-test-admin", email: "ui-test@example.com", role: "Admin" },
    effectiveUser: null,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ userRole: "Admin" }),
}));

// EmailContentEditor pulls in heavy editor deps (Tiptap etc.) we
// don't need for this test — the dialog body never opens here.
vi.mock("@/components/communications/email-templates/EmailContentEditor", () => ({
  EmailContentEditor: () => null,
}));

vi.mock("@/lib/toast-helper", () => ({
  showErrorToast: vi.fn(),
  showInfoToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showWarningToast: vi.fn(),
}));

// Capture every apiRequest call so we can assert presence/absence of
// the DELETE call gated behind the new confirmation dialog.
const apiRequestMock = vi.fn(async (_method: string, _url: string, _body?: unknown) => {
  // Default: return an empty payload — the section's seeded queries
  // are read straight out of the React Query cache (see beforeEach),
  // so this fallback only fires for ad-hoc requests we don't seed.
  return [] as unknown;
});

vi.mock("@/lib/queryClient", () => ({
  apiRequest: (...args: unknown[]) => apiRequestMock(...(args as [string, string, unknown?])),
}));

import EmailTemplatesSection from "../EmailTemplatesSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const userTemplate = {
  id: 101,
  name: "My Custom Template",
  description: "A user-owned template",
  templateKey: "my_custom_template",
  category: "Communication",
  subject: "Hello",
  emailContent: "<p>{{BODY_TEXT_CONTENT}}</p>",
  variables: [],
  isActive: true,
  isSystem: false,
  includeProjectPdf: false,
  emailType: "transactional",
  recipientType: "user",
  triggerEvents: [],
  createdAt: new Date("2025-01-02").toISOString(),
  updatedAt: new Date("2025-01-02").toISOString(),
  createdBy: "ui-test-admin",
  designId: null,
};

beforeEach(() => {
  apiRequestMock.mockClear();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  // Pre-seed the exact query keys the section reads from so no
  // network call fires during render.
  queryClient.setQueryData(["/api/email-templates"], [userTemplate]);
  queryClient.setQueryData(["/api/email-designs?active=true"], []);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  queryClient.clear();
  vi.restoreAllMocks();
});

function render() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <EmailTemplatesSection activeTab="email-templates" />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  });
}

// Templates are bucketed into category sub-sections. They render
// open by default (b8b77f83 switched from expand-on-click to a
// collapsedCategories set), so only click the header when it shows
// the "collapsed" chevron — clicking an open header would hide the
// cards this test needs.
function expandCategory(categoryName: string): void {
  const buttons = Array.from(container.querySelectorAll("button"));
  const header = buttons.find((b) => {
    const span = b.querySelector("span.text-sm.font-semibold");
    return span?.textContent?.trim() === categoryName;
  });
  if (!header) {
    throw new Error(`Could not find category header button for "${categoryName}"`);
  }
  if (!header.querySelector("svg.lucide-chevron-down")) return;
  act(() => {
    header.click();
  });
}

// Locate the per-template Card whose name span contains the given
// template name. Templates are rendered as Card elements containing
// a `<span class="text-sm font-medium truncate">` with the name (see
// EmailTemplatesSection.tsx around the per-template Card render).
function cardForTemplate(name: string): HTMLElement {
  const spans = Array.from(container.querySelectorAll("span.text-sm.font-medium.truncate"));
  const nameSpan = spans.find((s) => s.textContent?.trim() === name);
  if (!nameSpan) {
    throw new Error(`Could not find template card for "${name}"`);
  }
  // Walk up to the surrounding Card root.
  const card = nameSpan.closest("[class*='border-l-blue-500']");
  if (!card) {
    throw new Error(`Could not find card wrapper for "${name}"`);
  }
  return card as HTMLElement;
}

// The "Delete template" action is rendered both as an inline icon
// button (Trash2 lucide -> svg.lucide-trash-2) and as a dropdown
// menu item. happy-dom doesn't enforce CSS, so the inline button is
// always present in the DOM and we can click it directly regardless
// of viewport collapse rules.
function deleteButtonForCard(card: HTMLElement): HTMLButtonElement {
  const svg = card.querySelector("button svg.lucide-trash-2");
  if (!svg) {
    throw new Error("Could not find Delete (Trash2) inline button in card");
  }
  const button = svg.closest("button");
  if (!button) {
    throw new Error("Trash2 svg has no parent <button>");
  }
  return button as HTMLButtonElement;
}

function findConfirmationDialog(): HTMLElement | null {
  // ConfirmationDialog renders a Radix AlertDialog with the title
  // "Delete email template?". We locate it by that title text so the
  // assertion lines up with what an operator actually sees.
  const headings = Array.from(document.body.querySelectorAll("*"));
  const titleEl = headings.find(
    (el) => el.textContent?.trim() === "Delete email template?",
  );
  if (!titleEl) return null;
  return (titleEl.closest("[role='alertdialog']") as HTMLElement | null) ?? (titleEl.parentElement?.parentElement as HTMLElement | null) ?? null;
}

function findButtonByText(scope: ParentNode, text: string): HTMLButtonElement | null {
  const buttons = Array.from(scope.querySelectorAll("button"));
  return (buttons.find((b) => b.textContent?.trim() === text) ?? null) as HTMLButtonElement | null;
}

function deleteCallCount(): number {
  return apiRequestMock.mock.calls.filter(
    ([method, url]) => method === "DELETE" && typeof url === "string" && url.startsWith("/api/email-templates/"),
  ).length;
}

describe("EmailTemplatesSection — delete confirmation (Task #657)", () => {
  it("opens a destructive ConfirmationDialog instead of deleting immediately when 'Delete template' is clicked", () => {
    render();
    expandCategory("Communication");

    const card = cardForTemplate("My Custom Template");
    const deleteBtn = deleteButtonForCard(card);

    // Clicking the row action MUST NOT fire the DELETE network
    // call directly — the whole point of this task is that it now
    // requires a second confirmation step.
    act(() => {
      deleteBtn.click();
    });

    expect(deleteCallCount(), "Clicking 'Delete template' must NOT fire the DELETE call directly").toBe(0);

    // Instead, the ConfirmationDialog should now be open.
    const dialog = findConfirmationDialog();
    expect(dialog, "ConfirmationDialog with title 'Delete email template?' should be open").toBeTruthy();

    // The description should name the template being deleted so an
    // operator can sanity-check what they're about to remove.
    expect(dialog!.textContent).toContain('"My Custom Template"');
    expect(dialog!.textContent).toContain("permanently delete");

    // The confirm button should be the destructive "Delete template"
    // action — mirrors the email-design dialog.
    const confirmBtn = findButtonByText(dialog!, "Delete template");
    expect(confirmBtn, "Confirm button labeled 'Delete template' should be present").toBeTruthy();
    // Destructive variant uses the red palette; we lock the colour
    // signal that operators rely on to recognise the destructive
    // action.
    expect(confirmBtn!.className).toMatch(/(red|destructive)/);

    expect(findButtonByText(dialog!, "Cancel"), "Cancel button should be present").toBeTruthy();
  });

  it("cancelling the dialog leaves the template intact (no DELETE call)", () => {
    render();
    expandCategory("Communication");

    const card = cardForTemplate("My Custom Template");
    act(() => {
      deleteButtonForCard(card).click();
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

  it("confirming the dialog issues exactly one DELETE call for the template being deleted", async () => {
    render();
    expandCategory("Communication");

    const card = cardForTemplate("My Custom Template");
    act(() => {
      deleteButtonForCard(card).click();
    });

    const dialog = findConfirmationDialog();
    expect(dialog).toBeTruthy();

    // The destructive confirm button is the only "Delete template"
    // labelled button on the page (the row's inline Trash2 button is
    // icon-only). Search the entire document.body so we don't depend
    // on Radix's portal markup landing inside our dialog scope.
    const confirmBtn = findButtonByText(document.body, "Delete template")!;
    expect(confirmBtn, "Confirm 'Delete template' button should be present").toBeTruthy();
    act(() => {
      confirmBtn.click();
    });

    // The mutation enqueues the apiRequest call on a microtask via
    // react-query, so we need to flush the microtask queue before
    // asserting. Two ticks: one for the mutation's internal setup,
    // one for the actual fetch invocation.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const deleteCalls = apiRequestMock.mock.calls.filter(
      ([method, url]) => method === "DELETE" && typeof url === "string" && url.startsWith("/api/email-templates/"),
    );
    expect(deleteCalls, "Confirming the dialog should issue exactly one DELETE call").toHaveLength(1);
    expect(deleteCalls[0][1]).toBe(`/api/email-templates/${userTemplate.id}`);
  });
});
