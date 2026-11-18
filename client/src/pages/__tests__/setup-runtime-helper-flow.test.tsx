// @vitest-environment happy-dom
//
// Task #691: end-to-end coverage for the Reconfigure-mode runtime helper
// row added in Task #681. Drives the wizard through the full operator
// flow in a real DOM:
//
//   - Mount Setup with /api/setup/status reporting setupCompletedAt set,
//     so the health-check landing renders first.
//   - Click "Reconfigure…" → confirm in the AlertDialog → wizard mounts
//     and the runtime helper row fetches /api/admin/runtime-info.
//   - For each runtime payload the server can return — coolify-with-token,
//     coolify-without-token, dokploy, docker, standalone — assert the
//     helper row renders the right buttons / hints / deep links and that
//     the data-runtime attribute matches the payload.
//   - For the coolify-with-token payload exercise the apply path:
//       1. Apply button is disabled until a Test Connection succeeds.
//       2. Clicking Apply opens the AlertDialog mounted at the wizard
//          root (data-testid="dialog-confirm-apply-database-url").
//       3. Confirming on a mocked-success endpoint renders the green
//          "applied" inline result and closes the dialog.
//       4. Confirming on a mocked-error endpoint renders the red error
//          banner with the localized error-code message; the dialog
//          stays open so the operator can retry or cancel.
//
// The vitest+happy-dom path mirrors the existing setup-* component
// suites in this directory (no Playwright infra in this project) — the
// real-browser DOM, the Radix portal, fetch mocking, and React 19 act
// semantics give us the same end-to-end coverage of the AlertDialog
// wiring, the disabled-state gate on Test Connection, the per-runtime
// deep-link rendering, and the localized error rendering when the
// apply call fails.
//
// Task #699: the suite is wrapped in `describe.each(LOCALES)` so every
// shipped locale bundle (en, de, es, fr, it, pt) re-runs the full set
// of helper-flow assertions. The expected strings are pulled from
// `i18n.t(...)` AFTER `changeLanguage(locale)`, so any silently-English
// fallback from a missing key in a translated bundle will fail the
// per-locale assertion. A separate `bundle parity` describe also asserts
// that every key the helper row surfaces is defined directly on each
// locale's resource bundle (no fallbackLng resolution), which catches
// the regression where the rendered text matches `i18n.t()` only because
// both fell through to the en bundle.

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import Setup from "../setup";
import i18n from "@/i18n";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type RuntimeInfoFixture = {
  runtime: "coolify" | "dokploy" | "docker" | "standalone";
  envEditorUrl: string | null;
  controlApi: {
    available: boolean;
    capabilities: ReadonlyArray<string>;
    tokenEnvVar: string | null;
    unavailableReason:
      | "unsupportedRuntime"
      | "missingToken"
      | "missingResourceUuid"
      | "missingHostUrl"
      | null;
  };
  signals: ReadonlyArray<string>;
};

const RUNTIME_FIXTURES: Record<string, RuntimeInfoFixture> = {
  coolifyWithToken: {
    runtime: "coolify",
    envEditorUrl:
      "https://coolify.example.com/applications/app-abc-123/environment-variables",
    controlApi: {
      available: true,
      capabilities: ["patchEnv", "restart"],
      tokenEnvVar: "COOLIFY_API_TOKEN",
      unavailableReason: null,
    },
    signals: ["COOLIFY_URL", "COOLIFY_RESOURCE_UUID", "COOLIFY_API_TOKEN"],
  },
  coolifyWithoutToken: {
    runtime: "coolify",
    envEditorUrl:
      "https://coolify.example.com/applications/app-abc-123/environment-variables",
    controlApi: {
      available: false,
      capabilities: [],
      tokenEnvVar: "COOLIFY_API_TOKEN",
      unavailableReason: "missingToken",
    },
    signals: ["COOLIFY_URL", "COOLIFY_RESOURCE_UUID"],
  },
  dokploy: {
    runtime: "dokploy",
    envEditorUrl: "https://dokploy.example.com/dashboard/project/app-abc",
    controlApi: {
      available: false,
      capabilities: [],
      tokenEnvVar: null,
      unavailableReason: "unsupportedRuntime",
    },
    signals: ["DOKPLOY_URL"],
  },
  docker: {
    runtime: "docker",
    envEditorUrl: null,
    controlApi: {
      available: false,
      capabilities: [],
      tokenEnvVar: null,
      unavailableReason: "unsupportedRuntime",
    },
    signals: ["dockerEnvFileExists"],
  },
  standalone: {
    runtime: "standalone",
    envEditorUrl: null,
    controlApi: {
      available: false,
      capabilities: [],
      tokenEnvVar: null,
      unavailableReason: "unsupportedRuntime",
    },
    signals: [],
  },
};

