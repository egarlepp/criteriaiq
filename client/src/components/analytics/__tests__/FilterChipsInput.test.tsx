import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { FilterChipsInput } from "../FilterChipsInput";

// Tell React we're inside a controlled `act`-aware environment so it
// stops warning about state updates happening outside `act`.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

// Lightweight mount helper. We deliberately don't pull in
// `@testing-library/react` here because it isn't installed at the
// project root and trying to add it conflicts with the project's
// React 19 / TypeScript 5 peer ranges. Driving the component with
// `react-dom/client` directly keeps these UI-level checks runnable
// against the existing happy-dom + Vitest setup.
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

function input(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    '[data-testid="chips"]',
  );
  if (!el) throw new Error("chip input not rendered");
  return el;
}

function chipText(idx: number): string {
  const el = container.querySelector(`[data-testid="chips-chip-${idx}"]`);
  return el?.textContent?.trim() ?? "";
}

function setDraft(value: string) {
  const el = input();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressEnter() {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

function pressComma() {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: ",", bubbles: true }),
    );
  });
}

function blur() {
  const el = input();
  // Native focus then blur so React's synthetic onBlur listener fires.
  // Plain `dispatchEvent("blur")` doesn't bubble and React's delegated
  // listener attached to the root won't pick it up.
  act(() => {
    el.focus();
  });
  act(() => {
    el.blur();
  });
}

function paste(text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  act(() => {
    input().dispatchEvent(event);
  });
}

describe("FilterChipsInput", () => {
  it("emits a real string[] on Enter", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput value={[]} onChange={onChange} testIdPrefix="chips" />,
    );

    setDraft("alpha");
    pressEnter();

    expect(onChange).toHaveBeenLastCalledWith(["alpha"]);
    expect(Array.isArray(onChange.mock.calls[0][0])).toBe(true);
  });

  it("keeps a comma inside a chip instead of splitting on it", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput value={[]} onChange={onChange} testIdPrefix="chips" />,
    );

    setDraft("Smith, John");
    pressEnter();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(["Smith, John"]);
    expect(chipText(0)).toContain("Smith, John");
  });

  it("does not commit on a comma keypress", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput value={[]} onChange={onChange} testIdPrefix="chips" />,
    );

    setDraft("alpha,beta");
    pressComma();

    expect(onChange).not.toHaveBeenCalled();
    expect(input().value).toBe("alpha,beta");
  });

  it("loads a legacy comma-string value as separate chips", () => {
    render(
      <FilterChipsInput
        value="alpha, beta, gamma"
        onChange={vi.fn()}
        testIdPrefix="chips"
      />,
    );

    expect(chipText(0)).toContain("alpha");
    expect(chipText(1)).toContain("beta");
    expect(chipText(2)).toContain("gamma");
  });

  it("loads an array value as chips without round-tripping through the parent", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput
        value={["alpha", "beta"]}
        onChange={onChange}
        testIdPrefix="chips"
      />,
    );

    expect(chipText(0)).toContain("alpha");
    expect(chipText(1)).toContain("beta");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("commits the draft as a single chip when blurred", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput value={[]} onChange={onChange} testIdPrefix="chips" />,
    );

    setDraft("Smith, John");
    blur();

    expect(onChange).toHaveBeenLastCalledWith(["Smith, John"]);
  });

  it("removes a chip and emits the trimmed array", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput
        value={["alpha", "beta", "gamma"]}
        onChange={onChange}
        testIdPrefix="chips"
      />,
    );

    const removeBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="chips-chip-1-remove"]',
    );
    expect(removeBtn).not.toBeNull();
    act(() => {
      removeBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onChange).toHaveBeenLastCalledWith(["alpha", "gamma"]);
  });

  it("splits a multi-line paste into one chip per line (commas stay literal)", () => {
    const onChange = vi.fn();
    render(
      <FilterChipsInput value={[]} onChange={onChange} testIdPrefix="chips" />,
    );

    paste("Smith, John\nDoe, Jane\nplain");

    expect(onChange).toHaveBeenLastCalledWith([
      "Smith, John",
      "Doe, Jane",
      "plain",
    ]);
  });
});
