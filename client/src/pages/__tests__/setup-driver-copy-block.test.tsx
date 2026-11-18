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
let writeTextMock: ReturnType<typeof vi.fn>;
let dbReachable: boolean;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function statusBody() {
  return {
    setupRequired: true,
    adminExists: false,
    publicAppUrl: "",
    hasSessionSecret: false,
    hasEncryptionKey: false,
    dbHealth: { reachable: dbReachable, lastErrorCode: null },
  };
}

function secretsBody() {
  return {
    hasConnectionUrl: true,
    databaseUrlSource: "wizard",
    hasSessionSecret: false,
    sessionSecretSource: "none",
    sessionSecretValue: "",
    hasEncryptionKey: false,
    encryptionKeySource: "none",
    encryptionKeyValue: "",
    publicAppUrl: "",
    publicAppUrlSource: "default",
    smtpHostSource: "none",
  };
}

beforeEach(async () => {
  await i18n.changeLanguage("en");
  vi.useFakeTimers({ shouldAdvanceTime: true });

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  // Spy on navigator.clipboard.writeText so we can inspect the exact
  // payload safeCopyToClipboard pushed for the per-row Copy button.
  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });

  dbReachable = true;
  fetchMock = vi.fn();
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/status")) return jsonResponse(statusBody());
    if (url.includes("/api/version")) {
      return jsonResponse({ version: "v0.0.0-test" });
    }
    if (url.includes("/api/setup/secrets")) return jsonResponse(secretsBody());
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
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  vi.useRealTimers();
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
  if (!button) throw new Error(`driver option button "${value}" not rendered`);
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
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function advancePoll() {
  // /api/setup/status polls every 10s — advance the fake timer past one
  // cycle so the wizard re-reads dbHealth and updates dbUnreachable.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10_001);
  });
  await flushAsyncEffects();
}

async function navigateToSecretsThenForceUnreachable() {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ success: true, latencyMs: 5, tipKey: null }),
  );
  clickButtonByText(i18n.t("setup.connect.testButton"));
  await flushAsyncEffects();
  clickButtonByTestId("button-continue-connect");
  await flushAsyncEffects();
  fetchMock.mockResolvedValueOnce(
    jsonResponse({ success: true, phases: [{ phase: "connect", ok: true }] }),
  );
  clickButtonByTestId("button-initialize");
  await flushAsyncEffects();

  // Now force the live-DB probe to flip to unreachable so the
  // dbUnreachable banner the env-helper copy block exists for is
  // actually rendered while we click Copy. This exercises the exact
  // operator scenario from the task: copy block visible, banner up,
  // dropdown driving the URL.
  dbReachable = false;
  await advancePoll();

  if (!container.querySelector('[data-testid="callout-db-unreachable"]')) {
    throw new Error("dbUnreachable banner did not render after flipping reachable=false");
  }
  if (!container.querySelector('[data-testid="secrets-env-helper"]')) {
    throw new Error("env-helper panel not rendered on Secrets step");
  }
}

function databaseUrlClipboardPayload(): string {
  const calls = writeTextMock.mock.calls
    .map((args) => String(args[0] ?? ""))
    .filter((value) => value.startsWith("DATABASE_URL="));
  if (calls.length === 0) {
    throw new Error(
      `expected a DATABASE_URL clipboard write; got: ${JSON.stringify(
        writeTextMock.mock.calls,
      )}`,
    );
  }
  return calls[calls.length - 1]!;
}

describe("Setup — env-helper DATABASE_URL copy block driver wiring (task #485)", () => {
  it("includes ?driver=neon in the clipboard payload when the dropdown is set to Neon WebSocket", async () => {
    render(<Setup />);
    await flushAsyncEffects();

    setUrlValue("postgres://u:p@h:5432/d");
    setDriverValue("neon");
    await navigateToSecretsThenForceUnreachable();

    clickButtonByTestId("button-copy-env-DATABASE_URL");
    await flushAsyncEffects();

    const payload = databaseUrlClipboardPayload();
    expect(payload).toBe("DATABASE_URL=postgres://u:p@h:5432/d?driver=neon");
    const driverParams = new URL(
      payload.slice("DATABASE_URL=".length),
    ).searchParams.getAll("driver");
    expect(driverParams).toEqual(["neon"]);
  });

  it("omits the driver= param from the clipboard payload when the dropdown is left on Auto-detect", async () => {
    render(<Setup />);
    await flushAsyncEffects();

    setUrlValue("postgres://u:p@h:5432/d");
    await navigateToSecretsThenForceUnreachable();

    clickButtonByTestId("button-copy-env-DATABASE_URL");
    await flushAsyncEffects();

    const payload = databaseUrlClipboardPayload();
    expect(payload).toBe("DATABASE_URL=postgres://u:p@h:5432/d");
    expect(payload).not.toContain("driver=");
  });
});