let container: HTMLDivElement;
let root: Root;
let originalFetch: typeof globalThis.fetch | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

interface RouteOverrides {
  runtimeInfo: RuntimeInfoFixture;
  // Per-call queue for /api/admin/runtime-apply-database-url. Each entry
  // is consumed in order so a single test can exercise both the apply
  // POST and any retry without re-installing the mock.
  applyResponses?: Array<{
    status: number;
    body: unknown;
    networkError?: boolean;
  }>;
  // Per-call queue for /api/setup/test-connection. Defaults to a single
  // success response so the apply button gates open after one click.
  testConnectionResponses?: Array<{ status: number; body: unknown }>;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock(opts: RouteOverrides) {
  const applyQueue = [...(opts.applyResponses ?? [])];
  const testConnQueue = [
    ...(opts.testConnectionResponses ?? [
      { status: 200, body: { success: true, latencyMs: 7, tipKey: null } },
    ]),
  ];
  fetchMock = vi
    .fn()
    .mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/api/setup/status")) {
        return Promise.resolve(
          jsonResponse({
            setupRequired: false,
            setupCompletedAt: "2026-04-26T12:00:00.000Z",
            adminExists: true,
            hasSessionSecret: true,
            hasEncryptionKey: true,
            publicAppUrl: "https://app.example.com",
            publicAppUrlSource: "env",
            databaseUrlSource: "env",
            sessionSecretSource: "env",
            encryptionKeySource: "env",
            dbHealth: { reachable: true, lastErrorCode: null },
            lastMigrationFailure: null,
          }),
        );
      }
      if (url.includes("/api/setup/migrations-summary")) {
        return Promise.resolve(
          jsonResponse({
            appliedCount: 7,
            latestAppliedAt: "2026-04-26T11:55:00.000Z",
            anyPendingOnDisk: false,
          }),
        );
      }
      if (url.includes("/api/health")) {
        return Promise.resolve(jsonResponse({ ok: true, uptimeSec: 12 }));
      }
      if (url.includes("/api/version")) {
        return Promise.resolve(jsonResponse({ version: "v0.0.0-test" }));
      }
      if (url.includes("/api/auth/user")) {
        return Promise.resolve(jsonResponse({}, 401));
      }
      if (url.includes("/api/admin/runtime-info")) {
        return Promise.resolve(jsonResponse(opts.runtimeInfo));
      }
      if (
        url.includes("/api/admin/runtime-apply-database-url") &&
        method === "POST"
      ) {
        const next =
          applyQueue.shift() ?? {
            status: 200,
            body: { success: true, latencyMs: 42, runtime: "coolify" },
          };
        if (next.networkError) return Promise.reject(new Error("offline"));
        return Promise.resolve(jsonResponse(next.body, next.status));
      }
      if (
        url.includes("/api/setup/test-connection") &&
        method === "POST"
      ) {
        const next =
          testConnQueue.shift() ?? {
            status: 200,
            body: { success: true, latencyMs: 7, tipKey: null },
          };
        return Promise.resolve(jsonResponse(next.body, next.status));
      }
      // Anything else: empty 200. Keeps the wizard's other passive
      // probes (secrets snapshot, etc.) from blowing up.
      return Promise.resolve(jsonResponse({}));
    });
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
}

// Every shipped locale bundle. Wired into `describe.each` below so the
// full helper-flow suite re-runs against each one. Keep this list in
// sync with `client/src/i18n/index.ts`.
const LOCALES = ["en", "de", "es", "fr", "it", "pt"] as const;

beforeEach(() => {
  // The inner `beforeEach` inside `describe.each` calls
  // `i18n.changeLanguage(locale)` AFTER this hook (parent hooks run
  // first in vitest), so the language is correct before any `it`
  // body renders <Setup />. We deliberately don't call
  // `changeLanguage` here — doing so would race with the inner hook
  // and leak the previous iteration's locale into the first test of
  // each describe.each block.
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  // Clean up any Radix portals the AlertDialog left behind so they
  // can't bleed selectors into the next test.
  document
    .querySelectorAll('[data-testid^="dialog-"]')
    .forEach((node) => node.parentElement?.remove());
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  } else {
    delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  }
  window.history.replaceState({}, "", "/setup");
  vi.restoreAllMocks();
});

async function flush(times = 10) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

function render() {
  act(() => {
    root.render(<Setup />);
  });
}

