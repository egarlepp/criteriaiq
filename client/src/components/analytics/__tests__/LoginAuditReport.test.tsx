import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// Mock `useQuery` so we can drive the audit report with deterministic
// data instead of standing up a QueryClient + intercepting `fetch`. The
// component only reads `data` and `isLoading` from the hook, so
// returning the shape it expects is enough.
const useQueryMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
}));

import { TooltipProvider } from "@/components/ui/tooltip";
import LoginAuditReport from "../LoginAuditReport";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  useQueryMock.mockReset();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(ui: React.ReactElement) {
  act(() => {
    // The audit report renders a Radix Tooltip around the back button,
    // which throws if no TooltipProvider is in scope. Wrap every render
    // so each test gets a real provider.
    root.render(<TooltipProvider>{ui}</TooltipProvider>);
  });
}

function setAuditData(data: Array<Record<string, unknown>>) {
  useQueryMock.mockReturnValue({ data, isLoading: false });
}

function textOf(selector: string): string {
  const el = container.querySelector(selector);
  return el?.textContent?.trim() ?? "";
}

function makeLogin(overrides: Partial<{
  id: number;
  userId: string;
  userEmail: string;
  userName: string;
  loginTime: string;
  loginMethod: string;
  success: boolean | null;
}> = {}) {
  return {
    id: 1,
    userId: "u1",
    userEmail: "user@example.com",
    userName: "User One",
    loginTime: new Date("2026-01-01T12:00:00Z").toISOString(),
    loginMethod: "password",
    success: true,
    ...overrides,
  };
}

describe("LoginAuditReport", () => {
  it("computes the success rate from the success column", () => {
    setAuditData([
      makeLogin({ id: 1, success: true }),
      makeLogin({ id: 2, success: true }),
      makeLogin({ id: 3, success: false }),
      makeLogin({ id: 4, success: false }),
    ]);

    render(<LoginAuditReport onBack={() => {}} />);

    // 2 of 4 succeeded → 50%, not the old hardcoded 100%.
    expect(
      textOf('[data-testid="login-audit-success-rate"]'),
    ).toBe("50%");
  });

  it("treats null/undefined success as a successful login", () => {
    setAuditData([
      makeLogin({ id: 1, success: null }),
      makeLogin({ id: 2, success: undefined as unknown as boolean }),
      makeLogin({ id: 3, success: false }),
    ]);

    render(<LoginAuditReport onBack={() => {}} />);

    // null/undefined are treated as success → 2 of 3 → 67%.
    expect(
      textOf('[data-testid="login-audit-success-rate"]'),
    ).toBe("67%");
  });

  it("counts only recovery-method logins in the recovery code stat", () => {
    setAuditData([
      makeLogin({ id: 1, loginMethod: "password" }),
      makeLogin({ id: 2, loginMethod: "mfa-totp" }),
      makeLogin({ id: 3, loginMethod: "mfa-recovery" }),
      makeLogin({ id: 4, loginMethod: "mfa-recovery" }),
      makeLogin({ id: 5, loginMethod: "passkey" }),
    ]);

    render(<LoginAuditReport onBack={() => {}} />);

    const card = container.querySelector('[data-testid="recovery-code-stat"]');
    expect(card).not.toBeNull();
    // Only the two `mfa-recovery` rows count — TOTP and password don't.
    expect(card!.querySelector(".text-2xl")?.textContent?.trim()).toBe("2");
  });

  it("renders the empty-state message when there is no data", () => {
    setAuditData([]);

    render(<LoginAuditReport onBack={() => {}} />);

    expect(container.textContent).toContain(
      "No login activity found for the selected date range.",
    );
    // Stat cards should not render when there is nothing to summarize.
    expect(
      container.querySelector('[data-testid="login-audit-success-rate"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="recovery-code-stat"]'),
    ).toBeNull();
  });

  it("invokes the onBack prop when the back button is clicked", () => {
    setAuditData([]);
    const onBack = vi.fn();

    render(<LoginAuditReport onBack={onBack} />);

    const backBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.includes("Back to Reports"));
    expect(backBtn).toBeDefined();

    act(() => {
      backBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
