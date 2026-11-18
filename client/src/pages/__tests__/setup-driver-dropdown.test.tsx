// @vitest-environment happy-dom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import i18n from "@/i18n";

vi.mock("@/components/ui/select", async () => {
  const ReactMod = await import("react");
  const Ctx = ReactMod.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  } | null>(null);

  function Select({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) {
    return (
      <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
    );
  }

  function SelectTrigger({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { id?: string }) {
    const ctx = ReactMod.useContext(Ctx)!;
    return (
      <div {...props} data-driver-value={ctx.value} role="combobox">
        {children}
      </div>
    );
  }

  function SelectValue() {
    return null;
  }

  function SelectContent({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }

  function SelectItem({
    value,
    children,
    ...rest
  }: { value: string; children: React.ReactNode } & Record<string, unknown>) {
    const ctx = ReactMod.useContext(Ctx)!;
    return (
      <button
        type="button"
        data-mock-select-option={value}
        onClick={() => ctx.onValueChange(value)}
        {...rest}
      >
        {typeof children === "string" ? children : value}
      </button>
    );
  }

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

const { default: Setup } = await import("../setup");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

beforeEach(async () => {
  await i18n.changeLanguage("en");

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/status")) {
      return jsonResponse({
        setupRequired: true,
        adminExists: false,
        publicAppUrl: "",
        hasSessionSecret: false,
        hasEncryptionKey: false,
        dbHealth: { reachable: true, lastErrorCode: null },
      });
    }
    if (url.includes("/api/version")) {
      return jsonResponse({ version: "v0.0.0-test" });
    }
    return jsonResponse({ success: true, latencyMs: 1 });
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
});

function render(ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}

function urlInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>("input#url");
  if (!el) throw new Error("connection URL input not rendered");
  return el;
}

function driverTrigger(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    '[data-testid="select-setup-driver"]',
  );
  if (!el) throw new Error("driver select trigger not rendered");
  return el;
}

function driverChoice(): string {
  return driverTrigger().getAttribute("data-driver-value") ?? "";
}

function setUrlValue(value: string) {
  const el = urlInput();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function setDriverValue(value: "auto" | "neon" | "pg") {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-testid="select-setup-driver-${value}"]`,
  );
  if (!button) {
    throw new Error(`driver option button "${value}" not rendered`);
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickButtonByText(text: string) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const button = buttons.find((b) => b.textContent?.trim() === text);
  if (!button) throw new Error(`button "${text}" not rendered`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickButtonByTestId(testId: string) {
  const button = container.querySelector<HTMLButtonElement>(
    `button[data-testid="${testId}"]`,
  );
  if (!button) throw new Error(`button [data-testid="${testId}"] not rendered`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flushAsyncEffects() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function lastFetchBodyFor(urlFragment: string): Record<string, unknown> {
  const calls = fetchMock.mock.calls.filter((call) => {
    const url = typeof call[0] === "string" ? call[0] : String(call[0]);
    return url.includes(urlFragment);
  });
  if (calls.length === 0) {
    throw new Error(`no fetch call matching ${urlFragment}`);
  }
  const last = calls[calls.length - 1]!;
  const init = last[1] as RequestInit | undefined;
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error(`fetch body for ${urlFragment} was not a JSON string`);
  }
  return JSON.parse(body) as Record<string, unknown>;
}

describe("Setup — Connect step Database Driver dropdown (task #483)", () => {
  it("forwards the selected dropdown value as ?driver=neon to /api/setup/test-connection", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    setDriverValue("neon");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
    );
    clickButtonByText(i18n.t("setup.connect.testButton"));
    await flushAsyncEffects();

    const body = lastFetchBodyFor("/api/setup/test-connection");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=neon");
  });

  it("forwards ?driver=pg to /api/setup/test-connection when the operator picks Standard Postgres", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    setDriverValue("pg");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
    );
    clickButtonByText(i18n.t("setup.connect.testButton"));
    await flushAsyncEffects();

    const body = lastFetchBodyFor("/api/setup/test-connection");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=pg");
  });

  it("leaves the URL untouched when the dropdown stays on Auto-detect", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
    );
    clickButtonByText(i18n.t("setup.connect.testButton"));
    await flushAsyncEffects();

    const body = lastFetchBodyFor("/api/setup/test-connection");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d");
    expect(String(body.connectionUrl)).not.toContain("driver=");
  });

  it("forwards ?driver=neon to /api/setup/initialize when Initialize is clicked", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d");
    setDriverValue("neon");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
    );
    clickButtonByText(i18n.t("setup.connect.testButton"));
    await flushAsyncEffects();

    clickButtonByTestId("button-continue-connect");
    await flushAsyncEffects();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: false, phases: [], errorCode: "test" }),
    );
    clickButtonByTestId("button-initialize");
    await flushAsyncEffects();

    const body = lastFetchBodyFor("/api/setup/initialize");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=neon");
  });

  it("populates the dropdown from a pasted URL that already carries ?driver=neon", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d?driver=neon");

    expect(driverChoice()).toBe("neon");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
    );
    clickButtonByText(i18n.t("setup.connect.testButton"));
    await flushAsyncEffects();

    const body = lastFetchBodyFor("/api/setup/test-connection");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=neon");
    const driverParams = new URL(
      body.connectionUrl as string,
    ).searchParams.getAll("driver");
    expect(driverParams).toEqual(["neon"]);
  });

  it("populates the dropdown from a pasted URL that already carries ?driver=pg", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d?driver=pg");
    expect(driverChoice()).toBe("pg");
  });

  it("falls back to Auto on a URL with no driver param", async () => {
    render(<Setup />);
    setUrlValue("postgres://u:p@h:5432/d?sslmode=require");
    expect(driverChoice()).toBe("auto");
  });
});
