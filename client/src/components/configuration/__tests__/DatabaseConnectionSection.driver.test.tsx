// @vitest-environment happy-dom
//
// Task #483 originally wrote `makeConnection(...)` with `isActive: true`,
// which worked at the time because Edit-on-active rows still flushed
// straight to a PUT. Task #740 then introduced the "URL change on the
// active row queues for next restart" typed-confirm gate — at which
// point the Edit dropdown test silently broke: clicking Save Changes on
// an active row with a populated URL now opens the typed-confirm modal
// instead of firing PUT, so the body assertion downstream sees zero PUT
// calls. Task #765 fixes that drift here by switching the fixture to
// `isActive: false` so the Edit-dialog dropdown tests cover their actual
// intent (the dropdown choice flowing into the PUT body) without
// accidentally also exercising the unrelated active-row typed-confirm
// gate (which lives at `DatabaseConnectionSection.tsx:~1665`).

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

  function SelectGroup({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function SelectLabel({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function SelectSeparator() {
    return null;
  }
  function SelectScrollUpButton() {
    return null;
  }
  function SelectScrollDownButton() {
    return null;
  }

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
    SelectGroup,
    SelectLabel,
    SelectSeparator,
    SelectScrollUpButton,
    SelectScrollDownButton,
  };
});

vi.mock("@/components/ui/dialog", async () => {
  const ReactMod = await import("react");
  function Dialog({
    open,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
    children: React.ReactNode;
  }) {
    if (!open) return null;
    return <div data-mock-dialog>{children}</div>;
  }
  function DialogContent({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) {
    return <div className={className}>{children}</div>;
  }
  function DialogHeader({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function DialogTitle({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function DialogDescription({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function DialogFooter({ children }: { children: React.ReactNode }) {
    return <div>{children}</div>;
  }
  function DialogTrigger({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  function DialogClose({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  }
  void ReactMod;
  return {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogTrigger,
    DialogClose,
  };
});

const { DatabaseConnectionSection } = await import("../DatabaseConnectionSection");

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof fetch;
let fetchCalls: Array<{ url: string; init: RequestInit | undefined }>;

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers({ "content-type": "application/json" }),
  } as unknown as Response;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  originalFetch = globalThis.fetch;
  fetchCalls = [];

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    fetchCalls.push({ url, init });
    if (url.includes("/api/system/env-status")) {
      return jsonResponse({ databaseUrlSource: "wizard" });
    }
    if (url.includes("/api/db-connections")) {
      return jsonResponse({ connections: [], id: 99 });
    }
    return jsonResponse({});
  }) as unknown as typeof fetch;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  globalThis.fetch = originalFetch;
});

async function renderSection(extraConnections: unknown[] = []) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          const url = queryKey[0] as string;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.json();
          if (url === "/api/db-connections") {
            return { ...body, connections: extraConnections };
          }
          return body;
        },
      },
    },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <DatabaseConnectionSection />
      </QueryClientProvider>,
    );
  });
  for (let i = 0; i < 30; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
  }
}

