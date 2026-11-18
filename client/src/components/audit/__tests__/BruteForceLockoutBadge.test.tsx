// @vitest-environment happy-dom
//
// Behavior contract for <BruteForceLockoutBadge />: the Activity Log
// row for an `mfa_rate_limited` audit entry must render with a
// distinct icon, a "Brute-force lockout" label, and a tooltip
// explaining the rate-limiter's threshold so the brute-force pattern
// is impossible to miss (Task #619).

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { BruteForceLockoutBadge } from "../BruteForceLockoutBadge";

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
    "[data-testid='brute-force-lockout-badge']",
  );
  if (!el) throw new Error("brute-force lockout badge not rendered");
  return el;
}

describe("<BruteForceLockoutBadge />", () => {
  it("renders the 'Brute-force lockout' label and a red accent class", () => {
    render(<BruteForceLockoutBadge />);

    expect(badge().textContent).toContain("Brute-force lockout");
    // The red accent is what makes the row pop in the timeline; pin
    // it so a refactor doesn't silently demote it to the same gray
    // outline used by the generic "Failed" badge.
    expect(badge().className).toContain("text-red-800");
    expect(badge().className).toContain("border-red-400");
  });

  it("exposes the explanatory tooltip via title and aria-label", () => {
    render(<BruteForceLockoutBadge />);

    const expected =
      "5 failed MFA attempts in 15 minutes — account temporarily locked out";
    expect(badge().getAttribute("title")).toBe(expected);
    expect(badge().getAttribute("aria-label")).toBe(expected);
  });

  it("preserves the raw failureReason on the DOM for tests / tooling", () => {
    render(<BruteForceLockoutBadge />);
    expect(badge().getAttribute("data-failure-reason")).toBe("mfa_rate_limited");
  });

  it("renders an icon inside the badge so the lockout is recognizable at a glance", () => {
    render(<BruteForceLockoutBadge />);
    const svg = badge().querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