function clickByTestId(testId: string, scope: ParentNode = document) {
  const el = scope.querySelector(
    `[data-testid="${testId}"]`,
  ) as HTMLElement | null;
  if (!el) throw new Error(`element not found: ${testId}`);
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function setUrlInputValue(value: string) {
  const el = container.querySelector<HTMLInputElement>("input#url");
  if (!el) throw new Error("connection URL input not rendered");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function clickTestConnection() {
  const label = i18n.t("setup.connect.testButton");
  const buttons = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const btn = buttons.find((b) => b.textContent?.trim() === label);
  if (!btn) throw new Error("Test Connection button not rendered");
  act(() => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function enterReconfigureMode() {
  render();
  await flush();
  // The health-check landing renders first; click Reconfigure… and
  // confirm in the AlertDialog to flip the wizard into Reconfigure mode.
  clickByTestId("button-reconfigure", container);
  await flush();
  clickByTestId("button-confirm-reconfigure", document);
  await flush();
}

describe.each(LOCALES)(
  "Setup wizard — Reconfigure-mode runtime helper (Task #691) [locale=%s]",
  (locale) => {
  beforeEach(async () => {
    // Switch i18n into the parameterized locale BEFORE the test body
    // renders <Setup />. Parent `beforeEach` hooks run first in
    // vitest, so this hook is the last one to run before the `it`
    // body — guaranteeing every locale iteration mounts the wizard
    // in its own language even on the first test of each block.
    await i18n.changeLanguage(locale);
    // Guard rail: any future change that re-introduces a parent-hook
    // ordering bug would silently leak the previous iteration's
    // locale into the first test of each describe.each block. This
    // assertion makes the regression loud.
    expect(i18n.language).toBe(locale);
  });

  it("renders coolify deep link + Apply button when COOLIFY_API_TOKEN is configured", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken });
    await enterReconfigureMode();

    const helper = container.querySelector(
      '[data-testid="reconfigure-runtime-helper"]',
    );
    expect(helper).not.toBeNull();
    expect(helper!.getAttribute("data-runtime")).toBe("coolify");

    // The "Detected runtime:" prefix is rendered alongside the
    // runtime name; verify the helper row's full text includes the
    // localized prefix copy so we'd notice if the bundle's
    // `detectedLabel` key went missing.
    expect(helper!.textContent).toContain(
      i18n.t("setup.reconfigureMode.runtimeHelper.detectedLabel"),
    );

    // Detected runtime label is the localized human name, not the raw key.
    const runtimeName = container.querySelector(
      '[data-testid="runtime-helper-runtime-name"]',
    );
    expect(runtimeName?.textContent).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.runtime.coolify"),
    );

    // Deep link button points at the Coolify env editor and surfaces
    // the localized button label (the visible operator-facing copy
    // from `runtimeHelper.openEditor`).
    const editorLink = container.querySelector<HTMLAnchorElement>(
      '[data-testid="button-open-env-editor"]',
    );
    expect(editorLink).not.toBeNull();
    expect(editorLink!.href).toBe(
      RUNTIME_FIXTURES.coolifyWithToken.envEditorUrl,
    );
    expect(editorLink!.textContent).toContain(
      i18n.t("setup.reconfigureMode.runtimeHelper.openEditor"),
    );
    // External link safety attributes — operators clicking through must
    // not get an opener handle back into the wizard window.
    expect(editorLink!.target).toBe("_blank");
    expect(editorLink!.rel).toContain("noopener");

    // Apply button renders for available control APIs and is gated on
    // Test Connection passing. Verify both its disabled-state title
    // hint AND its visible label come from the locale bundle.
    const applyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-apply-database-url"]',
    );
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.disabled).toBe(true);
    expect(applyBtn!.title).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.applyDisabledHint"),
    );
    expect(applyBtn!.textContent).toContain(
      i18n.t("setup.reconfigureMode.runtimeHelper.applyButton"),
    );

    // The "missing token" hint must NOT render alongside an available
    // control API.
    expect(
      container.querySelector('[data-testid="apply-button-unavailable"]'),
    ).toBeNull();
  });

  it("renders coolify deep link but missing-token hint instead of Apply when COOLIFY_API_TOKEN is absent", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.coolifyWithoutToken });
    await enterReconfigureMode();

    const helper = container.querySelector(
      '[data-testid="reconfigure-runtime-helper"]',
    );
    expect(helper?.getAttribute("data-runtime")).toBe("coolify");

    // Deep link still renders — manual edit path stays available.
    expect(
      container.querySelector('[data-testid="button-open-env-editor"]'),
    ).not.toBeNull();

    // Apply button is suppressed; the hint tells the operator which env
    // var to set to enable it. The visible string MUST be the
    // localized `applyMissingToken` copy with the env-var name
    // interpolated — not the English fallback or the raw token name.
    expect(
      container.querySelector('[data-testid="button-apply-database-url"]'),
    ).toBeNull();
    const hint = container.querySelector(
      '[data-testid="apply-button-unavailable"]',
    );
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain("COOLIFY_API_TOKEN");
    expect(hint!.textContent).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.applyMissingToken", {
        tokenEnvVar: "COOLIFY_API_TOKEN",
      }),
    );
  });

  it("renders dokploy deep link and no Apply path (control API not yet supported)", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.dokploy });
    await enterReconfigureMode();

    const helper = container.querySelector(
      '[data-testid="reconfigure-runtime-helper"]',
    );
    expect(helper?.getAttribute("data-runtime")).toBe("dokploy");

    const editorLink = container.querySelector<HTMLAnchorElement>(
      '[data-testid="button-open-env-editor"]',
    );
    expect(editorLink).not.toBeNull();
    expect(editorLink!.href).toBe(RUNTIME_FIXTURES.dokploy.envEditorUrl);

    // No Apply button, and no missingToken hint either (unavailableReason
    // is unsupportedRuntime, so the only fallback is the deep link).
    expect(
      container.querySelector('[data-testid="button-apply-database-url"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="apply-button-unavailable"]'),
    ).toBeNull();
  });

  it("renders the 'no deep link available' hint for plain docker runtimes", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.docker });
    await enterReconfigureMode();

    const helper = container.querySelector(
      '[data-testid="reconfigure-runtime-helper"]',
    );
    expect(helper?.getAttribute("data-runtime")).toBe("docker");

    expect(
      container.querySelector('[data-testid="button-open-env-editor"]'),
    ).toBeNull();
    const unavailable = container.querySelector(
      '[data-testid="env-editor-unavailable"]',
    );
    expect(unavailable).not.toBeNull();
    expect(unavailable!.textContent?.trim()).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.openEditorUnavailable"),
    );
    expect(unavailable!.getAttribute("title")).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.openEditorUnavailableHint"),
    );
    expect(
      container.querySelector('[data-testid="button-apply-database-url"]'),
    ).toBeNull();
  });

  it("renders the standalone-runtime fallback (no deep link, no Apply)", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.standalone });
    await enterReconfigureMode();

    const helper = container.querySelector(
      '[data-testid="reconfigure-runtime-helper"]',
    );
    expect(helper?.getAttribute("data-runtime")).toBe("standalone");
    expect(
      container.querySelector('[data-testid="env-editor-unavailable"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="button-apply-database-url"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="apply-button-unavailable"]'),
    ).toBeNull();
  });

  it("apply confirm dialog: button stays disabled until Test Connection passes, then opens the dialog", async () => {
    installFetchMock({ runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken });
    await enterReconfigureMode();

    const applyBtn = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-apply-database-url"]',
    );
    expect(applyBtn).not.toBeNull();
    expect(applyBtn!.disabled).toBe(true);

    // No URL typed yet — even if we tried to click, the click is a no-op
    // because the disabled prop blocks the React onClick handler.
    expect(
      document.querySelector(
        '[data-testid="dialog-confirm-apply-database-url"]',
      ),
    ).toBeNull();

    // Type a candidate URL and run Test Connection. Mock returns success
    // so testResult.success flips true and the Apply gate opens.
    setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
    clickTestConnection();
    await flush();

    expect(applyBtn!.disabled).toBe(false);
    expect(applyBtn!.title).toBe("");

    clickByTestId("button-apply-database-url", container);
    await flush();

    // AlertDialog mounts into a Radix portal at the document root.
    const dialog = document.querySelector(
      '[data-testid="dialog-confirm-apply-database-url"]',
    );
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain(
      i18n.t("setup.reconfigureMode.runtimeHelper.confirmTitle"),
    );
    expect(dialog!.textContent).toContain(
      i18n.t("setup.reconfigureMode.runtimeHelper.confirmBody"),
    );
    expect(
      dialog!.querySelector('[data-testid="button-cancel-apply"]'),
    ).not.toBeNull();
    const confirmBtn = dialog!.querySelector<HTMLButtonElement>(
      '[data-testid="button-confirm-apply"]',
    );
    expect(confirmBtn).not.toBeNull();
    // The confirm button label is the localized
    // `runtimeHelper.confirmAction` copy, not the spinner ("applying")
    // text or the rate-limit countdown text — at this point we're
    // pre-submit, no in-flight POST, no Retry-After window.
    expect(confirmBtn!.textContent?.trim()).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.confirmAction"),
    );
  });

  it("apply success path: confirms the dialog, POSTs the swap, renders the green inline result, and closes the dialog", async () => {
    installFetchMock({
      runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
      applyResponses: [
        {
          status: 200,
          body: { success: true, latencyMs: 1234, runtime: "coolify" },
        },
      ],
    });
    await enterReconfigureMode();

    setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
    clickTestConnection();
    await flush();
    clickByTestId("button-apply-database-url", container);
    await flush();
    clickByTestId("button-confirm-apply", document);
    await flush();

    // POST hit /api/admin/runtime-apply-database-url with confirm:true.
    const applyCalls = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === "string" &&
        url.includes("/api/admin/runtime-apply-database-url"),
    );
    expect(applyCalls).toHaveLength(1);
    const body = JSON.parse(String((applyCalls[0][1] as RequestInit).body));
    expect(body.confirm).toBe(true);
    expect(body.connectionUrl).toBe(
      "postgres://app:hunter2@db.example.com:5432/prod",
    );

    // Green inline result with the latency interpolated; dialog
    // closed. The visible string MUST be the localized
    // `runtimeHelper.applied` copy with the ms value interpolated —
    // not the English fallback.
    const success = container.querySelector(
      '[data-testid="apply-result-success"]',
    );
    expect(success).not.toBeNull();
    expect(success!.textContent).toContain("1234");
    expect(success!.textContent).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.applied", { ms: 1234 }),
    );
    expect(
      document.querySelector(
        '[data-testid="dialog-confirm-apply-database-url"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="apply-result-error"]'),
    ).toBeNull();
  });

  it("apply error path: server returns controlApiUnavailable → red banner with localized message, dialog stays open", async () => {
    installFetchMock({
      runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
      applyResponses: [
        {
          status: 409,
          body: {
            success: false,
            errorCode: "controlApiUnavailable",
            error: "Your host doesn't expose a known control API.",
            runtime: "coolify",
            unavailableReason: "missingToken",
            tokenEnvVar: "COOLIFY_API_TOKEN",
          },
        },
      ],
    });
    await enterReconfigureMode();

    setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
    clickTestConnection();
    await flush();
    clickByTestId("button-apply-database-url", container);
    await flush();
    clickByTestId("button-confirm-apply", document);
    await flush();

    const error = container.querySelector(
      '[data-testid="apply-result-error"]',
    );
    expect(error).not.toBeNull();
    // Renders the localized errorCode text from setup.errors.* — operators
    // get the host-doesn't-support-this explainer, not the raw English
    // server text or the network-fallback string.
    expect(error!.textContent).toBe(
      i18n.t("setup.errors.controlApiUnavailable"),
    );

    // The dialog stays mounted so the operator can cancel or retry — the
    // success branch is the only one that auto-closes.
    expect(
      document.querySelector(
        '[data-testid="dialog-confirm-apply-database-url"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="apply-result-success"]'),
    ).toBeNull();
  });

  it("apply rate-limit path (Task #700): server returns 429 + controlApiRateLimited with retryAfterSeconds → countdown banner + disabled confirm", async () => {
    // Server forwards the host's Retry-After window as
    // `retryAfterSeconds` in the JSON body. We assert the wizard:
    //   1. Renders the *countdown* error banner copy
    //      (`controlApiRateLimitedCountdown`) with the seconds
    //      interpolated — not the generic `controlApiRateLimited`
    //      "wait a moment" copy and not the network-fallback copy.
    //   2. Disables the AlertDialog confirm action and swaps its
    //      label to "Retry in Ns" (the same source the banner ticks
    //      against).
    //   3. Keeps the dialog open so the operator can cancel or wait.
    //   4. Defense-in-depth: clicking confirm again while the
    //      countdown is active does NOT fire a second POST.
    installFetchMock({
      runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
      applyResponses: [
        {
          status: 429,
          body: {
            success: false,
            errorCode: "controlApiRateLimited",
            error: "Host rate-limited the env-var swap.",
            runtime: "coolify",
            step: "envs",
            retryAfterSeconds: 5,
            errorParams: { seconds: 5 },
          },
        },
      ],
    });
    await enterReconfigureMode();

    setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
    clickTestConnection();
    await flush();
    clickByTestId("button-apply-database-url", container);
    await flush();
    clickByTestId("button-confirm-apply", document);
    await flush();

    // Banner renders the countdown copy with the interpolated seconds.
    const error = container.querySelector(
      '[data-testid="apply-result-error"]',
    );
    expect(error).not.toBeNull();
    expect(error!.textContent).toBe(
      i18n.t("setup.errors.controlApiRateLimitedCountdown", { seconds: 5 }),
    );
    // Sanity: this MUST be different from the generic key, otherwise
    // the variant swap in setup.tsx is silently broken.
    expect(error!.textContent).not.toBe(
      i18n.t("setup.errors.controlApiRateLimited"),
    );

    // Confirm action is disabled. Task #707: with the auto-resume
    // budget intact (this is the 1st 429 of the chain, cap=3), the
    // label is the "Retrying automatically…" hint instead of the
    // manual countdown copy — the wizard will re-fire the apply on
    // its own once the host's window elapses, so the operator
    // doesn't need a "Retry in Ns" prompt to time their click.
    const confirmBtn = document.querySelector<HTMLButtonElement>(
      '[data-testid="button-confirm-apply"]',
    );
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.disabled).toBe(true);
    expect(confirmBtn!.textContent?.trim()).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.retryingAutomatically"),
    );
    // The DOM marker mirrors the auto-retry state for end-to-end
    // tests / live inspection.
    expect(confirmBtn!.getAttribute("data-auto-retrying")).toBe("true");
    // The Retry-After deadline is still tracked for the manual-fallback
    // path, even though the visible label is the auto-retry hint.
    expect(confirmBtn!.getAttribute("data-retry-after-seconds")).toBe("5");

    // Dialog stays open during the cooldown.
    expect(
      document.querySelector(
        '[data-testid="dialog-confirm-apply-database-url"]',
      ),
    ).not.toBeNull();

    // Defense-in-depth: a forced click on the disabled button (e.g.
    // a stray Enter keypress before React picks up the disabled
    // prop on the next paint) must not result in a second POST.
    const applyCallsBefore = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === "string" &&
        url.includes("/api/admin/runtime-apply-database-url"),
    ).length;
    act(() => {
      confirmBtn!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flush();
    const applyCallsAfter = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === "string" &&
        url.includes("/api/admin/runtime-apply-database-url"),
    ).length;
    expect(applyCallsAfter).toBe(applyCallsBefore);
  });

  it("apply auto-resume (Task #707): wizard re-fires the apply automatically once the host's Retry-After window elapses, then settles on success without an extra operator click", async () => {
    // Operator-facing promise of Task #707: when the host returns a
    // 429 with a Retry-After window, the wizard schedules a single
    // auto-resume that re-fires the POST as soon as the window
    // elapses (+ a small grace) — no manual click required. The
    // auto-resume here flips to a green success banner and closes
    // the dialog. We use vi.useFakeTimers so the test can advance
    // wall-clock time deterministically through the (small but
    // nonzero) Retry-After + grace window.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installFetchMock({
        runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
        applyResponses: [
          {
            status: 429,
            body: {
              success: false,
              errorCode: "controlApiRateLimited",
              error: "Host rate-limited the env-var swap.",
              runtime: "coolify",
              step: "envs",
              retryAfterSeconds: 1,
              errorParams: { seconds: 1 },
            },
          },
          {
            status: 200,
            body: { success: true, latencyMs: 42, runtime: "coolify" },
          },
        ],
      });
      await enterReconfigureMode();

      setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
      clickTestConnection();
      await flush();
      clickByTestId("button-apply-database-url", container);
      await flush();
      clickByTestId("button-confirm-apply", document);
      await flush();

      // First POST has fired and we got the 429 — the dialog is
      // still mounted with the auto-retry hint.
      const applyCallsAfterFirst = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCallsAfterFirst).toBe(1);
      expect(
        document.querySelector('[data-testid="dialog-confirm-apply-database-url"]'),
      ).not.toBeNull();
      expect(
        document
          .querySelector('[data-testid="button-confirm-apply"]')
          ?.getAttribute("data-auto-retrying"),
      ).toBe("true");

      // Advance past the host's 1s window + the 500ms grace + a bit
      // of slack so the scheduled timer's task is queued and React
      // can drain its work. Then drain microtasks/effects.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await flush();

      // Auto-resume fired the second POST without any operator click.
      const applyCallsAfterAuto = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCallsAfterAuto).toBe(2);

      // Success closed the dialog and rendered the green banner.
      expect(
        document.querySelector('[data-testid="dialog-confirm-apply-database-url"]'),
      ).toBeNull();
      const success = container.querySelector(
        '[data-testid="apply-result-success"]',
      );
      expect(success).not.toBeNull();
      expect(success!.textContent).toBe(
        i18n.t("setup.reconfigureMode.runtimeHelper.applied", { ms: 42 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("apply auto-resume cap (Task #707): after MAX consecutive 429s the wizard stops auto-firing and falls back to the manual 'Retry in Ns' UI", async () => {
    // Defensive cap on the auto-resume chain. After the configured
    // number of consecutive 429s the wizard must stop scheduling
    // auto-resumes so a perpetually-throttled host doesn't loop the
    // wizard against itself forever. The button label flips back to
    // the manual countdown copy and the data-auto-retrying marker is
    // dropped, signalling "operator must click after this".
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installFetchMock({
        runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
        // Three consecutive 429s — the manual click + two auto-resumes
        // exhaust the budget (cap = 3). The third 429 should NOT
        // schedule a fourth auto-resume.
        applyResponses: [
          {
            status: 429,
            body: {
              success: false,
              errorCode: "controlApiRateLimited",
              retryAfterSeconds: 1,
            },
          },
          {
            status: 429,
            body: {
              success: false,
              errorCode: "controlApiRateLimited",
              retryAfterSeconds: 1,
            },
          },
          {
            status: 429,
            body: {
              success: false,
              errorCode: "controlApiRateLimited",
              retryAfterSeconds: 5,
            },
          },
        ],
      });
      await enterReconfigureMode();

      setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
      clickTestConnection();
      await flush();
      clickByTestId("button-apply-database-url", container);
      await flush();
      clickByTestId("button-confirm-apply", document);
      await flush();

      // Drain enough wall-clock to fire two auto-resumes after the
      // initial manual click — that's the full budget at cap=3.
      // 1s window + 500ms grace each, plus slack for React to commit
      // the in-between renders. We chunk the advance so the
      // intermediate state (the 2nd 429 → 2nd auto-resume scheduled →
      // 3rd 429) has a chance to settle between fires instead of
      // racing with the next macrotask in the same tick.
      for (let i = 0; i < 6; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(750);
        });
        await flush();
      }

      // Three POSTs total (manual click + two auto-resumes). After
      // the third 429 the cap is reached and no further auto-resume
      // is scheduled even though the host still asked us to wait.
      const applyCalls = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCalls).toBe(3);

      const confirmBtn = document.querySelector<HTMLButtonElement>(
        '[data-testid="button-confirm-apply"]',
      );
      expect(confirmBtn).not.toBeNull();
      // Button is still disabled while the latest Retry-After window
      // is open, but the auto-retry marker is gone — the operator is
      // now in the manual-retry fallback path.
      expect(confirmBtn!.disabled).toBe(true);
      expect(confirmBtn!.getAttribute("data-auto-retrying")).toBeNull();
      // Label is the Task #700 manual countdown copy, NOT the
      // auto-retry hint — the wizard is no longer self-healing this
      // chain and the operator needs to click once the window ends.
      // The countdown ticks toward zero in real time so we don't
      // pin to a specific seconds value (the chunked time-advance
      // above means a few seconds have already elapsed against the
      // 5s window) — what matters is that the label is the manual
      // `runtimeHelper.retryIn` template (with whatever {{seconds}}
      // value the timer landed on), not the auto-retry hint. The
      // expected template is pulled from `i18n.t(...)` so the per-
      // locale describe.each iterations match against the locale's
      // own `retryIn` copy instead of the hardcoded English string —
      // task #765 fixed this regex which previously hardcoded the
      // English "Retry in Ns" template and broke for de/es/fr/it/pt.
      const manualCountdownLabel = confirmBtn!.textContent?.trim() ?? "";
      const retryTemplate = i18n.t(
        "setup.reconfigureMode.runtimeHelper.retryIn",
        { seconds: "__N__" },
      );
      // Build a regex from the localized template by escaping regex
      // metacharacters and substituting __N__ with the digit pattern.
      const escaped = retryTemplate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const retryRegex = new RegExp(
        `^${escaped.replace("__N__", "\\d+")}$`,
      );
      expect(manualCountdownLabel).toMatch(retryRegex);
      expect(manualCountdownLabel).not.toBe(
        i18n.t("setup.reconfigureMode.runtimeHelper.retryingAutomatically"),
      );

      // Sanity: advancing more wall-clock time MUST NOT trigger a
      // fourth POST — the cap is the whole point.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      await flush();
      const applyCallsLater = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCallsLater).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("apply auto-resume cancel (Task #707): closing the dialog mid-countdown drops the pending auto-resume", async () => {
    // If the operator cancels (or hits Escape / clicks outside) while
    // a Retry-After countdown is active, the pending auto-resume
    // timer must be dropped — otherwise the wizard would re-fire the
    // POST after the operator has already navigated away from the
    // confirm step.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      installFetchMock({
        runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
        applyResponses: [
          {
            status: 429,
            body: {
              success: false,
              errorCode: "controlApiRateLimited",
              retryAfterSeconds: 1,
            },
          },
          // Second slot would only be hit if the auto-resume DID fire —
          // the test asserts it must not, so this entry is here purely
          // as a tripwire.
          {
            status: 200,
            body: { success: true, latencyMs: 99, runtime: "coolify" },
          },
        ],
      });
      await enterReconfigureMode();

      setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
      clickTestConnection();
      await flush();
      clickByTestId("button-apply-database-url", container);
      await flush();
      clickByTestId("button-confirm-apply", document);
      await flush();

      // 1st POST has fired and we got the 429.
      const applyCallsAfterFirst = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCallsAfterFirst).toBe(1);

      // Operator clicks Cancel before the auto-resume window elapses.
      clickByTestId("button-cancel-apply", document);
      await flush();
      // Dialog is dismissed.
      expect(
        document.querySelector('[data-testid="dialog-confirm-apply-database-url"]'),
      ).toBeNull();

      // Advance past the auto-resume window. The pending timer was
      // cleared by the close path, so no second POST should fire.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      await flush();
      const applyCallsLater = fetchMock.mock.calls.filter(
        ([url]) =>
          typeof url === "string" &&
          url.includes("/api/admin/runtime-apply-database-url"),
      ).length;
      expect(applyCallsLater).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("apply error path: network failure renders the localized 'couldn't reach apply endpoint' fallback", async () => {
    installFetchMock({
      runtimeInfo: RUNTIME_FIXTURES.coolifyWithToken,
      applyResponses: [{ status: 0, body: null, networkError: true }],
    });
    await enterReconfigureMode();

    setUrlInputValue("postgres://app:hunter2@db.example.com:5432/prod");
    clickTestConnection();
    await flush();
    clickByTestId("button-apply-database-url", container);
    await flush();
    clickByTestId("button-confirm-apply", document);
    await flush();

    const error = container.querySelector(
      '[data-testid="apply-result-error"]',
    );
    expect(error).not.toBeNull();
    expect(error!.textContent).toBe(
      i18n.t("setup.reconfigureMode.runtimeHelper.applyFailedNetwork"),
    );
  });
  },
);

