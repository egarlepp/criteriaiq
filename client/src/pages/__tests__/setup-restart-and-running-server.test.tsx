// @vitest-environment happy-dom
//
// Coverage for task #365: the Setup wizard's "restart required" callout
// and the Done-step "What the running server sees" diagnostic panel.
//
// The bug this locks down was reported by self-hosted operators on
// Dokploy: after pasting the wizard's required env vars into Dokploy's
// Environment tab and clicking Restart in Dokploy, the wizard's Done
// step lit up red across the board because Dokploy's "Restart" reuses
// the existing container and never re-reads the Environment tab. The
// wizard had no way to communicate this — operators were stuck staring
// at red checks with no actionable next step.
//
// The fix in setup.tsx:
//   1. Trips a `restartHinted` flag whenever the operator saves a value
//      that only takes effect after a process restart (admin save, SMTP
//      save, or SMTP skip). This drives an amber `RestartRequiredCallout`
//      at the top of both the SMTP step and the Done step.
//   2. Renders a `RunningServerSeesPanel` on the Done step that buckets
//      the four bootstrap snapshot `*Source` fields into env / file /
//      missing — so operators can see at a glance which variables the
//      running process actually has access to.
//   3. When at least one variable is missing, surfaces a Dokploy-tip
//      callout pointing operators at the Redeploy button + a persistent
//      volume for `data/`.
//
// This test walks the wizard from the connect step all the way through
// admin → smtp → done (mocking every endpoint to success) and asserts
// each of those three contracts plus the dismiss interaction.
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

// Builds the /api/setup/status mock body. The four `*Source` fields are
// the heart of this test — they drive the RunningServerSeesPanel rows.
type SourceMix = {
  databaseUrlSource?: "env" | "wizard" | "none";
  sessionSecretSource?: "env" | "file" | "none";
  encryptionKeySource?: "env" | "file" | "none";
  publicAppUrlSource?: "env" | "file" | "default";
};

function statusBody(opts: {
  adminExists?: boolean;
  setupRequired?: boolean;
  hasSessionSecret?: boolean;
  hasEncryptionKey?: boolean;
  publicAppUrl?: string;
} & SourceMix = {}) {
  return {
    setupRequired: opts.setupRequired ?? false,
    adminExists: opts.adminExists ?? false,
    publicAppUrl: opts.publicAppUrl ?? "",
    hasSessionSecret: opts.hasSessionSecret ?? true,
    hasEncryptionKey: opts.hasEncryptionKey ?? true,
    dbHealth: { reachable: true, lastErrorCode: null },
    databaseUrlSource: opts.databaseUrlSource,
    sessionSecretSource: opts.sessionSecretSource,
    encryptionKeySource: opts.encryptionKeySource,
    publicAppUrlSource: opts.publicAppUrlSource,
  };
}

