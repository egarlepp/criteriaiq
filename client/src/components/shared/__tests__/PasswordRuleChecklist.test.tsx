import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD,
  ADMIN_PASSWORD_MIN_LENGTH,
  type AdminPasswordRuleId,
} from "@shared/admin-validation";

// Replace the i18n hook with a stub that returns the lookup key, so the
// checklist renders without pulling in the full i18next runtime. The test
// only cares about the per-rule `data-met` attribute, not the localized
// labels.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { PasswordRuleChecklist } from "../PasswordRuleChecklist";

// We mount the component with `react-dom/client` directly, matching the
// existing pattern in `FilterChipsInput.test.tsx`. `@testing-library/react`
// is not installed at the project root because adding it conflicts with
// the project's React 19 / TypeScript 5 peer ranges. The contract under
// test (per-rule `data-met` attributes) is plain DOM, so direct queries
// are sufficient.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

const ALL_RULES: AdminPasswordRuleId[] = [
  "length",
  "uppercase",
  "lowercase",
  "digit",
  "special",
];

function metMap(): Record<AdminPasswordRuleId, boolean> {
  const out = {} as Record<AdminPasswordRuleId, boolean>;
  for (const rule of ALL_RULES) {
    const row = container.querySelector(
      `[data-testid="admin-password-rule-${rule}"]`,
    );
    if (!row) {
      throw new Error(`rule row not rendered: ${rule}`);
    }
    out[rule] = row.getAttribute("data-met") === "true";
  }
  return out;
}

describe("PasswordRuleChecklist", () => {
  it("renders one row per rule with all flags off for an empty password", () => {
    render(<PasswordRuleChecklist password="" id="pw-rules" />);

    expect(metMap()).toEqual({
      length: false,
      uppercase: false,
      lowercase: false,
      digit: false,
      special: false,
    });
  });

  it("flips each rule's data-met from false to true exactly when its character class first appears", () => {
    // Start with a single lowercase letter — only the lowercase rule is met.
    render(<PasswordRuleChecklist password="a" id="pw-rules" />);
    expect(metMap()).toEqual({
      length: false,
      uppercase: false,
      lowercase: true,
      digit: false,
      special: false,
    });

    // Add an uppercase letter.
    render(<PasswordRuleChecklist password="aA" id="pw-rules" />);
    expect(metMap()).toEqual({
      length: false,
      uppercase: true,
      lowercase: true,
      digit: false,
      special: false,
    });

    // Add a digit.
    render(<PasswordRuleChecklist password="aA1" id="pw-rules" />);
    expect(metMap()).toEqual({
      length: false,
      uppercase: true,
      lowercase: true,
      digit: true,
      special: false,
    });

    // Add a special character. Length is still below the minimum.
    render(<PasswordRuleChecklist password="aA1!" id="pw-rules" />);
    expect(metMap()).toEqual({
      length: false,
      uppercase: true,
      lowercase: true,
      digit: true,
      special: true,
    });
  });

  it("flips the length rule on at the minimum length boundary", () => {
    // One char short of the minimum — every other class is satisfied but
    // `length` must still read as not met.
    const oneShort =
      "Aa1!" + "x".repeat(ADMIN_PASSWORD_MIN_LENGTH - 1 - "Aa1!".length);
    expect(oneShort.length).toBe(ADMIN_PASSWORD_MIN_LENGTH - 1);

    render(<PasswordRuleChecklist password={oneShort} id="pw-rules" />);
    expect(metMap().length).toBe(false);

    // Adding one more character flips `length` on without disturbing the
    // other rule rows.
    const justAtMin = oneShort + "y";
    expect(justAtMin.length).toBe(ADMIN_PASSWORD_MIN_LENGTH);

    render(<PasswordRuleChecklist password={justAtMin} id="pw-rules" />);
    expect(metMap()).toEqual({
      length: true,
      uppercase: true,
      lowercase: true,
      digit: true,
      special: true,
    });
  });

  it("marks every rule satisfied for a comfortably strong password", () => {
    const strong = "StrongPassw0rd!".padEnd(
      ADMIN_PASSWORD_MIN_LENGTH + ADMIN_PASSWORD_LENGTH_BONUS_THRESHOLD,
      "x",
    );
    render(<PasswordRuleChecklist password={strong} id="pw-rules" />);
    expect(metMap()).toEqual({
      length: true,
      uppercase: true,
      lowercase: true,
      digit: true,
      special: true,
    });
  });

  it("flips a rule back off when the matching characters are removed", () => {
    render(<PasswordRuleChecklist password="aA1!" id="pw-rules" />);
    expect(metMap()).toMatchObject({
      uppercase: true,
      digit: true,
      special: true,
    });

    // Drop the uppercase, digit, and special characters — only lowercase
    // should remain satisfied.
    render(<PasswordRuleChecklist password="a" id="pw-rules" />);
    expect(metMap()).toEqual({
      length: false,
      uppercase: false,
      lowercase: true,
      digit: false,
      special: false,
    });
  });

  it("uses the provided id on the checklist <ul> so aria-describedby can wire to it", () => {
    render(<PasswordRuleChecklist password="" id="my-rules-id" />);
    const list = container.querySelector(
      '[data-testid="admin-password-checklist"]',
    );
    expect(list).not.toBeNull();
    expect(list!.id).toBe("my-rules-id");
  });
});
