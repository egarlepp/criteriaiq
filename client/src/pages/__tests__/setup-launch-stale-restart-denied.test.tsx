// @vitest-environment happy-dom
//
// Coverage for task #688: when the post-install /api/setup/restart
// endpoint refuses a stale browser tab (401 `unauthenticated` or 403
// `forbidden`), the wizard's Done-step "Restart Server" button must
// surface the same Reconfigure-mode callout the bootstrap-only POST
// stubs trigger (task-682) instead of falling through to the silent
// 12-second poll loop.
//
// Background: task-682 stubbed the bootstrap-only POSTs (`/initialize`,
// `/save-config`, `/public-url`, `/create-admin`, `/smtp`, `/complete`)
// with a 409 `SETUP_ALREADY_COMPLETE`, but `/api/setup/restart` is a
// different endpoint — `registerSetupStatusRoutes` keeps it mounted
// post-install with `restartRequiresAdmin: true`, so a stale tab POSTing
// Launch ends up with a 401/403 instead of the 409 the task-682 detector
// expects. `handleLaunch` previously swallowed the response into a silent
// `try/catch` and proceeded straight to its 12-second `/api/health` poll,
// leaving the operator staring at "Server is restarting…" indefinitely
// even though no restart was ever attempted.
//
// This regression test pins the contract so a future "tighten the
// restart gate" change can't quietly bring back the indefinite-countdown
// UX. We assert:
//   1. A 401 from /api/setup/restart surfaces the
//      `callout-reconfigure-mode` block.
//   2. The "Server is restarting…" countdown text never renders.
//   3. A 403 (logged-in non-Admin) takes the same path.
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
  act(() => {
    root.unmount();
  });
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
  act(() => {
    root.render(ui);
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

function clickByTestId(testId: string) {
  const btn = container.querySelector<HTMLButtonElement>(
    `[data-testid="${testId}"]`,
  );
  if (!btn) throw new Error(`button ${testId} not rendered`);
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function clickByLabel(label: string) {
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const btn = buttons.find((b) => b.textContent?.trim() === label);
  if (!btn) {
    const labels = buttons.map((b) => b.textContent?.trim()).join(" | ");
    throw new Error(`button "${label}" not rendered. saw: ${labels}`);
  }
  if (btn.disabled) {
    throw new Error(`button "${label}" is disabled and cannot be clicked`);
  }
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// Builds an /api/setup/status body that lets the wizard render normally
// (setupRequired=false, no admin yet so we can walk through the wizard
// without the locked-admin branch). `setupCompletedAt` defaults to null
// so the wizard renders the 7-step flow rather than the read-only
// SetupHealthCheckView.
function statusBody(opts: {
  setupCompletedAt?: string | null;
} = {}) {
  return {
    setupRequired: false,
    adminExists: false,
    publicAppUrl: "",
    hasSessionSecret: true,
    hasEncryptionKey: true,
    dbHealth: { reachable: true, lastErrorCode: null },
    setupCompletedAt: opts.setupCompletedAt ?? null,
    databaseUrlSource: "env",
    sessionSecretSource: "file",
    encryptionKeySource: "file",
    publicAppUrlSource: "env",
  };
}

// Walks the wizard from connect → done, mocking every endpoint to
// success. `restartResponse` controls the response /api/setup/restart
// returns when the operator clicks the Done step's Restart Server
// button — the whole point of this test file.
async function walkWizardAndClickRestart(restartResponse: Response) {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/setup/test-connection")) {
      return Promise.resolve(jsonResponse(200, { success: true, latencyMs: 7 }));
    }
    if (url.includes("/api/setup/initialize")) {
      return Promise.resolve(jsonResponse(200, { success: true, phases: [] }));
    }
    if (url.endsWith("/api/setup/secrets")) {
      return Promise.resolve(
        jsonResponse(200, {
          sessionSecret: { value: "ss", source: "file" },
          encryptionKey: { value: "ek", source: "file" },
        }),
      );
    }
    if (url.includes("/api/setup/public-url")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/create-admin")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/smtp")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/crm-provider")) {
      return Promise.resolve(jsonResponse(200, { success: true, provider: "salesforce" }));
    }
    if (url.includes("/api/setup/complete")) {
      return Promise.resolve(jsonResponse(200, { success: true }));
    }
    if (url.includes("/api/setup/restart")) {
      return Promise.resolve(restartResponse.clone());
    }
    if (url.endsWith("/api/setup/status")) {
      return Promise.resolve(jsonResponse(200, statusBody()));
    }
    if (url.endsWith("/api/health")) {
      return Promise.resolve(jsonResponse(200, { ok: true, uptimeSec: 1 }));
    }
    if (url.includes("/api/auth/user")) {
      return Promise.resolve(jsonResponse(401, { message: "Not authed" }));
    }
    return Promise.resolve(jsonResponse(200, {}));
  });

  render(<Setup />);
  await flush();

  // Connect step
  setInputValue("input#url", "postgres://u:p@h:5432/db");
  clickByLabel(i18n.t("setup.connect.testButton"));
  await flush();
  await flush();
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  // Initialize step
  clickByLabel(i18n.t("setup.initialize.initialize"));
  await flush();
  await flush();
  await flush();

  // Secrets step
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  // Public-URL step
  setInputValue("input#purl", "https://app.example.com");
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
  await flush();

  // Admin step — fill in valid credentials and submit.
  setInputValue("input#afn", "Ada");
  setInputValue("input#ae", "ada@example.com");
  setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
  clickByTestId("button-create-admin");
  await flush();
  await flush();

  // SMTP step → Done (skip).
  clickByTestId("button-skip-smtp");
  await flush();
  await flush();
  await flush();
  // CRM step → Done (Salesforce preselected).
  clickByTestId("button-save-crm");
  await flush();
  await flush();
  await flush();

  // Done step — click Restart Server. This is the function under test.
  clickByTestId("button-restart-server");
  await flush();
  await flush();
  await flush();
}

