// @vitest-environment happy-dom
//
// UI smoke test for the default-email-design lifecycle introduced by
// Task #589 (and tested end-to-end on the server side by
// `server/__tests__/default-email-design-lifecycle.test.ts`).
//
// What this locks:
//   1. The green "Default" badge renders for the row whose
//      `isDefault === true` and is absent on every other row.
//   2. The "Set as default" action is rendered for an active,
//      non-default design and is HIDDEN on the row that is already
//      the default.
//   3. The "Delete design" action is rendered for a user-owned,
//      non-default, non-system design and is HIDDEN on the row that
//      is currently the default (the server-side guard returns 400 in
//      that case — Task #589 — so the UI must not even offer the
//      action).
//
// We render the real `EmailDesignsSection` against a pre-seeded React
// Query cache so the component code that builds the action-menu
// `actions` array (and stamps the `Default` badge) is the code under
// test — not a re-implementation in the test.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

// useAuth: the section uses `user.id` to bucket "My Designs" vs
// "Other Designs". We stub a fixed admin so the user-owned row lands
// in "My Designs" and the system row lands in "System Designs".
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

// EmailDesignEditor pulls in heavy editor deps (Tiptap etc.) we don't
// need for this rendering smoke test. Replace it with a thin stub so
// the import graph stays light.
vi.mock("@/components/communications/email-templates/EmailDesignEditor", () => ({
  EmailDesignEditor: () => null,
}));

// Toast helper: silence side effects.
vi.mock("@/lib/toast-helper", () => ({
  showErrorToast: vi.fn(),
  showInfoToast: vi.fn(),
  showSuccessToast: vi.fn(),
  showWarningToast: vi.fn(),
}));

import EmailDesignsSection from "../EmailDesignsSection";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

// Four representative rows that exercise every visibility branch we
// care about for the default-design lifecycle.
const designs = [
  {
    id: 1,
    name: "CriteriaIQ Default",
    description: "Seeded default wrapper",
    htmlRaw: "<html>{{BODY_TEXT_CONTENT}}</html>",
    isActive: true,
    isSystem: false,
    isDefault: true,
    designVariables: {},
    createdBy: null,
    createdAt: new Date("2025-01-01").toISOString(),
    updatedAt: new Date("2025-01-01").toISOString(),
  },
  {
    id: 2,
    name: "My Custom Design",
    description: "A user-owned design",
    htmlRaw: "<html>{{BODY_TEXT_CONTENT}}</html>",
    isActive: true,
    isSystem: false,
    isDefault: false,
    designVariables: {},
    createdBy: "ui-test-admin",
    createdAt: new Date("2025-01-02").toISOString(),
    updatedAt: new Date("2025-01-02").toISOString(),
  },
  {
    id: 3,
    name: "Legacy System Design",
    description: "Built-in system design",
    htmlRaw: "<html>{{BODY_TEXT_CONTENT}}</html>",
    isActive: true,
    isSystem: true,
    isDefault: false,
    designVariables: {},
    createdBy: null,
    createdAt: new Date("2024-12-01").toISOString(),
    updatedAt: new Date("2024-12-01").toISOString(),
  },
  {
    id: 4,
    name: "Disabled Design",
    description: "Inactive design",
    htmlRaw: "<html>{{BODY_TEXT_CONTENT}}</html>",
    isActive: false,
    isSystem: false,
    isDefault: false,
    designVariables: {},
    createdBy: "ui-test-admin",
    createdAt: new Date("2024-11-01").toISOString(),
    updatedAt: new Date("2024-11-01").toISOString(),
  },
];

beforeEach(() => {
  container = document.createElement("div");
  // happy-dom defaults to a narrow viewport. The `ResponsiveTableActionsMenu`
  // hides the inline buttons behind a `md:` breakpoint and swaps in a
  // collapsed dropdown trigger on small screens. To assert presence /
  // absence of the actual action *labels* we use the dropdown markup
  // (which always renders the label text in the DOM) — see the
  // assertions below.
  document.body.appendChild(container);
  root = createRoot(container);

  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });

  // Pre-seed the cache for the exact key the section reads from
  // (`['/api/email-designs']`). With `staleTime: Infinity` and
  // `retry: false` no network call will fire, so we don't need to
  // mock fetch at all.
  queryClient.setQueryData(["/api/email-designs"], designs);
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
          <EmailDesignsSection activeTab="email-designs" />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  });
}

// Locate the SortableTable row that contains the given visible
// design name. The section spreads designs across four collapsible
// sections (My / Other / System / Inactive) so a global text query
// would be ambiguous — narrow to the row that holds the name.
function rowForDesign(name: string): HTMLElement {
  const cells = Array.from(container.querySelectorAll("td, th"));
  const nameCell = cells.find((cell) => {
    return (
      cell.tagName === "TD" &&
      cell.textContent?.trim().startsWith(name)
    );
  });
  if (!nameCell) {
    throw new Error(`Could not find table cell for design "${name}"`);
  }
  const row = nameCell.closest("tr");
  if (!row) {
    throw new Error(`Could not find <tr> for design "${name}"`);
  }
  return row as HTMLElement;
}