// Walks the wizard from connect → initialize → secrets → public-url →
// admin → smtp by mocking every endpoint to success and clicking the
// shared Continue / Test / Initialize labels (mirrors the recipe used in
// setup-admin-skip.test.tsx). Stops on the SMTP step so individual
// tests can choose to Save vs Skip and assert different downstream UX.
async function navigateToSmtpStep(sources: SourceMix = {}) {
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
    if (url.endsWith("/api/setup/status")) {
      return Promise.resolve(jsonResponse(200, statusBody({ ...sources })));
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
}

describe("Setup — restart-required callout & running-server diagnostic panel", () => {
  it("shows the restart-required callout on the SMTP step after admin save", async () => {
    await navigateToSmtpStep();

    const callout = container.querySelector(
      '[data-testid="callout-restart-required"]',
    );
    expect(
      callout,
      "callout should appear on the SMTP step once an admin has been saved",
    ).not.toBeNull();
    expect(callout!.textContent).toContain(
      i18n.t("setup.restartRequired.title"),
    );
    // Both action buttons must carry contract test ids so docs / Playwright
    // suites can drive them.
    expect(
      callout!.querySelector('[data-testid="button-restart-required-restart"]'),
    ).not.toBeNull();
    expect(
      callout!.querySelector('[data-testid="button-restart-required-dismiss"]'),
    ).not.toBeNull();
  });

  it("dismiss button hides the callout until the next save trips it again", async () => {
    await navigateToSmtpStep();
    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
    ).not.toBeNull();

    clickByTestId("button-restart-required-dismiss");
    await flush();

    expect(
      container.querySelector('[data-testid="callout-restart-required"]'),
      "dismiss must hide the callout",
    ).toBeNull();
  });

  it("renders the running-server diagnostic panel on the Done step with one row per env var", async () => {
    await navigateToSmtpStep({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "env",
    });

    // Skip SMTP → Done
    clickByTestId("button-skip-smtp");
    await flush();
    await flush();
    await flush();
    // CRM step → Done (Salesforce preselected).
    clickByTestId("button-save-crm");
    await flush();
    await flush();
    await flush();

    const panel = container.querySelector(
      '[data-testid="panel-running-server-sees"]',
    );
    expect(panel, "running-server panel should render on Done").not.toBeNull();
    expect(panel!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.title"),
    );

    for (const key of [
      "DATABASE_URL",
      "SESSION_SECRET",
      "ENCRYPTION_KEY",
      "PUBLIC_APP_URL",
    ] as const) {
      const row = container.querySelector(
        `[data-testid="running-server-row-${key}"]`,
      );
      expect(row, `row for ${key} should render`).not.toBeNull();
    }

    // DATABASE_URL came from env → "Loaded from host environment"
    const dbState = container.querySelector(
      '[data-testid="running-server-state-DATABASE_URL"]',
    );
    expect(dbState!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.fromEnv"),
    );
    // SESSION_SECRET came from file → "Loaded from wizard config file"
    const ssState = container.querySelector(
      '[data-testid="running-server-state-SESSION_SECRET"]',
    );
    expect(ssState!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.fromFile"),
    );

    // No row is missing → Dokploy tip block must NOT render.
    expect(
      container.querySelector('[data-testid="callout-dokploy-tip"]'),
      "Dokploy tip should only appear when at least one var is missing",
    ).toBeNull();
  });

  it("shows the Dokploy redeploy tip when at least one var is missing from the running process", async () => {
    await navigateToSmtpStep({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "none", // ← not visible to running process
      publicAppUrlSource: "env",
    });

    clickByTestId("button-skip-smtp");
    await flush();
    await flush();
    await flush();

    // CRM step → Done (Salesforce preselected).

    clickByTestId("button-save-crm");

    await flush();

    await flush();

    await flush();

    const ekState = container.querySelector(
      '[data-testid="running-server-state-ENCRYPTION_KEY"]',
    );
    expect(ekState!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.notVisible"),
    );

    const tip = container.querySelector(
      '[data-testid="callout-dokploy-tip"]',
    );
    expect(
      tip,
      "Dokploy tip must surface when any env var is missing from the running process",
    ).not.toBeNull();
    expect(tip!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.dokployTitle"),
    );
    // The body has a <strong>Redeploy</strong> placeholder via Trans —
    // check the literal "Redeploy" word ends up in the rendered HTML.
    expect(tip!.textContent).toContain("Redeploy");
  });

  it("shows the restart-required callout on the Done step after a successful SMTP save", async () => {
    // Two save paths land the operator on Done with restartHinted=true:
    // SMTP-skip (covered above) and SMTP-save. This case exercises the
    // save path so a regression in handleSaveSmtp's setRestartHinted
    // call can't slip through. We also assert the runningSources panel
    // renders alongside the callout (auto-runHealthChecks fires on Done
    // entry so it should be present without an extra click).
    await navigateToSmtpStep({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "env",
    });

    setInputValue("input#smtp-host", "smtp.example.com");
    setInputValue("input#smtp-user", "noreply@example.com");
    setInputValue("input#smtp-from", "noreply@example.com");
    clickByTestId("button-save-smtp");
    await flush();
    await flush();
    await flush();
    // CRM step → Done (Salesforce preselected).
    clickByTestId("button-save-crm");
    await flush();
    await flush();
    await flush();

    const callout = container.querySelector(
      '[data-testid="callout-restart-required"]',
    );
    expect(
      callout,
      "callout must surface on Done after a successful SMTP save",
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="panel-running-server-sees"]'),
      "running-server panel must accompany the callout on Done after SMTP save",
    ).not.toBeNull();
  });

  it("wraps the wizard in a viewport-bound scrollable container so the env disclosure cannot overflow off-screen", async () => {
    // Layout contract for the scroll bug: when the operator opened the
    // env-var disclosure on a short viewport the page silently grew
    // taller than the screen with no scrollbar, hiding the Continue
    // button. The fix is in the outermost wrapper — assert the literal
    // class string here so a future "let's restyle the gradient" change
    // can't quietly remove `h-screen` / `overflow-y-auto` and bring the
    // bug back.
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, statusBody())),
    );
    render(<Setup />);
    await flush();

    // The wrapper is the first child of #root — it owns the layout
    // constraints. Querying by the unique class fragment is more robust
    // than depending on a positional selector since the gradient div
    // shape may change.
    const wrapper = container.querySelector(
      "div.min-h-screen.h-screen.overflow-y-auto",
    );
    expect(
      wrapper,
      "outer wrapper must keep `min-h-screen h-screen overflow-y-auto` so " +
        "the env disclosure scrolls inside the viewport",
    ).not.toBeNull();
  });

  it("renders the gradient + world-map backdrop as a fixed-position layer so it covers the full scrollable content", async () => {
    // Layout contract for the background-scaling bug: when the wizard's
    // scroll container (h-screen) overflows on a short viewport, a
    // backdrop sized via `absolute inset-0` only paints the viewport
    // and leaves a blank dark gap below the form. The fix is to render
    // the gradient + world-map as a `position: fixed` sibling outside
    // the scroll container so it always covers the visible viewport.
    // Assert the fixed-position class is present on the backdrop so a
    // future "let's restyle the gradient" change can't quietly drop
    // `fixed` and bring the bug back.
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse(200, statusBody())),
    );
    render(<Setup />);
    await flush();

    const backdrop = container.querySelector(
      '[data-testid="setup-backdrop"]',
    );
    expect(
      backdrop,
      "setup-backdrop element must render so the gradient + world-map paint behind the wizard",
    ).not.toBeNull();
    expect(
      backdrop!.classList.contains("fixed"),
      "setup-backdrop must use `position: fixed` so it covers the viewport even when the wizard scrolls",
    ).toBe(true);
    expect(
      backdrop!.classList.contains("inset-0"),
      "setup-backdrop must use `inset-0` to cover the full viewport",
    ).toBe(true);
    expect(
      backdrop!.classList.contains("pointer-events-none"),
      "setup-backdrop must stay non-interactive so it can't intercept clicks on the wizard",
    ).toBe(true);
    expect(
      backdrop!.getAttribute("aria-hidden"),
      "setup-backdrop is decorative — must be hidden from the accessibility tree",
    ).toBe("true");
    expect(
      (backdrop as HTMLElement).style.zIndex,
      "setup-backdrop must keep `z-index: -1` so wizard content paints on top of it",
    ).toBe("-1");
  });

  it("renders the Restart Server help text under the Restart button on the Done step", async () => {
    await navigateToSmtpStep();
    clickByTestId("button-skip-smtp");
    await flush();
    await flush();
    await flush();
    // CRM step → Done (Salesforce preselected).
    clickByTestId("button-save-crm");
    await flush();
    await flush();
    await flush();

    const help = container.querySelector(
      '[data-testid="text-restart-server-help"]',
    );
    expect(help, "restart-server help text should render").not.toBeNull();
    expect(help!.textContent).toContain(
      i18n.t("setup.done.restartServerHelp"),
    );
  });
});