describe("Setup — Reconfigure-mode callout when /api/setup/restart denies a stale tab", () => {
  it("surfaces the Reconfigure-mode callout when /api/setup/restart returns 401 unauthenticated", async () => {
    // The exact response shape registerSetupStatusRoutes emits when
    // restartRequiresAdmin is true and there's no session — see
    // server/routes/setup-routes.ts. The wizard MUST notice the 401 status
    // (the body code is informative but the gate is status-based) and
    // pivot to the Reconfigure-mode callout instead of dropping into
    // the indefinite "Server is restarting…" countdown.
    await walkWizardAndClickRestart(
      jsonResponse(401, {
        success: false,
        error: "Authentication required",
        errorCode: "unauthenticated",
      }),
    );

    const callout = container.querySelector(
      '[data-testid="callout-reconfigure-mode"]',
    );
    expect(
      callout,
      "Reconfigure-mode callout must surface when /api/setup/restart " +
        "rejects a stale tab with 401 unauthenticated, instead of the " +
        "wizard silently dropping into its 12-second poll loop.",
    ).not.toBeNull();
    expect(callout!.textContent).toContain(
      i18n.t("setup.reconfigureMode.title"),
    );

    // The countdown text is the user-visible symptom of the bug — the
    // wizard previously sat on "Server is restarting…" forever because
    // the 401 was swallowed. Pin the negative so a future regression
    // (e.g. a refactor that drops the early return) is caught even if
    // the callout still happens to render alongside the countdown.
    expect(
      container.textContent ?? "",
      "indefinite 'Server is restarting…' countdown must NOT appear " +
        "when the restart endpoint denied the request — the operator " +
        "needs the Reconfigure-mode explainer instead.",
    ).not.toContain(i18n.t("setup.done.restarting"));
  });

  it("surfaces the Reconfigure-mode callout when /api/setup/restart returns 403 forbidden", async () => {
    // The "logged in as a non-Admin" branch of registerSetupStatusRoutes —
    // same UX outcome as the 401 path. We exercise it explicitly so a
    // future "401-only" early-return tightening can't silently regress
    // the non-Admin path.
    await walkWizardAndClickRestart(
      jsonResponse(403, {
        success: false,
        error: "Admin role required",
        errorCode: "forbidden",
      }),
    );

    expect(
      container.querySelector('[data-testid="callout-reconfigure-mode"]'),
      "Reconfigure-mode callout must also surface on the 403 forbidden " +
        "branch — a non-Admin session is just as stale for the Launch " +
        "button as no session at all.",
    ).not.toBeNull();
    expect(
      container.textContent ?? "",
      "indefinite 'Server is restarting…' countdown must NOT appear on the 403 path either.",
    ).not.toContain(i18n.t("setup.done.restarting"));
  });
});
