// @vitest-environment happy-dom
//
// Coverage for task #366: the Done-step "What the running server sees"
// panel's one-click "Copy missing env vars" button.
//
// Operators on Dokploy / Coolify land on the Done step with one or more
// rows marked "Not visible to the running process" — but until task #366
// they had to scroll back up to the EnvHelperPanel and copy each missing
// variable individually before pasting into the host's Environment tab.
// The new button assembles a multi-line `KEY=value` block scoped to ONLY
// the rows currently marked missing (so the operator's already-deployed
// values aren't overwritten with stale strings) and ships it to the
// clipboard via safeCopyToClipboard, which falls back to an off-screen
// textarea + execCommand on plain-HTTP self-hosted deployments where
// navigator.clipboard is unavailable.
//
// What this file locks down:
//   1. The button renders alongside the Dokploy tip whenever the panel
//      shows "anyMissing" — same visibility contract as the tip block.
//   2. The button does NOT render when every row is satisfied.
//   3. Clicking copies a `KEY=value\nKEY=value` block built from the
//      wizard-known values for ONLY the missing rows (DATABASE_URL +
//      PUBLIC_APP_URL in the canonical "operator typed values in wizard
//      but never promoted them to the host's Environment tab" case).
//   4. The success path surfaces a localized toast confirming what was
//      copied so the operator gets immediate feedback.
//   5. The plain-HTTP fallback path: when navigator.clipboard is missing
//      AND document.execCommand returns false, the helper rejects and a
//      destructive toast is surfaced instead of misleading the operator
//      into believing a copy succeeded.
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
let writeTextMock: ReturnType<typeof vi.fn>;
let toastSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  fetchMock = vi.fn();
  originalFetch = globalThis.fetch;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

  writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: writeTextMock },
  });

  // Spy on every toast() call so we can assert both the success message
  // and the destructive fallback message without rendering Sonner. The
  // hook reads from a module-level state machine, so we monkey-patch the
  // module rather than React-context-mocking around it. Setup.tsx now
  // routes most toasts through the shared helpers in toast-helper.ts,
  // which call the module's exported `toast` function directly — so we
  // patch BOTH `useToast().toast` (for any direct hook callers) and the
  // module-level `toast` export (which the helpers consume).
  toastSpy = vi.fn();
  const useToastModule = await import("@/hooks/use-toast");
  vi.spyOn(useToastModule, "useToast").mockReturnValue({
    toast: toastSpy,
    dismiss: vi.fn(),
    toasts: [],
  } as unknown as ReturnType<typeof useToastModule.useToast>);
  vi.spyOn(useToastModule, "toast").mockImplementation(
    toastSpy as unknown as typeof useToastModule.toast,
  );
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

type SourceMix = {
  databaseUrlSource?: "env" | "wizard" | "none";
  sessionSecretSource?: "env" | "file" | "none";
  encryptionKeySource?: "env" | "file" | "none";
  publicAppUrlSource?: "env" | "file" | "default";
};