describe("EmailDesignsSection — default-design lifecycle UI (Task #589)", () => {
  it("renders the green 'Default' badge only on the row that is currently the default", () => {
    render();

    const defaultRow = rowForDesign("CriteriaIQ Default");
    const customRow = rowForDesign("My Custom Design");
    const systemRow = rowForDesign("Legacy System Design");

    // The Default badge sits inside the name cell next to the design
    // name. We scope the lookup to that row to avoid false positives
    // from other rows.
    const defaultBadge = Array.from(defaultRow.querySelectorAll("*"))
      .find((el) => el.textContent?.trim() === "Default");
    expect(defaultBadge, "Default badge should render on the default row").toBeTruthy();

    // Tailwind color contract from EmailDesignsSection.tsx (~line 1025):
    //   `bg-emerald-50 text-emerald-700 border-emerald-200 …`
    // If anyone re-themes the badge to a non-green palette this fails
    // — the green colour is the visual signal operators look for.
    expect(defaultBadge!.className).toMatch(/emerald/);

    // Other rows must NOT carry the Default badge.
    for (const row of [customRow, systemRow]) {
      const stray = Array.from(row.querySelectorAll("*"))
        .find((el) => el.textContent?.trim() === "Default");
      expect(stray, `Default badge should NOT render on "${row.textContent?.slice(0, 30)}…"`).toBeFalsy();
    }
  });

  // ResponsiveTableActionsMenu always renders the per-action inline
  // <Button><Icon /></Button> markup AND a fallback <DropdownMenu>.
  // The dropdown's <DropdownMenuItem> labels are only mounted when
  // the menu is open (Radix portal behaviour) and happy-dom can't
  // reliably trigger Radix's open transitions, so we assert against
  // the inline buttons instead. Each inline button renders a
  // lucide-react SVG whose stable class signature ("lucide-<name>")
  // uniquely identifies the action regardless of viewport / theme.
  function rowHasActionIcon(row: HTMLElement, lucideClass: string): boolean {
    // Scope to <button> children specifically — the row also stamps a
    // Star icon inside the "Default" badge for the default row, which
    // we do NOT want to confuse with the Star icon on the
    // "Set as default" action button.
    return row.querySelector(`button svg.${lucideClass}`) !== null;
  }

  it("hides 'Set as default' on the current default row but exposes it on a non-default active row", () => {
    render();

    const defaultRow = rowForDesign("CriteriaIQ Default");
    const customRow = rowForDesign("My Custom Design");

    // The "Set as default" action uses the Star icon
    // (lucide-react). Its presence in a row's actions cell is the
    // user-visible signal that the action is exposed.
    expect(rowHasActionIcon(customRow, "lucide-star"), "Set as default should be exposed on the non-default active row").toBe(true);
    expect(rowHasActionIcon(defaultRow, "lucide-star"), "Set as default should be HIDDEN on the current default row").toBe(false);
  });

  it("hides 'Delete design' on the current default row and on system rows but exposes it on a user-owned non-default row", () => {
    render();

    const defaultRow = rowForDesign("CriteriaIQ Default");
    const customRow = rowForDesign("My Custom Design");
    const systemRow = rowForDesign("Legacy System Design");

    // The "Delete design" action uses the Trash2 icon
    // (lucide-react -> svg.lucide-trash-2). Same icon-presence
    // contract as above.
    expect(rowHasActionIcon(customRow, "lucide-trash-2"), "Delete design should be exposed on the user-owned non-default row").toBe(true);
    expect(rowHasActionIcon(defaultRow, "lucide-trash-2"), "Delete design should be HIDDEN on the current default row").toBe(false);
    expect(rowHasActionIcon(systemRow, "lucide-trash-2"), "Delete design should be HIDDEN on system rows").toBe(false);
  });

  function sectionContainerForLabel(label: string): HTMLElement {
    const wrappers = Array.from(
      container.querySelectorAll("div.border.rounded-lg.overflow-hidden"),
    ) as HTMLElement[];
    const wrapper = wrappers.find((w) => {
      const btn = w.querySelector(":scope > button");
      return btn?.textContent?.includes(label) ?? false;
    });
    if (!wrapper) {
      throw new Error(`Could not find CollapsibleSection wrapper for label "${label}"`);
    }
    return wrapper;
  }

  function sectionContainsDesignName(sectionEl: HTMLElement, name: string): boolean {
    const cells = Array.from(sectionEl.querySelectorAll("td"));
    return cells.some((c) => c.textContent?.trim().startsWith(name));
  }

  it("groups the default wrapper under 'System Designs' and not 'Other Designs' (Task #680 Option B)", () => {
    render();

    const systemSection = sectionContainerForLabel("System Designs");
    const otherSection = sectionContainerForLabel("Other Designs");
    const mySection = sectionContainerForLabel("My Designs");

    expect(
      sectionContainsDesignName(systemSection, "CriteriaIQ Default"),
      "CriteriaIQ Default should appear under 'System Designs'",
    ).toBe(true);

    expect(
      sectionContainsDesignName(otherSection, "CriteriaIQ Default"),
      "CriteriaIQ Default must NOT appear under 'Other Designs'",
    ).toBe(false);

    expect(
      sectionContainsDesignName(mySection, "CriteriaIQ Default"),
      "CriteriaIQ Default must NOT appear under 'My Designs'",
    ).toBe(false);

    // Sanity: legacy is_system row is still there too.
    expect(
      sectionContainsDesignName(systemSection, "Legacy System Design"),
      "'Legacy System Design' (isSystem=true) should also appear under 'System Designs'",
    ).toBe(true);
  });
});
