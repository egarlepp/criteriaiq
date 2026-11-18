// @vitest-environment happy-dom
//
// Regression: usePermissions() returns a new canView function on every
// render. When the page index was memoized on it, the search callbacks
// changed every render and the search effect looped on setResults, so
// opening Global Search crashed with React error #185.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const user = { id: "u1", email: "admin@example.com", role: "Admin" };

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user, effectiveUser: user, isLoading: false, isAuthenticated: true }),
}));

// A fresh function per call, exactly like the real hook. Throws once the
// component has rendered far more often than opening it needs, so a render
// loop fails the test instead of hanging it.
let renders = 0;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => {
    if (++renders > 100) throw new Error("GlobalSearch is re-rendering in a loop");
    return { canView: () => true };
  },
}));

vi.mock("@/hooks/use-crm-provider", () => ({
  useCrmProvider: () => ({ provider: "salesforce", ready: true, isActive: (id: string) => id === "salesforce" }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/project", () => {}] as const,
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: vi.fn(async () => ({ json: async () => ({ results: [] }) })),
}));

import { GlobalSearch } from "../GlobalSearch";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  renders = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("GlobalSearch", () => {
  it("opens without an update loop", async () => {
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => { errors.push(args[0]); });
    await act(async () => { root.render(<GlobalSearch />); });
    expect(renders).toBeLessThan(100);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    await act(async () => { button!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });
    spy.mockRestore();
    expect(renders).toBeLessThan(100);
    expect(errors.filter((e) => /Maximum update depth|re-rendering in a loop/.test(String(e)))).toEqual([]);
    expect(document.querySelector("input")).not.toBeNull();
  });
});