function clickButtonByText(text: string) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const button = buttons.find((b) => b.textContent?.trim().includes(text));
  if (!button) throw new Error(`button matching "${text}" not rendered`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setInputValue(selector: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`input ${selector} not rendered`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pickDriver(triggerTestId: string, value: "auto" | "neon" | "pg") {
  const trigger = container.querySelector<HTMLElement>(
    `[data-testid="${triggerTestId}"]`,
  );
  if (!trigger) throw new Error(`trigger ${triggerTestId} not rendered`);
  const group = trigger.closest("div.space-y-2") ?? trigger.parentElement!;
  const button = group.querySelector<HTMLButtonElement>(
    `button[data-mock-select-option="${value}"]`,
  );
  if (!button) {
    throw new Error(
      `option button "${value}" not rendered under ${triggerTestId}`,
    );
  }
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function flushAsyncEffects() {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function lastBodyFor(method: string, urlFragment: string): Record<string, unknown> {
  const calls = fetchCalls.filter(
    (c) =>
      c.url.includes(urlFragment) &&
      (c.init?.method ?? "GET").toUpperCase() === method.toUpperCase(),
  );
  if (calls.length === 0) {
    throw new Error(`no ${method} call matching ${urlFragment}`);
  }
  const last = calls[calls.length - 1]!;
  const body = last.init?.body;
  if (typeof body !== "string") {
    throw new Error(`fetch body for ${method} ${urlFragment} not a string`);
  }
  return JSON.parse(body) as Record<string, unknown>;
}

function clickRowEditButton() {
  const allButtons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const editButton = allButtons.find((b) =>
    b.querySelector("svg.lucide-square-pen"),
  );
  if (!editButton) throw new Error("row Edit button not rendered");
  act(() => {
    editButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function makeConnection(id: number) {
  return {
    id,
    name: "Production",
    connectionUrlPreview: "postgres://****@host:5432/db",
    branch: "production",
    // See header note: must stay false so the Edit dialog's Save
    // path goes straight to PUT instead of opening the active-row
    // typed-confirm dialog added in Task #740.
    isActive: false,
    isDefault: true,
    isSystem: false,
    notes: null,
    lastTestedAt: null,
    lastTestSuccess: null,
    lastTestLatencyMs: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("DatabaseConnectionSection — Database Driver dropdown wiring (task #483)", () => {
  it("folds the Add dialog dropdown choice into the POST /api/db-connections body as ?driver=neon", async () => {
    await renderSection();

    clickButtonByText("Add");

    setInputValue('input[placeholder*="Production"]', "My Neon");
    setInputValue(
      'input[placeholder*="postgresql"]',
      "postgres://u:p@h:5432/d",
    );
    pickDriver("select-add-conn-driver", "neon");

    clickButtonByText("Save Connection");
    await flushAsyncEffects();

    const body = lastBodyFor("POST", "/api/db-connections");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=neon");
    expect(body.name).toBe("My Neon");
  });

  it("folds the Add dialog dropdown choice into the POST body as ?driver=pg", async () => {
    await renderSection();

    clickButtonByText("Add");
    setInputValue('input[placeholder*="Production"]', "Bouncer");
    setInputValue(
      'input[placeholder*="postgresql"]',
      "postgres://u:p@neon.tech:5432/d",
    );
    pickDriver("select-add-conn-driver", "pg");

    clickButtonByText("Save Connection");
    await flushAsyncEffects();

    const body = lastBodyFor("POST", "/api/db-connections");
    expect(body.connectionUrl).toBe(
      "postgres://u:p@neon.tech:5432/d?driver=pg",
    );
  });

  it("leaves the URL unchanged when the Add dialog dropdown stays on Auto-detect", async () => {
    await renderSection();

    clickButtonByText("Add");
    setInputValue('input[placeholder*="Production"]', "Auto");
    setInputValue(
      'input[placeholder*="postgresql"]',
      "postgres://u:p@h:5432/d",
    );

    clickButtonByText("Save Connection");
    await flushAsyncEffects();

    const body = lastBodyFor("POST", "/api/db-connections");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d");
    expect(String(body.connectionUrl)).not.toContain("driver=");
  });

  it("populates the Add dropdown from a pasted URL with ?driver=neon and submits without doubling up the param", async () => {
    await renderSection();

    clickButtonByText("Add");
    setInputValue('input[placeholder*="Production"]', "Pasted");
    setInputValue(
      'input[placeholder*="postgresql"]',
      "postgres://u:p@h:5432/d?driver=neon",
    );

    const trigger = container.querySelector<HTMLElement>(
      '[data-testid="select-add-conn-driver"]',
    );
    expect(trigger?.getAttribute("data-driver-value")).toBe("neon");

    clickButtonByText("Save Connection");
    await flushAsyncEffects();

    const body = lastBodyFor("POST", "/api/db-connections");
    expect(body.connectionUrl).toBe("postgres://u:p@h:5432/d?driver=neon");
    const driverParams = new URL(
      body.connectionUrl as string,
    ).searchParams.getAll("driver");
    expect(driverParams).toEqual(["neon"]);
  });

  it("folds the Edit dialog dropdown choice into the PUT /api/db-connections/:id body as ?driver=neon", async () => {
    await renderSection([makeConnection(7)]);

    clickRowEditButton();

    setInputValue(
      'input[placeholder*="keep existing"]',
      "postgres://new:new@host:5432/db",
    );
    pickDriver("select-edit-conn-driver", "neon");
    clickButtonByText("Save Changes");
    await flushAsyncEffects();

    const body = lastBodyFor("PUT", "/api/db-connections/7");
    expect(body.connectionUrl).toBe(
      "postgres://new:new@host:5432/db?driver=neon",
    );
  });

  it("does NOT include connectionUrl in the PUT body when the URL field is left blank, even with a non-Auto driver pre-selected", async () => {
    await renderSection([makeConnection(8)]);

    clickRowEditButton();

    pickDriver("select-edit-conn-driver", "pg");
    clickButtonByText("Save Changes");
    await flushAsyncEffects();

    const body = lastBodyFor("PUT", "/api/db-connections/8");
    expect("connectionUrl" in body).toBe(false);
  });
});