// Walks the wizard from connect → … → smtp and returns the value the
// operator typed for DATABASE_URL / PUBLIC_APP_URL so the test can
// assert the literal block produced by "Copy missing env vars". The
// `sources` arg controls every running-source bucket so each test can
// lock down a different missing/satisfied permutation.
const TYPED_DB_URL = "postgres://u:p@h:5432/db";
const TYPED_PUBLIC_URL = "https://app.example.com";

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
      // The Done-step copy block doesn't need session/encryption values
      // (they're "file" in our scenarios, so they're not missing and
      // don't need to be re-pasted) — but we still return a shape the
      // SecretsSnapshot accepts so EnvHelperPanel renders without
      // throwing during navigation.
      return Promise.resolve(
        jsonResponse(200, {
          hasConnectionUrl: true,
          databaseUrlSource: sources.databaseUrlSource ?? "none",
          hasSessionSecret: true,
          sessionSecretSource: sources.sessionSecretSource ?? "file",
          sessionSecretValue: "ss",
          hasEncryptionKey: true,
          encryptionKeySource: sources.encryptionKeySource ?? "file",
          encryptionKeyValue: "ek",
          publicAppUrl: TYPED_PUBLIC_URL,
          publicAppUrlSource: sources.publicAppUrlSource ?? "default",
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
      return Promise.resolve(
        jsonResponse(200, {
          setupRequired: false,
          adminExists: false,
          publicAppUrl: TYPED_PUBLIC_URL,
          hasSessionSecret: true,
          hasEncryptionKey: true,
          dbHealth: { reachable: true, lastErrorCode: null },
          databaseUrlSource: sources.databaseUrlSource,
          sessionSecretSource: sources.sessionSecretSource,
          encryptionKeySource: sources.encryptionKeySource,
          publicAppUrlSource: sources.publicAppUrlSource,
        }),
      );
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

  setInputValue("input#url", TYPED_DB_URL);
  clickByLabel(i18n.t("setup.connect.testButton"));
  await flush();
  await flush();
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  clickByLabel(i18n.t("setup.initialize.initialize"));
  await flush();
  await flush();
  await flush();

  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();

  setInputValue("input#purl", TYPED_PUBLIC_URL);
  clickByLabel(i18n.t("setup.actions.continue"));
  await flush();
  await flush();

  setInputValue("input#afn", "Ada");
  setInputValue("input#ae", "ada@example.com");
  setInputValue("input#ap", "Correct-Horse-Battery-Staple-9");
  clickByTestId("button-create-admin");
  await flush();
  await flush();
}

async function reachDoneStep(sources: SourceMix) {
  await navigateToSmtpStep(sources);
  // SMTP-skip moves directly to Done and triggers runHealthChecks,
  // which is what populates `runningSources` and unlocks the panel.
  clickByTestId("button-skip-smtp");
  await flush();
  await flush();
  await flush();
  // CRM step → Done (Salesforce preselected).
  clickByTestId("button-save-crm");
  await flush();
  await flush();
  await flush();
}

describe("Setup Done step — Copy missing env vars button", () => {
  it("renders the button alongside the Dokploy tip when at least one row is missing", async () => {
    await reachDoneStep({
      databaseUrlSource: "none", // missing — wizard knows the value
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "default", // missing — wizard knows the value
    });

    const tip = container.querySelector(
      '[data-testid="callout-dokploy-tip"]',
    );
    expect(
      tip,
      "Dokploy tip block must render when any var is missing",
    ).not.toBeNull();

    const button = container.querySelector(
      '[data-testid="button-copy-missing-env-vars"]',
    );
    expect(
      button,
      "Copy-missing button must render inside the Dokploy tip block",
    ).not.toBeNull();
    expect(tip!.contains(button!)).toBe(true);
    expect(button!.textContent).toContain(
      i18n.t("setup.done.runningServerSees.copyMissingEnvVars"),
    );
  });

  it("does NOT render the button when every row is satisfied", async () => {
    await reachDoneStep({
      databaseUrlSource: "env",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "env",
    });

    expect(
      container.querySelector(
        '[data-testid="button-copy-missing-env-vars"]',
      ),
      "Copy-missing button must stay hidden when nothing is missing",
    ).toBeNull();
  });

  it("copies a multi-line KEY=value block scoped to ONLY the missing rows", async () => {
    await reachDoneStep({
      // DATABASE_URL + PUBLIC_APP_URL are missing from the running
      // process; SESSION_SECRET + ENCRYPTION_KEY are in db-config.json
      // and therefore satisfied. The block must contain only the two
      // missing keys with the values the operator typed in the wizard.
      databaseUrlSource: "none",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "default",
    });

    clickByTestId("button-copy-missing-env-vars");
    await flush();

    expect(
      writeTextMock,
      "navigator.clipboard.writeText must be called exactly once",
    ).toHaveBeenCalledTimes(1);
    const written = writeTextMock.mock.calls[0][0] as string;

    // Each missing var on its own line, joined by literal `\n`. We
    // assert the exact string so a future refactor can't reorder the
    // rows or add stray empty `KEY=` assignments that would clobber
    // existing values in the host's Environment tab.
    expect(written).toBe(
      `DATABASE_URL=${TYPED_DB_URL}\nPUBLIC_APP_URL=${TYPED_PUBLIC_URL}`,
    );
    // Satisfied rows (file-sourced) must NOT appear in the block — the
    // operator already has working values for them and re-pasting could
    // introduce drift if the wizard's local copy is stale.
    expect(written).not.toContain("SESSION_SECRET=");
    expect(written).not.toContain("ENCRYPTION_KEY=");
  });

  it("surfaces a confirmation toast on a successful copy", async () => {
    await reachDoneStep({
      databaseUrlSource: "none",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "default",
    });

    clickByTestId("button-copy-missing-env-vars");
    await flush();

    const successCall = toastSpy.mock.calls.find(
      ([arg]) =>
        arg?.title ===
        i18n.t("setup.done.runningServerSees.copyMissingToastTitle"),
    );
    expect(
      successCall,
      "success toast with copyMissingToastTitle must fire",
    ).toBeDefined();
    expect(successCall![0]).not.toHaveProperty("variant", "destructive");
  });

  it("falls back to a destructive toast when the clipboard is unavailable on plain HTTP", async () => {
    // Mirror the safeCopyToClipboard plain-HTTP path: navigator.clipboard
    // is undefined AND the execCommand fallback returns false. Both
    // conditions are the same shape an operator hits on a Dokploy
    // `*.traefik.me` deployment where the wizard is served over plain
    // HTTP and the browser refuses to expose `navigator.clipboard`.
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    // happy-dom does not implement execCommand (the spec is deprecated),
    // so we attach a stub directly via Object.defineProperty rather than
    // spyOn, which fails on a missing own property. Returning false is
    // exactly what older browsers do when the document has no selection
    // — it's the same path the helper falls into on locked-down hosts.
    const originalExec = (document as { execCommand?: unknown }).execCommand;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      writable: true,
      value: () => false,
    });

    await reachDoneStep({
      databaseUrlSource: "none",
      sessionSecretSource: "file",
      encryptionKeySource: "file",
      publicAppUrlSource: "default",
    });

    clickByTestId("button-copy-missing-env-vars");
    await flush();

    const failureCall = toastSpy.mock.calls.find(
      ([arg]) =>
        arg?.title ===
        i18n.t("setup.done.runningServerSees.copyMissingFailed"),
    );
    expect(
      failureCall,
      "error toast with copyMissingFailed must fire when both " +
        "clipboard pathways fail",
    ).toBeDefined();
    expect(failureCall![0].variant).toBe("error");
    // The success toast must NOT also fire.
    const successCall = toastSpy.mock.calls.find(
      ([arg]) =>
        arg?.title ===
        i18n.t("setup.done.runningServerSees.copyMissingToastTitle"),
    );
    expect(successCall).toBeUndefined();

    if (originalExec === undefined) {
      delete (document as { execCommand?: unknown }).execCommand;
    } else {
      Object.defineProperty(document, "execCommand", {
        configurable: true,
        writable: true,
        value: originalExec,
      });
    }
  });
});