// Bundle parity (Task #699): assert every key the helper row surfaces
// is defined directly on each shipped locale's resource bundle (no
// fallbackLng resolution). Without this the per-locale `i18n.t(...)`
// assertions above could pass for a translated locale even when the
// key is missing — both the rendered text AND the expected text would
// silently fall through to en.
//
// The required key list is derived from the EN bundle's
// `setup.reconfigureMode.runtimeHelper` subtree at runtime (plus the
// few sibling keys the helper row references explicitly), so adding a
// new operator-facing string under runtimeHelper automatically rolls
// into the parity check without anyone having to remember to update
// this list. That avoids the "we added an English string but forgot
// to assert it" failure mode.
describe("Setup wizard runtime-helper bundle parity (Task #699)", () => {
  function getNested(
    bundle: Record<string, unknown> | undefined,
    dotted: string,
  ): unknown {
    if (!bundle) return undefined;
    return dotted
      .split(".")
      .reduce<unknown>(
        (acc, key) =>
          acc && typeof acc === "object"
            ? (acc as Record<string, unknown>)[key]
            : undefined,
        bundle,
      );
  }

  // Walk the en bundle's runtimeHelper subtree and return every leaf
  // key path (e.g. `runtime.coolify`, `applyButton`, etc). Driving the
  // required list off the source bundle means new strings get covered
  // automatically.
  function flattenLeaves(
    obj: Record<string, unknown>,
    prefix = "",
  ): string[] {
    const out: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        out.push(...flattenLeaves(v as Record<string, unknown>, path));
      } else if (typeof v === "string") {
        out.push(path);
      }
    }
    return out;
  }

  const enBundle = i18n.getResourceBundle("en", "translation") as
    | Record<string, unknown>
    | undefined;
  const helperSubtree = getNested(
    enBundle,
    "setup.reconfigureMode.runtimeHelper",
  ) as Record<string, unknown> | undefined;
  // Sanity: if this fails the en bundle structure changed and the
  // parity check below would be a no-op.
  expect(helperSubtree, "en bundle missing setup.reconfigureMode.runtimeHelper")
    .toBeDefined();

  const HELPER_KEYS = flattenLeaves(helperSubtree!).map(
    (leaf) => `setup.reconfigureMode.runtimeHelper.${leaf}`,
  );
  // Sibling keys the helper row references but which live outside the
  // runtimeHelper subtree.
  const SIBLING_KEYS = [
    "setup.connect.testButton",
    "setup.errors.controlApiUnavailable",
    "setup.errors.controlApiRateLimited",
    "setup.errors.controlApiRateLimitedCountdown",
  ];
  const REQUIRED_KEYS = [...HELPER_KEYS, ...SIBLING_KEYS];

  for (const locale of LOCALES) {
    it(`defines every helper-flow key directly in the ${locale} bundle`, () => {
      const bundle = i18n.getResourceBundle(locale, "translation") as
        | Record<string, unknown>
        | undefined;
      expect(bundle, `missing translation bundle for ${locale}`).toBeDefined();

      for (const key of REQUIRED_KEYS) {
        const value = getNested(bundle, key);
        // The key MUST exist directly in the locale's bundle. We
        // intentionally don't assert "value !== en" here: short
        // labels, brand names, and borrowed terms (e.g. "Coolify",
        // "Apply") may legitimately be identical across locales, and
        // i18next's fallback to en already handles missing keys, so
        // the only thing that matters for catching silent-English
        // regressions is whether the key is defined at all.
        expect(
          value,
          `missing ${key} in ${locale} bundle (would silently fall back to en)`,
        ).toBeTruthy();
        expect(typeof value).toBe("string");
      }
    });
  }
});
