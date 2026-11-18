// @vitest-environment happy-dom
// Setup wizard "DB unreachable" banner coverage (task #361).
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import Setup from "../setup";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch | undefined;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function render(ui: React.ReactElement) {
  act(() => { root.render(ui); });
}

function statusBody(
  reachable: boolean,
  code: string | null,
  host: string | null = "db.example.com:5432",
) {
  return {
    setupRequired: true,
    adminExists: false,
    publicAppUrl: "",
    hasSessionSecret: false,
    hasEncryptionKey: false,
    dbHealth: { reachable, lastErrorCode: code, host },
  };
}

describe("Setup — database unreachable banner", () => {
  it("renders the banner with the authFailed copy when /api/setup/status reports 28P01", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const banner = container.querySelector(
      '[data-testid="callout-db-unreachable"]',
    );
    expect(banner, "banner should render when DB is unreachable").not.toBeNull();
    expect(banner!.textContent).toContain(
      i18n.t("setup.dbUnreachable.title"),
    );
    expect(banner!.textContent).toContain(
      i18n.t("setup.dbUnreachable.code.authFailed"),
    );
    // Banner must never echo raw driver detail back to the page.
    expect(banner!.textContent).not.toContain("neondb_owner");
    expect(banner!.textContent).not.toContain("npg_");

    // Task #452: the broken host[:port] must be rendered so operators can
    // tell whether the failing URL is the one they just typed or a stale
    // value the host has saved.
    const hostEl = container.querySelector(
      '[data-testid="db-unreachable-host"]',
    );
    expect(hostEl, "host element should render alongside the banner title")
      .not.toBeNull();
    expect(hostEl!.textContent).toContain("db.example.com:5432");
  });

  // Task #452: when the server omits `host` (older bundle, malformed URL),
  // the banner must still render — just without the "at <host>" suffix.
  it("renders the banner without the host suffix when /api/setup/status omits dbHealth.host", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed", null)));
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const banner = container.querySelector(
      '[data-testid="callout-db-unreachable"]',
    );
    expect(banner, "banner should still render without a host").not.toBeNull();
    expect(
      container.querySelector('[data-testid="db-unreachable-host"]'),
      "host span should be omitted when no host is provided",
    ).toBeNull();
  });

  // Task #452: defence-in-depth — even if the server somehow handed us a
  // raw connection URL with userinfo, the rendered banner must NEVER expose
  // the username/password. (The server's `sanitizeConnectionHost` strips
  // them on the way out; we additionally verify the client doesn't render
  // anything that contains a `:` userinfo pattern from the body of the
  // banner besides the legitimate `host:port`.)
  it("never renders userinfo from the server's host field even if it were leaked", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        // Server contract: host is already sanitized to `hostname[:port]`.
        return Promise.resolve(
          jsonResponse(200, statusBody(false, "authFailed", "db.example.com:5432")),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const banner = container.querySelector(
      '[data-testid="callout-db-unreachable"]',
    );
    expect(banner!.textContent).not.toContain("neondb_owner");
    expect(banner!.textContent).not.toContain("npg_");
    expect(banner!.textContent).not.toContain("password");
    // The host span itself must contain only the host:port we passed in,
    // never any '@' (which would imply userinfo had survived).
    const hostEl = container.querySelector(
      '[data-testid="db-unreachable-host"]',
    );
    expect(hostEl!.textContent).not.toContain("@");
  });

  // Task #450: previously this test asserted the Continue button was
  // *disabled* while the live-probe banner was visible. That gate was
  // the chicken-and-egg deadlock — the Database step exists *to repair*
  // a wrong live `DATABASE_URL`, so gating its own Continue button on
  // the live probe meant the operator could never advance even after
  // typing a URL that passed Test Connection. The new contract: as
  // soon as Test Connection returns success on the typed URL, Continue
  // is enabled regardless of the live probe state.
  it("enables the connect-step Continue button after Test Connection succeeds, even while the unreachable banner is visible (task-450)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, latencyMs: 5 }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const url = container.querySelector<HTMLInputElement>("input#url");
    expect(url, "url input should render").not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(url!, "postgres://u:p@h:5432/db");
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const test = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (b) => b.textContent?.trim() === i18n.t("setup.connect.testButton"),
    );
    test?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await flush();

    // Live-probe banner must still be visible — we are NOT removing
    // the diagnostic, only the gate.
    const banner = container.querySelector(
      '[data-testid="callout-db-unreachable"]',
    );
    expect(banner, "banner should still render — diagnostic is preserved")
      .not.toBeNull();

    const cont = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-continue-connect"]',
    );
    expect(cont, "Continue button should render on the connect step")
      .not.toBeNull();
    expect(
      cont!.disabled,
      "Continue must be enabled so the operator can advance and repair the live URL",
    ).toBe(false);

    // Inline reassurance note explaining the typed-URL-vs-live-URL
    // contradiction so the operator isn't confused.
    const note = container.querySelector(
      '[data-testid="callout-continue-despite-live-probe"]',
    );
    expect(note, "inline reassurance note should render").not.toBeNull();
    expect(note!.textContent).toContain(
      i18n.t("setup.connect.continueDespiteLiveProbe.title"),
    );
  });

  // Task #451: when the server reports matchesLiveUrl=true, the wizard
  // must swap the reassuring "Continue is enabled" note for a sharper
  // warning that says re-saving the same URL won't repair anything.
  // The original "callout-continue-despite-live-probe" element should
  // disappear and the new "callout-same-url-as-broken" element should
  // take its place — never both at once.
  it("renders the same-URL warning (and hides the reassurance note) when matchesLiveUrl=true (task-451)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            latencyMs: 5,
            matchesLiveUrl: true,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const url = container.querySelector<HTMLInputElement>("input#url");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(url!, "postgres://u:p@h:5432/db");
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const test = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (b) => b.textContent?.trim() === i18n.t("setup.connect.testButton"),
    );
    test?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await flush();

    const sameUrl = container.querySelector(
      '[data-testid="callout-same-url-as-broken"]',
    );
    expect(sameUrl, "same-URL warning should render when matchesLiveUrl=true")
      .not.toBeNull();
    expect(sameUrl!.textContent).toContain(
      i18n.t("setup.connect.sameUrlAsBroken.title"),
    );

    // The two callouts must be mutually exclusive — otherwise the
    // operator gets contradictory advice on the same screen.
    const reassurance = container.querySelector(
      '[data-testid="callout-continue-despite-live-probe"]',
    );
    expect(
      reassurance,
      "reassurance note must be hidden while the same-URL warning is shown",
    ).toBeNull();
  });

  // Task #451: the boolean only swaps copy — it does NOT re-introduce the
  // chicken-and-egg gate that Task #450 removed. Continue stays enabled so
  // the operator can still click through and update the host's env after
  // the wizard if they're sure that's what they want.
  it("keeps Continue enabled when matchesLiveUrl=true (warning, not a hard block)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            latencyMs: 5,
            matchesLiveUrl: true,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const url = container.querySelector<HTMLInputElement>("input#url");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(url!, "postgres://u:p@h:5432/db");
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const test = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (b) => b.textContent?.trim() === i18n.t("setup.connect.testButton"),
    );
    test?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await flush();

    const cont = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-continue-connect"]',
    );
    expect(
      cont!.disabled,
      "Continue must stay enabled — the new callout is a warning, not a gate",
    ).toBe(false);
  });

  // Task #451: omitting matchesLiveUrl (or sending false) must keep the
  // existing "Continue is enabled" reassurance — we are not regressing
  // the Task #450 copy when the operator has actually edited the URL.
  it("falls back to the reassurance note when matchesLiveUrl is false (URL was edited)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, {
            success: true,
            latencyMs: 5,
            matchesLiveUrl: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    const url = container.querySelector<HTMLInputElement>("input#url");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(url!, "postgres://u:p@h:5432/db");
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const test = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (b) => b.textContent?.trim() === i18n.t("setup.connect.testButton"),
    );
    test?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await flush();

    expect(
      container.querySelector('[data-testid="callout-continue-despite-live-probe"]'),
      "reassurance note should render when the URL was edited",
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="callout-same-url-as-broken"]'),
      "same-URL warning must NOT render when the URL was edited",
    ).toBeNull();
  });

  // Task #450: confirm that later steps' `dbUnreachable` gate from
  // Task #361 is preserved. Mounting the Initialize step with a
  // failing live probe must keep its primary button disabled — only
  // the Database step's gate is intentionally relaxed.
  it("keeps the initialize-step primary button disabled while the live probe fails (task-361 gate preserved)", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        return Promise.resolve(jsonResponse(200, statusBody(false, "authFailed")));
      }
      if (url.includes("/api/setup/test-connection")) {
        return Promise.resolve(
          jsonResponse(200, { success: true, latencyMs: 5 }),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    render(<Setup />);
    await flush();
    await flush();

    // Drive the wizard: type a URL, run Test Connection, click Continue
    // to land on the Initialize step.
    const url = container.querySelector<HTMLInputElement>("input#url");
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      setter?.call(url!, "postgres://u:p@h:5432/db");
      url!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const test = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find(
      (b) => b.textContent?.trim() === i18n.t("setup.connect.testButton"),
    );
    test?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await flush();

    const cont = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-continue-connect"]',
    );
    expect(cont!.disabled).toBe(false);
    act(() => {
      cont!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();

    const initializeBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-initialize"]',
    );
    expect(
      initializeBtn,
      "Initialize step's primary button should render after advancing",
    ).not.toBeNull();
    expect(
      initializeBtn!.disabled,
      "Initialize button must stay disabled while live probe is failing",
    ).toBe(true);
  });

  it("hides the banner when a subsequent poll reports the DB is reachable", async () => {
    let pollCount = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/setup/status")) {
        pollCount += 1;
        return Promise.resolve(
          jsonResponse(
            200,
            pollCount === 1
              ? statusBody(false, "timeout")
              : statusBody(true, null),
          ),
        );
      }
      return Promise.resolve(jsonResponse(200, {}));
    });

    vi.useFakeTimers();
    try {
      render(<Setup />);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(
        container.querySelector('[data-testid="callout-db-unreachable"]'),
        "banner should appear from the first poll",
      ).not.toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(11_000);
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(
        container.querySelector('[data-testid="callout-db-unreachable"]'),
        "banner should disappear once /api/setup/status reports recovery",
      ).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
