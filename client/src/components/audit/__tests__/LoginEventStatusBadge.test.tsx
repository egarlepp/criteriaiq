// @vitest-environment happy-dom
//
// Behavior contract for <LoginEventStatusBadge />: the per-event list
// in the Login Audit Report must reflect the row's actual `success`
// flag instead of always claiming "Success" (Task #626). Once Task
// #602 starts recording failed password attempts, those rows must
// render a clearly distinct "Failed" badge.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { LoginEventStatusBadge } from "../LoginEventStatusBadge";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode) {
  act(() => {
    root.render(node);
  });
}

function badge(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    "[data-testid='login-event-status-badge']",
  );
  if (!el) throw new Error("status badge not rendered");
  return el;
}

describe("<LoginEventStatusBadge />", () => {
  it("renders a green Success badge when success === true", () => {
    render(<LoginEventStatusBadge success={true} />);

    expect(badge().textContent).toContain("Success");
    expect(badge().getAttribute("data-login-success")).toBe("true");
    expect(badge().className).toContain("text-green-600");
  });

  it("renders a red Failed badge when success === false", () => {
    render(<LoginEventStatusBadge success={false} />);

    expect(badge().textContent).toContain("Failed");
    expect(badge().getAttribute("data-login-success")).toBe("false");
    expect(badge().className).toContain("text-red-600");
  });

  it("treats null/undefined as success so legacy rows stay green", () => {
    // The `audit_logins.success` column defaults to `true` in the
    // schema, but historic rows can still come back as null. Those
    // must not be mislabeled as failures.
    render(<LoginEventStatusBadge success={null} />);
    expect(badge().textContent).toContain("Success");

    act(() => root.render(<LoginEventStatusBadge success={undefined} />));
    expect(badge().textContent).toContain("Success");
  });

  it("renders the right badge for each row when a mixed list is mounted", () => {
    // This mirrors how the Login Audit Report's event list iterates
    // over `auditData` — a mix of successes and failures must each
    // get the correct badge instead of all rows showing "Success".
    render(
      <ul>
        {[
          { id: 1, success: true },
          { id: 2, success: false },
          { id: 3, success: null },
        ].map((row) => (
          <li key={row.id} data-testid={`row-${row.id}`}>
            <LoginEventStatusBadge success={row.success} />
          </li>
        ))}
      </ul>,
    );

    const row1 = container.querySelector("[data-testid='row-1']");
    const row2 = container.querySelector("[data-testid='row-2']");
    const row3 = container.querySelector("[data-testid='row-3']");

    expect(row1?.textContent).toContain("Success");
    expect(row2?.textContent).toContain("Failed");
    expect(row3?.textContent).toContain("Success");

    // Sanity: the failure row must NOT silently show as success.
    expect(row2?.textContent).not.toContain("Success");
  });
});
